# Handout 54: Restaurar `scripts/prepare-data.mjs` (revertido parcialmente no 53)

Diretório: `E:\LoomVTT\marketplace\rulesets\srd5e`. **Urgente: hoje o ruleset não carrega.**

## O que aconteceu

Durante o handout 53, `scripts/prepare-data.mjs` voltou a uma versão antiga em alguns trechos:
- **Import (linha 12)** perdeu `MOVEMENT_TYPES, SENSE_TYPES, feetToMeters`, que ainda são usados
  (`parseDistance`, `migrateLegacySenses`, `prepMovement`), e os imports de `getDefaultData`/`mergeDefaults`.
- **Sumiram 3 exports** que outros arquivos importam, e isso quebra o carregamento dos módulos:
  `prepareActorRow` (`srd5e.mjs:21`), `fetchPreparedActor` (`rest.mjs`, `group-sheet.mjs`, `encounter-sheet.mjs`),
  `computeCarriedWeight` (`character-sheet.mjs:17`).
- **`prepEncumbrance`** perdeu o filtro de conteúdo sem peso (Bag of Holding).

**Não mexa em mais nada no arquivo.** Não reescreva o arquivo inteiro: use edição pontual.

## 1. Import (linha 12-13), deve ficar assim

```js
import { ABILITY_KEYS, SPELL_SLOT_TABLE, SIZE_CARRY_MULTIPLIER, MOVEMENT_TYPES, SENSE_TYPES, feetToMeters } from './config.mjs';
import { getSetting } from './settings.mjs';
import { getDefaultData } from './schema.mjs';
import { mergeDefaults } from './utils.mjs';
```

## 2. Adicionar logo depois da constante `PHYSICAL_ITEM_TYPES`

```js
// Total carried weight of physical items. Items anywhere inside an extradimensional
// container (weightlessContents: true, e.g. Bag of Holding) don't count; the
// container's own weight does. Shared by prepEncumbrance and the sheet's carrying display.
export function computeCarriedWeight(items) {
  const map = new Map((items || []).map((it) => [it.id, it]));
  function isInsideWeightless(item) {
    let cid = (item.system || item.data || {}).container;
    const seen = new Set();
    while (cid && !seen.has(cid)) {
      seen.add(cid);
      const cont = map.get(cid);
      if (!cont) break;
      const cdata = cont.system || cont.data || {};
      if (cdata.weightlessContents) return true;
      cid = cdata.container;
    }
    return false;
  }
  return (items || [])
    .filter((i) => PHYSICAL_ITEM_TYPES.includes(i.type))
    .filter((i) => !isInsideWeightless(i))
    .reduce((sum, i) => {
      const idata = i.system || i.data || {};
      const w = Number(idata.weight) || 0;
      const qty = Number(idata.quantity) || 1;
      return sum + w * qty;
    }, 0);
}
```

## 3. `prepEncumbrance`

Troque o bloco `const weight = (items || []).filter(...).reduce(...)` por:

```js
  const weight = computeCarriedWeight(items);
```

## 4. Adicionar no fim do arquivo

```js
// Full derived-data pass for one actor row (the ruleset's `prepareData` hook).
// Legacy migration must run BEFORE mergeDefaults creates defaults, otherwise the
// existence check (target.movement) would see the default and never migrate.
export function prepareActorRow(row) {
  const sd = row?.systemData;
  if (!sd) return row;
  if (sd.attributes) {
    migrateLegacyMovement(sd.attributes, row.type);
    migrateLegacySenses(sd.attributes, sd.details);
  }
  mergeDefaults(sd, getDefaultData(row.type));
  if (row.type === 'vehicle') {
    sd.attributes.da = { value: sd.attributes?.ac ?? 10, base: sd.attributes?.ac ?? 10, magic: 0, bonus: 0 };
    sd.attributes.hp = sd.resources?.health;
    return row;
  }
  if (!sd.abilities) return row;
  if (row.type === 'npc') prepNpc(sd);
  else prepCharacter(sd, row.items || []);
  return row;
}

// Fetches an actor WITH its embedded items (the API only includes them with
// ?populate=true) and runs the derived-data pass on a clone.
export async function fetchPreparedActor(id) {
  const { api } = await import('/_loom/sdk/index.js');
  const raw = await api.get(`/actors/${id}?populate=true`);
  if (!raw) return null;
  const row = JSON.parse(JSON.stringify(raw));
  row.items = raw.items || [];
  return prepareActorRow(row);
}
```

## 4b. Chamadas de `prepMovement` perdidas

A função `prepMovement` existe, mas ninguém a chama mais. Recolocar:
- em `prepCharacter`, logo depois de `prepEncumbrance(sd, items);`: `prepMovement(sd, items);`
- no fim de `prepNpc` (depois do loop de saves): `prepMovement(sd, null);`

## 5. Resto do 53 que não foi feito

- `scripts/character-sheet.mjs:785`: apagar o bloco `_sensesList: (() => { ... })(),`.
- `scripts/rest.mjs:11`: o **primeiro** fetch ainda está sem `?populate=true`; adicionar.

## Aceite

1. Checagem de exports (precisa listar os 3 nomes):
   `rtk grep -n "^export function computeCarriedWeight\|^export function prepareActorRow\|^export async function fetchPreparedActor" scripts/prepare-data.mjs`
2. Checagem de imports: todo nome importado de `./prepare-data.mjs` em qualquer arquivo precisa existir como export:
   `rtk grep -rn "prepare-data.mjs'" scripts srd5e.mjs`, e confira cada nome contra o passo 1.
3. `node --check scripts/prepare-data.mjs`.
4. Ao vivo: o mundo com srd5e carrega sem erro no console; a ficha de personagem abre; Bag of Holding com
   item de 20 de peso dentro não soma os 20 na carga.

## Ao terminar

Mover este arquivo pra `.planning/done/54-restaurar-prepare-data.md`.
