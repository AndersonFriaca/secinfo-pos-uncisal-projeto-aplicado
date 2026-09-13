terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    # google-beta is needed only for google_firebase_project (firebase.tf).
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  # Remote state backend configuration lives in backend.tf (commented until
  # infra/bootstrap has been applied — see README's "Bootstrap" section).
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  # Some GCP APIs (e.g. billingbudgets in infra/bootstrap) reject requests
  # without an explicit quota/billing project. Setting this consistently
  # across both roots avoids the same class of failure here.
  user_project_override = true
  billing_project       = var.project_id
}

# Same settings as the google provider — used only by google_firebase_project.
provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  user_project_override = true
  billing_project       = var.project_id
}
