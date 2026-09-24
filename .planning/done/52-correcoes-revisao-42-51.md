# Handout 52: Correções da revisão dos handouts 42–51

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`
(as regras gerais continuam valendo, inclusive não commitar e comentários em inglês).

Os handouts 42–51 foram implementados e revisados em 24/09/2026. Este handout corrige o que a
revisão encontrou. **Antes de começar**, mova os 10 handouts `42-*.md` … `51-*.md` de
`.planning/` pra `.planning/done/`: eles foram executados, mas não foram movidos.

Cada item abaixo diz o problema, onde está e a correção esperada. Faça **só** o que está descrito.

---

## Parte A: bugs que quebram funcionalidade

### A1. Fichas de grupo, veículo e encontro não salvam nenhum input

`scripts/group-sheet.mjs`, `scripts/vehicle-sheet.mjs`, `scripts/encounter-sheet.mjs` não
sobrescrevem `_onChangeForm`. O da base (`E:\modules\LoomVTT\client\windows\document-sheet.ts:379`)
é vazio. Resultado: cofre, descrição, nome, CA, PV, limite de dano, carga, tipo de veículo,
quantidade e fórmula do encontro nunca são gravados.

**Correção**: implementar nas três o mesmo mecanismo da ficha de NPC
(`scripts/npc-sheet.mjs:195-225`: `_pendingFields` + `_onChangeForm` + debounce de 300 ms +
`_flushPendingFields` com `setPathValue`). **Não copie três vezes**: extraia pra um helper
compartilhado (ex.: uma função `createFormSaver(sheet)` ou um mixin pequeno em `scripts/utils.mjs`) e
use nas três. Não altere o NPC nem o personagem neste handout.

Atenção no encontro: os inputs usam `sd:members.{{@index}}.quantity.value`
(`templates/encounter-sheet.hbs:12,14`), então confirme que `setPathValue` trata índice numérico
de array (`members.0.quantity.value`) sem transformar o array em objeto. Se não tratar, corrija
**no helper novo**, não no `setPathValue` existente.

### A2. `'container'` falta no `defineSystem`

`srd5e.mjs:121`: a lista `itemTypes` não tem `'container'`, mas o `ruleset.json` tem.
Adicionar. As duas listas precisam ficar idênticas.

### A3. O deslocamento da raça nunca chega no personagem

O personagem começa com `movement.walk: 9` (`scripts/schema.mjs:125`) e a migração também
coloca 9 quando não há legado (`scripts/prepare-data.mjs:49`). Como a regra "valor manual ≠ 0
vence a raça" vê 9, Anão e Halfling (8 m) andam 9 m.

**Correção** (vale só pra `character`; NPC e item race não mudam):
1. `schema.mjs:125`: `walk: 0` no default do `character`.
2. `migrateLegacyMovement`: receber o tipo do ator (`migrateLegacyMovement(target, actorType)`;
   ajustar a chamada em `srd5e.mjs`). Pra `character`: sem legado → `walk: 0`; legado
   exatamente `'9m'` (o default antigo do schema) sem outros modos → `walk: 0`. Pra os outros tipos,
   comportamento atual.
3. `prepMovement` (`prepare-data.mjs`): pra `walk`, a ordem é valor gravado > 0, senão
   raça > 0, senão 9 (fallback do SRD). Pros outros modos, valor gravado > 0, senão raça, senão 0.
   Documente a ordem num comentário.

Personagens criados entre o handout 44 e este, com `walk: 9` já gravado, continuam 9. Não
migre isso; só mencione no relatório.

### A4. Descanso e ficha de grupo usam o ator sem `prepareData`

`scripts/rest.mjs:22,30` e a ficha de grupo buscam o ator com `api.get('/actors/:id')`, que devolve
dado **cru**. O `prepareData` só roda dentro da ficha (`document-sheet.ts:56`, `_runPrepareData`).
Resultado: `health.effectiveMax` não existe, e um descanso longo com exaustão ≥ 4 cura até o
máximo cheio (desfaz o handout 26). CA (`attributes.da.value`) e `skills.perception.total` no
grupo vêm desatualizados.

**Correção**:
1. Mover o corpo de `prepareData(row)` de `srd5e.mjs` pra `scripts/prepare-data.mjs` como
   `export function prepareActorRow(row)` (imports: `getDefaultData` de `./schema.mjs`,
   `mergeDefaults` de `./utils.mjs`; não gera import circular, conferido). Em `srd5e.mjs`,
   `prepareData` passa a só chamar `prepareActorRow(row)`.
2. Criar e exportar `fetchPreparedActor(id)` (mesmo arquivo ou `utils.mjs`): busca e devolve
   `prepareActorRow(await api.get(...))`.
3. `rest.mjs`, `group-sheet.mjs` (membros, award, rest all) e `encounter-sheet.mjs` (grupo
   principal) passam a usar `fetchPreparedActor` onde leem campo derivado.
4. **Não gravar dado derivado de volta**: no `rest.mjs`, o PUT final grava `sd`. Garanta que
   ele não passe a persistir `effective`/`effectiveMax` novos por causa do prep. Grave a partir do dado
   cru e use o preparado só pra leitura (ex.: `effectiveMax`).

### A5. O encontro empilha todos os tokens no canto do mapa

`scripts/encounter-sheet.mjs:211`: `x = col*1; y = row*1` são pixels.

**Correção**: `GET /stages/active` (`E:\modules\LoomVTT\server\applications\api\stages.ts:59`)
devolve a stage com `id`, `gridSize`, `width`, `height`, `padding`. Use essa rota (e remova a
busca por `window.Loom.canvas.active`, que não foi verificada). Posição de cada token:
centro da stage (`width/2`, `height/2`) arredondado pro grid, + `col * gridSize` e + `row * gridSize`,
com o bloco inteiro centralizado (linhas de até 5). **Teste ao vivo** se o `padding` desloca
a origem: se os tokens não caírem no centro visível, some o deslocamento de `padding` e
descreva no relatório o que precisou.

### A6. Container dentro de container some da ficha

`templates/character-sheet.hbs:431` renderiza só um nível de conteúdo. Um container aninhado não tem
botão de expandir, e os itens dele ficam invisíveis.

**Correção** (em `character-sheet.mjs`, perto da linha 500):
1. Extrair uma função `rowFor(item, depth)` que monta **todas** as flags de uma linha
   (`isConsumable`, `isTool`, `proficient`, `usesLabel`, `showEquip`, `hasQuantity`, `isMovable`,
   `isContainer`, `containerOpen`, `capacityLabel`, `capacityOver`, `depth`), usada tanto na raiz quanto no conteúdo.
2. `containerContents` passa a ser a lista **achatada** de todos os descendentes visíveis (um
   descendente só entra se todos os containers acima dele estiverem abertos), cada um com `depth`.
3. No template, as linhas aninhadas usam o **mesmo** markup de botões da raiz (Use/Check/Equip/
   Move/Delete + expandir se for container), com recuo por `depth` (ex.: `style="margin-left: {{depth}}em"`
   ou classe por profundidade). Isso também resolve as linhas aninhadas sem botões.

### A7. Fly, swim, climb e burrow não aparecem na ficha de personagem

`_movement` é calculado (`character-sheet.mjs`, contexto) mas nenhum template o usa.

**Correção**:
- `templates/character-sheet.hbs:90`: mini-stat WALK com `title="{{_movement.walkTitle}}"`, e logo
  depois tags `sdrn-tag` pra cada item de `_movement.others` (`{{label}} {{value}}`, com `title`)
  e uma tag "Hover" se `_movement.hover`.
- `templates/npc-sheet.hbs:94`: `title="{{_movement.walkTitle}}"` no mini-stat.
- Remover `_sensesList` do contexto do personagem (não é usado; os sentidos já entram em `_senses`).

### A8. "Abrir membro" quebrado

`group-sheet.mjs:97` e `vehicle-sheet.mjs:144` chamam `windowManager.open(id, null, ...)`, sem a
classe. O template do grupo nem tem o botão.

**Correção**: importar `Sdr5eCharacterSheet` e `Sdr5eNpcSheet` e escolher pela `type` do membro
(já conhecida no contexto), com o id `actor-sheet-<id>`, que é o mesmo padrão de
`character-wizard.mjs:310`. No `templates/group-sheet.hbs`, o nome do membro vira um botão
`data-action="open-member" data-id="{{id}}"`. Remover a variável `actor` não usada em `group-sheet.mjs:97`.

---

## Parte B: correções menores

- **B1. A carga mostrada diverge da regra.** `character-sheet.mjs:670` calcula o peso com uma lista
  própria (sem loot/container, sem descontar conteúdo sem peso). Extraia o cálculo de peso de
  `prepEncumbrance` pra `export function computeCarriedWeight(items)` em `prepare-data.mjs` e use
  nos dois lugares.
- **B2. Sub-raças sem darkvision.** Em `packs/races.json`, Hill Dwarf, High Elf e Rock Gnome ficaram
  com `senses.darkvision: 0`. Corrija no `.dev/migrate-movement-44.mjs`: sub-raça (nome
  `Base (Sub)`) herda `senses` e os modos de `movement` iguais a 0 da raça base. Rode de novo
  (preservando ids) e reconverta: `node E:\modules\LoomVTT\scripts\build-compendium-pack.mjs packs\races.json`.
- **B3. Award do grupo** (`group-sheet.mjs`, `_award`):
  - Apagar o comentário especulativo da linha 214.
  - "Tirar do cofre": se o cofre não tiver saldo de alguma moeda, abortar com toast **antes**
    de pagar qualquer um. Hoje ele zera o cofre e paga mesmo assim, criando dinheiro.
  - O resto de XP que não divide aparece na mensagem de chat ("N XP não distribuídos"). Não criar
    campo novo.
  - A mensagem de chat lista a divisão de todas as moedas, não só gp.
- **B4. Encontro, whisper**: `encounter-sheet.mjs:178` usa `whisper: ['gm']`, mas nem o cliente nem
  `server/applications/api/chat-messages.ts` suportam `whisper`, então a mensagem sai **pública**.
  Troque por `window.Loom.dispatchRoll({ formula: String(total), mode: 'gmroll', meta: { label } })`
  por membro rolado (mesmo padrão de total literal do `rollWeaponDamage`), com o **nome** do NPC no
  label, e não o id.
- **B5. Encontro, isGM**: `encounter-sheet.mjs:184`. `window.Loom.user.isGM` existe
  (`E:\modules\LoomVTT\client\main.ts:167`). Remova o `|| role === 'gm'` (os papéis são numéricos) e
  esconda o botão Place on Stage no template quando não for GM.
- **B6.** `settings.mjs`, `setSetting`: remover o fallback pra `/settings/srd5e/...` (rota inexistente).
  Sem `window.Loom.settings.set`, só logar o aviso.
- **B7.** `character-wizard.mjs:104`: `_reviewRaceInfo` lê `compendiumData.speed`, que não existe
  mais. Use `movement.walk` (`"8 m"`).
- **B8.** `character-sheet.mjs:1246`: apagar `_restoreItemUses` (código morto depois do `rest.mjs`).
- **B9.** `roll-engine.mjs` (`applyDamage`, limite de dano): a mensagem está em português. Use
  `below damage threshold (N)`, que segue o idioma das outras (`Immune`/`Resistant`).
- **B10.** `vehicle-sheet.mjs` (`_addMember`): recusar ator `group`; só `character` e `npc`,
  como a própria mensagem diz.
- **B11.** Vehicle e group têm código de leitura de payload de drop duplicado. Extraia pra
  `scripts/utils.mjs` (`readDropPayload(event)`) e use nas fichas de grupo, veículo e encontro.

---

## Critério de aceite

- `node --check` em todo `.mjs` tocado; os templates tocados compilam (teste rápido:
  `node -e "require('E:/modules/LoomVTT/node_modules/handlebars').precompile(require('fs').readFileSync('<arquivo>','utf8'))"`).
- `.planning/done/` contém os handouts 42–51.
- Ao vivo:
  1. Grupo: editar o cofre e a descrição, fechar e reabrir → valores mantidos. Idem pros campos do veículo e do encontro.
  2. Criar um personagem Dwarf novo → WALK 8 m. Personagem antigo com `speed: '9m'` e raça Halfling → 8 m.
  3. Personagem com PV 5/20 e exaustão 4 → Long Rest (pela ficha **e** pelo grupo) → PV 10, não 20.
  4. Encontro com 3 Goblins → Place on Stage → 3 tokens lado a lado no centro visível da stage.
  5. Backpack dentro de Bag of Holding, com uma poção dentro da Backpack → expandir os dois →
     a poção aparece com o botão Use; a carga mostrada na ficha é igual à do cálculo de encumbrance.
  6. Personagem com raça que tem fly (crie uma à mão com fly 15) → tag "Fly 15 m" ao lado do WALK.
  7. Clicar no nome de um membro no grupo → abre a ficha certa (personagem ou NPC).
  8. Roll quantities no encontro → um jogador conectado **não** vê o resultado.
  9. Criar um item container pela sidebar → o tipo Container aparece na lista de criação.

## Ferramental obrigatório

Use `rtk` pra tudo; o comando nativo só entra onde o rtk não cobre. Não invente subcomandos.

| Em vez de | Use |
|---|---|
| `cat`/`head`/`tail` | `rtk read -l minimal <arquivo>` (sem `-l minimal` não economiza nada) |
| `grep`/`rg` | `rtk grep -n "<padrão>" <caminho>` |
| `git status/diff/log` | `rtk git status` / `rtk git diff` / `rtk git log` |
| `ls`/`find` | `rtk ls` / `rtk find` |

Disciplina de busca: nunca repetir o mesmo padrão de busca; não reler um arquivo que você
acabou de editar; no máximo 5 buscas seguidas antes de ler um arquivo de fato. Se o `rtk` falhar
por motivo de ambiente, use o caminho nativo mais barato **e diga isso no seu relatório**.

## Ao terminar

Mover este arquivo pra `.planning/done/52-correcoes-revisao-42-51.md` como último passo, depois do
critério de aceite confirmado.
