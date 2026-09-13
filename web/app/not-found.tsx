import { GenericError } from "@/components/error/generic-error";

/**
 * Next.js not-found convention: renders for any unmatched route, and for an
 * explicit `notFound()` call from a page/route. Reuses the generic error
 * screen instead of Next's default 404 page.
 */
export default function NotFound() {
  return <GenericError reason="not-found" />;
}
