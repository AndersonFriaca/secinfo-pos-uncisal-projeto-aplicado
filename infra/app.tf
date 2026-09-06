# Application GCP services and Identity Platform sign-in configuration
# (TF-01, TF-02). These back the Next.js app in `web/`: Identity Platform for
# auth, Firestore for the rate-limit counters, IAM Credentials for the keyless
# GitHub Actions deploy path.

locals {
  app_services = [
    "identitytoolkit.googleapis.com",
    "firestore.googleapis.com",
    # Service Accounts + custom roles for the keyless deploy identity, and the
    # STS endpoint google-github-actions/auth exchanges the GitHub OIDC token at.
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    # IAP TCP forwarding: the keyless GitHub Actions deploy reaches sshd
    # through an IAP tunnel (gcloud compute ssh --tunnel-through-iap), so no
    # SSH key or SSH-user secret is stored anywhere.
    "iap.googleapis.com",
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
# email + password flow (no passwordless email-link sign-in).
resource "google_identity_platform_config" "default" {
  project = var.project_id

  sign_in {
    email {
      enabled           = true
      password_required = true
    }
  }

  depends_on = [google_project_service.app]
}
