/**
 * Pure credential validation — no I/O, unit-tested in isolation.
 * Requirements: AUTH-02 (password strength), AUTH-05 (email normalisation).
 */

/** Maximum total length of an email address (RFC 5321 §4.5.3.1.3). */
const MAX_EMAIL_LENGTH = 254;

/**
 * Pragmatic RFC-shaped check: a non-empty local part, an "@", a non-empty
 * domain with at least one dot, and no whitespace anywhere.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim, lowercase, and validate the shape and length of an email address.
 * Returns the normalised address, or `null` when it is not a plausible
 * RFC-shaped address or exceeds {@link MAX_EMAIL_LENGTH} characters.
 */
export function normalizeEmail(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > MAX_EMAIL_LENGTH) {
    return null;
  }
  if (!EMAIL_SHAPE.test(normalized)) {
    return null;
  }
  return normalized;
}

export type PasswordRule =
  | "length"
  | "lowercase"
  | "uppercase"
  | "digit"
  | "symbol";

export type PasswordValidation =
  | { ok: true }
  | { ok: false; failed: PasswordRule };

/** Minimum password length (AUTH-02). */
const MIN_PASSWORD_LENGTH = 12;

/**
 * Enforce the password policy: at least 12 characters with at least one
 * lowercase letter, one uppercase letter, one digit, and one symbol.
 * On failure, reports the first unmet rule.
 */
export function validatePassword(pw: string): PasswordValidation {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, failed: "length" };
  }
  if (!/[a-z]/.test(pw)) {
    return { ok: false, failed: "lowercase" };
  }
  if (!/[A-Z]/.test(pw)) {
    return { ok: false, failed: "uppercase" };
  }
  if (!/[0-9]/.test(pw)) {
    return { ok: false, failed: "digit" };
  }
  if (!/[^A-Za-z0-9]/.test(pw)) {
    return { ok: false, failed: "symbol" };
  }
  return { ok: true };
}
