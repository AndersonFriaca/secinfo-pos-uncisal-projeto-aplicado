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

/** Generic, non-enumerating message — matches the route's 400 body (AUTH-04). */
const GENERIC_ERROR = "Could not create the account with those details";

const PASSWORD_RULES = [
  "At least 12 characters",
  "One lowercase and one uppercase letter",
  "One digit",
  "One symbol",
];

/**
 * Signup screen (APP-03, AUTH-01). A shadcn form posting to `/api/auth/signup`
 * with the CSRF token from the `x-csrf-token` header, stating the password rules
 * up front. Reading the header forces dynamic rendering for the CSP nonce.
 */
export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            You will get a verification email before the dashboard unlocks.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{GENERIC_ERROR}</AlertTitle>
            </Alert>
          ) : null}

          <form
            method="post"
            action="/api/auth/signup"
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
                autoComplete="new-password"
                minLength={12}
                required
              />
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
            <Button type="submit">Create account</Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Log in
        </Link>
      </p>
    </main>
  );
}
