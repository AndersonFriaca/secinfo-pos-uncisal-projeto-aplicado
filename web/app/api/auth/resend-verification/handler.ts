/**
 * `POST /api/auth/resend-verification` — rate-limited resend of the
 * verification email.
 *
 * The form carries no credentials: the ID token comes from the `__verify`
 * cookie set by signup (or by a login with an unverified email), so mail only
 * ever goes to the address that just proved its password. Every outcome —
 * sent, missing/expired cookie, Identity Platform rejection — produces the
 * same `303 /verify-email?resent=1` (no enumeration). The `auth` rate-limit
 * bucket applies; exceeding it redirects to `/error?reason=rate-limited`.
 *
 * Requirements: AUTH-03, AUTH-06.
 */

import { sendVerificationEmail } from "../../../../lib/auth/identity-platform";
import { readVerifyCookie } from "../../../../lib/auth/verify-cookie";
import { checkRateLimit, resolveClientIp } from "../../../../lib/security/rate-limit";

export type ResendDeps = {
  checkRateLimit: typeof checkRateLimit;
  sendVerificationEmail: typeof sendVerificationEmail;
  resolveClientIp: typeof resolveClientIp;
};

const defaultDeps: ResendDeps = {
  checkRateLimit,
  sendVerificationEmail,
  resolveClientIp,
};

function redirect(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      // Relative Location — see the note in login/handler.ts.
      location: path,
      "cache-control": "no-store",
    },
  });
}

export async function handleResendVerification(
  request: Request,
  deps: ResendDeps = defaultDeps,
): Promise<Response> {
  const ip = deps.resolveClientIp(request.headers);

  const limit = await deps.checkRateLimit(ip, "auth");
  if (!limit.allowed) {
    return redirect(
      `/error?reason=rate-limited&retryAfter=${limit.retryAfterSeconds ?? 60}`,
    );
  }

  const idToken = readVerifyCookie(request.headers);
  if (idToken) {
    await deps.sendVerificationEmail(idToken);
  }

  return redirect("/verify-email?resent=1");
}
