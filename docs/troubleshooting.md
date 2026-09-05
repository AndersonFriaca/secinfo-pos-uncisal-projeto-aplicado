# Troubleshooting

## How to look, before guessing

```bash
# Boot-time script output — works even if SSH is broken:
gcloud compute instances get-serial-port-output app-vm --zone=<zone> --project=<project_id> \
  | grep -iE "startup-script|error|failed"

# SSH via gcloud's own managed key — bypasses a passphrase-locked local key:
gcloud compute ssh <ssh_username>@app-vm --zone=<zone> --project=<project_id>
```

Search for `Script "startup-script" failed with error: exit status N` in
the serial log — that means `set -euo pipefail` killed the script at
whichever stage came right before it, and **every later stage never ran**
(no Fail2ban, no cert, no PM2, depending on how early it died).

## Two real bugs, found only by deploying for real

Both were invisible from reading the Terraform/shell alone — they only
showed up once the VM actually booted.

### 1. `systemctl reload sshd` fails on Ubuntu 24.04

**Symptom:** the startup script dies immediately after Stage 2 (SSH
hardening); Fail2ban, Certbot, and PM2 never run; HTTP serves Nginx's
default page instead of the real site.

**Cause:** Ubuntu 24.04's systemd unit for SSH is named `ssh.service`, not
`sshd.service`. `reload sshd` fails with `Unit sshd.service not found`,
and under `set -e` that kills the whole script.

**Fix (already applied):** `infra/scripts/startup.sh.tpl` uses
`systemctl reload ssh`.

### 2. Nginx keeps a stale certificate path after the IP changes

**Symptom:** Certbot successfully issues a certificate for the VM's
*current* IP, but HTTPS still fails or serves a nonexistent cert — `nginx
-T` shows `ssl_certificate` pointing at `/etc/letsencrypt/live/<old-ip>/`.

**Cause:** the HTTPS server block is written once and guarded only by "does
the file exist" — after the very first successful boot, later boots (e.g.
after switching to a different IP) skip rewriting it, even though a fresh
certificate was issued for the new IP.

**Fix (already applied):** the guard also rewrites the file when its
embedded IP no longer matches the current one:

```bash
if [ "$CERT_OBTAINED" = true ] && { [ ! -f "$HTTPS_SITE" ] || ! grep -qF "/etc/letsencrypt/live/$PUBLIC_IP/" "$HTTPS_SITE"; }; then
```

If you ever see this symptom again on a modified script, check that
whichever "already configured" guard you added checks the *content*
matches the current state, not just that a file is present.

## Common apply-time errors

| Error | Cause | Fix |
| --- | --- | --- |
| `googleapi: Error 403 ... requires a quota project` | Application Default Credentials have no quota project set | `gcloud auth application-default set-quota-project <project-id>` |
| `googleapi: Error 403 ... Cloud Billing API has not been used` / `Cloud Resource Manager API has not been used` | `user_project_override = true` on the provider means *every* API call now needs the caller project's own APIs enabled | `gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project=<project-id>` |
| `googleapi: Error 403 ... Compute Engine API has not been used` | `compute.googleapis.com` not enabled yet | `gcloud services enable compute.googleapis.com --project=<project-id>` |
| `Error creating Budget: ... Error 400` with no further detail | `billing_alert_currency_code` doesn't match the billing account's actual currency | `gcloud billing accounts describe <account-id>` to check, then set the matching currency in `infra/bootstrap/terraform.tfvars` |
| `Changing the machine_type, ... shielded_instance_config, ... network_interface ... on a started instance requires stopping it` | An in-place change needs the instance stopped first | Already handled — `allow_stopping_for_update = true` is set on the instance |
| SSH `Permission denied (publickey)` right after the metadata shows the key is correct | The guest agent hasn't propagated the key to the VM yet, or your local private key needs a passphrase your shell can't supply | Wait ~30s and retry, or use `gcloud compute ssh` (uses its own managed key, sidesteps a locked local key) |
