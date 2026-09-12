import Link from "next/link";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./auth-shell";

/** Non-enumerating confirmation — matches the route's ?sent=1 redirect (AUTH-20, no enumeration). */
export const FORGOT_PASSWORD_SENT_MESSAGE =
  "Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha.";
export const FORGOT_PASSWORD_INVALID_ERROR = "Informe um e-mail válido";
export const FORGOT_PASSWORD_RATE_LIMITED_ERROR =
  "Muitas requisições, tente novamente em instantes";

const ERROR_MESSAGE: Record<string, string> = {
  invalid: FORGOT_PASSWORD_INVALID_ERROR,
  rate_limited: FORGOT_PASSWORD_RATE_LIMITED_ERROR,
};

/**
 * Forgot-password screen body (APP-05, AUTH-20, AUTH-21, UI-17). A card-less
 * form posting to `/api/auth/forgot-password` with the CSRF token from the
 * `x-csrf-token` header. The account itself is reset on Identity Platform's
 * own default-hosted action page reached from the emailed link, not on a
 * screen in this app (see spec assumption — this deployment has no domain to
 * register as a Firebase authorized domain).
 */
export function ForgotPasswordForm({
  csrfToken,
  sent,
  error,
}: {
  csrfToken: string;
  sent: boolean;
  error?: string;
}) {
  const errorMessage = error ? (ERROR_MESSAGE[error] ?? FORGOT_PASSWORD_INVALID_ERROR) : null;

  return (
    <AuthShell
      title="Esqueceu a senha?"
      description="Informe seu e-mail e enviaremos um link para redefinir a senha, caso a conta exista."
      footer={
        <>
          Lembrou a senha?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      {sent ? (
        <Alert>
          <AlertTitle>{FORGOT_PASSWORD_SENT_MESSAGE}</AlertTitle>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>{errorMessage}</AlertTitle>
        </Alert>
      ) : null}

      <form
        method="post"
        action="/api/auth/forgot-password"
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
        <Button type="submit">Enviar link de redefinição</Button>
      </form>
    </AuthShell>
  );
}
