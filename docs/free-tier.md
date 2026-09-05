# Staying in GCP's Always Free tier

Every setting below is pinned explicitly in code — never left to a provider
default — because a default is exactly where a silent charge sneaks in.
Verified against Google's own Always Free documentation, not assumed.

| Setting | Value | Why it matters |
| --- | --- | --- |
| Compute instance | `e2-micro` in `us-east1-b` | Always Free covers exactly 1 non-preemptible e2-micro/month, only in `us-west1` / `us-central1` / `us-east1` |
| Boot disk | `pd-standard`, 30 GB | Always Free covers 30 GB-months of standard persistent disk; SSD or a larger size bills |
| Network tier | `STANDARD` (not the provider's `PREMIUM` default) | Standard Tier carries its own separate 200 GB/month/region free egress allowance (since Oct 2023) — larger than Premium's classic 1 GB/month Always Free line item |
| External IP | **Ephemeral**, not reserved | A reserved static IP bills whenever it isn't attached to a *running* instance — see below |
| Ops Agent | Not installed | Cloud Monitoring/Logging agent ingestion isn't part of Always Free and bills per GB/metric |
| Disk snapshots | None configured | Snapshot storage bills per GB regardless of the boot disk's free allowance |
| Shielded VM | Enabled | Free security feature — not a cost line item either way |
| State bucket | `us-east1`, single-region | Always Free covers 5 GB-months of regional storage only in `us-west1` / `us-central1` / `us-east1`; multi-region `"US"` doesn't qualify |
| Billing budget | Free to run | The Cloud Billing Budget API costs nothing; see below |

## The static-IP lesson (found by actually paying attention)

A reserved (`google_compute_address`) IP was tried first, so the VM would
keep the same address across restarts. It was reverted once the operator
started routinely **stopping the VM to save cost**: GCP only exempts a
static IP from billing while it's attached to a **running** instance — a
reservation left on a *stopped* VM is not "in use" and starts accruing
charges. That directly defeats the point of stopping the VM.

The fix wasn't to give up on a stable IP, but to move the reserve/release
cycle out of Terraform (which has no "on start/stop" hook) into
`ops/vm-start.sh` / `ops/vm-stop.sh` — see
[operations.md](operations.md#starting-and-stopping-the-vm). The
instance's own `network_interface` in `infra/compute.tf` stays ephemeral;
the scripts layer a temporary reservation on top only while the VM is
actually up.

## Billing budget

`infra/bootstrap/billing.tf` creates a `google_billing_budget` scoped to
this project only, with four escalating alert thresholds (50% / 90% /
100% / 150%) — the pattern is taken directly from
[eatonc/actual-gcp](https://github.com/eatonc/actual-gcp), a Terraform
reference repo built specifically for staying inside GCP's free tier.

**This is detection, not prevention.** `google_billing_budget` emails the
billing account's administrators at each threshold; it does not stop
resource creation or cap spend on its own. It's the backstop that catches
whatever the settings above miss — not a substitute for them.

The variable defaults (`billing_alert_currency_code = "USD"`,
`billing_alert_amount = "5"`) assume a USD billing account. **The
`currency_code` must match your billing account's own currency exactly** —
check with `gcloud billing accounts describe <account-id>`. A mismatch
fails with a `400` error at apply time. Override both variables in your
own gitignored `infra/bootstrap/terraform.tfvars` if your account uses a
different currency; there's nothing to change in the committed code.
