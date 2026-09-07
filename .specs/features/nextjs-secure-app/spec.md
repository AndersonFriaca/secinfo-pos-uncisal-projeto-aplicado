# Next.js Secure Application Specification

## Problem Statement

The infrastructure from [`gcp-infra-terraform`](../gcp-infra-terraform/spec.md) is provisioned and serving HTTPS on the VM, but Nginx's reverse proxy to `localhost:3000` returns `502` — nothing is deployed there. This feature builds the application the whole project exists to host: a Next.js (TypeScript, SSR) app with a public landing page, public signup with email verification, login, and an authenticated dashboard, backed by Firebase Auth / GCP Identity Platform. It also closes PRD Eixo 3 (secure web prototype, ≥3 OWASP Top 10 mitigations) and the CI/CD axis (GitHub Actions: tests on PR, deploy on merge).

## Goals

- [ ] Public landing page, signup, login, and an authenticated dashboard with working logout — all server-rendered (SSR), TypeScript, shadcn/ui.
- [ ] Firebase Auth used **without exposing any environment variable to the browser**: all Identity Platform calls happen server-side; the browser only ever receives an httpOnly session cookie.
- [ ] Active mitigations for OWASP Top 10:2025 categories, including brute-force IP blocking (60s), CSRF, CSP, HSTS, CORS, and rate limiting.
- [ ] GitHub Actions runs unit tests on every pull request and deploys to the VM on merge to `main`, authenticating to GCP with Workload Identity Federation (no long-lived key in GitHub).
- [ ] Every secret lives in GitHub Actions secrets or on the VM — never in the repository.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Database for application data (beyond auth + rate-limit counters) | PRD explicitly waives any database requirement; Firestore here is used only for security counters. |
| Password reset flow | PRD requires only login, an internal page, and logout; signup + verification is already beyond that. Adds another email round-trip and screens. |
| Social / OAuth / MFA sign-in providers | Email+password satisfies the requirement; each extra provider adds config surface and (for SAML/OIDC) leaves the free tier. |
| Multi-user roles / authorization levels | No requirement for it; every authenticated user sees the same dashboard. |
| Qualys SSL Labs grade-A tuning (cipher suites, PQC) | Belongs to the Nginx/TLS layer of the infra feature, not the app. Tracked as a separate follow-up. |
| Custom transactional email (SMTP, templates) | Identity Platform sends the verification email itself; no mail infrastructure is provisioned. |
| E2E / browser tests | PR gate requires unit tests. E2E on a single free-tier VM adds CI time and flakiness for no graded benefit. |
| Staging environment | One VM, one environment — the free tier covers exactly one instance. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Auth architecture | **Server-only**: Next.js Route Handlers call `identitytoolkit.googleapis.com` REST (`accounts:signInWithPassword`, `accounts:signUp`, `accounts:sendOobCode`) with a server-held API key, then mint a Firebase **session cookie** via the Admin SDK. No Firebase client SDK, no `NEXT_PUBLIC_*` variable, no config in the browser bundle. | User requirement: "as ENVs não poderão ser expostas". Google's standard client-SDK flow publishes the API key in the bundle by design; the REST+session-cookie flow keeps every credential server-side and fits SSR. Endpoints verified against Google's Identity Platform REST reference. | y |
| User provisioning | Public self-service signup screen | User choice (PRD requires only login/dashboard/logout). | y |
| Email verification | **Required** before the dashboard is reachable | User choice. Identity Platform sends the verification email itself via `accounts:sendOobCode` (`requestType=VERIFY_EMAIL`), so no SMTP infrastructure is needed. | y |
| Rate-limit / brute-force store | **Firestore**, fronted by an in-process L1 cache | User chose Firestore for persistence across deploys. The L1 cache is a design addition: an already-blocked IP is rejected from memory without a Firestore round-trip, so a sustained attack cannot burn the 20k writes/day free quota. | y |
| Identity Platform provisioning | Terraform (`google_identity_platform_config`, plus enabling `identitytoolkit.googleapis.com`) | User choice. The Admin SDK service-account key stays out of Terraform (it would land in state) — it is created once and stored as a GitHub secret / VM file. | y |
| GitHub Actions → GCP authentication | **Workload Identity Federation** (no service-account JSON key in GitHub) | User choice; matches the course's security framing. Provisioned in Terraform alongside the rest. | y |
| Deploy target discovery | Pipeline resolves the VM's current IP with `gcloud compute instances describe` at deploy time | The VM uses an ephemeral IP by design (see the infra feature's free-tier decision), so no fixed address exists to hardcode. | y |
| VM stopped at deploy time | Pipeline starts it and waits for `RUNNING`, then resolves the new ephemeral IP and deploys — no static-IP reservation (that stays in `ops/vm-start.sh` for the operator) | User choice — a merge must never fail because the VM was idle. The ephemeral IP is fine for CI: it only needs *some* address to health-check and already resolves it dynamically. | y |
| Brute-force threshold | 5 consecutive failed logins from one IP → that IP blocked for **60 seconds**; counter resets on success or when the block expires | User specified the 1-minute block but not the attempt count. 5 is the common default and is looser than the infra's Fail2ban (4) because a legitimate user typo'ing a password is far more likely on a web form than on SSH. | y |
| General rate limits | 10 requests/minute per IP on auth endpoints (`/api/auth/*`); 100 requests/minute per IP elsewhere | User asked for rate limiting without numbers. These bound abuse while leaving normal navigation untouched. | y |
| Session cookie | Firebase session cookie, 12-hour lifetime, `httpOnly`, `Secure`, `SameSite=Strict`, `Path=/` | Firebase allows 5 minutes to 2 weeks; 12h balances "no daily re-login" against exposure. `SameSite=Strict` is itself a CSRF control. | y |
| HSTS on a bare IP | The header is sent with OWASP's recommended `max-age=63072000; includeSubDomains`, but browsers **ignore HSTS for IP-literal hosts** (RFC 6797 §8.1.1: a UA must not note an IP address as a Known HSTS Host). `preload` is omitted deliberately — an IP cannot be submitted to the preload list. | Documented honestly rather than claimed as effective. The header still satisfies the graded requirement and takes effect immediately if a domain is added later. HTTP→HTTPS redirect at Nginx is what actually enforces TLS today. | y — known limitation |
| Response header set | Follows the [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) in full: set CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection: 0`, `Cross-Origin-Opener/Embedder/Resource-Policy`, `Cache-Control: no-store` on sensitive responses, explicit `Content-Type` charset; remove `X-Powered-By` and the Nginx version from `Server`; never send the deprecated `Expect-CT` or `Public-Key-Pins`. | User asked for the cheat sheet's full set rather than the minimum. Values quoted from the cheat sheet itself, not from memory. `X-XSS-Protection: 0` is intentional, not an omission — OWASP recommends disabling the legacy auditor because it has been an exploitation vector in its own right. | y |
| `Cross-Origin-Embedder-Policy: require-corp` | Enabled; the app loads no third-party subresources | COEP breaks cross-origin resources that don't opt in via CORP/CORS. Safe here because shadcn/ui components are local source and `next/font` self-hosts fonts at build time — everything is same-origin. Revisit if a third-party script or CDN asset is ever added. | y |
| Node.js version on the VM | The startup script must install **Node.js 24 LTS** (NodeSource), replacing the `apt` `nodejs` package | Verified: Ubuntu 24.04's `apt` ships Node 18.19, but `next@16.3.4` declares `engines.node >= 20.9.0`. The current `infra/scripts/startup.sh.tpl` would produce a VM that cannot run the built app. Node 24 is the active LTS line and matches the CI runner. | y — infra change required |
| Stack versions | Next.js 16.3.4, React 19.2.8, TypeScript, `firebase-admin` 14.3.0, shadcn/ui CLI 4.21.0, Vitest 5.0.0 | Resolved from the npm registry at planning time, not assumed. | y |
| Build location | The app is built in GitHub Actions and deployed as a Next.js `output: "standalone"` bundle | The e2-micro has 1 GB RAM and 2 shared vCPU — a Next.js production build on it would be slow and risks OOM. | y |
| Firestore free tier | 1 GiB stored, 50k reads/day, 20k writes/day, 20k deletes/day, 10 GiB egress/month, available in any region | Confirmed via Google's pricing/quota documentation. The authoritative pricing page could not be fetched in full (truncated), so the region-independence point rests on secondary sources — re-verify before relying on it for anything larger than counters. | y — minor caveat |

**Open questions:** none — every ambiguity is resolved or recorded above.

---

## User Stories

### P1: Public landing page ⭐ MVP

**User Story**: As a visitor, I want a public home page that explains the project and links to login/signup, so that the deployed site shows something meaningful without authenticating.

**Why P1**: The PRD requires a publicly reachable application; this is the page a grader hits first at `https://<ip>/`.

**Acceptance Criteria**:

1. WHEN an unauthenticated visitor requests `/` THEN the system SHALL respond with HTTP 200 and server-rendered HTML containing the project name, a short description, and links to `/login` and `/signup`. <!-- event-driven -->
2. The system SHALL render every page dynamically on the server (SSR), never as a statically exported site — `next.config.ts` SHALL NOT set `output: "export"`. <!-- ubiquitous -->
3. The system SHALL build the UI from shadcn/ui components (`components/ui/*`) rather than hand-rolled markup for buttons, inputs, cards, and form fields. <!-- ubiquitous -->
4. WHEN an already-authenticated user with a verified email requests `/` THEN the system SHALL still return the landing page (HTTP 200), with the header link pointing to `/dashboard` instead of `/login`. <!-- event-driven -->

**Independent Test**: `curl -s https://<ip>/ | grep -q "<project name>"` returns 0; the response has no `NEXT_PUBLIC_` value and no Firebase config object in the HTML; `grep -r "output.*export" next.config.ts` finds nothing.

---

### P1: Public signup with email verification ⭐ MVP

**User Story**: As a new visitor, I want to create an account with my email and password and confirm it by email, so that I can reach the authenticated area.

**Why P1**: User-required entry point for the whole auth flow; without it there is no way to obtain an account.

**Acceptance Criteria**:

1. WHEN a visitor submits `/signup` with a valid email and a password of at least 12 characters containing at least one lowercase, one uppercase, one digit, and one symbol THEN the system SHALL create the account via `accounts:signUp` and respond with HTTP 303 redirecting to `/verify-email`. <!-- event-driven -->
2. IF the submitted password fails any strength rule THEN the system SHALL reject the request with HTTP 400 and re-render the form with a message naming the unmet rule, without calling Identity Platform. <!-- unwanted-behavior -->
3. WHEN an account is created THEN the system SHALL immediately request a verification email via `accounts:sendOobCode` with `requestType=VERIFY_EMAIL`. <!-- event-driven -->
4. IF the submitted email already belongs to an account THEN the system SHALL respond with HTTP 400 and the generic message "Could not create the account with those details" — never confirming that the email exists. <!-- unwanted-behavior -->
5. The system SHALL validate and normalise the email server-side (trim, lowercase, RFC-shaped, ≤ 254 characters) before any downstream call. <!-- ubiquitous -->
6. WHILE a user's email is unverified the system SHALL deny access to `/dashboard`, redirecting to `/verify-email`. <!-- state-driven -->

**Independent Test**: POST `/api/auth/signup` with a weak password returns 400 and the response body names the failed rule; with a strong password it returns 303 to `/verify-email` and the account appears in the Identity Platform console with `emailVerified: false`; re-posting the same email returns the identical generic 400 message as an unknown-email case.

---

### P1: Server-only login with session cookie ⭐ MVP

**User Story**: As a registered user, I want to log in with my email and password, so that I get an authenticated session — without the browser ever receiving Firebase credentials.

**Why P1**: PRD's mandatory login screen, and the core of the "no exposed ENVs" requirement.

**Acceptance Criteria**:

1. WHEN a user submits valid credentials for a verified account to `/api/auth/login` THEN the system SHALL exchange them server-side via `accounts:signInWithPassword`, mint a Firebase session cookie with the Admin SDK, and respond with HTTP 303 to `/dashboard` plus a `Set-Cookie` carrying that session cookie. <!-- event-driven -->
2. The system SHALL set the session cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and a 12-hour `Max-Age`. <!-- ubiquitous -->
3. The system SHALL NOT ship any Firebase API key, project ID, or client configuration to the browser — no `NEXT_PUBLIC_*` variable holding auth configuration exists, and the Firebase client SDK is not a dependency of the app. <!-- ubiquitous -->
4. IF the credentials are invalid THEN the system SHALL respond with HTTP 401 and the single generic message "Invalid email or password", identical for an unknown email and a wrong password. <!-- unwanted-behavior -->
5. IF the account exists but its email is unverified THEN the system SHALL NOT create a session and SHALL respond with HTTP 303 to `/verify-email`. <!-- unwanted-behavior -->
6. IF Identity Platform is unreachable or returns a 5xx THEN the system SHALL respond with HTTP 503 and a generic message, logging the upstream error server-side without leaking it to the client. <!-- unwanted-behavior -->

**Independent Test**: A successful login response carries `Set-Cookie: __session=...; HttpOnly; Secure; SameSite=Strict`; `grep -ri "NEXT_PUBLIC" src/` returns no auth configuration; the built client bundle (`grep -r "identitytoolkit\|apiKey" .next/static/`) contains no Identity Platform reference; a wrong password and an unknown email produce byte-identical response bodies.

---

### P1: Protected dashboard and logout ⭐ MVP

**User Story**: As an authenticated user, I want an internal page only I can reach and a working logout button, so that the session has a visible beginning and end.

**Why P1**: PRD's mandatory internal page and logout button.

**Acceptance Criteria**:

1. WHEN a request for `/dashboard` carries a valid, unrevoked session cookie for a verified account THEN the system SHALL render the dashboard server-side, showing the authenticated user's email. <!-- event-driven -->
2. IF a request for `/dashboard` carries no session cookie, an expired one, or one that fails `verifySessionCookie(..., checkRevoked: true)` THEN the system SHALL respond with HTTP 303 to `/login`. <!-- unwanted-behavior -->
3. WHEN the user activates logout THEN the system SHALL revoke the user's refresh tokens via the Admin SDK, clear the session cookie (`Max-Age=0`), and redirect to `/` with HTTP 303. <!-- event-driven -->
4. WHILE a session is active the system SHALL verify the session cookie on every protected request rather than trusting a cached client-side flag. <!-- state-driven -->
5. WHEN a user logs out and then replays the old cookie value against `/dashboard` THEN the system SHALL reject it and redirect to `/login`. <!-- event-driven -->

**Independent Test**: `curl -I https://<ip>/dashboard` (no cookie) returns 303 to `/login`; with a valid cookie it returns 200 containing the account email; after POSTing logout, replaying the captured cookie against `/dashboard` returns 303 to `/login`.

---

### P1: Brute-force protection — IP block for 60 seconds ⭐ MVP

**User Story**: As the operator, I want repeated failed logins from one IP to be blocked for a minute, so that password guessing is not practical.

**Why P1**: Explicit user requirement and a direct OWASP Top 10 mitigation (Identification and Authentication Failures).

**Acceptance Criteria**:

1. WHEN a login attempt from an IP fails THEN the system SHALL increment that IP's consecutive-failure counter in Firestore. <!-- event-driven -->
2. WHEN an IP reaches 5 consecutive failed login attempts THEN the system SHALL block that IP for 60 seconds and respond to further login attempts with HTTP 429 and a `Retry-After` header. <!-- event-driven -->
3. WHILE an IP is blocked the system SHALL reject its login attempts without calling Identity Platform at all. <!-- state-driven -->
4. WHEN a login succeeds THEN the system SHALL reset that IP's failure counter to zero. <!-- event-driven -->
5. WHEN 60 seconds elapse after a block starts THEN the system SHALL allow that IP to attempt login again, starting from a zeroed counter. <!-- event-driven -->
6. The system SHALL determine the client IP from the `X-Forwarded-For` header set by the VM's Nginx reverse proxy, taking the left-most entry, and SHALL fall back to the socket address when the header is absent. <!-- ubiquitous -->
7. WHILE an IP is already known-blocked in the in-process cache the system SHALL reject the request without a Firestore read or write, so that a sustained attack cannot exhaust the daily free quota. <!-- state-driven -->

**Independent Test**: Six sequential failed logins from the same IP: attempts 1-5 return 401, attempt 6 returns 429 with `Retry-After: 60`; after 60 seconds a valid credential succeeds with 303; a unit test drives the limiter's clock and asserts the exact transition at the 5th failure and at the 60-second boundary.

---

### P1: Security response headers (OWASP HTTP Headers Cheat Sheet) ⭐ MVP

**User Story**: As the operator, I want every response to carry the hardened header set OWASP recommends, so that XSS, clickjacking, sniffing, cross-origin leakage, and version-disclosure classes of attack are blocked at the browser.

**Why P1**: User-required; a visible, testable OWASP Security Misconfiguration mitigation. Values follow the [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html).

**Acceptance Criteria**:

1. The system SHALL send `Content-Security-Policy` on every HTML response with a per-request nonce, `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, and `frame-ancestors 'none'` — and SHALL NOT use `'unsafe-inline'` or `'unsafe-eval'` in `script-src`. <!-- ubiquitous -->
2. The system SHALL generate a fresh CSP nonce per request and apply it to Next.js's inline scripts, so that server-rendered pages work under the policy without weakening it. <!-- ubiquitous -->
3. The system SHALL send `Strict-Transport-Security: max-age=63072000; includeSubDomains` — OWASP's recommended two-year max-age, with the `preload` directive deliberately omitted because the site is served on a bare IP and IP hosts cannot be submitted to the HSTS preload list. <!-- ubiquitous -->
4. The system SHALL send `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: geolocation=(), camera=(), microphone=()`. <!-- ubiquitous -->
5. WHEN a request to any `/api/*` route carries an `Origin` header that is not the application's own origin THEN the system SHALL reject it with HTTP 403 and SHALL NOT emit any `Access-Control-Allow-Origin` header. <!-- event-driven -->
6. The system SHALL NOT send `Access-Control-Allow-Origin: *` on any route. <!-- ubiquitous -->
7. The system SHALL send `X-Frame-Options: DENY` alongside `frame-ancestors 'none'` for older-browser coverage. <!-- ubiquitous -->
8. The system SHALL send `X-XSS-Protection: 0`, explicitly disabling the legacy browser XSS auditor rather than omitting the header — OWASP recommends `0` because the legacy filter has itself been an exploitation vector; CSP is the actual XSS control. <!-- ubiquitous -->
9. The system SHALL send `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and `Cross-Origin-Resource-Policy: same-site`. <!-- ubiquitous -->
10. WHEN a response carries authenticated or credential-bearing content (`/dashboard`, any `/api/auth/*` response) THEN the system SHALL send `Cache-Control: no-store`. <!-- event-driven -->
11. The system SHALL send `Content-Type` with an explicit charset on HTML responses (`text/html; charset=utf-8`). <!-- ubiquitous -->
12. The system SHALL NOT disclose framework or server version information in response headers: `X-Powered-By` SHALL be disabled at the application (`poweredByHeader: false` in `next.config.ts`) and the Nginx `Server` header SHALL be reduced to a non-informative value (`server_tokens off`, applied in the VM story). <!-- ubiquitous -->
13. The system SHALL NOT send the deprecated `Expect-CT` or `Public-Key-Pins` headers. <!-- ubiquitous -->

**Independent Test**: `curl -sI https://<ip>/` shows CSP (with a `nonce-` value that differs between two consecutive requests), `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, all three `Cross-Origin-*` headers, and `Content-Type: text/html; charset=utf-8`; `curl -sI https://<ip>/dashboard` (authenticated) shows `Cache-Control: no-store`; `curl -sI https://<ip>/ | grep -iE "x-powered-by|expect-ct|public-key-pins|access-control-allow-origin"` returns nothing and the `Server` header shows no version; a request with `Origin: https://evil.example` to `/api/auth/login` returns 403.

---

### P1: CSRF protection on state-changing requests ⭐ MVP

**User Story**: As a logged-in user, I want requests forged by another site to be rejected, so that my session cannot be used against me.

**Why P1**: User-required and one of the documented OWASP mitigations.

**Acceptance Criteria**:

1. The system SHALL issue a CSRF token as a `SameSite=Strict`, `Secure` cookie and embed the matching value in a hidden field of every form that mutates state. <!-- ubiquitous -->
2. WHEN a POST, PUT, PATCH, or DELETE request arrives THEN the system SHALL require the submitted CSRF token to equal the cookie's token, compared in constant time, and SHALL respond with HTTP 403 when they differ or either is missing. <!-- event-driven -->
3. WHEN a state-changing request arrives THEN the system SHALL additionally require its `Origin` (or, when absent, `Referer`) to match the application's own origin, rejecting the request with HTTP 403 otherwise. <!-- event-driven -->
4. The system SHALL generate CSRF tokens with a cryptographically secure random source (≥ 32 bytes) and never derive them from the session cookie, the user ID, or a timestamp. <!-- ubiquitous -->

**Independent Test**: A form POST with a mismatched token returns 403; the same POST with the matching token succeeds; a POST carrying a valid token but `Origin: https://evil.example` returns 403; a unit test asserts constant-time comparison is used (no early-exit `===` on the raw strings).

---

### P2: General rate limiting

**User Story**: As the operator, I want all endpoints rate-limited per IP, so that a single client cannot exhaust the VM's modest resources.

**Why P2**: Valuable hardening the user asked for, but the graded brute-force requirement is already covered by its own story; the app remains functional and compliant without this broader limiter.

**Acceptance Criteria**:

1. WHEN an IP exceeds 10 requests per minute to any `/api/auth/*` route THEN the system SHALL respond with HTTP 429 and a `Retry-After` header. <!-- event-driven -->
2. WHEN an IP exceeds 100 requests per minute to any other route THEN the system SHALL respond with HTTP 429 and a `Retry-After` header. <!-- event-driven -->
3. The system SHALL apply rate limiting before authentication, so unauthenticated floods are cheap to reject. <!-- ubiquitous -->

**Independent Test**: A loop of 11 requests within one minute to `/api/auth/login` produces at least one 429 with `Retry-After`; a loop of 101 requests to `/` produces at least one 429.

---

### P1: Unit tests and the pull-request gate ⭐ MVP

**User Story**: As a maintainer, I want unit tests to run automatically on every pull request, so that a regression cannot be merged silently.

**Why P1**: Explicit user requirement ("durante a abertura do Pull Request deverá haver ao menos o verificador de testes unitários").

**Acceptance Criteria**:

1. The system SHALL provide unit tests (Vitest) covering, at minimum: password-strength validation, email normalisation, the brute-force limiter's counting/blocking/reset transitions, the general rate limiter, CSRF token generation and constant-time comparison, the security-header builder, and session-cookie verification success/failure branches. <!-- ubiquitous -->
2. WHEN a pull request targeting `main` is opened or updated THEN GitHub Actions SHALL run install, lint, typecheck, and the unit-test suite. <!-- event-driven -->
3. IF any of lint, typecheck, or the unit tests fail THEN the workflow SHALL exit non-zero so the pull-request check is reported as failed. <!-- unwanted-behavior -->
4. The tests SHALL assert spec-defined outcomes (e.g. "the 5th consecutive failure blocks for exactly 60 seconds"), never merely that a function was called. <!-- ubiquitous -->

**Independent Test**: `npm test` passes locally with a non-zero test count; opening a PR with a deliberately broken assertion shows a red check on GitHub; the workflow file triggers on `pull_request` against `main`.

---

### P1: Continuous deployment to the VM on merge ⭐ MVP

**User Story**: As a maintainer, I want merging to `main` to deploy the app to the VM automatically, so that production always matches the default branch.

**Why P1**: PRD's CI/CD axis is a graded criterion.

**Acceptance Criteria**:

1. WHEN a push lands on `main` THEN GitHub Actions SHALL build the app (`next build` with `output: "standalone"`) and deploy the resulting bundle to the VM over an IAP tunnel (no SSH key file). <!-- event-driven -->
2. The workflow SHALL authenticate to GCP with Workload Identity Federation and SHALL NOT contain or consume a service-account JSON key. <!-- ubiquitous -->
3. WHEN the workflow needs the deploy target THEN it SHALL resolve the VM's current external IP with `gcloud compute instances describe` rather than a hardcoded address. <!-- event-driven -->
4. IF the VM is `TERMINATED` at deploy time THEN the workflow SHALL start the instance, wait for it to reach `RUNNING`, and resolve its new ephemeral external IP before deploying — it SHALL NOT reserve or attach a static IP. The static-IP reservation stays in `ops/vm-start.sh` for the operator's separate need for a stable public IP for the duration of a session. <!-- unwanted-behavior -->
5. WHEN the bundle reaches the VM THEN the workflow SHALL transfer it and run remote commands over an IAP tunnel (`gcloud compute scp`/`ssh --tunnel-through-iap`) authenticated by the WIF-federated deploy service account — with no SSH key file written — then restart the app through PM2 and confirm the deployment by polling `https://<ip>/` until it returns HTTP 200, failing the job after 2 minutes without a 200. <!-- event-driven -->
6. VM authentication SHALL go entirely through the WIF-federated deploy service account over an IAP tunnel, with **no SSH key material stored as a GitHub secret or committed to the repository**; the workflow SHALL read every other credential (WIF provider, service-account email, Identity Platform API key, Admin SDK credentials) from GitHub Actions secrets — never from a file in the repository. <!-- ubiquitous -->
7. The system SHALL write the application's runtime environment file on the VM (outside the repository, e.g. `/opt/app/.env.production`) with `chmod 600`, populated from GitHub secrets at deploy time. <!-- ubiquitous -->
8. The repository SHALL contain no `.env` file, no service-account key, and no secret value — enforced by `.gitignore` and verifiable with `git ls-files`. <!-- ubiquitous -->

**Independent Test**: A merge to `main` produces a green Actions run whose logs show WIF authentication (no key file), an IP resolved dynamically, `gcloud compute scp/ssh --tunnel-through-iap` reaching the VM with no SSH private key in the workspace, a PM2 restart, and a 200 from the health poll; the workflow file contains no `VM_SSH_*` secret reference; `git ls-files | grep -E '\.env$|credentials.*\.json'` returns nothing; `curl -s https://<ip>/` serves the newly built page.

---

### P1: Terraform — Identity Platform, Firestore, and Workload Identity Federation ⭐ MVP

**User Story**: As the operator, I want the app's GCP dependencies provisioned as code alongside the existing infrastructure, so that the environment is reproducible.

**Why P1**: Without Identity Platform and Firestore the app cannot run; without WIF the pipeline cannot deploy.

**Acceptance Criteria**:

1. The system SHALL enable `identitytoolkit.googleapis.com`, `firestore.googleapis.com`, `iamcredentials.googleapis.com`, `iap.googleapis.com`, and `apikeys.googleapis.com` through `google_project_service` resources. <!-- ubiquitous -->
2. The system SHALL configure Identity Platform with email/password sign-in enabled via `google_identity_platform_config` (`sign_in.email.enabled = true`, `password_required = true`). <!-- ubiquitous -->
3. The system SHALL create a Firestore database in Native mode in the same region as the VM (`us-east1`). <!-- ubiquitous -->
4. The system SHALL create a Workload Identity Pool and an OIDC provider for GitHub Actions, plus a deploy service account bound to it, restricted by an attribute condition to this repository only. <!-- ubiquitous -->
5. The deploy service account SHALL hold instance-scoped `roles/compute.instanceAdmin.v1` and `roles/iap.tunnelResourceAccessor` on the app VM, `roles/iam.serviceAccountUser` (SA-scoped) on the VM's attached service account, and its only project-scoped grant SHALL be **one custom role limited to compute read/list and operation-get permissions**; it SHALL hold **no predefined project role**, and never `roles/owner` or `roles/editor`. Start/stop/setMetadata are instance-scoped. <!-- ubiquitous -->
6. The system SHALL provision the Identity Platform API key as a `google_apikeys_key` restricted to `identitytoolkit.googleapis.com`, and SHALL expose it — together with the Workload Identity provider resource name and the deploy service-account email — as Terraform outputs so they can be copied into GitHub secrets (the API key output marked `sensitive`). <!-- ubiquitous -->
7. IF any of these resources is added THEN `terraform destroy` in `infra/` SHALL still complete without manual intervention. <!-- unwanted-behavior -->

**Independent Test**: `terraform apply` creates all resources with no error; `terraform output -raw identity_platform_api_key` prints a key string and `gcloud services api-keys list` shows it restricted to `identitytoolkit.googleapis.com`; `gcloud identity-platform config describe` (or the console) shows email sign-in enabled; `gcloud firestore databases list` shows a Native-mode database in `us-east1`; `gcloud compute instances get-iam-policy app-vm` shows the deploy SA with `roles/compute.instanceAdmin.v1` and `roles/iap.tunnelResourceAccessor`; `gcloud projects get-iam-policy <project>` shows the deploy SA bound only to `projects/<id>/roles/deployVmOperator` (no predefined project role); `gcloud iam roles describe deployVmOperator --project=<id>` lists only read/list/operations-get permissions; `terraform destroy` then `terraform apply` round-trips cleanly.

---

### P1: VM runtime prepared for Next.js ⭐ MVP

**User Story**: As the operator, I want the VM to run a Node.js version the app actually supports, so that the deployed bundle starts instead of crashing.

**Why P1**: A hard blocker — verified: Ubuntu 24.04's `apt` `nodejs` package is 18.19, while `next@16.3.4` declares `engines.node >= 20.9.0`.

**Acceptance Criteria**:

1. The system SHALL install Node.js 24 LTS on the VM from the NodeSource repository instead of the distribution's `nodejs` package, idempotently, in `infra/scripts/startup.sh.tpl`. <!-- ubiquitous -->
2. WHEN the startup script completes THEN `node --version` on the VM SHALL report a major version ≥ 24 (which satisfies `next@16`'s `engines.node >= 20.9.0`). <!-- event-driven -->
3. The system SHALL keep PM2 installed and registered for boot survival after the Node.js change, with the existing `pm2 startup` behaviour unchanged. <!-- ubiquitous -->
4. The system SHALL create a dedicated locked service user `appsvc` and create `/opt/app` owned by `appsvc`; the keyless IAP deploy connects as its own ephemeral sudo-capable user and hands each release to `appsvc`. <!-- ubiquitous -->
5. The system SHALL set `server_tokens off;` in the Nginx configuration so the `Server` response header discloses no version, satisfying the OWASP header story's version-disclosure requirement at the proxy layer. <!-- ubiquitous -->

**Independent Test**: On a freshly booted VM, `node --version` prints `v24.x`; `pm2 list` still works and `systemctl status pm2-appsvc` is active; `test -w /opt/app` succeeds as `appsvc`; `curl -sI https://<ip>/ | grep -i '^server:'` shows `nginx` with no version number.

---

### P1: OWASP Top 10 documentation ⭐ MVP

**User Story**: As a grader, I want the README to state which OWASP Top 10:2025 categories are mitigated and exactly where in the code, so that the claim is verifiable.

**Why P1**: PRD makes this documentation itself a graded criterion.

**Acceptance Criteria**:

1. The system SHALL document at least three OWASP Top 10:2025 categories in `README.md`, each with the category name, the mitigation implemented, and a `path/to/file` reference to the code implementing it. <!-- ubiquitous -->
2. The documentation SHALL cover at minimum: Identification and Authentication Failures (brute-force blocking, generic auth errors, password policy), Security Misconfiguration (CSP, HSTS, CORS, security headers), and Broken Access Control (server-side session verification on every protected request, CSRF). <!-- ubiquitous -->
3. Every file path cited in that section SHALL exist in the repository. <!-- ubiquitous -->

**Independent Test**: The README section lists ≥ 3 categories; every path it cites resolves (`while read p; do test -e "$p"; done`); each entry names a concrete mechanism, not a generic claim.

---

## Edge Cases

- IF the Identity Platform API key is missing or invalid at runtime THEN the login and signup routes SHALL return HTTP 503 with a generic message and log the misconfiguration server-side, rather than crashing the process.
- IF Firestore is unreachable when the rate limiter tries to read or write THEN the system SHALL fail **closed** for login attempts (reject with 503) rather than allowing unlimited attempts — availability of a login form matters less than the brute-force guarantee.
- WHEN two requests from the same IP race at the boundary of the 5th failure THEN the limiter SHALL use a Firestore transaction so the counter cannot skip the threshold.
- IF a user's account is deleted or disabled while their session cookie is still valid THEN `verifySessionCookie(..., checkRevoked: true)` SHALL reject it on the next protected request.
- WHEN the verification email link is clicked THEN Identity Platform's own hosted handler marks the account verified; the app SHALL re-check `emailVerified` on the next login rather than caching the previous value.
- IF the deploy runs while a previous PM2 process is still serving THEN the pipeline SHALL replace the bundle and reload PM2 so that the port is never left unbound.
- IF `X-Forwarded-For` is spoofed by a client THEN the system SHALL still take the left-most value, and this limitation SHALL be documented — Nginx on the VM is the only ingress, so it overwrites the header for direct traffic.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| APP-01 | P1: Public landing page | Design | Pending |
| APP-02 | P1: Public landing page | Design | Pending |
| APP-03 | P1: Public landing page | Design | Pending |
| APP-04 | P1: Public landing page | Design | Pending |
| AUTH-01 | P1: Public signup with email verification | Design | Pending |
| AUTH-02 | P1: Public signup with email verification | Design | Pending |
| AUTH-03 | P1: Public signup with email verification | Design | Pending |
| AUTH-04 | P1: Public signup with email verification | Design | Pending |
| AUTH-05 | P1: Public signup with email verification | Design | Pending |
| AUTH-06 | P1: Public signup with email verification | Design | Pending |
| AUTH-07 | P1: Server-only login with session cookie | Design | Pending |
| AUTH-08 | P1: Server-only login with session cookie | Design | Pending |
| AUTH-09 | P1: Server-only login with session cookie | Design | Pending |
| AUTH-10 | P1: Server-only login with session cookie | Design | Pending |
| AUTH-11 | P1: Server-only login with session cookie | Design | Pending |
| AUTH-12 | P1: Server-only login with session cookie | Design | Pending |
| AUTH-13 | P1: Protected dashboard and logout | Design | Pending |
| AUTH-14 | P1: Protected dashboard and logout | Design | Pending |
| AUTH-15 | P1: Protected dashboard and logout | Design | Pending |
| AUTH-16 | P1: Protected dashboard and logout | Design | Pending |
| AUTH-17 | P1: Protected dashboard and logout | Design | Pending |
| SEC-01 | P1: Brute-force protection | Design | Pending |
| SEC-02 | P1: Brute-force protection | Design | Pending |
| SEC-03 | P1: Brute-force protection | Design | Pending |
| SEC-04 | P1: Brute-force protection | Design | Pending |
| SEC-05 | P1: Brute-force protection | Design | Pending |
| SEC-06 | P1: Brute-force protection | Design | Pending |
| SEC-07 | P1: Brute-force protection | Design | Pending |
| SEC-08 | P1: Security response headers | Design | Pending |
| SEC-09 | P1: Security response headers | Design | Pending |
| SEC-10 | P1: Security response headers | Design | Pending |
| SEC-11 | P1: Security response headers | Design | Pending |
| SEC-12 | P1: Security response headers | Design | Pending |
| SEC-13 | P1: Security response headers | Design | Pending |
| SEC-14 | P1: Security response headers | Design | Pending |
| SEC-15 | P1: Security response headers | Design | Pending |
| SEC-16 | P1: Security response headers | Design | Pending |
| SEC-17 | P1: Security response headers | Design | Pending |
| SEC-18 | P1: Security response headers | Design | Pending |
| SEC-19 | P1: Security response headers | Design | Pending |
| SEC-20 | P1: Security response headers | Design | Pending |
| SEC-21 | P1: CSRF protection | Design | Pending |
| SEC-22 | P1: CSRF protection | Design | Pending |
| SEC-23 | P1: CSRF protection | Design | Pending |
| SEC-24 | P1: CSRF protection | Design | Pending |
| SEC-25 | P2: General rate limiting | - | Pending |
| SEC-26 | P2: General rate limiting | - | Pending |
| SEC-27 | P2: General rate limiting | - | Pending |
| TEST-01 | P1: Unit tests and the PR gate | Design | Pending |
| TEST-02 | P1: Unit tests and the PR gate | Design | Pending |
| TEST-03 | P1: Unit tests and the PR gate | Design | Pending |
| TEST-04 | P1: Unit tests and the PR gate | Design | Pending |
| CICD-01 | P1: Continuous deployment to the VM | Design | Pending |
| CICD-02 | P1: Continuous deployment to the VM | Design | Pending |
| CICD-03 | P1: Continuous deployment to the VM | Design | Pending |
| CICD-04 | P1: Continuous deployment to the VM | Design | Pending |
| CICD-05 | P1: Continuous deployment to the VM | Design | Pending |
| CICD-06 | P1: Continuous deployment to the VM | Design | Pending |
| CICD-07 | P1: Continuous deployment to the VM | Design | Pending |
| CICD-08 | P1: Continuous deployment to the VM | Design | Pending |
| TF-01 | P1: Terraform — Identity Platform, Firestore, WIF | Design | Pending |
| TF-02 | P1: Terraform — Identity Platform, Firestore, WIF | Design | Pending |
| TF-03 | P1: Terraform — Identity Platform, Firestore, WIF | Design | Pending |
| TF-04 | P1: Terraform — Identity Platform, Firestore, WIF | Design | Pending |
| TF-05 | P1: Terraform — Identity Platform, Firestore, WIF | Design | Pending |
| TF-06 | P1: Terraform — Identity Platform, Firestore, WIF | Design | Pending |
| TF-07 | P1: Terraform — Identity Platform, Firestore, WIF | Design | Pending |
| VM-01 | P1: VM runtime prepared for Next.js | Design | Pending |
| VM-02 | P1: VM runtime prepared for Next.js | Design | Pending |
| VM-03 | P1: VM runtime prepared for Next.js | Design | Pending |
| VM-04 | P1: VM runtime prepared for Next.js | Design | Pending |
| VM-05 | P1: VM runtime prepared for Next.js | Design | Pending |
| DOCS-01 | P1: OWASP Top 10 documentation | Design | Pending |
| DOCS-02 | P1: OWASP Top 10 documentation | Design | Pending |
| DOCS-03 | P1: OWASP Top 10 documentation | Design | Pending |

**Coverage:** 75 total, 0 mapped to tasks, 75 unmapped ⚠️ (tasks phase not yet run)

---

## Success Criteria

- [ ] `https://<vm-ip>/` serves the SSR landing page; `/login`, `/signup`, and `/dashboard` behave per their stories.
- [ ] A grader can sign up, verify by email, log in, see the dashboard, and log out.
- [ ] No `NEXT_PUBLIC_*` auth value, Firebase config object, or API key appears in the client bundle or page source.
- [ ] Six failed logins from one IP produce a 429 with `Retry-After: 60`; the sixth attempt never reaches Identity Platform.
- [ ] `curl -sI` shows the full OWASP header set — CSP with a per-request nonce, HSTS (`max-age=63072000`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, all three `Cross-Origin-*` headers, explicit `Content-Type` charset — and shows no `Access-Control-Allow-Origin`, no `X-Powered-By`, no server version, and no deprecated `Expect-CT`/`Public-Key-Pins`.
- [ ] Authenticated responses (`/dashboard`, `/api/auth/*`) carry `Cache-Control: no-store`.
- [ ] Opening a PR runs lint, typecheck, and unit tests as a required-looking check; merging to `main` deploys and the health poll returns 200.
- [ ] `git ls-files` contains no `.env`, service-account key, or other secret.
- [ ] `README.md` documents ≥ 3 OWASP Top 10:2025 categories with existing file paths.
