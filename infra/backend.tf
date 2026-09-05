# Remote state backend. The bucket name is intentionally NOT hardcoded
# here — it embeds the GCP project ID (e.g. "<project-id>-state"), which
# must never be published in this public repo. Provide it at init time
# via a gitignored partial backend config file instead:
#
#   cp infra/backend.hcl.example infra/backend.hcl   # fill in the real bucket name
#   terraform init -backend-config=backend.hcl -migrate-state
#
# Full bootstrap steps are in README.md's "Bootstrap" section.
terraform {
  backend "gcs" {}
}
