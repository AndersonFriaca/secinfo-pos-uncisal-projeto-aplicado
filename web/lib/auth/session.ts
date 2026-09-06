/**
 * Firebase session-cookie lifecycle (mint / verify / revoke) and the
 * `getAuthenticatedUser` guard the dashboard calls on every request.
 *
 * The Admin SDK is resolved lazily and can be injected, so unit tests need no
 * GCP credentials. Node runtime only (AD-005).
 *
 * Requirements: AUTH-08, AUTH-11, AUTH-13, AUTH-14, AUTH-16, AUTH-17.
 */

/** 12-hour session (spec: `SameSite=Strict`, 12h). */
export const SESSION_MAX_AGE_SECONDS = 43_200;
const SESSION_EXPIRES_IN_MS = SESSION_MAX_AGE_SECONDS * 1000;

/** Claims read back from a verified session cookie. */
export type SessionClaims = {
  uid: string;
  email?: string;
  email_verified?: boolean;
};

/** The subset of `admin.auth()` this module needs — injectable for tests. */
export type SessionAuth = {
  createSessionCookie(
    idToken: string,
    options: { expiresIn: number },
  ): Promise<string>;
  verifySessionCookie(
    sessionCookie: string,
    checkRevoked: boolean,
  ): Promise<SessionClaims>;
  revokeRefreshTokens(uid: string): Promise<void>;
};

export type AuthUser = { uid: string; email: string | null };

export type SessionCallOptions = { auth?: SessionAuth };

let cachedAuth: SessionAuth | null = null;

/** Wire a specific Admin SDK auth client (production wiring, or a test double). */
export function configureSessionAuth(auth: SessionAuth): void {
  cachedAuth = auth;
}

/** Test-only: forget any configured/lazy auth client. */
export function __resetSessionAuth(): void {
  cachedAuth = null;
}

async function resolveAuth(explicit?: SessionAuth): Promise<SessionAuth> {
  if (explicit) return explicit;
  if (cachedAuth) return cachedAuth;
  const { getApps, initializeApp, applicationDefault } = await import(
    "firebase-admin/app"
  );
  const { getAuth } = await import("firebase-admin/auth");
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: applicationDefault() });
  cachedAuth = getAuth(app) as unknown as SessionAuth;
  return cachedAuth;
}

/** Cookie attributes for the session cookie (AUTH-08). */
export function sessionCookieOptions(): {
  httpOnly: true;
  secure: true;
  sameSite: "strict";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Mint a 12-hour Firebase session cookie from a fresh ID token (AUTH-08). */
export async function createSession(
  idToken: string,
  opts: SessionCallOptions = {},
): Promise<string> {
  const auth = await resolveAuth(opts.auth);
  return auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS });
}

/**
 * Verify a session cookie with `checkRevoked: true` (AUTH-14). Returns the
 * claims, or `null` on any failure — never throws.
 */
export async function verifySession(
  cookie: string | null | undefined,
  opts: SessionCallOptions = {},
): Promise<SessionClaims | null> {
  if (!cookie) return null;
  try {
    const auth = await resolveAuth(opts.auth);
    return await auth.verifySessionCookie(cookie, true);
  } catch {
    return null;
  }
}

/** Revoke every refresh token for a uid, invalidating existing sessions (AUTH-17). */
export async function revokeSession(
  uid: string,
  opts: SessionCallOptions = {},
): Promise<void> {
  const auth = await resolveAuth(opts.auth);
  await auth.revokeRefreshTokens(uid);
}

/**
 * The dashboard guard (AUTH-13, AUTH-16). Returns the user only when the cookie
 * verifies AND the email is verified; `null` for a missing cookie, an invalid
 * cookie, a revoked session, or an unverified email.
 */
export async function getAuthenticatedUser(
  cookieValue: string | null | undefined,
  opts: SessionCallOptions = {},
): Promise<AuthUser | null> {
  const claims = await verifySession(cookieValue, opts);
  if (!claims) return null;
  if (claims.email_verified !== true) return null;
  return { uid: claims.uid, email: claims.email ?? null };
}
