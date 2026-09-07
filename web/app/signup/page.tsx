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
const GENERIC_ERROR = "Não foi possível criar a conta com esses dados";

const PASSWORD_RULES = [
  "Pelo menos 12 caracteres",
  "Uma letra minúscula e uma maiúscula",
  "Um dígito",
  "Um símbolo",
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
          <CardTitle>Criar uma conta</CardTitle>
          <CardDescription>
            Você receberá um e-mail de verificação antes de o painel ser
            liberado.
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
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
            <Button type="submit">Criar conta</Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Já tem cadastro?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </main>
  );
}
