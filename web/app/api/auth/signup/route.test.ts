import { describe, expect, it, vi } from "vitest";
import { handleSignup, type SignupDeps } from "./route";

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

describe("POST /api/auth/signup (T13)", () => {
  it("valid submission → 303 to /verify-email and triggers the verification email", async () => {
    const d = deps();
    const res = await handleSignup(
      formRequest({ email: "New@Example.com", password: STRONG }),
      d,
    );
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/verify-email");
    expect(d.signUp).toHaveBeenCalledWith("new@example.com", STRONG);
    expect(d.sendVerificationEmail).toHaveBeenCalledWith("id-1");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["short1!Aa", "length"],
    ["ABCDEFG1234!", "lowercase"],
    ["abcdefg1234!", "uppercase"],
    ["Abcdefghij!!", "digit"],
    ["Abcdefghij12", "symbol"],
  ])("weak password %s → 400 naming rule %s, no Identity Platform call", async (password, rule) => {
    const d = deps();
    const res = await handleSignup(
      formRequest({ email: "user@example.com", password }),
      d,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).rule).toBe(rule);
    expect(d.signUp).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("malformed email → 400 without calling Identity Platform", async () => {
    const d = deps();
    const res = await handleSignup(
      formRequest({ email: "not-an-email", password: STRONG }),
      d,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Enter a valid email address");
    expect(d.signUp).not.toHaveBeenCalled();
  });

  it("duplicate email → same generic 400 body as any other upstream rejection (byte-identical)", async () => {
    const dupe = await handleSignup(
      formRequest({ email: "dupe@example.com", password: STRONG }),
      deps({ signUp: vi.fn(async () => ({ ok: false as const, reason: "invalid" as const })) }),
    );
    const other = await handleSignup(
      formRequest({ email: "other@example.com", password: STRONG }),
      deps({ signUp: vi.fn(async () => ({ ok: false as const, reason: "invalid" as const })) }),
    );
    expect(dupe.status).toBe(400);
    expect(await dupe.clone().text()).toBe(await other.clone().text());
    expect((await dupe.json()).error).toBe(
      "Could not create the account with those details",
    );
  });

  it("rate-limited → 429 with Retry-After and no validation or upstream call", async () => {
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
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(d.signUp).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("Identity Platform unavailable → 503 generic body", async () => {
    const res = await handleSignup(
      formRequest({ email: "user@example.com", password: STRONG }),
      deps({
        signUp: vi.fn(async () => ({
          ok: false as const,
          reason: "unavailable" as const,
        })),
      }),
    );
    expect(res.status).toBe(503);
  });
});
