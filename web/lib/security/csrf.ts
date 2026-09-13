/**
 * CSRF token generation and constant-time verification.
 *
 * Web Crypto only (`crypto.getRandomValues`, `TextEncoder`), so the module
 * loads on both the Edge and Node runtimes.
 * Requirements: SEC-21, SEC-22, SEC-24.
 */

/** Token entropy in bytes (SEC-24 requires >= 32). */
const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A fresh CSRF token: 32 bytes of cryptographic randomness, base64url-encoded.
 * Never derived from the session, the user ID, or a timestamp — every call is
 * independent randomness.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * Compare a submitted CSRF token against the cookie value in constant time.
 * Returns false when either side is missing/empty or the lengths differ;
 * otherwise compares every byte without an early exit.
 */
export function verifyCsrfToken(
  submitted: string | null | undefined,
  cookie: string | null | undefined,
): boolean {
  if (!submitted || !cookie) {
    return false;
  }

  const encoder = new TextEncoder();
  const a = encoder.encode(submitted);
  const b = encoder.encode(cookie);

  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
