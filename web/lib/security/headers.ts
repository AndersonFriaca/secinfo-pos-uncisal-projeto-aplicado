/**
 * The full OWASP HTTP-headers response set, as one pure function so every
 * value is unit-testable without booting a server.
 *
 * Values follow the OWASP HTTP Headers Cheat Sheet.
 * Requirements: SEC-08..SEC-11, SEC-13..SEC-20.
 */

export type SecurityHeaderOptions = {
  /** Per-request CSP nonce (base64url). */
  nonce: string;
  /** Development mode relaxes `script-src` with `'unsafe-eval'` only. */
  isDev: boolean;
  /** Credential-bearing responses also get `Cache-Control: no-store`. */
  sensitive?: boolean;
};

function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "script-src",
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
  ];
  if (isDev) {
    // React's dev tooling needs eval; production never does.
    scriptSrc.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    scriptSrc.join(" "),
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Build the complete security-header set for a response.
 * Never emits `Access-Control-Allow-Origin`, `Expect-CT`, `Public-Key-Pins`,
 * or `X-Powered-By`.
 */
export function buildSecurityHeaders(
  opts: SecurityHeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(
      opts.nonce,
      opts.isDev,
    ),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-site",
  };

  if (opts.sensitive) {
    headers["Cache-Control"] = "no-store";
  }

  return headers;
}
