# Handout 45: Item `consumable`

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende do handout 42 (ícone/rótulo `consumable` em `scripts/config.mjs`).

Hoje poção, pergaminho, munição e veneno são itens do tipo `item` genérico. O schema tem um
flag `consumable: false` (`schema.mjs`, case `'item'`) que **nenhum código lê**. Usar uma poção
não faz nada além de postar o card: não cura, não gasta, não some do inventário.

Todas as 239 entradas de `packs/magic-items.json` são `type: 'item'`, `category: 'gear'`,
inclusive as poções.

## Regra (SRD 5.1)

- Poção: bebida (ação), efeito imediato, some depois de usar.
- Pergaminho de magia: conjura a magia e é destruído.
- Munição: gasta 1 por ataque (a integração com ataque de arma **fica fora** deste handout).
- Itens com cargas que não somem (varinha, bastão) **continuam** `item`, com `charges`/`uses`.

## Passo 1: declarar o tipo

- `ruleset.json` → `itemTypes`: adicionar `"consumable"`.
- `srd5e.mjs:101` (`itemTypes` do `defineSystem`): adicionar `'consumable'`.
  As duas listas precisam ficar iguais: o servidor valida pelo `ruleset.json`
  (`E:\modules\LoomVTT\server\applications\api\items.ts:25`), e o cliente usa o `defineSystem`.

## Passo 2: schema (`scripts/schema.mjs`, novo `case 'consumable'`)

```js
case 'consumable':
  return {
    ...defaultBaseItem(),
    // 'potion' | 'scroll' | 'ammo' | 'poison' | 'food' | 'other'
    consumableType: 'potion',
    // Uses per unit. When it reaches 0: quantity -1 and uses refill (if quantity remains),
    // or the item is deleted (if destroyOnEmpty and it was the last unit).
    uses: { value: 1, max: 1, recovery: 'none', recharge: 0 },
    destroyOnEmpty: true,
    healing: { formula: '' },
    damage: { formula: '', type: '' },
    // Scrolls: id/name of the spell cast. Empty = none.
    spell: { name: '', level: 0 },
    bonuses: defaultBonuses(),
  };
```

## Passo 3: usar (`scripts/roll-engine.mjs`)

Criar e exportar `useConsumable(actor, item)`:

1. Se `uses.max > 0`: `consumeUse(actor, item)` (`roll-engine.mjs:1099`), e parar se devolver `false`.
2. `healing.formula` preenchida: `evaluateDamageFormula(formula)` (`roll-engine.mjs:270`, serve
   pra cura também, porque só soma dados) → `applyHeal(actor, total)` (`roll-engine.mjs:475`) + um
   `dispatchRoll` com o total literal, igual `rollWeaponDamage` faz (`roll-engine.mjs:777-783`), pra
   o chat mostrar o mesmo número aplicado.
3. `damage.formula` preenchida (ex.: Alchemist's Fire): mesmo padrão do `rollWeaponDamage`, com
   `meta.srd5eDamage`, pra ganhar o botão Apply Damage.
4. `spell.name` preenchido: procurar um item `spell` com esse nome no ator e chamar `castSpell`;
   se não existir, só postar o card. **Pergaminho não gasta slot**: leia `castSpell` e descubra
   como pular o gasto (o ritual já pula, ver handout 13 em `.dev/handouts/done/13-ritual-casting.md`).
   Se exigir mudar a assinatura de `castSpell`, adicione uma opção `{ free: true }` em vez de mudar os parâmetros existentes.
5. Esgotou (`uses.value` chegou a 0, ou o item não tem `uses`): se `quantity > 1`,
   `quantity - 1` e `uses.value = uses.max`; se `quantity <= 1` e `destroyOnEmpty`, apagar o item
   (`DELETE /items/:id`, pelo mesmo cliente `window.Loom.api` que o arquivo já usa).
6. Postar o card com `postItemToChat` (antes de apagar, porque o card precisa do item).

Em `srd5e.mjs` → `useItem` (`srd5e.mjs:72-86`): `case 'consumable': await useConsumable(actor, item); break;`.
Exportar também em `scripts/api.mjs` (lista das linhas 22 e 39).

## Passo 4: ficha de personagem e de NPC

- `character-sheet.mjs:487` (`_inventory`): incluir `'consumable'` na lista de tipos e no
  filtro de grupos sempre visíveis; `hasQuantity` (`character-sheet.mjs:480`) também vale pra
  `consumable`.
- `templates/character-sheet.hbs:396-399`: pra consumível, um botão
  `data-action="use-consumable" data-id="{{id}}"` ("Use") no lugar dos botões Atk/Dmg, e o
  contador de usos `value/max` quando `max > 1`. Precisa de uma flag nova no `byType`
  (ex.: `isConsumable`).
- Handler: no switch de `data-action` que a ficha já tem (procurar `'roll-attack'` em
  `character-sheet.mjs`), adicionar `'use-consumable'`, que busca o item e chama `useConsumable`. Sem
  listener novo por elemento (regra de delegação do projeto).
- `toggle-equip` não faz sentido pra consumível: esconder o botão Equip nesse tipo.
- NPC: verificar como `npc-sheet.mjs` lista itens (linha 285) e, se lista itens de inventário,
  aplicar o mesmo botão. Se o NPC não tem inventário, não mexer e dizer isso no relatório.
- Carga: `PHYSICAL_ITEM_TYPES` (`prepare-data.mjs:123`) passa a incluir `'consumable'`.

## Passo 5: ficha do item (`scripts/sheet-schemas.mjs`)

Adicionar `consumable` em `ITEM_SHEET_SCHEMAS`, seguindo o formato dos outros:
description, consumableType (select com as 6 opções), quantity, weight, rarity, `uses.value`,
`uses.max`, destroyOnEmpty (boolean), `healing.formula`, `damage.formula`, `damage.type`
(select com `DAMAGE_TYPES` de `config.mjs`), `spell.name`, `spell.level`.

## Passo 6: compêndio (`packs/magic-items.json`)

Script in-place `.dev/migrate-consumables-45.mjs` que **preserva os ids** (não usar
`.dev/build-compendium.mjs`, que regera ids):

1. A descrição no pack **não tem** a linha de categoria. Ela está no markdown de origem que
   `buildMagicItems()` lê (`.dev/build-compendium.mjs:395-396`, pasta `Treasure`). Pra cada
   entry, achar o markdown pelo nome e ler a linha de categoria (a linha em itálico logo abaixo do
   título, ex.: `*Potion, uncommon*`).
2. Categoria `Potion` → `consumableType: 'potion'`; `Scroll` (inclui Spell Scroll) → `'scroll'`;
   nome contendo `Ammunition`, `Arrow` ou `Bolt` → `'ammo'`. Todo o resto continua `item`.
3. Pra cada convertida: `type: 'consumable'`, `data` = default do consumable com os campos
   base preservados (name, description, weight, rarity, price, attunement, source). Poções de
   cura (Potion of Healing / Greater / Superior / Supreme): preencher `healing.formula` com a
   fórmula da descrição (`2d4 + 2`, `4d4 + 4`, `8d4 + 8`, `10d4 + 20`).
4. **Rodar primeiro com `--dry-run`**, que só lista nome → tipo novo, e incluir essa lista no relatório.
5. Converter pra `.sqlite`: `node E:\modules\LoomVTT\scripts\build-compendium-pack.mjs packs\magic-items.json`.

## Critério de aceite

- `node --check` em todo `.mjs` tocado; script idempotente (2ª execução não muda nada).
- Ao vivo:
  1. Arrastar Potion of Healing do compêndio pra ficha → aparece em "Consumables" com botão Use.
  2. Personagem com PV 5/20, quantidade 2 → Use → PV sobe, chat mostra o total, quantidade vai pra 1.
  3. Use de novo → o item some do inventário.
  4. Consumível criado à mão com `damage.formula: 1d4`, `damage.type: fire` → Use mostra o card com Apply Damage.
  5. Personagem com `item` antigo com `consumable: true` → continua como `item`, sem erro.

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
`packs/magic-items.json` tem 290 KB: filtre com `node -e`, não leia inteiro.

## Ao terminar

Criar `.planning/done/` se não existir e mover este arquivo pra
`.planning/done/45-item-consumable.md` como último passo, depois do critério de aceite confirmado.
