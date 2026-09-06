# Application

The `web/` directory holds the project's Next.js 16 application (App Router,
TypeScript, server-rendered). It provides a public landing page, self-service
signup with email verification, server-only login, and an authenticated
dashboard with logout. Firebase / GCP Identity Platform backs authentication;
the browser only ever receives an httpOnly session cookie and a CSRF token —
no API key, project ID, or Firebase config reaches the client bundle.

## How it runs

- Built in GitHub Actions as a `next build` **standalone** bundle, never on
  the VM (the e2-micro has 1 GB RAM).
- Deployed to `/opt/app/releases/<sha>` with `/opt/app/current` flipped to the
  new release; PM2 runs `node current/server.js` on port 3000
  (`infra/scripts/ecosystem.config.js`).
- Nginx on the VM terminates TLS and reverse-proxies to `localhost:3000`
  (`infra/scripts/startup.sh.tpl`).

## CI/CD

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | pull request to `main` | `npm ci`, lint, typecheck, unit tests |
| `.github/workflows/deploy.yml` | push to `main` | tests, standalone build, keyless GCP auth (Workload Identity Federation), resolve/start the VM, ship the bundle and run remote commands over an IAP tunnel (`gcloud compute scp/ssh --tunnel-through-iap`), write `/opt/app/.env.production`, reload PM2 as `appsvc`, poll `https://<ip>/` for HTTP 200 |

The deploy workflow holds no long-lived GCP key **and no SSH key**: it
authenticates through the Workload Identity pool provisioned in `infra/wif.tf`,
and reaches the VM over an IAP tunnel where `gcloud` mints an ephemeral,
IAM-scoped SSH key from the federated deploy service account. The app runs on
the VM as a dedicated locked `appsvc` user. Every credential comes from GitHub
Actions secrets: `GCP_PROJECT_ID`, `GCP_ZONE`, `GCP_WIF_PROVIDER`,
`GCP_DEPLOY_SA_EMAIL`, `IDENTITY_PLATFORM_API_KEY`.

## OWASP Top 10 mitigations

The mapping of OWASP Top 10:2025 categories to the code that mitigates them is
in the root [`README.md`](../README.md#application-security-owasp-top-10).

## Planning history

Requirements, design, task breakdown, and the independent Verifier's report
are in
[`.specs/features/nextjs-secure-app/`](../.specs/features/nextjs-secure-app/).
