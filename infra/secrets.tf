# Secret Manager storage for the Identity Platform API key (TF-01).
#
# The app used to receive this value as IDENTITY_PLATFORM_API_KEY in
# /opt/app/.env.production, written by the CI deploy from a GitHub secret. Now
# the value lives only here: Terraform mirrors google_apikeys_key.identity_platform
# into a secret, and the VM's service account (compute.tf) is granted read
# access so web/lib/auth/identity-platform.ts can fetch it at runtime via
# web/lib/gcp/secret.ts. Nothing but NODE_ENV/PORT/GOOGLE_CLOUD_PROJECT stays in
# the .env file, and no auth secret is held in a GitHub secret anymore.

resource "google_secret_manager_secret" "identity_platform_api_key" {
  project   = var.project_id
  secret_id = "identity-platform-api-key"

  # Google-managed replication across regions. No CMEK — the coursework scope
  # does not need customer-managed keys, and auto replication stays free-tier.
  replication {
    auto {}
  }

  depends_on = [google_project_service.app]
}

# The secret's payload is the API key string. A new key_string (e.g. after the
# api key is recreated) produces a new version; the app always reads
# "versions/latest", so it picks the rotation up on its next cold read.
resource "google_secret_manager_secret_version" "identity_platform_api_key" {
  secret      = google_secret_manager_secret.identity_platform_api_key.id
  secret_data = google_apikeys_key.identity_platform.key_string
}

# The VM runs as the project's default compute service account (compute.tf).
# secretAccessor on THIS secret only — not project-wide — is the single grant
# that lets the app read the key at runtime.
resource "google_secret_manager_secret_iam_member" "vm_read_api_key" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.identity_platform_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.default_compute_sa}"
}
