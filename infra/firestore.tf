# Native-mode Firestore database backing the per-IP rate-limit / brute-force
# counters (TF-03). Same region as the VM so reads/writes stay in-region.
#
# Must stay inside the Firestore Always Free quota:
#   - 1 GiB stored
#   - 50,000 document reads / day
#   - 20,000 document writes / day
#   - 20,000 document deletes / day
# The in-process L1 cache in web/lib/security/rate-limit.ts short-circuits
# already-blocked IPs with no Firestore call, so a sustained attack cannot
# exhaust the daily write quota (SEC-07).
# NOTE: this database is being retired — the rate limiter moved to a
# process-local in-memory store (AD-009). `deletion_policy = "DELETE"` is set
# here first (default is "ABANDON", which would only drop it from state) so the
# follow-up commit that removes this file actually tears the database down.
resource "google_firestore_database" "default" {
  project         = var.project_id
  name            = "(default)"
  location_id     = var.region
  type            = "FIRESTORE_NATIVE"
  deletion_policy = "DELETE"

  depends_on = [google_project_service.app]
}
