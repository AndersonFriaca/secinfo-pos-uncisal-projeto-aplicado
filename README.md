# Projeto Aplicado — Infraestrutura GCP

Infraestrutura como código (Terraform) para um ambiente de hospedagem GCP
endurecido e dentro do free tier, destinado à aplicação Next.js do projeto.
Consulte [`prd.md`](prd.md) para os requisitos completos da disciplina
(Eixo 1: Cloud Infra).

Este repositório provisiona apenas a camada de infraestrutura — a aplicação em
si é construída em uma feature separada. Uma VM `e2-micro` endurecida serve
HTTPS (certificado real da Let's Encrypt, sem necessidade de domínio) via
Nginx, com suporte a troca de chaves **pós-quântica híbrida** (`X25519MLKEM768`,
ML-KEM-768 por FIPS 203) — veja [security.md](docs/security.md#pqc-troca-de-chaves-pós-quântica-híbrida).
A porta `:22` fica pública e aberta para a banca avaliadora da
disciplina, mas é somente por chave (`PasswordAuthentication no`), protegida
por Fail2ban e por uma Shielded VM; a variável `operator_ssh_cidrs` permite
restringir esse acesso a CIDRs específicos. Tudo é fixado para permanecer
dentro do Always Free tier do GCP.

**📚 A documentação completa está em [`docs/`](docs/)** — arquitetura, passos
de deploy, operação do dia a dia, justificativa de segurança, o checklist do
free tier e um guia de troubleshooting construído a partir de bugs reais
encontrados ao fazer o deploy deste projeto.

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

Passo a passo completo, referência de variáveis e etapas de verificação:
[`docs/deployment.md`](docs/deployment.md).

## Uso no dia a dia

```bash
./ops/vm-start.sh   # start the VM (reserves + attaches a static IP for this session)
./ops/vm-stop.sh    # stop the VM (releases the IP — nothing left billing)
```

Veja [`docs/operations.md`](docs/operations.md) para verificações de saúde,
teardown e o motivo de iniciar/parar a VM passar por esses scripts em vez de
um `gcloud compute instances start/stop` direto.

## Layout do repositório

```
web/               Next.js 16 application (SSR, TypeScript) — see docs/application.md
infra/bootstrap/   Persistent Terraform root: state bucket, billing budget
infra/             Main Terraform root: VPC, firewall, compute instance
infra/scripts/     Startup script + PM2 config, rendered onto the VM
ops/               Operator scripts (start/stop the VM with a static IP)
.github/workflows/ CI (tests on PR), release-please (semver tags), deploy (on release only)
docs/              Full documentation — start here
.specs/            Planning history: requirements, design, tasks, verification report
CLAUDE.md          Operating notes for AI agents working in this repo
prd.md             Course requirements this project is graded against
```

## Segurança da aplicação (OWASP Top 10)

A aplicação Next.js em `web/` cobre as dez categorias do OWASP Top 10:2025.
Oito têm mitigação ativa comprovada em código; duas (Software Supply Chain
Failures, Security Logging and Alerting Failures) têm mitigação parcial com
uma lacuna real documentada explicitamente, em vez de omitida. Cada item
nomeia o mecanismo e o arquivo que o carrega.

### Identification and Authentication Failures

- **Bloqueio de IP por força bruta.** Cinco falhas consecutivas de login a
  partir de um mesmo IP bloqueiam esse IP por 60 segundos; o contador zera no
  sucesso ou quando o bloqueio expira. A lógica de decisão (limiares
  injetados, relógio injetado) está em
  [`web/lib/security/rate-limit-core.ts`](web/lib/security/rate-limit-core.ts);
  o store (um `Map` em memória no processo, sem banco de dados), com um cache
  em processo que rejeita um IP já bloqueado sem ida ao store, está em
  [`web/lib/security/rate-limit.ts`](web/lib/security/rate-limit.ts). Ele é
  ligado à rota de login em
  [`web/app/api/auth/login/route.ts`](web/app/api/auth/login/route.ts). A
  resolução do IP do cliente
  ([`web/lib/security/rate-limit.ts`](web/lib/security/rate-limit.ts)) confia
  na entrada mais à esquerda de `X-Forwarded-For`. Isso só é seguro porque o
  reverse proxy Nginx da VM é o único ponto de entrada e sobrescreve esse
  header em toda requisição; se a aplicação ficasse exposta diretamente, um
  cliente poderia forjar `X-Forwarded-For` para escapar do bloqueio ou
  atribuí-lo a outro IP.
- **Erros de autenticação genéricos.** Todo erro de credencial vindo do
  provedor se reduz a uma única mensagem, de modo que um e-mail inexistente e
  uma senha errada são indistinguíveis — sem enumeração de contas. Veja
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts).
- **Política de senha.** Mínimo de 12 caracteres com minúscula, maiúscula,
  dígito e símbolo, validada no servidor antes de qualquer chamada ao Identity
  Platform, em
  [`web/lib/validation/credentials.ts`](web/lib/validation/credentials.ts).

### Broken Access Control

- **Verificação de sessão no servidor em toda requisição protegida.** O
  dashboard chama `getAuthenticatedUser`, que verifica o cookie de sessão do
  Firebase com `checkRevoked: true` e exige e-mail verificado — sem flag em
  cache no cliente. Lógica em
  [`web/lib/auth/session.ts`](web/lib/auth/session.ts); aplicada em
  [`web/app/dashboard/page.tsx`](web/app/dashboard/page.tsx).
- **Proteção CSRF.** Requisições que alteram estado precisam apresentar um
  token CSRF que combine com um cookie `SameSite=Strict`, comparado em tempo
  constante, além de uma checagem de mesma origem em `Origin`/`Referer`.
  Lógica do token em
  [`web/lib/security/csrf.ts`](web/lib/security/csrf.ts); aplicação em
  [`web/proxy.ts`](web/proxy.ts).

### Security Misconfiguration

- **Conjunto de response headers do OWASP.** Uma Content-Security-Policy
  baseada em nonce (sem `unsafe-inline`/`unsafe-eval`), HSTS,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, os três headers `Cross-Origin-*` e
  `Cache-Control: no-store` em respostas sensíveis. Montado em
  [`web/lib/security/headers.ts`](web/lib/security/headers.ts) e aplicado a
  toda requisição em [`web/proxy.ts`](web/proxy.ts).
- **Sem divulgação de versão.** `poweredByHeader: false` em
  [`web/next.config.ts`](web/next.config.ts) remove `X-Powered-By`;
  `server_tokens off;`, escrito por
  [`infra/scripts/startup.sh.tpl`](infra/scripts/startup.sh.tpl), tira a
  versão do Nginx do header `Server`.

### Cryptographic Failures

- **Cookie de sessão endurecido.** O cookie de sessão do Firebase é definido
  com `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` e tempo de vida de 12
  horas, e os tokens CSRF usam `crypto.getRandomValues` (≥ 32 bytes, nunca
  derivados da sessão ou de um timestamp). Veja
  [`web/lib/auth/session.ts`](web/lib/auth/session.ts) e
  [`web/lib/security/csrf.ts`](web/lib/security/csrf.ts). O HSTS
  (`max-age=63072000; includeSubDomains`) é emitido por
  [`web/lib/security/headers.ts`](web/lib/security/headers.ts), e o Nginx
  redireciona todo o tráfego HTTP para HTTPS.

### Injection

- **Sem superfície de injeção.** Não há banco de dados: o rate limiter usa um
  `Map` em memória no processo, não SQL (`infra/app.tf`, comentário "no
  database"; store em
  [`web/lib/security/rate-limit.ts`](web/lib/security/rate-limit.ts)). Não há
  `eval`, `new Function`, `child_process.exec`/`execSync` nem
  `dangerouslySetInnerHTML` em nenhum lugar de `web/`. Toda chamada à Identity
  Platform manda o corpo como JSON (`JSON.stringify`), nunca concatenação de
  string (
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts)).
- **Entrada verificada por tipo antes de qualquer uso.** As três rotas de
  credencial (`signup`, `login`, `forgot-password`) leem o corpo com checagem
  estrita de tipo (`typeof body?.email === "string"`) antes de passar por
  `normalizeEmail`/`validatePassword` — regex-based, sem interpolação — em
  [`web/lib/validation/credentials.ts`](web/lib/validation/credentials.ts).

### Insecure Design

- **Senha validada antes de qualquer chamada externa.** `handleSignup` roda
  rate-limit → validação de e-mail/senha → só então chama a Identity
  Platform; uma senha fraca nunca chega ao provedor. Veja o comentário de
  ordem em
  [`web/app/api/auth/signup/handler.ts`](web/app/api/auth/signup/handler.ts).
- **"Sem enumeração" como princípio sistemático, não patch local.** O mesmo
  padrão — uma única resposta genérica, nunca ramificada pela existência da
  conta — se repete nos três fluxos de credencial: `signup` (e-mail já
  cadastrado vira o mesmo `error=invalid` de qualquer outra rejeição,
  [`web/app/api/auth/signup/handler.ts`](web/app/api/auth/signup/handler.ts)),
  `login` (e-mail inexistente e senha errada geram o mesmo 401,
  [`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts)) e
  `forgot-password` (o redirect para `?sent=1` nunca olha o resultado de
  `sendPasswordResetEmail`,
  [`web/app/api/auth/forgot-password/handler.ts`](web/app/api/auth/forgot-password/handler.ts)).
  O tipo `IdentityFailure` em
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts)
  colapsa toda rejeição do provedor em um único valor (`"invalid"`) por
  design, não por omissão.
- **Fail-closed por padrão.** Qualquer falha de rede, parsing ou credencial
  ausente em `callIdentityPlatform` vira `{ ok: false, reason: "unavailable"
  }` — nunca um resultado ambíguo tratado como sucesso — em
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts).

### Software Supply Chain Failures

- **Build determinístico.** `package-lock.json` é versionado e o CI usa
  `npm ci` (nunca `npm install`) tanto em
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) quanto em
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — falha se o
  lockfile estiver dessincronizado do `package.json`. As GitHub Actions usadas
  são pinadas por tag semver (`actions/checkout@v4`,
  `actions/setup-node@v4`, `google-github-actions/auth@v2`,
  `google-github-actions/setup-gcloud@v2`), nunca `@latest`.
- **Lacuna conhecida:** não há Dependabot/Renovate configurado nem `npm
  audit` em nenhum workflow — dependências desatualizadas ou com CVE
  conhecida não geram alerta automático hoje.

### Software and Data Integrity Failures

- **Deploy gated por release, nunca por push direto.**
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) só roda via
  `workflow_call` a partir do
  [`.github/workflows/release.yml`](.github/workflows/release.yml), condicionado
  a `releases_created == 'true'` — nenhum push solto em `main` dispara deploy.
  Dentro do próprio `deploy.yml`, testes e build rodam antes do empacotamento,
  e o pipeline falha explicitamente (`test -f "$APP/server.js"`, `test -f
  bundle/server.js`) se o artefato standalone do Next.js estiver malformado,
  em vez de enviar um bundle quebrado.
- **Health check pós-deploy.** O deploy faz poll de até 2 minutos por HTTP 200
  em `https://<ip>/` antes de considerar o release bem-sucedido
  ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) — um
  bundle que sobe mas não responde falha o workflow em vez de ficar
  silenciosamente no ar quebrado.
- **Deserialização segura.** Todo `JSON.parse`/`.json()` do repositório está
  atrás de `try`/`catch` (ou `.catch(() => null)`) e nenhuma chamada usa
  `eval` para desserializar — ver
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts) e os
  três handlers de credencial.

### Security Logging and Alerting Failures

- **Logging pontual de falhas server-side já existe.** Falha de rate-limit,
  Identity Platform indisponível e falha de revogação de sessão geram
  `console.error` (nunca vazando a API key ou o token) em
  [`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts),
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts) e
  [`web/app/api/auth/logout/handler.ts`](web/app/api/auth/logout/handler.ts).
  O Fail2ban (estágio 3 de
  [`infra/scripts/startup.sh.tpl`](infra/scripts/startup.sh.tpl)) registra
  todo banimento de IP em `/var/log/fail2ban.log`, auditável via SSH.
- **Lacuna conhecida:** nada disso é agregado ou alertado — não há Cloud
  Logging/Monitoring habilitado no projeto GCP (`infra/app.tf` só ativa as
  APIs de Identity Platform, Firebase, IAM, IAP, Secret Manager, não
  `logging.googleapis.com`), e o único alerta automatizado do projeto é de
  **custo** (`infra/bootstrap/billing.tf`), não de segurança. Um ataque de
  força bruta banido pelo Fail2ban ou uma sequência de 503 da Identity
  Platform não notifica ninguém — só aparece se alguém entrar na VM e ler o
  log manualmente.

### Mishandling of Exceptional Conditions

- **Nunca repassa erro cru do upstream ao cliente.** Toda falha de
  `resolveApiKey`, `fetch` ou parsing em `callIdentityPlatform` vira
  `unavailable(...)`, que loga o detalhe só server-side e devolve um motivo
  genérico — os comentários no próprio código documentam a razão ("the error
  object could carry the secret resource name or a token";
  "Never rethrow: an upstream error object could carry the request URL") em
  [`web/lib/auth/identity-platform.ts`](web/lib/auth/identity-platform.ts).
  Os handlers de rota repetem o padrão: `reason: "unavailable"` sempre vira um
  503/redirect genérico, nunca o corpo/erro do provedor
  ([`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts),
  [`web/app/api/auth/signup/handler.ts`](web/app/api/auth/signup/handler.ts)).
- **Nenhum catch silencioso mascara bug real.** O único `catch {}` sem log
  (decodificação do JWT de sessão em
  [`web/app/api/auth/login/handler.ts`](web/app/api/auth/login/handler.ts))
  trata um token malformado como "não verificado" — fail-closed documentado em
  comentário, não um erro engolido por acidente.
- **Sem corpo JSON cru exposto ao usuário.** Os formulários são `<form>` HTML
  puro (sem JavaScript client-side), então o que uma rota de API devolve é o
  que o navegador renderiza. Toda falha sem campo associado (limite de
  requisições excedido, Identity Platform indisponível) redireciona (`303`)
  para `/error?reason=...`, uma tela genérica em
  [`web/components/error/generic-error.tsx`](web/components/error/generic-error.tsx),
  em vez de deixar o navegador exibir o JSON bruto do erro. Exceções não
  tratadas em qualquer página caem no error boundary do Next.js em
  [`web/app/error.tsx`](web/app/error.tsx), que reaproveita a mesma tela.

## Notas para agentes

Se você é um agente de IA trabalhando neste repositório, leia primeiro
[`CLAUDE.md`](CLAUDE.md) — ele documenta o fluxo de start/stop da VM e dois
bugs reais que vale conhecer antes de mexer em
`infra/scripts/startup.sh.tpl`.
