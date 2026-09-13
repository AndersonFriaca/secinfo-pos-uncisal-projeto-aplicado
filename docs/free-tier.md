# Always Free tier do GCP

Cada configuração abaixo é fixada explicitamente no código — nunca deixada
no padrão do provedor — porque o padrão é onde uma cobrança silenciosa entra.
Os valores foram verificados contra a documentação do Always Free do Google.

| Configuração | Valor | Justificativa |
| --- | --- | --- |
| Instância de compute | `e2-micro` em `us-east1-b` | O Always Free cobre exatamente 1 e2-micro não preemptível por mês, apenas em `us-west1` / `us-central1` / `us-east1` |
| Boot disk | `pd-standard`, 30 GB | O Always Free cobre 30 GB-mês de disco persistente standard; SSD ou tamanho maior geram cobrança |
| Network tier | `STANDARD` (não o padrão `PREMIUM`) | O Standard Tier tem franquia própria de 200 GB/mês/região de egress gratuito (desde out/2023) — maior que o 1 GB/mês do Always Free no Premium |
| IP externo | **Efêmero**, não reservado | Um IP estático reservado é cobrado sempre que não está anexado a uma instância *em execução* — veja abaixo |
| Ops Agent | Não instalado | A ingestão de Cloud Monitoring/Logging não faz parte do Always Free; cobrada por GB/métrica |
| Snapshots de disco | Nenhum | Armazenamento de snapshot é cobrado por GB, independentemente da franquia do boot disk |
| Shielded VM | Habilitada | Recurso de segurança sem custo |
| State bucket | `us-east1`, single-region | O Always Free cobre 5 GB-mês de armazenamento regional apenas em `us-west1` / `us-central1` / `us-east1`; a multi-region `US` não se qualifica |
| Bucket `vm-assets` | `us-east1`, single-region | Mesma franquia; contém apenas `oqsprovider.so` (poucos MB) |
| Secret Manager | 1 secret, 1 versão ativa | O free tier cobre 6 versões ativas e 10.000 operações de acesso por mês; a aplicação cacheia a key após a primeira leitura |
| Billing budget | Sem custo | A Cloud Billing Budget API não é cobrada; veja abaixo |

## O IP estático

Um IP reservado (`google_compute_address`) foi a primeira abordagem, para que
a VM mantivesse o mesmo endereço entre reinícios. Foi revertido quando o
operador passou a **parar a VM entre usos**: o GCP só isenta um IP estático
de cobrança enquanto anexado a uma instância **em execução** — uma reserva
associada a uma VM *parada* começa a acumular cobrança, anulando a economia
de parar a VM.

A solução foi mover o ciclo reservar/liberar para fora do Terraform (que não
possui hook de start/stop) para `ops/vm-start.sh` / `ops/vm-stop.sh` — veja
[operations.md](operations.md#iniciar-e-parar-a-vm). O `network_interface` da
instância em `infra/compute.tf` permanece efêmero; os scripts sobrepõem uma
reserva temporária apenas enquanto a VM está ativa.

## Orçamento de billing

`infra/bootstrap/billing.tf` cria um `google_billing_budget` restrito a este
projeto, com quatro limiares de alerta (50 % / 90 % / 100 % / 150 %) — padrão
adaptado de [eatonc/actual-gcp](https://github.com/eatonc/actual-gcp),
repositório de referência Terraform voltado ao free tier do GCP.

**Detecção, não prevenção.** O `google_billing_budget` envia e-mail aos
administradores da conta de billing em cada limiar; não bloqueia a criação de
recursos nem limita o gasto. É a rede de segurança para o que as
configurações acima deixarem passar, não um substituto para elas.

Os padrões das variáveis (`billing_alert_currency_code = "USD"`,
`billing_alert_amount = "5"`) assumem conta de billing em USD. **O
`currency_code` precisa coincidir com a moeda da conta** — verifique com
`gcloud billing accounts describe <account-id>`. Divergência produz erro
`400` no apply. Sobrescreva as duas variáveis em
`infra/bootstrap/terraform.tfvars` (gitignored) se a conta usar outra moeda;
nada muda no código versionado.
