import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

function get(path = "https://app.example/") {
  return proxy(new NextRequest(new URL(path), { method: "GET" }));
}

function nonceFromCsp(csp: string | null): string {
  const match = csp?.match(/'nonce-([^']+)'/);
  if (!match) throw new Error(`no nonce in CSP: ${csp}`);
  return match[1];
}

describe("proxy — CSP nonce (SEC-08, SEC-09)", () => {
  it("emits a CSP with a nonce and strict script-src, no unsafe-*", () => {
    const csp = get().headers.get("content-security-policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("generates a fresh nonce for each request", () => {
    const first = nonceFromCsp(get().headers.get("content-security-policy"));
    const second = nonceFromCsp(get().headers.get("content-security-policy"));
    expect(first).not.toBe(second);
  });

  it("forwards the same nonce to the request as x-nonce", () => {
    const response = get();
    const csp = response.headers.get("content-security-policy");
    const forwarded = response.headers.get("x-middleware-request-x-nonce");
    expect(forwarded).toBe(nonceFromCsp(csp));
  });
});

describe("proxy — OWASP header set (SEC-12)", () => {
  it("sets every security header by value", () => {
    const h = get().headers;
    expect(h.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("x-xss-protection")).toBe("0");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("permissions-policy")).toBe(
      "geolocation=(), camera=(), microphone=()",
    );
    expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(h.get("cross-origin-embedder-policy")).toBe("require-corp");
    expect(h.get("cross-origin-resource-policy")).toBe("same-site");
  });

  it("never emits ACAO, X-Powered-By, Expect-CT, or Public-Key-Pins", () => {
    const h = get().headers;
    expect(h.get("access-control-allow-origin")).toBeNull();
    expect(h.get("x-powered-by")).toBeNull();
    expect(h.get("expect-ct")).toBeNull();
    expect(h.get("public-key-pins")).toBeNull();
  });
});

describe("proxy — matcher config", () => {
  it("excludes Next static output and includes /api", () => {
    const source = (config.matcher[0] as { source: string }).source;
    expect(source).toContain("_next/static");
    expect(source).toContain("_next/image");
    expect(source).toContain("favicon.ico");
    expect(source).not.toContain("api");
  });
});
