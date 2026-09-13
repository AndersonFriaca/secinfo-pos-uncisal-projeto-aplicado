# Deployment

## Pré-requisitos

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) autenticado
  (`gcloud auth login`)
- Um projeto GCP existente vinculado a uma conta de billing ativa
- Um par de chaves SSH (por exemplo, `~/.ssh/id_ed25519` / `id_ed25519.pub`)

Três APIs de projeto precisam estar habilitadas antes do primeiro apply. O
Terraform não as habilita porque fazê-lo exige que
`cloudresourcemanager.googleapis.com` já esteja ativa:

```bash
gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com compute.googleapis.com \
  --project=<your-project-id>
```

## 1. Configure as variáveis

Copie os dois arquivos de exemplo e preencha com seus valores. As cópias
reais estão no `.gitignore` — nunca as versione:

```bash
cp terraform.tfvars.example infra/terraform.tfvars
cp infra/backend.hcl.example infra/backend.hcl   # bucket name goes here after step 2
```

`infra/terraform.tfvars` requer `project_id`, `region` (padrão `us-east1`),
`zone` (padrão `us-east1-b`), `ssh_username`, `ssh_public_key_path` e,
opcionalmente, `operator_ssh_cidrs` (padrão `["0.0.0.0/0"]`: `:22` público
para a banca avaliadora; restrinja a CIDRs específicos, por exemplo
`["203.0.113.4/32"]`, para endurecer — em qualquer caso o `:22` é somente por
chave e protegido por Fail2ban).

`infra/bootstrap/terraform.tfvars` (separado) requer `project_id`, `region`,
`state_bucket_name` (globalmente único — `<project-id>-state` é uma convenção
segura), `billing_account_name` (obtenha com `gcloud billing accounts list`)
e, opcionalmente, `billing_alert_currency_code` / `billing_alert_amount` se a
moeda da conta de billing não for USD — veja
[free-tier.md](free-tier.md#orçamento-de-billing).

## 2. Bootstrap (state bucket + billing budget)

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Cria os dois recursos persistentes descritos em
[architecture.md](architecture.md). Copie o output `state_bucket_name` para
`infra/backend.hcl`:

```hcl
bucket = "<state_bucket_name output>"
```

## 3. Aponte o root principal para o backend remoto

```bash
cd ../   # back to infra/
terraform init -backend-config=backend.hcl -migrate-state
```

O Terraform pede confirmação para copiar o state local existente para o
backend GCS — aceite. A partir daqui o state de `infra/` vive no bucket; o
state de `infra/bootstrap/` (que contém o próprio bucket) permanece local e
separado, por design.

## 4. Aplique os recursos cobráveis

```bash
terraform plan
terraform apply
```

Provisiona a VPC/subnet custom, as quatro regras de firewall, a instância
`e2-micro` com o startup script
([architecture.md](architecture.md#estágios-do-startup-script)), o Identity
Platform com API key, o pool de Workload Identity, o secret no Secret Manager
e o bucket `vm-assets`. O primeiro boot leva alguns minutos: instalação de
pacotes, emissão do certificado pelo Certbot e registro do PM2.

## 5. Verifique

```bash
terraform output instance_external_ip
curl -I http://<ip>          # expect a 301 redirect to https
curl -Ik https://<ip>        # expect a valid Let's Encrypt cert (502 on / is expected until the first release is deployed)
ssh <ssh_username>@<ip>                                                       # public :22 is open by default (key-only); a password prompt would mean something's wrong
gcloud compute ssh <ssh_username>@app-vm --zone=<zone> --tunnel-through-iap   # same VM via the IAP tunnel (works even if operator_ssh_cidrs is narrowed)
```

`https://<ip>/` passa a servir a aplicação após o primeiro deploy pelo
pipeline de release (passo 7).

## 6. Configure os secrets do GitHub Actions

`.github/workflows/deploy.yml` lê quatro secrets, nenhum deles sensível. Dois
saem dos outputs do Terraform:

```bash
terraform -chdir=infra output -raw wif_provider_name            # → GCP_WIF_PROVIDER
terraform -chdir=infra output -raw deploy_service_account_email  # → GCP_DEPLOY_SA_EMAIL
```

Os outros dois são `GCP_PROJECT_ID` e `GCP_ZONE`, os mesmos valores de
`terraform.tfvars`. Não há secret de chave SSH (o deploy usa túnel IAP com
chave efêmera) nem de API key da aplicação (lida do Secret Manager em runtime)
— veja [security.md](security.md).

## 7. Releases versionadas e deploy

Nenhuma configuração adicional: `.github/workflows/release.yml`
(`release-please`) gera tags `vX.Y.Z` e GitHub Releases a partir dos commits
Conventional Commits em `main`, e o merge do PR de release dispara o
`deploy.yml`. Veja
[operations.md](operations.md#cortar-uma-release-tag--github-release).

## Operação

Start/stop da VM (incluindo o ciclo de reserva/liberação do IP estático),
teardown e verificações de saúde: [operations.md](operations.md).
