#!/bin/bash
# Stops app-vm and releases its reserved static external IP.
#
# GCP bills a reserved static IP whenever it isn't attached to a *running*
# instance — so to actually save the cost while the VM is off, the
# reservation must be released, not just left attached to a stopped VM.
# This is the mirror of ops/vm-start.sh's reserve-then-attach dance.
#
# Project/region/zone are read from infra/terraform.tfvars (gitignored,
# operator-local) — never hardcoded here, since this script is committed
# to a public repo and the GCP project ID must not be published.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TFVARS="$SCRIPT_DIR/../infra/terraform.tfvars"

tfvar() {
  local key="$1"
  grep -E "^\s*${key}\s*=" "$TFVARS" | head -1 | sed -E 's/^[^=]+=\s*"([^"]*)".*/\1/'
}

if [ ! -f "$TFVARS" ]; then
  echo "error: $TFVARS not found. Copy terraform.tfvars.example to infra/terraform.tfvars and fill it in first." >&2
  exit 1
fi

PROJECT="$(tfvar project_id)"
ZONE="$(tfvar zone)"
REGION="$(tfvar region)"
INSTANCE="app-vm"
ADDRESS_NAME="app-vm-ip"

if [ -z "$PROJECT" ] || [ -z "$ZONE" ] || [ -z "$REGION" ]; then
  echo "error: project_id/zone/region missing or empty in $TFVARS" >&2
  exit 1
fi

echo "==> Stopping the instance..."
gcloud compute instances stop "$INSTANCE" --project="$PROJECT" --zone="$ZONE"

echo "==> Detaching the reserved IP (switching the instance back to ephemeral)..."
gcloud compute instances delete-access-config "$INSTANCE" \
  --project="$PROJECT" --zone="$ZONE" \
  --access-config-name="External NAT" 2>/dev/null || true

echo "==> Releasing the reserved IP ($ADDRESS_NAME) if it exists..."
if gcloud compute addresses describe "$ADDRESS_NAME" --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute addresses delete "$ADDRESS_NAME" \
    --project="$PROJECT" --region="$REGION" --quiet
else
  echo "    nothing reserved."
fi

echo "==> Done. app-vm is stopped and no static IP is being billed."
