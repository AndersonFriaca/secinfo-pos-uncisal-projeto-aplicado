import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getSessionState } from "@/lib/auth/session";
import { dashboardRedirect } from "@/lib/dashboard-guard";

const SESSION_COOKIE = "__session";

/**
 * Protected dashboard (AUTH-06, AUTH-13, AUTH-14, AUTH-16, SEC-17).
 *
 * `getSessionState` runs on every request (reading `cookies()` forces dynamic
 * rendering — no cached client flag). An authenticated-but-unverified session
 * is sent to `/verify-email` (AUTH-06); a missing, expired, or revoked session
 * is sent to `/login`. `proxy.ts` adds `Cache-Control: no-store` for
 * `/dashboard`.
 */
export default async function DashboardPage() {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const state = await getSessionState(sessionCookie);

  // SPEC_DEVIATION: Next's redirect() issues 307, the spec names 303.
  // Reason: a page render cannot set the redirect status; both are a GET
  // navigation and the guard's branches are unit-tested in session.test.ts.
  const target = dashboardRedirect(state);
  if (target) {
    redirect(target);
  }
  if (state.status !== "authenticated") {
    redirect("/login");
  }

  const user = state.user;

  return (
    <DashboardShell
      email={user.email ?? user.uid}
      csrfToken={csrfToken}
    />
  );
}
