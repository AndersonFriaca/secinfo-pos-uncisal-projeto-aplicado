import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>You are signed in.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            Signed in as{" "}
            <span className="font-medium">{user.email ?? user.uid}</span>
          </p>
          <form
            method="post"
            action="/api/auth/logout"
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <Button type="submit" variant="outline">
              Log out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
