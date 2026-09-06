# Architecture

## Two Terraform roots, split by blast radius

```
infra/bootstrap/          infra/
┌──────────────────┐      ┌──────────────────────────────┐
│ GCS state bucket  │      │ Custom VPC + subnet          │
│ Billing budget    │◄─────┤ firewall: IAP-SSH, 80, 443   │
│ (own local state, │ state│ e2-micro instance            │
│  never destroyed) │      │ (backed by the gcs bucket)   │
└──────────────────┘      └──────────────────────────────┘
   persistent, free            billable, torn down by
                                `terraform destroy` here only
```

- **`infra/bootstrap/`** — the only two resources meant to *outlive* a
  teardown: the GCS bucket holding `infra/`'s remote state, and the billing
  budget alert. Both are free regardless of what else exists in the
  project, so they stay up even after `infra/` is fully destroyed —
  spend monitoring never lapses, and the state survives a wiped laptop.
  Applied once, with its own local state, rarely touched again.
- **`infra/`** — every billable resource: the network, firewall, and the
  compute instance. Its state lives in the bucket the bootstrap root
  created. `terraform destroy` run here can never reach into
  `infra/bootstrap/` — they're structurally separate roots, not just
  protected by a lifecycle flag.

Why not one root with `lifecycle { prevent_destroy = true }` on the
bucket? Because `prevent_destroy` aborts Terraform's *entire* destroy
plan the moment it hits that resource — it wouldn't let `terraform
destroy` remove anything else either. Two roots is what makes "destroy
everything billable, keep the free stuff" actually work.

## Request flow

```
Internet
   │
   ▼
Firewall (22 / 80 / 443 only, custom VPC — never GCP's `default` network)
   │
   ▼
e2-micro instance (Ubuntu 24.04, Shielded VM)
   │
   ├─ :22  → sshd — IAP range only by default (key-only, Fail2ban jail);
   │          direct CIDR access is opt-in via var.operator_ssh_cidrs
   ├─ :80  → Nginx → 301 redirect to :443
   └─ :443 → Nginx (Let's Encrypt IP certificate)
               └─ proxy_pass → localhost:3000 (PM2-managed Next.js app)
```

The reverse proxy at `:3000` returns `502` until a Next.js build is
actually deployed there — that's expected; deploying the app is a
separate feature (see `prd.md`'s Eixo 3).

## Components

| File | Resource(s) | Purpose |
| --- | --- | --- |
| `infra/bootstrap/storage.tf` | `google_storage_bucket` | Terraform remote state for `infra/` |
| `infra/bootstrap/billing.tf`, `billing-data.tf`, `billing-variables.tf` | `google_billing_budget`, `google_project_service` | Spend alert (pattern from [eatonc/actual-gcp](https://github.com/eatonc/actual-gcp)) |
| `infra/network.tf` | `google_compute_network`, `google_compute_subnetwork` | Dedicated custom VPC — no inherited permissive rules |
| `infra/firewall.tf` | `google_compute_firewall` | Least-privilege ingress: SSH from the IAP range (always) and from `var.operator_ssh_cidrs` (opt-in), HTTP, HTTPS |
| `infra/compute.tf` | `google_compute_instance` | The VM itself — every setting pinned for free-tier + Shielded VM |
| `infra/scripts/startup.sh.tpl` | (instance metadata) | Idempotent boot-time provisioning — see the stage list below |
| `infra/scripts/ecosystem.config.js` | (copied to `/opt/app`) | PM2 process definition for the future Next.js app |
| `infra/backend.tf` | `terraform { backend "gcs" {} }` | Points at the bootstrap bucket via `-backend-config` (never a hardcoded bucket name — see [security.md](security.md)) |
| `ops/vm-start.sh`, `ops/vm-stop.sh` | (imperative `gcloud` calls) | Reserve/attach/release a static IP around the VM's actual up-time — see [operations.md](operations.md) |

## Startup script stages

`infra/scripts/startup.sh.tpl` runs on every boot (GCP re-runs
`metadata.startup-script` each time) and is idempotent stage by stage —
each one guards itself so a re-run is a safe no-op where nothing changed:

1. Base packages (`nginx`, `fail2ban`, `snapd`, `nodejs`, `npm`)
2. SSH hardening — `PasswordAuthentication no`
3. Fail2ban `sshd` jail — 4 attempts, 24h ban
4. Certbot install via `snap` (not `apt` — see [security.md](security.md))
5. Base HTTP-only Nginx site (serves the ACME challenge)
6. Obtain a Let's Encrypt IP-address certificate
7. HTTPS server block + HTTP→HTTPS redirect
8. Confirm/enable Certbot's renewal timer
9. PM2 install + systemd startup registration
10. PM2 app directory + Nginx reverse proxy to `localhost:3000`

See [troubleshooting.md](troubleshooting.md) for two real bugs found only
by running this against a live VM.
