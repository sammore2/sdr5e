# SDR5E — checklist spec-driven de aceite

Atualizado em 08/10/2026 contra o MD original e a árvore atual. Este checklist deduplica os 49 critérios das nove etapas. A caixa marca **implementação de código concluída**; a coluna registra a evidência e a validação Loom que fica para sua revisão final. `Parcial` significa que ainda falta código dentro do critério; `Pendente` significa que a implementação principal não começou. Não deixo código concluído como parcial só porque a sessão Loom fica para o final.

## Painel de progresso — verificação de 08/10/2026

**Existe implementação substancial, mas nenhuma das nove etapas tem todos os seus critérios de aceite fechados.** O percentual de implementação total não é mensurável pelo registro atual: os critérios são compostos e não têm pesos ou subtarefas completas. A métrica abaixo mede critérios, sem atribuir artificialmente 50% aos parciais.

| Métrica | Resultado | O que mede |
| --- | ---: | --- |
| Critérios de código concluídos | **12/49 = 24,5%** | Caixas fechadas por implementação de código; revisão final Loom ainda pode estar pendente. |
| Critérios parciais | **29/49 = 59,2%** | Ainda falta implementar parte do código do critério. |
| Critérios pendentes | **8/49 = 16,3%** | Não há prova suficiente da entrega definida; não significa necessariamente ausência de qualquer código relacionado. |
| Critérios com algum avanço registrado | **41/49 = 83,7%** | Soma de concluídos e parciais; alcance do trabalho, não conclusão. |
| Critérios compostos com aceite Loom completo | **0/49** | Há provas pontuais históricas, mas nenhum gate composto integralmente aceito no Loom. |
| Etapas integralmente aceitas | **0/9** | Todas ainda têm critérios abertos. |
| Testes automatizados | **218 passaram na última execução registrada** | `npm test` não foi repetido nesta atualização; foi executado apenas `npm run verify`, conforme solicitado. |

Base da conferência: árvore de trabalho local sobre `424ee68`, com alterações ainda não commitadas; Node `v26.7.0`. O verificador passou com **90 entradas JavaScript, 16 referências do manifesto, 11 SQLite, 11 fontes versionadas correspondentes e 2 arquivos de idiomas**. Isso confirma sintaxe, referências, integridade SQLite, paridade entre fontes e bancos e JSON dos idiomas; não confirma importação nem correção semântica de todas as entradas. Não foi executada uma nova sessão Loom nesta conferência.

### Progresso por etapa

| Etapa | Escopo | Critérios | Fechados estáticos | Parciais | Pendentes | Principal falta para fechar |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 0 | Contratos e verificação | 4 | 3 | 1 | 0 | Auditoria das divergências legadas. |
| 1 | Estado, recursos e retomada | 5 | 2 | 3 | 0 | Concorrência entre clientes, escrita incerta e validação integrada dos fluxos. |
| 2 | Regras fundamentais | 8 | 3 | 4 | 1 | Descanso concorrente e ciclo integrado de magia, vida e Inspiração. |
| 3 | Criação e evolução | 4 | 0 | 4 | 0 | Walkthrough das 12 classes e níveis 3/5/19, retomada e revisão das alterações. |
| 4 | Inventário de cobertura | 2 | 0 | 2 | 0 | Vincular cada regra a suporte semântico, prova e lacuna específica. |
| 5 | Atividades, magias e classes | 6 | 0 | 6 | 0 | Sessão por classe, conjuração completa, alvos e concorrência. |
| 6 | NPCs, itens e encontros | 8 | 1 | 3 | 4 | Importação de ações tipadas, perfis NPC, itens mágicos e encontro de três rodadas. |
| 7 | Efeitos, permissões e UI | 6 | 1 | 3 | 2 | Matriz de papéis, idiomas e validação visual/teclado/toque. |
| 8 | Conteúdo, QA e entrega | 6 | 2 | 3 | 1 | Instalação limpa, campanha migrada e jogo representativo. |
| **Total** | | **49** | **12** | **29** | **8** | **37 critérios permanecem abertos.** |

### Checklist do que já foi feito e tem prova automatizada

As caixas desta seção marcam **entregas específicas verificadas por testes**, não conclusão da etapa ou do critério composto. Os testes citados passaram no comando acima. A existência de testes de funções não comprova persistência, seleção de alvo ou comportamento da janela real.

- [x] **Base de verificação executável:** `test`, `verify` e `check` definidos em `package.json`; `scripts/verify.mjs` verifica sintaxe, manifesto, idiomas e integridade dos packs. Relacionado a 0.1/8.4; checkout limpo continua aberto.
- [x] **Pré-validação de custo de feature:** recurso ausente/insuficiente ou usos esgotados impedem callbacks de consumo; caso válido executa os consumos em ordem. Prova: `tests/feature-resource-costs.test.mjs`; integração em `scripts/roll-engine.mjs`. Relacionado a 1.2; não garante atomicidade se a segunda escrita falhar.
- [x] **Retomada de Level Up com escrita incerta:** reconciliação por marcador exato, checkpoint antes da escrita e bloqueio quando não há confirmação inequívoca. Prova: `tests/multiclass-advancement-journal.test.mjs`. Relacionado a 1.3/3.3; API real e concorrência permanecem abertas.
- [x] **Preparação repetível de dados legados:** segunda preparação preserva o resultado e os totais ambíguos de recursos multiclasse. Prova: `tests/prepare-data-migration.test.mjs`. Relacionado a 1.4; não é aceite de migração versionada em campanha.
- [x] **Slots de Ranger/Paladin/multiclasse:** casos de progressão e arredondamento cobertos em `tests/progression.test.mjs`. Relacionado a 2.1; comportamento da ficha e persistência não foram aceitos aqui.
- [x] **Exaustão e movimento:** testes de penalidade D20/velocidade sem reduzir PV máximo, custos de segmentos, terreno difícil, troca de modo e Dash. Prova: `tests/progression.test.mjs`. Relacionado a 2.4; não fecha todos os cenários de exaustão.
- [x] **Dano, morte e concentração:** casos de resistência/vulnerabilidade/imunidade, dano massivo, morte de NPC e override, DC de concentração e encerramento por condições incapacitantes. Prova: `tests/progression.test.mjs` e `tests/damage-threshold.test.mjs`. Relacionado a 2.6/2.7/6.3; ciclo integrado continua aberto.
- [x] **Inspiração Heroica:** rerrolagem de dado e recomposição do resultado, preservação do alvo/mastery e trava local por navegador. Prova: `tests/progression.test.mjs`. Relacionado a 2.8; trava local não garante coordenação entre clientes.
- [x] **Criação/progressão:** contratos de proficiência das 12 classes, HP inicial por classe/Constituição, escolhas Human/Skilled e limites de aprendizado/preparo do Wizard testados em `tests/progression.test.mjs`. Relacionado a 3.1/3.2; não equivale a criar 12 personagens válidos no Loom.
- [x] **Escolhas e recursos de classes:** casos de Rage, Focus, Bardic Inspiration/Expertise, Divine/Primal Order, Wizard e invocações têm testes em `tests/progression.test.mjs`, `tests/druid-primal-order.test.mjs` e `tests/warlock-invocations.test.mjs`. Relacionado a 5.5; catálogo completo e sessão por classe continuam abertos.
- [x] **Limite de slot por turno:** identidade de combate/rodada/Cast, bloqueio sequencial entre pools e registro de override explícito do GM. Prova: `tests/spell-slot-turn.test.mjs`; integração em `scripts/roll-engine.mjs`. Relacionado a 5.3; concorrência entre clientes não foi demonstrada.
- [x] **Ataques e cobertura:** 1/20 natural mantido, ataque vinculado a um alvo e bônus de Cover sem empilhamento, incluindo escolha/cancelamento em save DEX. Prova: `tests/attack-target-mechanics.test.mjs` e `tests/cover-mechanics.test.mjs`. Relacionado a 5.4/6.6; alvos e saves na UI precisam de aceite.
- [x] **Ações assistidas:** pré-condições e resultados de Grapple/Shove, declaração manual de Ready e lembrete manual de Dodge testados. Prova: `tests/progression.test.mjs`, `tests/shove-mechanics.test.mjs`, `tests/ready-action-mechanics.test.mjs` e `tests/dodge-mechanics.test.mjs`. Não classificar esses fluxos como automação integral do combate.
- [x] **Consumíveis de referência:** Potion of Healing com cura limitada ao PV máximo e Healer's Kit com confirmação/consumo; custo de ação desses itens verificado. Prova: `tests/item-action-costs.test.mjs` e `tests/healers-kit-mechanics.test.mjs`. Relacionado a 6.4/6.5; não fecha o catálogo de itens mágicos.
- [x] **Orçamento de encontro:** soma contribuição de cada personagem em grupos de níveis mistos, preserva limites inclusivos e rejeita níveis inválidos. Prova: `tests/encounter-budget.test.mjs`; integração em `scripts/encounter-sheet.mjs`. Relacionado a 6.7; ficha renderizada/persistida continua aberta.
- [x] **Contexto de movimento por token:** seleção explícita quando há vários Casts em combate e ledger de Actor fora de combate. Prova: `tests/movement-sheet-context.test.mjs`; integração em `scripts/character-sheet.mjs`. Relacionado a 6.6; não prova o ciclo do encontro.
- [x] **Sincronização de efeito de equipamento:** plano de atualização preserva identidade, evita no-op desnecessário e prevê criação/remoção conforme equipamento/bônus. Prova: `tests/effect-sync-mechanics.test.mjs`; integração em `scripts/effects.mjs`. Relacionado a 7.1; escrita real continua aberta.
- [x] **XP e evolução:** tabela de 20 níveis, limiares, elegibilidade XP/milestone, marcos opcionais de nível 20 e preview de distribuição para grupo/subconjunto. Prova: `tests/xp-progression.test.mjs` e `tests/group-xp.test.mjs`; consumidores nas fichas de personagem/grupo e Level Up. Não comprova gravação da distribuição no Loom.

### Divergências e limites da métrica

- O resumo `Estado verificável` do plano original ainda registra **4 estáticos / 34 parciais / 11 pendentes e 210 testes**. Ele diverge das 49 linhas deste checklist. Use o painel deste arquivo para este snapshot; não some números de snapshots diferentes.
- Este checklist registrava **215 testes**; a execução desta conferência retornou **218**. O aumento de três testes não autoriza fechar mais nenhum critério composto.
- O relato de ZIP local com 124 entradas nas linhas abaixo é evidência histórica, **não reexecutada nesta conferência**. O workflow foi inspecionado; instalação limpa e execução GitHub continuam sem aceite registrado aqui.
- O consumo de **45% de cota foi relatado pelo usuário**. Não foi auditado por tarefa/modelo nesta conferência e não permite inferir avanço, desperdício ou alucinação. Há implementação testada; falta prova para declarar o sistema completo.

### Como registrar progresso daqui em diante

Cada atualização deve apontar **ID do critério, subentrega anterior → atual, arquivo/teste/cenário, resultado e falta restante**. Se só um subcaso avançou, registrar aqui e manter o gate composto parcial. Ao fechar um critério, recalcular o painel por etapa; manter testes e aceite Loom separados. Uma atualização sem mudança de status ainda deve dizer qual lacuna foi reduzida. Não estimar tempo restante ou percentual de esforço pela quantidade de testes, arquivos, tokens ou consultas externas.

## Contagem dos critérios de aceite

- Critérios registrados: **49**.
- Concluídos por código: **12**.
- Parciais, com código ainda faltante: **29**.
- Pendentes, sem evidência registrada: **8**.
- Critérios compostos com aceite runtime completo: **0**. Há testes pontuais de runtime (por exemplo, Shove), mas não fecham por si só um critério composto de etapa.

- [x] Código concluído nos critérios: **0.1, 0.2, 0.3, 1.2, 1.5, 2.1, 2.4, 2.7, 6.7, 7.1, 8.1 e 8.4**.
- [ ] Critérios ainda abertos: **37** - 29 parciais e 8 pendentes. Os parciais ainda têm código a implementar; os pendentes não têm a implementação principal.

Essas contagens não medem esforço, duração ou proximidade de conclusão. “Concluído estático” também não significa aceite Loom. A lista por critério abaixo é o registro rastreável; atualize estados somente quando a evidência indicada existir.

## Etapas 0–4

| ID | Critério de aceite | Estado | Evidência e lacuna restante |
| --- | --- | --- | --- |
| [x] 0.1 | Verificações declaradas executáveis por desenvolvedor | Concluído código | `npm run verify` executa sintaxe, manifesto, fontes SQLite versionadas, integridade SQLite e idiomas; `npm test` e `npm run check` seguem disponíveis e o workflow usa `npm ci`. `npm run verify` passou nesta atualização. |
| [x] 0.2 | Pacote de distribuição exclui arquivos internos | Concluído código | Workflow de release exclui arquivos internos, testes, LESS, verificadores e agora `packs/source`; verificador do ZIP está ligado ao fluxo. Publicação real não foi solicitada. |
| [x] 0.3 | Versões runtime, manifesto, pacote e release coerentes | Concluído código | `package.json`, `ruleset.json` e cabeçalho runtime estão em 0.1.0; workflow deriva a versão do tag para o manifesto de release. Não houve publicação. |
| [ ] 0.4 | Divergências de regra e documentação têm decisão explícita | Parcial | A contradição sobre slots de Paladin/Ranger foi corrigida contra SRD 5.2 e teste atual; catálogo misto e conteúdo legado ainda exigem auditoria. |
| [ ] 1.1 | Ativações concorrentes não duplicam consumo | Parcial | Há ledger/fila local; sem compare-and-swap distribuído ou teste multi-cliente. |
| [x] 1.2 | Recurso insuficiente não consome usos | Concluído estático | `scripts/feature-resource-costs.mjs` valida o pool e os usos antes de qualquer escrita; os testes existentes verificam zero callbacks para recursos ausentes/insuficientes e usos esgotados, e ordem de consumo no caso válido. A concorrência entre clientes permanece em 1.1. A última execução registrada passou 218 testes; `npm run verify` passou nesta atualização. |
| [ ] 1.3 | Falha intermediária retoma sem duplicar ator/operação | Parcial | Journals de criação e Level Up retomam/reconciliam checkpoints; falta garantia transacional/idempotente no servidor para escrita incerta e aceite integrado. |
| [ ] 1.4 | Migração executada duas vezes é idempotente | Parcial | `tests/prepare-data-migration.test.mjs` prepara duas vezes fixture legada multiclasses e confirma deepEqual no segundo ciclo, preservando pools Pact/Hit Dice ambíguos. Ainda falta versionar formalmente as migrações e teste em cópia de campanha. |
| [x] 1.5 | Resultado de chat é o mesmo aplicado em cura/dano | Concluído estático | Dano de arma/magia usa o total resolvido pelo servidor no card e no botão de aplicar; Heroic Inspiration recalcula esse total. Dados de vida aguardam o total resolvido do card antes de confirmar cura/consumo. Fluxos planos e auto-cura/consumíveis exibem e aplicam o mesmo total calculado; `applyHeal` informa a cura efetiva quando os PV máximos limitam o ganho. Evidência nos caminhos de `srd5e.mjs` e `scripts/roll-engine.mjs` (`rollWeaponDamage`, `rollSpellDamage`, `spendHitDie`, `activateFeature` e `useConsumable`). Aceite Loom composto fica para a revisão final. |
| [x] 2.1 | Slots Ranger, Paladin e multiclasse seguem tabela | Concluído estático | Tabelas/progressão e testes cobrem os casos; runtime pendente. |
| [ ] 2.2 | Pools normal/Pact independentes e recuperação correta | Parcial | Pools separados, migração conservadora e recuperação Pact implementadas; falta teste integrado curto/longo dos pools normal e Pact. |
| [ ] 2.3 | Dados de vida multiclasses e cura usam o dado efetivamente rolado | Parcial | Pools e cura avançaram; combinação Fighter/Wizard sem aceite integrado. |
| [x] 2.4 | Exaustão 5.2 aplica D20, movimento e morte conforme nível | Concluído estático | O motor aplica −2 por nível às rolagens SDR5E, incluindo os campos roláveis genéricos da ficha; deslocamento cai 1,5 m por nível; nível 6 persiste morte; descanso longo reduz um nível; PV máximo não é alterado. `npm run verify` passou. |
| [ ] 2.5 | Descanso longo recupera todos os dados e preserva mudanças concorrentes | Pendente | Falta comprovação combinada das duas condições. |
| [ ] 2.6 | Concentração substitui/encerra e aplica DC limitada corretamente | Parcial | Salvaguarda publicada e encerramento por condições incapacitantes implementados; persistência Actor/Cast em gravações separadas e aceite integrado seguem pendentes. |
| [x] 2.7 | Dano, morte, cura, estabilidade e overflow passam os casos previstos | Concluído código | Consequências cobrem resistência/imunidade/vulnerabilidade, dano massivo, estado a 0 PV, estabilidade, falhas de morte e crítico; casos existentes cobrem os limites e cura. A revisão integrada Loom fica para o fim. |
| [ ] 2.8 | Inspiração Heroica rerrola dado escolhido e aplica novo resultado | Parcial | Implementação e testes por caminhos; ciclo integrado completo pendente. |
| [ ] 3.1 | Criar personagem nível 1 para as 12 classes | Parcial | Wizard cobre origem, equipamento, idiomas, magias e escolhas implementadas; falta walkthrough integrado no Loom para as 12 classes e verificação das escolhas específicas. |
| [ ] 3.2 | Criar personagem nos níveis 3, 5 e 19 | Parcial | Criação percorre os níveis e escolhas de progressão disponíveis; faltam walkthroughs Loom nos níveis 3, 5 e 19 e auditoria do resultado persistido. |
| [ ] 3.3 | Level Up repetido/retomado não duplica nem perde escolhas | Parcial | Journals e reconciliação local; gravações múltiplas não são transação de servidor. |
| [ ] 3.4 | Revisar todas as mudanças antes do commit final | Parcial | Preview existe em fluxos, sem cobertura completa de criação/evolução. |
| [ ] 4.1 | Inventário liga cada regra/entrada a fonte, formato, suporte, prova e gap | Parcial | Inventário lista milhares de registros, mas muitos mantêm estado genérico de validação pendente. |
| [ ] 4.2 | Matriz cobre os cinco domínios e prioriza casos SRD sem usar títulos como prova | Parcial | Matriz inicial existe; cobertura e evidência semântica de catálogo completo faltam. |

## Etapas 5–8

| ID | Critério de aceite | Estado | Evidência e lacuna restante |
| --- | --- | --- | --- |
| [ ] 5.1 | Contrato de atividade e matriz de features/classes por nível | Parcial | Trace registra identidades; efeitos, gatilhos e inventário semântico integral faltam. |
| [ ] 5.2 | Conjuração escolhe modo, slot/pool/classe e valida alvos/preparo/efeitos | Parcial | Slots, concentração e progressão avançaram; fluxo de ponta a ponta não foi aceito. |
| [ ] 5.3 | Limite de um slot por turno e override de Mestre | Parcial | Trava, registro e override têm testes sequenciais; a concorrência entre clientes ainda pode passar sem compare-and-swap e o comportamento não foi aceito no Loom. |
| [ ] 5.4 | Saves e dano parcial ficam vinculados ao alvo correto | Parcial | Há fluxos com CastId; matriz completa multi-alvo/save sem aceite. |
| [ ] 5.5 | Doze classes exercitadas em sessão nos recursos/características principais | Parcial | Fluxo de ataque extra da maestria Nick foi implementado no ataque de turno com arma leve, escolha da arma secundária, limite por turno e textos en/pt-BR; falta exercício integrado das doze classes no Loom. `npm run verify` passou. |
| [ ] 5.6 | Features/classes não suportadas comunicam corretamente o modo manual | Parcial | Limites são registrados em vários pontos; auditoria contextual completa falta. |
| [ ] 6.1 | Importação preserva NPC e converte stat block em atividades tipadas | Pendente | Biografia contém ações em texto; não foi comprovado importador/conversão local. |
| [ ] 6.2 | Seis perfis NPC (melee, ranged, caster, save/recharge, legendary, multi-damage) funcionam | Pendente | Fixtures e aceite desses perfis não encontrados. |
| [ ] 6.3 | Resistências, condições, ações lendárias e recargas integram com atores | Parcial | Alguns mecanismos gerais existem; bestiário/recarga/lendárias sem prova completa. |
| [ ] 6.4 | Equipamento comum tem dados estruturados e pipeline reproduzível | Parcial | Pacotes iniciais e sincronização avançaram; catálogo/manifesto completos faltam. |
| [ ] 6.5 | Itens mágicos têm armas/armaduras, consumíveis, cargas, sintonia e containers validados | Pendente | Contagem/SQLite não comprovam comportamento semântico por categoria. |
| [ ] 6.6 | Encontro nativo conclui membros, tokens, turnos, efeitos e encerramento | Parcial | Peças isoladas existem; ciclo integrado e tokens ligados/desligados pendentes. |
| [x] 6.7 | Dificuldade soma contribuições individuais em grupos de níveis diferentes | Concluído código | `encounterXpBudgetForLevels` soma limiares por personagem; testes existentes cobrem grupos mistos, grupos homogêneos, limites inclusivos e níveis inválidos. A apresentação no Loom fica para a revisão final. |
| [ ] 6.8 | Fixture joga três rodadas com ações, saves, recargas e tokens corretos | Pendente | Sem fixture/aceite integrado de três rodadas. |
| [x] 7.1 | Edição de item equipado atualiza/remova apenas efeito de origem estável | Concluído estático | Testes cobrem atualização, no-op, criação e remoção; persistência real segue pendente. |
| [ ] 7.2 | Todos os campos/durações de efeito seguem schema e ciclo de combate | Parcial | Vários fluxos cobertos; auditoria campo a campo e fora de combate incompletas. |
| [ ] 7.3 | Permissões de GM/owner/observer/limited/sem acesso testadas em leitura e escrita | Pendente | Matriz runtime completa não documentada. |
| [ ] 7.4 | Todos os textos visíveis têm i18n contextual en/pt-BR | Parcial | Bundles e verificação estrutural existem; auditoria contextual/AST integral falta. |
| [ ] 7.5 | UI renderizada atende desktop/mobile, alvo, teclado, touch e recuperação | Parcial | Houve correções pontuais; revisão visual abrangente pendente e Vite não abriu nesta sessão. |
| [ ] 7.6 | Ações principais em ambos idiomas e papéis funcionam sem bloqueio de teclado | Pendente | Sem teste end-to-end combinado de idioma, permissão e acessibilidade. |
| [x] 8.1 | SQLite pode ser reconstruído de fontes versionadas com IDs estáveis | Concluído estático | `packs/source/*.json` guarda schema e registros com IDs originais. `npm run packs:build -- <diretório>` reconstrói os 11 bancos sem tocar nos atuais e compara cada saída com sua fonte. A reconstrução completa passou em diretório temporário; `npm run verify` também confirma paridade da fonte versionada com os bancos distribuídos. |
| [ ] 8.2 | QA semântico cobre campos, imagens, duplicatas, metadados e import | Parcial | `verify` cobre estrutura/referências; semântica/import por atividade faltam. |
| [ ] 8.3 | Regressões semânticas e instalação limpa do ZIP são gate | Parcial | Workflow de release configurado com Node 22.13, `npm ci`, `npm run check`, integridade ZIP e referências do manifesto; execução GitHub e instalação limpa do ZIP resultante não foram comprovadas nesta conferência. |
| [x] 8.4 | Sintaxe, JSON, SQLite, referências e regressões passam | Concluído estático | Última execução registrada de `npm.cmd run check`: 218/218 testes; nesta atualização, `npm run verify` passou com 90 entradas JS, 16 refs, 11 compêndios, 11 fontes versionadas e 2 idiomas. |
| [ ] 8.5 | Migração em cópia de campanha e instalação limpa passam | Pendente | Nenhum aceite de cópia migrada/instalação limpa registrado. |
| [ ] 8.6 | Importação e jogo representativo, limites e documentação de cobertura | Parcial | Documentação foi atualizada; import/jogo representativo não foi aceito. |

### Como interpretar

As 49 linhas são gates compostos extraídos dos critérios explícitos do plano; subtarefas repetidas entre etapas foram consolidadas quando tratavam do mesmo resultado. Não uso tokens, commits nem quantidade de código para inferir conclusão. Em futuras atualizações, cada item muda de estado apenas quando a evidência indicada é registrada. A recusa de conexão Vite mencionada em 7.5 pertence à sessão anterior; não foi repetida nesta conferência e não prova o estado atual do servidor no computador do usuário.
