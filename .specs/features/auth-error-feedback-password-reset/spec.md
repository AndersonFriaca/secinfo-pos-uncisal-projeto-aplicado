# auth-error-feedback-password-reset Specification

## Problem Statement

`POST /api/auth/signup` returns a raw `application/json` error body (400/429/503)
straight to the browser on any rejection, including a duplicate-email attempt.
Because `SignupForm` is a native, non-JS `<form>`, the browser navigates to and
renders that raw JSON instead of the app's UI. Separately, there is no
password-reset flow anywhere in the app — a user who forgets their password has
no recovery path.

## Goals

- [ ] Every signup rejection redirects back to `/signup` and renders a
      human-readable message via the existing `Alert` component (zero raw JSON
      ever shown to the browser).
- [ ] A user can request a password-reset email from a `/forgot-password`
      screen without the response ever revealing whether the email is registered.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Fixing the identical raw-JSON-on-error behavior in `/api/auth/login` | Same root cause, but not what was reported. Worth a follow-up, kept out to keep this diff reviewable. |
| A custom "set new password" page inside this app | Firebase Authentication's authorized-domains list does not accept bare IP addresses, and this deployment is IP-only (AD-003, no purchased domain). A custom `continueUrl` back into this app is not viable without provisioning a real domain, which is a separate infra decision. |
| Registering a real domain / DNS for this app | Same reason as above; explicitly declined by the user for this feature. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Where password-reset completes | Identity Platform's own default-hosted action page (`*.firebaseapp.com`), not a page in this app | Verified via web search (2026-09) that Firebase authorized domains require a real domain name, not an IP; this app only has an ephemeral IP (AD-003) | y (user picked this option explicitly) |
| Rate-limit bucket for the new endpoint | Reuse the existing `"auth"` bucket (`web/lib/security/rate-limit.ts`) | Same shape of abuse (credential/account endpoint hit from one IP) as login/signup; avoids a new bucket config | y |
| Error-message granularity on `/signup` | Three codes: `invalid` (generic, AUTH-04-safe), `rate_limited`, `unavailable` — no code ever named after which specific rule failed | Keeps the no-enumeration guarantee (AUTH-04) while still telling the user rate-limit/outage apart from a rejected submission | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Signup shows a real error screen instead of raw JSON ⭐ MVP

**User Story**: As a visitor trying to create an account, I want to see a
readable error message on the signup page (not a JSON blob) when my signup is
rejected, so that I understand what happened and can retry.

**Why P1**: This is the reported bug; without it, every signup rejection today
renders as broken raw JSON.

**Acceptance Criteria**:

1. WHEN `POST /api/auth/signup` rejects a request for any reason (invalid
   email, weak password, or an upstream signup failure including a duplicate
   email) THEN the system SHALL respond with a `303` redirect to
   `/signup?error=invalid` instead of a JSON body.
2. WHEN `POST /api/auth/signup` is rate-limited THEN the system SHALL redirect
   to `/signup?error=rate_limited` instead of a JSON body.
3. WHEN `POST /api/auth/signup` finds Identity Platform unavailable THEN the
   system SHALL redirect to `/signup?error=unavailable` instead of a JSON body.
4. WHEN `/signup` is requested with `?error=invalid` (or an unrecognized code)
   THEN the page SHALL render "Não foi possível criar a conta com esses dados".
5. WHEN `/signup` is requested with `?error=rate_limited` THEN the page SHALL
   render "Muitas requisições, tente novamente em instantes".
6. WHEN `/signup` is requested with `?error=unavailable` THEN the page SHALL
   render "Serviço temporariamente indisponível".
7. The system SHALL NOT include, in any `/signup` error code or message,
   information that reveals whether a specific email is already registered
   (preserves AUTH-04).

**Independent Test**: Submit `/signup` with an email already registered (e.g.
via a mocked Identity Platform `EMAIL_EXISTS` response) and confirm the browser
lands back on `/signup` showing the Alert message, not a JSON page.

---

### P1: Request a password-reset email ⭐ MVP

**User Story**: As a user who forgot their password, I want to request a
password-reset email from a `/forgot-password` screen, so that I can regain
access to my account.

**Why P1**: Without this, a locked-out user has no recovery path at all.

**Acceptance Criteria**:

1. WHEN a user submits `/forgot-password` with a syntactically valid,
   normalized email THEN the system SHALL call Identity Platform
   `accounts:sendOobCode` with `requestType: "PASSWORD_RESET"` for that email.
2. WHEN that call completes (regardless of whether Identity Platform reports
   the account exists) THEN the system SHALL redirect to
   `/forgot-password?sent=1` with the same generic confirmation shown either
   way (no enumeration, mirrors AUTH-04's approach for signup).
3. IF the submitted email is empty or fails the existing normalization/shape
   check THEN the system SHALL redirect to `/forgot-password?error=invalid`
   without calling Identity Platform.
4. `POST /api/auth/forgot-password` SHALL be rate-limited on the `auth` bucket,
   keyed by client IP, the same as `/api/auth/login` and `/api/auth/signup`.
5. IF the `auth` bucket is exhausted for the caller's IP THEN the system SHALL
   redirect to `/forgot-password?error=rate_limited` with no JSON body.
6. WHEN `/login` is rendered THEN it SHALL show a "Esqueceu a senha?" link to
   `/forgot-password`, styled consistently with the existing signup/login
   cross-link.

**Independent Test**: Submit `/forgot-password` with a valid email, confirm
`sendOobCode` was called with `requestType: "PASSWORD_RESET"` and the browser
lands on `/forgot-password?sent=1` showing the confirmation message; repeat
with an email that does not exist and confirm byte-identical UI behavior.

---

## Edge Cases

- IF `/forgot-password` receives a request with no `csrf_token` or a mismatched
  one THEN the existing `proxy.ts` same-origin/CSRF enforcement SHALL reject it
  the same way it does for `/login` and `/signup` today (no new behavior
  needed here — reusing the existing contract).
- IF Identity Platform's `sendOobCode` call itself fails at the transport/5xx
  level THEN the system SHALL still redirect to `/forgot-password?sent=1` (not
  reveal a distinct failure state) UNLESS the failure is the rate-limit or
  validation case already covered above — this keeps the account-existence
  signal uniform even under backend failure.
- WHEN a `/signup` `error` query value is anything other than `invalid`,
  `rate_limited`, or `unavailable` THEN the page SHALL fall back to the
  `invalid` (generic) message rather than rendering nothing.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTH-18 | P1: Signup error screen | Design | Pending |
| AUTH-19 | P1: Signup error screen | Design | Pending |
| AUTH-20 | P1: Password-reset request | Design | Pending |
| AUTH-21 | P1: Password-reset request | Design | Pending |
| AUTH-22 | P1: Password-reset request | Design | Pending |
| UI-16 | P1: Signup error screen | Design | Pending |
| UI-17 | P1: Password-reset request | Design | Pending |
| UI-18 | P1: Password-reset request | Design | Pending |
| APP-05 | P1: Password-reset request | Design | Pending |

**ID format:** `[CATEGORY]-[NUMBER]`, continuing the numbering already used in
this codebase (`AUTH-*` through 17, `UI-*` through 15, `APP-*` through 4).

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 9 total, 9 to be mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] No signup rejection ever renders raw JSON in the browser — every path
      lands back on `/signup` with a readable message.
- [ ] A user can request a password-reset email from `/forgot-password` and
      the app's response is identical whether or not the email is registered.
- [ ] `/login` links to `/forgot-password`.
