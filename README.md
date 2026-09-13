# Projeto Aplicado — Infraestrutura GCP e aplicação Next.js

Infraestrutura como código (Terraform) para um ambiente de hospedagem no GCP,
restrito ao Always Free tier e endurecido conforme os requisitos de
[`prd.md`](prd.md) (Eixo 1: Cloud Infra), mais a aplicação Next.js servida
nesse ambiente (Eixo 3) e o pipeline de CI/CD que os integra.

Componentes principais:

- **VM `e2-micro`** (Ubuntu 24.04, Shielded VM) em VPC custom, provisionada
  por um startup script idempotente.
- **Nginx** como terminador TLS e reverse proxy para a aplicação em
  `localhost:3000`, com certificado de endereço IP da Let's Encrypt (sem
  domínio) e troca de chaves **pós-quântica híbrida** (`X25519MLKEM768`,
  ML-KEM-768 conforme FIPS 203) via `oqs-provider` — veja
  [security.md](docs/security.md#pqc-troca-de-chaves-pós-quântica-híbrida).
- **SSH em `:22`** público por padrão para a banca avaliadora, mas
  `PasswordAuthentication no`, jail do Fail2ban e restrição opcional de origem
  por `operator_ssh_cidrs`.
- **Aplicação Next.js 16** (`web/`) com autenticação server-side via Identity
  Platform, sessão em cookie `HttpOnly`, CSRF e CSP com nonce — executada por
  PM2 como usuário de sistema dedicado.
- **CI/CD** no GitHub Actions com autenticação keyless (Workload Identity
  Federation), deploy por túnel IAP e gate por release semver.

A documentação completa está em [`docs/`](docs/): arquitetura, deploy,
operação, segurança, checklist do free tier e troubleshooting baseado em
falhas observadas em ambiente real.

## Quickstart

```bash
gcloud auth login
cp terraform.tfvars.example infra/terraform.tfvars        # fill in your values
cp infra/backend.hcl.example infra/backend.hcl            # bucket name comes from step 2

# 1. Bootstrap (state bucket + billing budget — persistent, never destroyed)
cd infra/bootstrap && terraform init && terraform apply

# 2. Point the main root at the remote backend (bucket name from step 1's output)
cd ../ && terraform init -backend-config=backend.hcl -migrate-state

# 3. Deploy the VM, network, firewall, Identity Platform, WIF, Secret Manager
terraform apply
```

Procedimento completo, referência de variáveis e verificação:
[`docs/deployment.md`](docs/deployment.md).

## Operação

```bash
./ops/vm-start.sh   # start the VM (reserves + attaches a static IP for this session)
./ops/vm-stop.sh    # stop the VM (releases the IP — nothing left billing)
```

[`docs/operations.md`](docs/operations.md) cobre verificações de saúde,
teardown e o motivo de o ciclo start/stop passar por esses scripts em vez de
`gcloud compute instances start/stop`.

## Pipeline de CI/CD

O `prd.md` exige que o código chegue à produção a partir de `git push origin
main`. O pipeline atende esse fluxo em duas etapas encadeadas, ambas em
GitHub Actions:

```
git push origin main
   │
   ▼
release.yml (on: push → main)
   ├─ release-please abre/atualiza o PR "chore(main): release X.Y.Z"
   │    (bump semver por Conventional Commits + web/CHANGELOG.md)
   └─ no merge desse PR: tag vX.Y.Z + GitHub Release
          │  releases_created == 'true'
          ▼
       deploy.yml (workflow_call)
          ├─ npm ci, testes, next build (standalone)
          ├─ auth GCP keyless (Workload Identity Federation)
          ├─ resolve o IP da VM (inicia se TERMINATED), scp/ssh por túnel IAP
          ├─ /opt/app/releases/<sha> → current, pm2 delete + start (appsvc)
          └─ poll https://<ip>/ até HTTP 200
```

O push em `main` dispara o pipeline imediatamente; a entrega na VM ocorre no
merge do PR de release. Esse gate é deliberado: cada deploy corresponde a uma
tag semver e a um GitHub Release auditável (OWASP *Software and Data
Integrity Failures*), e nenhum commit chega à produção sem passar por testes
e build no runner. Para um redeploy imediato do `main` atual sem cortar
release, use `workflow_dispatch` no workflow `Deploy`. Detalhes em
[`docs/application.md`](docs/application.md#cicd) e
[`docs/operations.md`](docs/operations.md#cortar-uma-release-tag--github-release).

## Layout do repositório

```
web/               Next.js 16 application (SSR, TypeScript) — see docs/application.md
infra/bootstrap/   Persistent Terraform root: state bucket, billing budget
infra/             Main Terraform root: VPC, firewall, compute, Identity Platform, WIF, Secret Manager
infra/scripts/     Startup script + PM2 config, rendered onto the VM
ops/               Operator scripts (start/stop the VM with a static IP)
.github/workflows/ CI (PR checks), release-please (semver tags), deploy (on release only), oqsprovider build
docs/              Reference documentation — start here
CLAUDE.md          Operating notes for AI agents working in this repo
prd.md             Course requirements this project is graded against
```

## Segurança da aplicação (OWASP Top 10:2025)

A aplicação em `web/` endereça as dez categorias do OWASP Top 10:2025. Nove
têm mitigação implementada em código; uma (Software Supply Chain Failures)
tem mitigação parcial com a lacuna documentada. Cada item nomeia o mecanismo
e o arquivo responsável.

### Identification and Authentication Failures

- **Bloqueio por força bruta por IP.** Cinco falhas consecutivas de login a
  partir do mesmo IP bloqueiam esse IP por 60 s; o contador é zerado em
  sucesso ou na expiração do bloqueio. A lógica de decisão (limiares e relógio
  injetados) está em
  [`web/lib/security/rate-limit-core.ts`](web/lib/security/rate-limit-core.ts);
  o store (um `Map` em memória, sem banco de dados) e o cache L1 que rejeita
  um IP já bloqueado sem consultar o store estão em
  [`web/lib/security/rate-limit.ts`](web/lib/security/rate-limit.ts). O mesmo
  módulo impõe um teto de 10 requisições/min por IP (bucket `auth`) nas quatro
  rotas de credencial. Integração na rota de login:
  [`web/app/api/auth/login/route.ts`](web/app/api/auth/login/route.ts). A
  resolução do IP do cliente confia na entrada mais à esquerda de
  `X-Forwarded-For`. Isso é seguro apenas porque o Nginx da VM é o único ponto
  de entrada e sobrescreve o header em toda requisição; com a aplicação
  exposta diretamente, um cliente poderia forjar `X-Forwarded-For` para
  contornar o bloqueio ou atribuí-lo a outro IP.
- **Erros de autenticação genéricos.** Toda rejeição do provedor colapsa em
  uma única mensagem: e-mail inexistente e senha incorreta são
  indistinguíveis, o que impede enumeração de contas. Veja
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts).
- **Política de senha.** Mínimo de 12 caracteres com minúscula, maiúscula,
  dígito e símbolo, validada no servidor antes de qualquer chamada ao Identity
  Platform, em
  [`web/lib/validation/credentials.ts`](web/lib/validation/credentials.ts).

### Broken Access Control

- **Verificação de sessão no servidor em toda requisição protegida.** O
  dashboard chama `getAuthenticatedUser`, que verifica o cookie de sessão do
  Firebase com `checkRevoked: true` e exige e-mail verificado — não há flag de
  autenticação em cache no cliente. Lógica em
  [`web/lib/auth/session.ts`](web/lib/auth/session.ts); aplicada em
  [`web/app/dashboard/page.tsx`](web/app/dashboard/page.tsx).
- **Proteção CSRF.** Requisições que alteram estado precisam apresentar um
  token CSRF igual ao de um cookie `SameSite=Strict`, comparado em tempo
  constante, além de passar na checagem de mesma origem via `Origin`/`Referer`.
  Token em [`web/lib/security/csrf.ts`](web/lib/security/csrf.ts); aplicação em
  [`web/proxy.ts`](web/proxy.ts).

### Security Misconfiguration

- **Conjunto de response headers do OWASP.** Content-Security-Policy baseada
  em nonce (sem `unsafe-inline`/`unsafe-eval`), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  os três headers `Cross-Origin-*` e `Cache-Control: no-store` em respostas
  sensíveis. Montado em
  [`web/lib/security/headers.ts`](web/lib/security/headers.ts) e aplicado a
  toda requisição em [`web/proxy.ts`](web/proxy.ts).
- **Sem divulgação de versão.** `poweredByHeader: false` em
  [`web/next.config.ts`](web/next.config.ts) remove `X-Powered-By`;
  `server_tokens off;`, escrito por
  [`infra/scripts/startup.sh.tpl`](infra/scripts/startup.sh.tpl), remove a
  versão do Nginx do header `Server`.

### Cryptographic Failures

- **Cookie de sessão endurecido.** O cookie de sessão do Firebase é emitido
  com `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` e TTL de 12 horas; os
  tokens CSRF usam `crypto.getRandomValues` (≥ 32 bytes, nunca derivados da
  sessão ou de timestamp). Veja
  [`web/lib/auth/session.ts`](web/lib/auth/session.ts) e
  [`web/lib/security/csrf.ts`](web/lib/security/csrf.ts). O HSTS
  (`max-age=63072000; includeSubDomains`) é emitido por
  [`web/lib/security/headers.ts`](web/lib/security/headers.ts); o Nginx
  redireciona todo HTTP para HTTPS e negocia TLS 1.3 com grupo híbrido
  pós-quântico.
- **API key fora do bundle, do `.env` e dos secrets do GitHub.** A API key do
  Identity Platform vive apenas no Secret Manager
  ([`infra/secrets.tf`](infra/secrets.tf)); a aplicação a lê em runtime com a
  service account da VM ([`web/lib/gcp/secret.ts`](web/lib/gcp/secret.ts)).

### Injection

- **Sem superfície de injeção.** Não há banco de dados: o rate limiter usa um
  `Map` em memória (store em
  [`web/lib/security/rate-limit.ts`](web/lib/security/rate-limit.ts)). Não há
  `eval`, `new Function`, `child_process.exec`/`execSync` nem
  `dangerouslySetInnerHTML` em `web/`. Toda chamada ao Identity Platform envia
  o corpo serializado por `JSON.stringify`, nunca por concatenação de string
  ([`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts)).
- **Entrada verificada por tipo antes do uso.** As rotas de credencial
  (`signup`, `login`, `forgot-password`, `resend-verification`) leem o corpo
  com checagem estrita de tipo (`typeof body?.email === "string"`) antes de
  `normalizeEmail`/`validatePassword` — validação por regex, sem interpolação —
  em [`web/lib/validation/credentials.ts`](web/lib/validation/credentials.ts).

### Insecure Design

- **Senha validada antes de qualquer chamada externa.** `handleSignup` executa
  rate limit, validação de e-mail/senha e só então chama o Identity Platform;
  uma senha fraca não chega ao provedor. Veja o comentário de ordenação em
  [`web/app/api/auth/signup/handler.ts`](web/app/api/auth/signup/handler.ts).
- **Não enumeração como princípio sistemático.** O mesmo padrão — uma única
  resposta genérica, nunca condicionada à existência da conta — se repete nos
  fluxos de credencial: `signup` (e-mail já cadastrado produz o mesmo
  `error=invalid` de qualquer outra rejeição,
  [`web/app/api/auth/signup/handler.ts`](web/app/api/auth/signup/handler.ts)),
  `login` (e-mail inexistente e senha incorreta produzem o mesmo 401,
  [`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts)) e
  `forgot-password` (o redirect para `?sent=1` não depende do resultado de
  `sendPasswordResetEmail`,
  [`web/app/api/auth/forgot-password/handler.ts`](web/app/api/auth/forgot-password/handler.ts)).
  O tipo `IdentityFailure` em
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts)
  colapsa toda rejeição do provedor em um único valor (`"invalid"`).
- **Fail-closed por padrão.** Falha de rede, de parsing ou credencial ausente
  em `callIdentityPlatform` produz `{ ok: false, reason: "unavailable" }` —
  nunca um resultado ambíguo tratado como sucesso
  ([`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts)).

### Software Supply Chain Failures

- **Build determinístico.** `package-lock.json` é versionado e o CI usa
  `npm ci` (nunca `npm install`) em
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) e
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — o build
  falha se o lockfile estiver dessincronizado do `package.json`. As GitHub
  Actions são fixadas por tag semver (`actions/checkout@v4`,
  `actions/setup-node@v4`, `google-github-actions/auth@v2`,
  `google-github-actions/setup-gcloud@v2`), nunca `@latest`.
- **Lacuna conhecida:** não há Dependabot/Renovate configurado nem `npm audit`
  em nenhum workflow; dependências desatualizadas ou com CVE conhecida não
  geram alerta automático.

### Software and Data Integrity Failures

- **Deploy condicionado a release, nunca a push direto.**
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) só executa via
  `workflow_call` a partir de
  [`.github/workflows/release.yml`](.github/workflows/release.yml), condicionado
  a `releases_created == 'true'`. Dentro do `deploy.yml`, testes e build
  precedem o empacotamento, e o pipeline falha explicitamente (`test -f
  "$APP/server.js"`, `test -f bundle/server.js`) se o artefato standalone do
  Next.js estiver malformado.
- **Health check pós-deploy.** O deploy faz poll de até 2 minutos por HTTP 200
  em `https://<ip>/` antes de considerar o release concluído
  ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)); um bundle
  que sobe mas não responde falha o workflow.
- **Deserialização segura.** Todo `JSON.parse`/`.json()` está protegido por
  `try`/`catch` (ou `.catch(() => null)`) e nenhuma chamada usa `eval` para
  desserializar — veja
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts) e os
  handlers de credencial.

### Security Logging and Alerting Failures

- **Logging de falhas server-side.** Falha de rate limit, Identity Platform
  indisponível e falha de revogação de sessão geram `console.error` (sem
  expor API key ou token) em
  [`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts),
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts) e
  [`web/app/api/auth/logout/handler.ts`](web/app/api/auth/logout/handler.ts).
  O Fail2ban (estágio 3 de
  [`infra/scripts/startup.sh.tpl`](infra/scripts/startup.sh.tpl)) registra
  todo banimento em `/var/log/fail2ban.log`, auditável via SSH.
- **Sem vazamento de dados sensíveis no log.** Os `console.error` registram
  apenas o motivo da falha; a API key, o token de sessão e o corpo da resposta
  do provedor são omitidos por construção em `unavailable(...)`
  ([`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts)).
- **Alerta de billing como sinal de anomalia.** O `google_billing_budget`
  ([`infra/bootstrap/billing.tf`](infra/bootstrap/billing.tf)) notifica os
  administradores da conta em 50 % / 90 % / 100 % / 150 % do orçamento — um
  pico de consumo (por exemplo, egress anômalo ou recursos criados fora do
  Terraform) gera e-mail sem depender de acesso à VM.

### Mishandling of Exceptional Conditions

- **Erro cru do upstream nunca chega ao cliente.** Toda falha de
  `resolveApiKey`, `fetch` ou parsing em `callIdentityPlatform` passa por
  `unavailable(...)`, que registra o detalhe apenas server-side e devolve um
  motivo genérico — os comentários no código documentam a razão ("the error
  object could carry the secret resource name or a token"; "Never rethrow: an
  upstream error object could carry the request URL") em
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts).
  Os handlers de rota seguem o mesmo padrão: `reason: "unavailable"` vira um
  503/redirect genérico, nunca o corpo do provedor
  ([`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts),
  [`web/app/api/auth/signup/handler.ts`](web/app/api/auth/signup/handler.ts)).
- **Nenhum catch silencioso mascara bug.** O único `catch {}` sem log
  (decodificação do JWT de sessão em
  [`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts))
  trata token malformado como "não verificado" — fail-closed documentado em
  comentário.
- **Sem corpo JSON cru exposto ao usuário.** Os formulários são `<form>` HTML
  sem JavaScript client-side, então a resposta da rota de API é o que o
  navegador renderiza. Falhas sem campo associado (limite de requisições,
  Identity Platform indisponível) redirecionam (`303`) para
  `/error?reason=...`, tela genérica em
  [`web/components/error/generic-error.tsx`](web/components/error/generic-error.tsx).
  Exceções não tratadas em qualquer página caem no error boundary do Next.js
  em [`web/app/error.tsx`](web/app/error.tsx), que reutiliza a mesma tela.
