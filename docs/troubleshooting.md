# Troubleshooting

## Diagnóstico inicial

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

`Script "startup-script" failed with error: exit status N` no log serial
indica que `set -euo pipefail` encerrou o script no estágio imediatamente
anterior, e **nenhum estágio posterior executou** (sem Fail2ban, sem
certificado, sem PM2, dependendo de onde falhou).

## Falhas observadas apenas em deploy real

Nenhuma delas é detectável lendo o Terraform ou o shell; todas surgiram após
o boot da VM.

### 1. `systemctl reload sshd` falha no Ubuntu 24.04

**Sintoma:** o startup script encerra logo após o estágio 2 (hardening de
SSH); Fail2ban, Certbot e PM2 não executam; o HTTP serve a página padrão do
Nginx.

**Causa:** a unit systemd do SSH no Ubuntu 24.04 é `ssh.service`, não
`sshd.service`. `reload sshd` falha com `Unit sshd.service not found`, e sob
`set -e` isso encerra o script.

**Correção (aplicada):** `infra/scripts/startup.sh.tpl` usa `systemctl reload
ssh`.

### 2. O Nginx mantém um caminho de certificado obsoleto após troca de IP

**Sintoma:** o Certbot emite um certificado para o IP *atual*, mas o HTTPS
falha ou aponta para um certificado inexistente — `nginx -T` mostra
`ssl_certificate` em `/etc/letsencrypt/live/<old-ip>/`.

**Causa:** o server block HTTPS era escrito uma vez, com guard baseado apenas
na existência do arquivo. Boots posteriores (por exemplo, após um IP
diferente) pulavam a reescrita mesmo com um certificado novo emitido para o
novo IP.

**Correção (aplicada):** o guard também reescreve o arquivo quando o IP
embutido não coincide com o atual:

```bash
if [ "$CERT_OBTAINED" = true ] && { [ ! -f "$HTTPS_SITE" ] || ! grep -qF "/etc/letsencrypt/live/$PUBLIC_IP/" "$HTTPS_SITE"; }; then
```

Regra geral: um guard de "já configurado" deve comparar o *conteúdo* com o
estado atual, não apenas testar a presença do arquivo.

### 3. `reload` do Nginx não recarrega o provider `oqsprovider`

**Sintoma:** `oqsprovider.so` existe, `openssl.cnf` contém a ativação,
`openssl list -providers` mostra `oqsprovider` como `active` e `nginx -t`
valida `ssl_ecdh_curve X25519MLKEM768:...`. Ainda assim, uma conexão TLS real
falha com `SSL_CTX_set1_curves_list(...) failed ... group 'X25519MLKEM768'
cannot be set`, com a *mesma* string aprovada no teste.

**Causa:** o conjunto de providers do OpenSSL é inicializado uma única vez
por processo, no primeiro uso da lib. O processo **master** do Nginx faz isso
no próprio boot — antes de o `oqsprovider` ser instalado/ativado.
`systemctl reload nginx` (SIGHUP) apenas faz o master de longa duração criar
**workers** novos; os workers nascem de um `fork()` do master e herdam seu
estado OpenSSL (obsoleto), independentemente do `openssl.cnf`. `nginx -t`,
por ser um processo novo, relê o `openssl.cnf` e passa — testando um caminho
diferente do que o worker executa.

**Correção (aplicada):** o estágio 8b usa `systemctl restart nginx` (não
`reload`) para a ativação do provider, forçando um master novo que inicializa
o OpenSSL com o `oqsprovider` ativo. Veja
[security.md](security.md#pqc-troca-de-chaves-pós-quântica-híbrida) para o
restante do desenho do PQC.

Regra geral: qualquer mudança no conjunto de *providers* OpenSSL ativos (não
apenas na configuração TLS) exige `restart`; `reload` só é seguro para
mudanças que não dependem de reinicializar o estado global do processo.

### 4. `ecosystem.config.js` obsoleto após `terraform apply` + reboot

**Sintoma:** o primeiro deploy pela CI entra em crash loop com `ENOENT
/opt/app/package.json` e o Nginx responde 502.

**Causa:** o estágio 10 escrevia `/opt/app/ecosystem.config.js` atrás de um
guard `[ ! -f ]`. Uma VM provisionada com uma versão antiga do arquivo (que
executava `pm2 start npm -- start`) mantinha essa cópia através de todo
`terraform apply` + reboot posterior.

**Correção (aplicada):** o estágio 10 escreve o arquivo incondicionalmente em
todo boot; `deploy.yml` também o copia em todo deploy, e o restart do PM2 é
`pm2 delete` + `pm2 start` (não `pm2 reload`, que preserva os argumentos de
script/interpretador em cache de uma aplicação em execução).

### 5. Todo `POST /api/auth/*` responde 403 atrás do Nginx

**Sintoma:** formulários de login/cadastro falham com 403 em produção, mas
funcionam em `npm run dev`.

**Causa:** `proxy.ts` constrói a comparação de mesma origem do CSRF a partir
de `request.nextUrl`. Sem `X-Forwarded-Proto: https` do Nginx, o Next.js
assume `http://` e o header `Origin` (`https://`) do navegador não coincide.

**Correção (aplicada):** o vhost de reverse proxy (estágio 10) encaminha
`X-Forwarded-Proto`, `X-Forwarded-Host` e `X-Forwarded-For`; este último
também alimenta a resolução de IP do rate limiter. O guard do estágio 10
reescreve um vhost existente que não contenha `X-Forwarded-Proto`, então um
reboot atualiza VMs antigas.

## Erros comuns no apply

| Erro | Causa | Correção |
| --- | --- | --- |
| `googleapi: Error 403 ... requires a quota project` | As Application Default Credentials não têm quota project definido | `gcloud auth application-default set-quota-project <project-id>` |
| `googleapi: Error 403 ... Cloud Billing API has not been used` / `Cloud Resource Manager API has not been used` | `user_project_override = true` no provider exige que *toda* chamada de API tenha a API correspondente habilitada no projeto do chamador | `gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project=<project-id>` |
| `googleapi: Error 403 ... Compute Engine API has not been used` | `compute.googleapis.com` não habilitada | `gcloud services enable compute.googleapis.com --project=<project-id>` |
| `Error creating Budget: ... Error 400` sem detalhes | `billing_alert_currency_code` não coincide com a moeda da conta de billing | `gcloud billing accounts describe <account-id>` para verificar; defina a moeda correta em `infra/bootstrap/terraform.tfvars` |
| `Changing the machine_type, ... shielded_instance_config, ... network_interface ... on a started instance requires stopping it` | Mudança in-place exige a instância parada | Já tratado — `allow_stopping_for_update = true` na instância |
| SSH `Permission denied (publickey)` logo após o metadata mostrar a chave correta | O guest agent ainda não propagou a chave, ou a chave privada local exige passphrase que o shell não fornece | Aguarde ~30 s e tente novamente, ou use `gcloud compute ssh ... --tunnel-through-iap` (chave gerenciada pelo gcloud; necessário quando `operator_ssh_cidrs` foi restrito e o seu IP ficou de fora) |
