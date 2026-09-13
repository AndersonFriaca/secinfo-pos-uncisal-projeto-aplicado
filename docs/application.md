# Aplicação

O diretório `web/` contém a aplicação Next.js 16 do projeto (App Router,
TypeScript, renderização no servidor). Funcionalidades: landing page pública,
cadastro self-service com verificação de e-mail, login server-side, dashboard
autenticado e logout. A autenticação usa o Firebase / GCP Identity Platform
pela API REST server-side; o navegador recebe apenas um cookie de sessão
`HttpOnly` e um token CSRF. Nenhuma API key, project ID ou configuração do
Firebase entra no bundle do cliente.

Instruções para execução local estão em [`web/README.md`](../web/README.md).

## Telas

`/login`, `/signup`, `/verify-email` e `/forgot-password` compartilham o
mesmo layout de formulário centralizado (`AuthShell`): título, descrição,
campos, botão de ação e link de rodapé para a tela irmã. `/dashboard`
renderiza um shell com barra lateral (`AppSidebar` + `DashboardShell`) —
marca, item "Painel" ativo, rodapé com o e-mail do usuário e botão "Sair" —
mais um cabeçalho com o toggle da barra lateral e breadcrumb. As telas não
descrevem os controles de segurança; essa documentação está no
[`README.md`](../README.md#segurança-da-aplicação-owasp-top-102025) e em
[`security.md`](./security.md).

### Tratamento de erros

Todo formulário é um `<form>` HTML sem JavaScript client-side: o navegador
navega para o que a rota de API devolver. Por isso nenhuma rota de credencial
responde com corpo JSON ao usuário:

- Falhas associadas a um campo (por exemplo, credenciais inválidas em
  `/api/auth/login`) redirecionam (`303`) para a própria tela com um parâmetro
  de erro (`?error=1`), que o formulário renderiza como mensagem genérica.
- Falhas sem campo associado (limite de requisições excedido, Identity
  Platform indisponível) redirecionam para `/error?reason=...`, tela genérica
  em `components/error/generic-error.tsx` com link de retorno ao login.
- Exceções não tratadas em qualquer página são capturadas pelo error boundary
  do Next.js em [`web/app/error.tsx`](../web/app/error.tsx), que reutiliza a
  mesma tela no lugar do overlay padrão do framework.

## Runtime na VM

- O build é executado no GitHub Actions como bundle **standalone** do
  `next build`, nunca na VM (a `e2-micro` tem 1 GB de RAM).
- Cada release é publicado em `/opt/app/releases/<sha>`, com o symlink
  `/opt/app/current` apontando para o release ativo; o PM2 executa
  `node current/server.js` na porta 3000 como o usuário de sistema `appsvc`
  (`infra/scripts/ecosystem.config.js`).
- O Nginx termina o TLS e faz reverse proxy para `localhost:3000`,
  encaminhando `X-Forwarded-Proto`, `X-Forwarded-Host` e `X-Forwarded-For`
  (`infra/scripts/startup.sh.tpl`, estágio 10). O `proxy.ts` depende de
  `X-Forwarded-Proto: https` para a comparação de origem do CSRF, e o rate
  limiter resolve o IP do cliente a partir de `X-Forwarded-For`.
- A API key do Identity Platform não está no `.env.production`: a aplicação a
  lê do Secret Manager em runtime (`web/lib/gcp/secret.ts`) com a service
  account da VM, que tem `roles/secretmanager.secretAccessor` apenas nesse
  secret (`infra/secrets.tf`). O `.env.production` contém somente `NODE_ENV`,
  `PORT` e `GOOGLE_CLOUD_PROJECT`.

## CI/CD

| Workflow | Gatilho | O que faz |
| --- | --- | --- |
| `.github/workflows/ci.yml` | pull request para `main` | `npm ci`, lint, typecheck, testes unitários; guardrails estáticos sobre `infra/` (deploy SA sem role predefinida de projeto, custom role somente leitura, chave SSH fora do metadata de projeto) |
| `.github/workflows/release.yml` | push para `main` | `release-please`: mantém o PR de release (bump semver por Conventional Commits, `web/CHANGELOG.md`); no merge do PR cria a tag `vX.Y.Z` + GitHub Release e chama o `deploy.yml` |
| `.github/workflows/deploy.yml` | `workflow_call` do `release.yml` (+ `workflow_dispatch`) | testes, build standalone, autenticação GCP sem chave (Workload Identity Federation), resolve/inicia a VM, envia o bundle e executa comandos remotos por túnel IAP (`gcloud compute scp/ssh --tunnel-through-iap`), escreve `/opt/app/.env.production`, reinicia o PM2 (`pm2 delete` + `pm2 start`) como `appsvc`, faz poll de `https://<ip>/` até HTTP 200 |
| `.github/workflows/build-oqsprovider.yml` | `workflow_dispatch` | Compila `liboqs` + `oqs-provider` num runner `ubuntu-24.04`; o artefato é enviado manualmente ao bucket `vm-assets` — veja [security.md](security.md#pqc-troca-de-chaves-pós-quântica-híbrida) |

O workflow de deploy não guarda chave GCP de longa duração nem chave SSH:
autentica pelo pool de Workload Identity provisionado em `infra/wif.tf` e
alcança a VM por túnel IAP, onde o `gcloud` gera uma chave SSH efêmera a
partir da service account de deploy federada. Os secrets do GitHub Actions
consumidos são quatro, todos não sensíveis: `GCP_PROJECT_ID`, `GCP_ZONE`,
`GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`. Não há secret de autenticação da
aplicação no GitHub.

## Mitigações do OWASP Top 10

O mapeamento das categorias do OWASP Top 10:2025 para o código que as mitiga
está no [`README.md`](../README.md#segurança-da-aplicação-owasp-top-102025) da
raiz.
