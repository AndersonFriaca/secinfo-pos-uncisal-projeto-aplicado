# Remote state backend — commented out until `infra/bootstrap` has been
# applied. Uncomment after copying the `state_bucket_name` output value from
# `infra/bootstrap` into the `bucket` field below, then run
# `terraform init -migrate-state` from inside `infra/`. Full steps are in
# README.md's "Bootstrap" section.
terraform {
  backend "gcs" {
    bucket = "<gcp-project-id>-state"
  }
}
