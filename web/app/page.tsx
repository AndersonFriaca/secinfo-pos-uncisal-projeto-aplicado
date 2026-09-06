import { connection } from "next/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SESSION_COOKIE = "__session";

const FEATURES = [
  "Server-only Firebase auth — no credentials ever reach the browser",
  "Email-verified signup, session-cookie login, server-verified dashboard",
  "OWASP header set, per-request CSP nonce, CSRF tokens, brute-force IP blocking",
];

/**
 * Public landing page (APP-01, APP-02, APP-04).
 *
 * `connection()` forces dynamic rendering so the per-request CSP nonce from
 * `proxy.ts` applies. The only auth touch is `getAuthenticatedUser`, which
 * decides whether the header links to `/dashboard` or `/login` — the page ships
 * no Firebase config and no `NEXT_PUBLIC_*` value.
 */
export default async function Home() {
  await connection();

  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const user = await getAuthenticatedUser(sessionCookie);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-heading text-sm font-semibold">
          Projeto Aplicado
        </span>
        {user ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Projeto Aplicado — Secure App
          </h1>
          <p className="text-base text-muted-foreground">
            A server-rendered web prototype built to demonstrate active
            mitigations for the OWASP Top 10:2025. Create an account, verify your
            email, and sign in to reach the protected area.
          </p>
        </div>

        <div className="flex gap-3">
          <Button asChild>
            <Link href="/signup">Create an account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What this demo covers</CardTitle>
            <CardDescription>
              Every control is implemented server-side and unit-tested.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
              {FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
