/**
 * `POST /api/auth/forgot-password` — rate-limit, validate, ask Identity
 * Platform to send a password-reset email.
 *
 * Order: rate-limit the `auth` bucket → normalize/validate the email → call
 * Identity Platform. The redirect to `/forgot-password?sent=1` never branches
 * on whether `sendPasswordResetEmail` reports the account exists — an
 * unregistered email produces the byte-identical response as a registered one
 * (AUTH-20, no enumeration, mirrors AUTH-04's approach for signup). Every
 * redirect carries `Cache-Control: no-store`.
 *
 * Requirements: AUTH-20, AUTH-21, AUTH-22.
 */

import { normalizeEmail } from "../../../../lib/validation/credentials";
import { sendPasswordResetEmail } from "../../../../lib/auth/identity-platform";
import { checkRateLimit, resolveClientIp } from "../../../../lib/security/rate-limit";

export type ForgotPasswordDeps = {
  checkRateLimit: typeof checkRateLimit;
  sendPasswordResetEmail: typeof sendPasswordResetEmail;
  resolveClientIp: typeof resolveClientIp;
};

const defaultDeps: ForgotPasswordDeps = {
  checkRateLimit,
  sendPasswordResetEmail,
  resolveClientIp,
};

function redirect(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      // Relative Location — see the note in login/handler.ts: an absolute URL
      // from request.url leaks the internal http://localhost:3000 and trips
      // the browser's form-action 'self' CSP.
      location: path,
      "cache-control": "no-store",
    },
  });
}

async function readEmail(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
    } | null;
    return typeof body?.email === "string" ? body.email : "";
  }
  const form = await request.formData().catch(() => null);
  return form ? String(form.get("email") ?? "") : "";
}

export async function handleForgotPassword(
  request: Request,
  deps: ForgotPasswordDeps = defaultDeps,
): Promise<Response> {
  const ip = deps.resolveClientIp(request.headers);

  const limit = await deps.checkRateLimit(ip, "auth");
  if (!limit.allowed) {
    return redirect("/forgot-password?error=rate_limited");
  }

  const email = await readEmail(request);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return redirect("/forgot-password?error=invalid");
  }

  await deps.sendPasswordResetEmail(normalizedEmail);
  return redirect("/forgot-password?sent=1");
}
