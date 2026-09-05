#!/bin/bash
set -euo pipefail
# Idempotent boot-time hardening/provisioning script for the app VM.
# GCP re-runs metadata.startup-script on every boot, so every stage below
# guards itself (marker comments, command -v checks, file-exists checks)
# so re-runs are safe no-ops where nothing changed. Rendered via
# templatefile() in infra/compute.tf; ${ssh_username} is the only
# variable interpolated in from Terraform.

# --- Stage 1: base packages (apt install is naturally idempotent) ---
apt-get update
apt-get install -y nginx fail2ban snapd nodejs npm

# --- Stage 2: SSH hardening — disable password authentication ---
SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_MARKER="# managed-by-terraform: disable password auth"
if ! grep -qF "$SSHD_MARKER" "$SSHD_CONFIG"; then
  {
    echo ""
    echo "$SSHD_MARKER"
    echo "PasswordAuthentication no"
  } >> "$SSHD_CONFIG"
  systemctl reload sshd
fi
