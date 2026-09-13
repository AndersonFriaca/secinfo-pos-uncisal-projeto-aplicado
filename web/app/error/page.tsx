import { GenericError, resolveErrorReason } from "@/components/error/generic-error";

/**
 * Generic app error screen (`/error?reason=...`). Server handlers redirect
 * here instead of returning a bare JSON body for failures that aren't tied
 * to a specific form field (rate limiting, an unavailable upstream, etc).
 */
export default async function ErrorPage({
  searchParams,
}: PageProps<"/error">) {
  const { reason, retryAfter } = await searchParams;
  const retryAfterSeconds = Array.isArray(retryAfter)
    ? Number(retryAfter[0])
    : retryAfter
      ? Number(retryAfter)
      : undefined;

  return (
    <GenericError
      reason={resolveErrorReason(Array.isArray(reason) ? reason[0] : reason)}
      retryAfterSeconds={
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined
      }
    />
  );
}
