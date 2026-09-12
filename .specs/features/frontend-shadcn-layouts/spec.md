# Frontend shadcn Layouts Specification

## Problem Statement

The pages in `web/` were built as the minimum needed to exercise the auth flow: every screen is a single `Card`, and the landing and signup pages narrate the security controls (OWASP list, password rules) on the page itself. The course deliverable should look like a finished product — a clean auth form and a sidebar-driven internal area, as in the shadcn/ui [authentication](https://ui.shadcn.com/examples/authentication) and [dashboard](https://ui.shadcn.com/examples/dashboard) examples — and the security rationale belongs in `README.md` / `docs/`, not in the UI. This feature restyles the existing pages without changing any route, API, auth, or security-control behavior.

## Goals

- [ ] `/login`, `/signup`, `/verify-email` render as one shared, card-less, centered form shell in the style of the shadcn authentication example's form column.
- [ ] `/dashboard` renders a shadcn `Sidebar` + `SidebarInset` shell (brand, "Painel" item, user e-mail + logout in the footer, `SidebarTrigger` + breadcrumb header) with a welcome message in the center.
- [ ] No rendered page contains security-rule copy (OWASP, control list, password rules); the equivalent content remains in `README.md` and `docs/security.md`.
- [ ] Every existing security control is untouched: CSP stays nonce-only for `style-src`, CSRF-token forms, generic error messages, dynamic rendering, no `NEXT_PUBLIC_*`.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Two-column auth layout with brand/testimonial panel | User chose the single centered form variant. |
| Dashboard widgets (stat cards, chart, data table) from the example | There is no application data to show; the requirement is a sidebar plus a central message. |
| Placeholder / disabled navigation items in the sidebar | User chose the minimal sidebar (one "Painel" item). |
| Dark-mode toggle / theme switcher | Site chrome of ui.shadcn.com, not part of either example's layout. `globals.css` already defines the `.dark` palette; no toggle is added. |
| Any change to Route Handlers, `proxy.ts`, `lib/security/*`, `lib/auth/*` | Pure presentation change. The CSP is a constraint on the UI, not something the UI edits. |
| Rewriting `README.md` / `docs/security.md` security content | Already documents every control; this feature only stops duplicating it in the UI. `docs/application.md` gets a short screen description update. |
| Browser / E2E tests | Existing project decision (unit tests only in the PR gate). Mobile sidebar behavior is verified by manual UAT. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Auth screen variant | Single centered form, no `Card`, no brand panel; shared shell for `/login`, `/signup`, `/verify-email` | User choice (AskUserQuestion, 2026-09-12). | y |
| Dashboard content | Minimal sidebar (brand, "Painel", footer with e-mail + "Sair"), header with `SidebarTrigger` + breadcrumb, centered welcome heading + e-mail | User choice. | y |
| Security copy to remove | Landing feature card, OWASP mention in landing description, signup password-rules list, `metadata.description` | User confirmed all four. `minLength={12}` and generic error messages stay — they are behavior, not copy. | y |
| Landing page structure | Header (brand + auth-aware link), title, neutral description, "Criar uma conta" / "Entrar" buttons remain; only the card is removed | Keeps APP-01/APP-04 of `nextjs-secure-app` satisfied (name, description, links to `/login` and `/signup`, auth-aware header link). | y |
| shadcn `sidebar` block vs. nonce-only CSP | The sidebar block is installed via the shadcn CLI and then adapted so the server-rendered HTML carries **no inline `style` attribute** (the block's `--sidebar-width` CSS variables move to `globals.css`); `style-src` in `lib/security/headers.ts` is **not** relaxed with `'unsafe-inline'` / `'unsafe-hashes'` | `style-src 'self' 'nonce-…'` (headers.ts:33) blocks `style=""` attributes in SSR markup; a nonce cannot cover attributes. Weakening the CSP would undo a graded control (SEC-08..). Exact edits are a Design decision (AD-006: verify the installed block's source, not memory). | y |
| `sidebar_state` cookie | Kept as shipped by the block (client-side `document.cookie`, non-sensitive, not read by the server) unless Design finds it conflicts with a control | Zero security impact; removing it is gratuitous divergence from the block. | y |
| Testability of pages | Pages become thin async wrappers (`headers()`/`cookies()`/redirects) around sync presentational components that receive `csrfToken`, `error`, `email` etc. as props; tests render those components with `react-dom/server` | `app/*/page.tsx` are async Server Components bound to `next/headers`; rendering them in Vitest is not supported. Splitting keeps the untested surface to the same one-liners already covered by `lib/nav.ts` / `lib/dashboard-guard.ts`. | y |
| Copy language | pt-BR, same tone as existing pages | Existing convention. | y |

**Open questions:** none — every ambiguity is resolved or logged above.

---

## User Stories

### P1: Clean auth screens ⭐ MVP

**User Story**: As a visitor, I want the login, signup, and verify-email screens to be a clean centered form like the shadcn authentication example, so that the prototype looks like a finished product.

**Why P1**: The login screen is the first thing the grader interacts with; it is the explicit request.

**Acceptance Criteria**:

1. WHEN a visitor requests `/login`, `/signup`, or `/verify-email` THEN the system SHALL render the screen through one shared auth shell component, and the response HTML SHALL contain no element with `data-slot="card"`. <!-- event-driven -->
2. The system SHALL render each auth screen as a single vertically centered column of at most `max-w-sm` containing, in order: a heading, a one-line description, the form fields, one primary submit button, and one footer link (`/signup` from login, `/login` from signup and verify-email). <!-- ubiquitous -->
3. The system SHALL keep every form contract unchanged: `method="post"`, the existing `action` (`/api/auth/login`, `/api/auth/signup`, `/api/auth/resend-verification`), a hidden `csrf_token` input carrying the `x-csrf-token` header value, field `name`s `email`/`password`, the existing `autoComplete` values, `required`, and `minLength={12}` on the signup password. <!-- ubiquitous -->
4. WHEN `/login` is requested with `?error` THEN the system SHALL render a destructive `Alert` with the text "E-mail ou senha inválidos" above the form, and WHEN `?error` is absent THEN no `role="alert"` element SHALL be rendered. <!-- event-driven -->
5. WHEN `/signup` is requested with `?error` THEN the system SHALL render a destructive `Alert` with the text "Não foi possível criar a conta com esses dados"; WHEN `/verify-email` is requested with `?resent` THEN the system SHALL render an `Alert` with the text "Se essa conta existir e ainda precisar de verificação, um novo e-mail está a caminho". <!-- event-driven -->

**Independent Test**: `curl -s https://<ip>/login` HTML contains `<form method="post" action="/api/auth/login"` and `name="csrf_token"` and no `data-slot="card"`; visually, the form is centered with no bordered card.

---

### P1: Sidebar dashboard ⭐ MVP

**User Story**: As an authenticated user, I want the internal page to have a side panel and a central message like the shadcn dashboard example, so that the protected area reads as an application shell rather than a single card.

**Why P1**: Explicit request; the internal page is the PRD's mandatory protected screen.

**Acceptance Criteria**:

1. WHEN an authenticated, verified user requests `/dashboard` THEN the system SHALL render a shadcn `Sidebar` containing, in order: a header with the brand "Projeto Aplicado", a menu with exactly one item "Painel" linking to `/dashboard` marked active, and a footer showing the user's e-mail (or `uid` when e-mail is absent) and the "Sair" logout control. <!-- event-driven -->
2. WHEN `/dashboard` renders THEN the system SHALL render a `SidebarInset` whose header contains a `SidebarTrigger` and a `Breadcrumb` with the current page "Painel", and whose main area contains a heading welcoming the user and the same e-mail shown in the sidebar footer. <!-- event-driven -->
3. The logout control SHALL remain a `<form method="post" action="/api/auth/logout">` with a hidden `csrf_token` input carrying the `x-csrf-token` header value and a submit button labelled "Sair". <!-- ubiquitous -->
4. The server-rendered HTML of the dashboard shell SHALL contain no `style=` attribute, so that it renders without violations under the existing `style-src 'self' 'nonce-…'` policy. <!-- ubiquitous -->
5. The system SHALL leave `lib/security/headers.ts` unchanged — in particular `style-src` SHALL NOT gain `'unsafe-inline'` or `'unsafe-hashes'`. <!-- ubiquitous -->
6. The dashboard guard behavior SHALL be unchanged: missing/expired/revoked session redirects to `/login`; unverified e-mail redirects to `/verify-email`; `getSessionState` runs on every request. <!-- ubiquitous -->

**Independent Test**: log in, open `/dashboard`: sidebar on the left with brand, "Painel", e-mail and "Sair"; welcome text in the center; browser console shows no CSP `style-src` violation; clicking "Sair" lands on `/` logged out.

---

### P1: Security copy lives only in docs ⭐ MVP

**User Story**: As the project owner, I want the pages to stop describing the security controls, so that the UI is product-like and the security rationale is read in `README.md` / `docs/`.

**Why P1**: Explicit request.

**Acceptance Criteria**:

1. WHEN `/` renders THEN the response HTML SHALL NOT contain "O que esta demonstração cobre", "OWASP", "Firebase", "CSRF", "CSP", "headers", nor "força bruta". <!-- event-driven -->
2. WHEN `/` renders THEN the response HTML SHALL still contain "Projeto Aplicado", a description paragraph, a link to `/signup` and a link to `/login` (APP-01 preserved), and the header link SHALL still resolve through `headerNavLink` (APP-04 preserved). <!-- event-driven -->
3. WHEN `/signup` renders THEN the response HTML SHALL NOT contain "Pelo menos 12 caracteres", "Uma letra minúscula e uma maiúscula", "Um dígito", nor "Um símbolo". <!-- event-driven -->
4. The root `metadata.description` SHALL be a neutral sentence that does not contain "seguro", "OWASP", "verificação", "login", nor "painel". <!-- ubiquitous -->
5. The system SHALL keep the "Segurança da aplicação (OWASP Top 10)" section in `README.md` and the password-policy statement in `README.md` / `docs/security.md` intact (no deletion). <!-- ubiquitous -->
6. WHEN this feature is complete THEN `docs/application.md` SHALL describe the three auth screens as a shared centered form and the dashboard as a sidebar shell. <!-- event-driven -->

**Independent Test**: `curl -s https://<ip>/ | grep -c OWASP` prints `0`; `grep -n "OWASP" README.md` still matches.

---

### P2: Responsive sidebar

**User Story**: As a user on a narrow screen, I want the sidebar to collapse and open from the trigger, so that the dashboard stays usable on mobile.

**Why P2**: Comes free with the shadcn block; verified manually, not gating.

**Acceptance Criteria**:

1. WHILE the viewport is narrower than 768px the system SHALL render the sidebar off-canvas (hidden) and WHEN the `SidebarTrigger` is activated THEN the system SHALL open it as a sheet overlay. <!-- complex -->
2. WHILE the viewport is 768px or wider the system SHALL render the sidebar expanded by default. <!-- state-driven -->

**Independent Test**: manual — resize the browser below 768px, sidebar disappears, trigger opens it.

---

## Edge Cases

- IF the authenticated user has no `email` claim THEN the system SHALL show the `uid` in both the sidebar footer and the welcome message (mirrors the current `user.email ?? user.uid`). <!-- unwanted-behavior -->
- IF the `x-csrf-token` header is missing at render time THEN the system SHALL render the hidden `csrf_token` input with an empty value (unchanged; the route rejects the POST). <!-- unwanted-behavior -->
- WHEN JavaScript is disabled THEN every form on the auth screens and the logout form SHALL still submit (plain HTML forms, no client handlers). <!-- event-driven -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| UI-01 | P1: Clean auth screens | Execute | Implementing |
| UI-02 | P1: Clean auth screens | Execute | Implementing |
| UI-03 | P1: Clean auth screens | Execute | Implementing |
| UI-04 | P1: Clean auth screens | Execute | Implementing |
| UI-05 | P1: Clean auth screens | Execute | Implementing |
| UI-06 | P1: Sidebar dashboard | Execute | Implementing |
| UI-07 | P1: Sidebar dashboard | Tasks | In Tasks |
| UI-08 | P1: Sidebar dashboard | Tasks | In Tasks |
| UI-09 | P1: Sidebar dashboard | Execute | Implementing |
| UI-10 | P1: Sidebar dashboard | Execute | Implementing |
| UI-11 | P1: Sidebar dashboard | Tasks | In Tasks |
| UI-12 | P1: Security copy lives only in docs | Execute | Implementing |
| UI-13 | P1: Security copy lives only in docs | Execute | Implementing |
| UI-14 | P1: Security copy lives only in docs | Execute | Implementing |
| UI-15 | P1: Security copy lives only in docs | Execute | Implementing |
| UI-16 | P1: Security copy lives only in docs | Tasks | In Tasks |
| UI-17 | P1: Security copy lives only in docs | Tasks | In Tasks |
| UI-18 | P2: Responsive sidebar | Design | Pending |
| UI-19 | P2: Responsive sidebar | Design | Pending |

IDs map 1:1 to the acceptance criteria in story order (UI-01..05 = auth AC 1..5, UI-06..11 = dashboard AC 1..6, UI-12..17 = docs AC 1..6, UI-18..19 = responsive AC 1..2).

**Coverage:** 19 total, 17 mapped to tasks (T1–T13), 2 unmapped ⚠️ — UI-18/UI-19 (P2 responsive sidebar) are verified by manual UAT per the Out of Scope "no E2E" decision.

---

## Success Criteria

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass in `web/`.
- [ ] Browser console on `/dashboard` shows zero CSP violations.
- [ ] `curl` of `/`, `/login`, `/signup` contains none of the removed security strings; `README.md` still does.
