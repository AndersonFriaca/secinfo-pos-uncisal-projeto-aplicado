/**
 * Short-lived cookie that lets `/verify-email` resend the verification email
 * without asking for the password again.
 *
 * Holds the Identity Platform ID token returned by signup (or by a login with
 * an unverified email). `HttpOnly`, `Secure`, `SameSite=Strict` and scoped to
 * the resend route only, so no page or other API route ever receives it.
 * `Max-Age` matches the ID token's 1-hour lifetime; after that the user signs
 * in again, which re-issues it.
 *
 * Requirements: AUTH-03, AUTH-06.
 */

export const VERIFY_COOKIE = "__verify";
export const VERIFY_COOKIE_PATH = "/api/auth/resend-verification";
export const VERIFY_COOKIE_MAX_AGE_SECONDS = 3600;

export function serializeVerifyCookie(idToken: string): string {
  return `${VERIFY_COOKIE}=${idToken}; Max-Age=${VERIFY_COOKIE_MAX_AGE_SECONDS}; Path=${VERIFY_COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict`;
}

export function readVerifyCookie(headers: Headers): string | null {
  const raw = headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === VERIFY_COOKIE) {
      const value = rest.join("=");
      return value || null;
    }
  }
  return null;
}
