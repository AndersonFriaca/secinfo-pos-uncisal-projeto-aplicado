import { describe, expect, it } from "vitest";
import {
  BRUTE_FORCE_CONFIG,
  BUCKET_CONFIG,
  emptyState,
  evaluateBlock,
  evaluateBucket,
  isBlocked,
  recordLoginFailure,
  resetLoginFailures,
  type RateLimitState,
} from "./rate-limit-core";

const T0 = 1_700_000_000_000;

/** Apply N consecutive login failures starting from a fresh state at `now`. */
function failNtimes(n: number, now: number): RateLimitState {
  let state = emptyState();
  for (let i = 0; i < n; i++) {
    state = recordLoginFailure(state, now).state;
  }
  return state;
}

describe("recordLoginFailure — brute-force threshold (SEC-01, SEC-02)", () => {
  it("does not block on the 4th consecutive failure", () => {
    let state = emptyState();
    let decision = recordLoginFailure(state, T0);
    for (let i = 0; i < 3; i++) {
      decision = recordLoginFailure(decision.state, T0);
    }
    expect(decision.state.loginFailures).toBe(4);
    expect(decision.blocked).toBe(false);
    expect(decision.state.blockedUntil).toBeNull();
  });

  it("blocks on the 5th consecutive failure for exactly 60 seconds", () => {
    const state = failNtimes(4, T0);
    const decision = recordLoginFailure(state, T0);
    expect(decision.state.loginFailures).toBe(5);
    expect(decision.blocked).toBe(true);
    expect(decision.state.blockedUntil).toBe(T0 + 60_000);
    expect(decision.retryAfterSeconds).toBe(60);
  });

  it("uses the injected threshold, not a hardcoded 5", () => {
    let state = emptyState();
    const config = { maxFailures: 3, blockMs: 10_000 };
    const first = recordLoginFailure(state, T0, config);
    const second = recordLoginFailure(first.state, T0, config);
    const third = recordLoginFailure(second.state, T0, config);
    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(false);
    expect(third.blocked).toBe(true);
    expect(third.state.blockedUntil).toBe(T0 + 10_000);
  });

  it("defaults match the spec (5 failures, 60s)", () => {
    expect(BRUTE_FORCE_CONFIG).toEqual({ maxFailures: 5, blockMs: 60_000 });
  });
});

describe("resetLoginFailures — reset on success (SEC-04)", () => {
  it("zeroes the counter and clears any block", () => {
    const blocked = recordLoginFailure(failNtimes(4, T0), T0).state;
    const reset = resetLoginFailures(blocked);
    expect(reset.loginFailures).toBe(0);
    expect(reset.blockedUntil).toBeNull();
  });
});

describe("block expiry — the 60-second boundary (SEC-05)", () => {
  it("is still blocked one millisecond before blockedUntil", () => {
    const state = recordLoginFailure(failNtimes(4, T0), T0).state;
    const at = T0 + 60_000 - 1;
    expect(isBlocked(state, at)).toBe(true);
    const decision = evaluateBlock(state, at);
    expect(decision.blocked).toBe(true);
    expect(decision.retryAfterSeconds).toBe(1);
  });

  it("is allowed again at exactly blockedUntil, with a zeroed counter", () => {
    const state = recordLoginFailure(failNtimes(4, T0), T0).state;
    const at = T0 + 60_000;
    expect(isBlocked(state, at)).toBe(false);
    const decision = evaluateBlock(state, at);
    expect(decision.blocked).toBe(false);
    expect(decision.state.loginFailures).toBe(0);
    expect(decision.state.blockedUntil).toBeNull();
  });

  it("counts the next failure after expiry from zero, not from five", () => {
    const blockedState = recordLoginFailure(failNtimes(4, T0), T0).state;
    const after = recordLoginFailure(blockedState, T0 + 60_000);
    expect(after.state.loginFailures).toBe(1);
    expect(after.blocked).toBe(false);
  });
});

describe("evaluateBucket — auth bucket, 10 req/min (SEC-25)", () => {
  it("allows the first 10 requests and rejects the 11th within the window", () => {
    let state = emptyState();
    let decision = evaluateBucket(state, "auth", T0);
    for (let i = 1; i < 10; i++) {
      decision = evaluateBucket(decision.state, "auth", T0 + i * 1000);
      expect(decision.allowed).toBe(true);
    }
    const eleventh = evaluateBucket(decision.state, "auth", T0 + 10_000);
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.retryAfterSeconds).toBe(50);
  });

  it("allows again after the window rolls over", () => {
    let state = emptyState();
    let decision = evaluateBucket(state, "auth", T0);
    for (let i = 1; i < 11; i++) {
      decision = evaluateBucket(decision.state, "auth", T0 + 1000);
    }
    expect(decision.allowed).toBe(false);
    const rolled = evaluateBucket(decision.state, "auth", T0 + 60_000);
    expect(rolled.allowed).toBe(true);
    expect(rolled.state.authCount).toBe(1);
    expect(rolled.state.authWindowStart).toBe(T0 + 60_000);
  });
});

describe("evaluateBucket — general bucket, 100 req/min (SEC-26)", () => {
  it("allows the first 100 requests and rejects the 101st within the window", () => {
    let decision = evaluateBucket(emptyState(), "general", T0);
    for (let i = 1; i < 100; i++) {
      decision = evaluateBucket(decision.state, "general", T0 + i);
      expect(decision.allowed).toBe(true);
    }
    const overflow = evaluateBucket(decision.state, "general", T0 + 100);
    expect(overflow.allowed).toBe(false);
    expect(overflow.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows again after the window rolls over", () => {
    let decision = evaluateBucket(emptyState(), "general", T0);
    for (let i = 1; i < 101; i++) {
      decision = evaluateBucket(decision.state, "general", T0 + 10);
    }
    expect(decision.allowed).toBe(false);
    const rolled = evaluateBucket(decision.state, "general", T0 + 60_001);
    expect(rolled.allowed).toBe(true);
    expect(rolled.state.generalCount).toBe(1);
  });

  it("uses the injected bucket config, not hardcoded literals", () => {
    const config = { limit: 2, windowMs: 5000 };
    let decision = evaluateBucket(emptyState(), "general", T0, config);
    decision = evaluateBucket(decision.state, "general", T0 + 1, config);
    const third = evaluateBucket(decision.state, "general", T0 + 2, config);
    expect(third.allowed).toBe(false);
    expect(BUCKET_CONFIG.auth.limit).toBe(10);
    expect(BUCKET_CONFIG.general.limit).toBe(100);
  });
});
