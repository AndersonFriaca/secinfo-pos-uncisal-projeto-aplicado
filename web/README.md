App Next.js 16 (App Router, SSR) do projeto. Auth server-side via Firebase /
Identity Platform; rate limiting em memória.

## Rodar localmente

Pré-requisitos: Node 24, `gcloud` autenticado, `infra/` já aplicado (a API key
existe no state).

```bash
cd web
npm ci

# 1. env local (gitignored)
cp .env.local.example .env.local
# preencha GOOGLE_CLOUD_PROJECT = project_id do infra/terraform.tfvars
# IDENTITY_PLATFORM_API_KEY é opcional: sem ele o app lê a key do Secret
# Manager via ADC (mesmo caminho da produção). Para setar mesmo assim:
terraform -chdir=../infra output -raw identity_platform_api_key

# 2. Application Default Credentials (firebase-admin + leitura do Secret Manager)
gcloud auth application-default login
gcloud auth application-default set-quota-project <project-id>

# 3. subir
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Fluxo de validação:
cadastro → e-mail de verificação (Identity Platform envia) → login → `/dashboard`
→ logout. Sem a API key (nem env nem Secret Manager), `/api/auth/*` responde
503; sem ADC, o login falha ao criar o cookie de sessão.

`npm test` / `npm run lint` / `npm run typecheck` / `npm run build` rodam sem
credencial nenhuma.

## Estrutura

```
app/                 Rotas do App Router: páginas (login, signup, dashboard,
                      forgot-password, verify-email, error) e handlers de
                      `/api/auth/*`
components/           Componentes de UI, agrupados por tela (auth/, error/, ui/)
lib/                  Auth (Identity Platform, sessão), segurança
                      (rate limit, CSRF, headers), validação
proxy.ts               Middleware: CSP, nonce, CSRF, headers de segurança
```

## Deploy

Esta aplicação **não é implantada na Vercel** — ela roda em uma VM `e2-micro`
do GCP atrás de Nginx, via um pipeline de CI/CD dedicado (build standalone →
GitHub Actions → PM2). Consulte
[`docs/application.md`](../docs/application.md) para o fluxo de CI/CD e
[`docs/deployment.md`](../docs/deployment.md) para o passo a passo completo de
infraestrutura.

## Saiba mais

- [Documentação do Next.js](https://nextjs.org/docs) — recursos e API do framework.
- [`docs/application.md`](../docs/application.md) — como esta aplicação roda em produção, CI/CD e mitigações do OWASP Top 10.
