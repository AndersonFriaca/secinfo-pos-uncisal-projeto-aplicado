/**
 * `POST /api/auth/signup` — rate-limit, validate, create the account, trigger
 * the verification email.
 *
 * Order (T13): rate-limit the `auth` bucket → validate the email and password →
 * call Identity Platform. A weak password never reaches Identity Platform. An
 * already-registered email gets the same generic 400 body as any other upstream
 * signup rejection. Every response carries `Cache-Control: no-store`.
 *
 * Requirements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05.
 */

import {
  normalizeEmail,
  validatePassword,
  type PasswordRule,
} from "../../../../lib/validation/credentials";
import { signUp, sendVerificationEmail } from "../../../../lib/auth/identity-platform";
import { checkRateLimit, resolveClientIp } from "../../../../lib/security/rate-limit";

export const runtime = "nodejs";

/** AUTH-04: one message for every upstream signup rejection (no enumeration). */
const GENERIC_SIGNUP_ERROR = "Não foi possível criar a conta com esses dados";
const INVALID_EMAIL_ERROR = "Informe um e-mail válido";
const UNAVAILABLE_ERROR = "Serviço temporariamente indisponível";

const PASSWORD_RULE_MESSAGE: Record<PasswordRule, string> = {
  length: "A senha deve ter pelo menos 12 caracteres",
  lowercase: "A senha deve incluir uma letra minúscula",
  uppercase: "A senha deve incluir uma letra maiúscula",
  digit: "A senha deve incluir um dígito",
  symbol: "A senha deve incluir um símbolo",
};

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

function redirect(path: string, request: Request): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(path, request.url).toString(),
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
    return json(
      429,
      { error: "Muitas requisições" },
      { "retry-after": String(limit.retryAfterSeconds ?? 60) },
    );
  }

  const { email, password } = await readCredentials(request);

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return json(400, { error: INVALID_EMAIL_ERROR });
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) {
    return json(400, {
      error: PASSWORD_RULE_MESSAGE[passwordCheck.failed],
      rule: passwordCheck.failed,
    });
  }

  const created = await deps.signUp(normalizedEmail, password);
  if (!created.ok) {
    return created.reason === "unavailable"
      ? json(503, { error: UNAVAILABLE_ERROR })
      : json(400, { error: GENERIC_SIGNUP_ERROR });
  }

  await deps.sendVerificationEmail(created.idToken);
  return redirect("/verify-email", request);
}

export function POST(request: Request): Promise<Response> {
  return handleSignup(request);
}
