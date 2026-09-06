# Ingress rules. Every other port is implicitly denied: custom-mode VPCs
# (unlike `default`) ship with no implicit-allow rules, so this list fully
# defines the exposed surface:
#   - allow-iap-ssh : tcp:22 from the IAP range, always (keyless CI + IAP SSH)
#   - allow-ssh     : tcp:22 from var.operator_ssh_cidrs, only when that list
#                     is non-empty (opt-in direct operator SSH)
#   - allow-http    : tcp:80  from anywhere
#   - allow-https   : tcp:443 from anywhere
resource "google_compute_firewall" "allow_ssh" {
  count         = length(var.operator_ssh_cidrs) > 0 ? 1 : 0
  name          = "allow-ssh"
  network       = google_compute_network.custom.self_link
  source_ranges = var.operator_ssh_cidrs
  target_tags   = ["web-server"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# IAP TCP-forwarding range (constant, documented by GCP). This is what lets the
# keyless CI deploy reach sshd: GitHub Actions tunnels through IAP with an
# ephemeral, IAM-scoped SSH key minted from the WIF-federated deploy SA — no
# stored key. This rule is always present; direct `allow-ssh` above is opt-in
# via var.operator_ssh_cidrs and CI does not depend on it.
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
