# Operations

## Starting and stopping the VM

**Always use the `ops/` scripts — never `gcloud compute instances
start/stop` directly.**

```bash
./ops/vm-start.sh   # reserves a static IP, attaches it, starts the instance
./ops/vm-stop.sh    # stops the instance, detaches and releases the static IP
```

Why this matters: `infra/compute.tf` deliberately leaves the instance's
external IP **ephemeral** in Terraform — a *reserved* static IP is billed
by GCP whenever it isn't attached to a **running** instance, which
conflicts directly with stopping the VM between uses to save cost.
Terraform has no "on instance start/stop" hook, so the reserve → attach →
start (and the mirror: stop → detach → release) sequence lives in these two
scripts instead, imperatively, only for the window the VM is actually up.

Both scripts read `project_id` / `region` / `zone` from the gitignored
`infra/terraform.tfvars` — the GCP project ID is never hardcoded in a
committed file.

**Drift note:** while the VM is running via `vm-start.sh`, its access-config
points at a reservation Terraform doesn't know about. Running `terraform
apply` on `infra/` while the VM is up will swap it back to ephemeral
(harmless, but the IP changes). Prefer stopping the VM with `vm-stop.sh`
before running Terraform changes against `infra/`.

## Health checks

SSH in. Unless the caller's IP is in `operator_ssh_cidrs`, there is no
public `:22`, so go through the IAP tunnel — the calling principal needs
`roles/iap.tunnelResourceAccessor` (Owner works too, with a self-grant):

```bash
gcloud compute ssh <ssh_username>@app-vm --zone=<zone> --project=<project_id> --tunnel-through-iap
```

Then, on the VM:

```bash
sudo systemctl is-active nginx fail2ban        # both should print "active"
sudo fail2ban-client status sshd               # shows ban count, currently-banned IPs
pm2 list                                       # PM2's process table (empty until an app is deployed)
sudo certbot certificates                      # current cert, expiry date
systemctl list-timers | grep certbot           # confirms the renewal timer is scheduled
sudo nginx -T | grep -E 'listen|proxy_pass|ssl_certificate'
```

To test renewal without waiting for it to actually fire:

```bash
sudo certbot renew --dry-run
```

## Reading the boot log

If something looks wrong right after a boot (HTTP not responding, HTTPS
missing), the startup script's own output is in the serial console —
useful because it doesn't require SSH to already be working:

```bash
gcloud compute instances get-serial-port-output app-vm --zone=<zone> --project=<project_id> \
  | grep -iE "startup-script|fail2ban|certbot|error|failed"
```

Look for `Script "startup-script" failed with error` — that means `set -e`
killed the script partway through, and everything after the failing stage
never ran. See [troubleshooting.md](troubleshooting.md) for the two real
cases of this found so far.

## Teardown

Remove every billable resource with a single command in the main root:

```bash
cd infra
terraform destroy
```

This removes the compute instance, its boot disk, all three firewall
rules, and the custom VPC/subnet — everything declared in `infra/`'s
state. No resource there sets `lifecycle { prevent_destroy = true }`, so
this always completes fully; nothing can abort the plan partway through.

**The state bucket and the billing budget are never touched.** They live
exclusively in `infra/bootstrap/`, a separate root outside `infra/`'s
state — not merely protected, structurally unreachable from that command.
The billing budget is free, so it's designed to keep alerting at the same
thresholds even with zero billable resources left in the project, catching
anything created later by hand or by a future `terraform apply`.

To also remove the bucket and/or budget, that's a second, deliberate,
separate command:

```bash
cd infra/bootstrap
terraform destroy
```

This does not delete the GCP project itself — only these two resources.
