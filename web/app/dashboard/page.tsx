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
import { getAuthenticatedUser } from "@/lib/auth/session";

const SESSION_COOKIE = "__session";

/**
 * Protected dashboard (AUTH-13, AUTH-14, AUTH-16, SEC-17).
 *
 * `getAuthenticatedUser` runs on every request (reading `cookies()` forces
 * dynamic rendering — no cached client flag); it returns null for a missing,
 * expired, revoked, or unverified-email session, and the page redirects to
 * `/login`. `proxy.ts` adds `Cache-Control: no-store` for `/dashboard`.
 */
export default async function DashboardPage() {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const user = await getAuthenticatedUser(sessionCookie);

  if (!user) {
    // SPEC_DEVIATION: Next's redirect() issues 307, the spec names 303.
    // Reason: a page render cannot set the redirect status; both are a GET
    // navigation to /login and the guard's branches are unit-tested in T12.
    redirect("/login");
  }

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
