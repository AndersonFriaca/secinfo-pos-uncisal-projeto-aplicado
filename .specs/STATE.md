# Project State

Project memory: architectural decisions that outlive a single feature, plus the
handoff snapshot for resuming work.

## Decisions

Decisions here are project-level constraints. A later feature either conforms to
an `active` decision or supersedes it explicitly (marking the old one
`superseded by AD-NNN`).

### AD-001 — Two Terraform roots split by blast radius

**Status**: active
**Feature**: `gcp-infra-terraform`

`infra/bootstrap/` holds resources that must survive a teardown (the GCS state
bucket, the billing budget). `infra/` holds everything billable. `terraform
destroy` in `infra/` can never reach `infra/bootstrap/`, because they are
separate roots with separate state — not because of a `prevent_destroy`
lifecycle rule, which would abort the entire destroy plan instead.

**Why**: the operator needs "destroy everything billable, keep the free stuff"
to actually work in one command.

### AD-002 — No GCP project identifier in any committed file

**Status**: active
**Feature**: `gcp-infra-terraform`

The repository is public per the course requirements. The project ID — and
anything embedding it, such as the state bucket name — is supplied at runtime
from gitignored files: `infra/terraform.tfvars`, `infra/bootstrap/terraform.tfvars`,
and `infra/backend.hcl` (passed via `terraform init -backend-config`). Committed
files carry only `.example` templates. Operator scripts read these files rather
than hardcoding values.

**Why**: a leaked project ID in a public repo is an unnecessary disclosure, and
git history is expensive to scrub after the fact.

### AD-003 — Ephemeral VM IP; reservation only while the VM runs

**Status**: active
**Feature**: `gcp-infra-terraform`

`infra/compute.tf` declares an ephemeral external IP. A static IP is reserved
and attached by `ops/vm-start.sh` and released by `ops/vm-stop.sh`, so a
reservation exists only while the instance is running.

**Why**: GCP bills a reserved static IP whenever it is not attached to a
*running* instance, which defeats stopping the VM to save cost. Terraform has no
"on instance start/stop" hook, so the cycle lives in operator scripts.

**Consequence**: anything needing to reach the VM (notably CI/CD) must resolve
the current IP at run time rather than hardcoding an address.

### AD-004 — Application secrets never reach the browser or the repository

**Status**: active
**Feature**: `nextjs-secure-app`

Firebase/Identity Platform is used **server-side only**: Route Handlers call the
Identity Platform REST API with a server-held API key and mint a Firebase
session cookie via the Admin SDK. The Firebase client SDK is not a dependency,
and no `NEXT_PUBLIC_*` variable carries auth configuration. Runtime secrets live
in `/opt/app/.env.production` (chmod 600) on the VM, written at deploy time from
GitHub Actions secrets.

**Why**: the standard client-SDK flow publishes the Firebase config in the
browser bundle. The course requires that no environment value be exposed in a
public repository or a public page.

### AD-005 — Edge/Node runtime boundary for security controls

**Status**: active
**Feature**: `nextjs-secure-app`

`proxy.ts` runs on the Edge runtime and therefore handles only what Web Crypto
and header manipulation allow: CSP nonce generation, the OWASP response-header
set, same-origin enforcement, and CSRF token comparison. Everything requiring
`firebase-admin` (session verification) plus the in-memory rate-limit /
brute-force counters runs in Route Handlers and Server Components on the Node
runtime.

**Why**: `firebase-admin` needs Node APIs that the Edge runtime does not
provide. Placing it in the proxy fails at runtime, sometimes only in
production.

### AD-006 — Verify third-party API surfaces before committing to them

**Status**: active
**Feature**: `gcp-infra-terraform`, `nextjs-secure-app`

Provider- and framework-level details are checked against current documentation
during Design, not recalled from memory. Two concrete cases already caught this:
Certbot's Nginx plugin does **not** support IP-address certificates (so the
startup script uses `--webroot` and writes the HTTPS server block itself), and
Next.js 16 renamed `middleware.ts` to `proxy.ts`. Where a detail cannot be
verified, it is flagged in the design for the implementing task to confirm
rather than guessed.

**Why**: a fabricated API detail propagates silently from design into tasks into
code, and only surfaces at deploy time.

### AD-007 — Keyless VM deploy: IAP tunnel + ephemeral OS keys + dedicated `appsvc`

**Status**: active
**Feature**: `nextjs-secure-app`

GitHub Actions reaches the VM only through `gcloud compute ssh`/`scp
--tunnel-through-iap`, authenticated by the WIF-federated deploy service
account. gcloud mints a short-lived, IAM-scoped SSH key from that identity and
publishes it to instance metadata for the duration of the call — no SSH private
key or SSH-user value is ever stored as a GitHub secret or committed. The deploy
SA additionally holds `roles/iap.tunnelResourceAccessor`; `iap.googleapis.com`
and an `allow-iap-ssh` firewall rule (`tcp:22` from `35.235.240.0/20`) are
provisioned in `infra/`. The app runs on the VM as a dedicated locked system
user `appsvc` (a hardcoded constant, not a variable) that owns `/opt/app` and
runs PM2; the ephemeral IAP login user writes releases with `sudo install -o
appsvc`. The operator's metadata SSH key and public `:22` access are unchanged.

**Why**: a stored SSH key is long-lived credential material in a public repo's
CI. Federating VM access through the same WIF identity used for the GCP API
removes it entirely. Decoupling the runtime user (`appsvc`) from any human
operator lets the CI connect as its own per-run identity.

**Amendment 2 refinement (hardening):** the deploy SA now holds **zero
project-level role**. `roles/compute.instanceAdmin.v1` and
`roles/iap.tunnelResourceAccessor` are bound to the single app VM instance
(`google_compute_instance_iam_member` / `google_iap_tunnel_instance_iam_member`),
and `roles/iam.serviceAccountUser` to the VM's attached (default compute)
service account (`google_service_account_iam_member` on
`data.google_compute_default_service_account`). This was unblocked by dropping
the CI static-IP reservation: `deploy.yml` on a `TERMINATED` VM now just runs
`gcloud compute instances start`, polls until `RUNNING`, and reads the new
ephemeral IP — no region-scoped `addresses.*` calls, so `GCP_REGION` is no
longer a secret. Public `:22` stays **open** (`allow-ssh` from
`var.operator_ssh_cidrs`, default `["0.0.0.0/0"]`) so the course evaluation
board can connect directly — PRD Eixo 1 requires key-only SSH + Fail2Ban
(4 attempts / 24h) on `:22`, not that `:22` be restricted to a CIDR; narrowing
`operator_ssh_cidrs` is available to harden. The `allow-iap-ssh` rule
(`35.235.240.0/20`) is additive, for the keyless CI path. If an explicit
service account is ever attached to the VM, the `roles/iam.serviceAccountUser`
binding target must move to it.

### AD-008 — Semver releases driven by Conventional Commits (release-please)

**Status**: active
**Feature**: `nextjs-secure-app`

Version tags (`vX.Y.Z`) and GitHub Releases are produced by
`googleapis/release-please-action@v4` (`.github/workflows/release.yml`), not by
hand and not by the deploy job. On every push to `main` it maintains one open
"release PR" that bumps `web/package.json` + `web/CHANGELOG.md` from the
Conventional Commit types already enforced on commit messages (`feat` → minor,
`fix` → patch, `feat!`/`BREAKING CHANGE` → major). Merging that PR creates the
annotated tag and the Release. Config: `release-please-config.json`
(`release-type: node`, `include-component-in-tag: false` so tags are bare
`vX.Y.Z`, `bootstrap-sha` pinned to `3cbc1e3` so the first release only counts
commits after the CI/CD work) + `.release-please-manifest.json` (`{"web":
"0.1.0"}`). Needs `contents: write` + `pull-requests: write` + `id-token: write`
(the last for the called deploy); uses the default `GITHUB_TOKEN`.

**Deploy is gated on release.** `deploy.yml` no longer triggers on `push` to
`main` — its trigger is `workflow_call` (+ `workflow_dispatch` for a manual
redeploy). `release.yml` calls it (`uses: ./.github/workflows/deploy.yml`,
`secrets: inherit`) from a `deploy` job gated on
`needs.release-please.outputs.releases_created == 'true'`. So a merge to `main`
deploys **only** when it cuts a `vX.Y.Z` release — not on every push, and the
old "push to main → deploy, then release PR merge → deploy again" double-fire
is gone.

**Why**: the repo already validates commit messages against the Conventional
Commits grammar (`check_commit.py`), so the version bump is fully derivable —
manual bumps are error-prone and the PRD's CI/CD axis is graded. Tying deploy
to the release (not the push) means what is on the VM always matches a tagged
version.

**Consequence**: `web/package.json` `version` is release-please's to own — do
not edit it manually. The release PR itself passes `ci.yml` (only touches
package.json/CHANGELOG/manifest). Nothing reaches the VM until a release PR is
merged (or `Deploy` is run manually via `workflow_dispatch`).

### AD-009 — Rate-limit store: in-memory only, Firestore removed entirely

**Status**: active (supersedes the earlier "Firestore adapter retained" form)
**Feature**: `nextjs-secure-app`

The rate limiter uses `createInMemoryStore()` — a process-local `Map`, lazily
built by `requireStore()`. There is no other store: `createFirestoreStore`,
`FirestoreLike`, and `configureRateLimitStore` were deleted. `RateLimitStore`
stays as an interface only so `checkRateLimit`'s fail-closed branch can be
unit-tested with an injected throwing fake. Firestore is gone from infra too —
`infra/firestore.tf` deleted, `firestore.googleapis.com` dropped from
`local.app_services`, and `google_firestore_database.default` destroyed via a
`removed { ... lifecycle { destroy = true } }` block (after a prior commit set
`deletion_policy = "DELETE"`, since the default `ABANDON` would only drop it
from state).

**Why**: `configureRateLimitStore` was never called anywhere in production, so
every `/api/auth/*` POST would have thrown "rate-limit store not configured" on
a real request. The deployment is a single VM instance with no cross-instance
state need and 60-second block windows, so a process-local store is sufficient.
User asked to remove Firestore completely — fewer dependencies, nothing dead in
the project.

**Consequence**: rate-limit counters reset on every deploy/restart — one extra
failed attempt per IP before a block re-forms. Revisit only if the app ever
runs more than one instance. SEC-01/SEC-03/SEC-07 and the spec's rate-limit
edge cases reworded for the in-memory store.

### AD-010 — Firebase Auth provisioned via `google_firebase_project` (google-beta)

**Status**: active
**Feature**: `nextjs-secure-app`

`infra/firebase.tf` adds `google_firebase_project.default` (provider
`google-beta`), which marks the GCP project as Firebase-enabled — Firebase
Authentication is now fully Terraform-provisioned, not just the Identity
Platform config. `firebase.googleapis.com` is in `local.app_services`.
`google-beta` is added to `infra/main.tf` `required_providers` (`~> 5.0`) and a
`provider "google-beta"` block mirrors the `google` one; it is used by this one
resource only. `google_identity_platform_config.default` now
`depends_on = [google_firebase_project.default]`. No `google_firebase_web_app`
— the app is server-side only (AD-004), so there is no client SDK config to
emit.

**Why**: user asked for Firebase Auth creation/provisioning via Terraform. A
full Firebase project (vs. only Identity Platform) is what shows up in the
Firebase console and is the conventional shape. The one extra provider is the
minimum cost for that.

## Handoff

**Feature**: `nextjs-secure-app` — **COMPLETE**. Execute done (T1-T30, 5 sequential sub-agent batches), independent Verifier **PASS** on re-verification 1/3, minor residual gaps R1/R3 cleaned up.
**Phase**: done. `validate_state.py nextjs-secure-app` exits 0. `validation.md` verdict PASS.
**Completed**: full `web/` Next.js 16 app (**149 unit tests** / 15 files passing; lint, typecheck, build clean); `infra/app.tf` / `infra/firebase.tf` / `infra/wif.tf` (terraform fmt + validate clean on `infra/` and `infra/bootstrap/`); `infra/scripts/startup.sh.tpl` (Node 24 LTS from NodeSource, `/opt/app` chowned, `server_tokens off`); `infra/scripts/ecosystem.config.js` (standalone `node current/server.js`); `.github/workflows/ci.yml` (PR test gate) and `.github/workflows/deploy.yml` (WIF keyless deploy). README documents four OWASP Top 10:2025 categories with verified file paths; `docs/application.md` added.
**Verifier findings resolved**: 7 gaps from the first FAIL pass fixed in `c3a21d0..63ef549` (CSRF constant-time proof, `/dashboard` no-store assertion, CSRF cookie attribute assertions, unverified-email→`/verify-email` redirect via `getSessionState`, SEC-18 relabel, landing-nav helper+tests, X-Forwarded-For trust note). Re-verification: all 3 previously-surviving mutants killed, no regression. Residual R1/R3 (dashboard-guard helper + test, nav describe label) fixed in `f16468d`/`a26927272`. Carried spec-precision gaps documented in `validation.md`: 307-vs-303 redirects (framework constraint), dev-mode `'unsafe-eval'`, inspection-only ACs.
**Feature commit range**: `cc46312..HEAD` (~41 commits on `main`).
**In progress**: nothing.
**Amendment (AD-007, keyless IAP deploy)**: `deploy.yml` rewritten to reach the VM only via `gcloud compute scp/ssh --tunnel-through-iap` — `Configure SSH` step and the `VM_SSH_PRIVATE_KEY`/`VM_SSH_USER` secrets removed. `infra/`: `iap.googleapis.com` enabled, `allow-iap-ssh` firewall rule, `roles/iap.tunnelResourceAccessor` on the deploy SA. `startup.sh.tpl`: dedicated locked `appsvc` user owns `/opt/app` and runs PM2 (`pm2-appsvc` unit); template no longer interpolates any variable. Gates: terraform fmt/validate clean, `bash -n` + `node --check` clean, both workflows parse as YAML, `web/` suite unchanged.
**Amendment 2 (hardening, residuals R2/R3 from `validation.md`)**: `deploy.yml` drops the static-IP reserve/attach/detach block — on a `TERMINATED` VM it now starts the instance, polls until `RUNNING`, and reads the ephemeral `natIP` (`GCP_REGION` no longer consumed). `infra/wif.tf`: the deploy SA's three grants moved from project scope to instance scope (`google_compute_instance_iam_member`, `google_iap_tunnel_instance_iam_member`) and the VM's default compute SA (`google_service_account_iam_member`) — zero project-level role. `infra/firewall.tf`: `allow-ssh` is now `count`-gated on the new `var.operator_ssh_cidrs` (default `[]`), so public `:22` is opt-in; IAP-range `:22` is the only default SSH ingress. Gates: `terraform fmt`/`validate` clean on `infra/` + `infra/bootstrap/`, both workflows parse as YAML, `web/` suite untouched (149 pass). Commits `c4ef818`, `719b205`, `449b77c`, + this doc commit.

**Amendment 2 follow-up fixes (validation.md G1–G5)**: `infra/wif.tf` adds custom project role `deployVmOperator` (`compute.projects.get`, `compute.instances.list`, `compute.zoneOperations.get`, `compute.globalOperations.get` — read/list/operations-get only) bound to the deploy SA via `google_project_iam_member`, because `gcloud ... --tunnel-through-iap` / `instances start` / `instances describe` need project-scoped reads an instance binding cannot grant (G1, the P0). Spec/design/tasks reworded from "no project-level role" to "no predefined project role + one minimal custom role" (G2); one-line supersede notes added to the shipped `gcp-infra-terraform` spec/design/tasks. `.github/workflows/ci.yml` gains a credential-free `iac-guardrails` job asserting no predefined project IAM binding and the custom role stays read-only (G4). `docs/operations.md` + `docs/architecture.md` describe the firewall/SSH posture (G3, G5). Gates: `terraform fmt -check`/`validate` clean, both YAMLs parse, `validate_spec`/`validate_tasks`/`validate_state` exit 0, `web/` untouched (149 pass).

**Amendment 2 fix round 2 (validation.md G6 + guard hardening)**: `infra/compute.tf` sets `metadata["block-project-ssh-keys"] = "TRUE"` so `gcloud compute ssh` writes its ephemeral key to *instance* metadata (covered by the instance-scoped `compute.instances.setMetadata`) instead of needing a project-wide metadata write the deploy SA does not hold (G6, second P0). `ci.yml` `iac-guardrails` hardened: the `deploy_vm_operator` binding must reference the custom-role id (not a `roles/` literal), the custom role's permission list must carry no mutating verb, and the custom-role permission list is checked with an allowlist (`.get`/`.list` only) (closes evasions S6/S10). Guards exercised against synthetic offenders — all bite. (The `:22`/`operator_ssh_cidrs` firewall guards were later removed when public `:22` was deliberately reopened for the evaluation board.) Commits `9f11dc5`, `f631ef7`, + this doc commit. Re-verification: G2–G5 fully closed, G1 closed on shape, G6 the remaining item now fixed.

**Amendment 3 (AD-008, semver releases + deploy-on-release)**: new `.github/workflows/release.yml` runs `googleapis/release-please-action@v4` on push to `main`; `release-please-config.json` + `.release-please-manifest.json` at repo root. Conventional-Commit-driven `vX.Y.Z` tags + GitHub Releases + `web/CHANGELOG.md`, zero manual version bumps. `deploy.yml` trigger changed from `push: main` to `workflow_call` (+ `workflow_dispatch`); `release.yml` calls it from a `deploy` job gated on `releases_created` — deploy fires once, only on a release, no more double-fire. `spec.md` CICD story AC 1 + AC 9 reworded, `CICD-09` added; `design.md` workflow table updated. Gates: both new JSON files parse, all three workflows parse as YAML, `validate_spec`/`validate_state` exit 0, `web/` untouched.

**Amendment 4 (AD-009 + pt-BR UI)**: rate-limit store default switched to `createInMemoryStore()` (`requireStore()` builds it lazily; Firestore adapter + `configureRateLimitStore` retained, `infra/firestore.tf` untouched). All user-visible strings in `web/` translated to pt-BR: the five pages, `lib/nav.ts` labels, `app/layout.tsx` metadata description + `<html lang="pt-BR">`, and the API route error/ack message constants (`login`, `signup`, `resend-verification`). Tests updated: `lib/nav.test.ts`, `app/api/auth/login/route.test.ts`, `app/api/auth/signup/route.test.ts`; `rate-limit.test.ts` gains an in-memory-default block + `createInMemoryStore` isolation test. **151 tests pass** (was 149), lint/typecheck/build clean. spec/design reworded store-agnostic; SEC-01/SEC-07 + edge cases updated.

**Amendment 5 (AD-009 final + AD-010, Firestore out / Firebase project in)**: Firestore removed everywhere — `web/lib/security/rate-limit.ts` drops `createFirestoreStore`/`FirestoreLike`/`configureRateLimitStore` (in-memory `createInMemoryStore` only, `requireStore` lazy-builds it); `infra/firestore.tf` deleted; `firestore.googleapis.com` dropped from `app.tf`; `google_firestore_database` torn down (commit `884e92c` set `deletion_policy = "DELETE"`, then a `removed` block in `app.tf` destroys it). Firebase Auth provisioned via new `infra/firebase.tf` `google_firebase_project` (google-beta added to `required_providers` + a `provider "google-beta"` block in `main.tf`); `firebase.googleapis.com` enabled; `google_identity_platform_config` depends on it. `.terraform.lock.hcl` gains the google-beta v5.45.2 hash. Tests: `rate-limit.test.ts` Firestore block replaced with `createInMemoryStore` tests, `"firestore unavailable"` → `"store unavailable"` in `rate-limit.test.ts` + `login/route.test.ts`. **152 tests pass**, lint/typecheck/build clean, `terraform validate` + `plan` clean (plan: 2 add, 1 change, 2 destroy). spec TF story + SEC-01/03/07 + assumptions + edge cases + non-goals + free-tier reworded; design.md rate-limit + Terraform + tech-decisions sections updated; docs updated.

**Amendment 6 (release deploy fix)**: `release.yml` gated the deploy job on `steps.rp.outputs.release_created`, which `googleapis/release-please-action@v4` only emits in *simple* mode. In manifest mode (config-file + manifest-file) the outputs are `releases_created` / `paths_released` / `web--tag_name`. First real release created the tag but skipped deploy (`if` false). Fixed: gate on `releases_created`, tag output via `steps.rp.outputs['web--tag_name']`. Also `fix(web)`: `typecheck` script now `next typegen && tsc --noEmit` — CI ran `tsc` with no prior build so Next 16's generated `PageProps`/`LayoutProps` globals were absent (TS2304). The already-cut release must be deployed once manually via `Deploy` → Run workflow (`workflow_dispatch`).

### Operator: still-open live items
- `terraform apply` the new `infra/` resources (custom role `deployVmOperator` included), then `terraform output` for the two GitHub secrets. First real deploy is the true test of the IAP permission set — same "only-found-live" class as the two `startup.sh.tpl` bugs in `CLAUDE.md`.
- GitHub secrets: `GCP_PROJECT_ID`, `GCP_ZONE`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`, `IDENTITY_PLATFORM_API_KEY` (no `GCP_REGION`, no SSH secrets).
- Rebuild the VM (Node 24, `appsvc`, `block-project-ssh-keys`). Public `:22` stays open (`operator_ssh_cidrs` default `["0.0.0.0/0"]`) for the evaluation board; `gcloud compute ssh --tunnel-through-iap` also works for anyone holding `roles/iap.tunnelResourceAccessor`.

**Next step**: operator live steps below. Also: `.specs/LESSONS.md` + `lessons.json` hold 8 candidate lessons (L-001..L-008) from the Verifier — review/confirm when convenient.

### Operator live steps (deferred — need an authenticated GCP account + a running VM)

1. **GitHub repo + secrets.** Push to the GitHub repo and configure Actions secrets: `GCP_PROJECT_ID`, `GCP_ZONE` (known values from `terraform.tfvars`), and `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`, `IDENTITY_PLATFORM_API_KEY` — all three from `terraform -chdir=infra output -raw <name>` (`wif_provider_name`, `deploy_service_account_email`, `identity_platform_api_key`) after step 2. The API key is a `google_apikeys_key` restricted to `identitytoolkit.googleapis.com`, provisioned in `infra/app.tf`. **`GCP_REGION` is no longer used** (Amendment 2 dropped the CI static-IP reservation). No SSH key or SSH-user secret — the CI deploy is keyless over an IAP tunnel (AD-007); operator/board SSH to public `:22` is unchanged.
2. **`terraform apply` the new resources.** First run `terraform -chdir=infra init -upgrade` (adds the `google-beta` provider). Sequence:
   - `terraform apply` on commit `884e92c` alone flips `google_firestore_database.default` `deletion_policy` ABANDON → DELETE (no other change).
   - `terraform apply` on the Firestore-removal commit then: creates `google_project_service["firebase.googleapis.com"]` + `google_firebase_project.default` (google-beta), **destroys** `google_firestore_database.default` and `google_project_service["firestore.googleapis.com"]`, updates `google_identity_platform_config` to depend on the Firebase project. Also applies (if not already) `google_apikeys_key` (restricted to `identitytoolkit.googleapis.com`), the Workload Identity pool/provider, and the `allow-iap-ssh` firewall rule. If `apikeys`/`firebase` was just enabled, a resource may fail once on a propagation error — re-run `terraform apply`. The deploy SA's `roles/compute.instanceAdmin.v1` and `roles/iap.tunnelResourceAccessor` are **instance-scoped** (`google_compute_instance_iam_member` / `google_iap_tunnel_instance_iam_member` on `app-vm`) and `roles/iam.serviceAccountUser` is scoped to the VM's default compute SA — the deploy SA gets no project-level role. Verify the `principalSet://` member resolved to this repo, and that `gcloud projects get-iam-policy` shows no deploy-SA binding.
   - **Public `:22` stays open** (`allow-ssh` from `operator_ssh_cidrs`, default `["0.0.0.0/0"]`) so the evaluation board can SSH in directly — key-only + Fail2Ban (4/24h) per PRD Eixo 1. Narrow `operator_ssh_cidrs` in `terraform.tfvars` to harden. `gcloud compute ssh <user>@app-vm --tunnel-through-iap` also works for principals with `roles/iap.tunnelResourceAccessor`.
3. **Rebuild the VM for Node 24 + `appsvc`.** The updated `startup.sh.tpl` only takes effect on a fresh boot / instance recreation. It now also provisions the locked `appsvc` user that owns `/opt/app` and runs PM2. After it runs, confirm `node --version` reports `v24.x`, `pm2 list` works, `systemctl status pm2-appsvc` is active, `test -w /opt/app` as `appsvc`, and `curl -sI https://<ip>/ | grep -i '^server:'` shows no version.
4. **Merge to `main`, then merge the `release-please` PR** it opens — the release PR merge is what cuts the `vX.Y.Z` tag and (via `release.yml` calling `deploy.yml`) triggers the deploy. A plain push to `main` no longer deploys; `workflow_dispatch` on `Deploy` forces a manual redeploy. The deploy itself: WIF auth (no key), dynamic IP resolution, `gcloud compute scp/ssh --tunnel-through-iap` (ephemeral SSH key, no stored key), bundle to `/opt/app/releases/<sha>` via `sudo install -o appsvc`, `current` symlink flip, `.env.production` copied chmod 600 owned by `appsvc`, PM2 reload as `appsvc`, health poll to HTTP 200.
5. **Run every "Independent Test" in `spec.md`** against the live VM: landing page 200 + no `NEXT_PUBLIC_`/Firebase config in HTML; signup weak/strong password; login byte-identical failures + `Set-Cookie` attributes + no client-bundle Identity Platform reference; dashboard 303 without cookie / 200 with / 303 after logout-replay; six failed logins → 429 `Retry-After: 60` with the 6th never reaching Identity Platform; `curl -sI` full OWASP header set + absence checks + foreign-`Origin` 403; PR shows a red check on a broken assertion; merge produces a green deploy with a dynamic IP and a 200 health poll; `gcloud firebase projects list` shows the project, `gcloud firestore databases list` shows none; `terraform destroy` then `apply` round-trips.

**Branch**: `main`.
