/**
 * Guest-only route-guard decision. A signed-in user hitting `/login` should
 * land on `/dashboard` (or `/verify-email` if not yet verified), not see the
 * form again.
 *
 * Pure function, mirrors `dashboard-guard.ts`'s shape, so it's unit-testable
 * without rendering the page.
 */

import type { SessionState } from "@/lib/auth/session";

/** Redirect target for a guest-only request, or `null` to render the form. */
export function guestRedirect(
  state: SessionState,
): "/dashboard" | "/verify-email" | null {
  if (state.status === "authenticated") return "/dashboard";
  if (state.status === "unverified") return "/verify-email";
  return null;
}
