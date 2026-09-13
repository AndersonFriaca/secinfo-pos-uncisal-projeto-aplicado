# CLAUDE.md

Instructions for Claude Code (or any agent) working in this repository.

## Starting / stopping `app-vm`

**Never run `gcloud compute instances start/stop app-vm` directly, and never run raw `gcloud compute addresses create/delete` for it either.** Always use:

```bash
./ops/vm-start.sh   # reserves a static IP, attaches it, starts the instance
./ops/vm-stop.sh    # stops the instance, detaches and releases the static IP
```

**Why:** the instance's Terraform config (`infra/compute.tf`) intentionally uses an **ephemeral** external IP, not a reserved one — see `.specs/features/gcp-infra-terraform/design.md`'s "Reserved (static) IP — tried and reverted" note. GCP bills a reserved static IP whenever it isn't attached to a *running* instance. Reserving one only for the window the VM is actually up (and releasing it the moment it's stopped) is the only way to get a stable public IP while the VM is on **and** stay fully within the Always Free tier while it's off. Starting/stopping the instance without also reserving/releasing the IP through these scripts will either leave a static IP quietly billing, or leave the instance briefly without the expected access-config.

Both scripts read `project_id`/`region`/`zone` from `infra/terraform.tfvars` (gitignored, operator-local) — never hardcode the GCP project ID anywhere in a committed file, since this repository is public per the course's requirements. The same applies to `infra/backend.tf`: the state bucket name (which embeds the project ID) is supplied via a gitignored `infra/backend.hcl` at `terraform init -backend-config=backend.hcl` time, never hardcoded in the committed `backend.tf`.

**Drift note:** while the VM is running via `ops/vm-start.sh`, its access-config is imperatively pointed at a reserved IP that Terraform doesn't know about (`infra/compute.tf`'s `network_interface` stays declared as ephemeral). Running `terraform apply` on `infra/` while the VM is up will swap it back to ephemeral (harmless — `ops/vm-stop.sh` would have released the reservation anyway — but it does mean the IP changes if you apply mid-session).

## Terraform: two separate roots

- `infra/bootstrap/` — the GCS state bucket and the billing budget alert. Applied once, rarely touched again, deliberately **not** destroyed by anything in `infra/`.
- `infra/` — the actual billable resources (VPC, firewall, compute instance). This is what `terraform destroy` inside `infra/` tears down; it never reaches into `infra/bootstrap/`.

Full deploy/teardown steps are in `README.md`. Full requirements/design history is in `.specs/features/gcp-infra-terraform/`.

## Real-deployment corrections worth knowing before touching `infra/scripts/startup.sh.tpl`

Bugs found only by actually applying this against a live GCP project — not visible from reading the Terraform alone:

1. Ubuntu 24.04's systemd unit for SSH is `ssh.service`, not `sshd.service`. `systemctl reload sshd` fails and (under `set -euo pipefail`) kills the entire startup script silently.
2. The HTTPS Nginx server block embeds the current public IP into its `ssl_certificate` path at creation time. The idempotency guard must check that the file's embedded IP still matches the current public IP — not just that the file exists — or an IP change (e.g. after a stop/start cycle) leaves Nginx pointing at a stale, non-existent cert path.
3. `/opt/app/ecosystem.config.js` must be written **unconditionally** on every boot, not behind a `[ ! -f ]` guard. A VM first provisioned with an early version of the file (which ran `pm2 start npm -- start`) kept that stale copy through every later `terraform apply` + reboot; the first real CI deploy then crash-looped on `ENOENT /opt/app/package.json` and Nginx served 502. `deploy.yml` also scp's this file on every deploy, and the PM2 reload is `pm2 delete` + `pm2 start` (not `pm2 reload`, which keeps a running app's cached script/interpreter args).
4. `next build` nests the standalone output under `.next/standalone/web/` because the app is in the `web/` workspace — `server.js`, its `node_modules`, and its `.next/` are all one level down, and `.next/static` / `public/` are not copied in at all. `deploy.yml`'s assemble step takes `.next/standalone/web` as the archive root and re-adds static/public; a naive `cp -r .next/standalone/. bundle/` puts `server.js` at `bundle/web/server.js` and PM2 fails with `Script not found: /opt/app/current/server.js`.
5. The Nginx reverse-proxy `location /` must forward `X-Forwarded-Proto` (and `X-Forwarded-Host` / `X-Forwarded-For`). `proxy.ts` builds its same-origin / CSRF comparison from `request.nextUrl` — without `X-Forwarded-Proto: https` Next assumes `http://` and every `POST /api/auth/*` 403s because the browser `Origin` is `https://`. `X-Forwarded-For` also feeds the rate limiter's client-IP resolution. The stage-10 vhost rewrite guard re-fires on a proxy vhost missing `X-Forwarded-Proto`, so rebooting upgrades an older VM.

All fixed in the committed script + `deploy.yml`; mentioned here so a future edit doesn't reintroduce any of these patterns.
