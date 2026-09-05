# Security

Each hardening measure below maps to a course requirement (see `prd.md`,
Eixo 1) and to specific `infra/` code.

## Network: least privilege by construction

`infra/network.tf` creates a **dedicated custom-mode VPC**, never GCP's
`default` network. `default` ships with permissive `default-allow-*` rules
(SSH, internal traffic, ICMP from anywhere) that would undermine
least-privilege even after adding new rules on top of them — a custom VPC
has *no* implicit-allow rules, so `infra/firewall.tf`'s three explicit
rules (22, 80, 443) **are** the entire exposed surface, not "the exposed
surface plus whatever `default` already opened."

## SSH: key-only, brute-force protected

- `infra/compute.tf` injects the operator's **public** key via instance
  metadata (`ssh-keys`) — the private key never touches Terraform or the
  repository.
- The startup script (stage 2) appends `PasswordAuthentication no` to
  `sshd_config` on every boot, idempotently.
- Fail2ban (stage 3) bans an IP for 24 hours after 4 failed SSH attempts.
  This isn't theoretical — the first real deployment had a genuine
  brute-force attempt banned within hours of going live.

## HTTPS: a real Let's Encrypt certificate, no domain required

Let's Encrypt's IP-address certificate program (GA'd early 2026) issues
certificates for a bare public IP — no DNS record needed. Two things about
it that aren't obvious from the Certbot docs alone, discovered by actually
running this against a live VM:

- **The Nginx/Apache Certbot plugins don't support IP certificates** — only
  `--standalone`, `--webroot`, and `--manual` do. The startup script uses
  `--webroot` and writes its own HTTPS server block by hand (stage 7)
  instead of letting a plugin rewrite it.
- **IP certificates require `--preferred-profile shortlived`**, which means
  a **6-day certificate lifetime**, not the usual 90 days. Certbot's
  renewal timer (twice-daily checks) is load-bearing here, not just a
  nice-to-have — see it confirmed active in
  [operations.md](operations.md#health-checks).

HTTP always redirects to HTTPS (stage 7). If certificate issuance ever
fails (rate limit, transient network issue), the startup script logs it and
leaves Nginx serving plain HTTP rather than leaving it broken — a working
site over HTTP beats a script that gives up entirely.

## Shielded VM

`infra/compute.tf` enables `enable_secure_boot`, `enable_vtpm`, and
`enable_integrity_monitoring` — all three, at no extra cost, supported by
the `ubuntu-2404-lts` image family used here.

## No secrets in the repository

`.gitignore` blocks `.env*`, private key files (`*.pem`, `id_rsa*`,
`id_ed25519*`), `*.tfstate`/`*.tfstate.backup`, `*.tfvars`, `.terraform/`,
`credentials*.json`, and `backend.hcl`. Each has an `.example` counterpart
committed instead (`terraform.tfvars.example`, `infra/backend.hcl.example`)
so the shape of every required value is documented without exposing a real
one. Notably:

- The **GCS bucket name** (`infra/backend.tf`) is never hardcoded — it
  embeds the GCP project ID, which this repo does not publish. Terraform
  reads it from the gitignored `infra/backend.hcl` via `-backend-config`
  instead.
- `ops/vm-start.sh` and `ops/vm-stop.sh` read `project_id`/`region`/`zone`
  from the gitignored `infra/terraform.tfvars` for the same reason.

## Least-privilege budget scope

`infra/bootstrap/billing.tf`'s `google_billing_budget` is filtered to this
project only (`budget_filter.projects`), not the whole billing account —
see [free-tier.md](free-tier.md) for the full cost-control picture.
