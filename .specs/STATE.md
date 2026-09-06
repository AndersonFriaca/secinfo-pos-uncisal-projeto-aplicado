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
**Phase**: Planning complete (Specify → Design → Tasks all approved). Execute deliberately not started — the user chose to plan now and implement later.
**Completed**: `spec.md` (75 requirements, validator clean), `design.md`, `tasks.md` (30 tasks across 11 phases, validator clean — 0 errors).
**In progress**: nothing — no application code exists yet; `web/` has not been created.
**Next step**: run Execute. Dispatch batch 1 (Phases 1-2: T1-T6 — scaffold, Vitest, shadcn, then the pure security primitives). Per the confirmed decisions in `tasks.md`: sub-agent batches, `coding-guidelines` on code tasks, `react-best-practices` on Phases 4 and 7, `docs-writer` on T29.
**Blockers**: none for local implementation. Live verification needs the operator: a GitHub repo with the secrets configured, `terraform apply` for the new GCP resources, and a VM rebuild to pick up Node 22.
**Watch out for**: T24 (Workload Identity Federation) must verify the `principalSet://` member format against current provider docs before applying — a wrong member fails silently. T25's Node guard must check the installed *major version*, not merely that `node` exists, or a pre-existing Node 18 will be skipped rather than upgraded.
**Uncommitted files**: `.specs/features/nextjs-secure-app/`, `.specs/STATE.md`.
**Branch**: `master`.
