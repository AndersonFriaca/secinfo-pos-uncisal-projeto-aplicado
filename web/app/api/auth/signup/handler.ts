/**
 * `POST /api/auth/signup` — rate-limit, validate, create the account, trigger
 * the verification email.
 *
 * Order (T13): rate-limit the `auth` bucket → validate the email and password →
 * call Identity Platform. A weak password never reaches Identity Platform. Every
 * rejection (invalid email/password, an already-registered email, rate limit,
 * or Identity Platform unavailability) redirects back to `/signup?error=<code>`
 * instead of returning a JSON body — the browser renders the `SignupForm`
 * again with the matching `Alert` instead of a raw JSON page (AUTH-18). An
 * already-registered email produces the byte-identical `error=invalid`
 * redirect as any other upstream signup rejection (AUTH-04 — no enumeration).
 * Every response carries `Cache-Control: no-store`.
 *
 * Requirements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-18.
 */

import {
  normalizeEmail,
  validatePassword,
} from "../../../../lib/validation/credentials";
import { signUp, sendVerificationEmail } from "../../../../lib/auth/identity-platform";
import { checkRateLimit, resolveClientIp } from "../../../../lib/security/rate-limit";

export type SignupDeps = {
  checkRateLimit: typeof checkRateLimit;
  signUp: typeof signUp;
  sendVerificationEmail: typeof sendVerificationEmail;
  resolveClientIp: typeof resolveClientIp;
};

const defaultDeps: SignupDeps = {
  checkRateLimit,
  signUp,
  sendVerificationEmail,
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

async function readCredentials(
  request: Request,
): Promise<{ email: string; password: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;
    return {
      email: typeof body?.email === "string" ? body.email : "",
      password: typeof body?.password === "string" ? body.password : "",
    };
  }
  const form = await request.formData().catch(() => null);
  return {
    email: form ? String(form.get("email") ?? "") : "",
    password: form ? String(form.get("password") ?? "") : "",
  };
}

export async function handleSignup(
  request: Request,
  deps: SignupDeps = defaultDeps,
): Promise<Response> {
  const ip = deps.resolveClientIp(request.headers);

  const limit = await deps.checkRateLimit(ip, "auth");
  if (!limit.allowed) {
    return redirect("/signup?error=rate_limited");
  }

  const { email, password } = await readCredentials(request);

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return redirect("/signup?error=invalid");
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) {
    return redirect("/signup?error=invalid");
  }

  const created = await deps.signUp(normalizedEmail, password);
  if (!created.ok) {
    return created.reason === "unavailable"
      ? redirect("/signup?error=unavailable")
      : redirect("/signup?error=invalid");
  }

  await deps.sendVerificationEmail(created.idToken);
  return redirect("/verify-email");
}

