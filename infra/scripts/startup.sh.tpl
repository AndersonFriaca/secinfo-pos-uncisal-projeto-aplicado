#!/bin/bash
set -euo pipefail
# Idempotent boot-time hardening/provisioning script for the app VM.
# GCP re-runs metadata.startup-script on every boot, so every stage below
# guards itself (marker comments, command -v checks, file-exists checks)
# so re-runs are safe no-ops where nothing changed. Rendered via
# templatefile() in infra/compute.tf; the only template variable is
# $${ecosystem_config} (stage 10), injected verbatim from
# infra/scripts/ecosystem.config.js at terraform apply time. The app
# runtime user is the hardcoded constant `appsvc`, and the operator's SSH key
# is injected separately through instance metadata (compute.tf `ssh-keys`).

# --- Stage 0: repair a broken oqsprovider activation from a prior boot ---
# Two different prior bugs both landed here: (1) a build function that
# could report success even when the build failed, activating a provider
# module that was never built; (2) a build that WAS present on disk but
# failed to actually load at OpenSSL init ("library has no ciphers") for
# reasons that don't matter here — either way OpenSSL fails to
# initialize for EVERY process on the box, including sshd's
# per-connection crypto init ("PRNG is not seeded"), locking out SSH.
#
# Rather than re-guessing every way this module can be broken, detect it
# the same way OpenSSL itself will: try to actually test the Nginx TLS
# config with the current openssl.cnf. If that fails while our marker is
# present, strip the activation unconditionally — regardless of whether
# the .so file exists, is corrupt, or is merely incompatible.
OPENSSL_CNF="/etc/ssl/openssl.cnf"
PQC_MARKER="# managed-by-terraform: oqsprovider activation"
PQC_GROUPS_CONF="/etc/nginx/conf.d/pqc-groups.conf"
MODULES_DIR="$(openssl version -m | sed -E 's/^MODULESDIR: "(.*)"$/\1/')"
NEEDS_SERVICE_RECOVERY=false

if grep -qF "$PQC_MARKER" "$OPENSSL_CNF" 2>/dev/null && ! nginx -t >/dev/null 2>&1; then
  sed -i "/^$(printf '%s' "$PQC_MARKER" | sed 's/[.[\*^$/]/\\&/g')\$/,\$d" "$OPENSSL_CNF"
  rm -f "$MODULES_DIR/oqsprovider.so"
  logger -t startup-script "repaired broken oqsprovider activation in $OPENSSL_CNF (nginx -t failed with it active)"
  NEEDS_SERVICE_RECOVERY=true
fi

# Same story for the Nginx group directive: a prior boot could write
# ssl_ecdh_curve referencing X25519MLKEM768 and nothing ever cleaned it
# up afterwards once the provider backing it got removed just above (the
# stage that (re)writes it only fires when the group ISN'T already there).
if [ -f "$PQC_GROUPS_CONF" ] && grep -qF "X25519MLKEM768" "$PQC_GROUPS_CONF" && [ ! -f "$MODULES_DIR/oqsprovider.so" ]; then
  rm -f "$PQC_GROUPS_CONF"
  logger -t startup-script "removed stale $PQC_GROUPS_CONF referencing X25519MLKEM768 (provider not active)"
  NEEDS_SERVICE_RECOVERY=true
fi

if [ "$NEEDS_SERVICE_RECOVERY" = true ]; then
  # ssh.service and nginx.service both initialize OpenSSL at their own
  # startup (well before this script runs, during normal systemd boot).
  # With the broken config still on disk at THAT point, both failed to
  # start and tripped systemd's restart-rate-limit, so they're stuck
  # "failed" for the rest of this boot even now that the file is fixed —
  # nothing else would ever restart them otherwise.
  systemctl reset-failed ssh.service nginx.service 2>/dev/null || true
  systemctl restart ssh || true
  systemctl restart nginx || true
fi

# --- Stage 1: base packages (apt install is naturally idempotent) ---
# Node.js is NOT installed from apt here: Ubuntu 24.04 ships Node 18.19, but
# next@16 requires engines.node >= 20.9.0. Stage 1b installs Node 24 LTS from
# NodeSource instead.
apt-get update
apt-get install -y nginx fail2ban snapd curl ca-certificates

# --- Stage 1b: Node.js 24 LTS from NodeSource ---
# Guard checks the installed MAJOR version, not merely that `node` exists, so a
# pre-existing Node 18 (from a prior boot's apt package) or an older LTS is
# upgraded, not skipped. A re-run once Node >= 24 is in place is a no-op.
# Live check (after a VM rebuild): `node --version` must report >= v24.0.0.
NODE_MAJOR_REQUIRED=24
installed_node_major() {
  command -v node >/dev/null 2>&1 && node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0
}
if [ "$(installed_node_major)" -lt "$NODE_MAJOR_REQUIRED" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_$${NODE_MAJOR_REQUIRED}.x" | bash -
  apt-get install -y nodejs
fi

# --- Stage 2: SSH hardening — disable password authentication ---
SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_MARKER="# managed-by-terraform: disable password auth"
if ! grep -qF "$SSHD_MARKER" "$SSHD_CONFIG"; then
  {
    echo ""
    echo "$SSHD_MARKER"
    echo "PasswordAuthentication no"
  } >> "$SSHD_CONFIG"
  systemctl reload ssh
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

# --- Stage 5b: hide the Nginx version in the Server header (server_tokens off) ---
# Dropped into conf.d (included from the stock nginx.conf http{} block) so the
# directive applies to every server block, present and future.
TOKENS_CONF="/etc/nginx/conf.d/server-tokens.conf"
if [ ! -f "$TOKENS_CONF" ]; then
  echo "server_tokens off;" > "$TOKENS_CONF"
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
# Guard against an empty $PUBLIC_IP (metadata query raced/failed): an empty
# needle makes `grep -q "$PUBLIC_IP"` match ANY non-empty `certbot certificates`
# output, which previously short-circuited straight to CERT_OBTAINED=true
# without ever obtaining a real cert — baking a broken
# "/etc/letsencrypt/live//fullchain.pem" path into the HTTPS vhost.
if [ -z "$PUBLIC_IP" ]; then
  CERT_OBTAINED=false
  logger -t startup-script "PUBLIC_IP metadata query returned empty; skipping certbot, leaving nginx on HTTP-only"
elif ! certbot certificates 2>/dev/null | grep -q "$PUBLIC_IP"; then
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
# Rewrite whenever the file is missing OR still points at a stale IP (e.g.
# after the instance's public IP changed) — grep-checking the live file's
# own cert path instead of only "does the file exist" keeps this idempotent
# across an IP change, not just across a no-op reboot.
if [ "$CERT_OBTAINED" = true ] && { [ ! -f "$HTTPS_SITE" ] || ! grep -qF "/etc/letsencrypt/live/$PUBLIC_IP/" "$HTTPS_SITE"; }; then
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

# --- Stage 8b: PQC (post-quantum) hybrid key exchange for Nginx TLS ---
# PRD requires the TLS server test to show a PQC hybrid group active
# (X25519MLKEM768 — ML-KEM-768 per FIPS 203, hybridized with X25519).
# Ubuntu 24.04 ships OpenSSL 3.0.13, which has no ML-KEM/Kyber groups at
# all — this must come from a provider, not a config directive alone.
# oqs-provider (Open Quantum Safe) is a dynamically loaded OpenSSL 3
# provider: install it once, register it in openssl.cnf, and every
# process linked against system libssl (nginx included) gains the new
# group with no nginx recompile.
#
# Building liboqs+oqs-provider FROM SOURCE on this box was tried and
# abandoned: liboqs alone is ~2700 translation units, and e2-micro's
# shared vCPU + 1 GiB RAM couldn't get through that in any reasonable
# boot time (observed: still <2% done after several minutes; trimming
# liboqs's build to save time broke oqs-provider's compile instead, since
# its generated algorithm tables unconditionally reference every liboqs
# SIG symbol regardless of what's actually enabled). Instead the binary
# is built once, offline, on a matching-glibc (Ubuntu 24.04) environment
# and uploaded to the private GCS bucket in infra/artifacts.tf
# (google_storage_bucket.vm_assets) — the VM authenticates the download
# via `gcloud storage cp`, which picks up its own attached service
# account automatically (objectViewer scoped to just this bucket). No
# CI dependency and no new credential/secret to manage: the VM already
# carries this identity via the `cloud-platform` scope in compute.tf.
#
# Isolated in a function called from `if`, so a download failure (network
# hiccup, object not yet uploaded) can never abort the rest of this
# script via `set -e` — the app must still deploy either way. Every step
# is chained with explicit `|| return 1` rather than relying on `set -e`
# alone: this function is invoked as an `if` condition, and bash
# suppresses errexit for the entire command tested by `if` — a command
# failing partway through would otherwise be silently ignored and the
# function's return status would come from whatever ran last (this exact
# bug previously made a failed build report success and corrupt
# openssl.cnf, breaking OpenSSL — and SSH — machine-wide; see Stage 0).
setup_pqc_provider() {
  local modules_dir
  modules_dir="$(openssl version -m | sed -E 's/^MODULESDIR: "(.*)"$/\1/')"
  [ -f "$modules_dir/oqsprovider.so" ] && return 0

  if ! command -v gcloud >/dev/null 2>&1; then
    command -v gpg >/dev/null 2>&1 || apt-get install -y gnupg || return 1
    install -d -m 0755 /usr/share/keyrings || return 1
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg || return 1
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list || return 1
    apt-get update || return 1
    apt-get install -y google-cloud-cli || return 1
  fi

  local asset="oqsprovider-ubuntu24.04-amd64.tar.gz"

  local tmp_dir
  tmp_dir="$(mktemp -d)" || return 1

  # DNS/network isn't always up yet this early in boot (the same class of
  # flakiness Stage 1's apt-get update hits) — retry a few times with a
  # short backoff instead of giving up on the first transient failure.
  local attempt
  for attempt in 1 2 3 4 5; do
    gcloud storage cp "gs://${oqs_artifacts_bucket}/$asset" "$tmp_dir/$asset" && break
    [ "$attempt" -eq 5 ] && { rm -rf "$tmp_dir"; return 1; }
    sleep 10
  done
  tar -C "$tmp_dir" -xzf "$tmp_dir/$asset" || { rm -rf "$tmp_dir"; return 1; }

  [ -f "$tmp_dir/oqsprovider.so" ] || { rm -rf "$tmp_dir"; return 1; }
  install -m 0644 "$tmp_dir/oqsprovider.so" "$modules_dir/oqsprovider.so" || { rm -rf "$tmp_dir"; return 1; }
  # oqsprovider.so dynamically links against liboqs's shared lib; the
  # release ships the exact .so (and its SONAME symlink) it was built
  # against, so it must land in the runtime linker path too.
  cp -P "$tmp_dir"/liboqs.so* /usr/local/lib/ || return 1
  ldconfig
  rm -rf "$tmp_dir"

  # Load the module standalone, BEFORE ever touching the global
  # openssl.cnf: a provider that dlopens fine but fails at OpenSSL init
  # (ABI mismatch, missing symbol, whatever) must never reach system-wide
  # config, since that breaks OpenSSL — and SSH — for every process on
  # the box (Stage 0 exists only because this validation didn't, once).
  if ! openssl list -provider oqsprovider -providers 2>&1 | grep -qi oqsprovider; then
    rm -f "$modules_dir/oqsprovider.so" /usr/local/lib/liboqs.so*
    return 1
  fi

  return 0
}

if setup_pqc_provider; then
  if ! grep -qF "$PQC_MARKER" "$OPENSSL_CNF"; then
    # Fully self-contained rather than "just add oqsprovider to whatever
    # provider_sect already exists": an earlier version assumed Ubuntu's
    # stock openssl.cnf already wires up `[provider_sect] default =
    # default_sect` and only appended the oqsprovider line — but if that
    # scaffolding ISN'T already there, this append becomes the ONLY
    # provider_sect definition, activating oqsprovider alone and
    # switching the default provider off entirely ("library has no
    # ciphers": no cipher/algorithm providers left active at all).
    # Re-declaring openssl_conf/openssl_init here and explicitly listing
    # both default and oqsprovider is correct regardless of what the
    # stock file already had: OpenSSL config sections are cumulative
    # when reopened by name, and a later scalar assignment (openssl_conf)
    # wins over an earlier one.
    cat >> "$OPENSSL_CNF" <<EOF

$PQC_MARKER
openssl_conf = openssl_init

[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect
oqsprovider = oqsprovider_sect

[default_sect]
activate = 1

[oqsprovider_sect]
activate = 1
EOF
  fi

  PQC_GROUPS_CONF="/etc/nginx/conf.d/pqc-groups.conf"
  PQC_GROUPS_LINE="ssl_ecdh_curve X25519MLKEM768:x25519:prime256v1;"
  if [ ! -f "$PQC_GROUPS_CONF" ] || ! grep -qF "$PQC_GROUPS_LINE" "$PQC_GROUPS_CONF"; then
    echo "$PQC_GROUPS_LINE" > "$PQC_GROUPS_CONF"
    nginx -t && systemctl reload nginx
  fi
  logger -t startup-script "PQC (X25519MLKEM768) provider active"
else
  logger -t startup-script "oqs-provider build failed; leaving TLS on classical groups only"
fi

# --- Stage 9: dedicated app service user + PM2 install + systemd registration ---
# The app runs as `appsvc`, a locked system user decoupled from any human
# operator: CI connects over IAP as its own ephemeral login user (in
# google-sudoers) and hands ownership of /opt/app to appsvc, which is what PM2
# runs as. Created idempotently.
id appsvc >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin appsvc

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

PM2_UNIT="/etc/systemd/system/pm2-appsvc.service"
if [ ! -f "$PM2_UNIT" ]; then
  # appsvc has a nologin shell, so `su -` fails — use runuser to grab the
  # `sudo ...` line `pm2 startup` prints and eval it.
  PM2_STARTUP_CMD="$(runuser -u appsvc -- pm2 startup systemd -u appsvc --hp /home/appsvc | grep '^sudo ' || true)"
  if [ -n "$PM2_STARTUP_CMD" ]; then
    eval "$PM2_STARTUP_CMD"
  fi
fi

# --- Stage 10: PM2 app directory + Nginx reverse proxy to the app ---
# ecosystem.config.js is written to the VM here because
# infra/scripts/ecosystem.config.js never gets uploaded to the VM's
# filesystem on its own (startup.sh.tpl is rendered into instance metadata
# as a string). Its content is injected verbatim below via the
# $${ecosystem_config} template variable, which Terraform fills from
# infra/scripts/ecosystem.config.js at apply time — no manual copy to keep
# in sync.
mkdir -p /opt/app
# Owned by appsvc, which PM2 runs as. The IAP deploy connects as an ephemeral
# sudo-capable user and writes releases with `sudo install -o appsvc`.
chown -R appsvc:appsvc /opt/app
# Rewritten unconditionally on every boot: this file is the source of truth for
# how PM2 launches the app, and an older VM may still carry a stale copy from a
# previous provisioning. A `[ ! -f ]` guard would pin that stale copy forever.
cat > /opt/app/ecosystem.config.js <<'EOF'
${ecosystem_config}
EOF
chown appsvc:appsvc /opt/app/ecosystem.config.js

# Write the reverse-proxy vhost when the file is still the stage-7 placeholder,
# OR when it is a proxy vhost that predates the X-Forwarded-Proto headers below
# (without which proxy.ts 403s every state-changing /api/* request). The cert
# path is already kept fresh by stage 7, so $PUBLIC_IP is current here.
if [ -f "$HTTPS_SITE" ] && \
   { grep -qF "# managed-by-terraform: proxy-placeholder" "$HTTPS_SITE" || \
     { grep -qF "# managed-by-terraform: nextjs-reverse-proxy" "$HTTPS_SITE" && \
       ! grep -qF "X-Forwarded-Proto" "$HTTPS_SITE"; }; }; then
  cat > "$HTTPS_SITE" <<EOF
# managed-by-terraform: https site
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;

    ssl_certificate     /etc/letsencrypt/live/$PUBLIC_IP/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PUBLIC_IP/privkey.pem;

    location / {
        # managed-by-terraform: nextjs-reverse-proxy
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        # The app derives its own origin (proxy.ts same-origin / CSRF check) and
        # the client IP (rate limiter) from these — without them Next sees
        # scheme http + host localhost:3000 and every POST /api/* is a 403.
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
  nginx -t && systemctl reload nginx
fi
