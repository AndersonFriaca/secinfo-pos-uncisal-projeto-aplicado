/**
 * Persistence adapter for the rate limiter: a process-local in-memory store
 * plus the in-process L1 cache that short-circuits already-blocked IPs.
 *
 * Every decision is delegated to `rate-limit-core.ts`; this module only stores
 * and caches. The store is `createInMemoryStore()` — a `Map` kept in the Node
 * process (AD-009). Counters reset on every restart; this deployment runs a
 * single VM instance, so no shared or durable store is needed.
 *
 * Requirements: SEC-03, SEC-06, SEC-07.
 */

import {
  BUCKET_CONFIG,
  emptyState,
  evaluateBlock,
  evaluateBucket,
  recordLoginFailure as coreRecordLoginFailure,
  resetLoginFailures as coreResetLoginFailures,
  type BucketName,
  type RateLimitState,
} from "./rate-limit-core";

/**
 * A transactional key-value store for `rate_limits/{ip}`. The mutator receives
 * the current state (or a fresh {@link emptyState} for an unknown IP) and
 * returns the state to persist plus a value to return to the caller. The
 * read-modify-write runs synchronously so concurrent requests cannot skip the
 * 5th-failure threshold. Kept as an interface so tests can inject a fake.
 */
export type RateLimitStore = {
  transact<T>(
    ip: string,
    mutator: (current: RateLimitState) => { next: RateLimitState; output: T },
  ): Promise<T>;
};

// --- L1 cache -------------------------------------------------------------

/** ip → `blockedUntil` (epoch ms). Reset on every process restart. */
const l1Blocks = new Map<string, number>();

/** Test-only: drop the in-process cache between cases. */
export function __clearRateLimitCache(): void {
  l1Blocks.clear();
}

function cachedBlock(ip: string, now: number): number | null {
  const until = l1Blocks.get(ip);
  if (until === undefined) return null;
  if (now >= until) {
    l1Blocks.delete(ip);
    return null;
  }
  return until;
}

// --- in-memory store (the default) ---------------------------------------

/**
 * A {@link RateLimitStore} kept in a process-local `Map`. The read-modify-write
 * in `transact` runs synchronously (no `await` between the read and the write)
 * and the Node runtime is single-threaded, so two concurrent requests for the
 * same IP cannot interleave and skip the 5th-failure threshold within one
 * process.
 *
 * Counters live only in memory: they reset on every deploy/restart and are not
 * shared across instances. This deployment runs a single VM instance with
 * 60-second block windows, so that is acceptable (AD-009).
 */
export function createInMemoryStore(): RateLimitStore {
  const states = new Map<string, RateLimitState>();
  return {
    async transact(ip, mutator) {
      const current = states.get(ip) ?? emptyState();
      const { next, output } = mutator(current);
      states.set(ip, next);
      return output;
    },
  };
}

// --- default store ---------------------------------------------------------

let defaultStore: RateLimitStore | null = null;

/** Test-only: drop the process store so the next call rebuilds a fresh one. */
export function __resetRateLimitStore(): void {
  defaultStore = null;
}

function requireStore(explicit?: RateLimitStore): RateLimitStore {
  if (explicit) return explicit;
  return (defaultStore ??= createInMemoryStore());
}

// --- client IP resolution (SEC-06) -----------------------------------------

/**
 * The client IP is the left-most `X-Forwarded-For` entry set by the VM's Nginx
 * reverse proxy; when the header is absent, fall back to the socket address.
 */
export function resolveClientIp(
  headers: Headers,
  socketAddress?: string | null,
): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return socketAddress?.trim() || "unknown";
}

// --- public API ------------------------------------------------------------

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number };
export type LoginFailureResult = { blocked: boolean; retryAfterSeconds?: number };

type CallOptions = { store?: RateLimitStore; now?: number };

/**
 * Bucket check. A cached block short-circuits with zero store calls (SEC-07).
 * A store failure fails **closed** for the `auth` bucket (login: reject) and
 * **open** for `general` (SEC-06 edge case).
 */
export async function checkRateLimit(
  ip: string,
  bucket: BucketName,
  opts: CallOptions = {},
): Promise<RateLimitResult> {
  const now = opts.now ?? Date.now();

  const until = cachedBlock(ip, now);
  if (until !== null) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
    };
  }

  try {
    return await requireStore(opts.store).transact(ip, (current) => {
      const decision = evaluateBucket(current, bucket, now);
      return {
        next: decision.state,
        output: {
          allowed: decision.allowed,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      };
    });
  } catch (error) {
    if (bucket === "general") {
      return { allowed: true };
    }
    throw error;
  }
}

/**
 * Check the brute-force block before touching Identity Platform (SEC-03).
 * A cached block short-circuits with zero store calls (SEC-07).
 */
export async function checkLoginBlock(
  ip: string,
  opts: CallOptions = {},
): Promise<LoginFailureResult> {
  const now = opts.now ?? Date.now();

  const until = cachedBlock(ip, now);
  if (until !== null) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
    };
  }

  return requireStore(opts.store).transact(ip, (current) => {
    const decision = evaluateBlock(current, now);
    if (decision.blocked && decision.retryAfterSeconds) {
      l1Blocks.set(ip, now + decision.retryAfterSeconds * 1000);
    }
    return {
      next: decision.state,
      output: {
        blocked: decision.blocked,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    };
  });
}

/** Record a failed login; caches the block in L1 when the threshold is hit. */
export async function recordLoginFailure(
  ip: string,
  opts: CallOptions = {},
): Promise<LoginFailureResult> {
  const now = opts.now ?? Date.now();

  return requireStore(opts.store).transact(ip, (current) => {
    const decision = coreRecordLoginFailure(current, now);
    if (decision.state.blockedUntil !== null) {
      l1Blocks.set(ip, decision.state.blockedUntil);
    }
    return {
      next: decision.state,
      output: {
        blocked: decision.blocked,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    };
  });
}

/** Reset the failure counter after a successful login (SEC-04). */
export async function resetLoginFailures(
  ip: string,
  opts: CallOptions = {},
): Promise<void> {
  l1Blocks.delete(ip);
  await requireStore(opts.store).transact(ip, (current) => ({
    next: coreResetLoginFailures(current),
    output: undefined,
  }));
}

/** Re-exported so Route Handlers can size their own windows if needed. */
export { BUCKET_CONFIG };
