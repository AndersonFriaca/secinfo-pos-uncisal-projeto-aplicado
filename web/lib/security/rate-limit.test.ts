import { beforeEach, describe, expect, it } from "vitest";
import { emptyState, type RateLimitState } from "./rate-limit-core";
import {
  __clearRateLimitCache,
  __resetRateLimitStore,
  checkLoginBlock,
  checkRateLimit,
  createInMemoryStore,
  recordLoginFailure,
  resetLoginFailures,
  resolveClientIp,
  type RateLimitStore,
} from "./rate-limit";

const T0 = 1_700_000_000_000;

/** In-memory store that counts every read and every write. */
class FakeStore implements RateLimitStore {
  reads = 0;
  writes = 0;
  failNext = false;
  private states = new Map<string, RateLimitState>();

  seed(ip: string, state: RateLimitState) {
    this.states.set(ip, state);
  }

  async transact<T>(
    ip: string,
    mutator: (current: RateLimitState) => { next: RateLimitState; output: T },
  ): Promise<T> {
    if (this.failNext) {
      throw new Error("store unavailable");
    }
    this.reads++;
    const current = this.states.get(ip) ?? emptyState();
    const { next, output } = mutator(current);
    this.states.set(ip, next);
    this.writes++;
    return output;
  }
}

beforeEach(() => {
  __clearRateLimitCache();
  __resetRateLimitStore();
});

describe("default store — process-local memory, no configuration needed", () => {
  it("persists failures across calls without an explicit store and blocks on the 5th", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await recordLoginFailure("9.9.9.9", { now: T0 }));
    }
    expect(results.slice(0, 4).every((r) => !r.blocked)).toBe(true);
    expect(results[4].blocked).toBe(true);
    expect(results[4].retryAfterSeconds).toBe(60);
  });

  it("createInMemoryStore keeps counters isolated per instance", async () => {
    const a = createInMemoryStore();
    const b = createInMemoryStore();
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure("1.2.3.4", { store: a, now: T0 });
    }
    __clearRateLimitCache();
    const onB = await checkLoginBlock("1.2.3.4", { store: b, now: T0 + 1000 });
    expect(onB.blocked).toBe(false);
  });
});

describe("resolveClientIp (SEC-06)", () => {
  it("takes the left-most X-Forwarded-For entry", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });
    expect(resolveClientIp(headers, "10.0.0.1")).toBe("203.0.113.7");
  });

  it("falls back to the socket address when the header is absent", () => {
    expect(resolveClientIp(new Headers(), "198.51.100.23")).toBe(
      "198.51.100.23",
    );
  });
});

describe("L1 short-circuit for a blocked IP (SEC-07)", () => {
  it("checkLoginBlock rejects a cached block with zero store calls", async () => {
    const store = new FakeStore();
    // Reach the block through the store (5 failures), then a fresh store.
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure("1.1.1.1", { store, now: T0 });
    }
    const cold = new FakeStore();
    const result = await checkLoginBlock("1.1.1.1", {
      store: cold,
      now: T0 + 30_000,
    });
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
    expect(cold.reads).toBe(0);
    expect(cold.writes).toBe(0);
  });

  it("checkRateLimit rejects a cached block with zero store calls", async () => {
    const store = new FakeStore();
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure("2.2.2.2", { store, now: T0 });
    }
    const cold = new FakeStore();
    const result = await checkRateLimit("2.2.2.2", "auth", {
      store: cold,
      now: T0 + 10_000,
    });
    expect(result.allowed).toBe(false);
    expect(cold.reads).toBe(0);
    expect(cold.writes).toBe(0);
  });

  it("lets the request through once the cached block has expired", async () => {
    const store = new FakeStore();
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure("3.3.3.3", { store, now: T0 });
    }
    const result = await checkLoginBlock("3.3.3.3", {
      store,
      now: T0 + 60_000,
    });
    expect(result.blocked).toBe(false);
    expect(store.reads).toBeGreaterThan(0);
  });
});

describe("transaction path — threshold cannot be skipped (SEC-03)", () => {
  it("persists the failure count across calls and blocks on the 5th", async () => {
    const store = new FakeStore();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await recordLoginFailure("4.4.4.4", { store, now: T0 }));
    }
    expect(results.slice(0, 4).every((r) => !r.blocked)).toBe(true);
    expect(results[4].blocked).toBe(true);
    expect(results[4].retryAfterSeconds).toBe(60);
    // one read + one write per call, all inside transact
    expect(store.reads).toBe(5);
    expect(store.writes).toBe(5);
  });

  it("resetLoginFailures clears the counter and the L1 cache", async () => {
    const store = new FakeStore();
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure("5.5.5.5", { store, now: T0 });
    }
    await resetLoginFailures("5.5.5.5", { store, now: T0 + 1000 });
    // block gone from L1: a cold store is consulted (reads > 0) and allows
    const cold = new FakeStore();
    const after = await checkLoginBlock("5.5.5.5", {
      store: cold,
      now: T0 + 2000,
    });
    expect(after.blocked).toBe(false);
    expect(cold.reads).toBe(1);
  });
});

describe("store-failure fail modes (SEC-06 edge case)", () => {
  it("fails closed on the auth bucket — the error propagates", async () => {
    const store = new FakeStore();
    store.failNext = true;
    await expect(
      checkRateLimit("6.6.6.6", "auth", { store, now: T0 }),
    ).rejects.toThrow(/store unavailable/);
  });

  it("fails closed when recording a login failure — the error propagates", async () => {
    const store = new FakeStore();
    store.failNext = true;
    await expect(
      recordLoginFailure("6.6.6.6", { store, now: T0 }),
    ).rejects.toThrow(/store unavailable/);
  });

  it("fails open on the general bucket — resolves to allowed", async () => {
    const store = new FakeStore();
    store.failNext = true;
    const result = await checkRateLimit("7.7.7.7", "general", {
      store,
      now: T0,
    });
    expect(result).toEqual({ allowed: true });
  });
});

describe("createInMemoryStore — read-modify-write against rate_limits/{ip}", () => {
  it("persists state per IP across transact calls", async () => {
    const store = createInMemoryStore();
    await recordLoginFailure("8.8.8.8", { store, now: T0 });
    const second = await recordLoginFailure("8.8.8.8", { store, now: T0 });
    expect(second.blocked).toBe(false);

    // a third transact sees loginFailures === 2 from the prior writes
    const seen: RateLimitState[] = [];
    await store.transact("8.8.8.8", (current) => {
      seen.push(current);
      return { next: current, output: undefined };
    });
    expect(seen[0].loginFailures).toBe(2);
  });

  it("starts an unknown IP from emptyState()", async () => {
    const store = createInMemoryStore();
    let observed: RateLimitState | null = null;
    await store.transact("9.9.9.9", (current) => {
      observed = current;
      return { next: current, output: undefined };
    });
    expect(observed).toEqual(emptyState());
  });
});
