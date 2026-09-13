/**
 * `POST /api/auth/login` — the full login chain.
 *
 * Order (T14): brute-force block check → `auth` rate limit → credential
 * exchange with Identity Platform → email-verification check → session cookie.
 * A blocked IP never reaches Identity Platform. An unknown email and a wrong
 * password produce byte-identical 401 responses. Identity Platform 5xx or a
 * rate-limit store failure becomes a 503 with a generic body and the upstream
 * detail logged server-side only. Every response carries `Cache-Control: no-store`.
 *
 * Requirements: AUTH-07..AUTH-12, SEC-01..SEC-04.
 */

import { normalizeEmail } from "../../../../lib/validation/credentials";
import { signInWithPassword } from "../../../../lib/auth/identity-platform";
import { createSession, sessionCookieOptions } from "../../../../lib/auth/session";
import {
  checkLoginBlock,
  checkRateLimit,
  recordLoginFailure,
  resetLoginFailures,
  resolveClientIp,
} from "../../../../lib/security/rate-limit";

/** AUTH-10: one message for an unknown email and a wrong password alike. */
const INVALID_CREDENTIALS_ERROR = "E-mail ou senha inválidos";
const UNAVAILABLE_ERROR = "Serviço temporariamente indisponível";
const RATE_LIMITED_ERROR = "Muitas requisições";

/** Session cookie name (Firebase convention, matches the design). */
const SESSION_COOKIE = "__session";

function decodeEmailVerified(idToken: string): boolean {
  try {
    const segment = idToken.split(".")[1];
    if (!segment) return false;
    const payload = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    ) as { email_verified?: unknown };
    return payload.email_verified === true;
  } catch {
    return false;
  }
}

export type LoginDeps = {
  checkLoginBlock: typeof checkLoginBlock;
  checkRateLimit: typeof checkRateLimit;
  recordLoginFailure: typeof recordLoginFailure;
  resetLoginFailures: typeof resetLoginFailures;
  signInWithPassword: typeof signInWithPassword;
  createSession: typeof createSession;
  resolveClientIp: typeof resolveClientIp;
  isEmailVerified: (idToken: string) => boolean;
};

const defaultDeps: LoginDeps = {
  checkLoginBlock,
  checkRateLimit,
  recordLoginFailure,
  resetLoginFailures,
  signInWithPassword,
  createSession,
  resolveClientIp,
  isEmailVerified: decodeEmailVerified,
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

function redirect(
  path: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(null, {
    status: 303,
    headers: {
      // Relative Location (RFC 7231 §7.1.2): the browser resolves it against
      // the URL it actually requested. Building an absolute URL from
      // `request.url` would embed the internal `http://localhost:3000` the
      // Nginx proxy forwards to, and the browser's `form-action 'self'` CSP
      // then blocks the cross-origin navigation.
      location: path,
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function serializeSessionCookie(value: string): string {
  const o = sessionCookieOptions();
  return `${SESSION_COOKIE}=${value}; Max-Age=${o.maxAge}; Path=${o.path}; HttpOnly; Secure; SameSite=Strict`;
}

function invalidCredentials(): Response {
  return json(401, { error: INVALID_CREDENTIALS_ERROR });
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

export async function handleLogin(
  request: Request,
  deps: LoginDeps = defaultDeps,
): Promise<Response> {
  const ip = deps.resolveClientIp(request.headers);

  const block = await deps.checkLoginBlock(ip);
  if (block.blocked) {
    return json(
      429,
      { error: RATE_LIMITED_ERROR },
      { "retry-after": String(block.retryAfterSeconds ?? 60) },
    );
  }

  let limit;
  try {
    limit = await deps.checkRateLimit(ip, "auth");
  } catch (error) {
    console.error("[login] rate-limit store failure", error);
    return json(503, { error: UNAVAILABLE_ERROR });
  }
  if (!limit.allowed) {
    return json(
      429,
      { error: RATE_LIMITED_ERROR },
      { "retry-after": String(limit.retryAfterSeconds ?? 60) },
    );
  }

  const { email, password } = await readCredentials(request);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    await deps.recordLoginFailure(ip);
    return invalidCredentials();
  }

  const result = await deps.signInWithPassword(normalizedEmail, password);
  if (!result.ok) {
    if (result.reason === "unavailable") {
      console.error("[login] identity platform unavailable");
      return json(503, { error: UNAVAILABLE_ERROR });
    }
    await deps.recordLoginFailure(ip);
    return invalidCredentials();
  }

  await deps.resetLoginFailures(ip);

  if (!deps.isEmailVerified(result.idToken)) {
    return redirect("/verify-email");
  }

  const cookie = await deps.createSession(result.idToken);
  return redirect("/dashboard", {
    "set-cookie": serializeSessionCookie(cookie),
  });
}

