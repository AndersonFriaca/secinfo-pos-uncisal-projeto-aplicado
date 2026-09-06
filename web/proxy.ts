/**
 * Edge-runtime security gate. Every matched request passes through here before
 * routing. Generates a per-request CSP nonce and applies the full OWASP
 * response-header set from `lib/security/headers.ts`.
 *
 * Edge runtime: no `firebase-admin`, no Firestore, no Node-only API (AD-005).
 * Session verification and rate limiting live in Route Handlers / Server
 * Components on the Node runtime.
 *
 * Requirements: SEC-08, SEC-09, SEC-12.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildSecurityHeaders } from "./lib/security/headers";

/** A fresh, unpredictable nonce per request (Next.js 16 CSP guide). */
function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";
  const securityHeaders = buildSecurityHeaders({ nonce, isDev });
  const csp = securityHeaders["Content-Security-Policy"];

  // Forward the nonce to the framework: `x-nonce` for Server Components and the
  // CSP on the request so Next extracts `'nonce-<value>'` for its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except Next's static output — and, unlike the Next.js sample,
     * `/api` is included: API routes need the Origin and CSRF checks (T10).
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
