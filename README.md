# Projeto Aplicado — GCP Infrastructure

Infrastructure as Code (Terraform) for a hardened, free-tier GCP hosting
environment for the project's Next.js application. See [`prd.md`](prd.md)
for the full course requirements (Eixo 1: Cloud Infra).

This repository provisions the infra layer only — the application itself is
built in a separate feature. A hardened `e2-micro` VM serves HTTPS (real
Let's Encrypt certificate, no domain needed) via Nginx, with SSH locked to
key-only access, Fail2ban, and Shielded VM enabled, all pinned to stay
inside GCP's Always Free tier.

**📚 Full documentation is in [`docs/`](docs/)** — architecture, deployment
steps, day-to-day operations, security rationale, the free-tier checklist,
and a troubleshooting guide built from real bugs found deploying this.

## Quickstart

```bash
gcloud auth login
cp terraform.tfvars.example infra/terraform.tfvars        # fill in your values
cp infra/backend.hcl.example infra/backend.hcl            # bucket name comes from step 2

# 1. Bootstrap (state bucket + billing budget — persistent, never destroyed)
cd infra/bootstrap && terraform init && terraform apply

# 2. Point the main root at the remote backend (bucket name from step 1's output)
cd ../ && terraform init -backend-config=backend.hcl -migrate-state

# 3. Deploy the VM, network, firewall
terraform apply
```

Full walkthrough, variable reference, and verification steps:
[`docs/deployment.md`](docs/deployment.md).

## Everyday use

```bash
./ops/vm-start.sh   # start the VM (reserves + attaches a static IP for this session)
./ops/vm-stop.sh    # stop the VM (releases the IP — nothing left billing)
```

See [`docs/operations.md`](docs/operations.md) for health checks,
teardown, and why starting/stopping goes through these scripts instead of
plain `gcloud compute instances start/stop`.

## Repository layout

```
infra/bootstrap/   Persistent Terraform root: state bucket, billing budget
infra/             Main Terraform root: VPC, firewall, compute instance
infra/scripts/     Startup script + PM2 config, rendered onto the VM
ops/               Operator scripts (start/stop the VM with a static IP)
docs/              Full documentation — start here
.specs/            Planning history: requirements, design, tasks, verification report
CLAUDE.md          Operating notes for AI agents working in this repo
prd.md             Course requirements this project is graded against
```

## Agent notes

If you're an AI agent working in this repo, read [`CLAUDE.md`](CLAUDE.md)
first — it documents the VM start/stop workflow and two real bugs worth
knowing about before touching `infra/scripts/startup.sh.tpl`.
