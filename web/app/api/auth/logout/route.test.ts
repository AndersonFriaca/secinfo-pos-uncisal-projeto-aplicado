import { describe, expect, it, vi } from "vitest";
import { handleLogout, type LogoutDeps } from "./route";
import type { SessionClaims } from "../../../../lib/auth/session";

function request(cookie?: string): Request {
  return new Request("http://localhost/api/auth/logout", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

/** Fake session store: a revoked uid makes verifySession return null. */
function fakeDeps(claimsByCookie: Record<string, SessionClaims> = {}): LogoutDeps {
  const revoked = new Set<string>();
  return {
    revokeSession: vi.fn(async (uid: string) => {
      revoked.add(uid);
    }),
    verifySession: vi.fn(async (cookie?: string | null) => {
      if (!cookie) return null;
      const claims = claimsByCookie[cookie];
      if (!claims || (claims.uid && revoked.has(claims.uid))) return null;
      return claims;
    }),
  };
}

describe("POST /api/auth/logout (T15)", () => {
  it("authenticated logout revokes the uid, clears the cookie, and 303s to /", async () => {
    const d = fakeDeps({ "good-cookie": { uid: "u1", email_verified: true } });
    const res = await handleLogout(request("__session=good-cookie"), d);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    expect(d.revokeSession).toHaveBeenCalledWith("u1");
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("__session=;");
    expect(setCookie).toContain("Max-Age=0");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("a replayed cookie fails verification once the session is revoked", async () => {
    const d = fakeDeps({ "good-cookie": { uid: "u1", email_verified: true } });
    await handleLogout(request("__session=good-cookie"), d);
    expect(await d.verifySession("good-cookie")).toBeNull();
  });

  it("logout with no cookie still clears the cookie and 303s (idempotent)", async () => {
    const d = fakeDeps();
    const res = await handleLogout(request(), d);
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(d.revokeSession).not.toHaveBeenCalled();
  });

  it("logout with an already-invalid cookie 303s without revoking and without a 500", async () => {
    const d = fakeDeps();
    const res = await handleLogout(request("__session=stale-cookie"), d);
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(d.revokeSession).not.toHaveBeenCalled();
  });
});
