# Operação

## Iniciar e parar a VM

**Sempre use os scripts em `ops/` — nunca `gcloud compute instances
start/stop` diretamente.**

```bash
./ops/vm-start.sh   # reserves a static IP, attaches it, starts the instance
./ops/vm-stop.sh    # stops the instance, detaches and releases the static IP
```

Por que isso importa: `infra/compute.tf` deliberadamente deixa o IP externo da
instância **efêmero** no Terraform — um IP estático *reservado* é cobrado pelo
GCP sempre que não está anexado a uma instância **em execução**, o que entra
em conflito direto com parar a VM entre usos para economizar custo. O Terraform
não tem hook "ao iniciar/parar instância", então a sequência reservar →
anexar → iniciar (e o espelho: parar → desanexar → liberar) vive nesses dois
scripts, imperativamente, apenas pela janela em que a VM está de fato no ar.

Os dois scripts leem `project_id` / `region` / `zone` do
`infra/terraform.tfvars` (no gitignore) — o project ID do GCP nunca é
hardcoded em um arquivo versionado.

**Nota de drift:** enquanto a VM está rodando via `vm-start.sh`, seu
access-config aponta para uma reserva que o Terraform desconhece. Rodar
`terraform apply` em `infra/` com a VM no ar vai trocar de volta para efêmero
(inofensivo, mas o IP muda). Prefira parar a VM com `vm-stop.sh` antes de
rodar mudanças do Terraform contra `infra/`.

Por padrão, `operator_ssh_cidrs` é `["0.0.0.0/0"]`, então `terraform apply`
mantém a regra `allow-ssh` com o `:22` público aberto para a banca avaliadora
(somente por chave, com Fail2ban). Para endurecer, defina `operator_ssh_cidrs`
com o seu CIDR (por exemplo `["203.0.113.4/32"]`) antes do apply; a regra
continua existindo, apenas com a origem restrita. Independentemente da origem,
o deploy da CI sem chave alcança a VM pela regra aditiva `allow-iap-ssh` (faixa
IAP `35.235.240.0/20`), e o operador também pode usar `gcloud compute ssh
--tunnel-through-iap` (o principal chamador precisa de
`roles/iap.tunnelResourceAccessor`).

A VM também define `block-project-ssh-keys = "TRUE"`, então chaves SSH em
nível de projeto são ignoradas — toda chave precisa estar no metadata da
*instância* (a chave do operador que o Terraform injeta, ou a chave efêmera
que o `gcloud compute ssh` adiciona).

## Verificações de saúde

Entre por SSH. Com o padrão `operator_ssh_cidrs = ["0.0.0.0/0"]`, `ssh
<ssh_username>@<ip>` funciona direto (somente por chave). Se você restringiu
esse CIDR, use o túnel IAP — o principal chamador precisa de
`roles/iap.tunnelResourceAccessor` (Owner também serve, com um self-grant):

```bash
gcloud compute ssh <ssh_username>@app-vm --zone=<zone> --project=<project_id> --tunnel-through-iap
```

Então, na VM:

```bash
sudo systemctl is-active nginx fail2ban        # both should print "active"
sudo fail2ban-client status sshd               # shows ban count, currently-banned IPs
pm2 list                                       # PM2's process table (empty until an app is deployed)
sudo certbot certificates                      # current cert, expiry date
systemctl list-timers | grep certbot           # confirms the renewal timer is scheduled
sudo nginx -T | grep -E 'listen|proxy_pass|ssl_certificate'
openssl list -providers                        # "oqsprovider" deve aparecer como "active"
```

Para testar a renovação sem esperar ela disparar de fato:

```bash
sudo certbot renew --dry-run
```

Para confirmar o suporte a PQC de fora (sem precisar de SSH) — veja
[security.md](security.md#pqc-troca-de-chaves-pós-quântica-híbrida) para o
que esse grupo significa:

```bash
openssl s_client -connect <ip>:443 -groups X25519MLKEM768:X25519 -tls1_3 </dev/null 2>&1 \
  | grep -i "negotiated tls1.3 group"
```

## Lendo o log de boot

Se algo parecer errado logo depois de um boot (HTTP não responde, HTTPS
ausente), a própria saída do script de inicialização está na serial console —
útil porque não exige que o SSH já esteja funcionando:

```bash
gcloud compute instances get-serial-port-output app-vm --zone=<zone> --project=<project_id> \
  | grep -iE "startup-script|fail2ban|certbot|error|failed"
```

Procure por `Script "startup-script" failed with error` — isso significa que o
`set -e` matou o script no meio, e tudo depois do estágio que falhou nunca
rodou. Veja [troubleshooting.md](troubleshooting.md) para os dois casos reais
disso encontrados até agora.

## Cortar uma release (tag + GitHub Release)

Versionamento é semver automático via `release-please`
(`.github/workflows/release.yml`) — **nunca edite `web/package.json` `version`
na mão**. O fluxo:

1. Commits normais em `main` seguindo Conventional Commits (`feat:` sobe minor,
   `fix:` sobe patch, `feat!:` ou rodapé `BREAKING CHANGE:` sobe major). Os
   tipos `docs`/`test`/`chore`/`style` não sobem versão.
2. A cada push em `main`, o workflow abre (ou atualiza) um PR
   `chore(main): release X.Y.Z` que sobe `web/package.json` e
   `web/CHANGELOG.md`.
3. Fazer merge desse PR cria a tag anotada `vX.Y.Z` e o GitHub Release com as
   notas do changelog — e **só esse merge** dispara o deploy na VM
   (`release.yml` chama `deploy.yml`, gated em `releases_created`). Um push
   comum em `main` não faz deploy; `workflow_dispatch` no workflow `Deploy`
   força um redeploy manual do `main` atual.

`bootstrap-sha` em `release-please-config.json` fixa `3cbc1e3` como ponto de
partida — a primeira release só conta commits depois do trabalho de CI/CD.

## Teardown

Remova todo recurso cobrável com um único comando no root principal:

```bash
cd infra
terraform destroy
```

Isto remove a instância de compute, seu boot disk, as quatro regras de
firewall e a VPC/subnet custom — tudo que está declarado no state de `infra/`.
Nenhum recurso ali define `lifecycle { prevent_destroy = true }`, então isto
sempre completa por inteiro; nada consegue abortar o plano no meio.

**O state bucket e o billing budget nunca são tocados.** Eles vivem
exclusivamente em `infra/bootstrap/`, um root separado fora do state de
`infra/` — não meramente protegidos, mas estruturalmente inalcançáveis por
esse comando. O billing budget é gratuito, então foi projetado para continuar
alertando nos mesmos limiares mesmo com zero recursos cobráveis restantes no
projeto, pegando qualquer coisa criada depois manualmente ou por um
`terraform apply` futuro.

Para também remover o bucket e/ou o budget, isso é um segundo comando,
deliberado e separado:

```bash
cd infra/bootstrap
terraform destroy
```

Isto não apaga o projeto GCP em si — apenas esses dois recursos.
