# Validation Report — gcp-infra-terraform

**Verifier**: independent (did not author any of the 25 tasks / T1-T25)
**Scope**: full feature, all 43 requirement IDs (INFRA-01..26, BILL-01..07, GIT-01..04, DESTROY-01..06)
**Date**: 2026-09-05
**Domain**: Infrastructure-as-Code (Terraform + shell) — no unit-test suite; verification is static (grep/read) + toolchain gates (`fmt`, `validate`, `bash -n`), per the adapted mandate for this feature.

**Result**: PASS

## Verdict: **PASS**

All 43 requirement IDs trace to concrete `file:line` evidence in the actual `infra/`, `infra/bootstrap/`, or `README.md` content. All structural "no-X-exists" claims were confirmed by grepping the real repository state, not by trusting comments. All re-run gates exit 0. `git status` is clean and no gitignored artifact is tracked.

---

## 1. Spec-Anchored Requirement Traceability (evidence-or-zero)

| Req ID | Story | Evidence (`file:line`) | Result |
|---|---|---|---|
| INFRA-01 | e2-micro / Ubuntu 24.04 instance | `infra/compute.tf:6-13` — `machine_type = "e2-micro"`, `zone = var.zone`, `image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"` | ✅ |
| INFRA-02 | Firewall ingress only 22/80/443 | `infra/firewall.tf:4-38` — three `google_compute_firewall` resources, ports `["22"]`, `["80"]`, `["443"]` only; custom VPC has no implicit-allow (`infra/network.tf:4-7`) | ✅ |
| INFRA-03 | SSH key-based login, `PasswordAuthentication no` | `infra/compute.tf:31` (`ssh-keys` metadata) + `infra/scripts/startup.sh.tpl:14-24` (writes `PasswordAuthentication no`, `systemctl reload sshd`) | ✅ |
| INFRA-04 | Idempotent `terraform apply` (zero-diff on 2nd run) | Declarative resources only, no `null_resource`/provisioners in `infra/*.tf`; startup script is metadata (doesn't force replace) — `infra/compute.tf:30-35` | ✅ |
| INFRA-05 | Fail on missing/empty `project_id` or SSH key path | `infra/variables.tf:5-8` (`length(var.project_id) > 0`) and `:32-35` (`fileexists(var.ssh_public_key_path)`) | ✅ |
| INFRA-06 | `network_tier = "STANDARD"` | `infra/compute.tf:26` | ✅ |
| INFRA-07 | No Ops Agent | Confirmed absent — see Structural Check §2 below; no `google_project_service` for monitoring/logging in any `.tf`, no `google-cloud-ops-agent` in `infra/scripts/startup.sh.tpl` | ✅ |
| INFRA-08 | No snapshot policy, `auto_delete` stays default true | `infra/compute.tf:17` (comment: auto_delete left implicit/default true); confirmed no `google_compute_resource_policy`/`google_compute_snapshot` resource anywhere — Structural Check §4 | ✅ |
| INFRA-09 | Fail2ban installed + `sshd` jail `maxretry=4`/`bantime=24h` | `infra/scripts/startup.sh.tpl:12` (apt install fail2ban) + `:33-39` (`maxretry = 4`, `bantime = 24h`) | ✅ |
| INFRA-10 | 4 failed attempts → 24h ban | Same jail config, `infra/scripts/startup.sh.tpl:36-38` | ✅ |
| INFRA-11 | Idempotent re-run of Fail2ban stage | `infra/scripts/startup.sh.tpl:28-45` — marker-based guard (`JAIL_MARKER`) + before/after hash compare, only restarts if changed | ✅ |
| INFRA-12 | Nginx + Certbot ≥5.4 installed | `infra/scripts/startup.sh.tpl:12` (nginx via apt) + `:47-51` (certbot via snap, `--ip-address` flag documented as shipped in Certbot 5.3+, comment cites live source) | ✅ |
| INFRA-13 | Certbot obtains IP-address cert | `infra/scripts/startup.sh.tpl:103-124` — `certbot certonly --ip-address "$PUBLIC_IP" --preferred-profile shortlived` | ✅ |
| INFRA-14 | HTTP→HTTPS redirect | `infra/scripts/startup.sh.tpl:151-168` — `return 301 https://$host$request_uri;` | ✅ |
| INFRA-15 | Autorenewal enabled | `infra/scripts/startup.sh.tpl:174-179` — enables `snap.certbot.renew.timer` if present | ✅ |
| INFRA-16 | Cert failure → log + leave HTTP-only, no broken state | `infra/scripts/startup.sh.tpl:118-121` (`logger` on failure) + Stage 7 guarded by `[ "$CERT_OBTAINED" = true ]` so HTTP site (Stage 5) is untouched on failure | ✅ |
| INFRA-17 | Node.js LTS + PM2 installed | `infra/scripts/startup.sh.tpl:12` (nodejs/npm apt) + `:182-184` (`npm install -g pm2`) | ✅ |
| INFRA-18 | `pm2 startup` registered for boot user | `infra/scripts/startup.sh.tpl:186-192` — `pm2 startup systemd -u ${ssh_username}`, guarded by unit-file existence check | ✅ |
| INFRA-19 | `ecosystem.config.js` running `next start`/PORT 3000 with auto-restart | `infra/scripts/ecosystem.config.js:4-16` and identical inline copy `infra/scripts/startup.sh.tpl:201-215` (PM2 default `autorestart` applies, no override) | ✅ |
| INFRA-20 | Nginx reverse-proxies HTTPS → `localhost:3000` | `infra/scripts/startup.sh.tpl:218-240` — `proxy_pass http://localhost:3000;` inside the 443 server block | ✅ |
| INFRA-21 | PM2 runs with zero processes pre-deploy without crashing other services | Stage 9/10 (`infra/scripts/startup.sh.tpl:181-216`) only install/register PM2 and write the ecosystem file; nothing calls `pm2 start`, so PM2 daemon runs empty and Nginx/Fail2ban/SSH stages are independent, unguarded by PM2 state | ✅ |
| INFRA-22 | `pm2 save` + reboot resurrects via `pm2 startup` unit | `infra/scripts/startup.sh.tpl:186-192` (systemd unit registered by `pm2 startup`, which invokes `pm2 resurrect` on boot per PM2's own generated unit — Terraform/script side only needs the unit registered, confirmed present) | ✅ |
| INFRA-23 | Bootstrap root creates bucket w/ uniform access + versioning | `infra/bootstrap/storage.tf:7-17` — `uniform_bucket_level_access = true`, `versioning { enabled = true }` | ✅ |
| INFRA-24 | `backend "gcs"` + `terraform init -migrate-state` documented | `infra/backend.tf:1-10` (commented block) + `README.md:38-46` (migrate-state steps) | ✅ |
| INFRA-25 | Bucket never publicly readable | `infra/bootstrap/storage.tf:7-17` — no `google_storage_bucket_iam_*` resource anywhere granting `allUsers`/`allAuthenticatedUsers` (grep confirmed, none found) | ✅ |
| INFRA-26 | Bucket resource lives only in `infra/bootstrap/` | Structural Check §5 — `google_storage_bucket` found only in `infra/bootstrap/storage.tf` and `infra/bootstrap/outputs.tf` (output reference, not a second resource) | ✅ |
| DESTROY-01 | `terraform destroy` in `infra/` removes instance/disk/firewalls/VPC/subnet | All 6 billable resources (`google_compute_instance`, 3×`google_compute_firewall`, `google_compute_network`, `google_compute_subnetwork`) declared only in `infra/*.tf`, no `prevent_destroy` — Structural Check §1 | ✅ |
| DESTROY-02 | Bucket + budget not in `infra/`'s state | Structural Check §5, §6 — both resource types absent from every `infra/*.tf` file | ✅ |
| DESTROY-03 | Bucket/budget removal requires separate `infra/bootstrap` destroy | `README.md:90-100` — documents this as "a deliberate extra step, never a side effect" | ✅ |
| DESTROY-04 | No `prevent_destroy` anywhere in `infra/` | Structural Check §1 — zero literal occurrences (only an explanatory comment in `infra/bootstrap/storage.tf:1-6`, itself outside `infra/`) | ✅ |
| DESTROY-05 | Project itself survives `infra/` destroy | No `google_project`/project-management resource declared anywhere under `infra/` (grep confirmed only `data "google_project"` read-only lookup in `infra/bootstrap/billing-data.tf:5-7`) | ✅ |
| DESTROY-06 | Budget keeps monitoring after `infra/` destroy | `README.md:84-88` — explicit statement that budget "is designed to keep alerting... even after `infra/` is fully destroyed" | ✅ |
| BILL-01 | `google_billing_budget` scoped to project via `google_billing_account` data source | `infra/bootstrap/billing.tf:10-16` + `infra/bootstrap/billing-data.tf:1-7` | ✅ |
| BILL-02 | `amount.specified_amount` = configurable var, default "5"/"USD" | `infra/bootstrap/billing.tf:18-23` + `infra/bootstrap/billing-variables.tf:6-16` (defaults `"USD"`/`"5"`) | ✅ |
| BILL-03 | `threshold_rules` at 50/90/100/150% | `infra/bootstrap/billing.tf:25-39` — `0.5, 0.9, 1.0, 1.5` | ✅ |
| BILL-04 | `billingbudgets.googleapis.com` enabled via `depends_on` | `infra/bootstrap/billing.tf:1-4` (`google_project_service`) + `:41` (`depends_on = [google_project_service.billingbudgets]`) | ✅ |
| BILL-05 | Default GCP email notification (no custom channel) | `infra/bootstrap/billing.tf:6-9` comment + no `google_monitoring_notification_channel`/Pub/Sub resource anywhere in repo (grep confirmed none) | ✅ |
| BILL-06 | Invalid `billing_account_name` fails plan before other resources | Structural: `data "google_billing_account"` (`infra/bootstrap/billing-data.tf:1-3`) is a data source consumed by `billing.tf:11`; Terraform's own read-time failure on an unmatched data source is provider-level behavior, correctly relied upon rather than re-implemented — no static file evidence beyond the data-source wiring itself | ✅ (data-source design confirmed; live failure behavior is provider-native, untestable offline) |
| BILL-07 | Budget declared only in `infra/bootstrap/`, never `infra/` | Structural Check §6 — `google_billing_budget` found only in `infra/bootstrap/billing.tf` | ✅ |
| GIT-01 | `git init`, no remote | `git remote -v` returns empty (confirmed below); `.git` exists at repo root | ✅ |
| GIT-02 | `.gitignore` excludes secrets/state/tfvars | `.gitignore:1-13` — `.env`, `.env.*`, `*.pem`, `id_rsa*`, `id_ed25519*`, `credentials*.json`, `*.tfstate`, `*.tfstate.backup`, `*.tfvars`, `.terraform/` (all 9+ patterns from spec AC2 present) | ✅ |
| GIT-03 | First commit includes prd.md, `.specs/`, TF files, README; excludes ignored files | `git ls-files` output (below) includes `prd.md`, `.specs/features/...`, all `infra/*.tf`, `README.md`; no `.tfvars`/`.tfstate`/key file tracked | ✅ |
| GIT-04 | Ignored file staged still shows as ignored, never force-added | No script in repo calls `git add -f`; `.gitignore` patterns confirmed to match `terraform.tfvars` (only `terraform.tfvars.example` is tracked, per `git ls-files`) | ✅ |

**Coverage: 43/43 requirement IDs traced to file:line evidence. 0 unmapped.**

---

## 2. Structural Checks (adapted discrimination sensor for IaC — no test suite to mutate)

Since there is no unit-test suite, the "sensor" here is direct verification that the repository's actual file contents prove each safety/scope claim, rather than trusting a comment that asserts it.

| # | Claim | Command | Result |
|---|---|---|---|
| 1 | No `lifecycle { prevent_destroy = true }` anywhere in `infra/` | `grep -rn "prevent_destroy" infra --include="*.tf"` | Only match is an explanatory **comment** in `infra/bootstrap/storage.tf:1` ("No lifecycle.prevent_destroy here..."); zero actual `lifecycle` blocks anywhere. ✅ |
| 2 | `network_tier = "STANDARD"` actually set (not left at PREMIUM default) | `grep -n "network_tier" infra/compute.tf` | `infra/compute.tf:26: network_tier = "STANDARD"` inside the instance's `access_config` block. ✅ |
| 3 | No Ops Agent anywhere in startup script | `grep -in "ops-agent\|ops_agent\|google_project_service" infra/scripts/startup.sh.tpl infra/*.tf` | No matches at all (not even a comment) in the startup script; the only `google_project_service` in the whole repo is `billingbudgets.googleapis.com` in `infra/bootstrap/billing.tf:1`, unrelated to Ops Agent. ✅ |
| 4 | No `google_compute_resource_policy`/`google_compute_snapshot` resource under `infra/` | `grep -rln "google_compute_resource_policy\|google_compute_snapshot" infra --include="*.tf"` | Only hit is `infra/compute.tf:37-38`, which is a **comment** ("No Ops Agent install, no google_compute_resource_policy snapshot schedule, no google_compute_snapshot resource — deliberately absent"); confirmed via targeted grep that no `resource "google_compute_resource_policy"` or `resource "google_compute_snapshot"` block exists anywhere. ✅ |
| 5 | `google_storage_bucket` declared only in `infra/bootstrap/` | `grep -rl "google_storage_bucket" infra --include="*.tf"` | `infra/bootstrap/outputs.tf`, `infra/bootstrap/storage.tf` only — zero hits under `infra/*.tf` (main root). ✅ |
| 6 | `google_billing_budget` declared only in `infra/bootstrap/` | `grep -rl "google_billing_budget" infra --include="*.tf"` | `infra/bootstrap/billing.tf` only. ✅ |
| 7 | Boot disk `pd-standard`, `size = 30` | `grep -n "type\|size" infra/compute.tf` | `infra/compute.tf:14: type = "pd-standard"`, `:15: size = 30`. ✅ |
| 8 | Bucket `location = "us-east1"` (not multi-region `"US"`) | `grep -n "location" infra/bootstrap/storage.tf` | `infra/bootstrap/storage.tf:10: location = "us-east1"`. ✅ |
| 9 | Threshold percents 0.5/0.9/1.0/1.5 | `grep -n "threshold_percent" infra/bootstrap/billing.tf` | Lines 26, 30, 34, 38 → `0.5`, `0.9`, `1.0`, `1.5` exactly. ✅ |
| 10 | `infra/backend.tf` has exactly one commented `backend "gcs"` block; `infra/main.tf` has no duplicate | `grep -n "backend" infra/main.tf`; `grep -c 'backend "gcs"' infra/backend.tf` | `infra/main.tf:11` only mentions backend in a **prose comment** pointing to `backend.tf` — no commented `terraform{backend...}` block duplicated there (T23 correctly removed it from T11's original placeholder). `infra/backend.tf` has exactly 1 occurrence of `backend "gcs"`. ✅ |
| 11 | README documents bootstrap/deploy/teardown (with survival statement) + free-tier table | Read `README.md` in full | `README.md:23-46` Bootstrap, `:48-64` Deploy, `:66-100` Teardown (explicit "state bucket and billing budget are NOT touched" at `:81-88`), `:102-112` Free Tier Summary table (7 rows). ✅ |

---

## 3. Gate Re-Run (this session, read-only except for a throwaway offline `terraform init` needed to make `validate` resolve providers — cleaned up afterward, no live GCP calls made)

| Command | Exit Code | Notes |
|---|---|---|
| `terraform fmt -check -recursive infra` | **0** | No formatting diffs. |
| `terraform -chdir=infra validate` | **0** | Required a prior offline `terraform init -backend=false` (no `.terraform.lock.hcl` was committed, and pre-existing `.terraform/providers/` cache lacked a lock file — provider install used the pre-cached local plugin only, **no network call made**). Result: `Success! The configuration is valid.` |
| `terraform -chdir=infra/bootstrap validate` | **0** | Same offline-init prerequisite. `Success! The configuration is valid.` |
| `bash -n <(sed 's/\${[^}]*}/x/g' infra/scripts/startup.sh.tpl)` | **0** | Script parses clean. |
| `git status --porcelain` | (empty) | Clean — confirmed **after** removing the two `.terraform.lock.hcl` files generated by this session's offline `terraform init` (they are legitimate untracked-by-design artifacts of running init locally, not part of the feature's own state; removed to leave the repo exactly as the implementer left it). |
| `git ls-files` | 64 files | No file matching any `.gitignore` pattern present (`.terraform/`, `*.tfstate`, `*.tfvars`, `*.pem`, `id_rsa*`/`id_ed25519*`, `credentials*.json`, `.env*` — none tracked; only `terraform.tfvars.example` is tracked, which does not match the `*.tfvars` pattern... **caveat**: `git check-ignore` confirms `.gitignore` pattern `*.tfvars` does NOT match `terraform.tfvars.example` since the pattern requires the `.tfvars` extension at end and `.example` is appended after — `terraform.tfvars.example`'s basename ends in `.example`, not `.tfvars`, so it correctly does not match and is intentionally tracked as a template). |
| `git remote -v` | (empty) | No remote configured — GIT-01 confirmed. |

**Note on the offline `terraform init`**: the environment has no GCP credentials and no live network dependency was exercised — `terraform init` resolved the `hashicorp/google` provider entirely from the pre-existing local plugin cache under `infra/.terraform/providers/` and `infra/bootstrap/.terraform/providers/` (already present in the repo's untracked working tree before this verification began). No `gcloud` command, `terraform plan`, or `terraform apply` was run at any point.

---

## 4. Task Completion Check

`tasks.md` shows all 25 tasks (T1–T25) marked `**Status**: ✅ Complete` in their per-task blocks (spot-checked T1, T3, T16, T23, T24 headers plus grep confirming `✅ Complete` appears consistently through the file). No task marked partial/blocked.

---

## 5. Gap List

**None.** All 43 requirement IDs are covered with concrete evidence; all 11 structural checks confirm the claimed repo state by direct grep/read rather than by trusting comments; all re-run gates pass with exit code 0; git state is clean with no gitignored artifact tracked.

One item flagged as an **observation, not a gap** (does not block PASS): `.terraform.lock.hcl` is not committed in either root. This is a minor Terraform best-practice nit (committing the lock file pins the exact provider version/hash for reproducibility) but is explicitly out of scope of every requirement ID in the traceability table and was not called out as a "Done when" criterion in any task — not a spec gap.
