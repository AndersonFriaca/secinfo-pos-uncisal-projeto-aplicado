/**
 * Edge-runtime security gate. Every matched request passes through here before
 * routing. It:
 *   1. rejects cross-origin and forged state-changing requests (403), then
 *   2. generates a per-request CSP nonce and applies the full OWASP
 *      response-header set from `lib/security/headers.ts`.
 *
 * Edge runtime: no `firebase-admin`, no Firestore, no Node-only API (AD-005).
 * Session verification and rate limiting live in Route Handlers / Server
 * Components on the Node runtime.
 *
 * Requirements: SEC-08, SEC-09, SEC-12, SEC-13, SEC-22, SEC-23.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildSecurityHeaders } from "./lib/security/headers";
import { generateCsrfToken, verifyCsrfToken } from "./lib/security/csrf";

/** Methods that never mutate state and so skip the CSRF check (SEC-23). */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Cookie and form-field / header names carrying the CSRF token (SEC-21). */
const CSRF_COOKIE = "csrf_token";
const CSRF_FIELD = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

/** A fresh, unpredictable nonce per request (Next.js 16 CSP guide). */
function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * The origin this request was actually made to, as the browser sees it.
 *
 * Behind the VM's Nginx the app is reached over HTTPS but proxied to plain
 * `http://localhost:3000`, so `request.nextUrl` can carry the wrong scheme (and
 * `localhost` host). Trust `X-Forwarded-Proto` / `X-Forwarded-Host` — set by our
 * own Nginx (`infra/scripts/startup.sh.tpl`) — when both are present, taking the
 * first value of any comma-joined list. Falls back to `nextUrl.origin` locally
 * and in tests, where there is no proxy.
 */
function ownOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.split(",")[0]?.trim();
  if (proto && host) {
    return `${proto}://${host}`;
  }
  return request.nextUrl.origin;
}

/** The request's `Origin`, or the origin of its `Referer` when `Origin` is absent. */
function requestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/** Read the submitted CSRF token from the `x-csrf-token` header or a form field. */
async function submittedCsrfToken(request: NextRequest): Promise<string | null> {
  const header = request.headers.get(CSRF_HEADER);
  if (header) return header;

  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      const value = (await request.clone().formData()).get(CSRF_FIELD);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

function forbidden(securityHeaders: Record<string, string>): NextResponse {
  const response = new NextResponse("Forbidden", { status: 403 });
  applyHeaders(response, securityHeaders);
  return response;
}

function applyHeaders(
  response: NextResponse,
  securityHeaders: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";
  // `/dashboard` carries authenticated content, so it gets `Cache-Control:
  // no-store` too (SEC-17); `/api/auth/*` responses set it themselves.
  const sensitive = request.nextUrl.pathname.startsWith("/dashboard");
  const securityHeaders = buildSecurityHeaders({ nonce, isDev, sensitive });
  const csp = securityHeaders["Content-Security-Policy"];

  const method = request.method.toUpperCase();
  const expectedOrigin = ownOrigin(request);

  // Any /api/* request carrying a foreign Origin is rejected outright (SEC-13).
  const rawOrigin = request.headers.get("origin");
  if (
    request.nextUrl.pathname.startsWith("/api") &&
    rawOrigin &&
    rawOrigin !== expectedOrigin
  ) {
    return forbidden(securityHeaders);
  }

  // State-changing methods: same-origin required, then a matching CSRF token.
  if (!SAFE_METHODS.has(method)) {
    if (requestOrigin(request) !== expectedOrigin) {
      return forbidden(securityHeaders);
    }
    const submitted = await submittedCsrfToken(request);
    const cookie = request.cookies.get(CSRF_COOKIE)?.value ?? null;
    if (!verifyCsrfToken(submitted, cookie)) {
      return forbidden(securityHeaders);
    }
  }

  // Seed a CSRF token on first contact so every server-rendered form has a value
  // to embed, and keep re-using it once set. `SameSite=Strict`, `Secure` (SEC-21,
  // SEC-24 — the token is fresh randomness, never derived from the request).
  const existingCsrf = request.cookies.get(CSRF_COOKIE)?.value ?? null;
  const csrfToken = existingCsrf ?? generateCsrfToken();

  // Forward the nonce to the framework: `x-nonce` for Server Components and the
  // CSP on the request so Next extracts `'nonce-<value>'` for its own scripts.
  // `x-csrf-token` exposes the current token to Server Components rendering forms.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(CSRF_HEADER, csrfToken);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyHeaders(response, securityHeaders);
  if (!existingCsrf) {
    response.cookies.set(CSRF_COOKIE, csrfToken, {
      sameSite: "strict",
      secure: true,
      path: "/",
      httpOnly: false,
    });
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except Next's static output — and, unlike the Next.js sample,
     * `/api` is included: API routes need the Origin and CSRF checks.
     * Prefetch requests are skipped; they don't need the CSP header.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
