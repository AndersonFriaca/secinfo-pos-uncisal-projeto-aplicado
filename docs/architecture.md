# Arquitetura

## Dois roots Terraform, separados por raio de impacto

```
infra/bootstrap/          infra/
┌──────────────────┐      ┌──────────────────────────────┐
│ GCS state bucket  │      │ Custom VPC + subnet          │
│ Billing budget    │◄─────┤ firewall: SSH, IAP-SSH,      │
│ (own local state, │ state│          80, 443             │
│  never destroyed) │      │ e2-micro instance            │
└──────────────────┘      │ Identity Platform, WIF,      │
   persistent, free       │ Secret Manager, vm-assets    │
                          └──────────────────────────────┘
                              billable, torn down by
                               `terraform destroy` here only
```

- **`infra/bootstrap/`** — os dois recursos projetados para *sobreviver* a um
  teardown: o bucket GCS que guarda o state remoto de `infra/` e o alerta de
  billing budget. Ambos são gratuitos independentemente do restante do
  projeto e continuam ativos após `infra/` ser destruído — o monitoramento de
  gastos nunca é interrompido e o state não depende da máquina do operador.
  Aplicado uma vez, com state local próprio.
- **`infra/`** — todo recurso cobrável ou específico da aplicação: rede,
  firewall, instância de compute, Identity Platform, Workload Identity
  Federation, Secret Manager e o bucket de artefatos. O state fica no bucket
  criado pelo root de bootstrap. Um `terraform destroy` executado aqui não
  alcança `infra/bootstrap/`: são roots estruturalmente separados, não apenas
  protegidos por uma flag de lifecycle.

Por que não um único root com `lifecycle { prevent_destroy = true }` no
bucket? Porque `prevent_destroy` aborta o plano de destroy *inteiro* ao
encontrar esse recurso — `terraform destroy` não removeria mais nada. Dois
roots é o que permite "destruir tudo que é cobrável, manter o que é gratuito".

## Fluxo de requisição

```
Internet
   │
   ▼
Firewall (custom VPC, never GCP's `default`): :22 público (aberto para a banca,
   │          restringível via var.operator_ssh_cidrs), :22 da faixa IAP (deploy
   │          da CI sem chave), mais :80 e :443
   │
   ▼
e2-micro instance (Ubuntu 24.04, Shielded VM)
   │
   ├─ :22  → sshd — público + faixa IAP (somente chave, jail do Fail2ban;
   │          var.operator_ssh_cidrs restringe a origem pública)
   ├─ :80  → Nginx → 301 redirect to :443
   └─ :443 → Nginx (Let's Encrypt IP certificate, TLS 1.3 + X25519MLKEM768)
               └─ proxy_pass → localhost:3000 (PM2-managed Next.js app, user appsvc)
                     └─ Identity Platform REST (auth), Secret Manager (API key)
```

Enquanto nenhum release foi publicado em `/opt/app/current`, o reverse proxy
responde `502` em `/`. O primeiro deploy acontece no merge do primeiro PR de
release — veja [operations.md](operations.md#cortar-uma-release-tag--github-release).

## Componentes

| Arquivo | Recurso(s) | Propósito |
| --- | --- | --- |
| `infra/bootstrap/storage.tf` | `google_storage_bucket` | State remoto do Terraform para `infra/` |
| `infra/bootstrap/billing.tf`, `billing-data.tf`, `billing-variables.tf` | `google_billing_budget`, `google_project_service` | Alerta de gastos (padrão adaptado de [eatonc/actual-gcp](https://github.com/eatonc/actual-gcp)) |
| `infra/network.tf` | `google_compute_network`, `google_compute_subnetwork` | VPC custom dedicada — sem regras permissivas herdadas |
| `infra/firewall.tf` | `google_compute_firewall` (×4) | Ingress de menor privilégio: SSH público (restringível via `var.operator_ssh_cidrs`), SSH da faixa IAP, HTTP, HTTPS |
| `infra/compute.tf` | `google_compute_instance` | A VM — cada parâmetro fixado para free tier, Shielded VM, service account com escopo `cloud-platform` e IAM restrito |
| `infra/app.tf` | `google_project_service`, `google_identity_platform_config`, `google_apikeys_key` | APIs da aplicação, sign-in por e-mail/senha, API key restrita a `identitytoolkit`. Sem banco de dados — o rate limiting é em memória |
| `infra/secrets.tf` | `google_secret_manager_secret` + version, `google_secret_manager_secret_iam_member` | Espelha a API key do Identity Platform no Secret Manager; `roles/secretmanager.secretAccessor` apenas para a service account da VM, apenas nesse secret |
| `infra/firebase.tf` | `google_firebase_project` (google-beta) | Habilita o Firebase no projeto (Firebase Authentication) |
| `infra/wif.tf` | `google_iam_workload_identity_pool` + provider, `google_service_account`, IAM de menor privilégio | Identidade sem chave para o deploy do GitHub Actions; a deploy SA não possui role predefinida de projeto |
| `infra/artifacts.tf` | `google_storage_bucket`, `google_storage_bucket_iam_member` | Bucket privado `vm-assets` para binários pré-compilados (hoje: `oqsprovider.so`) — leitura apenas pela service account da VM |
| `infra/backend.tf` | `terraform { backend "gcs" {} }` | Aponta para o bucket de bootstrap via `-backend-config` (nunca um nome de bucket hardcoded — veja [security.md](security.md)) |
| `infra/scripts/startup.sh.tpl` | (instance metadata) | Provisionamento idempotente no boot — veja os estágios abaixo |
| `infra/scripts/ecosystem.config.js` | (copiado para `/opt/app`) | Definição do processo PM2 da aplicação Next.js |
| `.github/workflows/build-oqsprovider.yml` | (GitHub Actions, `workflow_dispatch`) | Compila `liboqs` + `oqs-provider` num runner `ubuntu-24.04`; artefato enviado manualmente ao bucket acima — veja [security.md](security.md#pqc-troca-de-chaves-pós-quântica-híbrida) |
| `ops/vm-start.sh`, `ops/vm-stop.sh` | (chamadas imperativas de `gcloud`) | Reserva/anexa/libera um IP estático apenas enquanto a VM está ativa — veja [operations.md](operations.md) |

## Estágios do startup script

`infra/scripts/startup.sh.tpl` executa em todo boot (o GCP reexecuta
`metadata.startup-script` a cada inicialização) e é idempotente estágio por
estágio — cada um tem seu próprio guard, de modo que a reexecução é um no-op
onde nada mudou:

0. Auto-reparo: se uma ativação anterior do provider PQC quebrou o
   `openssl.cnf` (detectado via `nginx -t`), reverte e restaura SSH/Nginx —
   executa antes de qualquer outro estágio
1. Pacotes base (`nginx`, `fail2ban`, `snapd`, `curl`, `ca-certificates`)
1b. Node.js 24 LTS via NodeSource (o `apt` do Ubuntu 24.04 fornece o Node 18)
2. Hardening de SSH — `PasswordAuthentication no`
3. Jail `sshd` do Fail2ban — 4 tentativas, ban de 24 h
4. Instalação do Certbot via `snap` (não `apt` — veja [security.md](security.md))
5. Site Nginx base somente HTTP (serve o desafio ACME HTTP-01)
5b. `server_tokens off` (oculta a versão do Nginx no header `Server`)
6. Obtenção de um certificado de endereço IP da Let's Encrypt
7. Server block HTTPS (política TLS 1.2+/AEAD — veja
   [security.md](security.md#política-tls-qualys-ssl-labs-nota-a)) + redirect
   HTTP→HTTPS (apenas com certificado válido)
8. Confirma/habilita o timer de renovação do Certbot
8b. Ativa PQC (`X25519MLKEM768`) no TLS do Nginx via `oqs-provider` — veja
    [security.md](security.md#pqc-troca-de-chaves-pós-quântica-híbrida)
9. Usuário de serviço `appsvc` + instalação do PM2 + registro no systemd
   (`pm2-appsvc`)
10. Diretório `/opt/app` + `ecosystem.config.js` (reescrito em todo boot) +
    reverse proxy do Nginx para `localhost:3000` com headers `X-Forwarded-*`
    e a mesma política TLS do estágio 7 (o guard reescreve vhosts antigos
    sem `X-Forwarded-Proto` ou sem o marker da política)

[troubleshooting.md](troubleshooting.md) documenta as falhas encontradas
apenas ao executar este script contra uma VM real.
