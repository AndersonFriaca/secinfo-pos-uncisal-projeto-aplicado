# Visão geral do projeto

Resumo em uma página do que o repositório entrega, organizado pelos três eixos
do [`prd.md`](../prd.md). Versão em PDF: [`visao-geral.pdf`](visao-geral.pdf).
Detalhes em cada documento de [`docs/`](README.md).

> Infraestrutura GCP endurecida (Terraform + startup script idempotente),
> Nginx com TLS pós-quântico, aplicação Next.js 16 com autenticação
> server-side e pipeline GitHub Actions keyless que só toca a VM quando uma
> release semver é cortada.

## Fluxo de requisição

```
Internet (banca, SSL Labs, GitHub Actions)
   │
   ▼
Firewall (VPC custom, 4 regras): :22 público · :22 faixa IAP · :80 · :443
   │
   ▼
Nginx — certificado Let's Encrypt de IP, TLS 1.2+/AEAD, X25519MLKEM768 via oqs-provider
   ├─ :80  → 301 para :443
   └─ :443 → proxy_pass localhost:3000
                │
                ▼
             PM2 · usuário appsvc · Next.js standalone em /opt/app/current
                │
                ▼
             Identity Platform (auth REST) · Secret Manager (API key em runtime)
```

SSH: somente chave, jail do Fail2ban (4 erros, ban de 24 h),
`block-project-ssh-keys = TRUE`. O deploy entra por túnel IAP com chave efêmera.

## Os três eixos do `prd.md`

### Eixo 1 — Infraestrutura

- Ubuntu 24.04 em Shielded VM `e2-micro`, tudo dentro do Always Free tier
- Nginx como web server e reverse proxy
- IP público sem domínio; estático apenas enquanto a VM está ligada
- SSH somente por chave (`PasswordAuthentication no`)
- Fail2ban na porta 22: 4 tentativas, 24 h de banimento
- Certbot via snap com certificado de endereço IP e renovação automática
- Redirecionamento HTTP → HTTPS (301)
- Qualys SSL Labs nota A com PQC ativo (`X25519MLKEM768`)

### Eixo 2 — Repositório

- Repositório público no GitHub, Conventional Commits
- Nenhum segredo commitado: `terraform.tfvars` e `backend.hcl` gitignorados
- Project ID nunca hardcoded; bucket de state via `-backend-config`
- Nenhuma chave SSH em secrets do GitHub — autenticação keyless (WIF)
- Guardrail no CI falha o PR se a deploy SA ganhar role de projeto

### Eixo 3 — Aplicação

- Tela de login, página interna protegida, logout funcional
- Next.js 16 (App Router, TypeScript, Vitest)
- Sessão em cookie `HttpOnly` via Identity Platform, verificada no servidor
- Proteção CSRF (same-origin) e CSP com nonce
- Formulários HTML puros, sem JavaScript no cliente; redirects 303
- OWASP Top 10:2025: 9 de 10 categorias mitigadas em código (mínimo exigido: 3)

## Pipeline: do push à VM

| # | Etapa | Detalhe |
| --- | --- | --- |
| 1 | `git push origin main` | Dispara `release.yml`. `ci.yml` já rodou lint, typecheck e testes no PR. |
| 2 | release-please abre/atualiza o PR `chore(main): release X.Y.Z` | Bump semver por Conventional Commits e `web/CHANGELOG.md`. Nunca editado à mão. |
| 3 | **Merge do PR de release = tag `vX.Y.Z` + GitHub Release** | Só aqui `deploy.yml` é chamado. Um push comum não chega à VM. |
| 4 | `npm ci`, testes, `next build` standalone no runner | Nunca na VM (1 GB RAM). Raiz do bundle é `.next/standalone/web`. |
| 5 | Auth GCP keyless (Workload Identity Federation) | Deploy SA sem role de projeto: `compute.instanceAdmin.v1` na instância, `iap.tunnelResourceAccessor`, custom role `deployVmOperator`. |
| 6 | scp/ssh por túnel IAP com chave efêmera | `/opt/app/releases/<sha>` → `current`; `pm2 delete` + `pm2 start` como `appsvc`. |
| 7 | Health check | Poll de `https://<ip>/` até HTTP 200 (até 2 minutos). |

O gate por release é deliberado: cada deploy corresponde a uma tag auditável
(OWASP *Software and Data Integrity Failures*). Para redeploy sem cortar
release: `workflow_dispatch` no workflow **Deploy**.

## OWASP Top 10:2025 na aplicação

| Categoria | Status | Mecanismo |
| --- | --- | --- |
| Identification & Authentication Failures | mitigada | 5 falhas por IP bloqueiam 60 s (`lib/security/rate-limit.ts`); erros genéricos; senha ≥ 12 caracteres |
| Broken Access Control | mitigada | Sessão verificada no servidor em toda rota protegida; CSRF por `Origin` em `proxy.ts` |
| Security Misconfiguration | mitigada | Headers OWASP, CSP com nonce, `poweredByHeader: false`, `server_tokens off` |
| Cryptographic Failures | mitigada | Cookie `HttpOnly; Secure; SameSite`; API key só no Secret Manager (`lib/gcp/secret.ts`) |
| Injection | mitigada | Sem banco de dados; entrada verificada por tipo antes do uso |
| Insecure Design | mitigada | Senha validada antes de chamada externa; não enumeração; fail-closed |
| Software & Data Integrity Failures | mitigada | Deploy só por release; health check; todo `JSON.parse` protegido |
| Software Supply Chain Failures | parcial | `package-lock.json` + `npm ci`. Lacuna: sem Dependabot/Renovate nem `npm audit` |

Mapeamento completo, com arquivos: [README.md](../README.md#segurança-da-aplicação-owasp-top-102025).

## Startup script: estágios idempotentes

`infra/scripts/startup.sh.tpl` roda em todo boot; cada estágio tem guard próprio.

| Estágio | O que faz |
| --- | --- |
| 0 | Auto-reparo: se o provider PQC quebrou o `openssl.cnf`, reverte e restaura SSH/Nginx |
| 1 / 1b | Pacotes base · Node.js 24 LTS via NodeSource |
| 2 | SSH hardening (`PasswordAuthentication no`, reload em `ssh.service`) |
| 3 | Fail2ban jail sshd: 4 tentativas, ban 24 h |
| 4 | Certbot via snap (≥ 5.4, certificado de IP) |
| 5 / 5b | Site HTTP para o desafio ACME · `server_tokens off` |
| 6 | Certificado de IP da Let's Encrypt |
| 7 | Server block HTTPS com política TLS 1.2+/AEAD dentro do bloco + redirect 301 |
| 8 / 8b | Timer de renovação · PQC via `oqsprovider.so` do bucket `vm-assets`, `systemctl restart nginx` |
| 9 | Usuário `appsvc` + PM2 + unit `pm2-appsvc` |
| 10 | `/opt/app`, `ecosystem.config.js` reescrito, reverse proxy com `X-Forwarded-*`, guard `tls-policy vN` |

## Operação e custo zero

| | |
| --- | --- |
| Ligar | `./ops/vm-start.sh` — reserva IP estático, anexa, inicia |
| Desligar | `./ops/vm-stop.sh` — para a instância, libera o IP |
| Por quê | IP reservado só é cobrado quando não está anexado a uma VM ligada. O Terraform declara IP efêmero; a reserva vive só enquanto a VM está de pé. |
| Drift | `terraform apply` com a VM ligada troca o IP para efêmero. Preferir `vm-stop.sh` antes. |
| Nunca | `gcloud compute instances start/stop` direto, nem `addresses create/delete` à mão |

## Layout do repositório

```
web/               Next.js 16 · route.ts + handler.ts testados
infra/bootstrap/   state bucket + billing budget (local state, nunca destruído)
infra/             VPC, firewall, compute, Identity Platform, WIF, Secret Manager
infra/scripts/     startup.sh.tpl + ecosystem.config.js
ops/               vm-start.sh / vm-stop.sh
.github/workflows/ ci · release · deploy · build-oqsprovider
docs/              arquitetura, deploy, operação, segurança, free tier, troubleshooting
prd.md             requisitos da disciplina
```

## Lições que só o deploy real ensinou

1. A unit do SSH é `ssh.service` no Ubuntu 24.04; `reload sshd` mata o script sob `set -euo pipefail`.
2. O path do certificado embute o IP; o guard do vhost precisa comparar o IP embutido com o atual.
3. `ecosystem.config.js` é reescrito em todo boot; um guard `[ ! -f ]` deixou uma cópia antiga crash-loopando.
4. O standalone fica em `.next/standalone/web/` por causa do workspace; static e public não vêm junto.
5. Sem `X-Forwarded-Proto: https`, todo `POST /api/auth/*` retornava 403.
6. `reload` não ativa provider OpenSSL novo; só `restart`.
7. `liboqs` não compila na `e2-micro`; o provider vem de um runner `ubuntu-24.04` e do bucket privado.
8. `ssl_protocols` precisa estar dentro do server block, senão o `nginx.conf` stock capa a nota em B.

Detalhes: [troubleshooting.md](troubleshooting.md).
