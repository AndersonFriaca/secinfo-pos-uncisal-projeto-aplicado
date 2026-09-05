# Free-tier-pinned e2-micro instance. Every setting below is pinned
# explicitly (not left to provider defaults) per design.md's Free Tier
# Validation table: PREMIUM network tier, a larger/SSD disk, or an Ops
# Agent/snapshot policy would all silently start billing.
resource "google_compute_instance" "vm" {
  name         = "app-vm"
  machine_type = "e2-micro"
  zone         = var.zone
  tags         = ["web-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      type  = "pd-standard"
      size  = 30
    }
    # auto_delete defaults to true — kept implicit, never set to false.
  }

  network_interface {
    subnetwork = google_compute_subnetwork.custom.self_link

    access_config {
      # Provider default is PREMIUM (only 1 GB/month free). STANDARD
      # carries its own separate 200 GB/month/region free allowance.
      network_tier = "STANDARD"
    }
  }

  metadata = {
    ssh-keys = "${var.ssh_username}:${file(var.ssh_public_key_path)}"
    startup-script = templatefile("${path.module}/scripts/startup.sh.tpl", {
      ssh_username = var.ssh_username
    })
  }

  # No Ops Agent install, no google_compute_resource_policy snapshot
  # schedule, no google_compute_snapshot resource — deliberately absent
  # per design.md's Free Tier Validation (both are billed past the
  # Always Free allotment and aren't needed for this coursework scope).
}
