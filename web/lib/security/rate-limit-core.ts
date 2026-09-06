/**
 * Pure rate-limit and brute-force decision logic.
 *
 * No I/O, no clock, no store: every function takes the current per-IP state
 * plus an explicit `now` and returns the next state together with a decision.
 * The persistence adapter (`rate-limit.ts`) wires this to Firestore and the
 * in-memory L1 cache.
 *
 * Requirements: SEC-01, SEC-02, SEC-04, SEC-05, SEC-25, SEC-26, SEC-27.
 */

/** Per-IP counters. Mirrors the Firestore `rate_limits/{ip}` document. */
export type RateLimitState = {
  /** Consecutive failed logins; reset to 0 on success or an expired block. */
  loginFailures: number;
  /** Epoch ms until which the IP is blocked, or `null` when not blocked. */
  blockedUntil: number | null;
  /** Start (epoch ms) of the current 1-minute `auth` bucket window. */
  authWindowStart: number;
  authCount: number;
  /** Start (epoch ms) of the current 1-minute `general` bucket window. */
  generalWindowStart: number;
  generalCount: number;
};

/** A never-seen IP: no failures, no block, no open windows. */
export function emptyState(): RateLimitState {
  return {
    loginFailures: 0,
    blockedUntil: null,
    authWindowStart: 0,
    authCount: 0,
    generalWindowStart: 0,
    generalCount: 0,
  };
}

export type BucketName = "auth" | "general";

export type BucketConfig = {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

/** Default request ceilings (SEC-25, SEC-26): 10/min auth, 100/min elsewhere. */
export const BUCKET_CONFIG: Record<BucketName, BucketConfig> = {
  auth: { limit: 10, windowMs: 60_000 },
  general: { limit: 100, windowMs: 60_000 },
};

export type BruteForceConfig = {
  /** Consecutive failures that trigger a block. */
  maxFailures: number;
  /** Block duration in milliseconds. */
  blockMs: number;
};

/** Default brute-force policy (SEC-02): 5 failures → 60-second block. */
export const BRUTE_FORCE_CONFIG: BruteForceConfig = {
  maxFailures: 5,
  blockMs: 60_000,
};

function secondsUntil(deadline: number, now: number): number {
  return Math.max(1, Math.ceil((deadline - now) / 1000));
}

/**
 * Clear a block whose deadline has passed: at `now === blockedUntil` the IP is
 * allowed again and its failure counter is zeroed (SEC-05). One millisecond
 * earlier the block still stands.
 */
export function normalizeExpiredBlock(
  state: RateLimitState,
  now: number,
): RateLimitState {
  if (state.blockedUntil !== null && now >= state.blockedUntil) {
    return { ...state, loginFailures: 0, blockedUntil: null };
  }
  return state;
}

/** Whether the IP is currently blocked (SEC-03: reject before any upstream call). */
export function isBlocked(state: RateLimitState, now: number): boolean {
  const s = normalizeExpiredBlock(state, now);
  return s.blockedUntil !== null && now < s.blockedUntil;
}

export type BlockDecision = {
  blocked: boolean;
  retryAfterSeconds?: number;
  state: RateLimitState;
};

/**
 * Read the block status without mutating counters, returning the normalized
 * state so a caller can persist an expired-block reset.
 */
export function evaluateBlock(
  state: RateLimitState,
  now: number,
): BlockDecision {
  const s = normalizeExpiredBlock(state, now);
  if (s.blockedUntil !== null && now < s.blockedUntil) {
    return {
      blocked: true,
      retryAfterSeconds: secondsUntil(s.blockedUntil, now),
      state: s,
    };
  }
  return { blocked: false, state: s };
}

/**
 * Record one failed login. The `maxFailures`-th consecutive failure sets
 * `blockedUntil = now + blockMs` (SEC-02); earlier failures only increment
 * (SEC-01).
 */
export function recordLoginFailure(
  state: RateLimitState,
  now: number,
  config: BruteForceConfig = BRUTE_FORCE_CONFIG,
): BlockDecision {
  const s = normalizeExpiredBlock(state, now);
  const loginFailures = s.loginFailures + 1;

  if (loginFailures >= config.maxFailures) {
    const blockedUntil = now + config.blockMs;
    return {
      blocked: true,
      retryAfterSeconds: secondsUntil(blockedUntil, now),
      state: { ...s, loginFailures, blockedUntil },
    };
  }

  return { blocked: false, state: { ...s, loginFailures, blockedUntil: null } };
}

/** Reset the failure counter and clear any block (SEC-04: on successful login). */
export function resetLoginFailures(state: RateLimitState): RateLimitState {
  return { ...state, loginFailures: 0, blockedUntil: null };
}

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
  state: RateLimitState;
};

/**
 * Fixed-window counter for a bucket. A request in a fresh window resets the
 * count to 1; a request past `limit` within the window is rejected with the
 * seconds remaining until the window rolls over (SEC-25, SEC-26, SEC-27).
 */
export function evaluateBucket(
  state: RateLimitState,
  bucket: BucketName,
  now: number,
  config: BucketConfig = BUCKET_CONFIG[bucket],
): RateLimitDecision {
  const windowStart =
    bucket === "auth" ? state.authWindowStart : state.generalWindowStart;
  const count = bucket === "auth" ? state.authCount : state.generalCount;

  const inWindow = windowStart !== 0 && now - windowStart < config.windowMs;
  const nextWindowStart = inWindow ? windowStart : now;
  const nextCount = inWindow ? count + 1 : 1;

  const next: RateLimitState =
    bucket === "auth"
      ? { ...state, authWindowStart: nextWindowStart, authCount: nextCount }
      : {
          ...state,
          generalWindowStart: nextWindowStart,
          generalCount: nextCount,
        };

  if (nextCount > config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(nextWindowStart + config.windowMs, now),
      state: next,
    };
  }
  return { allowed: true, state: next };
}
