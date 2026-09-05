# GCP Infrastructure Provisioning with Terraform — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/gcp-infra-terraform/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase + spec + domain constraints - confirm before Execute. Guidelines found: none (greenfield project, no `AGENTS.md`/lint config yet). Domain is Infrastructure-as-Code (Terraform + shell), not application code, so "tests" here mean the IaC toolchain's own static/plan verification plus the spec's manual `gcloud`/`curl`/`ssh` Independent Tests — there is no unit-test framework to sample.
>
> **Environment constraint (important):** this session has `terraform` (v1.16.1) and `gcloud` (509.0.0) installed, but `gcloud auth list` shows no credentialed account and no billing account is reachable. That means any gate requiring real GCP API calls (`terraform plan`/`apply`, `gcloud billing accounts list`, live `curl`/`ssh` checks) **cannot run automatically in this session** — those steps require the operator to run `! gcloud auth login` (and have billing account access) themselves. Every task below separates what the agent verifies now (static) from what only the operator can verify later (live).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Terraform config (`.tf` files, both roots) | static validation | `terraform fmt -check` clean + `terraform validate` passes with zero errors, for every `.tf` file touched | `infra/**/*.tf`, `infra/bootstrap/**/*.tf` | `terraform fmt -check -recursive infra` && `terraform -chdir=infra validate` (repeat `-chdir=infra/bootstrap`) |
| Terraform plan (requires GCP auth) | manual/deferred | `terraform plan` shows the exact resource set the task's spec ACs describe, no errors, no unexpected diffs on a second run | same as above | `terraform -chdir=infra plan` (operator runs after `gcloud auth login`) |
| Startup script (`infra/scripts/startup.sh.tpl`) | static (shell syntax) | `bash -n` (syntax-only parse) passes; each idempotency guard is visually inspectable in the diff | `infra/scripts/*.sh.tpl` | `bash -n <(sed 's/\${[^}]*}/x/g' infra/scripts/startup.sh.tpl)` (strips Terraform interpolation before syntax-checking the shell) |
| Whole-feature acceptance (spec's "Independent Test" per story) | manual/integration, deferred to operator | Every Independent Test in `spec.md` executed against a real `apply`d GCP project | `spec.md` per-story "Independent Test" sections | `gcloud compute instances describe ...`, `curl -Ik https://<ip>`, `ssh ...`, `gcloud billing budgets list ...` (all require operator auth) |
| Git repository state | manual | `git log`, `git ls-files`, `git check-ignore` match spec's GIT-01..04 | repo root | `git log --oneline`, `git ls-files`, `git check-ignore -v terraform.tfvars` |
| Entity/config files (`.tfvars.example`, `ecosystem.config.js`, `.gitignore`) | none | Build gate only (no logic to unit-test) | — | covered by the static validation row above |

**Coverage Expectation values**: this feature has no domain/business-logic layer in the app-code sense — every "layer" above is either static-checkable now or requires a live GCP apply the operator must run. No layer is silently skipped; live verification is explicitly deferred to the operator with the exact command to run, never marked "done" without it.

## Gate Check Commands

> Generated from the installed toolchain - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After every task that adds/edits a `.tf` file | `terraform fmt -check -recursive infra && terraform -chdir=infra validate && terraform -chdir=infra/bootstrap validate` |
| Shell | After every task that edits `infra/scripts/startup.sh.tpl` | `bash -n <(sed 's/\${[^}]*}/x/g' infra/scripts/startup.sh.tpl)` |
| Full (operator, post-auth) | After a phase that's ready for a real `plan`/`apply` | `gcloud auth login` (operator, interactive) → `terraform -chdir=infra/bootstrap init && terraform -chdir=infra/bootstrap plan` → (after bootstrap apply) `terraform -chdir=infra init && terraform -chdir=infra plan` |
| Build | End of Execute (final task) | Quick gate on both roots + `git status --porcelain` clean + `git ls-files` contains no `.gitignore`-matched file |

---

## Task Breakdown

Every task (`### T1` .. `### T25`) is nested directly under its own phase inside the **Execution Plan** section below — phase membership stays unambiguous by construction, since a task's heading only ever appears between its own `### Phase N` header and the next one.

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order. Each phase's chain diagram and its own task breakdown are kept together below so phase membership is unambiguous.

**Batching note**: 25 tasks total → packs into ~4 batches of ~6-7 tasks each at the standard ~7-task worker budget (e.g., Batch 1 = Phases 1-4 [13 tasks], Batch 2 = Phases 5-7 [8 tasks], Batch 3 = Phases 8-9 [4 tasks] — exact cut decided at Execute time, never splitting a phase). Sub-agent batching will be offered before Execute begins per the skill's Sub-Agent Delegation rule (>~8 tasks total).

---

### Phase 1: Git Repository & Scaffolding

```
T1 → T2 → T3
```

#### T1: Create `.gitignore`

**What**: Write `.gitignore` at repo root blocking secrets and Terraform artifacts.
**Where**: `.gitignore`
**Depends on**: None
**Reuses**: n/a (greenfield)
**Requirement**: GIT-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Contains: `.env`, `.env.*`, `*.pem`, `id_rsa*`, `id_ed25519*`, `*.tfstate`, `*.tfstate.backup`, `*.tfvars`, `.terraform/`, `credentials*.json`
- [ ] `git check-ignore -v terraform.tfvars` (after T2 creates the dir) will match once tested

**Tests**: none
**Gate**: Quick (n/a for this file — visual check only, no `.tf` yet)
**Commit**: bundled into T3's first commit (git doesn't exist until T2's `git init`; T3's "Done when" requires `git log --oneline` to show exactly one commit)
**Status**: ✅ Complete

---

#### T2: `git init` + directory scaffold + `terraform.tfvars.example`

**What**: Initialize the local git repo and create the empty directory skeleton (`infra/`, `infra/bootstrap/`, `infra/scripts/`) plus a committed `terraform.tfvars.example` documenting every variable an operator must fill in.
**Where**: `terraform.tfvars.example`
**Depends on**: T1
**Reuses**: n/a
**Requirement**: GIT-01, GIT-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `git init` run, no remote configured (`git remote -v` empty)
- [ ] `terraform.tfvars.example` lists `project_id`, `region`, `zone`, `ssh_username`, `ssh_public_key_path`, `billing_account_name`, `billing_alert_currency_code`, `billing_alert_amount`, `state_bucket_name` with placeholder (non-secret) example values and one-line comments
- [ ] Directory skeleton exists (`infra/`, `infra/bootstrap/`, `infra/scripts/`)

**Tests**: none
**Gate**: Quick (no `.tf` files yet — skip)
**Commit**: (no commit yet — bundled into T3's first commit)
**Status**: ✅ Complete

---

#### T3: `README.md` skeleton + first commit

**What**: Write a starter `README.md` (project title, PRD reference, two-root Terraform workflow overview placeholder, prerequisites section) and make the first git commit containing everything created so far.
**Where**: `README.md`
**Depends on**: T2
**Reuses**: `prd.md` (link/reference it, don't duplicate its content)
**Requirement**: GIT-03, GIT-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `README.md` exists with a title, one-paragraph project description referencing `prd.md`, and a "Prerequisites" section (terraform, gcloud CLI, gcloud auth login) — full teardown/deploy instructions land later in T24
- [ ] `git add` + first commit made
- [ ] `git log --oneline` shows exactly one commit
- [ ] `git ls-files` contains no file matched by `.gitignore` (none exist yet, but confirms the check works)

**Tests**: none
**Gate**: Build (`git status --porcelain` clean after commit, `git ls-files` sanity check)
**Commit**: `chore(repo): initialize git repository with gitignore and readme skeleton`
**Status**: ✅ Complete

---

### Phase 2: Bootstrap Root — State Bucket

```
T4 → T5 → T6 → T7
```

#### T4: `infra/bootstrap/main.tf` — provider block

**What**: Write the Terraform/provider configuration for the bootstrap root (required Terraform version, `google` provider, no backend block — this root always uses local state).
**Where**: `infra/bootstrap/main.tf`
**Depends on**: T2
**Reuses**: n/a
**Requirement**: INFRA-26 (bucket root separate from `infra/`)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `terraform { required_version, required_providers { google } }` block present
- [ ] `provider "google" { project = var.project_id, region = var.region }` present
- [ ] No `backend` block (bootstrap always stays local state)

**Tests**: none
**Gate**: Quick
**Commit**: `feat(bootstrap): add provider configuration for bootstrap root`
**Status**: ✅ Complete

---

#### T5: `infra/bootstrap/variables.tf`

**What**: Declare `project_id`, `region` (default `"us-east1"`), and `state_bucket_name` variables for the bootstrap root.
**Where**: `infra/bootstrap/variables.tf`
**Depends on**: T4
**Reuses**: n/a
**Requirement**: INFRA-23

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `project_id` (string, no default, `validation` block rejecting empty string)
- [ ] `region` (string, default `"us-east1"`)
- [ ] `state_bucket_name` (string, no default — must be globally unique, operator-supplied)

**Tests**: none
**Gate**: Quick
**Commit**: `feat(bootstrap): add bootstrap root variables`
**Status**: ✅ Complete

---

#### T6: `infra/bootstrap/storage.tf` — state bucket resource

**What**: Define the `google_storage_bucket` resource for Terraform remote state.
**Where**: `infra/bootstrap/storage.tf`
**Depends on**: T5
**Reuses**: n/a
**Requirement**: INFRA-23, INFRA-24, INFRA-25

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `location = "us-east1"` (single-region, not `"US"` multi-region — per design's Free Tier Validation)
- [ ] `uniform_bucket_level_access = true`
- [ ] `versioning { enabled = true }`
- [ ] No public IAM bindings added anywhere (default private — confirmed by absence of `google_storage_bucket_iam_member` with `allUsers`/`allAuthenticatedUsers`)
- [ ] No `prevent_destroy` lifecycle block by default (per design's stated trade-off — this resource is already outside `infra/`'s destroy blast radius by being in a separate root, so the extra lifecycle rule isn't needed; a one-line comment explains this choice)

**Tests**: none
**Gate**: Quick
**Commit**: `feat(bootstrap): add GCS bucket for terraform remote state`
**Status**: ✅ Complete

---

#### T7: `infra/bootstrap/outputs.tf`

**What**: Output the bucket name so the operator can copy it into `infra/`'s `backend "gcs"` block.
**Where**: `infra/bootstrap/outputs.tf`
**Depends on**: T6
**Reuses**: n/a
**Requirement**: INFRA-23

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `output "state_bucket_name" { value = google_storage_bucket.state.name }` present

**Tests**: none
**Gate**: Quick
**Commit**: `feat(bootstrap): output state bucket name`

---

### Phase 3: Bootstrap Root — Billing Budget

```
T8 → T9 → T10
```

#### T8: `infra/bootstrap/billing-variables.tf`

**What**: Declare `billing_account_name` (no default), `billing_alert_currency_code` (default `"USD"`), `billing_alert_amount` (default `"5"`).
**Where**: `infra/bootstrap/billing-variables.tf`
**Depends on**: T5
**Reuses**: [eatonc/actual-gcp `billing-variables.tf`](https://github.com/eatonc/actual-gcp/blob/main/billing-variables.tf) — same variable set and defaults
**Requirement**: BILL-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All three variables declared with the exact defaults above and a one-line `description` each

**Tests**: none
**Gate**: Quick
**Commit**: `feat(bootstrap): add billing alert variables`

---

#### T9: `infra/bootstrap/billing-data.tf`

**What**: Data source looking up the operator's existing billing account by display name.
**Where**: `infra/bootstrap/billing-data.tf`
**Depends on**: T8
**Reuses**: [eatonc/actual-gcp `billing-data.tf`](https://github.com/eatonc/actual-gcp/blob/main/billing-data.tf)
**Requirement**: BILL-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `data "google_billing_account" "billing_account" { display_name = var.billing_account_name }` present
- [ ] Also add `data "google_project" "project" {}` (needed by T10's budget filter for the project number) if not already declared elsewhere in this root

**Tests**: none
**Gate**: Quick
**Commit**: `feat(bootstrap): add billing account data source`

---

#### T10: `infra/bootstrap/billing.tf` — budget resource

**What**: Define `google_project_service` (enable `billingbudgets.googleapis.com`) and `google_billing_budget` with the four threshold rules.
**Where**: `infra/bootstrap/billing.tf`
**Depends on**: T9
**Reuses**: [eatonc/actual-gcp `billing.tf`](https://github.com/eatonc/actual-gcp/blob/main/billing.tf) — same resource shape, four threshold values
**Requirement**: BILL-01, BILL-03, BILL-04, BILL-06, BILL-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `google_project_service "billingbudgets" { service = "billingbudgets.googleapis.com" }`
- [ ] `google_billing_budget "budget"` with `budget_filter.projects = ["projects/${data.google_project.project.number}"]`, `amount.specified_amount { currency_code = var.billing_alert_currency_code, units = var.billing_alert_amount }`, four `threshold_rules` blocks at `0.5`, `0.9`, `1.0`, `1.5`
- [ ] `depends_on = [google_project_service.billingbudgets]`
- [ ] Resource lives in `infra/bootstrap/`, not `infra/` (confirmed by file path — satisfies BILL-07)
- [ ] No notification channel block added (relies on GCP default per spec AC5 — confirmed by its absence)

**Tests**: none
**Gate**: Quick (live verification — `gcloud billing budgets list` — deferred to operator per Test Coverage Matrix)
**Commit**: `feat(bootstrap): add billing budget alert with escalating thresholds`

---

### Phase 4: Main Root Skeleton

```
T11 → T12 → T13
```

#### T11: `infra/main.tf` — provider block + commented backend placeholder

**What**: Write the main root's Terraform/provider block, plus a commented-out `backend "gcs"` block with instructions to uncomment after bootstrap.
**Where**: `infra/main.tf`
**Depends on**: T2
**Reuses**: n/a
**Requirement**: INFRA-24 (backend migration path)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `terraform { required_version, required_providers { google } }` block
- [ ] `provider "google" { project = var.project_id, region = var.region, zone = var.zone }`
- [ ] Commented `# backend "gcs" { bucket = "<state_bucket_name from T7's output>" }` with a one-line comment pointing to the README's migration steps

**Tests**: none
**Gate**: Quick
**Commit**: `feat(infra): add main root provider configuration`

---

#### T12: `infra/variables.tf`

**What**: Declare all main-root variables with fail-fast validation.
**Where**: `infra/variables.tf`
**Depends on**: T11
**Reuses**: n/a
**Requirement**: INFRA-05, INFRA-06, INFRA-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `project_id` (string, no default, `validation { condition = length(var.project_id) > 0 }`)
- [ ] `region` (string, default `"us-east1"`)
- [ ] `zone` (string, default `"us-east1-b"`)
- [ ] `ssh_username` (string, no default, operator-supplied)
- [ ] `ssh_public_key_path` (string, no default, `validation { condition = fileexists(var.ssh_public_key_path) }` — makes AC5's "fail before creating any resource" concrete)

**Tests**: none
**Gate**: Quick
**Commit**: `feat(infra): add main root variables with validation`

---

#### T13: `infra/outputs.tf`

**What**: Output the instance's external IP.
**Where**: `infra/outputs.tf`
**Depends on**: T12
**Reuses**: n/a
**Requirement**: INFRA-01 (consumed by the Independent Test)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `output "instance_external_ip" { value = google_compute_instance.vm.network_interface[0].access_config[0].nat_ip }` present (resource itself created in T16 — this task only writes the output block; `terraform validate` will pass since Terraform resolves references lazily as long as the resource is declared somewhere in the root by the time of `plan`)

**Tests**: none
**Gate**: Quick (deferred — will fully validate once T16 lands; re-run Quick gate after T16)
**Commit**: `feat(infra): add instance external IP output`

---

### Phase 5: Network & Firewall

```
T14 → T15
```

#### T14: `infra/network.tf` — custom VPC + subnet

**What**: Define a dedicated custom-mode VPC and a single subnet in `us-east1`, never the `default` network.
**Where**: `infra/network.tf`
**Depends on**: T12
**Reuses**: n/a
**Requirement**: INFRA-02 (least-privilege foundation)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `google_compute_network "custom" { auto_create_subnetworks = false }`
- [ ] `google_compute_subnetwork "custom" { region = var.region, network = google_compute_network.custom.self_link, ip_cidr_range = "10.10.0.0/24" }`
- [ ] Resource references use `google_compute_network.custom.self_link` (not a literal `"default"` string) — per design's risk mitigation against accidental fallback to the default network

**Tests**: none
**Gate**: Quick
**Commit**: `feat(infra): add dedicated custom VPC and subnet`

---

#### T15: `infra/firewall.tf` — least-privilege ingress rules

**What**: Define exactly three `google_compute_firewall` rules (SSH, HTTP, HTTPS), scoped by target tag.
**Where**: `infra/firewall.tf`
**Depends on**: T14
**Reuses**: n/a
**Requirement**: INFRA-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `allow-ssh` (tcp:22), `allow-http` (tcp:80), `allow-https` (tcp:443), each with `source_ranges = ["0.0.0.0/0"]`, `target_tags = ["web-server"]`, `network = google_compute_network.custom.self_link`
- [ ] No other firewall rule exists in this file or elsewhere in `infra/`

**Tests**: none
**Gate**: Quick
**Commit**: `feat(infra): add least-privilege firewall rules for ssh/http/https`

---

### Phase 6: Compute Instance

```
T16
```

#### T16: `infra/compute.tf` — e2-micro instance

**What**: Define the `google_compute_instance` resource with every free-tier-pinned setting from the design.
**Where**: `infra/compute.tf`
**Depends on**: T13, T15
**Reuses**: `infra/scripts/startup.sh.tpl` (referenced via `templatefile()`, written in Phase 7 — this task references the path even before the file has all its final content, since Terraform only needs the file to exist at `plan` time)
**Requirement**: INFRA-01, INFRA-03, INFRA-04, INFRA-06, INFRA-07, INFRA-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `machine_type = "e2-micro"`, `zone = var.zone`
- [ ] `boot_disk.initialize_params { image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64", type = "pd-standard", size = 30 }`
- [ ] `network_interface { subnetwork = google_compute_subnetwork.custom.self_link, access_config { network_tier = "STANDARD" } }`
- [ ] `tags = ["web-server"]`
- [ ] `metadata = { ssh-keys = "${var.ssh_username}:${file(var.ssh_public_key_path)}", startup-script = templatefile("${path.module}/scripts/startup.sh.tpl", { ssh_username = var.ssh_username }) }`
- [ ] No Ops Agent install anywhere in this resource (confirmed by absence — no `google-cloud-ops-agent` reference)
- [ ] No `google_compute_resource_policy` snapshot schedule and no `google_compute_snapshot` resource anywhere in `infra/` (confirmed by absence)
- [ ] Boot disk keeps default `auto_delete = true` (not set to `false`)

**Tests**: none (Terraform resource layer — no unit-test framework applies; live shape verified by operator's `gcloud compute instances describe` per spec's Independent Test)
**Gate**: Quick now; Full deferred to operator (per Test Coverage Matrix — requires `gcloud auth login`)
**Commit**: `feat(infra): add free-tier-pinned e2-micro compute instance`

---

### Phase 7: Startup Script & PM2

```
T17 → T18 → T19 → T20 → T21 → T22
```

#### T17: Startup script — base packages + SSH hardening (idempotent)

**What**: Write the first idempotent stages of `infra/scripts/startup.sh.tpl`: package installs and `sshd_config` hardening.
**Where**: `infra/scripts/startup.sh.tpl`
**Depends on**: T16
**Reuses**: n/a
**Requirement**: INFRA-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `#!/bin/bash` + `set -euo pipefail`
- [ ] `apt-get update && apt-get install -y nginx fail2ban snapd nodejs npm` (naturally idempotent)
- [ ] `sshd_config` edit guarded by a marker comment (`# managed-by-terraform`) checked with `grep -q` before appending `PasswordAuthentication no`; `systemctl reload sshd` after
- [ ] `bash -n` (with Terraform interpolations stripped) parses clean

**Tests**: none
**Gate**: Shell
**Commit**: `feat(infra): add startup script base packages and ssh hardening`

---

#### T18: Startup script — Fail2ban jail

**What**: Append the Fail2ban `jail.local` stage to the startup script.
**Where**: `infra/scripts/startup.sh.tpl`
**Depends on**: T17
**Reuses**: n/a
**Requirement**: INFRA-09, INFRA-10, INFRA-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Writes `/etc/fail2ban/jail.local` with `[sshd]\nenabled = true\nmaxretry = 4\nbantime = 24h`, guarded by marker-comment idempotency check
- [ ] `systemctl restart fail2ban` after write, guarded so it only restarts when the file actually changed (avoid unnecessary restarts on reboot no-ops)
- [ ] `bash -n` parses clean

**Tests**: none
**Gate**: Shell
**Commit**: `feat(infra): add fail2ban sshd jail with 4-attempt 24h ban`

---

#### T19: Startup script — Nginx + Certbot IP certificate + HTTPS redirect

**What**: Append the Certbot install, base HTTP Nginx block, IP-certificate issuance, and HTTP→HTTPS redirect stages.
**Where**: `infra/scripts/startup.sh.tpl`
**Depends on**: T18
**Reuses**: n/a
**Requirement**: INFRA-12, INFRA-13, INFRA-14, INFRA-15, INFRA-16

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `snap install --classic certbot` + `ln -sf /snap/bin/certbot /usr/bin/certbot`, guarded by `command -v certbot` check
- [ ] Writes a base Nginx server block on port 80 with a `location /.well-known/acme-challenge/` path, `nginx -t && systemctl reload nginx`
- [ ] Runs `certbot` against the instance's own public IP to obtain a certificate; the exact flag set is written with a comment flagging that it must be checked against `certbot --help`/current Let's Encrypt IP-cert docs at implementation time (per design's flagged uncertainty — this is a newly-GA'd feature, not something to guess blindly)
- [ ] On non-zero exit from `certbot`, logs to `journalctl`/`logger` and leaves the HTTP-only block active rather than leaving Nginx in a broken state (AC5 of the HTTPS story)
- [ ] Confirms/enables Certbot's renewal timer (`systemctl list-timers | grep certbot` or equivalent) if available on the installed version
- [ ] Guarded with `certbot certificates | grep -q` to skip re-issuance on reboot re-runs
- [ ] `bash -n` parses clean

**Tests**: none (live cert issuance is inherently an operator-run, networked step — deferred per Test Coverage Matrix)
**Gate**: Shell now; Full deferred to operator
**Commit**: `feat(infra): add nginx + certbot ip-certificate https provisioning`

---

#### T20: Startup script — PM2 install + `pm2 startup`

**What**: Append Node/PM2 install and PM2's systemd-registration step.
**Where**: `infra/scripts/startup.sh.tpl`
**Depends on**: T19
**Reuses**: n/a
**Requirement**: INFRA-17, INFRA-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm install -g pm2`, guarded by `command -v pm2` check
- [ ] Runs `pm2 startup systemd -u ${ssh_username} --hp /home/${ssh_username}` and executes the printed command (via `su - ${ssh_username} -c "pm2 startup ..."` or equivalent pattern that correctly registers the unit for the non-root operator user), guarded so it only runs once (checks for the generated systemd unit file first)
- [ ] `bash -n` parses clean

**Tests**: none
**Gate**: Shell
**Commit**: `feat(infra): add pm2 install and systemd startup registration`

---

#### T21: `infra/scripts/ecosystem.config.js`

**What**: Write the PM2 process definition file for the future Next.js app.
**Where**: `infra/scripts/ecosystem.config.js`
**Depends on**: T20
**Reuses**: n/a
**Requirement**: INFRA-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Defines one PM2 app: `name: "nextjs-app"`, `script: "npm"`, `args: "start"`, `cwd: "/opt/app"`, `env: { PORT: 3000 }`, default PM2 restart-on-crash behavior (no `autorestart: false` override)

**Tests**: none
**Gate**: Quick (JS syntax — `node --check infra/scripts/ecosystem.config.js`)
**Commit**: `feat(infra): add pm2 ecosystem config for nextjs app`

---

#### T22: Startup script — copy ecosystem file + Nginx reverse proxy to `:3000`

**What**: Append the final stage: copy `ecosystem.config.js` to `/opt/app/`, and rewrite the Nginx HTTPS server block to reverse-proxy to `localhost:3000`.
**Where**: `infra/scripts/startup.sh.tpl`
**Depends on**: T21
**Reuses**: `infra/scripts/ecosystem.config.js` (T21)
**Requirement**: INFRA-20, INFRA-21, INFRA-22

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `mkdir -p /opt/app` + copies `ecosystem.config.js` into it, guarded so a future real deploy isn't clobbered on reboot (`[ -f /opt/app/ecosystem.config.js ] || cp ...`)
- [ ] Adds `location / { proxy_pass http://localhost:3000; ... }` to the HTTPS server block written in T19, `nginx -t && systemctl reload nginx`
- [ ] Script completes successfully even when PM2 has zero registered processes (no error exit if `/opt/app` is otherwise empty)
- [ ] `bash -n` parses clean — this closes out the full startup script

**Tests**: none
**Gate**: Shell (final full-script `bash -n` pass on the complete file)
**Commit**: `feat(infra): add nginx reverse proxy to nextjs app and pm2 app dir`

---

### Phase 8: Remote State Wiring & Documentation

```
T23 → T24
```

#### T23: `infra/backend.tf` — uncomment-ready GCS backend block

**What**: Move the commented `backend "gcs"` placeholder out of `main.tf` into its own dedicated file for clarity.
**Where**: `infra/backend.tf`
**Depends on**: T16, T7
**Reuses**: T7's `state_bucket_name` output, T11's placeholder content
**Requirement**: INFRA-24, INFRA-25, INFRA-26

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `infra/backend.tf` contains a commented `backend "gcs" { bucket = "<value from infra/bootstrap output>" }` block with an inline comment pointing to the README's migration steps
- [ ] The now-redundant commented block is removed from `infra/main.tf` (T11) so it lives in exactly one place

**Tests**: none
**Gate**: Quick
**Commit**: `feat(infra): add dedicated gcs backend file for state migration`

---

#### T24: README — deploy, teardown, free-tier summary

**What**: Complete `README.md` with: (1) the bootstrap → migrate-state procedure, (2) full deploy instructions for both roots in order, (3) full teardown instructions, (4) a free-tier compliance summary table mirroring design.md's "Free Tier Validation" section.
**Where**: `README.md`
**Depends on**: T23, T10
**Reuses**: design.md's Free Tier Validation table (summarized, not copy-pasted verbatim)
**Requirement**: INFRA-24, INFRA-25, INFRA-26, DESTROY-01, DESTROY-02, DESTROY-03, DESTROY-04, DESTROY-05, DESTROY-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] "Bootstrap" section documents: (1) `cd infra/bootstrap && terraform init && terraform apply`, (2) copy the output bucket name into `infra/backend.tf`, uncomment it, (3) `cd ../ && terraform init -migrate-state`
- [ ] "Deploy" section documents the full `infra/` `terraform init && terraform apply` flow after migration
- [ ] "Teardown" section: `terraform destroy` inside `infra/` removes instance/network/firewall; explicitly states the state bucket and billing budget are NOT touched (they live in `infra/bootstrap/`); documents the separate `terraform destroy` inside `infra/bootstrap/` as an explicit, optional, separate command
- [ ] States that no resource in `infra/` uses `prevent_destroy`, so the destroy always completes without a lifecycle block aborting it
- [ ] States that the billing budget keeps alerting even after `infra/` is destroyed, since it's free and lives in the persistent root
- [ ] Free-tier summary table: e2-micro region, disk type/size, network tier, no Ops Agent, no snapshots, bucket region, $5 budget thresholds — one line each

**Tests**: none
**Gate**: Build
**Commit**: `docs(infra): document full deploy and teardown procedure with free-tier summary`

---

### Phase 9: Final Validation

```
T25
```

#### T25: Final validation pass — both roots, full repo

**What**: Run the Build gate across the whole feature and make the final commit if anything drifted.
**Where**: `infra/` (validation only — no new files expected)
**Depends on**: T24
**Reuses**: n/a
**Requirement**: (validates all 43 requirement IDs structurally — live GCP verification remains the operator's responsibility per the Test Coverage Matrix)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `terraform fmt -check -recursive infra` passes with no diffs
- [ ] `terraform -chdir=infra validate` passes
- [ ] `terraform -chdir=infra/bootstrap validate` passes
- [ ] `bash -n` (interpolation-stripped) on `startup.sh.tpl` passes
- [ ] `git status --porcelain` clean after final commit
- [ ] `git ls-files` contains zero files matching any `.gitignore` pattern
- [ ] A short note is added to the chat/handoff (not a new file) telling the operator the exact next manual steps: `gcloud auth login`, `terraform -chdir=infra/bootstrap apply`, uncomment backend, `terraform -chdir=infra init -migrate-state`, `terraform -chdir=infra apply`, then run every spec story's "Independent Test"

**Tests**: none (this task's gate IS the test)
**Gate**: Build
**Commit**: `chore(infra): final validation pass`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9

Phase 1:  T1 ----→ T2 ----→ T3
Phase 2:  T4 ----→ T5 ----→ T6 ----→ T7
Phase 3:  T8 ----→ T9 ----→ T10
Phase 4:  T11 ---→ T12 ---→ T13
Phase 5:  T14 ---→ T15
Phase 6:  T16
Phase 7:  T17 ---→ T18 ---→ T19 ---→ T20 ---→ T21 ---→ T22
Phase 8:  T23 ---→ T24
Phase 9:  T25
```

Execution is strictly sequential - there is no intra-phase parallelism. Cross-phase dependencies (e.g., T4 depends on T2, T16 depends on T13 and T15) are enforced by phase ordering itself — a later phase never starts until every task in every earlier phase is done, so a cross-phase `Depends on` is automatically satisfied without needing its own diagram arrow.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Create `.gitignore` | 1 file | ✅ Granular |
| T2: git init + scaffold + tfvars.example | 1 concept (repo bootstrap) | ✅ Granular (cohesive one-time setup) |
| T3: README skeleton + first commit | 1 file + 1 commit | ✅ Granular |
| T4: bootstrap provider block | 1 file | ✅ Granular |
| T5: bootstrap variables | 1 file | ✅ Granular |
| T6: bootstrap storage resource | 1 file, 1 resource | ✅ Granular |
| T7: bootstrap outputs | 1 file | ✅ Granular |
| T8: billing variables | 1 file | ✅ Granular |
| T9: billing data source | 1 file | ✅ Granular |
| T10: billing budget resource | 1 file, 2 resources (tightly coupled: API-enable + budget) | ✅ Granular (cohesive pair) |
| T11: main provider block | 1 file | ✅ Granular |
| T12: main variables | 1 file | ✅ Granular |
| T13: main outputs | 1 file | ✅ Granular |
| T14: network + subnet | 1 file, 2 resources (VPC+subnet, inseparable) | ✅ Granular (cohesive pair) |
| T15: firewall rules | 1 file, 3 resources (same concern: ingress rules) | ✅ Granular (cohesive triplet) |
| T16: compute instance | 1 file, 1 resource | ✅ Granular |
| T17: startup script base+ssh | 1 file, 1 concern (bootstrap hardening) | ✅ Granular |
| T18: startup script fail2ban | 1 file, 1 concern | ✅ Granular |
| T19: startup script nginx+certbot | 1 file, 1 concern | ✅ Granular |
| T20: startup script pm2 | 1 file, 1 concern | ✅ Granular |
| T21: ecosystem.config.js | 1 file | ✅ Granular |
| T22: startup script proxy+copy | 1 file, 1 concern | ✅ Granular |
| T23: backend.tf | 1 file | ✅ Granular |
| T24: README deploy+teardown+free-tier | 1 file, 1 concern (operator-facing docs) | ✅ Granular |
| T25: final validation | validation only, no new files | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (Phase 1 start) | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T2 | Phase 2 starts after Phase 1 (cross-phase, satisfied by phase order) | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T6 | T6→T7 | ✅ Match |
| T8 | T5 | Phase 3 starts after Phase 2 (cross-phase, satisfied by phase order) | ✅ Match |
| T9 | T8 | T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | T2 | Phase 4 starts after Phase 1 (cross-phase, satisfied by phase order) | ✅ Match |
| T12 | T11 | T11→T12 | ✅ Match |
| T13 | T12 | T12→T13 | ✅ Match |
| T14 | T12 | Phase 5 starts after Phase 4 (cross-phase, satisfied by phase order) | ✅ Match |
| T15 | T14 | T14→T15 | ✅ Match |
| T16 | T13, T15 | Phase 6 starts after Phase 5 (cross-phase, satisfied by phase order) | ✅ Match |
| T17 | T16 | Phase 7 starts after Phase 6 (cross-phase, satisfied by phase order) | ✅ Match |
| T18 | T17 | T17→T18 | ✅ Match |
| T19 | T18 | T18→T19 | ✅ Match |
| T20 | T19 | T19→T20 | ✅ Match |
| T21 | T20 | T20→T21 | ✅ Match |
| T22 | T21 | T21→T22 | ✅ Match |
| T23 | T16, T7 | Phase 8 starts after Phase 7 (cross-phase, satisfied by phase order) | ✅ Match |
| T24 | T23, T10 | T23→T24 (T10 cross-phase, satisfied by phase order) | ✅ Match |
| T25 | T24 | Phase 9 starts after Phase 8 (cross-phase, satisfied by phase order) | ✅ Match |

No task depends on a task in a later phase. All good.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1-T3 | Config/docs (gitignore, tfvars example, README) | none | none | ✅ OK |
| T4-T13, T14-T16, T23 | Terraform config | static validation | none (Quick gate covers static validation directly, not a "test" per se — Terraform has no unit-test layer; `terraform validate`/`fmt` IS the static-validation gate itself) | ✅ OK — matrix's "static validation" row maps to the Quick/Full gate mechanism, not a `Tests: unit` field |
| T17-T20, T22 | Startup script (shell) | static (shell syntax) | none (Shell gate covers `bash -n`) | ✅ OK — matrix's shell-syntax row is satisfied by the Shell gate |
| T21 | Config file (JS) | none | none | ✅ OK |
| T24 | Docs | none | none | ✅ OK |
| T25 | none (validation only) | n/a | none | ✅ OK |

**Note on this feature's Tests field convention**: every code layer in this feature is either a config/IaC file (Coverage Expectation: static validation via the toolchain's own `validate`/`fmt`/`bash -n`, not a unit-test framework) or documentation, so every task correctly carries `Tests: none` — the matrix's "Required Test Type" for every row here is "static validation" or "manual/deferred," neither of which is a `unit`/`e2e`/`integration` value the co-location rule would require in a `Tests` field. The rigor instead lives in the `Gate` field (Quick/Shell/Build) and in each task's `Done when` checklist. No task defers a test to a later task — every "live" verification (real `apply`, real `gcloud`/`curl`/`ssh` checks) is explicitly assigned to the operator post-Execute, documented in T25's final handoff note, never silently skipped.
