# Operação

## Iniciar e parar a VM

**Sempre use os scripts em `ops/` — nunca `gcloud compute instances
start/stop` diretamente.**

```bash
./ops/vm-start.sh   # reserves a static IP, attaches it, starts the instance
./ops/vm-stop.sh    # stops the instance, detaches and releases the static IP
```

Motivo: `infra/compute.tf` declara o IP externo da instância como
**efêmero**. Um IP estático *reservado* é cobrado pelo GCP sempre que não
está anexado a uma instância **em execução**, o que conflita com parar a VM
entre usos. O Terraform não possui hook de start/stop de instância, então a
sequência reservar → anexar → iniciar (e a inversa: parar → desanexar →
liberar) é executada imperativamente por esses scripts, apenas na janela em
que a VM está ativa.

Ambos leem `project_id` / `region` / `zone` de `infra/terraform.tfvars`
(gitignored) — o project ID nunca é hardcoded em arquivo versionado.

**Drift:** enquanto a VM está ativa via `vm-start.sh`, o access-config aponta
para uma reserva desconhecida pelo Terraform. Um `terraform apply` em
`infra/` com a VM ativa restaura o IP efêmero (inofensivo, mas o IP muda).
Prefira `vm-stop.sh` antes de aplicar mudanças em `infra/`.

### Acesso SSH

Por padrão `operator_ssh_cidrs = ["0.0.0.0/0"]`, e a regra `allow-ssh` mantém
o `:22` público (somente chave, com Fail2ban). Para restringir, defina
`operator_ssh_cidrs` com o seu CIDR (por exemplo `["203.0.113.4/32"]`) antes
do apply; a regra continua existindo, apenas com a origem limitada.
Independentemente da origem, o deploy da CI alcança a VM pela regra aditiva
`allow-iap-ssh` (faixa IAP `35.235.240.0/20`), e o operador pode usar
`gcloud compute ssh --tunnel-through-iap` (o principal chamador precisa de
`roles/iap.tunnelResourceAccessor`).

A VM define `block-project-ssh-keys = "TRUE"`: chaves SSH de nível de projeto
são ignoradas, e toda chave precisa estar no metadata da *instância* (a chave
do operador injetada pelo Terraform, ou a chave efêmera adicionada por
`gcloud compute ssh`).

## Verificações de saúde

Conecte via SSH. Com o padrão `operator_ssh_cidrs = ["0.0.0.0/0"]`,
`ssh <ssh_username>@<ip>` funciona diretamente. Com o CIDR restrito, use o
túnel IAP (o principal chamador precisa de `roles/iap.tunnelResourceAccessor`;
Owner também serve, com um self-grant):

```bash
gcloud compute ssh <ssh_username>@app-vm --zone=<zone> --project=<project_id> --tunnel-through-iap
```

Na VM:

```bash
sudo systemctl is-active nginx fail2ban        # both should print "active"
sudo fail2ban-client status sshd               # shows ban count, currently-banned IPs
sudo -u appsvc bash -lc 'pm2 list'             # PM2's process table as the app user (empty until a release is deployed)
sudo certbot certificates                      # current cert, expiry date
systemctl list-timers | grep certbot           # confirms the renewal timer is scheduled
sudo nginx -T | grep -E 'listen|proxy_pass|ssl_certificate|ssl_ecdh_curve'
openssl list -providers                        # "oqsprovider" must appear as "active"
```

Teste de renovação sem aguardar o timer:

```bash
sudo certbot renew --dry-run
```

Confirmação externa do suporte a PQC (sem SSH) — veja
[security.md](security.md#pqc-troca-de-chaves-pós-quântica-híbrida):

```bash
openssl s_client -connect <ip>:443 -groups X25519MLKEM768:X25519 -tls1_3 </dev/null 2>&1 \
  | grep -i "negotiated tls1.3 group"
```

## Log de boot

Se algo falhar logo após um boot (HTTP não responde, HTTPS ausente), a saída
do startup script está na serial console — acessível mesmo sem SSH
funcional:

```bash
gcloud compute instances get-serial-port-output app-vm --zone=<zone> --project=<project_id> \
  | grep -iE "startup-script|fail2ban|certbot|error|failed"
```

`Script "startup-script" failed with error` indica que `set -euo pipefail`
encerrou o script no estágio anterior, e nenhum estágio posterior executou.
Veja [troubleshooting.md](troubleshooting.md) para os casos documentados.

## Cortar uma release (tag + GitHub Release)

Versionamento semver automático via `release-please`
(`.github/workflows/release.yml`) — **nunca edite `version` em
`web/package.json` manualmente**. Fluxo:

1. Commits em `main` seguem Conventional Commits (`feat:` incrementa minor,
   `fix:` incrementa patch, `feat!:` ou rodapé `BREAKING CHANGE:` incrementa
   major). `docs`/`test`/`chore`/`style` não incrementam versão.
2. A cada push em `main`, o workflow abre ou atualiza um PR
   `chore(main): release X.Y.Z` que atualiza `web/package.json` e
   `web/CHANGELOG.md`.
3. O merge desse PR cria a tag anotada `vX.Y.Z` e o GitHub Release com as
   notas do changelog — e **somente esse merge** dispara o deploy na VM
   (`release.yml` chama `deploy.yml`, condicionado a `releases_created`). Um
   push comum em `main` dispara o pipeline mas não altera a produção;
   `workflow_dispatch` no workflow `Deploy` força um redeploy manual do
   `main` atual. A justificativa do gate está no
   [`README.md`](../README.md#pipeline-de-cicd).

`bootstrap-sha` em `release-please-config.json` fixa `3cbc1e3` como ponto de
partida: a primeira release considera apenas commits posteriores ao trabalho
de CI/CD.

## Teardown

Remove todo recurso cobrável com um único comando no root principal:

```bash
cd infra
terraform destroy
```

Remove a instância de compute e seu boot disk, as quatro regras de firewall,
a VPC/subnet custom e os demais recursos declarados no state de `infra/`
(Identity Platform, WIF, Secret Manager, bucket `vm-assets`). Nenhum recurso
define `lifecycle { prevent_destroy = true }`, então o destroy sempre completa
por inteiro.

**O state bucket e o billing budget não são afetados.** Eles vivem
exclusivamente em `infra/bootstrap/`, um root separado fora do state de
`infra/` — estruturalmente inalcançáveis por esse comando. O billing budget é
gratuito e continua alertando nos mesmos limiares mesmo com zero recursos
cobráveis no projeto, cobrindo qualquer coisa criada depois manualmente ou
por um `terraform apply` futuro.

Para remover também o bucket e o budget, execute um segundo comando,
deliberado e separado:

```bash
cd infra/bootstrap
terraform destroy
```

Isso não apaga o projeto GCP — apenas esses dois recursos.
