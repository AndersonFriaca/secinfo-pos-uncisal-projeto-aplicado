import { describe, expect, it } from "vitest";
import {
  createSession,
  getAuthenticatedUser,
  revokeSession,
  sessionCookieOptions,
  verifySession,
  type SessionAuth,
  type SessionClaims,
} from "./session";

/** Injectable Admin SDK double. */
class FakeAuth implements SessionAuth {
  verifyCalls: Array<{ cookie: string; checkRevoked: boolean }> = [];
  createCalls: Array<{ idToken: string; expiresIn: number }> = [];
  revoked: string[] = [];
  constructor(
    private readonly claimsByCookie: Record<string, SessionClaims> = {},
    private readonly throwFor: Set<string> = new Set(),
  ) {}

  async createSessionCookie(idToken: string, options: { expiresIn: number }) {
    this.createCalls.push({ idToken, expiresIn: options.expiresIn });
    return `session-for-${idToken}`;
  }

  async verifySessionCookie(cookie: string, checkRevoked: boolean) {
    this.verifyCalls.push({ cookie, checkRevoked });
    if (this.throwFor.has(cookie)) {
      throw new Error(`rejected: ${cookie}`);
    }
    return this.claimsByCookie[cookie];
  }

  async revokeRefreshTokens(uid: string) {
    this.revoked.push(uid);
  }
}

describe("sessionCookieOptions (AUTH-08)", () => {
  it("sets every attribute by value", () => {
    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 43_200,
    });
  });
});

describe("createSession (AUTH-08)", () => {
  it("mints a session cookie with a 12-hour expiry", async () => {
    const auth = new FakeAuth();
    const cookie = await createSession("id-token-1", { auth });
    expect(cookie).toBe("session-for-id-token-1");
    expect(auth.createCalls).toEqual([
      { idToken: "id-token-1", expiresIn: 43_200 * 1000 },
    ]);
  });
});

describe("verifySession (AUTH-14)", () => {
  it("passes checkRevoked: true to verifySessionCookie", async () => {
    const auth = new FakeAuth({ good: { uid: "u1", email_verified: true } });
    await verifySession("good", { auth });
    expect(auth.verifyCalls).toEqual([{ cookie: "good", checkRevoked: true }]);
  });

  it("returns null instead of throwing when verification fails", async () => {
    const auth = new FakeAuth({}, new Set(["revoked"]));
    expect(await verifySession("revoked", { auth })).toBeNull();
  });

  it("returns null for a missing cookie without calling the Admin SDK", async () => {
    const auth = new FakeAuth();
    expect(await verifySession(null, { auth })).toBeNull();
    expect(auth.verifyCalls).toHaveLength(0);
  });
});

describe("revokeSession (AUTH-17)", () => {
  it("revokes refresh tokens for the uid", async () => {
    const auth = new FakeAuth();
    await revokeSession("uid-9", { auth });
    expect(auth.revoked).toEqual(["uid-9"]);
  });
});

describe("getAuthenticatedUser (AUTH-13, AUTH-16)", () => {
  const verified: SessionClaims = {
    uid: "u1",
    email: "u1@example.com",
    email_verified: true,
  };

  it("returns the user when the cookie verifies and the email is verified", async () => {
    const auth = new FakeAuth({ ok: verified });
    expect(await getAuthenticatedUser("ok", { auth })).toEqual({
      uid: "u1",
      email: "u1@example.com",
    });
  });

  it("returns null for a missing cookie", async () => {
    const auth = new FakeAuth();
    expect(await getAuthenticatedUser(null, { auth })).toBeNull();
  });

  it("returns null for an invalid cookie", async () => {
    const auth = new FakeAuth({}, new Set(["bad"]));
    expect(await getAuthenticatedUser("bad", { auth })).toBeNull();
  });

  it("returns null for a revoked session", async () => {
    const auth = new FakeAuth({}, new Set(["revoked"]));
    expect(await getAuthenticatedUser("revoked", { auth })).toBeNull();
    expect(auth.verifyCalls[0].checkRevoked).toBe(true);
  });

  it("returns null when the email is unverified", async () => {
    const auth = new FakeAuth({
      pending: { uid: "u2", email: "u2@example.com", email_verified: false },
    });
    expect(await getAuthenticatedUser("pending", { auth })).toBeNull();
  });
});
