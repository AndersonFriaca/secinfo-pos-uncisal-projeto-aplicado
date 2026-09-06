# Keyless GitHub Actions -> GCP authentication (TF-04..TF-07).
#
# GitHub's OIDC token is exchanged for a short-lived GCP credential via Workload
# Identity Federation; there is no service-account JSON key anywhere. Entry to
# the pool is restricted by `attribute_condition` to this repository's owner,
# and the ability to impersonate the deploy service account is restricted by a
# `principalSet://` member to this exact repository.
#
# principalSet member format verified against google-github-actions/auth:
#   principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${OWNER}/${REPO}
# where ${POOL_NAME} is the full pool resource name
#   (projects/<number>/locations/global/workloadIdentityPools/<id>),
# exported as google_iam_workload_identity_pool.github.name.
#
# `attribute_condition` is required in practice: GCP rejects a GitHub OIDC
# provider that maps google.subject without a condition, and without it any
# GitHub repository could enter the pool.

locals {
  github_owner = split("/", var.github_repository)[0]
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions"
  description               = "Keyless OIDC federation for GitHub Actions deploys"

  depends_on = [google_project_service.app]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }

  attribute_condition = "assertion.repository_owner == '${local.github_owner}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deploy" {
  project      = var.project_id
  account_id   = "github-deploy"
  display_name = "GitHub Actions deploy"
}

# Only tokens from this repository may impersonate the deploy SA (TF-05).
resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Least privilege (TF-05): exactly three project roles, never roles/owner or
# roles/editor.
#   - roles/compute.instanceAdmin.v1: start the instance when TERMINATED,
#     resolve/attach its external IP, AND publish the ephemeral SSH key that
#     `gcloud compute ssh` mints into instance metadata for the deploy.
#   - roles/iam.serviceAccountUser: act as the VM's attached service account,
#     required for the compute operations above.
#   - roles/iap.tunnelResourceAccessor: open the IAP TCP-forwarding tunnel to
#     the VM's port 22, so the deploy authenticates to sshd entirely through
#     Workload Identity Federation with no stored SSH key.
resource "google_project_iam_member" "deploy_compute_admin" {
  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_iap_tunnel" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}
