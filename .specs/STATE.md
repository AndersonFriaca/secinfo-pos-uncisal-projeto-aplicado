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
`firebase-admin` or Firestore — session verification, rate limiting, brute-force
counters — runs in Route Handlers and Server Components on the Node runtime.

**Why**: `firebase-admin` and the Firestore SDK need Node APIs that the Edge
runtime does not provide. Placing them in the proxy fails at runtime, sometimes
only in production.

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

## Handoff

**Feature**: `nextjs-secure-app`
**Phase**: Execute complete through T30 (all 30 tasks committed across 11 phases). Independent Verifier pending — the orchestrator dispatches it next.
**Completed**: full `web/` Next.js 16 app (134 unit tests passing; lint, typecheck, build clean); `infra/app.tf` / `infra/firestore.tf` / `infra/wif.tf` (terraform fmt + validate clean on `infra/` and `infra/bootstrap/`); `infra/scripts/startup.sh.tpl` (Node 22 LTS from NodeSource, `/opt/app` chowned, `server_tokens off`); `infra/scripts/ecosystem.config.js` (standalone `node current/server.js`); `.github/workflows/ci.yml` (PR test gate) and `.github/workflows/deploy.yml` (WIF keyless deploy). README documents four OWASP Top 10:2025 categories with verified file paths; `docs/application.md` added.
**Final gate (T30)**: `npm run lint && npm run typecheck && npm test && npm run build` all pass — 134 tests / 13 files. `terraform fmt -check -recursive infra`, `terraform -chdir=infra validate`, `terraform -chdir=infra/bootstrap validate` all pass. `bash -n` on the de-templated startup script passes; both workflow YAMLs parse. `git status --porcelain` clean; `git ls-files` carries no `.env`, key, or project identifier.
**In progress**: nothing.
**Next step**: run the independent Verifier over the feature diff (commits `5ed6e94^..HEAD` on `main` roughly; the feature's own range), then hand to the operator.

### Operator live steps (deferred — need an authenticated GCP account + a running VM)

1. **GitHub repo + secrets.** Push to the GitHub repo and configure Actions secrets: `GCP_PROJECT_ID`, `GCP_ZONE`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`, `VM_SSH_PRIVATE_KEY`, `VM_SSH_USER`, `IDENTITY_PLATFORM_API_KEY`. The WIF provider name and deploy-SA email come from `terraform output` after step 2.
2. **`terraform apply` the new resources.** In `infra/`: applies `google_project_service` (identitytoolkit, firestore, iamcredentials), `google_identity_platform_config`, `google_firestore_database` (Native, `us-east1`), the Workload Identity pool/provider, and the deploy service account. Verify the `principalSet://` member resolved to this repo.
3. **Rebuild the VM for Node 22.** The updated `startup.sh.tpl` only takes effect on a fresh boot / instance recreation. After it runs, confirm `node --version` ≥ v20.9.0, `pm2 list` works, `test -w /opt/app` as the deploy user, and `curl -sI https://<ip>/ | grep -i '^server:'` shows no version.
4. **Merge to `main`** to trigger `deploy.yml`: WIF auth (no key), dynamic IP resolution, bundle to `/opt/app/releases/<sha>`, `current` symlink flip, `.env.production` written chmod 600, PM2 reload, health poll to HTTP 200.
5. **Run every "Independent Test" in `spec.md`** against the live VM: landing page 200 + no `NEXT_PUBLIC_`/Firebase config in HTML; signup weak/strong password; login byte-identical failures + `Set-Cookie` attributes + no client-bundle Identity Platform reference; dashboard 303 without cookie / 200 with / 303 after logout-replay; six failed logins → 429 `Retry-After: 60` with the 6th never reaching Identity Platform; `curl -sI` full OWASP header set + absence checks + foreign-`Origin` 403; PR shows a red check on a broken assertion; merge produces a green deploy with a dynamic IP and a 200 health poll; `terraform destroy` then `apply` round-trips.

**Branch**: `main`.
