import { describe, expect, it, vi } from "vitest";
import { handleResendVerification, type ResendDeps } from "./handler";

function formRequest(fields: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/resend-verification", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function deps(overrides: Partial<ResendDeps> = {}): ResendDeps {
  return {
    resolveClientIp: () => "203.0.113.20",
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    signInWithPassword: vi.fn(async () => ({
      ok: true as const,
      idToken: "id-token",
      localId: "uid-1",
    })),
    sendVerificationEmail: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

const CREDS = { email: "user@example.com", password: "Sup3rStr0ng!!" };

describe("POST /api/auth/resend-verification (T16)", () => {
  it("valid credentials → sends the verification email and returns the generic ack", async () => {
    const d = deps();
    const res = await handleResendVerification(formRequest(CREDS), d);
    expect(res.status).toBe(200);
    expect(d.signInWithPassword).toHaveBeenCalledWith(
      "user@example.com",
      "Sup3rStr0ng!!",
    );
    expect(d.sendVerificationEmail).toHaveBeenCalledWith("id-token");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rate-limited → 429 with Retry-After and no Identity Platform call", async () => {
    const d = deps({
      checkRateLimit: vi.fn(async () => ({
        allowed: false,
        retryAfterSeconds: 60,
      })),
    });
    const res = await handleResendVerification(formRequest(CREDS), d);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(d.signInWithPassword).not.toHaveBeenCalled();
  });

  it("unknown address → identical ack, no email sent (no enumeration)", async () => {
    const known = await handleResendVerification(formRequest(CREDS), deps());
    const unknownDeps = deps({
      signInWithPassword: vi.fn(async () => ({
        ok: false as const,
        reason: "invalid" as const,
      })),
    });
    const unknown = await handleResendVerification(
      formRequest({ email: "nobody@example.com", password: "whatever12A!" }),
      unknownDeps,
    );
    expect(unknown.status).toBe(known.status);
    expect(await unknown.clone().text()).toBe(await known.clone().text());
    expect(unknownDeps.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
