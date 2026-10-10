# Spec-driven execution — SDR5E efetivo

Esta pasta organiza a execução verificável do plano aprovado. A especificação de origem permanece em [`.dev/PLANO-SDR5E-EFETIVO.md`](../.dev/PLANO-SDR5E-EFETIVO.md); este diretório não cria escopo novo nem substitui aquele documento.

## Artefatos

- [`SPEC-SDR5E-EFETIVO.md`](SPEC-SDR5E-EFETIVO.md): objetivo, limites e critérios derivados do plano original.
- [`PLAN-SDR5E-EFETIVO.md`](PLAN-SDR5E-EFETIVO.md): sequência das nove etapas originais e dependências.
- [`CHECKLIST-SDR5E-EFETIVO.md`](CHECKLIST-SDR5E-EFETIVO.md): 49 critérios rastreáveis com estados revalidados e lacunas abertas por evidência.

## Regra de execução

Trabalhar por critério, na ordem das etapas do plano. Antes de editar, confirmar requisito, contrato Loom e decisão Jev já registrada quando aplicável. Depois, executar a verificação correspondente e anotar caminho/linha, comando ou cenário, resultado e lacuna restante no checklist. Teste unitário não substitui aceite Loom, e falha de acesso do browser desta sessão não prova indisponibilidade no computador do usuário.

Status permitidos: `A validar`, `Parcial`, `Concluído estático` e `Aceito em runtime`. Critérios compostos só recebem o estado mais alto depois de cada parte ser demonstrada. Não inferir conclusão por contagem de código, teste de componente, intenção ou ausência de erro.

Decisões de regras permanecem determinísticas no código. Jev serve como revisão de escolhas ambíguas e não como fonte de regras, aprovação, teste ou evidência. Não enviar novas consultas externas usando tentativas alternativas após uma recusa automática. Não publicar, fazer release, alterar o core Loom ou modificar campanhas sem autorização específica.
