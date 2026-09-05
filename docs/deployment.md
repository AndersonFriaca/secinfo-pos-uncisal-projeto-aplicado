# Deployment

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [gcloud CLI](https://cloud.google.com/sdk/docs/install), authenticated:
  `gcloud auth login`
- An existing GCP project and an existing, open billing account linked to it
- An SSH keypair (e.g. `~/.ssh/id_ed25519` / `id_ed25519.pub`)

Two GCP project-level APIs must be enabled before the first apply — Terraform
doesn't enable them for you because enabling them itself requires
`cloudresourcemanager.googleapis.com` to already be on:

```bash
gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com compute.googleapis.com \
  --project=<your-project-id>
```

## 1. Configure variables

Copy the two example files and fill in your own values — **never commit the
real copies**, both are gitignored:

```bash
cp terraform.tfvars.example infra/terraform.tfvars
cp infra/backend.hcl.example infra/backend.hcl   # bucket name goes here after step 2
```

`infra/terraform.tfvars` needs: `project_id`, `region` (default
`us-east1`), `zone` (default `us-east1-b`), `ssh_username`,
`ssh_public_key_path`. A separate `infra/bootstrap/terraform.tfvars` needs:
`project_id`, `region`, `state_bucket_name` (must be globally unique —
`<project-id>-state` is a safe convention), `billing_account_name` (find it
with `gcloud billing accounts list`), and optionally
`billing_alert_currency_code` / `billing_alert_amount` if your billing
account's currency isn't USD — see [free-tier.md](free-tier.md#billing-budget).

## 2. Bootstrap (state bucket + billing budget)

```bash
cd infra/bootstrap
terraform init
terraform apply
```

This creates the two persistent resources described in
[architecture.md](architecture.md). Copy the printed `state_bucket_name`
output into `infra/backend.hcl`:

```hcl
bucket = "<state_bucket_name output>"
```

## 3. Point the main root at the remote backend

```bash
cd ../   # back to infra/
terraform init -backend-config=backend.hcl -migrate-state
```

Terraform asks to confirm copying the existing local state into the new GCS
backend — accept it. From here on, `infra/`'s state lives in the bucket;
`infra/bootstrap/`'s own state (the bucket resource itself) stays local and
separate, by design.

## 4. Deploy the billable resources

```bash
terraform plan
terraform apply
```

This provisions the custom VPC/subnet, the three firewall rules, and the
`e2-micro` instance running the startup script (see
[architecture.md](architecture.md#startup-script-stages)). First boot takes
a few minutes — packages install, Certbot requests a certificate, PM2 gets
registered.

## 5. Verify

```bash
terraform output instance_external_ip
curl -I http://<ip>          # expect a 301 redirect to https
curl -Ik https://<ip>        # expect a valid Let's Encrypt cert (302/502 on / is fine — no app deployed yet)
ssh <ssh_username>@<ip>      # key-only; a password prompt would mean something's wrong
```

Once you actually deploy a Next.js build to `/opt/app` and `pm2 start
ecosystem.config.js && pm2 save` on the VM, `https://<ip>/` starts serving
it instead of `502`.

## Day-to-day operation

For starting/stopping the VM (which also handles the static-IP
reserve/release dance), teardown, and health checks, see
[operations.md](operations.md).
