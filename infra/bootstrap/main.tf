terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # billingbudgets.googleapis.com requires an explicit quota/billing project
  # on the request, otherwise the client library falls back to an internal
  # Google default project that doesn't have the API enabled (SERVICE_DISABLED).
  user_project_override = true
  billing_project       = var.project_id
}
