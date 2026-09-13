# Segurança

Cada medida de hardening abaixo mapeia para um requisito da disciplina (veja
`prd.md`, Eixo 1) e para trechos específicos de código em `infra/`.

## Rede: menor privilégio por construção

`infra/network.tf` cria uma **VPC custom-mode dedicada**, nunca a rede
`default` do GCP. A `default` vem com regras permissivas `default-allow-*`
(SSH, tráfego interno, ICMP de qualquer lugar) que minariam o menor privilégio
mesmo depois de adicionar novas regras por cima delas — uma VPC custom **não
tem** regras de allow implícito, então `infra/firewall.tf` **é** toda a
superfície exposta, não "a superfície exposta mais o que a `default` já
abriu". Essa superfície são quatro regras: `allow-ssh` (`tcp:22` a partir de
`var.operator_ssh_cidrs`, que por padrão é `0.0.0.0/0` para a banca avaliadora
conseguir conectar; restrinja a CIDRs específicos para endurecer),
`allow-iap-ssh` (`tcp:22` a partir da faixa IAP `35.235.240.0/20`, sempre
presente — é assim que o deploy da CI sem chave e o `--tunnel-through-iap`
alcançam o sshd) e `allow-http` / `allow-https` (`tcp:80` / `tcp:443` de
qualquer lugar). A regra `allow-iap-ssh` é **aditiva**: ela não substitui o
`:22` público, apenas garante o caminho keyless da CI mesmo que
`operator_ssh_cidrs` seja restrito.

## SSH: `:22` público, somente por chave, protegido contra força bruta

- O `:22` fica **público e aberto para a banca avaliadora** por padrão
  (`operator_ssh_cidrs = ["0.0.0.0/0"]`): `ssh <user>@<ip>` conecta direto.
  Para endurecer, defina `operator_ssh_cidrs` em `terraform.tfvars` (por
  exemplo `["203.0.113.4/32"]`) e o Terraform restringe a regra `allow-ssh` a
  exatamente essas faixas. Independentemente disso, o deploy da CI e o
  operador podem alcançar a VM com `gcloud compute ssh <user>@app-vm
  --tunnel-through-iap` (o principal chamador precisa de
  `roles/iap.tunnelResourceAccessor`, ou Owner mais um self-grant).
- `infra/compute.tf` injeta a chave **pública** do operador via metadata da
  instância (`ssh-keys`) — a chave privada nunca toca o Terraform nem o
  repositório.
- A VM define `block-project-ssh-keys = "TRUE"`: chaves SSH em nível de
  projeto são ignoradas, e toda chave precisa estar no metadata da *instância*
  (a do operador via Terraform, ou a chave efêmera do deploy da CI).
- O script de inicialização (estágio 2) acrescenta `PasswordAuthentication
  no` ao `sshd_config` em todo boot, de forma idempotente.
- O Fail2ban (estágio 3) bane um IP por 24 horas depois de 4 tentativas de SSH
  falhas. Isso não é teórico — o primeiro deploy real teve uma tentativa
  genuína de força bruta banida poucas horas depois de entrar no ar.

## HTTPS: um certificado real da Let's Encrypt, sem domínio necessário

O programa de certificados de endereço IP da Let's Encrypt (disponível de
forma geral no início de 2026) emite certificados para um IP público puro —
sem registro DNS. Duas coisas sobre ele que não são óbvias só pela
documentação do Certbot, descobertas rodando isto contra uma VM ao vivo:

- **Os plugins Nginx/Apache do Certbot não suportam certificados de IP** —
  apenas `--standalone`, `--webroot` e `--manual` suportam. O script de
  inicialização usa `--webroot` e escreve seu próprio server block HTTPS na
  mão (estágio 7) em vez de deixar um plugin reescrevê-lo.
- **Certificados de IP exigem `--preferred-profile shortlived`**, o que
  significa um **tempo de vida de 6 dias**, não os 90 dias usuais. O timer de
  renovação do Certbot (checagens duas vezes por dia) é essencial aqui, não só
  um extra desejável — veja ele confirmado ativo em
  [operations.md](operations.md#verificações-de-saúde).

O HTTP sempre redireciona para HTTPS (estágio 7). Se a emissão do certificado
falhar (rate limit, problema de rede transitório), o script de inicialização
registra isso e deixa o Nginx servindo HTTP puro em vez de deixá-lo quebrado —
um site funcionando em HTTP é melhor que um script que desiste por completo.

## Shielded VM

`infra/compute.tf` habilita `enable_secure_boot`, `enable_vtpm` e
`enable_integrity_monitoring` — os três, sem custo extra, suportados pela
família de imagens `ubuntu-2404-lts` usada aqui.

## Nenhum secret no repositório

O `.gitignore` bloqueia `.env*`, arquivos de chave privada (`*.pem`,
`id_rsa*`, `id_ed25519*`), `*.tfstate`/`*.tfstate.backup`, `*.tfvars`,
`.terraform/`, `credentials*.json` e `backend.hcl`. Cada um tem um `.example`
versionado no lugar (`terraform.tfvars.example`, `infra/backend.hcl.example`),
de modo que o formato de cada valor obrigatório fica documentado sem expor um
real. Notavelmente:

- O **nome do bucket GCS** (`infra/backend.tf`) nunca é hardcoded — ele embute
  o project ID do GCP, que este repositório não publica. O Terraform o lê do
  `infra/backend.hcl` (no gitignore) via `-backend-config`.
- `ops/vm-start.sh` e `ops/vm-stop.sh` leem `project_id`/`region`/`zone` do
  `infra/terraform.tfvars` (no gitignore) pelo mesmo motivo.

## Escopo de menor privilégio do budget

O `google_billing_budget` de `infra/bootstrap/billing.tf` é filtrado só para
este projeto (`budget_filter.projects`), não para a conta de billing inteira —
veja [free-tier.md](free-tier.md) para o quadro completo de controle de custo.
