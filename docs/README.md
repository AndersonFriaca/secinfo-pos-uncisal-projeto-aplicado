# Documentation

Reference documentation for the project's GCP infrastructure (Terraform).
Start with the root [`README.md`](../README.md) for a quickstart — this
folder goes deeper on each topic.

| Doc | Covers |
| --- | --- |
| [architecture.md](architecture.md) | The two-Terraform-root design, component list, request flow |
| [deployment.md](deployment.md) | Step-by-step bootstrap → deploy, variables reference |
| [operations.md](operations.md) | Day-to-day: starting/stopping the VM, checking service health, teardown |
| [security.md](security.md) | Hardening measures and the reasoning behind each one |
| [free-tier.md](free-tier.md) | Every setting that keeps this inside GCP's Always Free tier, and why |
| [troubleshooting.md](troubleshooting.md) | Real bugs found deploying this for real, and how to diagnose similar ones |

Planning artifacts (requirements, design decisions, task breakdown, the
independent Verifier's report) live in
[`.specs/features/gcp-infra-terraform/`](../.specs/features/gcp-infra-terraform/)
— that's the historical record of *why* things were built this way; the
docs here are the current-state reference for *how to use* what was built.
Agent-specific operating notes (e.g. "always use `ops/vm-start.sh`, never
call `gcloud compute instances start` directly") are in
[`CLAUDE.md`](../CLAUDE.md).
