import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendVerificationEmail,
  signInWithPassword,
  signUp,
} from "./identity-platform";

const API_KEY = "test-api-key-1234";

type FetchCall = { url: string; body: unknown };

/** A fake `fetch` that records calls and returns a scripted response. */
function fakeFetch(
  status: number,
  payload: unknown,
): { impl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      status,
      json: async () => payload,
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.IDENTITY_PLATFORM_API_KEY = API_KEY;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  delete process.env.IDENTITY_PLATFORM_API_KEY;
});

describe("signUp (AUTH-01)", () => {
  it("POSTs to accounts:signUp with the key and the credential body", async () => {
    const { impl, calls } = fakeFetch(200, {
      idToken: "id-1",
      localId: "uid-1",
    });
    const result = await signUp("new@example.com", "Sup3rStr0ng!!", {
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: true, idToken: "id-1", localId: "uid-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    );
    expect(calls[0].body).toEqual({
      email: "new@example.com",
      password: "Sup3rStr0ng!!",
      returnSecureToken: true,
    });
  });

  it("collapses EMAIL_EXISTS (400) to the generic invalid result (AUTH-04)", async () => {
    const { impl } = fakeFetch(400, {
      error: { message: "EMAIL_EXISTS" },
    });
    const result = await signUp("dupe@example.com", "Sup3rStr0ng!!", {
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("signInWithPassword (AUTH-07, AUTH-10, AUTH-12)", () => {
  it("POSTs to accounts:signInWithPassword with returnSecureToken", async () => {
    const { impl, calls } = fakeFetch(200, {
      idToken: "id-2",
      localId: "uid-2",
    });
    const result = await signInWithPassword("u@example.com", "Sup3rStr0ng!!", {
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: true, idToken: "id-2", localId: "uid-2" });
    expect(calls[0].url).toBe(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    );
    expect(calls[0].body).toEqual({
      email: "u@example.com",
      password: "Sup3rStr0ng!!",
      returnSecureToken: true,
    });
  });

  it("produces a byte-identical generic result for EMAIL_NOT_FOUND and INVALID_PASSWORD", async () => {
    const unknownEmail = await signInWithPassword("nobody@example.com", "x", {
      fetchImpl: fakeFetch(400, { error: { message: "EMAIL_NOT_FOUND" } })
        .impl,
    });
    const wrongPassword = await signInWithPassword("u@example.com", "x", {
      fetchImpl: fakeFetch(400, { error: { message: "INVALID_PASSWORD" } })
        .impl,
    });
    expect(unknownEmail).toEqual({ ok: false, reason: "invalid" });
    expect(JSON.stringify(unknownEmail)).toBe(JSON.stringify(wrongPassword));
  });

  it("maps an upstream 500 to the distinct unavailable result", async () => {
    const { impl } = fakeFetch(503, "Service Unavailable");
    const result = await signInWithPassword("u@example.com", "pw", {
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("maps a missing API key to unavailable without calling fetch", async () => {
    delete process.env.IDENTITY_PLATFORM_API_KEY;
    const { impl, calls } = fakeFetch(200, {});
    const result = await signInWithPassword("u@example.com", "pw", {
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(calls).toHaveLength(0);
  });

  it("never leaks the API key in the result or a log line", async () => {
    const { impl } = fakeFetch(500, { error: { message: "INTERNAL" } });
    const result = await signInWithPassword("u@example.com", "pw", {
      fetchImpl: impl,
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    for (const call of errorSpy.mock.calls) {
      expect(call.join(" ")).not.toContain(API_KEY);
    }
  });
});

describe("sendVerificationEmail (AUTH-03)", () => {
  it("POSTs requestType VERIFY_EMAIL with the idToken to sendOobCode", async () => {
    const { impl, calls } = fakeFetch(200, { email: "u@example.com" });
    const result = await sendVerificationEmail("id-token-3", { fetchImpl: impl });
    expect(result).toEqual({ ok: true });
    expect(calls[0].url).toBe(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${API_KEY}`,
    );
    expect(calls[0].body).toEqual({
      requestType: "VERIFY_EMAIL",
      idToken: "id-token-3",
    });
  });

  it("maps an upstream 500 to unavailable", async () => {
    const { impl } = fakeFetch(500, {});
    const result = await sendVerificationEmail("id-token-3", { fetchImpl: impl });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});
