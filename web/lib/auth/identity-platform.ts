/**
 * The only module that talks to Google Identity Platform.
 *
 * It resolves the API key in one place and collapses every upstream error into
 * a safe, generic result so a caller cannot use the response to enumerate
 * accounts. The key never appears in a thrown error, a log line, or a returned
 * value.
 *
 * Key resolution order (first hit wins, then cached for the process):
 *   1. `IDENTITY_PLATFORM_API_KEY` env var — used for local dev.
 *   2. Secret Manager secret `identity-platform-api-key` in the project named
 *      by `GOOGLE_CLOUD_PROJECT`, read with the ambient service-account
 *      credentials (infra/secrets.tf grants the VM's SA read access).
 *
 * Requirements: AUTH-01, AUTH-03, AUTH-04, AUTH-07, AUTH-10, AUTH-12.
 */

import { accessSecretVersion } from "../gcp/secret";

const ACCOUNTS_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts";

const API_KEY_SECRET_ID = "identity-platform-api-key";

type FetchImpl = typeof fetch;

/** Optional injection point so tests need no real network or credentials. */
export type IdentityCallOptions = { fetchImpl?: FetchImpl };

/**
 * `invalid`   — the request was well-formed but rejected (bad credentials,
 *               duplicate email, unknown email). One value for every 400 so the
 *               caller cannot tell the cases apart (AUTH-04, AUTH-10).
 * `unavailable`— Identity Platform is unreachable, returned 5xx, or the API key
 *               is not configured. Maps to HTTP 503 at the route (AUTH-12).
 */
export type IdentityFailure = { ok: false; reason: "invalid" | "unavailable" };

export type AuthSuccess = { ok: true; idToken: string; localId: string };
export type AuthResult = AuthSuccess | IdentityFailure;
export type SendEmailResult = { ok: true } | IdentityFailure;

let cachedApiKey: string | undefined;

/** Test-only: drop the resolved-key cache between cases. */
export function __resetApiKeyCache(): void {
  cachedApiKey = undefined;
}

async function resolveApiKey(): Promise<string | null> {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  const fromEnv = process.env.IDENTITY_PLATFORM_API_KEY?.trim();
  if (fromEnv) {
    cachedApiKey = fromEnv;
    return fromEnv;
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    return null;
  }

  const fromSecret = (
    await accessSecretVersion(project, API_KEY_SECRET_ID)
  )?.trim();
  if (fromSecret) {
    cachedApiKey = fromSecret;
    return fromSecret;
  }
  return null;
}

function unavailable(method: string, detail: string): IdentityFailure {
  // Server-side only, and never includes the API key or the request URL.
  console.error(`[identity-platform] ${method}: ${detail}`);
  return { ok: false, reason: "unavailable" };
}

async function callIdentityPlatform(
  method: "signUp" | "signInWithPassword" | "sendOobCode",
  body: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<{ status: number; body: unknown } | IdentityFailure> {
  let key: string | null;
  try {
    key = await resolveApiKey();
  } catch {
    // A Secret Manager auth/permission/transport failure must not surface —
    // the error object could carry the secret resource name or a token.
    return unavailable(method, "API key not configured");
  }
  if (!key) {
    return unavailable(method, "API key not configured");
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `${ACCOUNTS_ENDPOINT}:${method}?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch {
    // Never rethrow: an upstream error object could carry the request URL.
    return unavailable(method, "request failed");
  }

  if (response.status >= 500) {
    return unavailable(method, `upstream ${response.status}`);
  }

  const parsed = await response.json().catch(() => null);
  return { status: response.status, body: parsed };
}

async function authCall(
  method: "signUp" | "signInWithPassword",
  email: string,
  password: string,
  opts: IdentityCallOptions,
): Promise<AuthResult> {
  const result = await callIdentityPlatform(
    method,
    { email, password, returnSecureToken: true },
    opts.fetchImpl ?? fetch,
  );
  if ("ok" in result) {
    return result;
  }
  if (result.status !== 200) {
    return { ok: false, reason: "invalid" };
  }
  const data = result.body as { idToken?: unknown; localId?: unknown } | null;
  if (
    !data ||
    typeof data.idToken !== "string" ||
    typeof data.localId !== "string"
  ) {
    return unavailable(method, "malformed success payload");
  }
  return { ok: true, idToken: data.idToken, localId: data.localId };
}

/** Create an account (`accounts:signUp`). */
export function signUp(
  email: string,
  password: string,
  opts: IdentityCallOptions = {},
): Promise<AuthResult> {
  return authCall("signUp", email, password, opts);
}

/** Exchange credentials for tokens (`accounts:signInWithPassword`). */
export function signInWithPassword(
  email: string,
  password: string,
  opts: IdentityCallOptions = {},
): Promise<AuthResult> {
  return authCall("signInWithPassword", email, password, opts);
}

/**
 * Ask Identity Platform to send its own verification email
 * (`accounts:sendOobCode`, `requestType=VERIFY_EMAIL`). No SMTP dependency.
 */
export async function sendVerificationEmail(
  idToken: string,
  opts: IdentityCallOptions = {},
): Promise<SendEmailResult> {
  const result = await callIdentityPlatform(
    "sendOobCode",
    { requestType: "VERIFY_EMAIL", idToken },
    opts.fetchImpl ?? fetch,
  );
  if ("ok" in result) {
    return result;
  }
  if (result.status !== 200) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}
