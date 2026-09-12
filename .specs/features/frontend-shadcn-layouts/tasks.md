# Frontend shadcn Layouts Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/frontend-shadcn-layouts/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `web/AGENTS.md` (read `node_modules/next/dist/docs/` before Next.js code), `web/vitest.config.mts` (node env, `*.test.ts` co-located next to source), `.github/workflows/ci.yml` (`npm run lint`, `npm run typecheck`, `npm test` on PR). No coverage threshold configured — strong defaults applied. Baseline: 15 files / 157 tests passing.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Presentational components (`components/auth/*`, `components/dashboard/*`, `components/landing-content.tsx`) | unit (SSR snapshot-by-assertion via `react-dom/server`) | 1:1 to spec ACs UI-01..09, UI-12..14; every listed edge case (missing e-mail → uid, empty CSRF token) | `web/components/**/*.test.tsx` co-located | `npm test` (in `web/`) |
| Vendored shadcn primitives (`components/ui/sidebar.tsx` after CSP edit) | unit | The one invariant the project adds: no `style=` in SSR output of every exported sidebar component | `web/components/ui/sidebar.test.tsx` | `npm test` |
| Site constants (`lib/site.ts`) | unit | 1:1 to UI-15 forbidden-word list | `web/lib/*.test.ts` | `npm test` |
| Security headers (`lib/security/headers.ts`, unchanged) | unit | UI-10: `style-src` asserted exactly (extend existing `headers.test.ts`) | `web/lib/security/headers.test.ts` | `npm test` |
| Pages (`app/**/page.tsx`, `app/layout.tsx`), `globals.css`, `vitest.config.mts`, unedited vendored primitives | none | build gate only (async Server Components bound to `next/headers`) | - | build gate only |
| Docs (`docs/application.md`) | none | build gate only (reviewed by Verifier against UI-16/17) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute. All commands run inside `web/`.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After tasks with e2e/integration tests | n/a (no e2e in this project) — same as Quick |
| Build | After phase completion or config/entity-only tasks | `npm run lint && npm run typecheck && npm test && npm run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Foundation (test harness + sidebar primitives)

```
T1 → T2 → T3 → T4
```

### Phase 2: Auth screens

```
T1 → T5 → T6 → T7 → T8
```

### Phase 3: Landing + metadata copy removal

```
T1 → T9 → T10
```

### Phase 4: Dashboard shell + docs

```
T4 → T11 → T12 → T13
```

---

## Task Breakdown

### T1: Enable `.tsx` component tests in Vitest

**What**: Widen `vitest.config.mts` `include` to `**/*.test.{ts,tsx}` and add a harness smoke test that renders a `Button asChild` wrapping `next/link` through `renderToStaticMarkup`, proving JSX transform + `next/link` work outside a Next router (design's open question).
**Where**: `web/vitest.config.mts`
**Depends on**: None
**Reuses**: `web/components/ui/button.tsx`, `web/lib/smoke.test.ts` (style)
**Requirement**: UI-01 (enabler)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `web/components/ui/button.test.tsx` renders `<Button asChild><Link href="/login">Entrar</Link></Button>` and asserts the output contains `<a href="/login"` — if `next/link` throws here, record the fallback (injectable link component) in `design.md` before continuing
- [x] Gate check passes: `npm test`
- [x] Test count: 158 tests pass (157 + 1)

**Tests**: unit
**Gate**: quick

**Commit**: `test(web): render .tsx components in vitest via react-dom/server`

**Status**: ✅ Complete (commit pending) — `next/link` renders as a plain `<a>` under `renderToStaticMarkup` outside a Next router context with no error; no fallback `LinkComponent` prop was needed.

---

### T2: Install the shadcn sidebar and breadcrumb blocks

**What**: Run `npx shadcn@latest add sidebar breadcrumb` in `web/` (adds `sidebar.tsx`, `sheet.tsx`, `tooltip.tsx`, `separator.tsx`, `skeleton.tsx`, `breadcrumb.tsx`, `hooks/use-mobile.ts`); no hand edits in this task.
**Where**: `web/components/ui/sidebar.tsx`
**Depends on**: T1
**Reuses**: `web/components.json` (style `radix-nova`, aliases)
**Requirement**: UI-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Files above exist; imports resolve to `@/components/ui/*`, `@/hooks/use-mobile`, `cn`
- [x] `git diff --stat` shows only added files under `web/components/ui/`, `web/hooks/`, and `package.json`/`package-lock.json` if the CLI added a dependency
- [x] Gate check passes: `npm run lint && npm run typecheck && npm test && npm run build`
- [x] Test count: 158 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(web): add shadcn sidebar and breadcrumb primitives`

**Status**: ✅ Complete (commit pending) — SPEC_DEVIATION: the CLI's generated `hooks/use-mobile.ts` failed `npm run lint` under this repo's `react-hooks/set-state-in-effect` rule (calling `setIsMobile` synchronously in the effect body). Added a one-line `eslint-disable-next-line` comment (no logic change) to pass the mandatory build gate; the SSR-safe `useState(undefined)` behavior documented in design.md's Research Findings is unchanged. No dependency changes; `package.json`/`package-lock.json` untouched.

---

### T3: Define sidebar width variables in `globals.css`

**What**: Add `[data-slot="sidebar-wrapper"] { --sidebar-width: 16rem; --sidebar-width-icon: 3rem }` and `[data-slot="sidebar"][data-mobile="true"] { --sidebar-width: 18rem }` to `@layer base`, matching the constants in the vendored block.
**Where**: `web/app/globals.css`
**Depends on**: T2
**Reuses**: existing `--sidebar*` color variables in the same file
**Requirement**: UI-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both rules present in `@layer base`
- [x] Gate check passes: `npm run lint && npm run typecheck && npm test && npm run build`
- [x] Test count: 158 tests pass

**Tests**: none
**Gate**: build

**Commit**: `feat(web): move sidebar width variables to globals.css`

**Status**: ✅ Complete (commit pending)

---

### T4: Strip inline `style` props from the vendored sidebar for the nonce-only CSP

**What**: Remove the three `style={…}` props (`SidebarProvider` wrapper, mobile `SheetContent`, `SidebarMenuSkeleton`) and the now-unused `SIDEBAR_WIDTH*` constants / `width` computation, each edit marked `// CSP:`; add `sidebar.test.tsx` asserting the SSR output of `SidebarProvider > Sidebar > SidebarHeader/Content/Menu/MenuButton/MenuSkeleton/Footer + SidebarInset + SidebarTrigger` contains no `style=`; extend `headers.test.ts` with an exact `style-src 'self' 'nonce-NONCE123'` assertion (add only if not already present).
**Where**: `web/components/ui/sidebar.tsx`
**Depends on**: T3
**Reuses**: `web/lib/security/headers.test.ts`
**Requirement**: UI-09, UI-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -n "style=" web/components/ui/sidebar.tsx` returns nothing
- [x] `sidebar.test.tsx`: (a) no `style=` in output, (b) output contains `data-slot="sidebar-wrapper"` and `data-slot="sidebar"` (proves the desktop branch rendered)
- [x] `headers.test.ts` asserts `style-src 'self' 'nonce-NONCE123'` in production CSP
- [x] Gate check passes: `npm test`
- [x] Test count: 161 tests pass (158 + 2 sidebar + 1 headers)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(web): drop inline styles from the sidebar block to satisfy style-src`

**Status**: ✅ Complete (commit pending) — the `headers.test.ts` `style-src` assertion did not already exist, so it was added as planned (no count reduction). SPEC_DEVIATION: rendering `sidebar.tsx` in Vitest required adding a `resolve.alias` for `@` to `vitest.config.mts` (the `@/hooks/use-mobile` / `@/components/ui/*` imports were previously untested and Vitest has no bundler path-alias support by default); this only affects the test runner, not shipped code.

---

### T5: Create `AuthShell`

**What**: Shared centered, card-less column: `<main class="mx-auto flex w-full max-w-sm …">` with `<h1>` title, `<p>` description, `children`, and a footer `<p>`; test asserts order (title before description before children before footer), `max-w-sm`, and absence of `data-slot="card"`.
**Where**: `web/components/auth/auth-shell.tsx`
**Depends on**: T1
**Reuses**: `<main>` classes from `web/app/login/page.tsx:32`
**Requirement**: UI-01, UI-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `auth-shell.test.tsx` covers: element order, `max-w-sm`, no `data-slot="card"`, footer rendered
- [x] Gate check passes: `npm test`
- [x] Test count: 164 tests pass (161 + 3)

**Status**: ✅ Complete (commit pending)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add card-less AuthShell layout`

---

### T6: Create `LoginForm` and wire `/login`

**What**: Move the login form into `LoginForm({ csrfToken, error })` inside `AuthShell` (title "Entrar", footer link to `/signup`); `app/login/page.tsx` becomes `headers()` + `searchParams` → `<LoginForm … />`.
**Where**: `web/components/auth/login-form.tsx` (+ `web/app/login/page.tsx` wiring)
**Depends on**: T5
**Reuses**: form markup + `GENERIC_ERROR` from `web/app/login/page.tsx`
**Requirement**: UI-01, UI-03, UI-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `login-form.test.tsx` covers: `method="post"` + `action="/api/auth/login"`, hidden `csrf_token` with the given value (and empty string when `csrfToken=""`), `name="email"` `type="email"` `autocomplete="email"` `required`, `name="password"` `autocomplete="current-password"` `required`, `error=true` → `role="alert"` with "E-mail ou senha inválidos", `error=false` → no `role="alert"`, footer link `href="/signup"`, no `data-slot="card"`
- [x] `app/login/page.tsx` imports no `Card*`
- [x] Gate check passes: `npm test`
- [x] Test count: 171 tests pass (164 + 7)

**Status**: ✅ Complete (commit pending)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): card-less login screen`

---

### T7: Create `SignupForm` and wire `/signup`

**What**: Same as T6 for signup (title "Criar uma conta", footer link to `/login`, `minLength={12}`, `autoComplete="new-password"`) **without** the password-rules `<ul>`.
**Where**: `web/components/auth/signup-form.tsx` (+ `web/app/signup/page.tsx` wiring)
**Depends on**: T6
**Reuses**: form markup + `GENERIC_ERROR` from `web/app/signup/page.tsx`
**Requirement**: UI-01, UI-03, UI-05, UI-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `signup-form.test.tsx` covers: `action="/api/auth/signup"`, hidden `csrf_token`, `minlength="12"`, `autocomplete="new-password"`, `error=true` → "Não foi possível criar a conta com esses dados", `error=false` → no alert, output contains none of "Pelo menos 12 caracteres" / "Uma letra minúscula e uma maiúscula" / "Um dígito" / "Um símbolo", footer link `href="/login"`
- [x] Gate check passes: `npm test`
- [x] Test count: 177 tests pass (171 + 6)

**Status**: ✅ Complete (commit pending)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): card-less signup screen without password-rule copy`

---

### T8: Create `VerifyEmailForm` and wire `/verify-email`

**What**: Same as T6 for verify-email (title "Verifique sua caixa de entrada", resend form to `/api/auth/resend-verification`, footer link to `/login`, `resent` → non-destructive `Alert`).
**Where**: `web/components/auth/verify-email-form.tsx` (+ `web/app/verify-email/page.tsx` wiring)
**Depends on**: T7
**Reuses**: form markup + `RESENT_MESSAGE` from `web/app/verify-email/page.tsx`
**Requirement**: UI-01, UI-03, UI-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `verify-email-form.test.tsx` covers: `action="/api/auth/resend-verification"`, hidden `csrf_token`, email/password fields with `autocomplete="current-password"`, `resent=true` → `role="alert"` with "Se essa conta existir e ainda precisar de verificação, um novo e-mail está a caminho", `resent=false` → no alert, footer link `href="/login"`
- [x] Gate check passes: `npm test` (also ran `npm run lint && npm run typecheck && npm run build` — last task of Phase 2)
- [x] Test count: 182 tests pass (177 + 5)

**Status**: ✅ Complete (commit pending)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): card-less verify-email screen`

---

### T9: Create `LandingContent` and wire `/`

**What**: Landing body = header (brand + `navLink`), `<h1>` "Projeto Aplicado", neutral description, "Criar uma conta" → `/signup` and "Entrar" → `/login` buttons; the feature `Card` and `FEATURES` list are deleted. `app/page.tsx` keeps `connection()` / `cookies()` / `headerNavLink` and renders `<LandingContent navLink={…} />`.
**Where**: `web/components/landing-content.tsx` (+ `web/app/page.tsx` wiring)
**Depends on**: T1
**Reuses**: `web/lib/nav.ts` `headerNavLink`, header/title/CTA markup from `web/app/page.tsx`
**Requirement**: UI-12, UI-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `landing-content.test.tsx` covers: output contains "Projeto Aplicado", `href="/signup"`, `href="/login"`, and the `navLink.href`/`label` passed in; output contains none of "O que esta demonstração cobre", "OWASP", "Firebase", "CSRF", "CSP", "headers", "força bruta"
- [x] `app/page.tsx` no longer defines `FEATURES` nor imports `Card*`
- [x] Gate check passes: `npm test`
- [x] Test count: 186 tests pass (182 + 4)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): landing page without the security feature list`

**Status**: ✅ Complete (commit pending)

---

### T10: Neutral site description constant

**What**: Add `lib/site.ts` exporting `SITE_NAME = "Projeto Aplicado"` and `SITE_DESCRIPTION` (neutral, pt-BR); `app/layout.tsx` `metadata` reads both; `LandingContent` reuses `SITE_NAME`.
**Where**: `web/lib/site.ts` (+ `web/app/layout.tsx` metadata)
**Depends on**: T9
**Reuses**: `web/app/layout.tsx` `metadata`
**Requirement**: UI-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `lib/site.test.ts` asserts `SITE_DESCRIPTION` is non-empty and, case-insensitively, contains none of "seguro", "OWASP", "verificação", "login", "painel"
- [x] `grep -n "OWASP\|verificação" web/app/layout.tsx` returns nothing
- [x] Gate check passes: `npm test`
- [x] Test count: 187 tests pass (186 + 1)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(web): neutral site metadata description`

**Status**: ✅ Complete (commit pending)

---

### T11: Create `AppSidebar`

**What**: `AppSidebar({ email, csrfToken })`: `Sidebar collapsible="icon"` › header brand › one `SidebarMenuButton asChild isActive` → `<Link href="/dashboard">` "Painel" › footer with `email` and the logout form (`POST /api/auth/logout`, hidden `csrf_token`, "Sair").
**Where**: `web/components/dashboard/app-sidebar.tsx`
**Depends on**: T4
**Reuses**: logout form from `web/app/dashboard/page.tsx:53-62`, `lucide-react` `LayoutDashboard`
**Requirement**: UI-06, UI-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `app-sidebar.test.tsx` (rendered inside `SidebarProvider`) covers: "Projeto Aplicado" in header, exactly one `data-sidebar="menu-button"` element, it wraps `href="/dashboard"` with text "Painel" and `data-active="true"`, footer contains the given `email`, `<form method="post" action="/api/auth/logout"`, hidden `csrf_token` with the given value, submit button text "Sair", no `style=`
- [x] Gate check passes: `npm test`
- [x] Test count: 192 tests pass (187 + 5)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the dashboard AppSidebar`

**Status**: ✅ Complete (commit pending) — the `action`/`method` attribute order asserted in the exact-string done-when criterion is emitted by React as `action` before `method`; the test asserts both as separate substrings (matching the T6 `LoginForm` pattern) rather than one exact-order literal.

---

### T12: Create `DashboardShell` and wire `/dashboard`

**What**: `DashboardShell({ email, csrfToken })` = `SidebarProvider` › `AppSidebar` + `SidebarInset` › header (`SidebarTrigger`, `Separator`, `Breadcrumb` › `BreadcrumbPage` "Painel") › main with `<h1>` "Bem-vindo ao painel" and "Você está autenticado como {email}". `app/dashboard/page.tsx` keeps its guard block byte-for-byte and renders `<DashboardShell email={user.email ?? user.uid} csrfToken={csrfToken} />`.
**Where**: `web/components/dashboard/dashboard-shell.tsx` (+ `web/app/dashboard/page.tsx` wiring)
**Depends on**: T11
**Reuses**: guard block from `web/app/dashboard/page.tsx:25-40`
**Requirement**: UI-07, UI-09, UI-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `dashboard-shell.test.tsx` covers: `data-sidebar="trigger"` present, breadcrumb current page "Painel" (`aria-current="page"`), `<h1>` welcome text, the e-mail appears at least twice (footer + main), whole output has no `style=`, uid edge case (`email="uid-123"` shows "uid-123")
- [x] `git diff web/app/dashboard/page.tsx` touches only imports and the returned JSX (guard block unchanged); `lib/dashboard-guard.test.ts` + `session.test.ts` unchanged and green
- [x] Gate check passes: `npm run lint && npm run typecheck && npm test && npm run build`
- [x] Test count: 197 tests pass (192 + 5)

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): sidebar dashboard shell`

**Status**: ✅ Complete (commit pending)

---

### T13: Update `docs/application.md` screen descriptions

**What**: Describe the three auth screens as one shared centered form and the dashboard as a sidebar shell (brand, "Painel", e-mail + "Sair" footer, breadcrumb header, central welcome); note that security controls are documented in `README.md` / `docs/security.md`, not on the pages. `README.md` and `docs/security.md` untouched.
**Where**: `docs/application.md`
**Depends on**: T12
**Reuses**: existing section structure of `docs/application.md`
**Requirement**: UI-16, UI-17

**Tools**:

- MCP: NONE
- Skill: `docs-writer`

**Done when**:

- [x] `docs/application.md` mentions the shared auth form and the sidebar dashboard
- [x] `git diff --stat` shows only `docs/application.md` (+ `.specs/` traceability)
- [x] `grep -n "OWASP Top 10" README.md` still matches
- [x] Gate check passes: `npm run lint && npm run typecheck && npm test && npm run build`
- [x] Test count: 197 tests pass

**Tests**: none
**Gate**: build

**Commit**: `docs: describe the restyled auth and dashboard screens`

**Status**: ✅ Complete (commit pending)

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4
Phase 2:  (T1) ----→ T5 ------→ T6 ------→ T7 ------→ T8
Phase 3:  (T1) ----→ T9 ------→ T10
Phase 4:  (T4) ----→ T11 -----→ T12 -----→ T13
```

Execution is strictly sequential. 13 tasks → packs into 2 task-budgeted batches (Phases 1+2 = 8 tasks; Phases 3+4 = 5 tasks), so the sub-agent offer applies at Execute.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 config + 1 smoke test | ✅ Granular |
| T2 | 1 CLI command (generated files only) | ✅ Granular |
| T3 | 1 CSS file | ✅ Granular |
| T4 | 1 vendored file + its test (+1 assertion in headers.test) | ⚠️ Cohesive (CSP invariant + its guard) |
| T5 | 1 component | ✅ Granular |
| T6 | 1 component + thin page wiring | ⚠️ Cohesive (page is a 5-line wrapper; splitting leaves an unused component) |
| T7 | 1 component + thin page wiring | ⚠️ Cohesive (same) |
| T8 | 1 component + thin page wiring | ⚠️ Cohesive (same) |
| T9 | 1 component + thin page wiring | ⚠️ Cohesive (same) |
| T10 | 1 constants file + metadata edit | ⚠️ Cohesive |
| T11 | 1 component | ✅ Granular |
| T12 | 1 component + thin page wiring | ⚠️ Cohesive (same) |
| T13 | 1 doc file | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (start) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T1 | T1 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T1 | T1 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T4 | T4 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | vitest config (+ harness smoke) | none / unit | unit | ✅ OK |
| T2 | vendored primitives (unedited) | none | none | ✅ OK |
| T3 | globals.css | none | none | ✅ OK |
| T4 | vendored sidebar (edited) + headers test | unit | unit | ✅ OK |
| T5 | presentational component | unit | unit | ✅ OK |
| T6 | presentational component + page | unit | unit | ✅ OK |
| T7 | presentational component + page | unit | unit | ✅ OK |
| T8 | presentational component + page | unit | unit | ✅ OK |
| T9 | presentational component + page | unit | unit | ✅ OK |
| T10 | site constants + layout | unit | unit | ✅ OK |
| T11 | presentational component | unit | unit | ✅ OK |
| T12 | presentational component + page | unit | unit | ✅ OK |
| T13 | docs | none | none | ✅ OK |
