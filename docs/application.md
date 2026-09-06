# Aplicação

O diretório `web/` contém a aplicação Next.js 16 do projeto (App Router,
TypeScript, renderizada no servidor). Ela oferece uma landing page pública,
cadastro self-service com verificação de e-mail, login somente no servidor e
um dashboard autenticado com logout. O Firebase / GCP Identity Platform apoia
a autenticação; o navegador recebe apenas um cookie de sessão httpOnly e um
token CSRF — nenhuma API key, project ID ou config do Firebase chega ao bundle
do cliente.

## Como roda

- Construída no GitHub Actions como um bundle **standalone** do `next build`,
  nunca na VM (a e2-micro tem 1 GB de RAM).
- Publicada em `/opt/app/releases/<sha>` com `/opt/app/current` apontando para
  o novo release; o PM2 roda `node current/server.js` na porta 3000
  (`infra/scripts/ecosystem.config.js`).
- O Nginx na VM termina o TLS e faz reverse proxy para `localhost:3000`
  (`infra/scripts/startup.sh.tpl`).

## CI/CD

| Workflow | Gatilho | O que faz |
| --- | --- | --- |
| `.github/workflows/ci.yml` | pull request para `main` | `npm ci`, lint, typecheck, testes unitários, e guardrails estáticos de IAM/firewall do `infra/` |
| `.github/workflows/deploy.yml` | push para `main` | testes, build standalone, autenticação GCP sem chave (Workload Identity Federation), resolve/inicia a VM, envia o bundle e roda comandos remotos por um túnel IAP (`gcloud compute scp/ssh --tunnel-through-iap`), escreve `/opt/app/.env.production`, recarrega o PM2 como `appsvc`, faz poll de `https://<ip>/` esperando HTTP 200 |

O workflow de deploy não guarda nenhuma chave GCP de longa duração **nem
chave SSH**: ele autentica pelo pool de Workload Identity provisionado em
`infra/wif.tf` e alcança a VM por um túnel IAP, onde o `gcloud` gera uma chave
SSH efêmera e limitada por IAM a partir da service account de deploy federada.
A aplicação roda na VM como o usuário de sistema dedicado e travado `appsvc`.
Toda credencial vem dos secrets do GitHub Actions: `GCP_PROJECT_ID`,
`GCP_ZONE`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`,
`IDENTITY_PLATFORM_API_KEY`.

## Mitigações do OWASP Top 10

O mapeamento das categorias do OWASP Top 10:2025 para o código que as mitiga
está no [`README.md`](../README.md#segurança-da-aplicação-owasp-top-10) da
raiz.

## Histórico de planejamento

Requisitos, design, quebra de tarefas e o relatório do Verifier independente
estão em
[`.specs/features/nextjs-secure-app/`](../.specs/features/nextjs-secure-app/).
