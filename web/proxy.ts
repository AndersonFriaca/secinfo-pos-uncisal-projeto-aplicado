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
import { verifyCsrfToken } from "./lib/security/csrf";

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
  const securityHeaders = buildSecurityHeaders({ nonce, isDev });
  const csp = securityHeaders["Content-Security-Policy"];

  const method = request.method.toUpperCase();
  const ownOrigin = request.nextUrl.origin;

  // Any /api/* request carrying a foreign Origin is rejected outright (SEC-13).
  const rawOrigin = request.headers.get("origin");
  if (
    request.nextUrl.pathname.startsWith("/api") &&
    rawOrigin &&
    rawOrigin !== ownOrigin
  ) {
    return forbidden(securityHeaders);
  }

  // State-changing methods: same-origin required, then a matching CSRF token.
  if (!SAFE_METHODS.has(method)) {
    if (requestOrigin(request) !== ownOrigin) {
      return forbidden(securityHeaders);
    }
    const submitted = await submittedCsrfToken(request);
    const cookie = request.cookies.get(CSRF_COOKIE)?.value ?? null;
    if (!verifyCsrfToken(submitted, cookie)) {
      return forbidden(securityHeaders);
    }
  }

  // Forward the nonce to the framework: `x-nonce` for Server Components and the
  // CSP on the request so Next extracts `'nonce-<value>'` for its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyHeaders(response, securityHeaders);
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
