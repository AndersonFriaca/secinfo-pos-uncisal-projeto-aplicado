/**
 * Dashboard route-guard decision (AUTH-06).
 *
 * Pure function so the redirect-target mapping in `app/dashboard/page.tsx` is
 * unit-testable without rendering the page. An authenticated-but-unverified
 * session goes to `/verify-email` (AUTH-06); any other non-authenticated
 * session goes to `/login`; an authenticated session renders (`null`).
 */

import type { SessionState } from "@/lib/auth/session";

/** Redirect target for a dashboard request, or `null` to render. */
export function dashboardRedirect(
  state: SessionState,
): "/verify-email" | "/login" | null {
  if (state.status === "unverified") return "/verify-email";
  if (state.status !== "authenticated") return "/login";
  return null;
}
