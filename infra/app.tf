# Application GCP services and Firebase Authentication (Identity Platform)
# sign-in configuration (TF-01, TF-02). These back the Next.js app in `web/`:
# Firebase Auth / Identity Platform for auth, IAM Credentials for the keyless
# GitHub Actions deploy path. The rate limiter uses a process-local in-memory
# store (AD-009) — no database.

locals {
  app_services = [
    "identitytoolkit.googleapis.com",
    # Firebase project enablement (google_firebase_project, firebase.tf).
    "firebase.googleapis.com",
    # Service Accounts + custom roles for the keyless deploy identity, and the
    # STS endpoint google-github-actions/auth exchanges the GitHub OIDC token at.
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    # IAP TCP forwarding: the keyless GitHub Actions deploy reaches sshd
    # through an IAP tunnel (gcloud compute ssh --tunnel-through-iap), so no
    # SSH key or SSH-user secret is stored anywhere.
    "iap.googleapis.com",
    # API Keys API: lets Terraform provision the Identity Platform browser API
    # key below instead of the operator creating one by hand in the console.
    "apikeys.googleapis.com",
    # Secret Manager: stores that API key (secrets.tf); the VM's service account
    # reads it at runtime instead of the value living in /opt/app/.env.production.
    "secretmanager.googleapis.com",
  ]
}

resource "google_project_service" "app" {
  for_each = toset(local.app_services)

  project = var.project_id
  service = each.value

  # Keep `terraform destroy` non-interactive (TF-07): don't attempt to turn the
  # API back off on destroy — that fails while other projects/resources still
  # use it and would need manual cleanup.
  disable_on_destroy = false
}

# Enable email/password sign-in (TF-02). `password_required = true` forces the
# email + password flow (no passwordless email-link sign-in). This is the
# Firebase Authentication config for the project provisioned in firebase.tf.
resource "google_identity_platform_config" "default" {
  project = var.project_id

  sign_in {
    email {
      enabled           = true
      password_required = true
    }
  }

  depends_on = [google_firebase_project.default]
}

# The API key the app's Route Handlers pass as `?key=` when calling the
# Identity Platform REST API (web/lib/auth/identity-platform.ts). This is the
# value of the GitHub secret IDENTITY_PLATFORM_API_KEY and of
# /opt/app/.env.production's IDENTITY_PLATFORM_API_KEY on the VM.
#
# Restricted to the Identity Toolkit API only, so a leak cannot be used against
# any other GCP API. No application (referrer/IP) restriction: the callers are
# the VM and GitHub-hosted runners, whose egress IPs are not fixed. The key is
# server-held per AD-004 — never shipped to the browser.
#
# The key string is stored in Terraform state (the private GCS state bucket) and
# mirrored into Secret Manager (secrets.tf), which is where the running app
# reads it from. Read it directly with:
#   terraform -chdir=infra output -raw identity_platform_api_key
resource "google_apikeys_key" "identity_platform" {
  project      = var.project_id
  name         = "identity-platform-server"
  display_name = "Identity Platform (server-side REST, app auth)"

  restrictions {
    api_targets {
      service = "identitytoolkit.googleapis.com"
    }
  }

  depends_on = [google_project_service.app]
}
