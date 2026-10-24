import Link from "next/link";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./auth-shell";

/** Non-enumerating acknowledgement shown after every resend (AUTH-06). */
export const RESENT_MESSAGE =
  "Se essa conta existir e ainda precisar de verificação, um novo e-mail está a caminho";

/**
 * Verify-email screen body (APP-03, AUTH-06, UI-01, UI-03, UI-05). Two
 * actions: resend (a credential-free POST to `/api/auth/resend-verification`,
 * which reads the `__verify` cookie set at signup/login) and go to `/login`.
 */
export function VerifyEmailForm({
  csrfToken,
  resent,
}: {
  csrfToken: string;
  resent: boolean;
}) {
  return (
    <AuthShell
      title="Verifique sua caixa de entrada"
      description="Enviamos um link de verificação para o seu e-mail. Clique nele e depois entre — o painel fica bloqueado até seu e-mail ser verificado."
      footer="Não recebeu? Confira a pasta de spam antes de reenviar."
    >
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
        <Button type="submit" variant="outline">
          Reenviar e-mail de verificação
        </Button>
      </form>

      <Button asChild>
        <Link href="/login">Entrar</Link>
      </Button>
    </AuthShell>
  );
}
