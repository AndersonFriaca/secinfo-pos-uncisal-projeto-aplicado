# Projeto Aplicado — GCP Infrastructure

Infrastructure as Code (Terraform) for a hardened, free-tier GCP hosting
environment for the project's Next.js application. See [`prd.md`](prd.md) for
the full course requirements (Eixo 1: Cloud Infra).

This repository provisions the infra layer only — the application itself is
built in a separate feature. Provisioning uses two Terraform roots:

- `infra/bootstrap/` — persistent resources (Terraform state bucket, billing
  budget) that survive a full `infra/` teardown.
- `infra/` — the billable resources (VPC, firewall, compute instance).

Full deploy and teardown instructions land here once the Terraform roots are
complete (see `.specs/features/gcp-infra-terraform/tasks.md`, task T24).

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.16
- [gcloud CLI](https://cloud.google.com/sdk/docs/install)
- An authenticated gcloud account with access to the target GCP project:
  `gcloud auth login`
- An existing GCP project and billing account
- An existing SSH keypair (e.g. `~/.ssh/id_ed25519`)
