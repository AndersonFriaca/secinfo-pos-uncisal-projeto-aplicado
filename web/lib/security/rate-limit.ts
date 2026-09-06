/**
 * Persistence adapter for the rate limiter: a transactional store plus the
 * in-process L1 cache that short-circuits already-blocked IPs.
 *
 * Every decision is delegated to `rate-limit-core.ts`; this module only stores
 * and caches. It runs on the Node runtime only (Firestore is not available on
 * the Edge runtime — see AD-005).
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
 * returns the state to persist plus a value to return to the caller. The whole
 * read-modify-write runs atomically so concurrent requests cannot skip the
 * 5th-failure threshold.
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

// --- default store wiring ----------------------------------------------------

let defaultStore: RateLimitStore | null = null;

/** Wire the production store once, at Route Handler startup. */
export function configureRateLimitStore(store: RateLimitStore): void {
  defaultStore = store;
}

function requireStore(explicit?: RateLimitStore): RateLimitStore {
  const store = explicit ?? defaultStore;
  if (!store) {
    throw new Error(
      "rate-limit store not configured — call configureRateLimitStore() first",
    );
  }
  return store;
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

// --- Firestore store -------------------------------------------------------

type FirestoreSnapshot = { exists: boolean; data(): RateLimitState | undefined };
type FirestoreDocRef = unknown;
type FirestoreTransaction = {
  get(ref: FirestoreDocRef): Promise<FirestoreSnapshot>;
  set(ref: FirestoreDocRef, data: RateLimitState): void;
};

/** The subset of the Admin SDK `Firestore` object this adapter needs. */
export type FirestoreLike = {
  collection(name: string): { doc(id: string): FirestoreDocRef };
  runTransaction<T>(fn: (tx: FirestoreTransaction) => Promise<T>): Promise<T>;
};

/**
 * A {@link RateLimitStore} backed by a Firestore database. Reads and writes
 * `rate_limits/{ip}` inside a single transaction (the spec's concurrency edge
 * case). Written against a structural type so this module never imports
 * `firebase-admin` — the caller passes a live `Firestore` instance.
 */
export function createFirestoreStore(
  db: FirestoreLike,
  collectionName = "rate_limits",
): RateLimitStore {
  return {
    async transact(ip, mutator) {
      const ref = db.collection(collectionName).doc(ip);
      return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const current =
          snapshot.exists && snapshot.data()
            ? (snapshot.data() as RateLimitState)
            : emptyState();
        const { next, output } = mutator(current);
        tx.set(ref, next);
        return output;
      });
    },
  };
}

/** Re-exported so Route Handlers can size their own windows if needed. */
export { BUCKET_CONFIG };
