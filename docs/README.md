# Documentação

Referência técnica da infraestrutura GCP (Terraform), da aplicação Next.js e
do pipeline de CI/CD. O [`README.md`](../README.md) da raiz contém o
quickstart e o mapeamento OWASP Top 10; esta pasta detalha cada tópico.

| Doc | Cobre |
| --- | --- |
| [visao-geral.md](visao-geral.md) | Resumo de uma página: fluxo de requisição, eixos do PRD, pipeline, OWASP, estágios do boot (também em [PDF](visao-geral.pdf)) |
| [application.md](application.md) | A aplicação Next.js em `web/`: telas, tratamento de erros, runtime na VM, CI/CD |
| [architecture.md](architecture.md) | Os dois roots Terraform, inventário de componentes, fluxo de requisição, estágios do startup script |
| [deployment.md](deployment.md) | Bootstrap, backend remoto, apply, verificação, secrets do GitHub Actions |
| [operations.md](operations.md) | Start/stop da VM, verificações de saúde, log de boot, releases, teardown |
| [security.md](security.md) | Controles de hardening e a justificativa de cada um |
| [free-tier.md](free-tier.md) | Cada configuração que mantém o projeto no Always Free tier do GCP |
| [troubleshooting.md](troubleshooting.md) | Falhas observadas em deploy real e erros comuns no apply |

Regras operacionais para agentes de IA (por exemplo, "sempre use
`ops/vm-start.sh`, nunca `gcloud compute instances start` diretamente") estão
em [`CLAUDE.md`](../CLAUDE.md).
