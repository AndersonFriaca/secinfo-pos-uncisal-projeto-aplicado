# Free-tier-pinned e2-micro instance. Every setting below is pinned
# explicitly (not left to provider defaults) per design.md's Free Tier
# Validation table: PREMIUM network tier, a larger/SSD disk, or an Ops
# Agent/snapshot policy would all silently start billing.
resource "google_compute_instance" "vm" {
  name         = "app-vm"
  machine_type = "e2-micro"
  zone         = var.zone
  tags         = ["web-server"]

  # Required by the provider whenever a change (e.g. shielded_instance_config,
  # network_interface) needs the instance stopped first — Terraform stops
  # and restarts it automatically instead of erroring out.
  allow_stopping_for_update = true

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
      # Ephemeral IP (no nat_ip pinned) — a reserved static IP is billed
      # whenever the VM is stopped (not "in use" by a running instance),
      # which conflicts with routinely stopping the VM to save cost.
    }
  }

  # Shielded VM: secure boot + vTPM + integrity monitoring. No extra
  # cost, supported by the ubuntu-2404-lts image family used above.
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  # Attach the project's default compute service account explicitly (it was
  # implicit before). Two runtime needs depend on the instance actually having
  # an identity the metadata server can mint tokens for:
  #   - firebase-admin's applicationDefault() in web/lib/auth/session.ts, which
  #     verifies the session cookie on every dashboard request;
  #   - reading the Identity Platform API key from Secret Manager (secrets.tf).
  # cloud-platform scope + narrowly-scoped IAM roles (only secretAccessor on the
  # one secret is added here) is the standard pattern; the legacy per-API scopes
  # cannot express "Secret Manager read". local.default_compute_sa is the same
  # SA the WIF bindings in wif.tf already target, so nothing there changes.
  service_account {
    email  = local.default_compute_sa
    scopes = ["cloud-platform"]
  }

  metadata = {
    ssh-keys = "${var.ssh_username}:${file(var.ssh_public_key_path)}"
    # Force `gcloud compute ssh` (the keyless CI deploy path) to publish its
    # ephemeral key to THIS instance's metadata rather than project-wide
    # metadata. Project-wide writes need compute.projects.setCommonInstanceMetadata
    # (a project-level write the deploy SA deliberately does not hold); the
    # instance-scoped compute.instances.setMetadata it does hold covers this
    # path. The operator's instance-level ssh-keys above are unaffected.
    block-project-ssh-keys = "TRUE"
    startup-script = templatefile("${path.module}/scripts/startup.sh.tpl", {
      ecosystem_config  = file("${path.module}/scripts/ecosystem.config.js")
      github_repository = var.github_repository
    })
  }

  # No Ops Agent install, no google_compute_resource_policy snapshot
  # schedule, no google_compute_snapshot resource — deliberately absent
  # per design.md's Free Tier Validation (both are billed past the
  # Always Free allotment and aren't needed for this coursework scope).
}
