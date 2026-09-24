# Handout 47: Item `loot`

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende do handout 42 (ícone/rótulo `loot` em `scripts/config.mjs`).

Tesouro sem uso mecânico (gemas, obras de arte, mercadorias) hoje vira `item` genérico, e se
mistura com equipamento de aventura na mesma lista. Este é o menor dos tipos novos: só dado e
exibição, sem ação.

## Passo 1: declarar o tipo

- `ruleset.json` → `itemTypes`: adicionar `"loot"`.
- `srd5e.mjs:101` (`itemTypes` do `defineSystem`): adicionar `'loot'`. As duas listas precisam ficar iguais.
- `srd5e.mjs` → `useItem`: não precisa de case; o `default` já posta o card.

## Passo 2: schema (`scripts/schema.mjs`, novo `case 'loot'`)

```js
case 'loot':
  return {
    ...defaultBaseItem(),
    // 'gem' | 'art' | 'tradegood' | 'junk' | 'other'
    lootType: 'gem',
  };
```

`price`, `weight` e `quantity` já vêm do `defaultBaseItem()`.

## Passo 3: ficha de personagem

- `character-sheet.mjs:487`: incluir `'loot'` no `_inventory`. Diferente de
  weapon/armor/item, o grupo Loot **só aparece se tiver item**, então fica fora da lista de grupos
  sempre visíveis (`character-sheet.mjs:489`). O botão "+ Add Loot" também só aparece quando o
  grupo aparece; isso é aceitável, porque loot normalmente chega por drop do compêndio ou do mestre.
- `hasQuantity` vale pra `loot`. Sem botão Equip pra loot.
- No título do grupo Loot, mostrar o **valor total** (soma de `price.gp + price.sp/10 + price.cp/100`
  × quantidade, formatado em gp com até 2 casas). Calcule no `.mjs` e exponha como campo do grupo;
  sem lógica no template.
- `PHYSICAL_ITEM_TYPES` (`prepare-data.mjs:123`): incluir `'loot'`.

## Passo 4: ficha do item (`scripts/sheet-schemas.mjs`)

`loot` em `ITEM_SHEET_SCHEMAS`: description, lootType (select), quantity, weight, `price.gp`,
`price.sp`, `price.cp`, rarity.

## Critério de aceite

- `node --check` em todo `.mjs` tocado.
- Ao vivo:
  1. Personagem sem loot → nenhum grupo "Loot" na aba de inventário.
  2. Arrastar/criar um loot "Ruby" 1000 gp, quantidade 2, via sidebar de itens → grupo "Loot"
     aparece, título mostra 2000 gp.
  3. Com a carga ligada (setting `encumbranceTracking`), o peso do loot entra no total.

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

Criar `.planning/done/` se não existir e mover este arquivo pra
`.planning/done/47-item-loot.md` como último passo, depois do critério de aceite confirmado.
