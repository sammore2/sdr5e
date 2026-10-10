# Relatório para verificação — compêndio e motor SDR5E vs SRD 5.2

Objetivo: conferir o que foi alterado, sem reauditar tudo. Não há ação de escrita necessária; só leitura e testes.

## Estado atual
- `npm test`: 218/218.
- `npm run verify`: passa (90 JS, 16 refs, 11 compêndios, 2 idiomas).
- Os 11 `packs/*.sqlite` foram reconstruídos a partir de `packs/source/*.json` (paridade OK).
- Não há commit feito. Todas as mudanças estão no working tree.

## Onde mexi (por arquivo)

### Compêndio — fontes em `packs/source/`
- `spells.json`: dano base e escalonamento (`damage.scaling`, `damage.scalingByCharacterLevel`, `damage.components`); marcadores `_`/`**` removidos; 22+20 magias adicionadas com UUID novo; 3 renomeadas; 2 removidas (Feeblemind, Branding Smite).
- `monsters.json`: 330 registros; 18 criados por clonagem de forma (revisar campos); 6 removidos; idioma do Súcubo; velocidade base dos licantropos = 9 m (30 pés).
- `features.json`: 231 linhas; 125 linhas SRD 5.1 removidas; 27 do SRD 5.2 adicionadas; usos de Guerreiro, Bardo, Paladino, Patrulheiro, Clérigo corrigidos; `levelGained` de Sorcerous Restoration (5) e Divine Sense (3).
- `classes.json`: descrição de 8 classes trocada pelo texto do SRD 5.2; `knownCasterType` = `none` em Bardo, Feiticeiro, Bruxo e Patrulheiro.
- `subclasses.json`: nomes SRD 5.2 (Evoker, Draconic Sorcery, Warrior of the Open Hand, Fiend Patron).
- `magic-items.json`: 261 linhas; raridade por nível (ver decisões); campo `type` em todas; Potions of Greater/Superior/Supreme Healing adicionadas.
- `feats.json`: `requiresLevel` = 0 em 8 talentos sem pré-requisito de nível.
- `journal.json`: 51 páginas (24 adicionadas, 5 removidas); tabelas escapadas viraram HTML; "Abilities" → "The Six Abilities".
- `races.json`, `backgrounds.json`, `vehicles.json`: verbatim, sem mudança de dados (Humano/Tiferino com escolha de tamanho no motor).

### Código — `scripts/`
- `roll-engine.mjs`: dano (metade, crítico só com dados dobrados, resistência/vulnerabilidade sem cancelamento, limiar), morte (sem exaustão, CD 10), conjuração (tipo escolhido, escalonamento, componentes com tipo próprio, nível do espaço persistido), ataques (Invisível com guarda de vários alvos, perguntas de distância e de crítico), PV temporário (escolha do jogador), golpe de misericórdia, Guerreiro (usos e uma vez por turno no nível 17+).
- `prepare-data.mjs`: máximo de usos de Guerreiro e Patrulheiro por nível; salvaguarda de NPC; meio-conjurador combinado.
- `rest.mjs`: descanso curto exige 1 PV; descanso longo pede confirmação das 16 horas; restaura dados de vida; limpa golpe de misericórdia.
- `class-feature-mechanics.mjs`: `FIGHTER_USE_PROGRESSION`, `syncedFighterFeatureUses`, `fighterFeatureOncePerTurn`, `syncedRangerWisdomUses`.
- `class-feature-source-contract.mjs`: lista `IDENTITIES` regenerada a partir do rastreio (testes de rastreio dependem dela).
- `movement-mechanics.mjs`, `movement-sheet-context.mjs`: deslocamento zero por condição.
- `damage-mechanics.mjs`: `applyDamageTraits` (metade, depois dobro), `applyDamageThreshold` (qualquer criatura, antes da resistência).
- `initiative-mechanics.mjs`, `utils.mjs`: iniciativa por condição; passiva ±5; Shift+Ctrl se cancelam.
- `advantage-mechanics.mjs`: Agarrado, Caído, Invisível, Petrificado, Contido, Cego.
- `species-mechanics.mjs`, `character-wizard.mjs`: escolha de tamanho para Humano e Tiferino.
- `schema.mjs`: `damage.scaling`, `damage.scalingByCharacterLevel`, `damage.components`.
- `inspiration-mechanics.mjs`: copia componentes no reroll.
- `wizard-spell-mechanics.mjs`, `class-spellcasting.mjs`: magia preparada; tabelas conhecidas derivadas.
- `srd5e.mjs`: toggle de metade do dano, toggle de golpe de misericórdia, botão de dano com componentes, clique do checkbox não expande o card.

### Outros
- `lang/en.json`, `lang/pt-BR.json`: chaves novas de card, PV temporário, descanso, golpe de misericórdia e frases corrigidas.
- `tests/progression.test.mjs`, `tests/damage-threshold.test.mjs`: asserções que codificavam regra antiga foram atualizadas (cada uma com comentário citando o SRD).
- `ruleset.json`: configurações `criticalHitRule` e `deathSaveDC` removidas.
- Removido: `packs/source/x` (arquivo vazio, não referenciado).

## Checagens rápidas sugeridas (leitura)
1. `npm test` e `npm run verify` — devem passar.
2. `packs/source/spells.json`: "Flame Strike" tem dois componentes (fogo e radiante), cada um com `scaling` de 1d6 a partir do nível 5.
3. `packs/source/features.json`: "Indomitable" tem 1 uso no nível 9 (o máximo sobe por nível em código, não no dado).
4. `packs/source/monsters.json`: "Werewolf (Lycanthrope)" tem `movement.walk` = 9.
5. `packs/source/journal.json`: 51 páginas, sem `&lt;table&gt;` no HTML.
6. `packs/source/magic-items.json`: "Armor, +1" com raridade `rare`.

## Decisões a confirmar (não são bugs confirmados)
- Raridade de itens "varies" ou por nível (Armadura +1/+2/+3, Horn of Valhalla, Feather Token): o esquema guarda uma raridade; usei a menor do SRD e pus as outras no texto.
- Magias com tipo escolhido pelo jogador (Orbe Cromático, Explosão Sorcerina, Glifo de Proteção, Ritual de Elementais Menores, Sopro do Dragão, Interdição): o motor pergunta o tipo ao conjurar.
- Invisível: o Jev escolheu uma flag por alvo; implementei uma pergunta por ataque, e ataques com vários alvos são recusados.
- Descanso longo: não há relógio de jogo; é uma confirmação ("passaram 16 horas?"), não bloqueio.
- PV temporário: o jogador escolhe entre manter o atual e ganhar o novo, como o SRD diz.
- Efeitos fora da rolagem de conjuração (parte de Arcane Hand, parte de Wall of Ice, Wall of Thorns): não modelados.
- Desejo (dano de estresse) e Terremoto (dano ambíguo): não alterados.
- Monstros criados por clonagem (18) e magias/itens adicionados em lote: precisam de conferência humana linha a linha.
- Cards de conjuração antigos (anteriores à mudança): perdem o nível do espaço após recarregar.
- "Strain" e Resistir a Magia em `lang/`: regras da casa, mantidas.

## Pendências de código: todas resolvidas
Decisões do Jev aplicadas (registradas em `.dev/review/jev-*.json`):
- Dano disparado (Muro de Gelo, Muro de Espinhos, Mão Arcana): `damage.triggered` em `spells.json`; rolagem em `roll-engine.mjs` (`rollSpellTriggeredDamage`); botão próprio no card (`srd5e.mjs`). O "aparecimento" do Muro de Gelo foi removido de `triggered` para não dobrar os 10d6.
- Amedrontado: pergunta por rolagem (`roll-engine.mjs`, `applyFrightenedToRoll`).
- Enfeitiçado: bloqueia escolher o encantador, com override do Mestre (`charmerBlocksAttack`, `getCharmerIds`, `promptCharmerForCast`). Encantador gravado em `srd5eCharmerIds`; o aviso se registra no socket e tenta de novo se ele ainda não existir.
- Invisível por alvo: duas flags separadas, `srd5eSeesInvisible` (no alvo) e `srd5eInvisibleAttackerSeen` (no atacante), gravadas quando a resposta é dada.
- Desejo: botão opcional de estresse no card (`rollWishStress`), não automático.
- Cards antigos sem nível do espaço: usam o nível base e avisam que o escalonamento não é recuperável.
- Descanso longo: `resources.lastLongRestAt` (ISO) e bloqueio real das 16 horas, com override do Mestre (`rest.mjs`).
- Raridade por variante: itens divididos, uma linha por tier/variante (`magic-items.json`, 317 linhas).
- Tipo de criatura: `details.creatureType` em todos os 330 monstros; tag em `creatureTag`.

Regras da casa ("Strain", Resistir a Magia): mantidas em `lang/`, por decisão.

## Limites que continuam (não são pendências de código)
- Desejo: o estresse é rolado só se o usuário clicar o botão; não é automático.
- Enfeitiçado: depende do Mestre marcar o encantador quando a condição é aplicada.

## O que não foi verificado
- Nada foi validado no cliente LoomVTT (interface, cards, fichas, fluxo de combate). Só testes unitários e leitura do SRD.
- Próxima fase: teste no LoomVTT. Os erros encontrados lá devem ser reportados com o caminho do arquivo e a ação feita.
