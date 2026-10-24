import { describe, expect, it, vi } from "vitest";
import { handleResendVerification, type ResendDeps } from "./handler";

function formRequest(cookie?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/auth/resend-verification", {
    method: "POST",
    headers,
    body: new URLSearchParams({ csrf_token: "tok" }).toString(),
  });
}

function deps(overrides: Partial<ResendDeps> = {}): ResendDeps {
  return {
    resolveClientIp: () => "203.0.113.20",
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    sendVerificationEmail: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("POST /api/auth/resend-verification (T16)", () => {
  it("verify cookie present → sends the verification email and redirects to /verify-email?resent=1", async () => {
    const d = deps();
    const res = await handleResendVerification(
      formRequest("other=1; __verify=id-token"),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/verify-email?resent=1");
    expect(d.sendVerificationEmail).toHaveBeenCalledWith("id-token");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rate-limited → 303 /error?reason=rate-limited and no Identity Platform call", async () => {
    const d = deps({
      checkRateLimit: vi.fn(async () => ({
        allowed: false,
        retryAfterSeconds: 60,
      })),
    });
    const res = await handleResendVerification(
      formRequest("__verify=id-token"),
      d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "/error?reason=rate-limited&retryAfter=60",
    );
    expect(d.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("missing cookie or rejected token → identical redirect (no enumeration)", async () => {
    const sent = await handleResendVerification(
      formRequest("__verify=id-token"),
      deps(),
    );
    const noCookieDeps = deps();
    const noCookie = await handleResendVerification(formRequest(), noCookieDeps);
    const rejected = await handleResendVerification(
      formRequest("__verify=expired"),
      deps({
        sendVerificationEmail: vi.fn(async () => ({
          ok: false as const,
          reason: "invalid" as const,
        })),
      }),
    );
    for (const res of [noCookie, rejected]) {
      expect(res.status).toBe(sent.status);
      expect(res.headers.get("location")).toBe(sent.headers.get("location"));
    }
    expect(noCookieDeps.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
