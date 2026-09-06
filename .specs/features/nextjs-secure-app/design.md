# Next.js Secure Application — Design

**Spec**: `.specs/features/nextjs-secure-app/spec.md`
**Status**: Draft

---

## Architecture Overview

One Next.js 16 app (App Router, TypeScript, SSR-only) living in **`web/`** — a sibling of the existing `infra/`, `ops/`, and `docs/` directories, so each area stays self-contained and `node_modules`/`package.json`/`tsconfig.json` never land at the repository root. It is built in CI and deployed as a `standalone` bundle to `/opt/app` on the existing VM, served by PM2 behind the Nginx reverse proxy that the infra feature already configured.

All application paths below are relative to `web/` (e.g. `web/proxy.ts`, `web/app/page.tsx`, `web/lib/security/headers.ts`).

Every credential stays server-side. The browser receives exactly two cookies — a Firebase **session cookie** and a **CSRF token** — and never sees an API key, a project ID, or the Firebase SDK.

```mermaid
graph TD
    Browser -->|HTTPS| Nginx[Nginx on the VM<br/>TLS, HTTP→HTTPS, server_tokens off]
    Nginx -->|proxy_pass :3000| Proxy[proxy.ts<br/>Edge runtime]

    Proxy -->|CSP nonce + all security headers| Proxy
    Proxy -->|Origin check, CSRF compare| Proxy
    Proxy --> Pages[Server Components<br/>Node runtime]
    Proxy --> API[Route Handlers /api/auth/*<br/>Node runtime]

    Pages -->|cookies + verifySessionCookie| Admin[firebase-admin]
    API -->|signInWithPassword / signUp / sendOobCode| IDP[(Identity Platform REST)]
    API -->|createSessionCookie / revokeRefreshTokens| Admin
    API -->|rate limit + brute force| Limiter[Rate limiter<br/>L1 memory → Firestore]
    Limiter --> FS[(Firestore)]

    GH[GitHub Actions] -->|WIF, no static key| GCP[gcloud: resolve IP, start VM]
    GH -->|scp bundle + pm2 reload| VMBox[/opt/app on the VM/]
```

**Why the split matters:** `proxy.ts` runs on the **Edge runtime**, where `firebase-admin` and the Firestore SDK cannot run (they need Node APIs). So the proxy is limited to what Web Crypto and plain header work can do — headers, Origin checks, CSRF token comparison — and everything requiring the Admin SDK or Firestore (session verification, rate-limit counters) lives in Route Handlers and Server Components, which run on Node. This is a hard runtime boundary, not a preference.

---

## Approach exploration

**Chosen: A — one Next.js app, server-only auth, controls split across the Edge/Node boundary.**

| Approach | Trade-off | Verdict |
| --- | --- | --- |
| **A. Single app; proxy.ts does headers/Origin/CSRF, Route Handlers do auth + rate limiting** (chosen) | One deployable, one process, one PM2 entry — fits a 1 GB e2-micro. Requires being deliberate about which control runs on which runtime. | **Recommended.** Matches the spec's server-only constraint and the VM's resources; the runtime split is a real constraint either way, so making it explicit costs nothing. |
| B. Force `proxy.ts` onto the Node runtime and centralise every control there | All security logic in one file; rate limiting could reject before routing. | Rejected — Node-runtime middleware is a newer, less-exercised path, and putting Firestore I/O in front of *every* request (including static asset requests that slip the matcher) risks burning the free-tier write quota. |
| C. Next.js frontend + separate auth service (Express/Nest) | Clean separation; auth reusable. | Rejected — two processes on a 1 GB VM, two deploy paths, two attack surfaces, for a prototype with one login form. |
| D. Client-side Firebase SDK + `/api/session` exchange (Google's standard sample) | Least custom code; the documented happy path. | Rejected by an explicit user decision — it publishes the Firebase config in the client bundle, which violates the "no exposed ENVs" requirement. |

---

## Code Reuse Analysis

### What already exists and is reused

| Component | Location | How it's used |
| --- | --- | --- |
| Nginx reverse proxy to `localhost:3000` | `infra/scripts/startup.sh.tpl` (stage 10) | Already points at the port this app will bind. No change needed beyond `server_tokens off`. |
| PM2 + `pm2 startup` boot survival | `infra/scripts/startup.sh.tpl` (stage 9) | The app is registered with the existing PM2 instance; `pm2 save` makes it survive reboots. |
| `infra/scripts/ecosystem.config.js` | Same | Already declares `name: nextjs-app`, `cwd: /opt/app`, `PORT: 3000`. Needs its `script`/`args` pointed at the standalone server. |
| Terraform main root + provider config | `infra/*.tf` | New GCP resources (Identity Platform, Firestore, WIF) are added here, reusing `user_project_override`/`billing_project` already set. |
| VM start/stop with IP reservation | `ops/vm-start.sh`, `ops/vm-stop.sh` | The deploy workflow reproduces this sequence when the VM is stopped (CICD-04). |
| `.gitignore` secret patterns | `.gitignore` | Extended with `.env*` app-level entries; the existing rules already block `.env`, keys, and tfvars. |
| Free-tier and teardown documentation | `docs/` | New app docs slot in beside them; the OWASP section lands in `README.md` per DOCS-01. |

### Integration points

| System | Integration |
| --- | --- |
| Identity Platform | Server-side REST over HTTPS with an API key held in `/opt/app/.env.production` (chmod 600), never in the repo or the bundle |
| Firestore | Admin SDK from Route Handlers only, using Application Default Credentials from the VM's service account |
| Nginx | Sets `X-Forwarded-For`; the app reads its left-most entry for client IP (SEC-06) |
| GitHub Actions | WIF → short-lived GCP token → `gcloud` for IP resolution and VM start; SSH key from secrets for the file transfer |

---

## Components

### `web/proxy.ts` — Edge-runtime security gate

- **Purpose**: The single place every request passes through before routing. Generates the CSP nonce, sets the full OWASP header set, enforces same-origin on `/api/*`, and validates the CSRF token on state-changing requests.
- **Location**: `web/proxy.ts` (beside `web/app/`)
- **Runtime**: Edge. **No `firebase-admin`, no Firestore, no Node-only API here.**
- **Interfaces**:
  - `export function proxy(request: NextRequest): NextResponse`
  - `export const config = { matcher: [...] }` — matches everything except `_next/static`, `_next/image`, and `favicon.ico`; unlike the Next.js sample it **does not** exclude `/api`, because API routes need the Origin and CSRF checks.
- **Behaviour**:
  1. Generate a nonce (`crypto.randomUUID()` → base64), set it on the outgoing request as `x-nonce` and inside the CSP header, exactly as Next.js 16 documents — Next then applies it to framework scripts automatically.
  2. Build and set the header set from `lib/security/headers.ts`.
  3. For `POST|PUT|PATCH|DELETE`: require `Origin` (or `Referer`) to equal the app's own origin → 403 otherwise; require the submitted CSRF token to match the cookie in constant time → 403 otherwise.
- **Note on file naming**: In Next.js 16 this file is `proxy.ts` exporting `proxy()`. The older `middleware.ts`/`middleware()` convention is the pre-16 name — verified against the Next.js 16.3.4 CSP guide.
- **Requirements**: SEC-08..SEC-20, SEC-21..SEC-24

### `lib/security/headers.ts` — the OWASP header set

- **Purpose**: One pure function producing every security header, so the values are unit-testable without booting a server.
- **Interfaces**: `buildSecurityHeaders(opts: { nonce: string; isDev: boolean; sensitive?: boolean }): Record<string, string>`
- **Values** (per the OWASP HTTP Headers Cheat Sheet):
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'nonce-<n>'; img-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` (dev adds `'unsafe-eval'` for React's debug tooling, production never does)
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` (no `preload` — an IP host cannot be submitted)
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 0`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()`
  - `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-site`
  - `Cache-Control: no-store` when `sensitive`
  - Never emits `Access-Control-Allow-Origin`, `Expect-CT`, or `Public-Key-Pins`
- **Requirements**: SEC-08..SEC-20

### `lib/security/csrf.ts`

- **Purpose**: Generate and verify CSRF tokens without leaking timing information.
- **Interfaces**: `generateCsrfToken(): string` (32 random bytes, base64url); `verifyCsrfToken(submitted: string | null, cookie: string | null): boolean` (length-check then constant-time compare over the full buffers)
- **Notes**: Uses Web Crypto (`crypto.getRandomValues`, `crypto.subtle`) so the same module works on Edge and Node. Tokens are never derived from the session, the user ID, or a timestamp (SEC-24).
- **Requirements**: SEC-21..SEC-24

### `lib/security/rate-limit.ts` — general limiter and brute-force blocker

- **Purpose**: Per-IP counting with a persistent store and an in-process fast path.
- **Location**: `lib/security/rate-limit.ts`; called from Route Handlers (Node runtime only).
- **Interfaces**:
  - `checkRateLimit(ip: string, bucket: "auth" | "general", now?: number): Promise<{ allowed: boolean; retryAfterSeconds?: number }>`
  - `recordLoginFailure(ip: string, now?: number): Promise<{ blocked: boolean; retryAfterSeconds?: number }>`
  - `resetLoginFailures(ip: string): Promise<void>`
- **Design**:
  - **L1 (memory)**: a `Map<ip, { blockedUntil: number }>`. A request from an IP with `blockedUntil > now` is rejected immediately, with **no Firestore read or write** (SEC-07) — this is what stops a sustained attack from consuming the 20k writes/day free quota.
  - **L2 (Firestore)**: collection `rate_limits`, one document per IP, updated inside a transaction so two concurrent requests cannot skip the 5th-failure threshold.
  - Thresholds are injected, not hardcoded at call sites: 5 failures → 60s block; `auth` bucket 10 req/min; `general` bucket 100 req/min.
  - `now` is an injectable parameter so tests can drive the clock deterministically instead of sleeping.
- **Failure mode**: if Firestore is unreachable during a **login** attempt, `checkRateLimit` throws and the route returns 503 — failing **closed**, per the spec's edge case. The general limiter fails open (a 100 req/min cap is not a security guarantee worth taking the site down for).
- **Requirements**: SEC-01..SEC-07, SEC-25..SEC-27

### `lib/auth/identity-platform.ts` — server-side REST client

- **Purpose**: The only module that talks to Identity Platform. Keeps the API key in one place and normalises upstream errors into safe, generic results.
- **Interfaces**:
  - `signUp(email, password): Promise<{ idToken: string; localId: string }>`
  - `signInWithPassword(email, password): Promise<{ idToken: string; localId: string }>`
  - `sendVerificationEmail(idToken): Promise<void>`
- **Endpoints** (verified against Google's Identity Platform REST reference):
  - `POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<API_KEY>`
  - `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<API_KEY>` — body `{ email, password, returnSecureToken: true }`
  - `POST https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=<API_KEY>` — body `{ requestType: "VERIFY_EMAIL", idToken }`; Google sends the email itself, so no SMTP is needed
- **Error mapping**: every upstream 400 (`EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `INVALID_LOGIN_CREDENTIALS`, `EMAIL_EXISTS`) collapses to one generic caller-facing result, so the response cannot be used to enumerate accounts (AUTH-04, AUTH-10). Upstream 5xx maps to a distinct "unavailable" result → HTTP 503.

### `lib/auth/session.ts` — Admin SDK session cookies

- **Purpose**: Mint, verify, and revoke sessions.
- **Interfaces**:
  - `createSession(idToken: string): Promise<string>` — `admin.auth().createSessionCookie(idToken, { expiresIn: 12h })`
  - `verifySession(cookie: string): Promise<DecodedIdToken | null>` — `verifySessionCookie(cookie, true)` (`checkRevoked: true`, AUTH-14)
  - `revokeSession(uid: string): Promise<void>` — `revokeRefreshTokens(uid)`
  - `sessionCookieOptions()` — `{ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 43200 }`
- **Admin SDK credentials**: Application Default Credentials from the VM's attached service account — no key file on disk.
- **`getAuthenticatedUser(cookieValue: string | null): Promise<AuthUser | null>`**: the guard the `/dashboard` page calls. Returns the user only when the session cookie verifies *and* `email_verified` is true; returns `null` otherwise. Keeping this as a pure-ish function (Admin SDK injected) means the dashboard's redirect rule (AUTH-14, AUTH-16, AUTH-17) is unit-testable, and the page itself stays a thin shell around it.

### `lib/validation/credentials.ts`

- **Purpose**: Pure input validation, unit-tested without any I/O.
- **Interfaces**: `normalizeEmail(raw: string): string | null` (trim, lowercase, RFC shape, ≤254 chars); `validatePassword(pw: string): { ok: true } | { ok: false; failed: PasswordRule }` (≥12 chars, lower, upper, digit, symbol)
- **Requirements**: AUTH-02, AUTH-05

### Route Handlers — `app/api/auth/*`

| Route | Method | Behaviour |
| --- | --- | --- |
| `/api/auth/signup` | POST | rate limit → validate → `signUp` → `sendVerificationEmail` → 303 `/verify-email`; generic 400 on any rejection (AUTH-01..05) |
| `/api/auth/login` | POST | brute-force check → rate limit → `signInWithPassword` → reject unverified (303 `/verify-email`) → `createSession` → `Set-Cookie` → 303 `/dashboard`; failure increments the counter (AUTH-07..12, SEC-01..07) |
| `/api/auth/logout` | POST | `revokeSession` → clear cookie (`Max-Age=0`) → 303 `/` (AUTH-15, AUTH-17) |
| `/api/auth/resend-verification` | POST | rate-limited resend of the verification email |

All four run on the Node runtime, set `Cache-Control: no-store`, and are reached only through `proxy.ts`'s Origin + CSRF gate.

### Pages — `app/`

| Route | Type | Notes |
| --- | --- | --- |
| `/` | Server Component | Public landing; `await connection()` to force dynamic rendering so the nonce applies (APP-01, APP-02) |
| `/login` | Server Component + shadcn form | Posts to `/api/auth/login` with the CSRF hidden field |
| `/signup` | Server Component + shadcn form | Posts to `/api/auth/signup` |
| `/verify-email` | Server Component | Explains the pending verification; offers resend |
| `/dashboard` | Server Component | Reads the session cookie, calls `verifySession`, redirects to `/login` when invalid; shows the user's email and the logout button (AUTH-13..17) |

Route protection is **not** delegated to `proxy.ts` — the Admin SDK cannot run there. The dashboard verifies the session itself on every request, which is also what AUTH-16 requires.

### `ecosystem.config.js` and the deployed layout

```
/opt/app/
├── current -> releases/<sha>     # symlink flipped atomically on deploy
├── releases/<sha>/               # standalone bundle: server.js, .next/, public/
├── .env.production               # chmod 600, written by the pipeline from GitHub secrets
└── ecosystem.config.js
```

PM2 runs `node current/server.js` with `PORT=3000`, `NODE_ENV=production`, and `--env-file` pointed at `.env.production`.

### GitHub Actions workflows

| Workflow | Trigger | Steps |
| --- | --- | --- |
| `.github/workflows/ci.yml` | `pull_request` → `main` | checkout → setup-node 22 → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` (TEST-02, TEST-03) |
| `.github/workflows/deploy.yml` | `push` → `main` | `npm ci` → test → `next build` → `google-github-actions/auth` (WIF) → resolve IP / start VM if `TERMINATED` → rsync bundle → write `.env.production` from secrets → `pm2 reload` → poll `https://<ip>/` for 200, 2-minute timeout (CICD-01..08) |

**Secrets consumed** (all from GitHub Actions secrets, never the repo): `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`, `GCP_PROJECT_ID`, `GCP_ZONE`, `VM_SSH_PRIVATE_KEY`, `VM_SSH_USER`, `IDENTITY_PLATFORM_API_KEY`.

### Terraform additions — `infra/app.tf`

| Resource | Purpose |
| --- | --- |
| `google_project_service` × 3 | `identitytoolkit`, `firestore`, `iamcredentials` (TF-01) |
| `google_identity_platform_config` | `sign_in.email.enabled = true`, `password_required = true` (TF-02) |
| `google_firestore_database` | Native mode, `location_id = "us-east1"` (TF-03) |
| `google_iam_workload_identity_pool` + `..._provider` | GitHub OIDC (`issuer_uri = "https://token.actions.githubusercontent.com"`), `attribute_mapping` for `google.subject`/`attribute.repository`/`attribute.repository_owner`, and an `attribute_condition` restricting to this repository (TF-04) |
| `google_service_account` + `google_service_account_iam_member` | Deploy SA bound with `roles/iam.workloadIdentityUser` to the `principalSet://` for this repo; project roles limited to `roles/compute.instanceAdmin.v1` and `roles/iam.serviceAccountUser` (TF-05) |
| `outputs.tf` additions | WIF provider resource name, deploy SA email (TF-06) |

---

## Data Models

### Firestore — `rate_limits/{ip}`

```ts
type RateLimitDoc = {
  ip: string                  // document ID; the left-most X-Forwarded-For entry
  loginFailures: number       // consecutive failed logins; reset to 0 on success
  blockedUntil: number | null // epoch ms; null when not blocked
  authWindowStart: number     // epoch ms, start of the current 1-minute auth bucket
  authCount: number
  generalWindowStart: number
  generalCount: number
  updatedAt: number
}
```

One document per IP, written inside a transaction. No TTL policy is configured (a TTL would be a nicety, not a requirement, and the document count for a coursework project stays trivially small).

### Session cookie payload

Not a model we define — it is Firebase's session cookie, carrying the same claims as the ID token (`uid`, `email`, `email_verified`, `exp`). The app reads `uid`, `email`, and `email_verified` and stores nothing else about the user.

---

## Error Handling Strategy

| Scenario | Handling | User sees |
| --- | --- | --- |
| Wrong password / unknown email | Collapse both to one result; increment the IP's failure counter | 401 "Invalid email or password" — byte-identical either way |
| Email already registered on signup | Same generic rejection as any other signup failure | 400 "Could not create the account with those details" |
| 5th consecutive failure from an IP | Block for 60s; further attempts short-circuit in the L1 cache | 429 with `Retry-After: 60` |
| Firestore unreachable during login | Fail **closed** — the brute-force guarantee outranks login availability | 503, generic message |
| Firestore unreachable for the general limiter | Fail open, log it | Normal response |
| Identity Platform 5xx / API key missing | Distinguish from a credential error; log the upstream detail server-side only | 503, generic message |
| Session cookie expired, revoked, or user disabled | `verifySessionCookie(..., checkRevoked: true)` returns null | 303 to `/login` |
| CSRF token missing or mismatched | Rejected in `proxy.ts` before any handler runs | 403 |
| Cross-origin request to `/api/*` | Rejected in `proxy.ts`; no CORS headers emitted at all | 403 |
| Deploy health poll never returns 200 | Workflow fails after 2 minutes so a broken release is visible | Red check on the merge commit |

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
| --- | --- | --- | --- |
| `proxy.ts` runs on the Edge runtime — `firebase-admin`/Firestore cannot run there | `proxy.ts` | Putting session verification or rate limiting in the proxy would fail at runtime, possibly only in production | Hard boundary documented above: proxy does headers/Origin/CSRF only; everything Admin-SDK- or Firestore-backed lives in Route Handlers and Server Components |
| Node 18 on the VM vs `next@16` requiring ≥20.9 | `infra/scripts/startup.sh.tpl` | The deployed bundle would refuse to start | Its own spec story (VM-01..02): install Node 22 LTS from NodeSource, verified by `node --version` on a fresh boot |
| The `principalSet://` member format for the WIF binding is intricate and easy to get subtly wrong | `infra/app.tf` | A wrong member silently grants nothing (deploy fails to authenticate) or too much | The design specifies the `attribute.repository/OWNER/REPO` form, but the implementing task must confirm it against the current provider docs before applying — the same "verify, don't guess" discipline that caught the Certbot plugin issue in the infra feature |
| CSP with a nonce forces every page dynamic — no static optimisation, no PPR | whole app | Slower first byte, more CPU per request on a shared-core e2-micro | Accepted: SSR is an explicit requirement, and traffic is a grader plus a few test hits. Documented so it isn't mistaken for a misconfiguration |
| `COEP: require-corp` breaks any cross-origin subresource that doesn't opt in | `lib/security/headers.ts` | A future third-party script or CDN font would silently fail to load | Safe today (shadcn is local source, `next/font` self-hosts). Flagged in the spec's assumptions so the trade-off is visible before someone adds a CDN |
| `X-Forwarded-For` is client-controllable in principle | `lib/security/rate-limit.ts` | A spoofed header could let an attacker rotate "IPs" and dodge the block | Nginx is the only ingress and overwrites the header for direct traffic; documented as a known limitation rather than claimed as airtight |
| Firestore free tier is 20k writes/day | `lib/security/rate-limit.ts` | A sustained attack could exhaust it and (fail-closed) take login down | L1 memory cache short-circuits already-blocked IPs before any Firestore call (SEC-07) — the write cost of an attack is bounded by the number of *distinct* IPs, not the number of attempts |
| In-memory L1 resets on every deploy/restart | `lib/security/rate-limit.ts` | A block can be "forgotten" by the fast path right after a deploy | Firestore remains the source of truth; a reset L1 only costs one extra read to re-learn the block. No security property is lost |
| Verification email deliverability is Google's default sender | Identity Platform | Mail may land in spam, blocking signup end-to-end | Out of our control without a custom SMTP domain (explicitly out of scope); `/verify-email` offers a resend, and the operator can flip `emailVerified` in the console if a demo is blocked |

---

## Tech Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Security-gate file | `proxy.ts` exporting `proxy()`, not `middleware.ts` | Next.js 16 renamed the convention; verified against the 16.3.4 CSP guide rather than assumed from older tutorials |
| Where session verification happens | In Server Components / Route Handlers, never in `proxy.ts` | Edge runtime cannot load `firebase-admin`; a fast cookie-presence check in the proxy would be a convenience, not the authority |
| CSP strategy | Per-request nonce with `'strict-dynamic'`, forcing dynamic rendering | The spec forbids `'unsafe-inline'`; nonce is the approach Next.js documents, and SSR is required anyway so the cost is already paid |
| Rate-limit store | Firestore + in-process L1 cache | User chose Firestore for durability; L1 is what keeps the free-tier write quota safe under attack |
| Login failure mode when the store is down | Fail closed (503) | A login form that stays up without brute-force protection is worse than one that is briefly unavailable |
| Error message policy | One generic message for every credential failure, and for every signup rejection | Prevents account enumeration (OWASP Identification and Authentication Failures) |
| Build location | GitHub Actions, deploying a `standalone` bundle | 1 GB RAM on the VM makes on-host builds slow and OOM-prone |
| Release layout | `releases/<sha>` + `current` symlink | Atomic flip, trivial rollback, no window where the served directory is half-written |
| CI → GCP auth | Workload Identity Federation with a repository-scoped `attribute_condition` | No long-lived key in GitHub; without the condition any repo could assume the SA |
| Deploy SA permissions | `roles/compute.instanceAdmin.v1` + `roles/iam.serviceAccountUser` only | Least privilege — enough to read the IP and start the VM, nothing else |
| Test runner | Vitest | Native TypeScript/ESM, fast, and the modules under test are pure functions with injected clocks — no framework bootstrapping needed |
| Clock handling in tests | `now` injected as a parameter | Deterministic assertions at the 5th failure and the 60-second boundary, with no `sleep` in the suite |

> **Project-level decisions** from this design are recorded in `.specs/STATE.md` as `AD-001`..`AD-005`.
