#!/bin/bash
# Starts app-vm with a freshly reserved static external IP.
#
# Terraform's network_interface is deliberately left ephemeral (see
# design.md's "Reserved (static) IP — tried and reverted" note): a
# reservation left in place while the VM is stopped gets billed by GCP
# ("in use" requires a *running* instance). So the reserve/attach dance
# lives here, imperatively, only for the window the VM is actually up —
# not in Terraform state.
#
# Project/region/zone are read from infra/terraform.tfvars (gitignored,
# operator-local) — never hardcoded here, since this script is committed
# to a public repo and the GCP project ID must not be published.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TFVARS="$SCRIPT_DIR/../infra/terraform.tfvars"

tfvar() {
  # Reads a simple `key = "value"` line from terraform.tfvars.
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

echo "==> Reserving static IP ($ADDRESS_NAME) if not already reserved..."
if ! gcloud compute addresses describe "$ADDRESS_NAME" --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME" \
    --project="$PROJECT" \
    --region="$REGION" \
    --network-tier=STANDARD
else
  echo "    already reserved."
fi

RESERVED_IP="$(gcloud compute addresses describe "$ADDRESS_NAME" \
  --project="$PROJECT" --region="$REGION" --format="value(address)")"
echo "    reserved IP: $RESERVED_IP"

echo "==> Pointing the instance's access-config at the reserved IP..."
gcloud compute instances delete-access-config "$INSTANCE" \
  --project="$PROJECT" --zone="$ZONE" \
  --access-config-name="External NAT" 2>/dev/null || true

gcloud compute instances add-access-config "$INSTANCE" \
  --project="$PROJECT" --zone="$ZONE" \
  --access-config-name="External NAT" \
  --address="$RESERVED_IP" \
  --network-tier=STANDARD

echo "==> Starting the instance..."
gcloud compute instances start "$INSTANCE" --project="$PROJECT" --zone="$ZONE"

echo "==> Done. app-vm is up at https://$RESERVED_IP"
