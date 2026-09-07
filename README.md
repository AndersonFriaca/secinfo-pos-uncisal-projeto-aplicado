# Projeto Aplicado — Infraestrutura GCP

Infraestrutura como código (Terraform) para um ambiente de hospedagem GCP
endurecido e dentro do free tier, destinado à aplicação Next.js do projeto.
Consulte [`prd.md`](prd.md) para os requisitos completos da disciplina
(Eixo 1: Cloud Infra).

Este repositório provisiona apenas a camada de infraestrutura — a aplicação em
si é construída em uma feature separada. Uma VM `e2-micro` endurecida serve
HTTPS (certificado real da Let's Encrypt, sem necessidade de domínio) via
Nginx. A porta `:22` fica pública e aberta para a banca avaliadora da
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

A aplicação Next.js em `web/` implementa mitigações ativas para quatro
categorias do OWASP Top 10:2025. Cada item nomeia o mecanismo e o arquivo que
o carrega.

### Identification and Authentication Failures

- **Bloqueio de IP por força bruta.** Cinco falhas consecutivas de login a
  partir de um mesmo IP bloqueiam esse IP por 60 segundos; o contador zera no
  sucesso ou quando o bloqueio expira. A lógica de decisão (limiares
  injetados, relógio injetado) está em
  [`web/lib/security/rate-limit-core.ts`](web/lib/security/rate-limit-core.ts);
  o store apoiado no Firestore, com um cache em processo que rejeita um IP já
  bloqueado sem ida ao banco, está em
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

## Notas para agentes

Se você é um agente de IA trabalhando neste repositório, leia primeiro
[`CLAUDE.md`](CLAUDE.md) — ele documenta o fluxo de start/stop da VM e dois
bugs reais que vale conhecer antes de mexer em
`infra/scripts/startup.sh.tpl`.
