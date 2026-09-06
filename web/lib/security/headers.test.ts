import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "./headers";

const prod = buildSecurityHeaders({ nonce: "NONCE123", isDev: false });
const dev = buildSecurityHeaders({ nonce: "NONCE123", isDev: true });
const sensitive = buildSecurityHeaders({
  nonce: "NONCE123",
  isDev: false,
  sensitive: true,
});

describe("buildSecurityHeaders — CSP (SEC-08, SEC-09)", () => {
  const csp = prod["Content-Security-Policy"];

  it("sets default-src 'self'", () => {
    expect(csp).toContain("default-src 'self'");
  });

  it("sets script-src with the nonce and strict-dynamic, no unsafe-* in production", () => {
    expect(csp).toContain(
      "script-src 'self' 'nonce-NONCE123' 'strict-dynamic'",
    );
  });

  it("sets object-src 'none'", () => {
    expect(csp).toContain("object-src 'none'");
  });

  it("sets base-uri 'self'", () => {
    expect(csp).toContain("base-uri 'self'");
  });

  it("sets form-action 'self'", () => {
    expect(csp).toContain("form-action 'self'");
  });

  it("sets frame-ancestors 'none'", () => {
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sets upgrade-insecure-requests", () => {
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("production CSP contains neither 'unsafe-inline' nor 'unsafe-eval'", () => {
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("isDev adds 'unsafe-eval' only, still no 'unsafe-inline'", () => {
    const devCsp = dev["Content-Security-Policy"];
    expect(devCsp).toContain("'unsafe-eval'");
    expect(devCsp).not.toContain("'unsafe-inline'");
  });
});

describe("buildSecurityHeaders — static headers by value (SEC-10, SEC-11, SEC-13..SEC-18, SEC-20)", () => {
  it.each([
    ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["X-XSS-Protection", "0"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "geolocation=(), camera=(), microphone=()"],
    ["Cross-Origin-Opener-Policy", "same-origin"],
    ["Cross-Origin-Embedder-Policy", "require-corp"],
    ["Cross-Origin-Resource-Policy", "same-site"],
  ])("sets %s to its OWASP value", (header, value) => {
    expect(prod[header]).toBe(value);
  });
});

describe("buildSecurityHeaders — sensitive responses (SEC-17)", () => {
  it("adds Cache-Control: no-store when sensitive", () => {
    expect(sensitive["Cache-Control"]).toBe("no-store");
  });

  it("omits Cache-Control when not sensitive", () => {
    expect(prod["Cache-Control"]).toBeUndefined();
  });
});

describe("buildSecurityHeaders — forbidden headers (SEC-19, SEC-20)", () => {
  it.each(["Access-Control-Allow-Origin", "Expect-CT", "Public-Key-Pins", "X-Powered-By"])(
    "never emits %s",
    (header) => {
      expect(prod[header]).toBeUndefined();
      expect(dev[header]).toBeUndefined();
      expect(sensitive[header]).toBeUndefined();
    },
  );
});
