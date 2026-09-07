import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleLogin, type LoginDeps } from "./route";

function formRequest(fields: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function deps(overrides: Partial<LoginDeps> = {}): LoginDeps {
  return {
    resolveClientIp: () => "203.0.113.9",
    checkLoginBlock: vi.fn(async () => ({ blocked: false })),
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    recordLoginFailure: vi.fn(async () => ({ blocked: false })),
    resetLoginFailures: vi.fn(async () => {}),
    signInWithPassword: vi.fn(async () => ({
      ok: true as const,
      idToken: "id-token",
      localId: "uid-1",
    })),
    createSession: vi.fn(async () => "SESSION_COOKIE_VALUE"),
    isEmailVerified: () => true,
    ...overrides,
  };
}

const CREDS = { email: "user@example.com", password: "Sup3rStr0ng!!" };

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("POST /api/auth/login (T14)", () => {
  it("valid credentials for a verified account → 303 /dashboard with the session cookie and every attribute", async () => {
    const d = deps();
    const res = await handleLogin(formRequest(CREDS), d);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("__session=SESSION_COOKIE_VALUE");
    expect(cookie).toContain("Max-Age=43200");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(d.resetLoginFailures).toHaveBeenCalledWith("203.0.113.9");
    expect(d.recordLoginFailure).not.toHaveBeenCalled();
  });

  it("invalid credentials → 401 generic message and the failure counter incremented", async () => {
    const d = deps({
      signInWithPassword: vi.fn(async () => ({
        ok: false as const,
        reason: "invalid" as const,
      })),
    });
    const res = await handleLogin(formRequest(CREDS), d);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("E-mail ou senha inválidos");
    expect(d.recordLoginFailure).toHaveBeenCalledWith("203.0.113.9");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("unknown email and wrong password produce byte-identical responses", async () => {
    const invalid = {
      signInWithPassword: vi.fn(async () => ({
        ok: false as const,
        reason: "invalid" as const,
      })),
    };
    const a = await handleLogin(
      formRequest({ email: "nobody@example.com", password: "whatever12A!" }),
      deps(invalid),
    );
    const b = await handleLogin(
      formRequest({ email: "user@example.com", password: "wrongPass1!AA" }),
      deps(invalid),
    );
    expect(a.status).toBe(b.status);
    expect(await a.clone().text()).toBe(await b.clone().text());
    expect(a.headers.get("set-cookie")).toBeNull();
    expect(b.headers.get("set-cookie")).toBeNull();
  });

  it("valid credentials but an unverified email → 303 /verify-email and no session cookie", async () => {
    const d = deps({ isEmailVerified: () => false });
    const res = await handleLogin(formRequest(CREDS), d);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/verify-email");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(d.createSession).not.toHaveBeenCalled();
  });

  it("blocked IP → 429 with Retry-After: 60 and Identity Platform is not called", async () => {
    const d = deps({
      checkLoginBlock: vi.fn(async () => ({
        blocked: true,
        retryAfterSeconds: 60,
      })),
    });
    const res = await handleLogin(formRequest(CREDS), d);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(d.signInWithPassword).not.toHaveBeenCalled();
  });

  it("Identity Platform 5xx → 503 generic body, upstream detail not in the response", async () => {
    const d = deps({
      signInWithPassword: vi.fn(async () => ({
        ok: false as const,
        reason: "unavailable" as const,
      })),
    });
    const res = await handleLogin(formRequest(CREDS), d);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Serviço temporariamente indisponível" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("rate-limit store failure → 503 generic body", async () => {
    const d = deps({
      checkRateLimit: vi.fn(async () => {
        throw new Error("firestore unavailable");
      }),
    });
    const res = await handleLogin(formRequest(CREDS), d);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Serviço temporariamente indisponível");
    expect(d.signInWithPassword).not.toHaveBeenCalled();
  });

  it("a successful login resets the failure counter", async () => {
    const d = deps();
    await handleLogin(formRequest(CREDS), d);
    expect(d.resetLoginFailures).toHaveBeenCalledWith("203.0.113.9");
  });
});
