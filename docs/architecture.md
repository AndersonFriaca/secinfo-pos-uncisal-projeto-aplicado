# Arquitetura

## Dois roots Terraform, separados por raio de impacto

```
infra/bootstrap/          infra/
┌──────────────────┐      ┌──────────────────────────────┐
│ GCS state bucket  │      │ Custom VPC + subnet          │
│ Billing budget    │◄─────┤ firewall: SSH, IAP-SSH,      │
│ (own local state, │ state│          80, 443             │
│  never destroyed) │      │ e2-micro instance            │
└──────────────────┘      │ (backed by the gcs bucket)   │
   persistent, free       └──────────────────────────────┘
                              billable, torn down by
                               `terraform destroy` here only
```

- **`infra/bootstrap/`** — os únicos dois recursos feitos para *sobreviver* a
  um teardown: o bucket GCS que guarda o state remoto de `infra/` e o alerta
  de billing budget. Ambos são gratuitos independentemente do que mais exista
  no projeto, então continuam de pé mesmo depois de `infra/` ser totalmente
  destruído — o monitoramento de gastos nunca é interrompido e o state
  sobrevive a um notebook formatado. Aplicado uma vez, com seu próprio state
  local, raramente tocado de novo.
- **`infra/`** — todo recurso cobrável: a rede, o firewall e a instância de
  compute. Seu state fica no bucket que o root de bootstrap criou. Um
  `terraform destroy` rodado aqui nunca consegue alcançar `infra/bootstrap/` —
  são roots estruturalmente separados, não apenas protegidos por uma flag de
  lifecycle.

Por que não um único root com `lifecycle { prevent_destroy = true }` no
bucket? Porque `prevent_destroy` aborta o plano de destroy *inteiro* do
Terraform assim que ele encontra aquele recurso — não deixaria o `terraform
destroy` remover mais nada também. Dois roots é o que faz "destruir tudo que é
cobrável, manter o que é gratuito" realmente funcionar.

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
   └─ :443 → Nginx (Let's Encrypt IP certificate)
               └─ proxy_pass → localhost:3000 (PM2-managed Next.js app)
```

O reverse proxy em `:3000` retorna `502` até que um build Next.js seja de fato
publicado ali — isso é esperado; o deploy da aplicação é uma feature separada
(veja o Eixo 3 do `prd.md`).

## Componentes

| Arquivo | Recurso(s) | Propósito |
| --- | --- | --- |
| `infra/bootstrap/storage.tf` | `google_storage_bucket` | State remoto do Terraform para `infra/` |
| `infra/bootstrap/billing.tf`, `billing-data.tf`, `billing-variables.tf` | `google_billing_budget`, `google_project_service` | Alerta de gastos (padrão vindo de [eatonc/actual-gcp](https://github.com/eatonc/actual-gcp)) |
| `infra/network.tf` | `google_compute_network`, `google_compute_subnetwork` | VPC custom dedicada — sem regras permissivas herdadas |
| `infra/firewall.tf` | `google_compute_firewall` | Ingress de menor privilégio: SSH público (restringível via `var.operator_ssh_cidrs`), SSH da faixa IAP (sempre), HTTP, HTTPS |
| `infra/compute.tf` | `google_compute_instance` | A própria VM — cada configuração fixada para free-tier + Shielded VM |
| `infra/app.tf` | `google_project_service`, `google_identity_platform_config`, `google_apikeys_key` | APIs da aplicação, config de sign-in email/senha, API key restrita a `identitytoolkit`. Sem banco de dados — o rate limiting é em memória |
| `infra/firebase.tf` | `google_firebase_project` (google-beta) | Habilita o Firebase no projeto (Firebase Authentication) |
| `infra/wif.tf` | `google_iam_workload_identity_pool` + provider, `google_service_account`, IAM de menor privilégio | Identidade sem chave para o deploy do GitHub Actions |
| `infra/scripts/startup.sh.tpl` | (instance metadata) | Provisionamento idempotente no boot — veja a lista de estágios abaixo |
| `infra/scripts/ecosystem.config.js` | (copiado para `/opt/app`) | Definição do processo PM2 para a futura aplicação Next.js |
| `infra/backend.tf` | `terraform { backend "gcs" {} }` | Aponta para o bucket de bootstrap via `-backend-config` (nunca um nome de bucket hardcoded — veja [security.md](security.md)) |
| `ops/vm-start.sh`, `ops/vm-stop.sh` | (chamadas imperativas de `gcloud`) | Reserva/anexa/libera um IP estático em torno do tempo real de atividade da VM — veja [operations.md](operations.md) |

## Estágios do script de inicialização

`infra/scripts/startup.sh.tpl` roda em todo boot (o GCP re-executa
`metadata.startup-script` a cada vez) e é idempotente estágio por estágio —
cada um se protege sozinho, de modo que um re-run é um no-op seguro onde nada
mudou:

1. Pacotes base (`nginx`, `fail2ban`, `snapd`, `curl`, `ca-certificates`)
1b. Node.js 24 LTS via NodeSource (o `apt` do Ubuntu 24.04 traz o Node 18)
2. Hardening de SSH — `PasswordAuthentication no`
3. Jail `sshd` do Fail2ban — 4 tentativas, ban de 24h
4. Instalação do Certbot via `snap` (não `apt` — veja [security.md](security.md))
5. Site Nginx base só em HTTP (serve o desafio ACME) + `server_tokens off`
6. Obtenção de um certificado de endereço IP da Let's Encrypt
7. Server block HTTPS + redirect HTTP→HTTPS
8. Confirma/habilita o timer de renovação do Certbot
9. Usuário de serviço `appsvc` + instalação do PM2 + registro no systemd (`pm2-appsvc`)
10. Diretório `/opt/app` + reverse proxy do Nginx para `localhost:3000`

Veja [troubleshooting.md](troubleshooting.md) para dois bugs reais
encontrados apenas ao rodar isto contra uma VM ao vivo.
