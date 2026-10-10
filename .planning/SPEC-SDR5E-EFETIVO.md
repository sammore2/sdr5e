# Especificação — SDR5E efetivo

## Fonte de autoridade

O escopo é exatamente o de [`.dev/PLANO-SDR5E-EFETIVO.md`](../.dev/PLANO-SDR5E-EFETIVO.md), especialmente suas nove etapas, entregas e aceitações. Os IDs `0.1`–`8.6` em [`CHECKLIST-SDR5E-EFETIVO.md`](CHECKLIST-SDR5E-EFETIVO.md) são rótulos de rastreabilidade para essas aceitações; não introduzem requisitos adicionais nem determinam prioridade diferente da ordem expressa no plano.

Se o checklist, um relatório antigo ou uma nota cronológica divergir do plano e do estado atual do código, registrar a divergência e verificar os dois antes de atualizar o status. Anotações históricas não são evidência do estado atual.

## Objetivo

Entregar um ruleset SDR5E utilizável, fiel à edição adotada no projeto, no qual criação e evolução produzem personagens válidos; regras, recursos, magias, combate, NPCs, equipamentos e efeitos têm comportamento automático, assistido ou manual declarado; textos, permissões e interface são adequados; e instalação, migração e jogo representativo passam pelos critérios do plano.

## Restrições e decisões fixas

- Gameplay determinístico; Jev revisa escolhas ambíguas, mas não executa regras.
- Não alterar o núcleo Loom: contratos inexistentes ficam documentados como dependência, sem simular atomicidade/idempotência que a API não oferece.
- Não declarar mecânica automática apenas porque existe texto em pack ou item.
- Preservar dados legados ambíguos; migrações precisam ser versionadas, repetíveis e verificadas em cópia.
- Distinguir evidência estática, teste unitário, teste de integração e aceite em runtime.
- Publicação, deploy e release ficam fora desta execução, conforme a restrição explícita no plano.

## Critério de conclusão

Todos os critérios aplicáveis das Etapas 0–8 precisam ter evidência adequada ao seu escopo. Testes e verificadores devem ser executados depois da última alteração. Requisitos de renderização, persistência, permissões, instalação limpa, migração e jogo representativo exigem observação no Loom; testes de código não os substituem.

## Incertezas que não podem virar suposições

- A edição de regras só pode ser considerada fechada quando a divergência de fonte descrita no plano tiver decisão editorial registrada.
- A disponibilidade da API Jev não será inferida de erro de DNS em uma rota isolada; qualquer bloqueio automático deve ser respeitado e relatado.
- Falha de conexão do navegador desta sessão só descreve essa sessão, não o servidor do usuário.
- Um critério sem fonte, contrato, resultado ou cenário reproduzível permanece aberto.
