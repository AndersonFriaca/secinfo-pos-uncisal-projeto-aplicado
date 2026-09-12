# auth-error-feedback-password-reset Validation

**Date**: 2026-09-12
**Spec**: `.specs/features/auth-error-feedback-password-reset/spec.md`
**Diff range**: `51523d1..HEAD` (17 files changed, 960 insertions, 91 deletions)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| --- | --- | --- |
| T1 (signup redirect) | ✅ Done | Commit `b2a3035` |
| T2 (signup UI messages) | ✅ Done | Commit `bf1ea1e` |
| T3 (sendPasswordResetEmail) | ✅ Done | Commit `99c5579` |
| T4 (POST /api/auth/forgot-password) | ✅ Done | Commit `e39ee27` |
| T5 (forgot-password screen) | ✅ Done | Commit `1af29a4` |
| T6 (login link) | ✅ Done | Commit `84e3587` |

---

## Spec-Anchored Acceptance Criteria

### P1: Signup shows a real error screen instead of raw JSON

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: any signup rejection | `303` to `/signup?error=invalid`, no JSON | `web/app/api/auth/signup/route.test.ts:60-69` (malformed email), `:71-84` (duplicate/other invalid), `:42-58` (weak password) — `expect(res.status).toBe(303)`, `expect(res.headers.get("location")).toBe("/signup?error=invalid")` | ✅ PASS |
| AC2: rate-limited | `error=rate_limited` | `route.test.ts:86-101` — `expect(...).toBe("/signup?error=rate_limited")` | ✅ PASS |
| AC3: Identity Platform unavailable | `error=unavailable` | `route.test.ts:103-115` — `expect(...).toBe("/signup?error=unavailable")` | ✅ PASS |
| AC4: `error=invalid` (or unrecognized) message | "Não foi possível criar a conta com esses dados" | `web/components/auth/signup-form.test.tsx:31-37,55-61` — `expect(html).toContain(SIGNUP_GENERIC_ERROR)` | ✅ PASS |
| AC5: `error=rate_limited` message | "Muitas requisições, tente novamente em instantes" | `signup-form.test.tsx:39-45` | ✅ PASS |
| AC6: `error=unavailable` message | "Serviço temporariamente indisponível" | `signup-form.test.tsx:47-53` | ✅ PASS |
| AC7: no enumeration in signup error code/message | duplicate-email produces byte-identical response to any other invalid rejection | `route.test.ts:71-84` — `expect(await dupe.clone().text()).toBe(await other.clone().text())` + location equality | ✅ PASS |

### P1: Request a password-reset email

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: valid email calls sendOobCode PASSWORD_RESET | body `{requestType:"PASSWORD_RESET", email}` | `web/lib/auth/identity-platform.test.ts:218-231` — `expect(calls[0].body).toEqual({requestType:"PASSWORD_RESET", email:"u@example.com"})` | ✅ PASS |
| AC2: same generic redirect regardless of result (no enumeration) | `/forgot-password?sent=1` byte-identical for registered/unregistered | `web/app/api/auth/forgot-password/route.test.ts:34-55` — status, location and body equality asserted between `ok:true` and `ok:false` mocked results | ✅ PASS |
| AC3: empty/invalid email → `error=invalid`, no upstream call | `route.test.ts:57-74` — `expect(d.sendPasswordResetEmail).not.toHaveBeenCalled()` | ✅ PASS |
| AC4: rate-limited on `auth` bucket keyed by IP | `checkRateLimit(ip, "auth")` called | `web/app/api/auth/forgot-password/handler.ts:60-64` calls `deps.checkRateLimit(ip, "auth")`; `route.test.ts:76-93` asserts `error=rate_limited` result and no upstream call | ✅ PASS |
| AC5: rate bucket exhausted → `error=rate_limited`, no JSON | `route.test.ts:76-93` — `expect(res.headers.get("location")).toBe("/forgot-password?error=rate_limited")` | ✅ PASS |
| AC6: `/login` shows "Esqueceu a senha?" link | `web/components/auth/login-form.tsx:62-67` renders `<Link href="/forgot-password">Esqueceu a senha?</Link>`; `web/components/auth/login-form.test.tsx:62-67` — `expect(html).toContain('href="/forgot-password"')` | ⚠️ Spec-precision gap (see below) |

**⚠️ Spec-precision gap (AC6, story 2)**: Task T6's own "Done when" requires the link be "styled consistently with the existing signup/login cross-link" — *same class names*. The implementation uses `className="text-sm underline underline-offset-4"` (adds `text-sm`) versus the existing cross-link's `className="underline underline-offset-4"` — not identical. The test only asserts `href`, never the class list, so this deviation from the task's own acceptance bar is untested. Functionally harmless (spec's own AC6 only requires "styled consistently", which is a squishier bar than the task file's), but the stricter task-level claim is not verified by any assertion.

**Status**: ✅ All ACs covered / ⚠️ 1 spec-precision gap flagged (cosmetic, non-blocking)

---

## Discrimination Sensor

Isolated in a temporary git worktree (`git worktree add /tmp/sensor-scratch HEAD`), `node_modules` symlinked in for speed, mutated one at a time, tests run per mutation, worktree reverted (`git checkout -- .`) between mutations, then removed (`git worktree remove --force`). Real-tree `git status --porcelain` was empty before the sensor ran and empty after removal — isolation confirmed.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `web/app/api/auth/signup/handler.ts:100` | Changed the generic-rejection redirect code `error=invalid` → `error=other_code` | ✅ Killed — `signup/route.test.ts` duplicate-email/byte-identical assertion failed |
| 2 | `web/app/api/auth/forgot-password/handler.ts:73-74` | Made the redirect branch on `sendPasswordResetEmail`'s result (`ok` → `sent=1`, else → `error=invalid`), reintroducing enumeration | ✅ Killed — `forgot-password/route.test.ts` "unregistered email → same redirect" test failed |
| 3 | `web/app/api/auth/forgot-password/handler.ts:62-65` | Removed the `checkRateLimit` gate entirely | ✅ Killed — `forgot-password/route.test.ts` rate-limited test failed |

**Sensor depth**: lightweight (default tier; not a P0/critical-payment path per this repo's own auth conventions, though auth-adjacent — 3 targeted mutations judged sufficient given both new-code call sites got independently killed)
**Result**: 3/3 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ (login-page raw-JSON bug and custom reset-page explicitly out of scope per spec, and left alone) |
| Matches patterns | ✅ (mirrors `signup`'s route/handler split, `sendVerificationEmail`'s shape) |
| Spec-anchored outcome check (asserted values match spec) | ✅ (see AC table; 1 sub-AC gap noted, not a spec/test mismatch) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | none dedicated — strong defaults applied (per tasks.md's own Test Coverage Matrix note) |

---

## Edge Cases

- [x] CSRF/same-origin enforcement on `/forgot-password`: not new code — `web/proxy.ts:104-136` applies the same-origin + CSRF check to every non-safe-method `/api/*` request generically (no `/forgot-password`-specific carve-out), confirmed by reading `proxy.ts` directly (no per-route test needed, matches the edge case's own framing that no new behavior is required).
- [x] `sendOobCode` transport/5xx failure still redirects to `?sent=1`: `sendPasswordResetEmail` collapses non-200 to `{ok:false, reason:"invalid"}` (`identity-platform.ts:210-214`) and the handler never branches on that result (`handler.ts:73-74`), so a 5xx also lands on `?sent=1` — verified structurally (no dedicated 5xx-through-handler test, but `identity-platform.test.ts:241-247` covers the 500→unavailable collapse at the wrapper layer and the handler's non-branching is directly covered by mutation 2 above).
- [x] Unrecognized `/signup` error code falls back to generic message: `signup-form.test.tsx:55-61` — `error="something-else"` → `SIGNUP_GENERIC_ERROR`.

---

## Gate Check

- **Gate command**: `npx vitest run` (run from `web/`)
- **Result**: 216 passed, 0 failed, 0 skipped (27 test files)
- **Failures**: none

---

## Fix Plans

None — no FAIL-level gaps. One cosmetic spec-precision gap noted above (T6 class-name parity untested); does not block PASS.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| AUTH-18 | Pending | ✅ Verified |
| AUTH-19 | Pending | ✅ Verified |
| AUTH-20 | Pending | ✅ Verified |
| AUTH-21 | Pending | ✅ Verified |
| AUTH-22 | Pending | ✅ Verified |
| UI-16 | Pending | ✅ Verified |
| UI-17 | Pending | ✅ Verified |
| UI-18 | Pending | ⚠️ Verified (functional), class-name parity untested |
| APP-05 | Pending | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 13/13 ACs matched spec outcome; 1 minor sub-AC (task-level styling claim) flagged as untested, not spec-violating
**Sensor**: 3/3 mutations killed
**Gate**: 216 passed, 0 failed

**What works**: Every signup rejection path redirects with the correct code and never leaks JSON; the three error messages render correctly and fall back safely; duplicate-email is byte-identical to any other rejection (AUTH-04 preserved). The forgot-password flow rate-limits on the shared `auth` bucket, validates before calling upstream, and never branches its redirect on whether the account exists — confirmed both by direct assertion and by a mutation that reintroduced branching and was caught. Login links to `/forgot-password`.

**Issues found**: Cosmetic only — the forgot-password link's class list (`text-sm underline underline-offset-4`) isn't byte-identical to the existing cross-link's (`underline underline-offset-4`), and no test pins the class list either way.

**Next steps**: None required to ship. Optional cleanup: either drop `text-sm` for exact parity or add a class-list assertion to `login-form.test.tsx` documenting the intentional deviation.
