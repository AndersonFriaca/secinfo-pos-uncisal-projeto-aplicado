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

  depends_on = [google_project_service.app]
}

# Only tokens from this repository may impersonate the deploy SA (TF-05).
resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Least privilege (TF-05): every grant below is scoped to the single app VM, to
# the VM's own service account, the repo, or a single minimal custom project
# role. The deploy SA holds NO predefined project-level role, and never
# roles/owner or roles/editor.
#
# The deploy SA's complete authority is:
#   (a) instance-scoped roles/compute.instanceAdmin.v1 + roles/iap.tunnelResourceAccessor
#       on the app VM only;
#   (b) SA-scoped roles/iam.serviceAccountUser on the VM's default compute SA only;
#   (c) repo-scoped roles/iam.workloadIdentityUser (principalSet:// for this repo);
#   (d) one minimal custom project role (deployVmOperator) — read/list/operations-get
#       only, no write permission, not a predefined project role, never owner/editor.
#
#   - roles/compute.instanceAdmin.v1 on google_compute_instance.vm only:
#     start the instance when TERMINATED, read its status/IP, and publish the
#     ephemeral SSH key that `gcloud compute ssh` mints. The key lands in this
#     instance's own metadata (not project-wide) because compute.tf sets
#     block-project-ssh-keys=TRUE, so instance-scoped compute.instances.setMetadata
#     is enough — no project-level metadata write is needed.
#     Bound at the instance resource level, so it grants nothing on any other
#     instance, disk, image, or snapshot in the project.
#   - roles/iap.tunnelResourceAccessor on the same instance only: open the IAP
#     TCP-forwarding tunnel to this VM's port 22, so the deploy authenticates
#     to sshd entirely through Workload Identity Federation with no stored key.
#   - roles/iam.serviceAccountUser on the VM's attached service account only:
#     `iam.serviceAccounts.actAs` on that SA, which `gcloud compute` requires
#     for the instance operations above. The VM has no explicit `service_account`
#     block in compute.tf, so its attached identity is the project's default
#     compute service account, built from the project number below.
#     NOTE: if the operator later attaches an explicit service account to the
#     VM, this binding's target MUST change to that service account.

data "google_project" "this" {
  project_id = var.project_id
}

locals {
  # The VM has no explicit service_account block in compute.tf, so it runs as
  # the project's default compute SA. Built from the project number rather than
  # read via google_compute_default_service_account so `terraform plan` does not
  # depend on iam.googleapis.com being enabled yet (cloudresourcemanager, which
  # google_project needs, is on by default).
  default_compute_sa = "${data.google_project.this.number}-compute@developer.gserviceaccount.com"
}

resource "google_compute_instance_iam_member" "deploy_compute_admin" {
  project       = var.project_id
  zone          = google_compute_instance.vm.zone
  instance_name = google_compute_instance.vm.name
  role          = "roles/compute.instanceAdmin.v1"
  member        = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_iap_tunnel_instance_iam_member" "deploy_iap_tunnel" {
  project  = var.project_id
  zone     = google_compute_instance.vm.zone
  instance = google_compute_instance.vm.name
  role     = "roles/iap.tunnelResourceAccessor"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_service_account_iam_member" "deploy_sa_user" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${local.default_compute_sa}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

# One minimal custom project role (Amendment 2 / G1). `gcloud compute ssh
# --tunnel-through-iap`, `gcloud compute instances start`, and `gcloud compute
# instances describe` in .github/workflows/deploy.yml perform project-scoped
# reads and poll long-running operations. Those permissions belong to project
# and zone collections, not to an instance resource, so
# google_compute_instance_iam_member cannot grant them. This custom role exists
# ONLY so the keyless IAP deploy can read project metadata and poll compute
# operations: read/list/operations-get only, no write permission, and
# deliberately not a predefined project role.
#
# Permission set verified against Google's "Using IAP for TCP forwarding" IAM
# reference (https://docs.cloud.google.com/iap/docs/using-tcp-forwarding):
# `gcloud compute start-iap-tunnel|ssh|scp` additionally require
# compute.projects.get and compute.instances.list at project scope;
# compute.globalOperations.get covers the non-OS-Login metadata-key path;
# compute.zoneOperations.get lets gcloud poll the instances.start operation.
resource "google_project_iam_custom_role" "deploy_vm_operator" {
  project     = var.project_id
  role_id     = "deployVmOperator"
  title       = "Deploy VM Operator (keyless IAP deploy)"
  description = "Minimal project-scoped read/list/operations-get permissions the keyless GitHub Actions IAP deploy needs to read project metadata and poll compute operations. No write permission; not a predefined project role."
  permissions = [
    "compute.globalOperations.get",
    "compute.instances.list",
    "compute.projects.get",
    "compute.zoneOperations.get",
  ]
  stage = "GA"

  depends_on = [google_project_service.app]
}

resource "google_project_iam_member" "deploy_vm_operator" {
  project = var.project_id
  role    = google_project_iam_custom_role.deploy_vm_operator.id
  member  = "serviceAccount:${google_service_account.deploy.email}"
}
