# Private bucket for prebuilt binary artifacts consumed by app-vm's
# startup script (currently just oqsprovider.so + its liboqs runtime
# libs — see startup.sh.tpl's Stage 8b). Objects are built once, offline,
# on a matching-glibc environment and uploaded here manually; the VM
# fetches them using its own attached service account's OAuth token
# (already has the `cloud-platform` scope — compute.tf), so this needs
# no new credential/secret, just an IAM grant scoped to this one bucket.
# Deliberately outside infra/bootstrap: this is a regular,
# destroy-with-the-rest-of-infra resource, not state.
resource "google_storage_bucket" "vm_assets" {
  name                        = "${var.project_id}-vm-assets"
  project                     = var.project_id
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  # auto_delete-equivalent for objects: none needed, this bucket only ever
  # holds a handful of small (~tens of MB) build artifacts.
}

# The VM runs as the project's default compute service account
# (compute.tf). objectViewer on THIS bucket only — not project-wide — is
# the single grant that lets Stage 8b's download work.
resource "google_storage_bucket_iam_member" "vm_assets_read" {
  bucket = google_storage_bucket.vm_assets.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${local.default_compute_sa}"
}
