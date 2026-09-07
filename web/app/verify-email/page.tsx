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
  "Se essa conta existir e ainda precisar de verificação, um novo e-mail está a caminho";

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
          <CardTitle>Verifique sua caixa de entrada</CardTitle>
          <CardDescription>
            Enviamos um link de verificação para o seu e-mail. Clique nele e
            depois entre — o painel fica bloqueado até seu e-mail ser verificado.
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
            <Button type="submit" variant="outline">
              Reenviar e-mail de verificação
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Já verificou?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </main>
  );
}
