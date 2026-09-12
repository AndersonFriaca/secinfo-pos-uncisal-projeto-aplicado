import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { HeaderNavLink } from "@/lib/nav";
import { SITE_NAME } from "@/lib/site";

/**
 * Public landing page body (APP-01, APP-04, UI-12, UI-13). No card, no
 * security-control copy — that content lives in `README.md` / `docs/`.
 */
export function LandingContent({ navLink }: { navLink: HeaderNavLink }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-heading text-sm font-semibold">
          {SITE_NAME}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={navLink.href}>{navLink.label}</Link>
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {SITE_NAME}
          </h1>
          <p className="text-base text-muted-foreground">
            Aplicação web do Projeto Aplicado. Crie uma conta ou entre para
            acessar o painel.
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
      </main>
    </div>
  );
}
