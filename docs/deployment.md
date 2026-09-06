# Deployment

## Pré-requisitos

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [gcloud CLI](https://cloud.google.com/sdk/docs/install), autenticado:
  `gcloud auth login`
- Um projeto GCP existente e uma conta de billing aberta e existente vinculada
  a ele
- Um par de chaves SSH (por exemplo, `~/.ssh/id_ed25519` / `id_ed25519.pub`)

Duas APIs em nível de projeto GCP precisam estar habilitadas antes do primeiro
apply — o Terraform não as habilita para você porque habilitá-las exige que
`cloudresourcemanager.googleapis.com` já esteja ligada:

```bash
gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com compute.googleapis.com \
  --project=<your-project-id>
```

## 1. Configure as variáveis

Copie os dois arquivos de exemplo e preencha com seus próprios valores —
**nunca faça commit das cópias reais**, ambas estão no gitignore:

```bash
cp terraform.tfvars.example infra/terraform.tfvars
cp infra/backend.hcl.example infra/backend.hcl   # bucket name goes here after step 2
```

`infra/terraform.tfvars` precisa de: `project_id`, `region` (padrão
`us-east1`), `zone` (padrão `us-east1-b`), `ssh_username`,
`ssh_public_key_path` e, opcionalmente, `operator_ssh_cidrs` (padrão
`["0.0.0.0/0"]` = `:22` público aberto para a banca avaliadora; restrinja a
CIDRs específicos, por exemplo `["203.0.113.4/32"]`, para endurecer — em
qualquer caso o `:22` é somente por chave e protegido por Fail2ban). Um
`infra/bootstrap/terraform.tfvars` separado precisa de: `project_id`,
`region`, `state_bucket_name` (precisa ser globalmente único —
`<project-id>-state` é uma convenção segura), `billing_account_name` (encontre
com `gcloud billing accounts list`) e, opcionalmente,
`billing_alert_currency_code` / `billing_alert_amount` se a moeda da sua conta
de billing não for USD — veja [free-tier.md](free-tier.md#orçamento-de-billing).

## 2. Bootstrap (state bucket + billing budget)

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Isto cria os dois recursos persistentes descritos em
[architecture.md](architecture.md). Copie o output `state_bucket_name`
impresso para `infra/backend.hcl`:

```hcl
bucket = "<state_bucket_name output>"
```

## 3. Aponte o root principal para o backend remoto

```bash
cd ../   # back to infra/
terraform init -backend-config=backend.hcl -migrate-state
```

O Terraform pede confirmação para copiar o state local existente para o novo
backend GCS — aceite. Daqui em diante, o state de `infra/` vive no bucket; o
state próprio de `infra/bootstrap/` (o recurso do bucket em si) permanece
local e separado, por design.

## 4. Faça o deploy dos recursos cobráveis

```bash
terraform plan
terraform apply
```

Isto provisiona a VPC/subnet custom, as quatro regras de firewall e a
instância `e2-micro` rodando o script de inicialização (veja
[architecture.md](architecture.md#estágios-do-script-de-inicialização)). O
primeiro boot leva alguns minutos — pacotes instalam, o Certbot pede um
certificado, o PM2 é registrado.

## 5. Verifique

```bash
terraform output instance_external_ip
curl -I http://<ip>          # expect a 301 redirect to https
curl -Ik https://<ip>        # expect a valid Let's Encrypt cert (302/502 on / is fine — no app deployed yet)
ssh <ssh_username>@<ip>                                                       # public :22 is open by default (key-only); a password prompt would mean something's wrong
gcloud compute ssh <ssh_username>@app-vm --zone=<zone> --tunnel-through-iap   # same VM via the IAP tunnel (works even if operator_ssh_cidrs is narrowed)
```

Assim que você de fato publicar um build Next.js em `/opt/app` e rodar `pm2
start ecosystem.config.js && pm2 save` na VM, `https://<ip>/` passa a servir a
aplicação em vez de `502`.

## Operação do dia a dia

Para iniciar/parar a VM (o que também trata da dança de reserva/liberação do
IP estático), teardown e verificações de saúde, veja
[operations.md](operations.md).
