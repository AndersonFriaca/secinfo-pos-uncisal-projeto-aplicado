import { describe, expect, it, vi } from "vitest";
import { handleSignup, type SignupDeps } from "./handler";

function formRequest(fields: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function deps(overrides: Partial<SignupDeps> = {}): SignupDeps {
  return {
    resolveClientIp: () => "203.0.113.5",
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    signUp: vi.fn(async () => ({
      ok: true as const,
      idToken: "id-1",
      localId: "uid-1",
    })),
    sendVerificationEmail: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

const STRONG = "Sup3rStr0ng!!";

describe("POST /api/auth/signup (T13, AUTH-18)", () => {
  it("valid submission → 303 to /verify-email and triggers the verification email", async () => {
    const d = deps();
    const res = await handleSignup(
      formRequest({ email: "New@Example.com", password: STRONG }),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/verify-email");
    expect(d.signUp).toHaveBeenCalledWith("new@example.com", STRONG);
    expect(d.sendVerificationEmail).toHaveBeenCalledWith("id-1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("__verify=id-1");
    expect(cookie).toContain("Path=/api/auth/resend-verification");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });

  it.each([
    ["short1!Aa"],
    ["ABCDEFG1234!"],
    ["abcdefg1234!"],
    ["Abcdefghij!!"],
    ["Abcdefghij12"],
  ])("weak password %s → redirect to /signup?error=invalid, no Identity Platform call", async (password) => {
    const d = deps();
    const res = await handleSignup(
      formRequest({ email: "user@example.com", password }),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/signup?error=invalid");
    expect(d.signUp).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("malformed email → redirect to /signup?error=invalid without calling Identity Platform", async () => {
    const d = deps();
    const res = await handleSignup(
      formRequest({ email: "not-an-email", password: STRONG }),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/signup?error=invalid");
    expect(d.signUp).not.toHaveBeenCalled();
  });

  it("duplicate email → same error=invalid redirect as any other upstream rejection (byte-identical, AUTH-04)", async () => {
    const dupe = await handleSignup(
      formRequest({ email: "dupe@example.com", password: STRONG }),
      deps({ signUp: vi.fn(async () => ({ ok: false as const, reason: "invalid" as const })) }),
    );
    const other = await handleSignup(
      formRequest({ email: "other@example.com", password: STRONG }),
      deps({ signUp: vi.fn(async () => ({ ok: false as const, reason: "invalid" as const })) }),
    );
    expect(dupe.status).toBe(303);
    expect(dupe.headers.get("location")).toBe("/signup?error=invalid");
    expect(await dupe.clone().text()).toBe(await other.clone().text());
    expect(dupe.headers.get("location")).toBe(other.headers.get("location"));
  });

  it("rate-limited → redirect to /signup?error=rate_limited, no validation or upstream call", async () => {
    const d = deps({
      checkRateLimit: vi.fn(async () => ({
        allowed: false,
        retryAfterSeconds: 60,
      })),
    });
    const res = await handleSignup(
      formRequest({ email: "user@example.com", password: STRONG }),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/signup?error=rate_limited");
    expect(d.signUp).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("Identity Platform unavailable → redirect to /signup?error=unavailable", async () => {
    const res = await handleSignup(
      formRequest({ email: "user@example.com", password: STRONG }),
      deps({
        signUp: vi.fn(async () => ({
          ok: false as const,
          reason: "unavailable" as const,
        })),
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/signup?error=unavailable");
  });
});
