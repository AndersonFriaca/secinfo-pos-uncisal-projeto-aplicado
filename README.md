# Projeto Aplicado — GCP Infrastructure

Infrastructure as Code (Terraform) for a hardened, free-tier GCP hosting
environment for the project's Next.js application. See [`prd.md`](prd.md) for
the full course requirements (Eixo 1: Cloud Infra).

This repository provisions the infra layer only — the application itself is
built in a separate feature. Provisioning uses two Terraform roots:

- `infra/bootstrap/` — persistent resources (Terraform state bucket, billing
  budget) that survive a full `infra/` teardown.
- `infra/` — the billable resources (VPC, firewall, compute instance).

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.16
- [gcloud CLI](https://cloud.google.com/sdk/docs/install)
- An authenticated gcloud account with access to the target GCP project:
  `gcloud auth login`
- An existing GCP project and billing account
- An existing SSH keypair (e.g. `~/.ssh/id_ed25519`)

## Bootstrap

`infra/bootstrap/` provisions the persistent, never-destroyed resources: the
GCS bucket that will hold `infra/`'s remote Terraform state, and the billing
budget alert. It always keeps its own local state and is never migrated.

1. Apply the bootstrap root:
   ```bash
   cd infra/bootstrap
   terraform init
   terraform apply
   ```
2. Copy the `state_bucket_name` output value. Paste it into the `bucket`
   field in `infra/backend.tf`, then uncomment the whole `terraform { backend
   "gcs" { ... } }` block in that file.
3. Migrate `infra/`'s local state into the bucket:
   ```bash
   cd ../
   terraform init -migrate-state
   ```
   Terraform will ask to confirm copying existing local state into the new
   GCS backend — accept it. After this, `infra/`'s state lives remotely and
   `infra/bootstrap/`'s state (with the bucket resource itself) remains
   local and separate.

## Deploy

With the backend migrated, `infra/` provisions the billable resources: the
custom VPC/subnet, firewall rules, and the e2-micro compute instance running
the hardened startup script (SSH hardening, Fail2ban, Nginx + Certbot,
PM2-managed Next.js app).

```bash
cd infra
terraform init      # re-run if the backend wasn't already migrated above
terraform plan
terraform apply
```

After `apply` completes, the instance's external IP is available via
`terraform output`. DNS/IP-certificate details are handled by the startup
script on first boot — see `infra/scripts/startup.sh.tpl`.

## Teardown

Tearing down billable resources is a single command inside the main root:

```bash
cd infra
terraform destroy
```

This removes every resource declared in `infra/`'s state: the compute
instance and its boot disk, all three firewall rules, and the custom VPC and
subnet. No resource in `infra/` sets `lifecycle { prevent_destroy = true }`,
so this destroy always completes in full — nothing can abort or partially
block the plan.

**The state bucket and the billing budget are NOT touched by this destroy.**
Both live exclusively in the separate `infra/bootstrap/` root, so they are
outside `infra/`'s state and outside the blast radius of `terraform destroy`
run there. The billing budget is a free resource with no ongoing cost, so it
is designed to keep alerting at the same $5/50/90/100/150% thresholds even
after `infra/` is fully destroyed — spend monitoring never lapses, and it
would still catch any billable resource created later (e.g. by hand in the
console, or by a future `terraform apply`).

If you also want to remove the state bucket and/or the billing budget, that
requires a second, separate, optional command run inside the bootstrap root:

```bash
cd infra/bootstrap
terraform destroy
```

This is a deliberate extra step, never a side effect of destroying `infra/`.
Destroying `infra/bootstrap/` does not delete the GCP project itself — only
its own two resources (the bucket and the budget).

## Free Tier Summary

| Setting | Value | Why it matters |
| --- | --- | --- |
| Compute instance | `e2-micro` in `us-east1-b` | Always Free covers exactly 1 non-preemptible e2-micro/month, only in `us-west1`/`us-central1`/`us-east1` |
| Boot disk | `pd-standard`, 30 GB | Always Free covers 30 GB-months of standard persistent disk; SSD or a larger size would bill |
| Network tier | `STANDARD` (not the provider's `PREMIUM` default) | Standard Tier includes its own 200 GB/month/region free egress allowance; Premium's free egress is far smaller |
| Ops Agent | Not installed | Cloud Monitoring/Logging agent ingestion is not part of Always Free and bills per GB/metric |
| Disk snapshots | None configured | Snapshot storage bills per GB regardless of the boot disk's free allowance |
| State bucket region | `us-east1`, single-region | Always Free covers 5 GB-months of regional storage only in `us-west1`/`us-central1`/`us-east1`; multi-region `"US"` does not qualify |
| Billing budget | $5 tripwire at 50% / 90% / 100% / 150% thresholds | The Cloud Billing Budget API itself is free; it only alerts, it cannot cap spend |
