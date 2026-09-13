import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { generateCsrfToken } from "./lib/security/csrf";

const APP = "https://app.example";

function get(path = `${APP}/`) {
  return proxy(new NextRequest(new URL(path), { method: "GET" }));
}

type PostOptions = {
  path?: string;
  origin?: string | null;
  referer?: string | null;
  cookieToken?: string | null;
  headerToken?: string | null;
  method?: string;
};

function post(opts: PostOptions = {}) {
  const {
    path = `${APP}/api/auth/login`,
    origin = APP,
    referer = null,
    cookieToken = null,
    headerToken = null,
    method = "POST",
  } = opts;
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (referer) headers.set("referer", referer);
  if (cookieToken) headers.set("cookie", `csrf_token=${cookieToken}`);
  if (headerToken) headers.set("x-csrf-token", headerToken);
  return proxy(new NextRequest(new URL(path), { method, headers }));
}

function nonceFromCsp(csp: string | null): string {
  const match = csp?.match(/'nonce-([^']+)'/);
  if (!match) throw new Error(`no nonce in CSP: ${csp}`);
  return match[1];
}

describe("proxy — CSP nonce (SEC-08, SEC-09)", () => {
  it("emits a CSP with a nonce and strict script-src, no unsafe-*", async () => {
    const csp = (await get()).headers.get("content-security-policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("generates a fresh nonce for each request", async () => {
    const first = nonceFromCsp((await get()).headers.get("content-security-policy"));
    const second = nonceFromCsp((await get()).headers.get("content-security-policy"));
    expect(first).not.toBe(second);
  });

  it("forwards the same nonce to the request as x-nonce", async () => {
    const response = await get();
    const csp = response.headers.get("content-security-policy");
    const forwarded = response.headers.get("x-middleware-request-x-nonce");
    expect(forwarded).toBe(nonceFromCsp(csp));
  });
});

describe("proxy — OWASP header set (SEC-12)", () => {
  it("sets every security header by value", async () => {
    const h = (await get()).headers;
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

  it("never emits ACAO, X-Powered-By, Expect-CT, or Public-Key-Pins", async () => {
    const h = (await get()).headers;
    expect(h.get("access-control-allow-origin")).toBeNull();
    expect(h.get("x-powered-by")).toBeNull();
    expect(h.get("expect-ct")).toBeNull();
    expect(h.get("public-key-pins")).toBeNull();
  });
});

describe("proxy — CSRF token cookie attributes (SEC-21)", () => {
  it("seeds csrf_token as a Secure, SameSite=Strict, Path=/ cookie on first contact", async () => {
    const res = await get(`${APP}/`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/(^|,\s*)csrf_token=[A-Za-z0-9_-]+/);
    expect(setCookie).toContain("Secure");
    expect(setCookie).toMatch(/SameSite=strict/i);
    expect(setCookie).toContain("Path=/");
    // Design: the token cookie is deliberately not HttpOnly so a server-rendered
    // form can be re-hydrated client-side; the CSRF control is SameSite=Strict +
    // Secure + the Origin/Referer check, not cookie opacity.
    expect(setCookie).not.toContain("HttpOnly");

    const seeded = res.cookies.get("csrf_token");
    expect(seeded?.value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(seeded?.secure).toBe(true);
    expect(seeded?.sameSite).toBe("strict");
    expect(seeded?.path).toBe("/");
    expect(seeded?.httpOnly).toBeFalsy();
  });

  it("does not reseed csrf_token when the request already carries one", async () => {
    const existing = generateCsrfToken();
    const res = await proxy(
      new NextRequest(new URL(`${APP}/`), {
        method: "GET",
        headers: { cookie: `csrf_token=${existing}` },
      }),
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("proxy — no-store on sensitive paths (SEC-17)", () => {
  it("sets Cache-Control: no-store on a /dashboard response", async () => {
    const res = await get(`${APP}/dashboard`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("does not set Cache-Control on a non-sensitive path", async () => {
    const res = await get(`${APP}/`);
    expect(res.headers.get("cache-control")).toBeNull();
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

describe("proxy — same-origin + CSRF on state-changing requests (SEC-13, SEC-22, SEC-23)", () => {
  it("passes a same-origin POST with a matching token", async () => {
    const token = generateCsrfToken();
    const res = await post({ cookieToken: token, headerToken: token });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("'nonce-");
  });

  it("passes when Origin is absent but Referer matches the app origin", async () => {
    const token = generateCsrfToken();
    const res = await post({
      origin: null,
      referer: `${APP}/login`,
      cookieToken: token,
      headerToken: token,
    });
    expect(res.status).toBe(200);
  });

  it("rejects a foreign Origin with 403 even when the token matches", async () => {
    const token = generateCsrfToken();
    const res = await post({
      origin: "https://evil.example",
      cookieToken: token,
      headerToken: token,
    });
    expect(res.status).toBe(403);
  });

  it("treats X-Forwarded-Proto/Host as the real origin behind a proxy", async () => {
    const token = generateCsrfToken();
    const headers = new Headers({
      // nextUrl of this request is http://internal:3000, but the browser hit
      // https://app.example through Nginx.
      origin: "https://app.example",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "app.example",
      cookie: `csrf_token=${token}`,
      "x-csrf-token": token,
    });
    const res = await proxy(
      new NextRequest(new URL("http://internal:3000/api/auth/login"), {
        method: "POST",
        headers,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("still rejects a foreign Origin when forwarded headers are set", async () => {
    const token = generateCsrfToken();
    const headers = new Headers({
      origin: "https://evil.example",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "app.example",
      cookie: `csrf_token=${token}`,
      "x-csrf-token": token,
    });
    const res = await proxy(
      new NextRequest(new URL("http://internal:3000/api/auth/login"), {
        method: "POST",
        headers,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a state-changing request with no token (403)", async () => {
    const res = await post({ cookieToken: null, headerToken: null });
    expect(res.status).toBe(403);
  });

  it("rejects when only the cookie token is present and none is submitted", async () => {
    const res = await post({ cookieToken: generateCsrfToken() });
    expect(res.status).toBe(403);
  });

  it("rejects a mismatched token (403)", async () => {
    const res = await post({
      cookieToken: generateCsrfToken(),
      headerToken: generateCsrfToken(),
    });
    expect(res.status).toBe(403);
  });

  it("accepts the token from a hidden form field", async () => {
    const token = generateCsrfToken();
    const body = new URLSearchParams({ csrf_token: token, email: "a@b.co" });
    const res = await proxy(
      new NextRequest(new URL(`${APP}/api/auth/login`), {
        method: "POST",
        headers: {
          origin: APP,
          cookie: `csrf_token=${token}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("applies the same Origin + CSRF gate to DELETE", async () => {
    const token = generateCsrfToken();
    expect((await post({ method: "DELETE", cookieToken: token })).status).toBe(
      403,
    );
    expect(
      (
        await post({ method: "DELETE", cookieToken: token, headerToken: token })
      ).status,
    ).toBe(200);
  });

  it("does not apply the CSRF check to GET (no token needed)", async () => {
    const res = await get(`${APP}/dashboard`);
    expect(res.status).toBe(200);
  });

  it("rejects any /api GET carrying a foreign Origin with 403", async () => {
    const res = await proxy(
      new NextRequest(new URL(`${APP}/api/auth/login`), {
        method: "GET",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("emits no Access-Control-Allow-Origin on a 403 response", async () => {
    const res = await post({ origin: "https://evil.example" });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
