# Frontend shadcn Layouts Context

**Gathered:** 2026-09-12
**Spec:** `.specs/features/frontend-shadcn-layouts/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Restyle the existing pages of `web/` to match two shadcn/ui examples — a clean, card-less auth form ([examples/authentication](https://ui.shadcn.com/examples/authentication)) and a sidebar-driven internal page ([examples/dashboard](https://ui.shadcn.com/examples/dashboard)) — and strip every security-rule statement from the rendered pages so that content lives only in `README.md` and `docs/`. No route, API, auth, or security-control behavior changes.

---

## Implementation Decisions

### Auth screens (`/login`, `/signup`, `/verify-email`)

- Single centered form, **no** `Card` wrapper and **no** two-column brand panel. The user chose the simpler variant over the example's split layout.
- One shared auth shell is used by all three screens so they look identical.
- Existing behavior is preserved verbatim: `method="post"` forms to `/api/auth/*`, hidden `csrf_token` from the `x-csrf-token` header, generic error `Alert` on `?error`, resend acknowledgement on `?resent`, `autoComplete` values, `minLength={12}` on the signup password.

### Dashboard (`/dashboard`)

- Minimal sidebar: project brand in the header, one "Painel" navigation item, footer with the authenticated user's e-mail and the "Sair" logout form (still a `POST /api/auth/logout` form carrying the CSRF token).
- Header bar with `SidebarTrigger` + `Breadcrumb` ("Painel").
- Central content: a welcome heading plus the user's e-mail. No metric cards, charts, or tables — the example's data widgets are out of scope.
- No placeholder/disabled navigation items.

### Removal of security-rule copy

All four candidates were confirmed for removal:

- The "O que esta demonstração cobre" card and its `FEATURES` list on `/`.
- The OWASP mention in the `/` description — replaced by a neutral project description.
- The four-item password-rules list under the `/signup` password field. The `minLength={12}` attribute and the generic 400 error message stay (they are behavior, not copy).
- The `metadata.description` in `app/layout.tsx` — replaced by a neutral description.

### Agent's Discretion

- Exact neutral wording of the landing description, the metadata description, and the dashboard welcome text (Portuguese, pt-BR, matches the existing tone).
- How the shadcn `sidebar` block is made compatible with the existing nonce-only `style-src` CSP (see spec assumption).
- Whether `sidebar_state` persistence (the shadcn cookie) is kept or dropped.

### Declined / Undiscussed Gray Areas → Assumptions

- Landing page (`/`) keeps its header (brand + auth-aware link), title, description and the two CTA buttons; only the card is removed. Recorded in the spec.
- Dark-mode toggle: not added (the example's theme switcher is site chrome, not part of the layout). Recorded in the spec.

---

## Specific References

- Login: https://ui.shadcn.com/examples/authentication — form column only (heading, description, fields, primary button), no Card.
- Dashboard: https://ui.shadcn.com/examples/dashboard — `Sidebar` + `SidebarInset` shell, header with `SidebarTrigger` and `Breadcrumb`.

---

## Deferred Ideas

- Two-column auth layout with a brand panel (user chose the simpler variant; could be revisited).
- Dashboard widgets (stat cards, charts, tables) — no data exists to show.
