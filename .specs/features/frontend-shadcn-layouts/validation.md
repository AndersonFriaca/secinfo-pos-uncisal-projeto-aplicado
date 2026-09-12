# Frontend shadcn Layouts Validation

**Date**: 2026-09-12
**Spec**: `.specs/features/frontend-shadcn-layouts/spec.md`
**Diff range**: `d0d6ebe..2027827`
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1–T13 | ✅ Done | All marked complete in `tasks.md`; two `SPEC_DEVIATION` notes (T2 eslint-disable on generated `use-mobile.ts`, T4 `resolve.alias` in `vitest.config.mts`) — both tooling-only, no shipped-behavior change. |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| UI-01: shared shell, no `data-slot="card"` on `/login`,`/signup`,`/verify-email` | HTML contains no `data-slot="card"` | `web/components/auth/auth-shell.test.tsx:33-35` - `expect(html).not.toContain('data-slot="card"')`; reused by `login-form.test.tsx:59`, `landing-content.test.tsx:42` (landing, separate AC) — verify-email/signup pages import only `VerifyEmailForm`/`SignupForm` (no `Card*` import, confirmed by reading `web/app/verify-email/page.tsx`, `web/app/signup/page.tsx`) | ✅ PASS |
| UI-02: centered column, `max-w-sm`, order title→description→fields→footer | order asserted, `max-w-sm` asserted | `web/components/auth/auth-shell.test.tsx:17-31` - `expect(titleIndex)...expect(footerIndex).toBeGreaterThan(childrenIndex)`; `:29-31` `expect(html).toContain("max-w-sm")` | ✅ PASS |
| UI-03: form contract unchanged (method, action, hidden csrf, field names, autocomplete, required, minLength) | exact values per screen | `web/components/auth/login-form.test.tsx:10-11,18-19,31-36`; `signup-form.test.tsx:10-11,18-19,26-27`; `verify-email-form.test.tsx:10-13,20-23` - assert `action="/api/auth/login|signup|resend-verification"`, `name="csrf_token"`+`value=`, `autoComplete="email"/"current-password"/"new-password"`, `minLength="12"`, `required=""` count = 2 | ✅ PASS |
| UI-04: `/login?error` → destructive Alert "E-mail ou senha inválidos"; absent → no `role="alert"` | exact text, exact conditional presence | `login-form.test.tsx:39-45` (error=true → `role="alert"` + `LOGIN_GENERIC_ERROR`="E-mail ou senha inválidos"), `:47-52` (error=false → no `role="alert"`) | ✅ PASS |
| UI-05: `/signup?error` alert text; `/verify-email?resent` alert text | exact texts | `signup-form.test.tsx:30-36` (`SIGNUP_GENERIC_ERROR`="Não foi possível criar a conta com esses dados"); `verify-email-form.test.tsx:26-32` (`RESENT_MESSAGE`="Se essa conta existir e ainda precisar de verificação, um novo e-mail está a caminho") | ✅ PASS |
| UI-06: `Sidebar` header brand, one "Painel" item active, footer email + Sair | exact counts/values | `web/components/dashboard/app-sidebar.test.tsx:15-18` (brand), `:20-27` (exactly 1 `data-sidebar="menu-button"`, `href="/dashboard"`, "Painel", `data-active="true"`), `:29-31` (email), `:34-41` (logout form + "Sair") | ✅ PASS |
| UI-07: `SidebarInset` header has `SidebarTrigger` + `Breadcrumb` "Painel"; main has welcome heading + email | exact assertions | `web/components/dashboard/dashboard-shell.test.tsx:6-11` (`data-sidebar="trigger"`), `:13-19` (`aria-current="page"` + "Painel"), `:21-27` (`<h1` + "Bem-vindo ao painel"), `:29-36` (email ≥2 occurrences) | ✅ PASS |
| UI-08: logout `<form method="post" action="/api/auth/logout">`, hidden csrf, "Sair" button | exact values | `app-sidebar.test.tsx:34-41` - `action="/api/auth/logout"`, `method="post"`, `name="csrf_token"`, `value="the-token"`, "Sair" | ✅ PASS |
| UI-09: dashboard shell SSR HTML has no `style=` | exact absence | `web/components/ui/sidebar.test.tsx:46-49` (whole sidebar tree); `app-sidebar.test.tsx:43-46`; `dashboard-shell.test.tsx:29-36` - all `expect(html).not.toContain("style=")`; confirmed by static check `grep -n "style=" web/components/ui/sidebar.tsx` → no matches | ✅ PASS |
| UI-10: `lib/security/headers.ts` unchanged, `style-src` has no `unsafe-inline`/`unsafe-hashes` | exact CSP value | `web/lib/security/headers.test.ts:25-27` - `expect(csp).toContain("style-src 'self' 'nonce-NONCE123'")`; `headers.ts:33` unchanged (`git diff d0d6ebe..2027827 -- web/lib/security/headers.ts` → empty) | ✅ PASS |
| UI-11: dashboard guard unchanged (redirects, `getSessionState`) | guard block byte-identical | `git diff d0d6ebe..2027827 -- web/app/dashboard/page.tsx` shows only import + returned-JSX changes (Card* → DashboardShell); guard lines (session/redirect logic) untouched; `web/lib/dashboard-guard.ts` diff is empty | ✅ PASS |
| UI-12: `/` HTML excludes 7 security strings | exact absence list | `web/components/landing-content.test.tsx:25-36` - `expect(html).not.toContain(...)` for all 7 strings ("O que esta demonstração cobre", "OWASP", "Firebase", "CSRF", "CSP", "headers", "força bruta") | ✅ PASS |
| UI-13: `/` HTML keeps brand, description, `/signup`+`/login` links, `headerNavLink` | exact presence | `landing-content.test.tsx:6-13` (brand, `/signup`, `/login`); `:15-23` (passed `navLink` rendered) — confirms `headerNavLink` wiring is the sole source of the header link, since `LandingContent` renders only its `navLink` prop; `web/app/page.tsx:22` calls `headerNavLink(user)` | ✅ PASS |
| UI-14: `/signup` HTML excludes 4 password-rule strings | exact absence list | `signup-form.test.tsx:38-47` - `expect(html).not.toContain("Pelo menos 12 caracteres")` etc. (4 strings) | ✅ PASS |
| UI-15: `metadata.description` excludes 5 words | exact absence list, case-insensitive | `web/lib/site.test.ts:7-14` - lowercases `SITE_DESCRIPTION` and checks all 5 forbidden words absent; `layout.tsx:30` uses `SITE_DESCRIPTION` directly for `metadata.description` | ✅ PASS |
| UI-16: README.md / docs/security.md untouched | no deletions, content intact | `git diff d0d6ebe..2027827 -- README.md docs/security.md` → empty (no output) | ✅ PASS |
| UI-17: `docs/application.md` describes shared auth form + sidebar dashboard | descriptive text present | `git diff d0d6ebe..2027827 -- docs/application.md` shows added "## Telas" section naming `AuthShell`, `AppSidebar`+`DashboardShell`, "Painel", "Sair", breadcrumb, welcome message | ✅ PASS |
| UI-18: sidebar off-canvas <768px, opens via trigger | manual UAT only per spec Out of Scope | not automatable — no E2E in this project (spec Out of Scope: "Browser / E2E tests") | ⏭️ not automatable, manual UAT |
| UI-19: sidebar expanded ≥768px | manual UAT only per spec Out of Scope | not automatable | ⏭️ not automatable, manual UAT |

**Status**: ✅ All automatable ACs covered (17/17); UI-18/UI-19 correctly declared manual-UAT, not FAIL. No spec-precision gaps found — every AC in scope defines a precise, testable outcome and the cited assertions target it exactly (not merely "an assertion exists").

### Edge Cases

| Edge case | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| No `email` claim → show `uid` | uid appears in sidebar footer + welcome message | `dashboard-shell.test.tsx:38-43` - `email="uid-123"` → `expect(html).toContain("uid-123")` | ✅ PASS |
| Missing `x-csrf-token` header → hidden input empty value | `value=""` rendered | `login-form.test.tsx:22-25` - `csrfToken=""` → `toMatch(/name="csrf_token" value=""/)` | ✅ PASS |
| JS disabled → forms still submit (plain HTML, no client handlers) | no `onSubmit`/client JS gating | All auth/logout forms are plain `<form method=… action=…>` with no `onSubmit` prop (visually confirmed reading `login-form.tsx`, `signup-form.tsx`, `verify-email-form.tsx`, `app-sidebar.tsx`); not independently asserted by a negative test (no test greps for absence of `onSubmit`) | ⚠️ Spec-precision gap (weak: plausible by construction, not asserted) |

---

## Discrimination Sensor

Isolated scratch: `git worktree add /tmp/verify-fsl HEAD`, `node_modules` symlinked in (no `npm ci`), mutations applied and reverted one at a time, `npx vitest run` per mutation, worktree removed with `git worktree remove --force` afterward. Real-tree `git status --porcelain` confirmed empty before and after (baseline matched).

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `components/ui/sidebar.tsx:127-128` | Re-added `style={{ "--sidebar-width": "16rem" }}` on the `SidebarProvider` wrapper `div` | ✅ Killed — `sidebar.test.tsx` "renders with no style= attribute" failed |
| 2 | `components/auth/login-form.tsx:45` | Changed login form `action` from `/api/auth/login` to `/api/auth/signin` | ✅ Killed — `login-form.test.tsx` "posts to /api/auth/login with method post" failed |
| 3 | `components/dashboard/app-sidebar.tsx:51` | Deleted the hidden `csrf_token` input from the logout form | ✅ Killed — `app-sidebar.test.tsx` "renders a logout form..." failed on missing `name="csrf_token"` |
| 4 | `components/landing-content.tsx:28` | Reinserted "OWASP" into the landing description | ✅ Killed — `landing-content.test.tsx` "contains none of the removed security-control copy" failed |

**Sensor depth**: lightweight (4 mutations; spec required 1–3, exceeded)
**Result**: 4/4 killed - PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — components are thin, pages reduced to async wrappers |
| Surgical changes | ✅ — diff confined to auth/dashboard/landing components, site.ts, globals.css, sidebar vendored file, docs |
| No scope creep | ✅ — no route/API/auth/security-control edits; `headers.ts`/`dashboard-guard.ts`/README/security.md diffs empty |
| Matches patterns | ✅ — follows existing shadcn/ui component conventions and pt-BR copy style |
| Spec-anchored outcome check (asserted values match spec) | ✅ — see table above |
| Per-layer Coverage Expectation met | ✅ — presentational components 1:1 to ACs; vendored primitive has its CSP invariant test; pages/docs correctly left to build-gate-only per the Test Coverage Matrix |
| Every test maps to a spec requirement | ✅ — all new `*.test.tsx`/`.test.ts` files map to UI-01..17 or listed edge cases; `button.test.tsx` maps to T1's enabler requirement (harness smoke test) |
| Documented guidelines followed | ✅ — `web/AGENTS.md`, `web/vitest.config.mts` co-location convention followed |

---

## Gate Check

- **Gate command**: `npm run lint && npm run typecheck && npm test && npm run build` (run in `web/`)
- **Result**: lint ok (0 errors), typecheck ok, **197/197 tests passed across 25 files**, build succeeded (all routes compiled, no errors)
- **Test count before feature**: 157 (baseline per Test Coverage Matrix)
- **Test count after feature**: 197
- **Delta**: +40 new tests
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

None — clean PASS, no gaps requiring fixes. One minor spec-precision gap noted for the "JS disabled" edge case (plausible by construction but not asserted by a negative test); not blocking given the project's stated "unit tests only" policy and the plain-HTML-form pattern used consistently across all forms.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| UI-01..UI-17 | Implementing | ✅ Verified |
| UI-18, UI-19 | Pending (Design) | ⏭️ Not automatable — manual UAT (per spec Out of Scope) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 17/17 automatable ACs matched spec outcome; manual-UAT: UI-18, UI-19; 1 minor spec-precision gap (JS-disabled edge case, not independently asserted)

**Sensor**: 4/4 mutations killed

**Gate**: 197 passed, 0 failed; lint/typecheck/build ok

**What works**: All auth screens (login/signup/verify-email) share the card-less `AuthShell`; form contracts (method/action/csrf/fields/autocomplete/minLength) are unchanged and precisely asserted; dashboard renders `AppSidebar` + `DashboardShell` with no `style=` attributes anywhere, satisfying the nonce-only CSP; `headers.ts` and `dashboard-guard.ts` are byte-unchanged; all security copy removed from `/` and `/signup` with exact negative assertions; `docs/application.md` updated, `README.md`/`docs/security.md` untouched.

**Issues found**: None blocking. The "JS disabled → forms still submit" edge case is true by construction (plain HTML forms, no `onSubmit` handlers found anywhere in the diff) but has no dedicated negative test — recorded as a lesson below since it's a recurring shape (edge cases proven by absence of client JS rather than by an assertion).

**Next steps**: None required for this feature. Optional future hardening: a lint rule or test asserting no `onSubmit`/`"use client"` on auth-form components, if this project accumulates more form components.
