import { headers } from "next/headers";
import Link from "next/link";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Non-enumerating acknowledgement — matches the resend route's 200 body (AUTH-06). */
const RESENT_MESSAGE =
  "If that account exists and still needs verification, a new email is on its way";

/**
 * Verify-email screen (APP-03, AUTH-06). Explains the pending verification and
 * offers a resend posting to `/api/auth/resend-verification` — which re-checks
 * the password, so the form collects email + password. The CSRF token comes
 * from the `x-csrf-token` header; reading it forces dynamic rendering.
 */
export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const { resent } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent a verification link to your email address. Click it, then log
            in — the dashboard stays locked until your email is verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {resent ? (
            <Alert>
              <AlertTitle>{RESENT_MESSAGE}</AlertTitle>
            </Alert>
          ) : null}

          <form
            method="post"
            action="/api/auth/resend-verification"
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" variant="outline">
              Resend verification email
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Already verified?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Log in
        </Link>
      </p>
    </main>
  );
}
