# Documentação

Documentação de referência para a infraestrutura GCP do projeto (Terraform).
Comece pelo [`README.md`](../README.md) da raiz para um quickstart — esta
pasta aprofunda cada tópico.

| Doc | Cobre |
| --- | --- |
| [application.md](application.md) | A aplicação Next.js em `web/`: como roda, CI/CD, mitigações do OWASP Top 10 |
| [architecture.md](architecture.md) | O design com dois roots Terraform, a lista de componentes, o fluxo de requisição |
| [deployment.md](deployment.md) | Passo a passo do bootstrap → deploy, referência de variáveis |
| [operations.md](operations.md) | Dia a dia: iniciar/parar a VM, checar a saúde dos serviços, teardown |
| [security.md](security.md) | Medidas de hardening e o raciocínio por trás de cada uma |
| [free-tier.md](free-tier.md) | Toda configuração que mantém o projeto dentro do Always Free tier do GCP, e por quê |
| [troubleshooting.md](troubleshooting.md) | Bugs reais encontrados ao fazer o deploy de verdade, e como diagnosticar casos parecidos |

Os artefatos de planejamento (requisitos, decisões de design, quebra de
tarefas, o relatório do Verifier independente) ficam em
[`.specs/features/gcp-infra-terraform/`](../.specs/features/gcp-infra-terraform/)
— esse é o registro histórico do *porquê* das coisas terem sido construídas
assim; a documentação aqui é a referência do estado atual sobre *como usar* o
que foi construído. Notas de operação específicas para agentes (por exemplo,
"sempre use `ops/vm-start.sh`, nunca chame `gcloud compute instances start`
diretamente") estão em [`CLAUDE.md`](../CLAUDE.md).
