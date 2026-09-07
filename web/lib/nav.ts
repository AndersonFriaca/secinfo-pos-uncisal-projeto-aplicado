/**
 * Landing-page header navigation decision (APP-01, APP-04).
 *
 * Pure function so the auth-dependent branch in `app/page.tsx` is unit-testable
 * without rendering the page. The decision depends only on whether the visitor
 * has an authenticated session — it never touches Firebase config or any
 * `NEXT_PUBLIC_*` value.
 */

import type { AuthUser } from "@/lib/auth/session";

export type HeaderNavLink = { href: string; label: string };

/** `/dashboard` for an authenticated visitor, otherwise `/login` (APP-04). */
export function headerNavLink(user: AuthUser | null): HeaderNavLink {
  return user
    ? { href: "/dashboard", label: "Ir para o painel" }
    : { href: "/login", label: "Entrar" };
}
