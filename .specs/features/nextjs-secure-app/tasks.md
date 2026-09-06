# Next.js Secure Application — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/nextjs-secure-app/design.md`
**Status**: Approved — planning complete, Execute not yet started

## Confirmed execution decisions

Agreed with the user at task-approval time; apply these when Execute runs:

- **Delegation**: sub-agent batches (~5 batches of ~6-7 tasks, whole phases, sequential — a batch never starts before the previous one reports every task complete).
- **Skills per task**: invoke `coding-guidelines` for every code-writing task; add `react-best-practices` for Phase 4 (`proxy.ts`/SSR) and Phase 7 (screens); use `docs-writer` for T29.
- **Tools**: standard Read/Write/Edit/Bash. No MCP servers are configured for this project.
- **Per-task `Tools` blocks below still read `Skill: NONE`** — these three lines override them; they were written before the decision.

---

## Test Coverage Matrix

> Generated from the spec, the design, and the toolchain — confirm before Execute. Guidelines found: none as files (`AGENTS.md`/`CONTRIBUTING.md` do not exist, and the app is greenfield with no existing tests to sample), but the **spec itself** fixes the testing contract in story "Unit tests and the pull-request gate" (TEST-01..04): Vitest unit tests covering password validation, email normalisation, the brute-force limiter, the general rate limiter, CSRF generation/comparison, the security-header builder, and session verification — asserting spec-defined outcomes, never call counts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Pure security & validation modules (`web/lib/security/*`, `web/lib/validation/*`) | unit | All branches; 1:1 to the spec ACs the module implements; every listed edge case has a test (threshold at the 5th failure, the 60-second boundary, constant-time comparison, each header value) | `web/lib/**/*.test.ts` | `npm test` |
| Auth modules (`web/lib/auth/*`) | unit | Happy path + every documented error branch: invalid credentials collapse to one generic result, upstream 5xx maps to unavailable, expired/revoked session returns null, unverified email is rejected | `web/lib/**/*.test.ts` | `npm test` |
| Edge gate (`web/proxy.ts`) | unit | Every header the spec names is asserted by value; accept and reject branches for both the Origin check and the CSRF comparison | `web/proxy.test.ts` | `npm test` |
| Route Handlers (`web/app/api/**`) | unit (handler invoked directly, upstream deps injected/mocked) | Each route: happy path + each listed edge case + each error path, asserting status code, `Location`/`Set-Cookie`, and body message | `web/app/api/**/*.test.ts` | `npm test` |
| Server Components / pages (`web/app/**/page.tsx`, `layout.tsx`) | none — build gate only | Rendering shells with no branching logic of their own; the dashboard's guard rule lives in `web/lib/auth/session.ts` (`getAuthenticatedUser`) and is unit-tested there | `web/app/**/*.tsx` | `npm run build` |
| Terraform config (`infra/*.tf`) | static validation | `terraform fmt -check` clean, `terraform validate` passes | `infra/**/*.tf` | `terraform fmt -check -recursive infra && terraform -chdir=infra validate` |
| Startup shell script (`infra/scripts/startup.sh.tpl`) | static (shell syntax) | `bash -n` parses after Terraform interpolations are stripped | `infra/scripts/*.sh.tpl` | `bash -n <(sed 's/\${[^}]*}/x/g' infra/scripts/startup.sh.tpl)` |
| GitHub Actions workflows (`.github/workflows/*.yml`) | static (YAML parse + trigger assertion) | Parses as YAML; the PR workflow triggers on `pull_request` to `main` and runs the test step; the deploy workflow triggers on `push` to `main` and contains no service-account key | `.github/workflows/*.yml` | `python3 -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))"` |
| Documentation (`README.md`, `docs/**`) | none | Verified by the task's own `Done when` checks (every cited path exists) | — | — |

**Live verification (operator, post-deploy):** the spec's per-story "Independent Test" sections need a running VM and a real GCP project (`curl -sI` header checks, six-failed-login brute-force check, signup/verify/login/logout walkthrough). This session has `terraform` and `gcloud` but **no authenticated GCP account and no deployed app**, so those are explicitly deferred to the operator and listed in the final task's handoff note — never silently marked done.

## Gate Check Commands

> Generated from the toolchain this project actually uses - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After any task adding or changing a `web/` module with unit tests | `cd web && npm test` |
| Full | After a task that changes app code and its public surface (routes, proxy, config) | `cd web && npm run lint && npm run typecheck && npm test` |
| Terraform | After any task touching `infra/*.tf` | `terraform fmt -check -recursive infra && terraform -chdir=infra validate && terraform -chdir=infra/bootstrap validate` |
| Shell | After any task touching `infra/scripts/startup.sh.tpl` | `bash -n <(sed 's/\${[^}]*}/x/g' infra/scripts/startup.sh.tpl)` |
| Workflow | After any task touching `.github/workflows/*.yml` | `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml` |
| Build | Final task, and after any task that could break the production build | `cd web && npm run lint && npm run typecheck && npm test && npm run build` + Terraform gate + Shell gate + `git status --porcelain` clean + `git ls-files` free of secrets |

---

## Task Breakdown

Every task (`#### T1` .. `#### T30`) is nested directly under its own phase inside the **Execution Plan** below, so phase membership is unambiguous: a task heading only ever appears between its own `### Phase N` header and the next one.

## Execution Plan

Phases run in order; tasks run in order within a phase. 30 tasks total → packs into roughly 5 batches at the ~7-task worker budget (cut only ever lands on a phase boundary). The sub-agent offer is presented before Execute begins.

---

### Phase 1: Scaffold and tooling

```
T1 → T2 → T3
```

#### T1: Scaffold the Next.js app

**What**: Create the Next.js 16 App Router project in `web/` with TypeScript, configured for standalone output and with the `X-Powered-By` header disabled.
**Where**: `web/next.config.ts`
**Depends on**: None
**Reuses**: n/a (greenfield app)
**Requirement**: APP-02, SEC-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `web/` contains a Next.js 16 App Router project in TypeScript (`package.json`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx` placeholder)
- [x] `next.config.ts` sets `output: "standalone"` and `poweredByHeader: false`
- [x] `next.config.ts` does NOT set `output: "export"` (SSR is required)
- [x] `web/.gitignore` (or the root one) excludes `node_modules/`, `.next/`, and `.env*`
- [x] `cd web && npm run build` succeeds

**Tests**: none (scaffold; covered by the build gate)
**Gate**: Build
**Commit**: `feat(web): scaffold next.js app with standalone output`
**Status**: [x] Complete

---

#### T2: Wire up Vitest, lint, and typecheck scripts

**What**: Add Vitest and the `test`, `lint`, and `typecheck` npm scripts the CI gate will run.
**Where**: `web/vitest.config.ts`
**Depends on**: T1
**Reuses**: The scaffold's ESLint config from T1
**Requirement**: TEST-01, TEST-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Vitest installed and configured (node environment, `web/**/*.test.ts` picked up)
- [x] `package.json` exposes `test` (non-watch, exits non-zero on failure), `lint`, and `typecheck`
- [x] A trivial smoke test exists and passes, proving the runner is wired
- [x] `npm test`, `npm run lint`, and `npm run typecheck` all exit 0

**Tests**: unit (the smoke test)
**Gate**: Full
**Commit**: `build(web): add vitest, lint and typecheck scripts`
**Status**: [x] Complete

---

#### T3: Install shadcn/ui and the components the screens need

**What**: Initialise shadcn/ui (Tailwind) and add the component set the four screens use.
**Where**: `web/components.json`
**Depends on**: T2
**Reuses**: n/a
**Requirement**: APP-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] shadcn/ui initialised; `web/components/ui/` contains at least `button`, `input`, `label`, `card`, and `alert`
- [x] Fonts are self-hosted via `next/font` (no external CDN request), so `COEP: require-corp` stays satisfiable
- [x] `npm run build` still succeeds

**Tests**: none (vendored UI primitives; build gate only)
**Gate**: Build
**Commit**: `feat(web): add shadcn/ui component primitives`
**Status**: [x] Complete

---

### Phase 2: Pure security primitives

```
T4 → T5 → T6
```

#### T4: Credential validation module

**What**: Email normalisation and password-strength validation as pure functions.
**Where**: `web/lib/validation/credentials.ts`
**Depends on**: T2
**Reuses**: n/a
**Requirement**: AUTH-02, AUTH-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `normalizeEmail` trims, lowercases, rejects non-RFC shapes and anything over 254 characters, returning `null` on rejection
- [x] `validatePassword` enforces ≥12 characters with at least one lowercase, one uppercase, one digit, and one symbol, returning which rule failed
- [x] Unit tests assert each rule independently, including a password failing exactly one rule at a time and a 254/255-character email boundary pair
- [x] Quick gate passes; test count recorded in the commit body

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add email and password validation`
**Status**: [x] Complete

---

#### T5: OWASP security-header builder

**What**: One pure function producing the complete OWASP response-header set, including the nonce-based CSP.
**Where**: `web/lib/security/headers.ts`
**Depends on**: T4
**Reuses**: n/a
**Requirement**: SEC-08, SEC-09, SEC-10, SEC-11, SEC-13, SEC-14, SEC-15, SEC-16, SEC-17, SEC-18, SEC-19, SEC-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `buildSecurityHeaders({ nonce, isDev, sensitive })` returns CSP (`default-src 'self'`, `script-src 'self' 'nonce-X' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`), `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 0`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()`, and all three `Cross-Origin-*` headers
- [x] `sensitive: true` adds `Cache-Control: no-store`
- [x] Production output contains neither `'unsafe-inline'` nor `'unsafe-eval'`; `isDev: true` adds `'unsafe-eval'` only
- [x] The result never contains `Access-Control-Allow-Origin`, `Expect-CT`, `Public-Key-Pins`, or `X-Powered-By`
- [x] Unit tests assert every header **by value** (not merely present), plus the absence assertions above
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add owasp security header builder`
**Status**: [x] Complete

---

#### T6: CSRF token generation and constant-time verification

**What**: Cryptographically random CSRF tokens and a comparison that does not leak timing.
**Where**: `web/lib/security/csrf.ts`
**Depends on**: T5
**Reuses**: n/a
**Requirement**: SEC-21, SEC-22, SEC-24

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `generateCsrfToken()` returns ≥32 bytes of Web Crypto randomness, base64url-encoded; two calls never collide
- [x] `verifyCsrfToken(submitted, cookie)` returns false when either side is null/empty or lengths differ, and otherwise compares every byte without early exit
- [x] The implementation uses Web Crypto only, so the module loads on both Edge and Node runtimes
- [x] Unit tests cover: match, mismatch, missing submitted, missing cookie, differing lengths, and that the token is not derived from any input (two calls with identical context differ)
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add csrf token generation and constant-time verification`
**Status**: [x] Complete

---

### Phase 3: Rate limiting and brute-force blocking

```
T7 → T8
```

#### T7: Rate-limit core logic with an injected store and clock

**What**: The pure decision logic — window counting, the 5-failure threshold, the 60-second block, and reset-on-success — with the store and clock injected so it is fully testable.
**Where**: `web/lib/security/rate-limit-core.ts`
**Depends on**: T6
**Reuses**: n/a
**Requirement**: SEC-01, SEC-02, SEC-04, SEC-05, SEC-25, SEC-26, SEC-27

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Exposes the decision functions for the `auth` bucket (10 req/min) and `general` bucket (100 req/min), plus login-failure counting
- [x] The 5th consecutive failure sets `blockedUntil = now + 60_000`; the 4th does not
- [x] A successful login resets the failure counter to 0
- [x] At exactly `blockedUntil` the IP is allowed again with a zeroed counter; one millisecond earlier it is still blocked
- [x] Thresholds are parameters, not literals at the call sites
- [x] Unit tests drive `now` explicitly and assert the transitions at the 4th failure, the 5th failure, the 60-second boundary, and the window rollover for both buckets — no `sleep` in the suite
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add rate limit and brute force core logic`
**Status**: [x] Complete

---

#### T8: Firestore-backed store with the in-memory L1 cache

**What**: The persistence adapter — transactional Firestore reads/writes plus the in-process cache that short-circuits already-blocked IPs.
**Where**: `web/lib/security/rate-limit.ts`
**Depends on**: T7
**Reuses**: `web/lib/security/rate-limit-core.ts` (T7) for every decision; this module only stores and caches
**Requirement**: SEC-03, SEC-06, SEC-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Reads/writes `rate_limits/{ip}` inside a Firestore transaction so concurrent requests cannot skip the threshold
- [x] An IP whose `blockedUntil` is cached and still in the future is rejected with **zero** store calls (assert the fake store records no read and no write)
- [x] Client IP resolution takes the left-most `X-Forwarded-For` entry and falls back to the socket address when the header is absent
- [x] A store failure during a **login** check propagates as an error (fail closed); a store failure in the `general` bucket resolves to allowed (fail open)
- [x] Unit tests use an injectable fake store that counts calls — asserting the L1 short-circuit, the transaction path, the fail-closed login branch, the fail-open general branch, and both IP-resolution branches
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add firestore rate limit store with in-memory cache`
**Status**: [x] Complete

---

### Phase 4: Edge security gate

```
T9 → T10
```

#### T9: proxy.ts — CSP nonce and the security header set

**What**: The Edge-runtime gate that generates a per-request nonce and applies every security header.
**Where**: `web/proxy.ts`
**Depends on**: T5
**Reuses**: `web/lib/security/headers.ts` (T5)
**Requirement**: SEC-08, SEC-09, SEC-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The file is `web/proxy.ts` exporting `proxy(request)` — Next.js 16's convention, **not** `middleware.ts`/`middleware()`
- [x] A fresh nonce per request is set both on the forwarded request (`x-nonce`) and inside the CSP response header, following the Next.js 16 CSP guide so the framework applies it to its own scripts
- [x] `export const config.matcher` excludes `_next/static`, `_next/image`, and `favicon.ico`, and **includes** `/api` (unlike the Next.js sample) because API routes need the Origin and CSRF checks from T10
- [x] It imports nothing from `firebase-admin` or the Firestore SDK — the Edge runtime cannot load them
- [x] Unit tests invoke `proxy()` with a constructed `NextRequest` and assert: every header present with its expected value, and that two consecutive calls produce different nonces
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add edge proxy with csp nonce and security headers`
**Status**: [x] Complete

---

#### T10: proxy.ts — same-origin and CSRF enforcement

**What**: Reject cross-origin and forged state-changing requests before any handler runs.
**Where**: `web/proxy.ts`
**Depends on**: T9, T6
**Reuses**: `web/lib/security/csrf.ts` (T6)
**Requirement**: SEC-12, SEC-13, SEC-22, SEC-23

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `POST|PUT|PATCH|DELETE` require `Origin` (falling back to `Referer`) to equal the app's own origin, else HTTP 403
- [x] The same methods require the submitted CSRF token to match the cookie via the constant-time comparison, else HTTP 403
- [x] Any `/api/*` request with a foreign `Origin` is rejected 403 and **no** `Access-Control-Allow-Origin` header is emitted on any path
- [x] `GET`/`HEAD` are not subject to the CSRF check
- [x] Unit tests cover: same-origin + valid token → passes; foreign origin → 403; missing/absent token → 403; mismatched token → 403; missing `Origin` but matching `Referer` → passes; `GET` with no token → passes
- [x] Full gate passes

**Tests**: unit
**Gate**: Full
**Commit**: `feat(web): enforce same-origin and csrf in edge proxy`
**Status**: [x] Complete

---

### Phase 5: Auth server modules

```
T11 → T12
```

#### T11: Identity Platform REST client

**What**: The only module that talks to Identity Platform, collapsing upstream errors into safe generic results.
**Where**: `web/lib/auth/identity-platform.ts`
**Depends on**: T4
**Reuses**: `web/lib/validation/credentials.ts` (T4) for the inputs it receives already normalised
**Requirement**: AUTH-01, AUTH-03, AUTH-04, AUTH-07, AUTH-10, AUTH-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Implements `signUp`, `signInWithPassword`, and `sendVerificationEmail` against `https://identitytoolkit.googleapis.com/v1/accounts:signUp|signInWithPassword|sendOobCode`, passing the API key as the `key` query parameter and reading it from a server-only environment variable
- [x] `sendVerificationEmail` posts `{ requestType: "VERIFY_EMAIL", idToken }` so Google sends the mail — no SMTP dependency
- [x] Every upstream 400 (`EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `INVALID_LOGIN_CREDENTIALS`, `EMAIL_EXISTS`) collapses to one generic failure result; upstream 5xx and a missing API key map to a distinct "unavailable" result
- [x] The API key never appears in a thrown error, a log line, or a returned value
- [x] Unit tests mock `fetch` and assert: the exact URL and body for each call, that two different 400 codes produce byte-identical generic results, that 5xx maps to unavailable, and that no assertion of the key leaks into an error message
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add server-side identity platform rest client`
**Status**: [x] Complete

---

#### T12: Session cookie management and the dashboard guard

**What**: Mint, verify, and revoke Firebase session cookies, plus the `getAuthenticatedUser` guard the dashboard calls.
**Where**: `web/lib/auth/session.ts`
**Depends on**: T11
**Reuses**: n/a
**Requirement**: AUTH-08, AUTH-11, AUTH-13, AUTH-14, AUTH-16, AUTH-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `createSession(idToken)` calls `createSessionCookie` with a 12-hour expiry; `sessionCookieOptions()` returns `httpOnly: true`, `secure: true`, `sameSite: "strict"`, `path: "/"`, `maxAge: 43200`
- [x] `verifySession(cookie)` calls `verifySessionCookie(cookie, true)` — `checkRevoked` must be true — and returns `null` on any failure instead of throwing
- [x] `revokeSession(uid)` calls `revokeRefreshTokens`
- [x] `getAuthenticatedUser(cookieValue)` returns the user only when the cookie verifies **and** `email_verified` is true; returns `null` for a missing cookie, an invalid cookie, a revoked session, or an unverified email
- [x] The Admin SDK is injected (or module-mocked) so tests need no GCP credentials
- [x] Unit tests cover all four `getAuthenticatedUser` null branches plus the success branch, assert `checkRevoked: true` is actually passed, and assert every cookie attribute by value
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add firebase session cookie management and auth guard`
**Status**: [x] Complete

---

### Phase 6: Auth route handlers

```
T13 → T14 → T15 → T16
```

#### T13: Signup route handler

**What**: `POST /api/auth/signup` — validate, create the account, trigger the verification email.
**Where**: `web/app/api/auth/signup/route.ts`
**Depends on**: T8, T11
**Reuses**: `credentials.ts` (T4), `identity-platform.ts` (T11), `rate-limit.ts` (T8)
**Requirement**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Rate-limits the `auth` bucket first, then validates, then calls Identity Platform
- [x] A valid submission returns 303 to `/verify-email` and triggers `sendVerificationEmail`
- [x] A weak password returns 400 naming the failed rule and **never** calls Identity Platform (assert the mock was not invoked)
- [x] An already-registered email returns the same generic 400 body as any other signup rejection — byte-identical
- [x] The response carries `Cache-Control: no-store`
- [x] Unit tests cover: success, each password rule failure, malformed email, duplicate email, and rate-limited (429)
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add signup route handler`
**Status**: [x] Complete

---

#### T14: Login route handler with brute-force integration

**What**: `POST /api/auth/login` — the full chain: block check, rate limit, credential exchange, verification check, session cookie.
**Where**: `web/app/api/auth/login/route.ts`
**Depends on**: T13, T12
**Reuses**: `rate-limit.ts` (T8), `identity-platform.ts` (T11), `session.ts` (T12)
**Requirement**: AUTH-07, AUTH-08, AUTH-09, AUTH-10, AUTH-11, AUTH-12, SEC-01, SEC-02, SEC-03, SEC-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Valid credentials for a verified account → 303 to `/dashboard` with `Set-Cookie` carrying the session cookie and every attribute from T12
- [x] Invalid credentials → 401 with the generic message and the IP's failure counter incremented
- [x] Unknown email and wrong password produce **byte-identical** responses
- [x] A verified-but-unverified-email account → 303 to `/verify-email` and **no** session cookie set
- [x] A blocked IP → 429 with `Retry-After: 60`, and Identity Platform is **not** called (assert the mock was not invoked)
- [x] Identity Platform 5xx or a rate-limit store failure → 503 with a generic body, upstream detail logged server-side only
- [x] A successful login resets the failure counter
- [x] Unit tests cover every branch above, asserting status, `Location`, `Set-Cookie` presence/absence, and the exact `Retry-After` value
- [x] Full gate passes

**Tests**: unit
**Gate**: Full
**Commit**: `feat(web): add login route handler with brute force protection`
**Status**: [x] Complete

---

#### T15: Logout route handler

**What**: `POST /api/auth/logout` — revoke the session and clear the cookie.
**Where**: `web/app/api/auth/logout/route.ts`
**Depends on**: T14
**Reuses**: `session.ts` (T12)
**Requirement**: AUTH-15, AUTH-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Revokes refresh tokens for the session's uid, clears the cookie with `Max-Age=0`, and returns 303 to `/`
- [x] Replaying the old cookie afterwards fails verification — covered by asserting `revokeSession` was called with the right uid and that `verifySession` returns null once revoked in the fake
- [x] A logout request with no valid session still clears the cookie and returns 303 (idempotent, no 500)
- [x] Unit tests cover: authenticated logout, logout with no cookie, logout with an already-invalid cookie
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add logout route handler`
**Status**: [x] Complete

---

#### T16: Resend-verification route handler

**What**: `POST /api/auth/resend-verification` — rate-limited resend of the verification email.
**Where**: `web/app/api/auth/resend-verification/route.ts`
**Depends on**: T15
**Reuses**: `identity-platform.ts` (T11), `rate-limit.ts` (T8)
**Requirement**: AUTH-03, AUTH-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Requires valid credentials or an existing unverified session before resending, so the endpoint cannot be used to spray mail at arbitrary addresses
- [x] Applies the `auth` rate-limit bucket; exceeding it returns 429 with `Retry-After`
- [x] Returns the same generic acknowledgement whether or not the address exists (no enumeration)
- [x] Unit tests cover: successful resend, rate-limited, and unknown address returning the identical acknowledgement
- [x] Quick gate passes

**Tests**: unit
**Gate**: Quick
**Commit**: `feat(web): add resend verification route handler`
**Status**: [x] Complete

---

### Phase 7: Screens

```
T17 → T18 → T19 → T20 → T21
```

#### T17: Root layout with CSRF cookie seeding

**What**: The shared layout that issues the CSRF cookie and applies the nonce-aware document shell.
**Where**: `web/app/layout.tsx`
**Depends on**: T10, T3
**Reuses**: `csrf.ts` (T6), shadcn primitives (T3)
**Requirement**: SEC-21, APP-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Issues the CSRF cookie (`SameSite=Strict`, `Secure`) when absent, and exposes the current token to forms
- [x] Sets `lang`, self-hosted fonts via `next/font`, and no external resource references (keeps `COEP: require-corp` satisfiable)
- [x] Renders without any CSP violation in production mode (no inline style/script outside the nonce)
- [x] `npm run build` succeeds

**Tests**: none (shell; the CSRF logic it calls is unit-tested in T6)
**Gate**: Build
**Commit**: `feat(web): add root layout with csrf cookie seeding`
**Status**: [x] Complete

**Implementation note**: the CSRF cookie is seeded in `web/proxy.ts` (the Edge gate every request already passes through), not `web/app/layout.tsx` — Next.js 16 forbids `cookies().set()` during Server Component rendering ("Setting cookies is not supported during Server Component rendering", `cookies` API reference). The proxy forwards the token as the `x-csrf-token` request header so the layout and form pages can embed it.

---

#### T18: Public landing page

**What**: The SSR public home page with links into login and signup.
**Where**: `web/app/page.tsx`
**Depends on**: T17
**Reuses**: shadcn `card`/`button` (T3), `session.ts` (T12) to decide which header link to show
**Requirement**: APP-01, APP-02, APP-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Returns 200 with the project name, a short description, and links to `/login` and `/signup`
- [x] Calls `await connection()` (or equivalent) to force dynamic rendering so the CSP nonce applies
- [x] An authenticated, verified visitor still gets 200, with the header link pointing at `/dashboard`
- [x] The rendered HTML contains no Firebase config object and no `NEXT_PUBLIC_` auth value
- [x] `npm run build` succeeds

**Tests**: none (rendering shell; the auth decision it delegates to is unit-tested in T12)
**Gate**: Build
**Commit**: `feat(web): add public landing page`
**Status**: [x] Complete

---

#### T19: Login screen

**What**: The login form posting to the login route with the CSRF token.
**Where**: `web/app/login/page.tsx`
**Depends on**: T18, T14
**Reuses**: shadcn `input`/`label`/`button`/`alert` (T3)
**Requirement**: APP-03, SEC-21

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Renders an email + password form built from shadcn primitives, posting to `/api/auth/login`
- [x] Includes the CSRF token as a hidden field matching the cookie
- [x] Displays the generic error message returned by the route without revealing which field was wrong
- [x] `npm run build` succeeds

**Tests**: none (form shell; validation and error semantics are unit-tested in T4 and T14)
**Gate**: Build
**Commit**: `feat(web): add login screen`
**Status**: [x] Complete

---

#### T20: Signup and verify-email screens

**What**: The signup form and the "check your inbox" screen with a resend action.
**Where**: `web/app/signup/page.tsx`
**Depends on**: T19, T13
**Reuses**: shadcn primitives (T3), the login form's structure (T19)
**Requirement**: APP-03, AUTH-01, AUTH-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The signup form posts to `/api/auth/signup` with the CSRF token and states the password rules up front
- [x] `web/app/verify-email/page.tsx` explains the pending verification and offers a resend posting to `/api/auth/resend-verification`
- [x] `npm run build` succeeds

**Tests**: none (form shells; the rules and endpoints they exercise are unit-tested in T4, T13, and T16)
**Gate**: Build
**Commit**: `feat(web): add signup and verify-email screens`
**Status**: [x] Complete

---

#### T21: Authenticated dashboard with logout

**What**: The protected page that verifies the session server-side on every request and offers logout.
**Where**: `web/app/dashboard/page.tsx`
**Depends on**: T20, T15
**Reuses**: `getAuthenticatedUser` from `session.ts` (T12), shadcn primitives (T3)
**Requirement**: AUTH-13, AUTH-14, AUTH-16, AUTH-17, SEC-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Calls `getAuthenticatedUser` on every request — no cached client-side flag — and redirects to `/login` (303) when it returns null
- [x] Renders the authenticated user's email and a logout button posting to `/api/auth/logout` with the CSRF token
- [x] The response carries `Cache-Control: no-store`
- [x] `npm run build` succeeds

**Tests**: none (shell; the guard's five branches are unit-tested in T12)
**Gate**: Build
**Commit**: `feat(web): add authenticated dashboard with logout`
**Status**: [x] Complete

**Implementation notes**: (1) `Cache-Control: no-store` for `/dashboard` is applied in `web/proxy.ts` (`sensitive: true` when the path starts with `/dashboard`) — a page render cannot set a response header. (2) `redirect("/login")` issues 307, not the spec's 303; both are a GET navigation and the guard's branches are unit-tested in T12 (marked `SPEC_DEVIATION` in the file).

---

### Phase 8: Terraform — GCP resources for the app

```
T22 → T23 → T24
```

#### T22: Enable APIs and configure Identity Platform

**What**: Turn on the services the app needs and enable email/password sign-in.
**Where**: `infra/app.tf`
**Depends on**: None
**Reuses**: The existing provider config in `infra/main.tf` (`user_project_override`, `billing_project`) — already required for this class of API
**Requirement**: TF-01, TF-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `google_project_service` resources enable `identitytoolkit.googleapis.com`, `firestore.googleapis.com`, and `iamcredentials.googleapis.com`
- [x] `google_identity_platform_config` sets `sign_in.email.enabled = true` and `password_required = true`, with `depends_on` the API enablement
- [x] Terraform gate passes

**Tests**: none (Terraform config layer; static validation is the gate)
**Gate**: Terraform
**Commit**: `feat(infra): enable identity platform with email sign-in`
**Status**: [x] Complete

---

#### T23: Firestore database

**What**: The Native-mode Firestore database backing the rate-limit counters.
**Where**: `infra/firestore.tf`
**Depends on**: T22
**Reuses**: `var.region` from `infra/variables.tf`
**Requirement**: TF-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `google_firestore_database` in Native mode with `location_id` matching the VM's region (`us-east1`), depending on the API enablement from T22
- [x] A comment records the free-tier quotas it must stay inside (1 GiB, 50k reads/day, 20k writes/day)
- [x] Terraform gate passes

**Tests**: none (Terraform config layer)
**Gate**: Terraform
**Commit**: `feat(infra): add firestore database for rate limit counters`
**Status**: [x] Complete

---

#### T24: Workload Identity Federation and the deploy service account

**What**: GitHub Actions' keyless path into GCP, scoped to this repository and to the minimum roles.
**Where**: `infra/wif.tf`
**Depends on**: T23
**Reuses**: `var.project_id`; outputs go in `infra/outputs.tf`
**Requirement**: TF-04, TF-05, TF-06, TF-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `google_iam_workload_identity_pool` + `google_iam_workload_identity_pool_provider` with `oidc.issuer_uri = "https://token.actions.githubusercontent.com"` and `attribute_mapping` covering `google.subject`, `attribute.repository`, and `attribute.repository_owner`
- [x] An `attribute_condition` restricts the provider to this repository — without it any GitHub repo could assume the service account
- [x] A deploy service account is bound with `roles/iam.workloadIdentityUser` via a `principalSet://` member scoped to this repository; `roles/compute.instanceAdmin.v1` and `roles/iap.tunnelResourceAccessor` are bound to the app VM instance only, and `roles/iam.serviceAccountUser` to the VM's attached service account only; its sole project-scoped grant is one minimal custom role `deployVmOperator` (`compute.projects.get`, `compute.instances.list`, `compute.zoneOperations.get`, `compute.globalOperations.get` — read/list/operations-get only) — **no predefined project role**, never `roles/owner` or `roles/editor` (tightened in Amendment 2, custom role added for G1)
- [x] `iap.googleapis.com` is enabled (in `infra/app.tf`) and an `allow-iap-ssh` firewall rule opens `tcp:22` from `35.235.240.0/20` so the keyless deploy can reach sshd
- [x] **Verify the exact `principalSet://` member format and whether `attribute_condition` is provider-required against the current Terraform provider documentation before applying** — the design flags this as easy to get subtly wrong, and a wrong member fails silently
- [x] Outputs expose the WIF provider resource name and the deploy service-account email for copying into GitHub secrets
- [x] Terraform gate passes
- [x] No credential value is written into any committed file

**Tests**: none (Terraform config layer)
**Gate**: Terraform
**Commit**: `feat(infra): add workload identity federation for github actions`
**Status**: [x] Complete

**Verification note**: `principalSet://` member format confirmed against `google-github-actions/auth` README — `principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${OWNER}/${REPO}`, where `${POOL_NAME}` is the full pool resource name exported as `google_iam_workload_identity_pool.github.name`. `attribute_condition` is not enforced by the provider schema (hashicorp/google 5.45.2) but is required in practice — GCP rejects a GitHub OIDC provider mapping `google.subject` without one, and it is the primary guard against any repository entering the pool. Restricted to `assertion.repository_owner`; the per-repo `principalSet` member narrows impersonation to the exact repo. `attribute_condition` provider-required: NO; practically required: YES.

---

### Phase 9: VM runtime

```
T25 → T26
```

#### T25: Install Node.js 24 and prepare the app directory

**What**: Replace the distribution's Node 18 with Node 24 LTS, create the dedicated locked `appsvc` user, and make `/opt/app` owned by `appsvc`.
**Where**: `infra/scripts/startup.sh.tpl`
**Depends on**: None
**Reuses**: The existing idempotency-guard style already used by every stage in this script
**Requirement**: VM-01, VM-02, VM-03, VM-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Node.js 24 LTS is installed from NodeSource instead of the `apt` `nodejs` package, guarded so a re-run is a no-op
- [x] The guard checks the **installed major version** (`-lt` the required major), not merely that `node` exists — a pre-existing Node 18 must be upgraded, not skipped
- [x] PM2 install and `pm2 startup` registration still work after the change, retargeted to the dedicated locked `appsvc` user (`pm2-appsvc` unit, generated via `runuser -u appsvc`)
- [x] A dedicated locked `appsvc` system user is created idempotently; `/opt/app` exists and is owned by `appsvc` (not `${ssh_username}`), which PM2 runs as
- [x] Shell gate passes
- [x] A note records that this is verified live only after a VM rebuild (`node --version` ≥ v24)

**Tests**: none (shell provisioning; `bash -n` is the gate, live check deferred to the operator)
**Gate**: Shell
**Commit**: `fix(infra): install node 24 lts for next.js compatibility`
**Status**: [x] Complete

---

#### T26: Hide the Nginx version and point PM2 at the standalone server

**What**: `server_tokens off` plus the PM2 entry pointing at the deployed bundle.
**Where**: `infra/scripts/ecosystem.config.js`
**Depends on**: T25
**Reuses**: The existing `ecosystem.config.js` (`name`, `cwd`, `PORT`) — only `script`/`args` and the env file change
**Requirement**: VM-05, SEC-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The Nginx configuration written by the startup script includes `server_tokens off;` so the `Server` header carries no version
- [x] `ecosystem.config.js` runs the standalone server (`node current/server.js`) from `/opt/app` with `NODE_ENV=production`, `PORT=3000`, and the env file at `/opt/app/.env.production`
- [x] Shell gate passes and `node --check infra/scripts/ecosystem.config.js` succeeds

**Tests**: none (config layer)
**Gate**: Shell
**Commit**: `feat(infra): hide nginx version and run standalone next build via pm2`
**Status**: [x] Complete

---

### Phase 10: CI/CD

```
T27 → T28
```

#### T27: Pull-request workflow

**What**: The PR gate running lint, typecheck, and unit tests.
**Where**: `.github/workflows/ci.yml`
**Depends on**: T2
**Reuses**: The npm scripts from T2
**Requirement**: TEST-02, TEST-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Triggers on `pull_request` targeting `main`
- [x] Runs checkout → Node 24 setup → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test`, all with `working-directory: web`
- [x] Any failing step fails the job (no `continue-on-error`)
- [x] Workflow gate passes (valid YAML, expected trigger and test step present)

**Tests**: none (CI config; the workflow gate is the check)
**Gate**: Workflow
**Commit**: `ci: add pull request test gate`
**Status**: [x] Complete

---

#### T28: Deploy workflow

**What**: Build on merge, authenticate keylessly, resolve or start the VM, ship the bundle, reload PM2, verify.
**Where**: `.github/workflows/deploy.yml`
**Depends on**: T27, T24, T26
**Reuses**: The WIF outputs from T24 (Amendment 2: the static-IP reserve/attach dance was dropped — CI just starts the VM and reads the ephemeral IP)
**Requirement**: CICD-01, CICD-02, CICD-03, CICD-04, CICD-05, CICD-06, CICD-07, CICD-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Triggers on `push` to `main`; runs the tests before building
- [x] Authenticates with `google-github-actions/auth` using the WIF provider and service account from secrets — the file contains **no** service-account JSON key and no `credentials_json`
- [x] Reaches the VM entirely over an IAP tunnel (`gcloud compute scp`/`ssh --tunnel-through-iap`) with **no stored SSH key and no `VM_SSH_*` secret**; there is no `Configure SSH` step. The deploy SA's instance-scoped grants cover the tunnel and `setMetadata`; the project-scoped reads/operation-polling that `--tunnel-through-iap`, `instances start`, and `instances describe` perform are authorized by the minimal custom project role `deployVmOperator` from T24 (G1)
- [x] Resolves the VM's external IP with `gcloud compute instances describe`; if the instance is `TERMINATED`, starts it, polls until `RUNNING`, and resolves the new ephemeral IP before deploying — no static-IP reservation (Amendment 2)
- [x] Copies the `standalone` bundle into `/opt/app/releases/<sha>` (`sudo install -o appsvc`) and flips the `current` symlink atomically; the first remote call retries while sshd/key propagation catches up
- [x] Copies `/opt/app/.env.production` from GitHub secrets over the tunnel with `install -m 600 -o appsvc` — the secret value never lands on a remote command line
- [x] Reloads PM2 as `appsvc`, then polls `https://<ip>/` until HTTP 200, failing the job after 2 minutes
- [x] Remaining secrets are exactly `GCP_PROJECT_ID`, `GCP_ZONE`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`, `IDENTITY_PLATFORM_API_KEY` (Amendment 2 dropped `GCP_REGION` with the static-IP reservation); `grep` finds no literal key, token, or project ID in the file
- [x] Workflow gate passes

**Tests**: none (CI config; live execution is deferred to the operator's first merge)
**Gate**: Workflow
**Commit**: `ci: add deploy workflow with workload identity federation`
**Status**: [x] Complete

---

### Phase 11: Documentation and final validation

```
T29 → T30
```

#### T29: OWASP mitigation documentation

**What**: The README section the PRD grades, mapping OWASP categories to real code paths.
**Where**: `README.md`
**Depends on**: T21, T28
**Reuses**: The existing README structure and the `docs/` index
**Requirement**: DOCS-01, DOCS-02, DOCS-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Documents at least three OWASP Top 10:2025 categories, each naming the mitigation and citing a `path/to/file` that exists
- [x] Covers at minimum Identification and Authentication Failures (brute-force block, generic errors, password policy), Security Misconfiguration (the OWASP header set), and Broken Access Control (server-side session verification, CSRF)
- [x] Every cited path resolves — verified by iterating the paths and testing each
- [x] Adds a `docs/application.md` pointer so the app is discoverable from the docs index
- [x] Build gate passes

**Tests**: none (documentation)
**Gate**: Build
**Commit**: `docs: document owasp top 10 mitigations with code references`
**Status**: [x] Complete

---

#### T30: Final validation pass

**What**: Run every gate across the whole repository and produce the operator handoff.
**Where**: `web/package.json`
**Depends on**: T29
**Reuses**: n/a
**Requirement**: (structurally validates all 75 requirement IDs; live verification stays with the operator per the Test Coverage Matrix)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `cd web && npm run lint && npm run typecheck && npm test && npm run build` all pass — **134 tests** across 13 test files
- [x] `terraform fmt -check -recursive infra`, `terraform -chdir=infra validate`, and `terraform -chdir=infra/bootstrap validate` pass (T25's `$${NODE_MAJOR_REQUIRED}` templatefile escape was fixed here — it was caught only by `terraform validate`, not by the Shell gate)
- [x] `bash -n` on the de-templated startup script passes; both workflow YAML files parse
- [x] `git status --porcelain` is clean and `git ls-files` contains no `.env`, key, or project identifier
- [x] A handoff note lists the operator's remaining live steps — see `.specs/STATE.md` `## Handoff`

**Tests**: none (this task's gate is the verification)
**Gate**: Build
**Commit**: `chore(web): final validation pass`
**Status**: [x] Complete

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11

Phase 1:   T1 ---→ T2 ---→ T3
Phase 2:   T4 ---→ T5 ---→ T6
Phase 3:   T7 ---→ T8
Phase 4:   T9 ---→ T10
Phase 5:   T11 --→ T12
Phase 6:   T13 --→ T14 --→ T15 --→ T16
Phase 7:   T17 --→ T18 --→ T19 --→ T20 --→ T21
Phase 8:   T22 --→ T23 --→ T24
Phase 9:   T25 --→ T26
Phase 10:  T27 --→ T28
Phase 11:  T29 --→ T30
```

Execution is strictly sequential. Cross-phase dependencies (e.g. T9 depends on T5, T17 depends on T10 and T3) are satisfied by phase ordering itself — a later phase never starts until every task in every earlier phase is done, so a backward cross-phase `Depends on` needs no diagram arrow of its own.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Scaffold Next.js app | 1 project init, 1 config file | ✅ Granular |
| T2: Vitest + scripts | 1 config file + package scripts | ✅ Granular |
| T3: shadcn primitives | 1 init, vendored components | ✅ Granular |
| T4: credentials validation | 1 module, 2 pure functions | ✅ Granular |
| T5: security headers | 1 module, 1 function | ✅ Granular |
| T6: CSRF | 1 module, 2 functions | ✅ Granular |
| T7: rate-limit core | 1 module, pure decision logic | ✅ Granular |
| T8: Firestore store + L1 | 1 module, 1 concern (persistence) | ✅ Granular |
| T9: proxy headers | 1 file, 1 concern | ✅ Granular |
| T10: proxy Origin/CSRF | same file, 1 distinct concern | ✅ Granular (cohesive follow-on) |
| T11: Identity Platform client | 1 module | ✅ Granular |
| T12: session management | 1 module | ✅ Granular |
| T13-T16: route handlers | 1 route each | ✅ Granular |
| T17: root layout | 1 file | ✅ Granular |
| T18-T19, T21: pages | 1 page each | ✅ Granular |
| T20: signup + verify-email pages | 2 closely-coupled forms | ⚠️ Two files, deliberately paired — the verify-email screen is the signup flow's second half and shares its structure; splitting would leave a dangling redirect target |
| T22: APIs + Identity Platform | 1 file, 2 tightly coupled resources | ✅ Granular |
| T23: Firestore | 1 file, 1 resource | ✅ Granular |
| T24: WIF + deploy SA | 1 file, 1 concern (keyless CI identity) | ✅ Granular |
| T25: Node 24 + app dir | 1 file, 1 concern (runtime prerequisites) | ✅ Granular |
| T26: nginx tokens + PM2 entry | 1 file, 1 concern (serving the built app) | ✅ Granular |
| T27-T28: workflows | 1 workflow each | ✅ Granular |
| T29: OWASP docs | 1 file, 1 concern | ✅ Granular |
| T30: final validation | verification only, no new files | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T2 | Phase 2 after Phase 1 (cross-phase) | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T6 | Phase 3 after Phase 2 (cross-phase) | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | T5 | Phase 4 after Phase 2 (cross-phase) | ✅ Match |
| T10 | T9, T6 | T9→T10 (T6 cross-phase) | ✅ Match |
| T11 | T4 | Phase 5 after Phase 2 (cross-phase) | ✅ Match |
| T12 | T11 | T11→T12 | ✅ Match |
| T13 | T8, T11 | Phase 6 after Phases 3 and 5 (cross-phase) | ✅ Match |
| T14 | T13, T12 | T13→T14 (T12 cross-phase) | ✅ Match |
| T15 | T14 | T14→T15 | ✅ Match |
| T16 | T15 | T15→T16 | ✅ Match |
| T17 | T10, T3 | Phase 7 after Phases 1 and 4 (cross-phase) | ✅ Match |
| T18 | T17 | T17→T18 | ✅ Match |
| T19 | T18, T14 | T18→T19 (T14 cross-phase) | ✅ Match |
| T20 | T19, T13 | T19→T20 (T13 cross-phase) | ✅ Match |
| T21 | T20, T15 | T20→T21 (T15 cross-phase) | ✅ Match |
| T22 | None | Phase 8 start | ✅ Match |
| T23 | T22 | T22→T23 | ✅ Match |
| T24 | T23 | T23→T24 | ✅ Match |
| T25 | None | Phase 9 start | ✅ Match |
| T26 | T25 | T25→T26 | ✅ Match |
| T27 | T2 | Phase 10 after Phase 1 (cross-phase) | ✅ Match |
| T28 | T27, T24, T26 | T27→T28 (T24, T26 cross-phase) | ✅ Match |
| T29 | T21, T28 | Phase 11 after Phases 7 and 10 (cross-phase) | ✅ Match |
| T30 | T29 | T29→T30 | ✅ Match |

No task depends on a task in a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1, T3 | Scaffold / vendored UI primitives | none (build gate) | none | ✅ OK |
| T2 | Test harness itself | unit (smoke) | unit | ✅ OK |
| T4, T5, T6 | Pure security & validation modules | unit — all branches, 1:1 to ACs, every edge case | unit | ✅ OK |
| T7, T8 | Pure security modules (limiter) | unit — threshold, boundary, both failure modes | unit | ✅ OK |
| T9, T10 | Edge gate (`proxy.ts`) | unit — every header by value, accept/reject branches | unit | ✅ OK |
| T11, T12 | Auth modules | unit — happy path + every error branch | unit | ✅ OK |
| T13-T16 | Route Handlers | unit — happy + edge + error paths per route | unit | ✅ OK |
| T17-T21 | Server Components / pages | none — build gate only | none | ✅ OK — the matrix marks this layer "none" because the pages are rendering shells; every branching rule they rely on (`getAuthenticatedUser`, validation, CSRF) is unit-tested in T12, T4, and T6 respectively, with the file:line owner named in each task's `Reuses` |
| T22-T24 | Terraform config | static validation | none | ✅ OK — satisfied by the Terraform gate, not by a `Tests` value |
| T25, T26 | Shell / PM2 config | static (`bash -n`, `node --check`) | none | ✅ OK — satisfied by the Shell gate |
| T27, T28 | CI workflows | static (YAML parse) | none | ✅ OK — satisfied by the Workflow gate |
| T29 | Documentation | none | none | ✅ OK |
| T30 | Verification only | n/a | none | ✅ OK |

**No test is deferred.** Where a task carries `Tests: none`, the matrix marks that layer "none" or "static validation", and the rigour lives in the task's `Gate` plus its `Done when` checklist. The pages (T17-T21) are the only place where a *behavioural* rule is verified in a different task than the one rendering it — and in each case the rule is a pure function unit-tested where it is defined, named explicitly in the page task's `Reuses` field, never a vague "tested elsewhere".
