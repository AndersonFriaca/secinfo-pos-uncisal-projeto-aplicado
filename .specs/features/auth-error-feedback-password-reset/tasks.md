# auth-error-feedback-password-reset Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/auth-error-feedback-password-reset/spec.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase sampling (`web/app/api/auth/signup/route.test.ts`, `web/app/api/auth/login/handler.ts` equivalent, `web/lib/auth/identity-platform.ts` — no test file sampled yet but same layer as signup), plus the spec's ACs. Guidelines found: none dedicated to testing depth (no `AGENTS.md` testing section, no coverage threshold in `vitest.config.ts`) — strong defaults applied, floored by the existing route-handler test depth already in this repo (every branch of `handleSignup` has its own `it`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Route handler (`handler.ts`) | unit | All branches; 1:1 to spec ACs; every listed edge case | `web/app/api/auth/**/route.test.ts` | `npx vitest run app/api/auth/**/route.test.ts` |
| Identity Platform wrapper (`lib/auth/identity-platform.ts`) | unit | New function's success + non-200-collapse paths, matching existing `sendVerificationEmail` test depth | `web/lib/auth/identity-platform.test.ts` | `npx vitest run lib/auth/identity-platform.test.ts` |
| Auth screen component (`components/auth/*.tsx`) | unit (component render) | One case per rendered state (each error code, success state, neither) | `web/components/auth/*.test.tsx` | `npx vitest run components/auth/*.test.tsx` |
| Page (`app/*/page.tsx`) | none | Thin server component (reads headers/searchParams, delegates to the tested form component) — covered indirectly by the form's tests | - | build gate only |

## Gate Check Commands

> Generated from `web/package.json` scripts.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task touching only one handler/lib/component test file | `npx vitest run <path to that test file>` (run from `web/`) |
| Full | After a phase completes | `npx vitest run` (run from `web/`) |
| Build | Before the final commit of the feature | `npm run typecheck && npm run lint && npm run build` (run from `web/`) |

---

## Execution Plan

Single batch, 6 tasks, executed inline (under the ~8-task sub-agent threshold).

### Phase 1: Signup error redirect

```
T1 → T2
```

### Phase 2: Password-reset request flow

```
T3 → T4 → T5
```

### Phase 3: Login entry point

```
T6
```

---

## Task Breakdown

### T1: Signup handler redirects instead of returning raw JSON on rejection

**What**: Every error branch in `handleSignup` (invalid email, weak password, `signUp` rejection, rate-limited, unavailable) returns `redirect("/signup?error=<code>")` (`303`, `cache-control: no-store`) instead of a JSON body. Codes: `invalid`, `rate_limited`, `unavailable`. Success path unchanged.
**Where**: `web/app/api/auth/signup/handler.ts`
**Depends on**: None
**Reuses**: The existing `redirect()` helper already in this file (used today only for the `/verify-email` success path)
**Requirement**: AUTH-18, AUTH-04 (preserved)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All five error branches redirect with the correct code
- [ ] `303` status and `cache-control: no-store` on every redirect
- [ ] Duplicate-email and any other `signUp` `reason: "invalid"` produce byte-identical responses (AUTH-04 regression check)

**Tests**: unit — rewrite `web/app/api/auth/signup/route.test.ts`: malformed email → `error=invalid`; each weak-password case (5 cases) → `error=invalid`, no `signUp` call; duplicate-email vs. any other `invalid` rejection → byte-identical `303` (status + location + body); rate-limited → `error=rate_limited`, no `signUp` call; unavailable → `error=unavailable`
**Gate**: quick — `npx vitest run app/api/auth/signup/route.test.ts`

**Commit**: `fix(web): redirect signup rejections instead of returning raw JSON`

---

### T2: Signup screen renders a distinct message per error code

**What**: `page.tsx` passes the raw `error` string to `SignupForm`; `SignupForm` maps it to one of the three spec-defined messages (falls back to the generic message for anything unrecognized; no `error` param → no Alert, unchanged from today).
**Where**: `web/app/signup/page.tsx`, `web/components/auth/signup-form.tsx`
**Depends on**: T1
**Reuses**: Existing `Alert`/`AlertTitle`/`AuthShell` components, same pattern already in this file
**Requirement**: AUTH-19, UI-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `error="invalid"` (or unrecognized) → "Não foi possível criar a conta com esses dados"
- [ ] `error="rate_limited"` → "Muitas requisições, tente novamente em instantes"
- [ ] `error="unavailable"` → "Serviço temporariamente indisponível"
- [ ] No `error` param → no Alert rendered

**Tests**: unit (component) — new/extended `web/components/auth/signup-form.test.tsx` covering all four states listed above
**Gate**: quick — `npx vitest run components/auth/signup-form.test.tsx`

**Commit**: `feat(web): show distinct signup error message per code`

---

### T3: `identity-platform.ts` — send a password-reset email

**What**: Add `sendPasswordResetEmail(email, opts?)` calling `accounts:sendOobCode` with `{ requestType: "PASSWORD_RESET", email }`, returning `SendEmailResult`, mirroring `sendVerificationEmail`'s error collapsing exactly.
**Where**: `web/lib/auth/identity-platform.ts`
**Depends on**: None
**Reuses**: `callIdentityPlatform`, the `SendEmailResult` type, the same pattern as `sendVerificationEmail`
**Requirement**: AUTH-20 (upstream call)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `sendPasswordResetEmail` exported with the same signature shape as `sendVerificationEmail`
- [ ] Sends `requestType: "PASSWORD_RESET"` and `email` (not `idToken` — this call is unauthenticated, unlike email verification)
- [ ] Non-200 upstream response collapses to `{ ok: false, reason: "invalid" }`

**Tests**: unit — new/extended `web/lib/auth/identity-platform.test.ts`: correct request body sent; non-200 → `{ ok: false, reason: "invalid" }`; 5xx/transport failure → `{ ok: false, reason: "unavailable" }`
**Gate**: quick — `npx vitest run lib/auth/identity-platform.test.ts`

**Commit**: `feat(web): add sendPasswordResetEmail to the identity-platform wrapper`

---

### T4: `POST /api/auth/forgot-password` handler + route

**What**: New route mirroring `signup`'s structure: rate-limit (`auth` bucket) → normalize/validate email → on empty/invalid, redirect `/forgot-password?error=invalid` without calling Identity Platform → otherwise call `sendPasswordResetEmail` and redirect to `/forgot-password?sent=1` **regardless of its result** (no branching on success/failure — the no-enumeration guarantee).
**Where**: `web/app/api/auth/forgot-password/route.ts` (new), `web/app/api/auth/forgot-password/handler.ts` (new)
**Depends on**: T3
**Reuses**: `signup/handler.ts`'s `json`/`redirect`/`readCredentials`-equivalent shape, `checkRateLimit`, `resolveClientIp`, `normalizeEmail`
**Requirement**: AUTH-20, AUTH-21, AUTH-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Valid email → `sendPasswordResetEmail` called with the normalized email, `303` to `/forgot-password?sent=1`
- [ ] Same redirect whether the mocked call returns `{ ok: true }` or `{ ok: false, reason: "invalid" }` (byte-identical response)
- [ ] Empty/malformed email → `/forgot-password?error=invalid`, `sendPasswordResetEmail` never called
- [ ] Rate-limited → `/forgot-password?error=rate_limited`, no upstream call

**Tests**: unit — new `web/app/api/auth/forgot-password/route.test.ts` covering all four `Done when` cases
**Gate**: quick — `npx vitest run app/api/auth/forgot-password/route.test.ts`

**Commit**: `feat(web): add POST /api/auth/forgot-password`

---

### T5: Forgot-password screen

**What**: `page.tsx` (server component, reads `x-csrf-token` + `searchParams` for `sent`/`error`) renders `ForgotPasswordForm` inside `AuthShell`: native form posting to `/api/auth/forgot-password` with hidden `csrf_token` and an email input. `?sent=1` → non-destructive success Alert with the confirmation copy; `?error=invalid`/`?error=rate_limited` → destructive Alert with the matching message.
**Where**: `web/app/forgot-password/page.tsx` (new), `web/components/auth/forgot-password-form.tsx` (new)
**Depends on**: T4
**Reuses**: `AuthShell`, `Alert`/`AlertTitle`, the exact page/form split already used by `signup`/`verify-email`
**Requirement**: AUTH-20, AUTH-21, UI-17, APP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `?sent=1` shows the success confirmation
- [ ] `?error=invalid` and `?error=rate_limited` show their respective destructive Alerts
- [ ] Neither param → plain form, no Alert
- [ ] Form posts to `/api/auth/forgot-password` with a hidden `csrf_token` field

**Tests**: unit (component) — new `web/components/auth/forgot-password-form.test.tsx` covering all four states
**Gate**: quick — `npx vitest run components/auth/forgot-password-form.test.tsx`

**Commit**: `feat(web): add the forgot-password screen`

---

### T6: Login screen links to forgot-password

**What**: Add a `Link` to `/forgot-password` near the password field, same `underline underline-offset-4` styling as the existing signup/login cross-link.
**Where**: `web/components/auth/login-form.tsx`
**Depends on**: None (touches unrelated files; sequenced last so the link target already exists)
**Reuses**: Existing `Link` styling in the same file
**Requirement**: UI-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Link renders with `href="/forgot-password"`
- [ ] Visually consistent with the existing cross-link (same class names)

**Tests**: unit (component) — extend existing `web/components/auth/login-form.test.tsx` to assert the link's `href`
**Gate**: quick — `npx vitest run components/auth/login-form.test.tsx`

**Commit**: `feat(web): link to forgot-password from the login screen`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2
Phase 2:  T3 ------→ T4 ------→ T5
Phase 3:  T6
```

Execution is strictly sequential within a phase; phases run in order (T2 finishes before T3 starts, etc.) even though T3-T5 and T6 have no data dependency on Phase 1 — single batch, one worker, no intra-phase parallelism to exploit.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Signup handler redirect | 1 file (handler.ts) | ✅ Granular |
| T2: Signup UI messages | 2 files (page.tsx thin passthrough + form.tsx), 1 cohesive UI change | ✅ Granular (cohesive) |
| T3: identity-platform.ts new function | 1 function, 1 file | ✅ Granular |
| T4: forgot-password API | 2 files (route.ts thin delegator + handler.ts), 1 endpoint | ✅ Granular (cohesive) |
| T5: forgot-password screen | 2 files (page.tsx thin passthrough + form.tsx), 1 screen | ✅ Granular (cohesive) |
| T6: Login link | 1 file (login-form.tsx) | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | None (start of Phase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | None (start of Phase 2) | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | None (start of Phase 3) | ✅ Match |

---

## Test Co-location Validation

| Task | Tests Field | Matrix Layer | Status |
| --- | --- | --- | --- |
| T1 | unit, route handler | Route handler → unit | ✅ Match |
| T2 | unit, component | Auth screen component → unit | ✅ Match |
| T3 | unit, identity-platform wrapper | Identity Platform wrapper → unit | ✅ Match |
| T4 | unit, route handler | Route handler → unit | ✅ Match |
| T5 | unit, component | Auth screen component → unit | ✅ Match |
| T6 | unit, component | Auth screen component → unit | ✅ Match |
