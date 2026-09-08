/**
 * `POST /api/auth/logout` — revoke the session and clear the cookie.
 *
 * Revokes the refresh tokens for the session's uid (so a replayed cookie fails
 * `verifySessionCookie(..., true)` afterwards), clears the session cookie with
 * `Max-Age=0`, and returns 303 to `/`. Idempotent: a request with no valid
 * session still clears the cookie and returns 303, never a 500.
 *
 * Requirements: AUTH-15, AUTH-17.
 */

import { revokeSession, verifySession } from "../../../../lib/auth/session";

const SESSION_COOKIE = "__session";

export type LogoutDeps = {
  verifySession: typeof verifySession;
  revokeSession: typeof revokeSession;
};

const defaultDeps: LogoutDeps = { verifySession, revokeSession };

function readSessionCookie(request: Request): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      return trimmed.slice(SESSION_COOKIE.length + 1) || null;
    }
  }
  return null;
}

function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export async function handleLogout(
  request: Request,
  deps: LogoutDeps = defaultDeps,
): Promise<Response> {
  const cookie = readSessionCookie(request);
  if (cookie) {
    const claims = await deps.verifySession(cookie);
    if (claims?.uid) {
      try {
        await deps.revokeSession(claims.uid);
      } catch (error) {
        console.error("[logout] revoke failed", error);
      }
    }
  }

  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/", request.url).toString(),
      "set-cookie": clearedCookie(),
      "cache-control": "no-store",
    },
  });
}

