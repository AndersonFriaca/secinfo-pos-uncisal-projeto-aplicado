# Exactly three ingress rules — SSH, HTTP, HTTPS. Every other port is
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
