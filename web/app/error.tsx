"use client";

import { useEffect } from "react";
import { GenericError } from "@/components/error/generic-error";

/**
 * Next.js error boundary for uncaught render/server errors anywhere under
 * the root layout. Shows the same generic screen used for redirect-based
 * failures instead of Next's default error overlay/500 page.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return <GenericError reason="unknown" />;
}
