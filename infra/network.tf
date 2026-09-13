# Dedicated custom-mode VPC, never the GCP `default` network. `default`
# ships with permissive default-allow-* rules that would undermine the
# least-privilege firewall requirement even after adding rules on top.
resource "google_compute_network" "custom" {
  name                    = "main-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "custom" {
  name          = "main-subnet"
  region        = var.region
  network       = google_compute_network.custom.self_link
  ip_cidr_range = "10.10.0.0/24"
}
