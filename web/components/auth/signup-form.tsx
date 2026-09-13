import Link from "next/link";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./auth-shell";

/** Generic, non-enumerating message — matches the route's `error=invalid` redirect (AUTH-04). */
export const SIGNUP_GENERIC_ERROR =
  "Não foi possível criar a conta com esses dados";
export const SIGNUP_RATE_LIMITED_ERROR =
  "Muitas requisições, tente novamente em instantes";
export const SIGNUP_UNAVAILABLE_ERROR = "Serviço temporariamente indisponível";

/** AUTH-19: one message per `?error` code; any unrecognized code falls back to the generic one. */
const ERROR_MESSAGE: Record<string, string> = {
  invalid: SIGNUP_GENERIC_ERROR,
  rate_limited: SIGNUP_RATE_LIMITED_ERROR,
  unavailable: SIGNUP_UNAVAILABLE_ERROR,
};

/**
 * Signup screen body (APP-03, AUTH-01, AUTH-19, UI-01, UI-03, UI-05, UI-14,
 * UI-16). A card-less form posting to `/api/auth/signup` with the CSRF token
 * from the `x-csrf-token` header. The password-rules copy lives only in
 * `README.md` / `docs/security.md`, not here.
 */
export function SignupForm({
  csrfToken,
  error,
}: {
  csrfToken: string;
  error?: string;
}) {
  const errorMessage = error ? (ERROR_MESSAGE[error] ?? SIGNUP_GENERIC_ERROR) : null;
  return (
    <AuthShell
      title="Criar uma conta"
      description="Você receberá um e-mail de verificação antes de o painel ser liberado."
      footer={
        <>
          Já tem cadastro?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>{errorMessage}</AlertTitle>
        </Alert>
      ) : null}

      <form
        method="post"
        action="/api/auth/signup"
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
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        <Button type="submit">Criar conta</Button>
      </form>
    </AuthShell>
  );
}
