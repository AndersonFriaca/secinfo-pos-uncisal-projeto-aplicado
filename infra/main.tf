terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment after `infra/bootstrap` has been applied and its
  # `state_bucket_name` output copied in below, then run
  # `terraform init -migrate-state` inside infra/. See README's
  # bootstrap/migration steps.
  # backend "gcs" {
  #   bucket = "<state_bucket_name from infra/bootstrap output>"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
