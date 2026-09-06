# Troubleshooting

## Como olhar, antes de chutar

```bash
# Boot-time script output — works even if SSH is broken:
gcloud compute instances get-serial-port-output app-vm --zone=<zone> --project=<project_id> \
  | grep -iE "startup-script|error|failed"

# SSH via gcloud's own managed key — bypasses a passphrase-locked local key.
# Public :22 is open by default; add --tunnel-through-iap when operator_ssh_cidrs
# has been narrowed (the calling principal then needs
# roles/iap.tunnelResourceAccessor):
gcloud compute ssh <ssh_username>@app-vm --zone=<zone> --project=<project_id> --tunnel-through-iap
```

Procure por `Script "startup-script" failed with error: exit status N` no log
serial — isso significa que o `set -euo pipefail` matou o script em qualquer
estágio imediatamente anterior, e **nenhum estágio posterior rodou** (sem
Fail2ban, sem cert, sem PM2, dependendo de quão cedo ele morreu).

## Dois bugs reais, encontrados só fazendo o deploy de verdade

Ambos eram invisíveis lendo apenas o Terraform/shell — só apareceram depois
que a VM de fato bootou.

### 1. `systemctl reload sshd` falha no Ubuntu 24.04

**Sintoma:** o script de inicialização morre logo depois do Estágio 2
(hardening de SSH); Fail2ban, Certbot e PM2 nunca rodam; o HTTP serve a página
padrão do Nginx em vez do site real.

**Causa:** a unit do systemd para SSH no Ubuntu 24.04 se chama `ssh.service`,
não `sshd.service`. `reload sshd` falha com `Unit sshd.service not found`, e
sob `set -e` isso mata o script inteiro.

**Correção (já aplicada):** `infra/scripts/startup.sh.tpl` usa `systemctl
reload ssh`.

### 2. O Nginx mantém um caminho de certificado obsoleto depois que o IP muda

**Sintoma:** o Certbot emite com sucesso um certificado para o IP *atual* da
VM, mas o HTTPS ainda falha ou serve um cert inexistente — `nginx -T` mostra
`ssl_certificate` apontando para `/etc/letsencrypt/live/<old-ip>/`.

**Causa:** o server block HTTPS é escrito uma vez e protegido apenas por "o
arquivo existe" — depois do primeiro boot bem-sucedido, boots posteriores (por
exemplo, depois de trocar para um IP diferente) pulam a reescrita dele, mesmo
que um certificado novo tenha sido emitido para o novo IP.

**Correção (já aplicada):** o guard também reescreve o arquivo quando o IP
embutido nele não bate mais com o atual:

```bash
if [ "$CERT_OBTAINED" = true ] && { [ ! -f "$HTTPS_SITE" ] || ! grep -qF "/etc/letsencrypt/live/$PUBLIC_IP/" "$HTTPS_SITE"; }; then
```

Se você algum dia vir esse sintoma de novo em um script modificado, verifique
que o guard de "já configurado" que você adicionou checa se o *conteúdo* bate
com o estado atual, não apenas se um arquivo está presente.

## Erros comuns no momento do apply

| Erro | Causa | Correção |
| --- | --- | --- |
| `googleapi: Error 403 ... requires a quota project` | As Application Default Credentials não têm quota project definido | `gcloud auth application-default set-quota-project <project-id>` |
| `googleapi: Error 403 ... Cloud Billing API has not been used` / `Cloud Resource Manager API has not been used` | `user_project_override = true` no provider significa que *toda* chamada de API agora precisa das APIs do próprio projeto do chamador habilitadas | `gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project=<project-id>` |
| `googleapi: Error 403 ... Compute Engine API has not been used` | `compute.googleapis.com` ainda não habilitada | `gcloud services enable compute.googleapis.com --project=<project-id>` |
| `Error creating Budget: ... Error 400` sem mais detalhes | `billing_alert_currency_code` não bate com a moeda real da conta de billing | `gcloud billing accounts describe <account-id>` para checar, depois defina a moeda correta em `infra/bootstrap/terraform.tfvars` |
| `Changing the machine_type, ... shielded_instance_config, ... network_interface ... on a started instance requires stopping it` | Uma mudança in-place precisa da instância parada primeiro | Já tratado — `allow_stopping_for_update = true` está definido na instância |
| SSH `Permission denied (publickey)` logo depois de o metadata mostrar a chave correta | O guest agent ainda não propagou a chave para a VM, ou sua chave privada local precisa de uma passphrase que seu shell não consegue fornecer | Espere ~30s e tente de novo, ou use `gcloud compute ssh ... --tunnel-through-iap` (usa a própria chave gerenciada, contorna uma chave local travada; necessário quando `operator_ssh_cidrs` foi restrito e seu IP ficou de fora) |
