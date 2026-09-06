# GCP Infrastructure Provisioning with Terraform Specification

## Problem Statement

The project needs a publicly reachable, hardened hosting environment for a Next.js (shadcn/ui) application, built entirely from code (Infrastructure as Code) instead of manual console clicks, so the provisioning is reproducible, reviewable, and satisfies the course's Eixo 1 (Cloud Infra) security baseline. Today there is no infrastructure, no version control, and no app deployed — this feature creates the infra foundation and starts the git repository so subsequent work (CI/CD, the app itself) has something to land on.

## Goals

- [ ] Terraform provisions a GCP free-tier `e2-micro` VM (Ubuntu 24.04 LTS, `us-east1-b`) reachable only on ports 22/80/443, with SSH key-only access.
- [ ] VM boots with Nginx + Certbot + Fail2ban configured to auto-harden itself (HTTPS via Let's Encrypt IP certificate, HTTP→HTTPS redirect, autorenewal, SSH brute-force protection: 4 attempts / 24h ban).
- [ ] VM is pre-wired (PM2 + Nginx reverse proxy) to serve a Next.js app on `localhost:3000` once deployed — deploying the app itself is out of scope for this feature.
- [ ] Local git repository is initialized with a `.gitignore` that blocks secrets (`.env`, SSH private keys, `*.tfvars`, `*.tfstate`, credentials) and a starter `README.md`.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Next.js app code / shadcn UI components | Belongs to Eixo 3 (Development), a separate feature; this feature only prepares infra to host it. |
| GitHub remote repo creation / push | User decided this feature stays local-only (`git init` + first commit); remote creation is a follow-up feature. |
| GitHub Actions CI/CD pipeline | Separate integration axis in the PRD; depends on the app existing first. |
| Qualys SSL Labs A-grade tuning / PQC cipher suite tuning | Depends on final Nginx TLS config once Certbot issues the cert; tracked as a follow-up validation step, not provisioned here. |
| GCP project creation itself | User confirmed the GCP project already exists; Terraform only consumes an existing `project_id`. |
| Domain name / DNS | PRD explicitly does not require a domain; IP-based Let's Encrypt cert is used instead. |
| Multi-VM / autoscaling / load balancer | Free-tier single-instance scope only. |
| Automated spend-capping / auto-shutdown on budget breach | `google_billing_budget` only alerts — GCP has no native "kill resources at $X" mechanism without extra Cloud Function/Pub/Sub plumbing; that automation is a follow-up, not this feature. |
| Custom budget notification channel (Slack, Pub/Sub, Cloud Function) | Default email-to-billing-admins is sufficient for a single-operator project; reference repo doesn't wire one either. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| OS image | Ubuntu 24.04 LTS | User choice; satisfies PRD's Ubuntu/Debian requirement with latest LTS. | y |
| GCS bucket purpose | Terraform remote state only | User choice; no app storage/backup use case exists yet. | y |
| Next.js process manager | PM2 running `next start`, PM2 startup hooked into systemd via `pm2 startup` | User choice (revised); PM2 gives process monitoring/auto-restart/log rotation out of the box without hand-writing a systemd unit, and still survives reboot via `pm2 startup` + `pm2 save`. | y |
| SSH key provisioning | Terraform injects an existing local public key via instance metadata (`ssh-keys`) | User choice; user manages their own keypair, Terraform never generates/stores private keys. | y |
| GCP project | Already exists; `project_id` passed as a Terraform variable | User choice; project creation is a manual console step per PRD's "student operates the console" requirement. | y |
| Region/zone | `us-east1-b` | User choice; one of the three zones where `e2-micro` is Always Free eligible. | y |
| Git scope | Local `git init` + `.gitignore` + first commit only; no GitHub remote yet | User choice; remote creation deferred to a later feature once repo name/visibility is confirmed. | y |
| Terraform state bootstrap | The state bucket is created in its own separate root, `infra/bootstrap/` (local state, never migrated); the main root `infra/` then configures `backend "gcs"` pointing at that bucket and runs `terraform init -migrate-state` | Chicken-and-egg: a GCS backend can't point at a bucket declared in the same state it would back. Splitting into two roots also directly serves the user's teardown requirement — `terraform destroy` in `infra/` can never touch a bucket that isn't part of `infra/`'s state, so the bucket survives a full project teardown without needing a `prevent_destroy` lifecycle rule (which would otherwise block the entire destroy plan). | y |
| Let's Encrypt IP certificate lifetime | **Resolved during Execute (T19)**, superseding the original "flagged uncertain" row: IP certificates require `--preferred-profile shortlived`, a **6-day lifetime** — confirmed against live sources (EFF blog and Let's Encrypt blog, both dated March 2026), not assumed. Certbot's default renewal timer (`certbot.timer`, twice-daily checks) is relied on to keep well ahead of the 6-day window; the timer is now load-bearing, not merely a nice-to-have. | Original assumption (CA-controlled, unverifiable) was correctly flagged rather than fabricated at Design time; live web search during implementation resolved it to a concrete, sourced value per the Knowledge Verification Chain. | y — resolved with sources |
| Firewall scope | Only `tcp:22`, `tcp:80`, `tcp:443` ingress from `0.0.0.0/0`; all other ingress denied via GCP default-deny + explicit allow rules | PRD mandates least-privilege — expose only what the app and SSH need. | y |
| Fail2ban jail | `sshd` jail: `maxretry=4`, `bantime=24h`, `findtime` default (10m) | Directly matches PRD's literal requirement ("tolerância de 4 erros e banimento por 24 horas"). | y |
| VM provisioning method | Startup script (`metadata.startup-script`, a cloud-init/shell script) run on first boot, idempotent on re-run | Keeps config in the same Terraform-managed codebase (no external config management tool needed for a single VM), and idempotency lets `terraform apply` be re-run safely. | y |
| Password authentication | Disabled for SSH (`PasswordAuthentication no` in `sshd_config`), enforced by the startup script | PRD explicit requirement: "desabilitada a autenticação por senha padrão". | y |
| Billing budget amount/thresholds | Variable defaults are `$5 USD`, alerts at 50/90/100/150% (from [eatonc/actual-gcp](https://github.com/eatonc/actual-gcp)); **the real deployment overrides this to `R$25 BRL`** via `infra/bootstrap/terraform.tfvars` (gitignored), since `google_billing_budget`'s `currency_code` must match the billing account's own currency — this account's is BRL, confirmed via `gcloud billing accounts describe`, and `USD` on a BRL account fails with a 400 error | User asked for a billing threshold; defaults taken from the reference repo; the currency/amount mismatch was discovered during the real `terraform apply` and resolved with the user (R$25 ≈ the original $5 tripwire's intent) | y |
| Budget notification channel | GCP default (billing account admins/users get automatic email) — no Pub/Sub topic or custom channel provisioned | Reference repo also doesn't wire a custom channel; a single-operator coursework project has no one else to notify, and the default channel already reaches the operator. | y |

**Open questions:** none — all resolved or logged above (the Let's Encrypt cert-lifetime item is logged as an explicit uncertainty, not a blocker, since Terraform/scripts never need to hardcode a lifetime value).

---

## User Stories

### P1: Provision a hardened, free-tier GCP compute instance via Terraform ⭐ MVP

**User Story**: As the student/operator, I want a single `terraform apply` to create a locked-down GCP VM so that I don't have to click through the console and risk misconfiguring security groups.

**Why P1**: Without the VM existing and network-hardened, nothing else (web server, SSL, app) can be built — this is the foundation the PRD's Eixo 1 grades directly.

**Acceptance Criteria**:

1. WHEN `terraform apply` runs with a valid `project_id`, `region` = `us-east1`, `zone` = `us-east1-b`, and an SSH public key path THEN the system SHALL create exactly one `google_compute_instance` of machine type `e2-micro` running Ubuntu 24.04 LTS. <!-- event-driven -->
2. The system SHALL define GCP firewall rules that allow ingress only on TCP ports 22, 80, and 443, with all other ports implicitly denied. <!-- ubiquitous -->
   > Extended for the app VM by `nextjs-secure-app` (AD-007): an `allow-iap-ssh` rule (`tcp:22` from `35.235.240.0/20`) is added for the keyless CI deploy path. Public `:22` (`allow-ssh`) stays open to `var.operator_ssh_cidrs` (default `0.0.0.0/0`) for the evaluation board — key-only + Fail2Ban as required here.
3. WHEN the instance boots THEN the system SHALL have SSH key-based login enabled via the public key injected through instance metadata, with `PasswordAuthentication no` set in `sshd_config`. <!-- event-driven -->
4. IF `terraform apply` is run a second time with no configuration changes THEN the system SHALL report zero resource changes (idempotent plan). <!-- unwanted-behavior -->
5. IF `project_id` or the SSH public key file path variable is missing or empty THEN Terraform SHALL fail validation (`terraform plan`/`apply`) with a descriptive error before attempting to create any resource. <!-- unwanted-behavior -->
6. The system SHALL set the instance's external IP `network_tier` to `STANDARD` (never the provider's `PREMIUM` default) — Standard Tier carries its own separate 200 GB/month/region free allowance (independent of the classic Always Free 1 GB Compute Engine egress, which is scoped to Premium Tier), making Standard Tier the safer, more generous choice for this workload. <!-- ubiquitous -->
7. The system SHALL NOT install or enable the Cloud Ops Agent (Monitoring/Logging agent) on the instance — observability stays local (`journalctl`/syslog) to avoid Ops Agent ingestion charges beyond the free allotment. <!-- ubiquitous -->
8. The system SHALL NOT attach any scheduled snapshot policy (`google_compute_resource_policy` of type snapshot-schedule) or automated backup to the boot disk, and boot disk auto-delete-on-instance-deletion SHALL remain enabled (`auto_delete = true`) — no snapshot storage is provisioned that could accrue Cloud Storage/snapshot charges beyond the Always Free disk allowance. <!-- ubiquitous -->
9. The system SHALL assign the instance an **ephemeral** external IP address (no `google_compute_address` reservation) — **superseded during real deployment**: a reserved static IP was tried first, then reverted once the operator adopted a "stop the VM when idle" usage pattern, since GCP bills a reserved IP whenever it isn't attached to a *running* instance, while an ephemeral IP is unconditionally free regardless of instance state. <!-- ubiquitous -->
10. The system SHALL enable Shielded VM on the instance (`enable_secure_boot = true`, `enable_vtpm = true`, `enable_integrity_monitoring = true`). <!-- ubiquitous -->

**Independent Test**: Run `terraform apply`, then `gcloud compute instances describe <name>` confirms machine type `e2-micro`, zone `us-east1-b`, image family `ubuntu-2404-lts-amd64`, `networkInterfaces[0].accessConfigs[0].networkTier = STANDARD`, `networkInterfaces[0].accessConfigs[0].natIP` is ephemeral (`gcloud compute addresses list` shows no reservation backing it), and `shieldedInstanceConfig` shows `enableSecureBoot: true`, `enableVtpm: true`, `enableIntegrityMonitoring: true`; `gcloud compute firewall-rules list` shows only 22/80/443 allowed; `ssh -i <key> <user>@<external-ip>` succeeds while `ssh` with a password prompt is rejected; `gcloud compute instances describe <name> --format="value(metadata)"` shows no Ops Agent install script, `systemctl status google-cloud-ops-agent` on the VM returns "not found", and `gcloud compute resource-policies list` returns empty (no snapshot schedule attached to the disk).

---

### P1: Harden SSH access with Fail2ban ⭐ MVP

**User Story**: As the operator, I want brute-force SSH attempts automatically banned so that the exposed port 22 doesn't become the weak link the PRD penalizes.

**Why P1**: PRD's security acceptance criteria explicitly requires Fail2ban with a 4-attempt / 24-hour-ban policy on port 22 — this is a mandatory grading item, not optional hardening.

**Acceptance Criteria**:

1. WHEN the VM's startup script completes THEN the system SHALL have Fail2ban installed and running with an `sshd` jail configured for `maxretry = 4` and `bantime = 24h`. <!-- event-driven -->
2. IF an IP address fails SSH authentication 4 times within the jail's `findtime` window THEN Fail2ban SHALL ban that IP from port 22 for 24 hours. <!-- unwanted-behavior -->
3. WHILE the startup script is re-run on an already-provisioned VM (e.g., after `terraform apply` with no instance replacement) the system SHALL leave the existing Fail2ban configuration unchanged and running (idempotent re-run, no service disruption). <!-- state-driven -->

**Independent Test**: SSH into the VM, run `sudo fail2ban-client status sshd` and confirm `maxretry: 4` and ban time `86400` seconds; simulate 4 failed local SSH logins from a test IP and confirm it appears in `fail2ban-client status sshd` banned list.

---

### P1: Serve HTTPS via Nginx + Let's Encrypt IP certificate ⭐ MVP

**User Story**: As the operator, I want the public IP to serve HTTPS with automatic HTTP→HTTPS redirect and automatic renewal so that the deployed app meets the PRD's encryption requirement without a domain name.

**Why P1**: PRD's Eixo 1 acceptance criteria are explicit: Certbot ≥5.4 issuing an IP-address certificate from Let's Encrypt, forced HTTP→HTTPS redirect, and autorenewal — all mandatory minimums.

**Acceptance Criteria**:

1. WHEN the VM's startup script completes THEN the system SHALL have Nginx and Certbot (version ≥ 5.4) installed. <!-- event-driven -->
2. WHEN Certbot runs against the instance's public IP address THEN the system SHALL obtain a valid Let's Encrypt SSL/TLS certificate bound to that IP (no domain name involved). <!-- event-driven -->
3. The system SHALL configure Nginx to redirect all HTTP (port 80) traffic to HTTPS (port 443). <!-- ubiquitous -->
4. WHERE Certbot's autorenewal mechanism (systemd timer or cron) is available on the installed Certbot version THEN the system SHALL enable it so the certificate renews without manual intervention. <!-- optional-feature -->
5. IF Certbot's certificate issuance fails (e.g., Let's Encrypt API unreachable, rate-limited) THEN the startup script SHALL log the failure to the system journal and leave Nginx serving plain HTTP on port 80 rather than leaving the web server in a broken/non-listening state. <!-- unwanted-behavior -->

**Independent Test**: `curl -I http://<external-ip>` returns a 301/308 redirect to `https://<external-ip>`; `curl -Ik https://<external-ip>` returns a valid TLS handshake issued by Let's Encrypt (`issuer: Let's Encrypt`); `sudo systemctl list-timers | grep certbot` (or `crontab -l`) shows a scheduled renewal.

---

### P2: Prepare the VM to host the Next.js application

**User Story**: As the operator, I want the VM already wired with PM2 and an Nginx reverse-proxy site so that deploying the Next.js build later is just "drop the build, `pm2 start`."

**Why P2**: Useful groundwork for the next feature (app deployment/CI-CD), but the VM is still fully compliant with Eixo 1's grading criteria without it — the app itself doesn't exist yet.

**Acceptance Criteria**:

1. The system SHALL install Node.js (LTS) and PM2 (`npm install -g pm2`) on the VM via the startup script. <!-- ubiquitous -->
2. The system SHALL run `pm2 startup` (registering PM2's generated systemd unit for the boot user) so that PM2 itself, and whatever it manages, restarts automatically on VM reboot. <!-- ubiquitous -->
3. The system SHALL provide a PM2 ecosystem file (e.g., `ecosystem.config.js`) pre-configured to run `next start` on port 3000 with PM2's default auto-restart-on-crash behavior. <!-- ubiquitous -->
4. The system SHALL configure an Nginx server block that reverse-proxies HTTPS traffic to `http://localhost:3000`. <!-- ubiquitous -->
5. WHILE no application build has been deployed yet (PM2 has no process registered for the app) the system SHALL leave PM2 running with zero managed processes, without crashing Nginx or blocking the VM's other services. <!-- state-driven -->
6. WHEN `pm2 start ecosystem.config.js && pm2 save` is run after a future app deploy THEN the system SHALL persist that process list so a subsequent reboot resurrects it via `pm2 resurrect` (triggered by the `pm2 startup` systemd unit). <!-- event-driven -->

**Independent Test**: `pm2 list` shows PM2 running (empty process table pre-deploy); `systemctl status pm2-<user>` (the unit generated by `pm2 startup`) is active; `nginx -T` shows a `proxy_pass http://localhost:3000` block on the HTTPS server; the VM's Nginx/Fail2ban/SSH services stay healthy (`systemctl is-active`) even though PM2 has nothing registered yet; after `pm2 save` + VM reboot, `pm2 list` shows the app process resurrected automatically.

---

### P3: Store Terraform state remotely in a GCS bucket

**User Story**: As the operator, I want Terraform state stored in Cloud Storage instead of a local file so that the state survives a wiped laptop and supports future collaboration.

**Why P3**: Nice-to-have robustness; a local `terraform.tfstate` works fine for a single-operator coursework project, so this isn't required for Eixo 1 grading.

**Acceptance Criteria**:

1. WHEN `terraform apply` is run inside a separate root, `infra/bootstrap/` (its own local state, never migrated) THEN the system SHALL create one `google_storage_bucket` with uniform bucket-level access enabled and versioning enabled. <!-- event-driven -->
2. WHEN a `backend "gcs"` block in the main root (`infra/`) references that bucket and `terraform init -migrate-state` is run THEN the system SHALL migrate `infra/`'s existing local state into the bucket with no resource drift on the next `terraform plan`. <!-- event-driven -->
3. The system SHALL NOT make the state bucket publicly readable (default private IAM, no `allUsers`/`allAuthenticatedUsers` bindings). <!-- ubiquitous -->
4. The system SHALL keep the bucket's resource definition in `infra/bootstrap/` — a Terraform root entirely separate from `infra/` — so that the bucket is never a resource inside `infra/`'s own state and is therefore outside the blast radius of any `terraform destroy` run against `infra/`. <!-- ubiquitous -->

**Independent Test**: After migration, `terraform plan` in `infra/` shows no changes; `gsutil iam get gs://<bucket>` shows no public bindings; local `terraform.tfstate` in `infra/` is gone/empty and `.terraform/terraform.tfstate` points at the `gcs` backend; `terraform state list` run inside `infra/` does not list the bucket (it only exists in `infra/bootstrap/`'s own state).

---

### P1: Clean full teardown via `terraform destroy` ⭐ MVP

**User Story**: As the operator, I want a single `terraform destroy` to tear the whole project's billable footprint down so that I can fully shut off spending risk (end of course, between grading rounds, etc.) without hunting through the GCP console for leftovers — while still being able to keep the state bucket around since it's free.

**Why P1**: Directly requested by the user as a cost-control requirement, symmetric with every other free-tier guarantee in this spec — provisioning cleanly is only half the story if teardown leaves orphaned billable resources behind.

**Acceptance Criteria**:

1. WHEN `terraform destroy` is run inside `infra/` (the main root) THEN the system SHALL remove the compute instance, its boot disk, all three firewall rules, and the custom VPC and subnet — every billable resource declared in `infra/`'s state. <!-- event-driven -->
2. The system SHALL NOT declare the GCS state bucket (P3) or the billing budget as resources inside `infra/`'s state — both live only in the separate `infra/bootstrap/` root — so `terraform destroy` run against `infra/` SHALL NOT plan to destroy, prompt about, or otherwise touch either of them. <!-- ubiquitous -->
3. IF the operator also wants to remove the state bucket and/or the billing budget THEN they SHALL run a second, separate `terraform destroy` inside `infra/bootstrap/` — a deliberate extra step, never a side-effect of destroying `infra/`. <!-- unwanted-behavior -->
4. The system SHALL NOT set `lifecycle { prevent_destroy = true }` on any resource inside `infra/`'s state, since that setting aborts Terraform's entire destroy plan (not just that one resource) — nothing in `infra/` may block a full teardown. <!-- ubiquitous -->
5. WHEN `terraform destroy` on `infra/` completes THEN the system SHALL leave the GCP project itself intact (the project is never destroyed by this feature — only its resources), matching the assumption that the project already existed before this feature ran and continues to exist after. <!-- event-driven -->
6. WHILE the billing budget (a zero-cost resource) remains active in `infra/bootstrap/` after `infra/` has been destroyed the system SHALL continue monitoring the project's spend at the same $5/50/90/100/150% thresholds — surviving teardown is intentional, so any billable resource created later (accidentally, via console, or by a future `terraform apply`) is still caught. <!-- state-driven -->

**Independent Test**: `terraform destroy` inside `infra/` (auto-approved or confirmed), then `gcloud compute instances list`, `gcloud compute firewall-rules list`, and `gcloud compute networks list` all return empty for this project; `gcloud storage buckets list` still shows the state bucket AND `gcloud billing budgets list` still shows the budget (both untouched, since both live in `infra/bootstrap/`'s separate state); `gcloud projects describe <project_id>` still succeeds (project not deleted).

---

### P1: Billing budget as a cost safety net ⭐ MVP

**User Story**: As the operator, I want a billing budget with alert thresholds so that if the free-tier design ever drifts (quota change, a resource left non-conformant, GCP terms shift) I get notified before a real bill accumulates, instead of finding out at the end of the month.

**Why P1**: Directly addresses the user's explicit requirement to keep this "always free tier" — a budget alert is the only mechanism GCP offers to detect a cost leak proactively; without it, an unnoticed misconfiguration goes undetected until billing closes. Pattern taken from [eatonc/actual-gcp](https://github.com/eatonc/actual-gcp/blob/main/billing.tf), a purpose-built free-tier-GCP-via-Terraform reference repo. The budget itself is free, so the user asked for it to keep running even across a full `infra/` teardown — it lives in `infra/bootstrap/` alongside the state bucket, not in `infra/`.

**Acceptance Criteria**:

1. The system SHALL create a `google_billing_budget` scoped to this project only (`budget_filter.projects = ["projects/<project_number>"]`), reading the billing account via a `google_billing_account` data source looked up by `billing_account_name`. <!-- ubiquitous -->
2. The system SHALL set the budget's `amount.specified_amount` to a configurable `billing_alert_amount` variable (default `"5"`) in a configurable `billing_alert_currency_code` variable (default `"USD"`) — five dollars is a low tripwire relative to any real Compute Engine bill, chosen so a free-tier leak is caught while it's still cents, not dollars. <!-- ubiquitous -->
3. The system SHALL define `threshold_rules` at 50%, 90%, 100%, and 150% of the budget amount, matching the reference repo's pattern of escalating alerts as spend approaches and then exceeds the tripwire. <!-- ubiquitous -->
4. The system SHALL enable the `billingbudgets.googleapis.com` API (via `google_project_service`) before creating the budget resource (`depends_on`). <!-- ubiquitous -->
5. WHERE no explicit notification channel is configured THEN the system SHALL rely on GCP's default budget behavior of emailing the billing account's Billing Account Administrators/Users at each threshold — this feature does not provision a Pub/Sub topic or a custom notification channel (out of scope; the default channel is sufficient for a single-operator project). <!-- optional-feature -->
6. IF `billing_account_name` does not match any billing account visible to the authenticated operator THEN `terraform plan`/`apply` SHALL fail with the provider's "billing account not found" error before creating any other resource that depends on it. <!-- unwanted-behavior -->
7. The system SHALL declare the budget resource in `infra/bootstrap/` (the same persistent root as the P3 state bucket), never in `infra/`, so it is unaffected by `terraform destroy` run against `infra/` (per DESTROY story AC2/AC6) and can only be removed by a deliberate `terraform destroy` inside `infra/bootstrap/` itself. <!-- ubiquitous -->

**Independent Test**: `terraform apply`, then `gcloud billing budgets list --billing-account=<id>` shows one budget named "Monthly Budget Alert" (or equivalent) with amount `$5 USD` and four threshold rules (0.5, 0.9, 1.0, 1.5); manually triggering `gcloud billing budgets update` with a lower amount and checking the console confirms alert emails fire at each crossed threshold (GCP's simulated/historical spend view can be used without waiting a full month).

**Note — this is detection, not prevention**: `google_billing_budget` sends alerts; it does not stop resource creation or cap spend by itself. Combined with every other AC in this spec (free-tier-pinned machine/disk/network/storage settings), the budget is the backstop that catches whatever those pinned settings miss — not a substitute for them.

---

### P1: Initialize the local git repository ⭐ MVP

**User Story**: As the operator, I want the project under local git version control with secrets excluded from day one so that no credential is ever accidentally committed.

**Why P1**: PRD's Eixo 2 acceptance criteria makes correct `.gitignore` usage and zero secret leakage a hard, immediately-penalized requirement — this must exist before any Terraform variable file or SSH key touches disk.

**Acceptance Criteria**:

1. WHEN `git init` is run in the project root THEN the system SHALL create a `.git` directory and the repository SHALL have no remote configured yet. <!-- event-driven -->
2. The system SHALL create a `.gitignore` that excludes at minimum: `.env`, `.env.*`, `*.pem`, `id_rsa*`, `id_ed25519*`, `*.tfstate`, `*.tfstate.backup`, `*.tfvars`, `.terraform/`, and `credentials*.json`. <!-- ubiquitous -->
3. WHEN the first commit is made THEN the system SHALL include `prd.md`, the `.specs/` directory, the Terraform configuration files, and a starter `README.md` — and SHALL NOT include any file matched by `.gitignore`. <!-- event-driven -->
4. IF a file matching a `.gitignore` pattern is staged with `git add` THEN `git status` SHALL still show it as ignored/untracked (never silently force-added by any script in this feature). <!-- unwanted-behavior -->

**Independent Test**: After running the setup, `git log --oneline` shows exactly one commit; `git ls-files` contains no `.env`, no `*.tfvars`, no private key file; `git check-ignore -v terraform.tfvars` confirms the ignore rule matches.

---

## Edge Cases

- IF the chosen zone (`us-east1-b`) has no `e2-micro` capacity available THEN `terraform apply` SHALL fail with GCP's capacity error and SHALL NOT leave a partially-created instance (Terraform's default create-or-fail semantics).
- IF the user's SSH public key file does not exist at the configured path THEN Terraform SHALL fail at plan time with a file-not-found error, before any GCP API call is made.
- IF Certbot's Let's Encrypt IP-certificate feature is unavailable in a given Let's Encrypt rollout window THEN the startup script SHALL fall back to leaving Nginx on HTTP-only (per the P1 SSL story's AC5) rather than looping/retrying indefinitely.
- WHEN the startup script is re-executed after a VM reboot (GCP re-runs `startup-script` on every boot by default) THEN all `apt install`, `systemctl enable`, and config-writing steps SHALL be idempotent (safe to run repeatedly, no duplicate firewall/jail entries, no duplicate Nginx server blocks).
- IF the operator wants to remove the state bucket too (not just `infra/`'s resources) THEN they run `terraform destroy` a second time inside `infra/bootstrap/` — a distinct, deliberate command against a distinct state, never triggered by destroying `infra/`.
- IF `terraform destroy` is run in `infra/` while the billing budget (BILL story) is mid-alert-cycle THEN the budget resource is deleted along with everything else — no orphaned budget references a project with zero remaining billable resources.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| INFRA-01 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-02 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-03 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-04 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-05 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-06 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-07 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-08 | P1: Provision hardened GCP compute instance | Design | Implementing |
| INFRA-09 | P1: Harden SSH access with Fail2ban | Design | Implementing |
| INFRA-10 | P1: Harden SSH access with Fail2ban | Design | Implementing |
| INFRA-11 | P1: Harden SSH access with Fail2ban | Design | Implementing |
| INFRA-12 | P1: Serve HTTPS via Nginx + Let's Encrypt | Design | Implementing |
| INFRA-13 | P1: Serve HTTPS via Nginx + Let's Encrypt | Design | Implementing |
| INFRA-14 | P1: Serve HTTPS via Nginx + Let's Encrypt | Design | Implementing |
| INFRA-15 | P1: Serve HTTPS via Nginx + Let's Encrypt | Design | Implementing |
| INFRA-16 | P1: Serve HTTPS via Nginx + Let's Encrypt | Design | Implementing |
| INFRA-17 | P2: Prepare VM for Next.js hosting | Design | Implementing |
| INFRA-18 | P2: Prepare VM for Next.js hosting | Design | Implementing |
| INFRA-19 | P2: Prepare VM for Next.js hosting | Design | Implementing |
| INFRA-20 | P2: Prepare VM for Next.js hosting | Design | Implementing |
| INFRA-21 | P2: Prepare VM for Next.js hosting | Design | Implementing |
| INFRA-22 | P2: Prepare VM for Next.js hosting | Design | Implementing |
| INFRA-23 | P3: Remote Terraform state in GCS | Design | Implementing |
| INFRA-24 | P3: Remote Terraform state in GCS | Design | Done |
| INFRA-25 | P3: Remote Terraform state in GCS | Design | Done |
| INFRA-26 | P3: Remote Terraform state in GCS | Design | Done |
| INFRA-27 | P1: Provision hardened GCP compute instance | Done | Done |
| INFRA-28 | P1: Provision hardened GCP compute instance | Done | Done |
| DESTROY-01 | P1: Clean full teardown via terraform destroy | Design | Done |
| DESTROY-02 | P1: Clean full teardown via terraform destroy | Design | Done |
| DESTROY-03 | P1: Clean full teardown via terraform destroy | Design | Done |
| DESTROY-04 | P1: Clean full teardown via terraform destroy | Design | Done |
| DESTROY-05 | P1: Clean full teardown via terraform destroy | Design | Done |
| DESTROY-06 | P1: Clean full teardown via terraform destroy | Design | Done |
| BILL-01 | P1: Billing budget as a cost safety net | Design | Implementing |
| BILL-02 | P1: Billing budget as a cost safety net | Design | Implementing |
| BILL-03 | P1: Billing budget as a cost safety net | Design | Implementing |
| BILL-04 | P1: Billing budget as a cost safety net | Design | Implementing |
| BILL-05 | P1: Billing budget as a cost safety net | Design | Pending |
| BILL-06 | P1: Billing budget as a cost safety net | Design | Implementing |
| BILL-07 | P1: Billing budget as a cost safety net | Design | Done |
| GIT-01 | P1: Initialize local git repository | Design | Implementing |
| GIT-02 | P1: Initialize local git repository | Design | Implementing |
| GIT-03 | P1: Initialize local git repository | Design | Implementing |
| GIT-04 | P1: Initialize local git repository | Design | Implementing |

**Coverage:** 45 total, 25 mapped to tasks (T1-T25), 2 unmapped ⚠️ (INFRA-27/28 — static IP + Shielded VM, added post-Execute; implemented directly against the real deployment, no formal task entry)

---

## Success Criteria

- [ ] `terraform apply` from a clean checkout provisions the VM, firewall, and (if P3 included) state bucket with zero manual console steps.
- [ ] Public IP serves HTTPS with a valid Let's Encrypt certificate and redirects all HTTP traffic to HTTPS.
- [ ] `sudo fail2ban-client status sshd` confirms `maxretry: 4`, `bantime: 86400`.
- [ ] SSH password authentication is confirmed disabled (`ssh -o PubkeyAuthentication=no` is rejected).
- [ ] `git log` shows an initial commit containing no file matched by `.gitignore`.
- [ ] Instance's external IP `networkTier` is confirmed `STANDARD`, no Ops Agent is running on the VM, and no scheduled snapshot/backup policy is attached to the boot disk.
- [ ] `gcloud billing budgets list` shows a $5 USD budget scoped to this project with alert thresholds at 50/90/100/150%.
- [ ] `terraform destroy` inside `infra/` removes the instance, network, and firewall rules, leaving the GCP project itself intact and, in `infra/bootstrap/`, both the state bucket and the still-active billing budget untouched.
