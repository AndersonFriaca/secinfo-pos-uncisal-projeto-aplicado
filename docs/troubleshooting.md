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

## Bugs reais, encontrados só fazendo o deploy de verdade

Todos eram invisíveis lendo apenas o Terraform/shell — só apareceram depois
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

### 3. `reload` do Nginx não recarrega o provider `oqsprovider`

**Sintoma:** tudo parece correto — `oqsprovider.so` existe,
`openssl.cnf` tem a ativação certa, `openssl list -providers` até mostra
`oqsprovider` como `active` — e `nginx -t` passa validando
`ssl_ecdh_curve X25519MLKEM768:...`. Mesmo assim, uma conexão TLS real
falha com `SSL_CTX_set1_curves_list(...) failed ... group 'X25519MLKEM768'
cannot be set`, usando a *mesma* string que acabou de passar no teste.

**Causa:** o conjunto de providers do OpenSSL é inicializado uma única vez
por processo, na primeira vez que a lib é usada. O processo **master** do
Nginx faz isso no seu próprio boot — antes de o `oqsprovider` jamais ter
sido instalado/ativado. `systemctl reload nginx` (SIGHUP) só faz esse
master de longa duração subir **workers** novos; os workers nascem de um
`fork()` da memória do master e herdam o estado (obsoleto) do OpenSSL dele,
independente do que o `openssl.cnf` diga numa reativação posterior.
`nginx -t`, por ser um processo separado e recém-iniciado, relê o
`openssl.cnf` do zero e passa — testando um caminho de código diferente do
que o worker realmente usa.

**Correção (já aplicada):** o Estágio 8b usa `systemctl restart nginx` (não
`reload`) especificamente para essa reativação do provider — força um
master novo, que inicializa o OpenSSL já com o `oqsprovider` ativo. Veja
[security.md](security.md#pqc-troca-de-chaves-pós-quântica-híbrida) para o
resto do desenho do PQC.

Se você algum dia tocar em algo que muda quais *providers* do OpenSSL estão
ativos (não apenas a config do TLS em si), desconfie de `reload` — ele só é
seguro para mudanças que não dependem de reinicializar o estado global do
processo.

## Erros comuns no momento do apply

| Erro | Causa | Correção |
| --- | --- | --- |
| `googleapi: Error 403 ... requires a quota project` | As Application Default Credentials não têm quota project definido | `gcloud auth application-default set-quota-project <project-id>` |
| `googleapi: Error 403 ... Cloud Billing API has not been used` / `Cloud Resource Manager API has not been used` | `user_project_override = true` no provider significa que *toda* chamada de API agora precisa das APIs do próprio projeto do chamador habilitadas | `gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project=<project-id>` |
| `googleapi: Error 403 ... Compute Engine API has not been used` | `compute.googleapis.com` ainda não habilitada | `gcloud services enable compute.googleapis.com --project=<project-id>` |
| `Error creating Budget: ... Error 400` sem mais detalhes | `billing_alert_currency_code` não bate com a moeda real da conta de billing | `gcloud billing accounts describe <account-id>` para checar, depois defina a moeda correta em `infra/bootstrap/terraform.tfvars` |
| `Changing the machine_type, ... shielded_instance_config, ... network_interface ... on a started instance requires stopping it` | Uma mudança in-place precisa da instância parada primeiro | Já tratado — `allow_stopping_for_update = true` está definido na instância |
| SSH `Permission denied (publickey)` logo depois de o metadata mostrar a chave correta | O guest agent ainda não propagou a chave para a VM, ou sua chave privada local precisa de uma passphrase que seu shell não consegue fornecer | Espere ~30s e tente de novo, ou use `gcloud compute ssh ... --tunnel-through-iap` (usa a própria chave gerenciada, contorna uma chave local travada; necessário quando `operator_ssh_cidrs` foi restrito e seu IP ficou de fora) |
