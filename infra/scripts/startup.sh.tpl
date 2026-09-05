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

# --- Stage 3: Fail2ban sshd jail (4 attempts / 24h ban) ---
JAIL_LOCAL="/etc/fail2ban/jail.local"
JAIL_MARKER="# managed-by-terraform: sshd jail"
JAIL_BEFORE_HASH=""
[ -f "$JAIL_LOCAL" ] && JAIL_BEFORE_HASH="$(md5sum "$JAIL_LOCAL" 2>/dev/null || true)"

if ! grep -qF "$JAIL_MARKER" "$JAIL_LOCAL" 2>/dev/null; then
  cat > "$JAIL_LOCAL" <<EOF
$JAIL_MARKER
[sshd]
enabled = true
maxretry = 4
bantime = 24h
EOF
fi

JAIL_AFTER_HASH="$(md5sum "$JAIL_LOCAL" 2>/dev/null || true)"
if [ "$JAIL_BEFORE_HASH" != "$JAIL_AFTER_HASH" ]; then
  systemctl restart fail2ban
fi
