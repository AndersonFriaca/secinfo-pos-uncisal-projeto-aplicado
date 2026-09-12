import Link from "next/link";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./auth-shell";

/** Generic, field-agnostic message — matches the route's 401 body (AUTH-10). */
export const LOGIN_GENERIC_ERROR = "E-mail ou senha inválidos";

/**
 * Login screen body (APP-03, SEC-21, UI-01, UI-03, UI-04). A card-less form
 * posting to `/api/auth/login` with the CSRF token from the `x-csrf-token`
 * header. On `?error` it shows one generic message without naming the field
 * at fault.
 */
export function LoginForm({
  csrfToken,
  error,
}: {
  csrfToken: string;
  error: boolean;
}) {
  return (
    <AuthShell
      title="Entrar"
      description="Informe seu e-mail e senha para acessar o painel."
      footer={
        <>
          Não tem conta?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Crie uma
          </Link>
        </>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{LOGIN_GENERIC_ERROR}</AlertTitle>
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
    </AuthShell>
  );
}
