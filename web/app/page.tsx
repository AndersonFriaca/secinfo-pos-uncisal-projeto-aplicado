import { connection } from "next/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { headerNavLink } from "@/lib/nav";
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
  "Autenticação Firebase só no servidor — nenhuma credencial chega ao navegador",
  "Cadastro com verificação de e-mail, login por cookie de sessão, painel validado no servidor",
  "Conjunto de headers OWASP, nonce de CSP por requisição, tokens CSRF, bloqueio de IP por força bruta",
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
  const navLink = headerNavLink(user);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-heading text-sm font-semibold">
          Projeto Aplicado
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={navLink.href}>{navLink.label}</Link>
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Projeto Aplicado — Aplicação Segura
          </h1>
          <p className="text-base text-muted-foreground">
            Um protótipo web renderizado no servidor, feito para demonstrar
            mitigações ativas para o OWASP Top 10:2025. Crie uma conta, verifique
            seu e-mail e entre para acessar a área protegida.
          </p>
        </div>

        <div className="flex gap-3">
          <Button asChild>
            <Link href="/signup">Criar uma conta</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Entrar</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>O que esta demonstração cobre</CardTitle>
            <CardDescription>
              Todo controle é implementado no servidor e coberto por testes
              unitários.
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
