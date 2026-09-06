# Projeto Aplicado — GCP Infrastructure

Infrastructure as Code (Terraform) for a hardened, free-tier GCP hosting
environment for the project's Next.js application. See [`prd.md`](prd.md)
for the full course requirements (Eixo 1: Cloud Infra).

This repository provisions the infra layer only — the application itself is
built in a separate feature. A hardened `e2-micro` VM serves HTTPS (real
Let's Encrypt certificate, no domain needed) via Nginx, with SSH locked to
key-only access, Fail2ban, and Shielded VM enabled, all pinned to stay
inside GCP's Always Free tier.

**📚 Full documentation is in [`docs/`](docs/)** — architecture, deployment
steps, day-to-day operations, security rationale, the free-tier checklist,
and a troubleshooting guide built from real bugs found deploying this.

## Quickstart

```bash
gcloud auth login
cp terraform.tfvars.example infra/terraform.tfvars        # fill in your values
cp infra/backend.hcl.example infra/backend.hcl            # bucket name comes from step 2

# 1. Bootstrap (state bucket + billing budget — persistent, never destroyed)
cd infra/bootstrap && terraform init && terraform apply

# 2. Point the main root at the remote backend (bucket name from step 1's output)
cd ../ && terraform init -backend-config=backend.hcl -migrate-state

# 3. Deploy the VM, network, firewall
terraform apply
```

Full walkthrough, variable reference, and verification steps:
[`docs/deployment.md`](docs/deployment.md).

## Everyday use

```bash
./ops/vm-start.sh   # start the VM (reserves + attaches a static IP for this session)
./ops/vm-stop.sh    # stop the VM (releases the IP — nothing left billing)
```

See [`docs/operations.md`](docs/operations.md) for health checks,
teardown, and why starting/stopping goes through these scripts instead of
plain `gcloud compute instances start/stop`.

## Repository layout

```
web/               Next.js 16 application (SSR, TypeScript) — see docs/application.md
infra/bootstrap/   Persistent Terraform root: state bucket, billing budget
infra/             Main Terraform root: VPC, firewall, compute instance
infra/scripts/     Startup script + PM2 config, rendered onto the VM
ops/               Operator scripts (start/stop the VM with a static IP)
.github/workflows/ CI (tests on PR) and deploy (on merge to main) pipelines
docs/              Full documentation — start here
.specs/            Planning history: requirements, design, tasks, verification report
CLAUDE.md          Operating notes for AI agents working in this repo
prd.md             Course requirements this project is graded against
```

## Application security (OWASP Top 10)

The Next.js app in `web/` implements active mitigations for four OWASP Top
10:2025 categories. Each entry names the mechanism and the file that carries
it.

### Identification and Authentication Failures

- **Brute-force IP block.** Five consecutive failed logins from one IP block
  that IP for 60 seconds; the counter resets on success or when the block
  expires. The decision logic (thresholds injected, clock injected) is in
  [`web/lib/security/rate-limit-core.ts`](web/lib/security/rate-limit-core.ts);
  the Firestore-backed store with an in-process cache that rejects an
  already-blocked IP without a database round-trip is in
  [`web/lib/security/rate-limit.ts`](web/lib/security/rate-limit.ts). It is
  wired into the login route at
  [`web/app/api/auth/login/route.ts`](web/app/api/auth/login/route.ts).
  Client-IP resolution
  ([`web/lib/security/rate-limit.ts`](web/lib/security/rate-limit.ts)) trusts the
  left-most `X-Forwarded-For` entry. This is only safe because the VM's Nginx
  reverse proxy is the sole ingress and overwrites that header on every request;
  if the app were ever exposed directly, a client could spoof `X-Forwarded-For`
  to evade or misattribute the IP block.
- **Generic authentication errors.** Every upstream credential error collapses
  to one message, so an unknown email and a wrong password are
  indistinguishable — no account enumeration. See
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts).
- **Password policy.** Minimum 12 characters with lower, upper, digit, and
  symbol, enforced server-side before any Identity Platform call, in
  [`web/lib/validation/credentials.ts`](web/lib/validation/credentials.ts).

### Broken Access Control

- **Server-side session verification on every protected request.** The
  dashboard calls `getAuthenticatedUser`, which verifies the Firebase session
  cookie with `checkRevoked: true` and requires a verified email — no cached
  client-side flag. Logic in
  [`web/lib/auth/session.ts`](web/lib/auth/session.ts); enforced at
  [`web/app/dashboard/page.tsx`](web/app/dashboard/page.tsx).
- **CSRF protection.** State-changing requests must present a CSRF token that
  matches a `SameSite=Strict` cookie, compared in constant time, plus a
  same-origin check on `Origin`/`Referer`. Token logic in
  [`web/lib/security/csrf.ts`](web/lib/security/csrf.ts); enforcement in
  [`web/proxy.ts`](web/proxy.ts).

### Security Misconfiguration

- **OWASP response-header set.** A nonce-based Content-Security-Policy (no
  `unsafe-inline`/`unsafe-eval`), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  all three `Cross-Origin-*` headers, and `Cache-Control: no-store` on
  sensitive responses. Built in
  [`web/lib/security/headers.ts`](web/lib/security/headers.ts) and applied to
  every request in [`web/proxy.ts`](web/proxy.ts).
- **No version disclosure.** `poweredByHeader: false` in
  [`web/next.config.ts`](web/next.config.ts) drops `X-Powered-By`;
  `server_tokens off;` written by
  [`infra/scripts/startup.sh.tpl`](infra/scripts/startup.sh.tpl) strips the
  Nginx version from the `Server` header.

### Cryptographic Failures

- **Hardened session cookie.** The Firebase session cookie is set `HttpOnly`,
  `Secure`, `SameSite=Strict`, `Path=/`, with a 12-hour lifetime, and CSRF
  tokens use `crypto.getRandomValues` (≥ 32 bytes, never derived from the
  session or a timestamp). See
  [`web/lib/auth/session.ts`](web/lib/auth/session.ts) and
  [`web/lib/security/csrf.ts`](web/lib/security/csrf.ts). HSTS
  (`max-age=63072000; includeSubDomains`) is emitted from
  [`web/lib/security/headers.ts`](web/lib/security/headers.ts), and Nginx
  redirects all HTTP traffic to HTTPS.

## Agent notes

If you're an AI agent working in this repo, read [`CLAUDE.md`](CLAUDE.md)
first — it documents the VM start/stop workflow and two real bugs worth
knowing about before touching `infra/scripts/startup.sh.tpl`.
