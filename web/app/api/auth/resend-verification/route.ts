/**
 * `POST /api/auth/resend-verification` — rate-limited resend of the
 * verification email.
 *
 * Mail is only ever sent to an address whose password was proven in the same
 * request (via `signInWithPassword`), so the endpoint cannot be used to spray
 * mail at arbitrary addresses. The response is the same generic acknowledgement
 * whether or not the address exists (no enumeration). The `auth` rate-limit
 * bucket applies; exceeding it returns 429 with `Retry-After`.
 *
 * Requirements: AUTH-03, AUTH-06.
 */

import { normalizeEmail } from "../../../../lib/validation/credentials";
import {
  sendVerificationEmail,
  signInWithPassword,
} from "../../../../lib/auth/identity-platform";
import { checkRateLimit, resolveClientIp } from "../../../../lib/security/rate-limit";

export const runtime = "nodejs";

/** AUTH-06: identical whether or not the address exists. */
const ACK_MESSAGE =
  "If that account exists and still needs verification, a new email is on its way";

export type ResendDeps = {
  checkRateLimit: typeof checkRateLimit;
  signInWithPassword: typeof signInWithPassword;
  sendVerificationEmail: typeof sendVerificationEmail;
  resolveClientIp: typeof resolveClientIp;
};

const defaultDeps: ResendDeps = {
  checkRateLimit,
  signInWithPassword,
  sendVerificationEmail,
  resolveClientIp,
};

function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...extraHeaders,
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

export async function handleResendVerification(
  request: Request,
  deps: ResendDeps = defaultDeps,
): Promise<Response> {
  const ip = deps.resolveClientIp(request.headers);

  const limit = await deps.checkRateLimit(ip, "auth");
  if (!limit.allowed) {
    return json(
      429,
      { error: "Too many requests" },
      { "retry-after": String(limit.retryAfterSeconds ?? 60) },
    );
  }

  const { email, password } = await readCredentials(request);
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const result = await deps.signInWithPassword(normalizedEmail, password);
    if (result.ok) {
      await deps.sendVerificationEmail(result.idToken);
    }
  }

  return json(200, { message: ACK_MESSAGE });
}

export function POST(request: Request): Promise<Response> {
  return handleResendVerification(request);
}
