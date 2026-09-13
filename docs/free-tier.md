# Permanecendo no Always Free tier do GCP

Toda configuração abaixo é fixada explicitamente no código — nunca deixada a
cargo de um padrão do provedor — porque um padrão é exatamente onde uma
cobrança silenciosa se infiltra. Verificado contra a própria documentação do
Always Free do Google, não presumido.

| Configuração | Valor | Por que importa |
| --- | --- | --- |
| Instância de compute | `e2-micro` em `us-east1-b` | O Always Free cobre exatamente 1 e2-micro não-preemptível por mês, apenas em `us-west1` / `us-central1` / `us-east1` |
| Boot disk | `pd-standard`, 30 GB | O Always Free cobre 30 GB-mês de disco persistente standard; SSD ou um tamanho maior geram cobrança |
| Network tier | `STANDARD` (não o padrão `PREMIUM` do provedor) | O Standard Tier carrega sua própria franquia separada de 200 GB/mês/região de egress gratuito (desde out/2023) — maior que a clássica linha de 1 GB/mês do Always Free no Premium |
| IP externo | **Efêmero**, não reservado | Um IP estático reservado gera cobrança sempre que não está anexado a uma instância *em execução* — veja abaixo |
| Ops Agent | Não instalado | A ingestão do agente de Cloud Monitoring/Logging não faz parte do Always Free e é cobrada por GB/métrica |
| Snapshots de disco | Nenhum configurado | O armazenamento de snapshot é cobrado por GB independentemente da franquia gratuita do boot disk |
| Shielded VM | Habilitada | Recurso de segurança gratuito — não é linha de custo de nenhuma forma |
| State bucket | `us-east1`, single-region | O Always Free cobre 5 GB-mês de armazenamento regional apenas em `us-west1` / `us-central1` / `us-east1`; a multi-region `"US"` não se qualifica |
| Billing budget | Grátis para rodar | A Cloud Billing Budget API não custa nada; veja abaixo |

## A lição do IP estático (descoberta prestando atenção de verdade)

Um IP reservado (`google_compute_address`) foi tentado primeiro, para que a VM
mantivesse o mesmo endereço entre reinícios. Foi revertido quando o operador
passou a rotineiramente **parar a VM para economizar custo**: o GCP só isenta
um IP estático de cobrança enquanto ele está anexado a uma instância **em
execução** — uma reserva deixada em uma VM *parada* não está "em uso" e começa
a acumular cobranças. Isso derrota diretamente o propósito de parar a VM.

A correção não foi desistir de um IP estável, mas mover o ciclo de
reserva/liberação para fora do Terraform (que não tem hook "ao
iniciar/parar") para `ops/vm-start.sh` / `ops/vm-stop.sh` — veja
[operations.md](operations.md#iniciar-e-parar-a-vm). O próprio
`network_interface` da instância em `infra/compute.tf` permanece efêmero; os
scripts colocam uma reserva temporária por cima apenas enquanto a VM está de
fato no ar.

## Orçamento de billing

`infra/bootstrap/billing.tf` cria um `google_billing_budget` limitado a este
projeto apenas, com quatro limiares de alerta escalonados (50% / 90% / 100% /
150%) — o padrão vem diretamente de
[eatonc/actual-gcp](https://github.com/eatonc/actual-gcp), um repositório de
referência Terraform feito especificamente para permanecer dentro do free tier
do GCP.

**Isto é detecção, não prevenção.** O `google_billing_budget` envia e-mail aos
administradores da conta de billing em cada limiar; ele não interrompe a
criação de recursos nem limita o gasto por conta própria. É a rede de
segurança que pega o que as configurações acima deixarem passar — não um
substituto para elas.

Os padrões das variáveis (`billing_alert_currency_code = "USD"`,
`billing_alert_amount = "5"`) assumem uma conta de billing em USD. **O
`currency_code` precisa bater exatamente com a moeda da sua própria conta de
billing** — verifique com `gcloud billing accounts describe <account-id>`. Uma
divergência falha com erro `400` no momento do apply. Sobrescreva as duas
variáveis no seu próprio `infra/bootstrap/terraform.tfvars` (no gitignore) se
a sua conta usa outra moeda; não há nada a mudar no código versionado.
