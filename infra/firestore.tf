# RETIRING THIS DATABASE. The rate limiter moved to a process-local in-memory
# store (AD-009); Firestore is being removed from the project entirely.
#
# This two-step exists because the resource is in Terraform state with
# deletion_policy = "ABANDON" (the provider default), under which a plain
# `terraform destroy` / config removal only drops it from state and leaves the
# database live in GCP. So:
#   1. this commit keeps the resource but sets deletion_policy = "DELETE" —
#      `terraform apply` makes that an in-place update, no destroy yet;
#   2. the next commit deletes this file (and drops firestore.googleapis.com),
#      and `terraform apply` then actually tears the database down.
resource "google_firestore_database" "default" {
  project         = var.project_id
  name            = "(default)"
  location_id     = var.region
  type            = "FIRESTORE_NATIVE"
  deletion_policy = "DELETE"

  depends_on = [google_project_service.app]
}
