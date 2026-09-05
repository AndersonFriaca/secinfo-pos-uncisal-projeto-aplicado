# Reserved (static) external IP for the instance, instead of an ephemeral
# one. A static IP costs nothing extra while it stays attached to a
# running instance (google_compute_instance.vm always references it) —
# GCP only bills a static IP that is reserved but NOT attached to a
# running resource. Must match the instance's network_tier (STANDARD).
resource "google_compute_address" "static" {
  name         = "app-vm-ip"
  region       = var.region
  network_tier = "STANDARD"
}
