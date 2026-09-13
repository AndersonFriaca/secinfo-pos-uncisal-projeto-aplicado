import { describe, expect, it, vi } from "vitest";
import { handleForgotPassword, type ForgotPasswordDeps } from "./handler";

function formRequest(fields: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function deps(overrides: Partial<ForgotPasswordDeps> = {}): ForgotPasswordDeps {
  return {
    resolveClientIp: () => "203.0.113.5",
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    sendPasswordResetEmail: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("POST /api/auth/forgot-password (AUTH-20, AUTH-21, AUTH-22)", () => {
  it("valid email → sendPasswordResetEmail called with the normalized email, 303 to ?sent=1", async () => {
    const d = deps();
    const res = await handleForgotPassword(
      formRequest({ email: "User@Example.com" }),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/forgot-password?sent=1");
    expect(d.sendPasswordResetEmail).toHaveBeenCalledWith("user@example.com");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("unregistered email → same ?sent=1 redirect as a registered one (byte-identical, no enumeration)", async () => {
    const registered = await handleForgotPassword(
      formRequest({ email: "registered@example.com" }),
      deps({ sendPasswordResetEmail: vi.fn(async () => ({ ok: true as const })) }),
    );
    const unregistered = await handleForgotPassword(
      formRequest({ email: "unregistered@example.com" }),
      deps({
        sendPasswordResetEmail: vi.fn(async () => ({
          ok: false as const,
          reason: "invalid" as const,
        })),
      }),
    );
    expect(registered.status).toBe(unregistered.status);
    expect(registered.headers.get("location")).toBe(
      unregistered.headers.get("location"),
    );
    expect(await registered.clone().text()).toBe(
      await unregistered.clone().text(),
    );
  });

  it("empty email → redirect to ?error=invalid without calling Identity Platform", async () => {
    const d = deps();
    const res = await handleForgotPassword(formRequest({ email: "" }), d);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/forgot-password?error=invalid");
    expect(d.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("malformed email → redirect to ?error=invalid without calling Identity Platform", async () => {
    const d = deps();
    const res = await handleForgotPassword(
      formRequest({ email: "not-an-email" }),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/forgot-password?error=invalid");
    expect(d.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("rate-limited → redirect to ?error=rate_limited, no validation or upstream call", async () => {
    const d = deps({
      checkRateLimit: vi.fn(async () => ({
        allowed: false,
        retryAfterSeconds: 60,
      })),
    });
    const res = await handleForgotPassword(
      formRequest({ email: "user@example.com" }),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "/forgot-password?error=rate_limited",
    );
    expect(d.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
