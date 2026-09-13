import Link from "next/link";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Known reasons the app redirects here for instead of showing raw JSON/HTML. */
export type GenericErrorReason = "rate-limited" | "unavailable" | "unknown";

const MESSAGES: Record<GenericErrorReason, { title: string; description: string }> = {
  "rate-limited": {
    title: "Muitas requisições",
    description:
      "Você tentou algumas vezes seguidas. Aguarde um instante e tente novamente.",
  },
  unavailable: {
    title: "Serviço temporariamente indisponível",
    description:
      "Não conseguimos concluir essa ação agora. Tente novamente em alguns minutos.",
  },
  unknown: {
    title: "Algo deu errado",
    description:
      "Ocorreu um erro inesperado. Tente novamente ou volte para a página inicial.",
  },
};

/** Normalizes any raw `?reason` query value into a known reason (defaults to "unknown"). */
export function resolveErrorReason(reason: string | undefined): GenericErrorReason {
  if (reason === "rate-limited" || reason === "unavailable") return reason;
  return "unknown";
}

/**
 * Generic application error screen. Used whenever a server redirect needs to
 * show the user something readable instead of a bare JSON/error body
 * (rate limiting, an unavailable upstream, or any other non-field-specific
 * failure).
 */
export function GenericError({
  reason,
  retryAfterSeconds,
}: {
  reason: GenericErrorReason;
  retryAfterSeconds?: number;
}) {
  const { title, description } = MESSAGES[reason];

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Alert variant="destructive">
        <AlertTitle>{title}</AlertTitle>
        {reason === "rate-limited" && retryAfterSeconds ? (
          <AlertDescription>
            Tente novamente em {retryAfterSeconds}s.
          </AlertDescription>
        ) : null}
      </Alert>

      <Button asChild>
        <Link href="/login">Voltar para o login</Link>
      </Button>
    </main>
  );
}
