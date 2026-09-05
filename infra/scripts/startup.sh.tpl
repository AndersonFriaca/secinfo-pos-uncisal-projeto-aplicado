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

# --- Stage 4: Certbot install (snap tracks upstream faster than apt) ---
if ! command -v certbot >/dev/null 2>&1; then
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
fi

# --- Stage 5: base HTTP-only Nginx site (serves ACME HTTP-01 challenge) ---
WEBROOT="/var/www/html"
mkdir -p "$WEBROOT/.well-known/acme-challenge"

HTTP_SITE="/etc/nginx/sites-available/app"
HTTP_MARKER="# managed-by-terraform: http site"
if ! grep -qF "$HTTP_MARKER" "$HTTP_SITE" 2>/dev/null; then
  cat > "$HTTP_SITE" <<EOF
$HTTP_MARKER
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root $WEBROOT;

    location /.well-known/acme-challenge/ {
        allow all;
    }

    location / {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF
  ln -sf "$HTTP_SITE" /etc/nginx/sites-enabled/app
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
fi

# SPEC_DEVIATION: design.md assumed "Certbot's Nginx plugin rewrites the
# server block for HTTPS + redirect" — verified false as of this writing:
# the nginx/apache plugins do not support IP-address certs, only
# --standalone/--webroot/--manual do. Stages 5-7 below manually write and
# reload the Nginx HTTP/HTTPS server blocks instead of relying on a
# --nginx-driven rewrite, with a --deploy-hook to reload Nginx on renewal.

# --- Stage 6: obtain a Let's Encrypt IP-address certificate ---
# NOTE ON CLI FLAGS: verified via web search against the EFF blog
# ("Certbot and Let's Encrypt Now Support IP Address Certificates",
# eff.org/deeplinks/2026/03) and the Let's Encrypt blog ("Six-Day and
# IP Address Certificates Available in Certbot", letsencrypt.org/2026/
# 03/11/shorter-certs-certbot) as of this script's authoring date.
# `--ip-address` shipped in Certbot 5.3; Let's Encrypt requires
# `--preferred-profile shortlived` (6-day cert lifetime) for IP certs;
# the nginx/apache installer plugins do NOT support IP certs yet, so
# `--webroot` is used instead and Nginx is reloaded via `--deploy-hook`
# on every renewal. If Certbot's behavior has changed by the time this
# runs on a real VM, re-verify against `certbot --help` before trusting
# this invocation.
PUBLIC_IP="$(curl -s -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip")"

HTTPS_SITE="/etc/nginx/sites-available/app-ssl"
if ! certbot certificates 2>/dev/null | grep -q "$PUBLIC_IP"; then
  if certbot certonly \
      --non-interactive \
      --agree-tos \
      --register-unsafely-without-email \
      --webroot \
      --webroot-path "$WEBROOT" \
      --preferred-profile shortlived \
      --ip-address "$PUBLIC_IP" \
      --deploy-hook "systemctl reload nginx"; then
    CERT_OBTAINED=true
  else
    CERT_OBTAINED=false
    logger -t startup-script "certbot failed to obtain an IP certificate for $PUBLIC_IP; leaving nginx on HTTP-only"
  fi
else
  CERT_OBTAINED=true
fi

# --- Stage 7: HTTPS server block + HTTP->HTTPS redirect (only on a valid cert) ---
if [ "$CERT_OBTAINED" = true ] && [ ! -f "$HTTPS_SITE" ]; then
  cat > "$HTTPS_SITE" <<EOF
# managed-by-terraform: https site
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;

    ssl_certificate     /etc/letsencrypt/live/$PUBLIC_IP/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PUBLIC_IP/privkey.pem;

    location / {
        # managed-by-terraform: proxy-placeholder (replaced in a later
        # stage once the Next.js app is wired up behind Nginx)
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF
  ln -sf "$HTTPS_SITE" /etc/nginx/sites-enabled/app-ssl

  # Redirect all HTTP traffic to HTTPS now that a cert exists. The whole
  # file is rewritten (not patched) to keep this idempotent and simple;
  # the acme-challenge location stays so future renewals keep working.
  cat > "$HTTP_SITE" <<EOF
$HTTP_MARKER
# managed-by-terraform: https-redirect
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root $WEBROOT;

    location /.well-known/acme-challenge/ {
        allow all;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

  nginx -t && systemctl reload nginx
fi

# --- Stage 8: confirm/enable Certbot's renewal timer, if present ---
if systemctl list-timers --all 2>/dev/null | grep -qi certbot; then
  systemctl enable --now snap.certbot.renew.timer >/dev/null 2>&1 || true
  logger -t startup-script "certbot renewal timer present and enabled"
else
  logger -t startup-script "no certbot renewal timer found on this system; renewal may need manual configuration"
fi
