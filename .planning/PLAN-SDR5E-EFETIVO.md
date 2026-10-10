# Plano de execução — SDR5E efetivo

A ordem segue as nove etapas de [`.dev/PLANO-SDR5E-EFETIVO.md`](../.dev/PLANO-SDR5E-EFETIVO.md). Os IDs abaixo remetem ao checklist; não são um novo cronograma inventado. Dentro de uma etapa, escolher o próximo item que esteja aberto, tenha pré-requisitos satisfeitos e possa ser validado com evidência proporcional.

| Etapa | Entrega especificada no plano | Checklist | Dependência e prova de saída |
| --- | --- | --- | --- |
| 0 | Contratos, documentação, comandos, versões, settings e verificação reproduzível | 0.1–0.4 | Base para todas as etapas; comandos executam e pacote não contém arquivos internos. |
| 1 | Estado seguro, recursos, migração e resultado correlacionado de rolagem | 1.1–1.5 | Contratos de API confirmados; provar precondição, gravação, retomada/migração e resultado aplicado. |
| 2 | Regras fundamentais, descanso, magia, dano, morte e Inspiração Heroica | 2.1–2.8 | Base mecânica para criação, ações e combate; casos SRD determinísticos e depois integração Loom. |
| 3 | Criação, Level Up, origens, escolhas, equipamento e revisão antes da gravação | 3.1–3.4 | Construída sobre Etapas 0–2; walkthroughs nos níveis e classes definidos no MD. |
| 4 | Inventário regra → fonte → versão → suporte → prova → gap → aceite | 4.1–4.2 | Fornece cobertura auditável para Etapa 5 e evita inferir suporte por nomes/contagens. |
| 5 | Atividades, conjuração, classes e features | 5.1–5.6 | Depende da matriz semântica da Etapa 4; sessão curta por classe e limites manuais visíveis. |
| 6 | Importação e ações de NPC, equipamento e ciclo de encontro nativo | 6.1–6.8 | Contratos de importação e combate confirmados; fixture integrado de três rodadas. |
| 7 | Efeitos, permissões, idiomas e interface | 7.1–7.6 | Validar no Loom, com papéis, idiomas, teclado, toque e tamanhos de janela previstos. |
| 8 | Reconstrução dos packs, QA, instalação, migração e jogo representativo | 8.1–8.6 | Gate de entrega após as etapas anteriores; não publicar/release sem pedido próprio. |

## Ciclo de cada critério

1. Ler o critério e a fonte citada no MD; conferir código, testes e contrato atual.
2. Marcar `A validar` até haver uma reprodução ou análise atual com evidência citável.
3. Se houver escolha de regra/arquitetura ambígua, usar a decisão Jev já aprovada no plano; não inventar decisão nem contornar bloqueio de envio.
4. Fazer a menor alteração vertical que conclui o critério sem enfraquecer o objetivo SRD5E.
5. Rodar verificações afetadas e depois os gates gerais. Para UI/persistência/runtime, executar o cenário no Loom e registrar resultado observado.
6. Atualizar o checklist com evidência fresca e listar explicitamente o que ainda falta no critério composto.

## Bloqueios legítimos

Quando a API Loom não oferece o contrato exigido, manter o aceite aberto e documentar a dependência mínima; não editar o core nem declarar garantias inexistentes. Se um cenário exigir campanha/ator que não esteja disponível, continuar com validações independentes e registrar exatamente a prova runtime que falta.
