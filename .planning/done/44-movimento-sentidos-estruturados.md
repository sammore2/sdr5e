# Handout 44: Movimento e sentidos estruturados + Exhaustion 2/5

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende do handout 42 (`MOVEMENT_TYPES`, `SENSE_TYPES`, `feetToMeters` em `scripts/config.mjs`).

Unidade do ruleset: **metros**, número inteiro (30 ft = 9 m, conversão `feetToMeters`).

## Achados

1. Deslocamento é **texto livre**: `attributes.speed: { value: '9m' }` no personagem
   (`schema.mjs:124`) e no NPC (`schema.mjs:184`), e `speed: '9m'` no item de raça (`schema.mjs:313`).
   O NPC ainda grava `speed.fly/swim/climb/burrow` como texto, fora do schema
   (`npc-sheet.mjs:343-347`, `templates/npc-sheet.hbs:457+`).
2. Nada numérico lê isso, então a penalidade de armadura pesada (`attributes.armor.speedPenalty`,
   `prepare-data.mjs:42-71`) é só um flag, e **Exhaustion 2 (deslocamento pela metade) e 5
   (deslocamento 0) do SRD 5.1 não existem**.
3. O deslocamento da raça **nunca chega no ator**: nada em `prepare-data.mjs` lê o item `race`
   pra deslocamento. O wizard de criação só mostra o valor no resumo (`character-wizard.mjs:89`).
4. Sentidos são tags de texto: `details.senses: { value: [], custom: '' }` (`schema.mjs:166,193`).
   Os monstros do compêndio têm tudo num texto só, ex.:
   `custom: "darkvision 120 ft., passive Perception 20"`.
5. O pack de monstros perdeu os deslocamentos extras: `.dev/build-compendium.mjs:472-473` lê só
   o **primeiro número** da linha Speed (Aboleth "10 ft., swim 40 ft." virou `3m`, e o swim sumiu).

## Formato novo

Tanto no personagem quanto no NPC, dentro de `attributes`:

```js
movement: { walk: 9, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false },
senses: { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 },
```

No item `race`: `movement: { walk: 9, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false }` e
`senses: { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 }`.

`details.senses` **continua existindo** (tags e texto livre pra sentidos que não têm número,
ex.: "keen smell"). Nenhum campo antigo é apagado do banco.

## Passo 1: schema (`scripts/schema.mjs`)

- `character` e `npc`: adicionar `movement` e `senses` em `attributes` (formato acima) e **tirar**
  `speed: { value: '9m' }` do default. O dado já gravado não é apagado, só deixa de ser gerado
  pra atores novos, e o passo 2 lê o legado.
- `race`: trocar `speed: '9m'` por `movement` + `senses` (formato acima).

## Passo 2: migração de leitura do legado (`scripts/prepare-data.mjs` + `srd5e.mjs`)

Criar em `prepare-data.mjs` e exportar:

- `parseDistance(text)`: aceita `'9m'`, `'9 m'`, `'30 ft'`, `'30 ft.'`, `'30'` (sem unidade = metros,
  que é o formato legado do ruleset) e devolve número em metros (ft via `feetToMeters`). Texto
  vazio ou inválido devolve 0.
- `migrateLegacyMovement(target)`: `target` é um objeto que pode ter `speed` legado (o
  `attributes` de um ator OU o `data` de um item race). **Só age se `target.movement` não existir**:
  monta `movement.walk` de `speed.value` (ator) ou de `speed` string (race), e `fly/swim/climb/burrow`
  de `speed.fly` etc. quando existirem. Não apaga `speed`.
- `migrateLegacySenses(attributes, details)`: **só age se `attributes.senses` não existir**: faz o parse de
  `details.senses.custom` **e** de cada string em `details.senses.value` com
  `/(darkvision|blindsight|tremorsense|truesight)\s+(\d+)\s*(ft\.?|feet|m)?/gi`
  (sem unidade = ft se o número for múltiplo de 5 e ≥ 10, senão m; documente essa regra num
  comentário). Não remove o texto original.

Em `srd5e.mjs`, dentro de `prepareData(row)`, **antes** do `mergeDefaults(...)` (linha 53), chamar
as duas migrações pro `sd.attributes`/`sd.details` quando existirem. Isso precisa vir antes
porque o `mergeDefaults` criaria `movement` com o default, e aí a migração nunca rodaria.

Por que isso é suficiente: enquanto o usuário não editar, o valor é recalculado do legado a cada
render; quando ele edita `movement.walk` na ficha, `movement` passa a existir no banco e o legado
é ignorado dali em diante.

## Passo 3: deslocamento derivado (`scripts/prepare-data.mjs`)

Criar `prepMovement(sd, items)` e chamar em `prepCharacter` (perto de `prepEncumbrance`,
`prepare-data.mjs:327`) e em `prepNpc` (sem items: NPC não tem raça).

Pra cada modo em `MOVEMENT_TYPES`:
1. **Base**: se o ator tem item `race` e o valor gravado do ator pra esse modo é 0, a base é o
   valor da raça (rodar `migrateLegacyMovement` no `data` da raça antes). Senão, a base é o valor
   gravado do ator. Ou seja, o valor manual diferente de zero vence a raça.
2. **Armadura pesada sem Força** (SRD 5.1): se `sd.attributes.armor?.speedPenalty`, −3 m em
   todos os modos com base > 0 (mínimo 0).
3. **Exhaustion** (SRD 5.1, `resources.exhaustion`): nível ≥ 2 divide todos os modos por 2 (arredondar pra
   baixo); nível ≥ 5 zera todos.
4. **Condições que zeram deslocamento** (grappled, restrained): **não** entram aqui, porque
   `prepareData` é síncrono e não tem acesso às condições do token. Ficam fora deste handout.

Gravar o resultado em `sd.attributes.movement.effective = { walk, fly, swim, climb, burrow }`
(campo derivado, igual `health.effectiveMax` em `prepare-data.mjs:310`, que nunca sobrescreve o
valor gravado).

Sentidos: copiar os valores da raça pra `sd.attributes.senses.effective` com a mesma regra
(o valor manual diferente de zero vence), sem penalidades.

`bonuses.speed` (`schema.mjs:57`) existe no schema de bônus de item mas **nenhum código o soma**
(não aparece em `effects.mjs`). Deixe como está e só mencione no relatório.

## Passo 4: fichas

- `character-sheet.mjs:686` (`_speed`): passar a expor `_movement` com cada modo efetivo > 0,
  formatado `"9 m"`, e o `WALK` do mini-stat (`templates/character-sheet.hbs:90`) mostra
  `effective.walk`. Os outros modos > 0 aparecem como tags ao lado (seguir o estilo `sdrn-tag`
  já usado em `character-sheet.hbs:249`). Quando o efetivo ≠ base (exaustão/armadura), mostrar
  um `title` com o motivo.
- `npc-sheet.mjs:342-347` e `templates/npc-sheet.hbs:94,457+`: os inputs de texto
  `sd:attributes.speed.*` viram inputs `type="number"` em `sd:attributes.movement.<modo>`
  (walk/fly/swim/climb/burrow) e um checkbox `hover`. O mini-stat mostra `effective.walk`.
- Sentidos: nas duas fichas, mostrar `darkvision 36 m` etc. (só os > 0 do efetivo) **antes** das
  tags de `details.senses`. No NPC, adicionar inputs numéricos pros 4 sentidos, no mesmo bloco de
  config onde está o input `sd:details.senses.custom` (`npc-sheet.hbs:308`).
- Item `race` (`scripts/sheet-schemas.mjs:155`): trocar o campo `speed` (text) por 5 campos
  `movement.<modo>` (number) + `senses.darkvision` (number). Os outros sentidos raramente vêm de
  raça, então não precisam.
- Input numérico e debounce: usar o mesmo mecanismo de save que as fichas já usam pros outros
  `sd:` inputs (não criar listener novo).

## Passo 5: compêndio

**Não** regerar os packs com `.dev/build-compendium.mjs`: ele usa `randomUUID()` e trocaria todos
os ids. Escrever um script de migração **in-place** `.dev/migrate-movement-44.mjs` que:

1. `packs/races.json`: pra cada entry, `data.movement` a partir de `data.speed` (usar a mesma
   `parseDistance`, importando de `scripts/prepare-data.mjs` se o import funcionar em Node, senão
   duplicar a função no script com um comentário apontando a origem), e `data.senses.darkvision`
   parseado do texto da raça (`/darkvision.*?(\d+)\s*feet/i` na `description`). Mantém o `id`.
2. `packs/monsters.json`: pra cada entry, localizar o markdown de origem pelo nome
   (a mesma pasta que `buildMonsters()` lê, `.dev/build-compendium.mjs:456-457`), extrair a linha
   `**Speed**` completa e a linha `**Senses**`, e preencher `data.attributes.movement` e
   `data.attributes.senses`. Monstro sem markdown encontrado: listar no console, e cair no
   parse de `data.attributes.speed.value` + `data.details.senses.custom`. Mantém o `id`.
3. Corrigir também o `buildMonsters()`/`buildRaces()` do `.dev/build-compendium.mjs` pra gerarem
   o formato novo (pra builds futuros), sem rodar o build.
4. Converter os dois JSONs pra `.sqlite` com o conversor do motor:
   `node E:\modules\LoomVTT\scripts\build-compendium-pack.mjs packs\races.json` e o mesmo pro
   `monsters.json` (executar a partir do diretório do ruleset).

Relatório do script: quantas entradas migradas, quantas com fallback, e 3 exemplos antes/depois
(Aboleth obrigatório: esperado `walk: 3, swim: 12`, `darkvision: 36`).

## Critério de aceite

- `node --check` sem erro em todo `.mjs` tocado.
- `node .dev/migrate-movement-44.mjs` roda duas vezes seguidas sem mudar nada na segunda
  (idempotente).
- Ao vivo:
  1. Personagem antigo (criado antes, com `speed: '9m'`) abre mostrando WALK 9 m sem ter sido editado.
  2. Personagem com raça Dwarf e `movement.walk` 0 → mostra 8 m (vem da raça).
  3. Marcar exaustão 2 → WALK cai pra metade; exaustão 5 → 0; voltar pra 0 → valor original.
  4. Armadura pesada com Força abaixo do requisito → −3 m.
  5. Importar o Aboleth do compêndio → ficha do NPC mostra walk 3, swim 12, darkvision 36.
  6. NPC antigo com `speed.fly: '18m'` gravado → mostra fly 18 m.

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
`packs/monsters.json` tem 2,1 MB: nunca leia inteiro, use `node -e` com filtro.

## Ao terminar

Criar `.planning/done/` se não existir e mover este arquivo pra
`.planning/done/44-movimento-sentidos-estruturados.md` como último passo, depois do critério de aceite confirmado.
