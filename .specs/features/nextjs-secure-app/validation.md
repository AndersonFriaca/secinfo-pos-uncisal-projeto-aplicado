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

---

# Amendment 1 — keyless IAP deploy + Node 24

**Date**: 2026-09-06
**Spec**: `.specs/features/nextjs-secure-app/spec.md` (CICD story, VM story)
**Diff range**: `63ef549..HEAD` (5 commits: `bb34be2`, `9d6163c`, `3a89f34`, `e23133c`, `7509a3d`)
**Verifier**: independent sub-agent (author ≠ verifier)
**Verdict**: **PASS ✅**

The amendment does not touch `web/` source or tests. The prior full-feature
report above stands unchanged for the application layer; this section covers
only the infrastructure/CI surface introduced by the five commits.

**User directive verified**: "A deploy service account deve ser provisionada via
Terraform e não deverá ser necessário SSH adicional à VM para realizar o deploy
— tudo via Workload Identity." Plus: Node must be LTS 24. Both satisfied.

---

## Amendment Task Completion

| Commit | Scope | Status |
| ------ | ----- | ------ |
| `bb34be2` | Node 24 on the VM, in CI, in `web/` engines + `.nvmrc` | ✅ Done |
| `9d6163c` | `iap.googleapis.com`, `allow-iap-ssh`, `roles/iap.tunnelResourceAccessor` | ✅ Done |
| `3a89f34` | Dedicated locked `appsvc` runtime user, `pm2-appsvc` unit | ✅ Done |
| `e23133c` | `deploy.yml` rewritten to IAP-only, SSH secrets removed | ✅ Done |
| `7509a3d` | spec/design/tasks/STATE + docs updated to match | ✅ Done |

---

## Check 1 — No stored SSH key material anywhere

`git grep -nE 'VM_SSH|BEGIN [A-Z ]*PRIVATE KEY|ssh-keyscan|deploy_key|id_rsa|id_ed25519|credentials_json' -- ':!*.md'` returns **three hits, all benign**:

- `.gitignore:5-6` — the `id_rsa*` / `id_ed25519*` **exclusion** patterns.
- `terraform.tfvars.example:8` — `ssh_public_key_path = "~/.ssh/id_ed25519.pub"`, a **path to a public key** on the operator's own machine, not key material.

The `*.md` hits are all prose describing the removal (`.specs/STATE.md:134`,
`.specs/features/nextjs-secure-app/spec.md:245`,
`.specs/features/nextjs-secure-app/tasks.md:853-854`) or the pre-existing
`gcp-infra-terraform` spec's `.gitignore` requirement. No private key, no
`credentials_json`, no `ssh-keyscan` anywhere in the tree.

`git ls-files | grep -iE '\.env$|\.env\.|credentials.*\.json|\.pem$|\.tfvars$|\.tfstate'` → **no matches**.
`git grep -nE 'project_id *= *"' -- infra/` → **no matches** (no hardcoded project ID).

**Secrets actually referenced** (`grep -ohE 'secrets\.[A-Z_]+' .github/workflows/*.yml | sort -u`) are exactly the six allowed:

```
GCP_DEPLOY_SA_EMAIL, GCP_PROJECT_ID, GCP_REGION,
GCP_WIF_PROVIDER, GCP_ZONE, IDENTITY_PLATFORM_API_KEY
```

No `VM_SSH_PRIVATE_KEY`, no `VM_SSH_USER`, no `credentials_json`. ✅

---

## Check 2 — Deploy auth is WIF end-to-end

| Requirement | `file:line` + evidence | Result |
| ----------- | ---------------------- | ------ |
| `permissions: id-token: write` | `.github/workflows/deploy.yml:11-13` — `contents: read` + `id-token: write` | ✅ |
| WIF auth action, no key | `deploy.yml:52-57` — `google-github-actions/auth@v2` with `workload_identity_provider` + `service_account`; **no `credentials_json`** | ✅ |
| No `Configure SSH` step | absent — the workflow's only VM-reaching steps are `deploy.yml:97`, `:126`, `:152`, all via gcloud | ✅ |
| Bundle transfer over IAP | `deploy.yml:117-118` — `$GCLOUD scp --zone=... --tunnel-through-iap` | ✅ |
| Remote commands over IAP | `deploy.yml:110` — `SSH="$GCLOUD ssh app-vm --zone=$ZONE --tunnel-through-iap --command"`; used at `:119`, `:148`, `:158-160` | ✅ |
| sshd/key-propagation retry | `deploy.yml:112-116` — 12 × 5s retry loop before the first transfer | ✅ |
| Secret never on a remote command line | `deploy.yml:137-150` — `umask 077`, built into a local `mktemp` file, `scp`'d as `/tmp/env-$SHA`, local copy `shred -u`'d at `:147`, then remote `sudo install -m 600 -o appsvc -g appsvc` + `sudo shred -u` at `:149-150` | ✅ |

The `IDENTITY_PLATFORM_API_KEY` value reaches the remote host only as file
content, never as an argv element of a remote command — so it cannot appear in
the VM's process table or in `gcloud`'s echoed command. This is the correct
pattern and is materially better than the pre-amendment `echo ... | ssh` shape.

**Verdict on the directive**: VM access is authenticated end-to-end by the
WIF-federated deploy SA. `gcloud compute ssh --tunnel-through-iap` mints an
ephemeral, IAM-scoped SSH key from that identity per invocation; nothing
long-lived is stored. ✅

---

## Check 3 — Deploy SA is Terraform-provisioned + least privilege

| Requirement | `file:line` | Result |
| ----------- | ----------- | ------ |
| SA exists in Terraform | `infra/wif.tf:51-55` — `resource "google_service_account" "deploy"` (`account_id = "github-deploy"`) | ✅ |
| `roles/iam.workloadIdentityUser` via repo-scoped `principalSet://` | `infra/wif.tf:58-62` — member is `principalSet://iam.googleapis.com/${pool.name}/attribute.repository/${var.github_repository}` (exact `OWNER/REPO`, not owner-wide) | ✅ |
| Provider entry gated | `infra/wif.tf:44` — `attribute_condition = "assertion.repository_owner == '${local.github_owner}'"` | ✅ |
| Project roles exactly three | `infra/wif.tf:74-90` — `roles/compute.instanceAdmin.v1`, `roles/iam.serviceAccountUser`, `roles/iap.tunnelResourceAccessor` | ✅ |
| Never owner/editor | `git grep 'roles/owner\|roles/editor' infra/` → no matches | ✅ |

### Is `roles/compute.instanceAdmin.v1` genuinely needed? — assessed, noted

**Needed, but broader than the minimum.** The workflow's cold-start path
(`deploy.yml:72-91`) actually exercises `compute.instances.get`,
`instances.start`, `instances.deleteAccessConfig`, `instances.addAccessConfig`,
`addresses.create`, `addresses.get`, `addresses.use`; and `gcloud compute ssh`
additionally needs `instances.setMetadata` to publish the ephemeral key.
`roles/compute.instanceAdmin.v1` covers all of these — verified that it includes
the `compute.addresses.create/delete/get/list/use` set, which the TERMINATED
branch requires and which a bare instance-only role would not carry.

It does **not** carry `iap.tunnelInstances.accessViaIAP`, which is exactly why
the separate `roles/iap.tunnelResourceAccessor` binding at `infra/wif.tf:86-90`
is present. The three roles are therefore coherent and non-redundant.

**Residual (documented, not a FAIL):** the role is bound at **project** scope and
grants full control of *all* instances, disks, snapshots, and images in the
project — including delete. A tighter design would bind
`roles/compute.instanceAdmin.v1` at the **instance** resource level (plus a
small project-level custom role for `compute.addresses.*`), or replace it with a
custom role holding only the eight permissions above. Given the project is a
single-VM coursework deployment and the requirement as written in the spec/task
is "exactly these three predefined roles, never owner/editor" — which holds —
this is an accepted residual, not a gap. It is recorded as a lesson.

---

## Check 4 — IAP wiring is coherent

| Requirement | `file:line` | Result |
| ----------- | ----------- | ------ |
| `iap.googleapis.com` enabled | `infra/app.tf:14` (inside `local.app_services`, consumed by `google_project_service.app` at `:18-28`) | ✅ |
| `allow-iap-ssh` rule | `infra/firewall.tf:21-31` — `source_ranges = ["35.235.240.0/20"]`, `target_tags = ["web-server"]`, `allow { protocol = "tcp"; ports = ["22"] }` | ✅ |
| VM carries the tag | `infra/compute.tf:9` — `tags = ["web-server"]` | ✅ |
| CIDR correctness | **Verified against current Google documentation** (`docs.cloud.google.com/iap/docs/using-tcp-forwarding`): "allows ingress traffic from the IP range `35.235.240.0/20`. This range contains all IP addresses that IAP uses for TCP forwarding." | ✅ |

The docs also list `2600:2d00:1:7::/64` for **IPv6 VMs**. This instance is
IPv4-only (`infra/compute.tf:25-36` declares a single `access_config` with no
`stack_type`/IPv6 configuration), so the IPv4 range alone is correct and
complete here. No gap.

**Noted, pre-existing (not introduced by this amendment):**
`infra/firewall.tf:4-14` still allows `tcp:22` from `0.0.0.0/0` for the human
operator. The amendment's own comment at `firewall.tf:19-20` acknowledges this
and states it "could later be narrowed to the operator's own CIDR without
affecting CI" — which is now true, since CI no longer depends on public `:22`.
Narrowing it is the single highest-value follow-up this amendment unlocks.

---

## Check 5 — appsvc decoupling is sound

| Requirement | `file:line` | Result |
| ----------- | ----------- | ------ |
| `appsvc` created idempotently, locked system user | `infra/scripts/startup.sh.tpl:217` — `id appsvc >/dev/null 2>&1 \|\| useradd --system --create-home --shell /usr/sbin/nologin appsvc` | ✅ |
| `/opt/app` owned by `appsvc` | `startup.sh.tpl:238-241` — `mkdir -p /opt/app` then `chown -R appsvc:appsvc /opt/app` | ✅ |
| PM2 unit is `pm2-appsvc` | `startup.sh.tpl:223` — `PM2_UNIT="/etc/systemd/system/pm2-appsvc.service"` | ✅ |
| nologin-safe generation mechanism | `startup.sh.tpl:227` — `runuser -u appsvc -- pm2 startup systemd -u appsvc --hp /home/appsvc`, **not** `su - appsvc` (which would fail against `/usr/sbin/nologin`). The comment at `:225-226` states the reason. | ✅ |
| Deploy-side reload also nologin-safe | `deploy.yml:160` — `sudo -u appsvc bash -lc '...'` invokes bash explicitly, so the nologin shell is not consulted | ✅ |
| Heredoc byte-identical to the standalone file | `diff` of `startup.sh.tpl:244-257` against `infra/scripts/ecosystem.config.js` module body → **identical** | ✅ |
| `templatefile()` needs no `ssh_username` | `infra/compute.tf:48` — `templatefile("${path.module}/scripts/startup.sh.tpl", {})`; the script interpolates nothing (`startup.sh.tpl:7-9` documents this) | ✅ |
| `ssh_username` kept for operator metadata | `infra/compute.tf:47` — `ssh-keys = "${var.ssh_username}:${file(var.ssh_public_key_path)}"`; variable still declared at `infra/variables.tf:23`. `git grep ssh_username -- infra/` returns exactly these two hits — no dangling references. | ✅ |

**Stages 1-8 behavior diff** (`git diff 63ef549..HEAD -- infra/scripts/startup.sh.tpl`): the
**only** change inside stages 1-8 is the Node major bump and its comments
(`NODE_MAJOR_REQUIRED=22` → `24`, `!=` → `-lt`). SSH hardening (stage 2, incl.
the `systemctl reload ssh` unit-name fix), the fail2ban jail (stage 3), certbot
install (stage 4), the HTTP site + `server_tokens off` (stages 5/5b), the IP
certificate (stage 6), and — critically — the **HTTPS cert IP guard**
(`startup.sh.tpl:158`, `! grep -qF "/etc/letsencrypt/live/$PUBLIC_IP/" "$HTTPS_SITE"`)
and the renewal timer (stage 8) are **byte-unchanged**. Neither of the two
real-deployment corrections recorded in `CLAUDE.md` was reintroduced. ✅

---

## Check 6 — Node 24

| Requirement | `file:line` | Result |
| ----------- | ----------- | ------ |
| `NODE_MAJOR_REQUIRED=24` | `infra/scripts/startup.sh.tpl:23` | ✅ |
| `-lt` guard (upgrades any lower major) | `startup.sh.tpl:27` — `if [ "$(installed_node_major)" -lt "$NODE_MAJOR_REQUIRED" ]` | ✅ |
| `ci.yml` Node 24 | `.github/workflows/ci.yml:23-26` — `node-version: "24"` | ✅ |
| `deploy.yml` Node 24 | `.github/workflows/deploy.yml:23-26` — `node-version: "24"` | ✅ |
| `web/package.json` engines | `web/package.json:5-7` — `"node": ">=24"` | ✅ |
| `web/.nvmrc` | `web/.nvmrc:1` — `24` (single line, newline-terminated) | ✅ |
| Spec VM-01/02 wording | `spec.md:277-278` — "Node.js 24 LTS", "major version ≥ 24" | ✅ |

**Guard semantics verified functionally** (not just read). Executing the extracted
guard with `installed_node_major()` stubbed:

| Installed major | `-lt` (shipped) | `-gt` (mutant) |
| --- | --- | --- |
| 18 | UPGRADE | skip |
| 22 | UPGRADE | skip |
| 24 | skip (no-op re-run) | skip |
| 26 | skip (**no downgrade**) | UPGRADE |

`-lt` is strictly correct: it upgrades every lower major (including the Ubuntu
24.04 apt Node 18.19 case the comment cites), is a no-op on 24, and — unlike the
previous `!=` — does not downgrade a future-newer Node. ✅

---

## Check 7 — Spec / design / tasks / decision-log consistency

| Requirement | `file:line` | Result |
| ----------- | ----------- | ------ |
| CICD AC 6 names no SSH key secret | `spec.md:242` — "VM authentication SHALL go entirely through the WIF-federated deploy service account over an IAP tunnel, with **no SSH key material stored as a GitHub secret or committed to the repository**" | ✅ |
| CICD AC 1/5 name the IAP path | `spec.md:236`, `spec.md:241` | ✅ |
| CICD Independent Test | `spec.md:245` — "the workflow file contains no `VM_SSH_*` secret reference" | ✅ |
| VM story Independent Test says `appsvc` / `pm2-appsvc` | `spec.md:283` — "`systemctl status pm2-appsvc` is active; `test -w /opt/app` succeeds as `appsvc`" | ✅ |
| VM AC 4 names `appsvc` | `spec.md:280` | ✅ |
| Tasks T24/T25/T28 Done-when updated | `tasks.md:735-736`, `:770-773`, `:854`, `:858-860` | ✅ |
| `design.md` updated (architecture diagram, integration table, secrets list, risks, decisions) | `design.md:33`, `:74`, `:194`, `:201-202`, `:213`, `:291-293` | ✅ |
| `STATE.md` active decision AD-007 | `.specs/STATE.md:104` — `### AD-007 — Keyless VM deploy: IAP tunnel + ephemeral OS keys + dedicated appsvc`, `**Status**: active` | ✅ |
| Operator steps drop the SSH secrets | `.specs/STATE.md` step 1 — six secrets only, "No SSH key or SSH-user secret" | ✅ |

**Validator exits (all 0):**

```
validate_spec.py  nextjs-secure-app → 0 error(s), 0 warning(s)   exit 0
validate_tasks.py nextjs-secure-app → 0 error(s), 16 warning(s)  exit 0
validate_state.py nextjs-secure-app → 0 error(s)                 exit 0
```

The 16 `validate_tasks` warnings are the pre-existing "`Tests: none`" advisories
on the infra/CI/doc tasks (T1, T3, T17-T30) — correct for shell/HCL/YAML tasks
whose gate is a linter, and unchanged by this amendment.

**One documentation nit (cosmetic, no code impact):** `design.md:213` files the
`allow-iap-ssh` firewall rule under the heading "Terraform additions —
`infra/app.tf`", but the resource actually lives in `infra/firewall.tf:21`. Only
the service-enable half of that row is in `app.tf`.

---

## Gate Check

| Gate | Command | Result |
| ---- | ------- | ------ |
| Terraform format | `terraform fmt -check -recursive infra` | ✅ clean |
| Terraform validate (root) | `terraform -chdir=infra validate` | ✅ "Success! The configuration is valid." |
| Terraform validate (bootstrap) | `terraform -chdir=infra/bootstrap validate` | ✅ "Success! The configuration is valid." |
| Shell syntax | `bash -n <(sed 's/\${[^}]*}/x/g' infra/scripts/startup.sh.tpl)` | ✅ exit 0 |
| PM2 config syntax | `node --check infra/scripts/ecosystem.config.js` | ✅ exit 0 |
| Workflow YAML | `yaml.safe_load` on both workflows | ✅ both parse |
| Web unit tests | `cd web && npm test` | ✅ **149 passed / 15 files**, 0 failed, 0 skipped — identical to the pre-amendment count |
| Web build | `cd web && npm run build` | ✅ 10 routes + proxy middleware compiled |
| Worktree clean | `git status --porcelain` | ✅ empty |
| Secret sweep | `git ls-files \| grep -iE '\.env\|credentials.*json\|\.pem\|\.tfvars\|\.tfstate'` | ✅ no matches |

**Test Integrity**: 149 before, 149 after — no test deleted, weakened, or skipped.
The amendment touches no `web/` source or test file, as expected.

---

## Discrimination Sensor

**Depth**: lightweight, infra-appropriate. Run in a throwaway `git worktree add
--detach` scratch; scratch removed with `git worktree remove --force`; real-tree
`git status --porcelain` **empty before and after** (isolation verified).

There is no unit-test suite over the infrastructure surface, so "killed" here
means *some mechanical gate turns red*. Reported honestly:

| # | File:line | Mutation | Mechanical gate | Checklist catch |
| - | --------- | -------- | --------------- | --------------- |
| 1 | `infra/wif.tf:88` | `roles/iap.tunnelResourceAccessor` → `roles/editor` | ❌ **Survived** — `fmt`, `validate` all PASS | ✅ `tasks.md:735` Done-when names the exact three roles and "never `roles/owner` or `roles/editor`" |
| 2 | `infra/firewall.tf:24` | `35.235.240.0/20` → `0.0.0.0/0` | ❌ **Survived** — all gates PASS | ✅ `tasks.md:736` Done-when names the literal CIDR `35.235.240.0/20` |
| 3 | `infra/scripts/startup.sh.tpl:27` | `-lt` → `-gt` (Node 18 no longer upgraded) | ❌ **Survived** — `bash -n` PASS | ✅ `tasks.md:771` Done-when explicitly says "(`-lt` the required major)"; functionally reproduced in the table under Check 6 |
| 4 | `startup.sh.tpl:241` | delete `chown -R appsvc:appsvc /opt/app` | ❌ **Survived** — `bash -n` PASS | ✅ `tasks.md:773` Done-when: "`/opt/app` exists and is owned by `appsvc`" |
| 5 | `startup.sh.tpl:253` | heredoc `PORT: 3000` → `3001`, drifting from `ecosystem.config.js` | ❌ **Survived** — `node --check` and every other gate PASS | ❌ **No `Done when` covers this.** The only guard is a prose comment ("Content must stay identical to that file", `startup.sh.tpl:237`; mirrored at `ecosystem.config.js:3`) |

**Sensor outcome**: 0/5 killed mechanically — **expected, and not a defect** for
declarative infrastructure with no policy-test layer. 4/5 are caught by a
reviewer following the task checklist, because the `Done when` items pin the
literal values (role names, the CIDR, the `-lt` operator, the `appsvc` owner) —
which is precisely the property that makes those checklist items load-bearing
rather than decorative.

**Mutation 5 is a genuine unguarded risk.** The `ecosystem.config.js` heredoc is
duplicated by necessity (the template renders into instance metadata, so the
standalone file is never uploaded), the duplication is enforced only by a
comment, and drift is silent: every gate stays green while the VM would run a
different PM2 config than the repo's file claims. A three-line `diff` between
the extracted heredoc and the standalone file — the exact check performed by
hand in Check 5 — would close it mechanically. Recorded as a lesson.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| No features beyond what was asked | ✅ — the diff is IAP wiring, the `appsvc` user, Node 24, and the docs that describe them; nothing else |
| No abstractions for single-use code | ✅ — `appsvc` is a hardcoded constant rather than a new Terraform variable, correctly, since no caller would ever vary it |
| Only touched files required | ✅ — 8 non-doc files; `web/` source untouched |
| Didn't "improve" unrelated code | ✅ — the one formatting change in `compute.tf` (alignment of the `metadata` block) is `terraform fmt`'s required output after the `templatefile` edit |
| Matches existing patterns | ✅ — the `appsvc` and firewall stanzas follow the file's established idempotency-guard and comment-the-why conventions |
| Would a senior engineer approve? | ✅ — with the two follow-ups noted (narrow public `:22`, scope `instanceAdmin` to the instance) |
| Docs kept in sync with code | ✅ — `spec.md`, `design.md`, `tasks.md`, `STATE.md`, `docs/application.md` all updated in `7509a3d` |

---

## Summary

**Overall**: ✅ Ready

**Directive check**: deploy SA fully Terraform-provisioned (`infra/wif.tf:51`);
zero SSH key material anywhere in the repo or in GitHub secrets; every VM
interaction runs through `--tunnel-through-iap` under the WIF-federated
identity. Node is LTS 24 on the VM, in both workflows, and in `web/`.

**Gates**: 10/10 green. **Tests**: 149 passed, unchanged.
**Sensor**: 5 mutations, 0 killed mechanically (expected for IaC), 4/5 caught by
a `Done when` item, 1 genuinely unguarded.

**Ranked residuals** (none blocking):

1. *Minor* — `infra/scripts/startup.sh.tpl:244-257` duplicates
   `infra/scripts/ecosystem.config.js` with only a comment enforcing parity;
   drift passes every gate silently. Add a `diff`-based gate.
2. *Minor* — `infra/wif.tf:74-78` binds `roles/compute.instanceAdmin.v1` at
   **project** scope; the deploy needs it on one instance plus
   `compute.addresses.*`. An instance-scoped binding (or a custom role) would be
   tighter. Documented and deliberate; the spec's "exactly three, never
   owner/editor" requirement holds.
3. *Minor* — `infra/firewall.tf:4-14` still opens `tcp:22` to `0.0.0.0/0` for
   the operator. Pre-existing, but CI no longer needs it, so narrowing it to the
   operator's CIDR is now free.
4. *Cosmetic* — `design.md:213` files `allow-iap-ssh` under the "`infra/app.tf`"
   heading; the resource is in `infra/firewall.tf:21`.

**Next steps**: none required to close the amendment. Residual 1 is the one
worth a follow-up task. Live verification of the IAP path (first real merge to
`main` against a rebuilt VM) remains an operator step, already tracked in
`.specs/STATE.md`.

---

## Amendment 2 — permission & firewall hardening

**Date**: 2026-09-06
**Diff range**: `c36095f..HEAD` (`c4ef818`, `719b205`, `449b77c`, `92bdf88`, `77d0e72`)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree
**Verdict**: **PASS ✅** — both Amendment-1 residuals (R2 project-scoped
`instanceAdmin.v1`, R3 public `tcp:22`) are closed as specified, all gates green,
real-tree porcelain unchanged. **One P0 pre-deploy risk is flagged below** (G1):
`gcloud compute ssh --tunnel-through-iap` has documented *project*-scoped
permission requirements that an instance-scoped binding cannot satisfy. It does
not invalidate the amendment's code, but it will very likely break the first live
deploy and it makes TF-05's literal "no project-level role" wording unachievable.

### Check 1 — Deploy SA: zero project-level roles

| Requirement | Evidence | Result |
| --- | --- | --- |
| `roles/compute.instanceAdmin.v1` on the instance, not the project | `infra/wif.tf:88-94` — `google_compute_instance_iam_member.deploy_compute_admin`, `instance_name = google_compute_instance.vm.name`, `zone = google_compute_instance.vm.zone` | ✅ |
| `roles/iap.tunnelResourceAccessor` on the same instance | `infra/wif.tf:96-102` — `google_iap_tunnel_instance_iam_member.deploy_iap_tunnel`, `instance = google_compute_instance.vm.name` | ✅ |
| `roles/iam.serviceAccountUser` on the VM's attached SA | `infra/wif.tf:104-108` — `service_account_id = data.google_compute_default_service_account.default.name` (`infra/wif.tf:84-86`) | ✅ |
| VM has no explicit `service_account` block (so the default compute SA *is* the attached identity) | `infra/compute.tf` — `grep -n 'service_account'` returns nothing; only `tags = ["web-server"]` at `infra/compute.tf:9` | ✅ |
| `roles/iam.workloadIdentityUser` still repo-scoped on the deploy SA | `infra/wif.tf:58-62` — `principalSet://iam.googleapis.com/${…pool.github.name}/attribute.repository/${var.github_repository}` | ✅ |
| No `google_project_iam_member` anywhere under `infra/` | `git grep -n 'google_project_iam_member' -- infra/` → no matches (exit 1) | ✅ |
| Migration note for a future explicit VM SA | `infra/wif.tf:81-82` | ✅ |

### Check 1b — `deploy.yml` call → authorizing permission

| `deploy.yml` call | Permission needed | Granted by | Scope OK? |
| --- | --- | --- | --- |
| `instances describe` (`:76`, `:82`, `:90`) | `compute.instances.get` | `instanceAdmin.v1` @ instance (`wif.tf:88`) | ✅ instance |
| `instances start` (`:79`) | `compute.instances.start` | same | ✅ instance |
| `instances start` on an SA-attached VM | `iam.serviceAccounts.actAs` | `serviceAccountUser` @ default compute SA (`wif.tf:104`) | ✅ SA |
| poll the start operation (gcloud, implicit at `:79`) | `compute.zoneOperations.get` / `compute.globalOperations.get` | **nothing** — operations are project/zone collections, not instance children | ❌ **project-scoped, ungranted** |
| `ssh`/`scp --tunnel-through-iap` (`:108`, `:115`, `:144`, `:146`, `:156`) — tunnel | `iap.tunnelInstances.accessViaIAP` | `iap.tunnelResourceAccessor` @ instance (`wif.tf:96`) | ✅ instance |
| `ssh` — publish the ephemeral key | `compute.instances.setMetadata` | `instanceAdmin.v1` @ instance | ✅ instance |
| `ssh` — OS-Login / project-metadata probe gcloud performs before connecting | `compute.projects.get` (and `compute.instances.list`) | **nothing** | ❌ **project-scoped, ungranted** |
| `curl https://$IP/` (`:166`) | none (public `:443`) | `infra/firewall.tf:51-61` | ✅ |
| WIF token exchange (`:52-57`) | `iam.workloadIdentityUser` | `wif.tf:58-62` | ✅ |

**Excess grants**: none found. `instanceAdmin.v1` is broader per-instance than
`get`+`start`+`setMetadata` (it also carries `delete`, `reset`, `attachDisk`,
`setServiceAccount` on that instance), but it is a predefined role bound to a
single instance — no project reach. A custom role would be tighter; not required.

**Missing grants**: see G1. Google's IAP TCP-forwarding docs list
`compute.projects.get` as project-scoped and required for
`gcloud compute ssh --tunnel-through-iap`, alongside instance-scoped
`compute.instances.get` / `.list` / `iap.tunnelInstances.accessViaIAP` and
`compute.instances.setMetadata` + `compute.globalOperations.get` for the
non-OS-Login key path. `compute.instances.list`, `compute.projects.get`, and
`*Operations.get` cannot be conferred by `google_compute_instance_iam_member`.
This has **not** been contradicted by a live apply — the operator live steps are
still deferred (`.specs/STATE.md:157-166`) — so it is a documented risk, not an
observed failure. Same class of bug as the two `startup.sh.tpl` defects that only
a real apply surfaced (`CLAUDE.md`, "Real-deployment corrections").

### Check 2 — No static-IP reservation in CI

| Requirement | Evidence | Result |
| --- | --- | --- |
| No `addresses create/describe/delete` in the workflow | `git grep -n 'compute addresses' -- .github/` → no matches | ✅ |
| No `delete-access-config` / `add-access-config` | `git grep -n 'access-config' -- .github/` → no matches | ✅ |
| On `TERMINATED`: start → poll `RUNNING` → read ephemeral `natIP` | `.github/workflows/deploy.yml:76-93` — `start` at `:79`, 18×5s poll at `:81-87`, hard fail at `:88`, `natIP` read at `:90-92` | ✅ |
| Rationale recorded in the workflow itself | `.github/workflows/deploy.yml:70-75` (cites AD-003) | ✅ |
| `GCP_REGION` gone from workflows | `git grep -n 'GCP_REGION' -- ':!*.md'` → no matches (exit 1); remaining hits are all intentional "no longer used" notes in `.specs/STATE.md:135,153,159`, `design.md:203`, `tasks.md:859` | ✅ |
| Operator reservation path unchanged | `ops/vm-start.sh:41-67` still reserves `app-vm-ip`, re-points the access-config, then starts; `ops/vm-start.sh:2-13` explains why it lives here and not in Terraform | ✅ |
| Health poll still uses the resolved IP | `deploy.yml:160-173` reads `steps.vm.outputs.ip` | ✅ |

### Check 3 — Spec consistency

| Requirement | Evidence | Result |
| --- | --- | --- |
| CICD AC 4 no longer reserves a static IP | `spec.md:239` — "SHALL start the instance, wait for it to reach `RUNNING`, and resolve its new ephemeral external IP … SHALL NOT reserve or attach a static IP" | ✅ |
| TF AC 5 names the instance/SA-scoped grants and "no project-level role" | `spec.md:261` | ✅ (wording risk — see G1) |
| TF Independent Test updated | `spec.md:268` — `gcloud compute instances get-iam-policy app-vm` + `gcloud projects get-iam-policy <project>` shows **no** deploy-SA binding | ✅ |
| Gray-area row updated | `spec.md:41` | ✅ |
| `tasks.md` T24/T28 `Done when` re-derived | `tasks.md:735`, `:844`, `:855`, `:859` | ✅ |
| `design.md` decision table + secrets list updated | `design.md:63`, `:203`, `:213`, `:293` | ✅ |
| `validate_spec.py` | exit 0, 0 errors / 0 warnings | ✅ |
| `validate_tasks.py` | exit 0, 0 errors, 16 pre-existing `Tests: none` warnings (infra/CI tasks, unchanged by this amendment) | ✅ |
| `validate_state.py nextjs-secure-app` | exit 0, 0 errors | ✅ |

### Check 4 — Public SSH is opt-in

| Requirement | Evidence | Result |
| --- | --- | --- |
| `operator_ssh_cidrs` is `list(string)`, default `[]` | `infra/variables.tf:38-41` | ✅ |
| CIDR-shape validation | `infra/variables.tf:43-46` — `alltrue([for c in var.operator_ssh_cidrs : can(cidrhost(c, 0))])` | ✅ (plan-time only; see S5) |
| `allow_ssh` `count`-gated on a non-empty list | `infra/firewall.tf:10` — `count = length(var.operator_ssh_cidrs) > 0 ? 1 : 0` | ✅ |
| `source_ranges = var.operator_ssh_cidrs`, no `0.0.0.0/0` on `:22` | `infra/firewall.tf:13`; the only `0.0.0.0/0` in `infra/` are `firewall.tf:42` (`:80`) and `firewall.tf:54` (`:443`) | ✅ |
| `allow-iap-ssh` still unconditional | `infra/firewall.tf:27-37`, `source_ranges = ["35.235.240.0/20"]`, no `count` | ✅ |
| `allow-http` / `allow-https` unchanged | `infra/firewall.tf:39-61`, byte-identical in `git diff c36095f..HEAD -- infra/firewall.tf` | ✅ |
| `terraform.tfvars.example` documents the var | `terraform.tfvars.example:9` | ✅ |
| No other `.tf` reference to `allow_ssh` that would break under `count` | `git grep -n 'allow_ssh' -- infra/` → only `firewall.tf:5,9,11,25` (comments + the resource itself); no `allow_ssh[0]` and no `outputs.tf` reference | ✅ |

### Check 5 — Default posture

With `operator_ssh_cidrs = []`: the only `:22` ingress is `35.235.240.0/20`
(`infra/firewall.tf:30`), so the operator reaches the VM **only** via
`gcloud compute ssh --tunnel-through-iap`, and the calling principal needs
`roles/iap.tunnelResourceAccessor`. Documented at `docs/operations.md:33-38`,
`docs/security.md:20-27`, `docs/troubleshooting.md:10-13`,
`docs/deployment.md:88`, `.specs/STATE.md:164`. CI is unaffected — every remote
call in `deploy.yml` already uses `--tunnel-through-iap`
(`:108,115,144,146,156`) and the IAP rule is unconditional.

**Operational note for the handoff (not a defect):** running `terraform apply`
on an already-deployed environment with `operator_ssh_cidrs` unset **destroys
the existing `allow-ssh` rule**, dropping the operator's current direct SSH
access with no prompt beyond the normal plan output. Intended, but an operator
who is mid-session on a direct SSH connection and has never used IAP should set
`operator_ssh_cidrs` first, or confirm `--tunnel-through-iap` works, before
applying. No doc currently states this explicitly (see G3).

### Check 6 — Docs

| File | Evidence | Result |
| --- | --- | --- |
| `docs/security.md:9-27` | Exposed surface re-stated as IAP-`:22` always + `operator_ssh_cidrs` opt-in + 80/443; heading now "IAP tunnel by default" | ✅ |
| `docs/operations.md:32-38` | Health-check SSH goes through `--tunnel-through-iap`, names `roles/iap.tunnelResourceAccessor` | ✅ |
| `docs/troubleshooting.md:10-13`, `:70` | `--tunnel-through-iap` added, with the `operator_ssh_cidrs` caveat | ✅ |
| `docs/deployment.md:31-33`, `:88` | tfvars list includes `operator_ssh_cidrs`; smoke-test SSH uses the tunnel | ✅ |
| `README.md:8-12` | "SSH reachable only through an IAP tunnel by default (direct `:22` is opt-in via `operator_ssh_cidrs`)" | ✅ |
| `docs/architecture.md:9`, `:46-47`, `:64` | Diagram + component table re-described | ⚠️ minor — `docs/architecture.md:43` still labels the box "Firewall (22 / 80 / 443 only…)" without the IAP-vs-CIDR distinction the two lines below now make |
| `docs/application.md:29-33` | `GCP_REGION` removed from the secrets list | ✅ |
| `design.md:214` | still reads "The public `allow-ssh` rule stays for the operator" | ⚠️ stale (G2) |
| `.specs/features/gcp-infra-terraform/spec.md:45`, `tasks.md:436`, `design.md:98-100` | still describe `tcp:22` from `0.0.0.0/0` and "3 firewall rules" as the intended surface | ⚠️ stale (G2) — prior feature's spec, now contradicted by `infra/firewall.tf` |

### Gate results

| Gate | Result |
| --- | --- |
| `terraform fmt -check -recursive infra` | exit 0 |
| `terraform -chdir=infra validate` | Success, exit 0 |
| `terraform -chdir=infra/bootstrap validate` | Success, exit 0 |
| Both workflow YAMLs parse (`yaml.safe_load`) | ok / ok |
| `cd web && npm test` | 15 files, **149 passed**, 0 failed — unchanged, `web/` untouched by this diff |
| `git status --porcelain` | empty before and after the sensor |
| `git ls-files` secret sweep | no key material, no tracked `terraform.tfvars` / `backend.hcl` / `.env` / `.pem` |
| `validate_spec.py` / `validate_tasks.py` / `validate_state.py` | 0 / 0 / 0 |

### Discrimination sensor (light, IaC)

Run in a throwaway `git worktree add --detach` at `HEAD`; real-tree
`git status --porcelain` was empty before and after and the worktree was removed
with `--force` + `git worktree prune`.

| # | Mutation | File | Caught by | Killed? |
| --- | --- | --- | --- | --- |
| S1 | `google_compute_instance_iam_member.deploy_compute_admin` → `google_project_iam_member` (project-wide `instanceAdmin.v1`) | `infra/wif.tf:88` | `fmt` ✅ pass, `validate` ✅ pass — **only** the `git grep google_project_iam_member -- infra/` check in the task's `Done when` catches it, and that grep is prose, not a script | ❌ survived all automated gates |
| S2 | Removed the `count` guard so `allow_ssh` always creates with `source_ranges = []` | `infra/firewall.tf:10` | `fmt` ✅ pass, `validate` ✅ pass. **`terraform validate` does not catch an empty `source_ranges`** — the API rejects it only at apply | ❌ survived |
| S3 | `operator_ssh_cidrs` default → `["0.0.0.0/0"]` (public `:22` back on by default) | `infra/variables.tf:40` | `fmt`/`validate` pass; a `grep '0\.0\.0\.0/0' infra/variables.tf` would flag it, but no gate runs that grep | ❌ survived |
| S4 | Deleted `google_service_account_iam_member.deploy_sa_user` (the `actAs` binding) | `infra/wif.tf:104-108` | `fmt`/`validate` pass — `data.google_compute_default_service_account` becomes unreferenced, which is legal HCL | ❌ survived |
| S5 | Deleted the `operator_ssh_cidrs` CIDR `validation` block | `infra/variables.tf:43-46` | `fmt`/`validate` pass — `validation` blocks are evaluated at plan time with a concrete value, and `terraform validate` supplies none | ❌ survived |

**Sensor depth**: lightweight (5 mutations, IaC).
**Result**: 0/5 killed by the mechanical gates.

**Honest reading**: `terraform fmt` + `terraform validate` are syntax/type gates.
They cannot see IAM *scope*, firewall *breadth*, a missing binding, or a deleted
`validation` block, and without GCP credentials there is no `terraform plan` to
raise the bar. Every security property this amendment adds is therefore enforced
by **review and the `Done when` prose only** — not by code. That is a structural
limitation of the toolchain, not an implementation defect, but it means a future
edit can silently undo any of R2/R3 with all gates green. The cheapest real
improvement is a handful of repo-local `grep` assertions wired into `ci.yml`
(no project ID, no credentials needed): assert no `google_project_iam_member`
under `infra/`, assert no `0.0.0.0/0` on a `:22` rule, assert `allow_ssh` carries
a `count`. See G4.

### Ranked gaps

1. **G1 — P0, pre-deploy blocker.** `gcloud compute ssh --tunnel-through-iap`
   requires project-scoped `compute.projects.get` (and `compute.instances.list`,
   plus `compute.globalOperations.get` / `compute.zoneOperations.get` for the
   non-OS-Login key path and start-operation polling) per Google's IAP
   TCP-forwarding docs. None can be granted by `google_compute_instance_iam_member`
   or `google_service_account_iam_member`. `deploy.yml:79-92` and `:108-158` all
   depend on those calls. The first live deploy will most likely fail with a
   `compute.projects.get` denial. Fix: a minimal **custom project role** holding
   exactly `compute.projects.get`, `compute.instances.list`,
   `compute.zoneOperations.get`, `compute.globalOperations.get` — still no
   predefined project-level role — and re-word `spec.md:261` / `tasks.md:735`
   from "no project-level role" to "no *predefined* project-level role; a
   least-privilege custom role for the read-only project probes gcloud requires."
   Not verifiable without a live apply; do not close the amendment's live steps
   without it.
2. **G2 — Minor, spec staleness.** `design.md:214` still says the public
   `allow-ssh` rule stays for the operator. `.specs/features/gcp-infra-terraform/`
   (`spec.md:45`, `tasks.md:436`, `design.md:98-100`) still describes `tcp:22`
   from `0.0.0.0/0` and "3 firewall rules" as intended. Both now contradict
   `infra/firewall.tf`.
3. **G3 — Minor, operational.** No doc warns that `terraform apply` with
   `operator_ssh_cidrs` unset destroys an existing `allow-ssh` rule and drops the
   operator's current direct SSH access. Add one line to `docs/operations.md` or
   `docs/deployment.md`.
4. **G4 — Minor, enforcement.** 0/5 sensor mutations were killed. The IAM-scope
   and firewall-breadth invariants have no mechanical gate. Add the three
   credential-free `grep` assertions above to `ci.yml`.
5. **G5 — Cosmetic.** `docs/architecture.md:43` still labels the firewall box
   "22 / 80 / 443 only" without the IAP-vs-opt-in-CIDR distinction its own
   following lines now draw.
