# Segurança

Cada controle abaixo mapeia para um requisito da disciplina (`prd.md`, Eixo 1)
e para código específico em `infra/`. Os controles da camada de aplicação
(OWASP Top 10) estão no
[`README.md`](../README.md#segurança-da-aplicação-owasp-top-102025).

## Rede: menor privilégio por construção

`infra/network.tf` cria uma **VPC custom-mode dedicada**, nunca a rede
`default` do GCP. A `default` inclui regras permissivas `default-allow-*`
(SSH, tráfego interno, ICMP de qualquer origem) que comprometeriam o menor
privilégio mesmo com novas regras por cima. Uma VPC custom não tem allow
implícito, então `infra/firewall.tf` **é** toda a superfície exposta. São
quatro regras:

- `allow-ssh` — `tcp:22` a partir de `var.operator_ssh_cidrs` (padrão
  `0.0.0.0/0`, para a banca avaliadora; restrinja a CIDRs específicos para
  endurecer).
- `allow-iap-ssh` — `tcp:22` a partir da faixa IAP `35.235.240.0/20`, sempre
  presente: é o caminho do deploy keyless da CI e de
  `--tunnel-through-iap`. Regra **aditiva**: não substitui o `:22` público,
  apenas garante o caminho da CI mesmo com `operator_ssh_cidrs` restrito.
- `allow-http` / `allow-https` — `tcp:80` / `tcp:443` de qualquer origem.

## SSH: `:22` público, somente chave, protegido contra força bruta

- O `:22` é público por padrão (`operator_ssh_cidrs = ["0.0.0.0/0"]`).
  Para restringir, defina `operator_ssh_cidrs` em `terraform.tfvars` (por
  exemplo `["203.0.113.4/32"]`); o Terraform limita `allow-ssh` a essas
  faixas. O deploy da CI e o operador continuam alcançando a VM com
  `gcloud compute ssh <user>@app-vm --tunnel-through-iap` (requer
  `roles/iap.tunnelResourceAccessor`, ou Owner com self-grant).
- `infra/compute.tf` injeta a chave **pública** do operador via metadata da
  instância (`ssh-keys`); a chave privada não passa pelo Terraform nem pelo
  repositório.
- `block-project-ssh-keys = "TRUE"`: chaves SSH de nível de projeto são
  ignoradas; toda chave precisa estar no metadata da *instância* (a do
  operador via Terraform, ou a efêmera do deploy da CI).
- O startup script (estágio 2) aplica `PasswordAuthentication no` ao
  `sshd_config` em todo boot, de forma idempotente.
- O Fail2ban (estágio 3) bane um IP por 24 h após 4 tentativas de SSH
  falhas. O primeiro deploy real registrou um banimento por força bruta
  poucas horas após entrar no ar.

## HTTPS: certificado Let's Encrypt sem domínio

O programa de certificados de endereço IP da Let's Encrypt (disponibilidade
geral no início de 2026) emite certificados para um IP público sem registro
DNS. Duas restrições não evidentes na documentação do Certbot, observadas em
VM real:

- **Os plugins Nginx/Apache do Certbot não suportam certificados de IP** —
  apenas `--standalone`, `--webroot` e `--manual`. O startup script usa
  `--webroot` e escreve o server block HTTPS diretamente (estágio 7), sem
  plugin reescrevendo a configuração.
- **Certificados de IP exigem `--preferred-profile shortlived`**, com
  validade de **6 dias**, não os 90 usuais. O timer de renovação do Certbot
  (duas verificações por dia) é requisito operacional, confirmado em
  [operations.md](operations.md#verificações-de-saúde).

HTTP sempre redireciona para HTTPS (estágio 7). Se a emissão falhar (rate
limit, falha de rede transitória), o startup script registra o erro e mantém
o Nginx servindo HTTP em vez de abortar.

## PQC: troca de chaves pós-quântica híbrida

O Nginx oferece o grupo híbrido **`X25519MLKEM768`** (ML-KEM-768, FIPS 203,
combinado com X25519 clássico) no handshake TLS 1.3 — o que verificadores como
o DigiCert TLS quantum readiness check e o Qualys SSL Labs reportam como
"supports PQC key exchange". Verificação:

```bash
openssl s_client -connect <ip>:443 -groups X25519MLKEM768:X25519 -tls1_3 </dev/null 2>&1 \
  | grep -i "negotiated tls1.3 group"
```

O Ubuntu 24.04 fornece OpenSSL 3.0.13, que **não implementa grupos
ML-KEM/Kyber nativamente**. O suporte vem do
[oqs-provider](https://github.com/open-quantum-safe/oqs-provider) (Open
Quantum Safe), um provider OpenSSL 3 carregado dinamicamente que registra o
grupo sem recompilar o Nginx nem o OpenSSL do sistema.

- **Compilar na VM foi tentado e abandonado.** O `liboqs` tem ~2700 unidades
  de compilação; o vCPU compartilhado da `e2-micro` não conclui isso em tempo
  de boot aceitável (observado: menos de 2 % após vários minutos).
  `.github/workflows/build-oqsprovider.yml` compila `liboqs` + `oqs-provider`
  num runner `ubuntu-24.04` do GitHub Actions (mesma glibc da VM); o binário
  é enviado manualmente (`gcloud storage cp`) ao bucket privado
  `google_storage_bucket.vm_assets` (`infra/artifacts.tf`).
- **O bucket é privado**, com `roles/storage.objectViewer` apenas para a
  service account da VM (`infra/artifacts.tf`). O download no boot (estágio
  8b) autentica com um token OAuth obtido do metadata server da instância —
  nenhuma credencial adicional.
- **As versões de `liboqs` e `oqs-provider` são acopladas.** Cada release do
  `oqs-provider` documenta em `RELEASE.md` a tag exata de `liboqs` com a qual
  foi testado (por exemplo 0.11.0 ↔ 0.15.0). Um par incompatível falha na
  compilação com símbolos indefinidos (`OQS_SIG_alg_sphincs_*`), não com um
  erro explícito de versão.
- **A ativação em `openssl.cnf` é autocontida.** Anexar apenas
  `oqsprovider = oqsprovider_sect` a um `[provider_sect]` supostamente
  existente é frágil: se o scaffolding não existir, o append vira a *única*
  definição de `[provider_sect]` e desativa o provider `default` (`library
  has no ciphers`; TLS quebra para todo o sistema). O estágio 8b declara
  `openssl_conf`/`[openssl_init]`/`[provider_sect]` do zero, listando
  `default` e `oqsprovider` explicitamente.
- `systemctl reload nginx` não ativa um provider OpenSSL novo; é necessário
  `restart` — veja
  [troubleshooting.md](troubleshooting.md#3-reload-do-nginx-não-recarrega-o-provider-oqsprovider).

## Shielded VM

`infra/compute.tf` habilita `enable_secure_boot`, `enable_vtpm` e
`enable_integrity_monitoring` — sem custo adicional, suportados pela família
de imagens `ubuntu-2404-lts`.

## Identidade e segredos

- **Deploy keyless.** O GitHub Actions autentica via Workload Identity
  Federation (`infra/wif.tf`): a deploy SA não possui role predefinida de
  projeto (nunca `roles/owner`/`roles/editor`), apenas
  `roles/compute.instanceAdmin.v1` e `roles/iap.tunnelResourceAccessor` na
  instância, `roles/iam.serviceAccountUser` na service account da VM e uma
  custom role somente leitura (`deployVmOperator`). `ci.yml` valida
  estaticamente essas restrições em cada PR.
- **API key da aplicação no Secret Manager.** `infra/secrets.tf` espelha a
  `google_apikeys_key` do Identity Platform num secret; a service account da
  VM recebe `roles/secretmanager.secretAccessor` apenas nesse secret. A
  aplicação lê `versions/latest` em runtime (`web/lib/gcp/secret.ts`). O
  `.env.production` na VM contém apenas `NODE_ENV`, `PORT` e
  `GOOGLE_CLOUD_PROJECT`; nenhum secret de autenticação existe no GitHub.
- **Usuário de serviço dedicado.** A aplicação executa como `appsvc` (sem
  shell de login, sem sudo), gerenciada por PM2 registrado no systemd
  (`pm2-appsvc`).

## Nenhum secret no repositório

O `.gitignore` bloqueia `.env*`, arquivos de chave privada (`*.pem`,
`id_rsa*`, `id_ed25519*`), `*.tfstate`/`*.tfstate.backup`, `*.tfvars`,
`.terraform/`, `credentials*.json` e `backend.hcl`. Cada um tem um `.example`
versionado (`terraform.tfvars.example`, `infra/backend.hcl.example`,
`web/.env.local.example`) que documenta o formato sem expor valores. Em
particular:

- O **nome do bucket GCS** (`infra/backend.tf`) nunca é hardcoded — ele embute
  o project ID, que este repositório público não expõe. O Terraform o lê de
  `infra/backend.hcl` (gitignored) via `-backend-config`.
- `ops/vm-start.sh` e `ops/vm-stop.sh` leem `project_id`/`region`/`zone` de
  `infra/terraform.tfvars` (gitignored) pelo mesmo motivo.

## Escopo de menor privilégio do budget

O `google_billing_budget` de `infra/bootstrap/billing.tf` é filtrado para
este projeto (`budget_filter.projects`), não para a conta de billing inteira
— veja [free-tier.md](free-tier.md) para o controle de custo completo.
