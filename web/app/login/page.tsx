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

/** Generic, field-agnostic message — matches the route's 401 body (AUTH-10). */
const GENERIC_ERROR = "E-mail ou senha inválidos";

/**
 * Login screen (APP-03, SEC-21). A shadcn email + password form posting to
 * `/api/auth/login` with the CSRF token from the `x-csrf-token` header (seeded
 * as the `csrf_token` cookie by `proxy.ts`). Reading a request header forces
 * dynamic rendering so the CSP nonce applies. On `?error` it shows one generic
 * message without naming the field at fault.
 */
export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>
            Informe seu e-mail e senha para acessar o painel.
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
            action="/api/auth/login"
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit">Entrar</Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Não tem conta?{" "}
        <Link href="/signup" className="underline underline-offset-4">
          Crie uma
        </Link>
      </p>
    </main>
  );
}
