# Ingress rules — public SSH, IAP SSH, HTTP, HTTPS. Every other port is
# implicitly denied: custom-mode VPCs (unlike `default`) ship with no
# implicit-allow rules, so this list fully defines the exposed surface.
resource "google_compute_firewall" "allow_ssh" {
  name          = "allow-ssh"
  network       = google_compute_network.custom.self_link
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web-server"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# IAP TCP-forwarding range (constant, documented by GCP). This is what lets the
# keyless CI deploy reach sshd: GitHub Actions tunnels through IAP with an
# ephemeral, IAM-scoped SSH key minted from the WIF-federated deploy SA — no
# stored key. The public `allow-ssh` rule above stays for the human operator
# and could later be narrowed to the operator's own CIDR without affecting CI.
resource "google_compute_firewall" "allow_iap_ssh" {
  name          = "allow-iap-ssh"
  network       = google_compute_network.custom.self_link
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["web-server"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "allow_http" {
  name          = "allow-http"
  network       = google_compute_network.custom.self_link
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web-server"]

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }
}

resource "google_compute_firewall" "allow_https" {
  name          = "allow-https"
  network       = google_compute_network.custom.self_link
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web-server"]

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }
}
