# Next.js Secure Application Validation

**Date**: 2026-09-06
**Spec**: `.specs/features/nextjs-secure-app/spec.md`
**Diff range**: `cc46312..63ef549` (37 commits; 30 feature commits `780bc15..fd466ee` + 7 fix commits `c3a21d0..63ef549`)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero
**Iteration**: re-verification 1 of 3 (prior verdict: FAIL, 7 ranked gaps)

**Result**: ✅ PASS

**Verdict**: ✅ **PASS** — all 7 previously ranked gaps are resolved, the 3 mutants
that survived the prior pass are now killed, no regression among the re-injected
core mutants, and every gate is clean. Two lower-severity residuals and the
carried-over spec-precision gaps are recorded below as non-blocking follow-ups.

---

## Resolution of the 7 Prior Gaps

| # | Prior gap | Fix commit | Independent evidence at `63ef549` | Result |
| - | --------- | ---------- | --------------------------------- | ------ |
| 1 | SEC-22 / TEST-01 — constant-time compare unasserted (M3 survived) | `c3a21d0` | `web/lib/security/csrf.test.ts:92-93` — `expect(medianRatio).toBeGreaterThan(0.7)` / `.toBeLessThan(2.0)` over 7 interleaved rounds of 1500 iterations at 16 KiB | ✅ Resolved — M3 killed 6/6 |
| 2 | SEC-17 — `/dashboard` `no-store` unasserted at the proxy (M11 survived) | `53d4c2f` | `web/proxy.test.ts:133` — `expect(res.headers.get("cache-control")).toBe("no-store")`; `:138` negative control on `/` | ✅ Resolved — M11 killed |
| 3 | SEC-21 — CSRF cookie attributes unasserted (M12 survived) | `d2bd4a3` | `web/proxy.test.ts:112-115` — `expect(seeded?.secure).toBe(true)`, `expect(seeded?.sameSite).toBe("strict")`, `expect(seeded?.path).toBe("/")`; `:101-104` on the raw `Set-Cookie`; `:120-127` no-reseed case | ✅ Resolved — M12 and the weaker M12b (`secure` only) both killed |
| 4 | AUTH-06 — unverified users sent to `/login`, undocumented deviation | `d0e864d` | `web/lib/auth/session.ts:132-142` `getSessionState` discriminated result; `web/app/dashboard/page.tsx:32-33` `if (state.status === "unverified") redirect("/verify-email")`; `web/lib/auth/session.test.ts:141-147` `toEqual({ status: "unverified" })` | ✅ Behaviour corrected — ⚠️ residual R1 below (page redirect target unasserted) |
| 5 | SEC-18 — `Content-Type` charset, no evidence + misleading describe label | `762213c` | Label corrected to `(SEC-10, SEC-11, SEC-14, SEC-15, SEC-16)` at `web/lib/security/headers.test.ts:61`, with an explicit comment at `:57-60` that SEC-18 is framework-provided. **Verified live** against the built standalone server: `GET /` and `GET /dashboard` both return `Content-Type: text/html; charset=utf-8` | ⚠️ PASS (live probe + inspection; no regression test) |
| 6 | APP-01 / APP-04 — landing-page auth branch untested | `b810932` | `web/lib/nav.ts:16-19` pure `headerNavLink`; `web/lib/nav.test.ts:6` `toEqual({ href: "/login", label: "Log in" })`, `:10-13` `toEqual({ href: "/dashboard", label: "Go to dashboard" })`, `:16-22` no `NEXT_PUBLIC`/Firebase leak in either branch | ✅ Resolved (APP-04) — M14 killed. ⚠️ APP-01's page-content half (project name, description, `/login` + `/signup` links) remains build-gate only; the describe label claims APP-01 |
| 7 | Edge case — `X-Forwarded-For` spoofing limitation not documented | `63ef549` | `README.md:80-85` — names Nginx as sole ingress, states it overwrites the header, and states the spoofing consequence if the app were exposed directly | ✅ Resolved |

**No coverage was lost by the SEC-18 relabel**: SEC-13 (`Access-Control-Allow-Origin`)
and SEC-20 (`Expect-CT` / `Public-Key-Pins`) are still asserted at
`web/lib/security/headers.test.ts:87-95` (`it.each` → `toBeUndefined()` across the
prod, dev, and sensitive header sets), and at `web/proxy.test.ts:90-93`.

---

## Spec-Anchored Acceptance Criteria — Updated Rows

Rows unchanged from the prior pass are carried forward as verified (65 ACs). Only
the rows touched by this iteration are restated.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| APP-01: `GET /` → 200, SSR HTML with project name, description, `/login` + `/signup` links | 200 + named links | Header branch: `web/lib/nav.test.ts:6,10-13`. Page body content: `web/app/page.tsx:56` + build gate `ƒ /` — **no assertion on the body copy or the `/signup` link** | ⚠️ PASS (branch asserted; body build-gate only per the Test Coverage Matrix) |
| APP-04: authenticated visitor → 200, header links `/dashboard` | `/dashboard` href | `web/lib/nav.test.ts:10-13` `toEqual({ href: "/dashboard", label: "Go to dashboard" })`; consumed at `web/app/page.tsx:36,45` | ✅ PASS |
| AUTH-06: unverified email → deny `/dashboard`, redirect to `/verify-email` | `Location: /verify-email` | Guard: `web/lib/auth/session.test.ts:141-147` `toEqual({ status: "unverified" })` (distinct from `unauthenticated` at `:150-162`). Page wiring: `web/app/dashboard/page.tsx:32-33` `redirect("/verify-email")` — **not asserted by any test** (residual R1) | ⚠️ PASS (behaviour correct and distinguished; redirect target unasserted) |
| SEC-17: `Cache-Control: no-store` on `/dashboard` and every `/api/auth/*` response | header present on both | `/dashboard`: `web/proxy.test.ts:133` `toBe("no-store")` + negative control `:138`; builder `web/lib/security/headers.test.ts:79`. `/api/auth/*`: `login/route.test.ts:51`, `signup/route.test.ts:39`, `logout/route.test.ts:38`, `resend-verification/route.test.ts:36`. Live probe on `/dashboard` returns `cache-control: no-store` | ✅ PASS |
| SEC-18: `Content-Type: text/html; charset=utf-8` on HTML responses | explicit charset | No assertion — Next.js emits it; documented as framework-provided at `web/lib/security/headers.test.ts:57-60`. Verified live on `/` and `/dashboard` from the standalone build | ⚠️ PASS (inspection + live probe, no regression test) |
| SEC-21: CSRF token as `SameSite=Strict`, `Secure` cookie + hidden field in every mutating form | cookie attributes + hidden input | Cookie: `web/proxy.test.ts:101-104,111-115`. Hidden field: `login/page.tsx:52`, `signup/page.tsx:57`, `verify-email/page.tsx:53`, `dashboard/page.tsx:52` | ✅ PASS |
| SEC-22: mutating methods require submitted == cookie, **constant time**, else 403 | accept + reject branches AND constant-time property | Branches: `web/proxy.test.ts:108-113,136-152,171-181,183-186`; values `csrf.test.ts:21-47`. Constant-time property: `csrf.test.ts:92-93` (statistical timing-invariance, median-of-7 ratio band `0.7 < r < 2.0`) | ✅ PASS |
| TEST-01: Vitest covers all eight named areas incl. CSRF gen + constant-time compare | all eight | Eight of eight now present — the constant-time area is `csrf.test.ts:57-95` | ✅ PASS |

**Status**: ✅ All 75 ACs covered — 66 PASS with an exact spec-matching assertion,
9 ⚠️ PASS with a caveat (inspection-only, live-probe, or framework-provided), 0 gaps.

**Carried-over spec-precision gaps** (unchanged, previously accepted):

- **AUTH-14 / AUTH-06** — Next's `redirect()` issues 307, the spec names 303. Documented `SPEC_DEVIATION` at `web/app/dashboard/page.tsx:29-31`.
- **SEC-08** — `web/lib/security/headers.ts:25-28` adds `'unsafe-eval'` when `isDev`; the spec's rule is unconditional. Asserted as intended at `headers.test.ts:52`. **Live probe of the production build confirms the emitted CSP contains neither `'unsafe-inline'` nor `'unsafe-eval'`.**
- **AUTH-09, SEC-19, TF-07, VM-02, CICD-01..07** — verified by inspection (and, for AUTH-09, a clean `web/.next/static/` grep); not exercised against live GCP.

---

## Discrimination Sensor

**Depth**: P0-full (auth / access-control / data-integrity paths).
**Isolation**: two disposable `git worktree --detach` checkouts at `63ef549` with
`node_modules` symlinked; never `git stash`. Both removed with
`git worktree remove --force` + `git worktree prune`. Real-tree
`git status --porcelain` diffed against the pre-sensor baseline after each
teardown — identical both times (only the 3 expected untracked `.specs` artifacts).

### Previously surviving mutants — re-injected

| # | File:line | Mutation | Runs | Result |
| - | --------- | -------- | ---- | ------ |
| M3 | `web/lib/security/csrf.ts:54` | `diff \|= a[i] ^ b[i]` → `if (a[i] !== b[i]) return false` | 6 | ✅ **Killed 6/6** (`csrf.test.ts:92`, observed ratio 0.64 vs threshold 0.7) |
| M11 | `web/proxy.ts:88` | `sensitive = pathname.startsWith("/dashboard")` → `false` | 1 | ✅ **Killed** (1 failed) |
| M12 | `web/proxy.ts:135-136` | CSRF cookie → `sameSite: "lax"`, `secure: false` | 1 | ✅ **Killed** (1 failed) |
| M12b | `web/proxy.ts:136` | weaker variant — `secure: false` only | 1 | ✅ **Killed** (1 failed) |

### Regression re-check on previously killed core mutants

| # | File:line | Mutation | Result |
| - | --------- | -------- | ------ |
| M1 | `web/lib/security/rate-limit-core.ts:129` | `>= config.maxFailures` → `>` (threshold 5 → 6) | ✅ Killed (8 failed) |
| M5 | `web/lib/auth/session.ts:102` | `verifySessionCookie(cookie, true)` → `false` (drops `checkRevoked`) | ✅ Killed (2 failed) |
| M7 | `web/app/api/auth/login/route.ts:174` | credential-failure branch returns `"No account with that email"` (auth failures become distinguishable) | ✅ Killed (1 failed) |
| M7b | `web/app/api/auth/login/route.ts:106` | `invalidCredentials()` message → `"Wrong password"` | ✅ Killed (1 failed) |

### New mutants targeting the fix commits

| # | File:line | Mutation | Result |
| - | --------- | -------- | ------ |
| M13 | `web/lib/auth/session.ts:138` | `status: "unverified"` → `"unauthenticated"` (collapses the AUTH-06 distinction) | ✅ Killed (1 failed) |
| M14 | `web/lib/nav.ts:17` | authenticated branch → `{ href: "/login", label: "Log in" }` | ✅ Killed (1 failed) |
| M15 | `web/app/dashboard/page.tsx:33` | `redirect("/verify-email")` → `redirect("/login")` | ❌ **Survived** (residual R1) |
| M16 | `web/app/api/auth/login/route.ts:164` | malformed-email 401 branch returns `"No account with that email"` | ❌ **Survived** (residual R2) |

**Sensor result**: 14/16 killed — all 4 re-injected prior survivors killed, 0 regressions;
the 2 survivors are Minor residuals (R1, R2) in layers the Test Coverage Matrix scopes to
the build gate.

### FIX-1 flakiness watch (statistical timing test)

The mandate required proving the timing test is neither flaky nor blind.

| Subject | Observations | Outcome |
| ------- | ------------ | ------- |
| Real implementation | 6 full runs of `csrf.test.ts` + 4 instrumented ratio probes | **0 false positives.** Median ratios: 1.017, 1.022, 1.019, 1.003 (per-round spread 0.88–1.30) |
| M3 mutant | 6 full runs of `csrf.test.ts` + 4 instrumented ratio probes | **0 false negatives.** Median ratios: 0.557, 0.541, 0.551, 0.552 (per-round spread 0.31–0.83) |

**Finding: the test is reliable — 20/20 correct discriminations, clean separation
between the two populations (real ≈ 1.02, mutant ≈ 0.55).** One robustness note,
non-blocking: the code comment at `csrf.test.ts:89-91` predicts a mutant ratio of
`~0.45`, but the worst single observed failing assertion was `0.6424` against the
`0.7` floor — a ~9% margin, versus a ~30% margin on the real-implementation side.
The separation never inverted across 20 observations and the median-of-7 design
damps per-round noise, so this is a watch item for the GitHub Actions runner, not
a gap. Widening it (larger `LENGTH`, or taking the minimum rather than the median
ratio) would harden it further.

---

## Residual findings (non-blocking)

### R1 — AUTH-06's redirect target is unasserted at the page (mutant M15 survives)

`web/app/dashboard/page.tsx:32-33` correctly sends an unverified session to
`/verify-email`, and `getSessionState` distinguishes the three outcomes with full
unit coverage. But no test asserts the page's mapping from `"unverified"` to
`/verify-email`, so flipping it to `/login` — the exact bug FIX-4 was raised to
correct — passes all 146 tests.

This is the same evidence shape the prior pass accepted for AUTH-14, and
`tasks.md:35` scopes `web/app/**/page.tsx` to "build gate only" on the rationale
that pages are "rendering shells with no branching logic of their own". That
rationale is now slightly stale: after FIX-4 the dashboard page owns a real
two-way branch. FIX-6 handled the equivalent case on the landing page by
extracting `headerNavLink` into `web/lib/nav.ts`; the same treatment (a pure
`dashboardRedirectFor(state)` helper, or a render test mocking `next/headers` +
`next/navigation`) would close this. **Severity: Minor** — the implementation is
correct today and verified by reading plus the live `/dashboard` probe; the
exposure is regression risk, not a live defect.

### R2 — malformed-email 401 branch is untested (mutant M16 survives)

`web/app/api/auth/login/route.ts:162-165` returns the generic 401 when
`normalizeEmail` rejects the input, but no test covers that branch, so a
distinguishing message there goes unnoticed. AUTH-10's two spec-named cases
(unknown email, wrong password) are both asserted byte-identically and both kill
their mutants (M7, M7b), so the requirement itself is covered. **Severity: Minor.**

### R3 — describe-label overreach recurs at `web/lib/nav.test.ts:4`

The block is labelled `(APP-01, APP-04)` but asserts only the APP-04 header
branch; APP-01's page-content obligations (project name, description, `/login` and
`/signup` links) are not asserted anywhere. This is the same label-vs-assertion
mismatch FIX-5 corrected in `headers.test.ts`. **Severity: Cosmetic** — no
behaviour is at risk, but a label that overstates coverage is what let SEC-18
through review unexamined last round.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `getSessionState` and `headerNavLink` are both consumed in production code, not test-only seams |
| Surgical changes | ✅ 10 files, +237/−29, confined to `web/` and `README.md` |
| No scope creep | ✅ Every fix commit maps 1:1 to a ranked gap; nothing outside the gap list was touched |
| Matches patterns | ✅ Requirement IDs in module headers; Conventional Commits throughout |
| Spec-anchored outcome check | ✅ 66/75 exact, 9 caveated, 0 uncovered |
| Per-layer Coverage Expectation met | ⚠️ `web/lib/**` now fully meets the matrix (constant-time test added); `web/app/**/page.tsx` carries residual R1 against the matrix's stated rationale |
| Every test maps to a spec requirement | ⚠️ `web/lib/smoke.test.ts` is runner plumbing (1 test); `nav.test.ts` label overreaches (R3) |
| Documented guidelines followed | ✅ `web/AGENTS.md`, `web/CLAUDE.md`, `tasks.md` Test Coverage Matrix |

The requirement-ID drift noted last pass (`proxy.ts:12,95` labelling the `/api`
foreign-Origin check "SEC-13" where the spec numbers it SEC-12) is **not** fixed;
it is cosmetic and was not a ranked gap.

---

## Gate Check

- **Gate command** (Build level, from `tasks.md`): `cd web && npm run lint && npm run typecheck && npm test && npm run build`, plus the Terraform, shell, workflow, porcelain, and secret gates.

| Gate | Command | Result |
| ---- | ------- | ------ |
| Lint | `npm run lint` | ✅ exit 0, no findings |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 |
| Unit tests | `npm test` (Vitest 5.0.0) | ✅ **14 files, 146 passed, 0 failed, 0 skipped** |
| Build | `npm run build` | ✅ exit 0; 10 routes, `ƒ /` and `ƒ /dashboard` dynamic, Proxy (Middleware) emitted |
| Terraform fmt | `terraform fmt -check -recursive infra` | ✅ exit 0 |
| Terraform validate (`infra/`) | `terraform -chdir=infra validate` | ✅ Success |
| Terraform validate (`infra/bootstrap/`) | `terraform -chdir=infra/bootstrap validate` | ✅ Success |
| Shell syntax | `bash -n <(sed 's/\${[^}]*}/x/g' infra/scripts/startup.sh.tpl)` | ✅ exit 0 |
| Workflow YAML | `yaml.safe_load` on `ci.yml` + `deploy.yml` | ✅ both parse |
| Secret sweep | `git ls-files \| grep -E '\.env$\|credentials.*\.json'` | ✅ no match |
| Worktree clean | `git status --porcelain` | ✅ only the 3 expected untracked `.specs` artifacts, pre- and post-sensor |
| Live header probe | standalone server on `:3999`, `curl -sI /` and `/dashboard` | ✅ CSP (nonce, no `'unsafe-*'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Type: text/html; charset=utf-8`, `/dashboard` → `cache-control: no-store` + `location: /login` |

- **Test count before fixes**: 134 (13 files)
- **Test count after fixes**: 146 (14 files)
- **Delta**: +12 tests, +1 file (`web/lib/nav.test.ts`)
- **Skipped tests**: none. **Failures**: none. **Weakened assertions**: none — no test was deleted or loosened by the fix commits.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| APP-01 | ⚠️ No test evidence | ⚠️ Verified (auth branch asserted; body build-gate only) |
| APP-04 | ⚠️ No test evidence | ✅ Verified |
| AUTH-06 | ❌ Needs Fix (spec deviation) | ⚠️ Verified (behaviour corrected; page redirect target unasserted — R1) |
| SEC-17 | ❌ Needs Fix | ✅ Verified |
| SEC-18 | ❌ Needs Fix | ⚠️ Verified (framework-provided; live probe) |
| SEC-21 | ❌ Needs Fix | ✅ Verified |
| SEC-22 | ❌ Needs Fix | ✅ Verified |
| TEST-01 | ❌ Needs Fix | ✅ Verified |
| AUTH-09, SEC-19, TF-07, VM-02 | ⚠️ Inspection only | ⚠️ Unchanged |
| AUTH-14, SEC-08 | ⚠️ Spec-precision gap | ⚠️ Unchanged (both documented) |
| All others (57) | ✅ Verified | ✅ Unchanged |

**Coverage**: 75 requirements — 66 verified, 9 verified with a caveat, **0 needing a fix**.

---

## Summary

**Overall**: ✅ Ready.

**Spec-anchored check**: 66/75 ACs matched the spec-defined outcome exactly;
9 caveated (inspection, live-probe, or documented spec-precision); 0 uncovered.
**Sensor**: 16 mutations injected, 14 killed, 2 survived (both Minor residuals in
layers the Test Coverage Matrix scopes to the build gate).
**FIX-1 flakiness**: 20/20 correct discriminations — no false positive, no false
negative. Reliable; one margin-tightness watch item recorded.
**Gate**: 146 passed, 0 failed, 0 skipped; lint, typecheck, build, Terraform,
shell, workflow, porcelain, and secret gates all clean.

**What works**: All four previously-surviving mutants are now killed, including
the CSRF constant-time property that the spec's own Independent Test demands and
that no assertion previously reached. The proxy's runtime wiring — `no-store` on
`/dashboard`, the CSRF cookie's `Secure`/`SameSite=Strict`/`Path=/` attributes,
the no-reseed path — is asserted at the layer that actually emits it, not only at
the pure builder. AUTH-06 now sends unverified users to `/verify-email` through a
discriminated `SessionState`. The brute-force limiter, auth-failure
indistinguishability, `checkRevoked: true`, the OWASP header set, and the
same-origin gate all still kill their mutants with no regression.

**Issues found**: Residuals R1 (dashboard redirect target unasserted, Minor),
R2 (malformed-email 401 branch untested, Minor), R3 (`nav.test.ts` label
overreach, Cosmetic). None blocks completion.

**Next steps**: Close the feature. R1 is the one worth a follow-up — extract the
dashboard's redirect decision into a pure helper (mirroring `lib/nav.ts`) so the
AUTH-06 target is pinned by an assertion, and refresh the Test Coverage Matrix
rationale at `tasks.md:35`, which no longer holds now that two pages own branches.
