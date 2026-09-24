# Handout 48: Item `container`

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende dos handouts 42, 45, 46 e 47 (todos os tipos físicos já existem quando este roda).

Hoje não há como guardar item dentro de item: mochila, bolsa de componentes e Bag of Holding
são `item` genérico, e todo o inventário é uma lista plana por tipo.

## Regra (SRD 5.1)

- Container tem capacidade (em peso ou em quantidade de itens).
- Conteúdo conta na carga do personagem, **exceto** em containers extradimensionais
  (Bag of Holding, Handy Haversack), cujo conteúdo não pesa. Só o peso do próprio container conta.

## Modelo

- Todo item físico ganha `container: ''` (id do container que o contém; vazio = raiz do inventário).
- Tipos físicos: `weapon`, `armor`, `item`, `consumable`, `tool`, `loot`, `container`
  (a mesma lista de `PHYSICAL_ITEM_TYPES`, `prepare-data.mjs:123`, depois dos handouts 45–47).
- Container pode estar dentro de container, mas **nunca** dentro de si mesmo nem de um
  descendente próprio (sem ciclo).

## Passo 1: declarar o tipo

- `ruleset.json` → `itemTypes`: adicionar `"container"`.
- `srd5e.mjs:101` (`itemTypes` do `defineSystem`): adicionar `'container'`.

## Passo 2: schema (`scripts/schema.mjs`)

- `defaultBaseItem()`: adicionar `container: ''`. Esse é o único lugar que dá o campo a todos os
  tipos; o `mergeDefaults` faz o backfill nos itens existentes. Ele também cai nos tipos não físicos
  (feature/spell…), o que é inofensivo porque eles nunca são exibidos como conteúdo.
- Novo `case 'container'`:

```js
case 'container':
  return {
    ...defaultBaseItem(),
    // type 'weight' = value in the same unit as item `weight`; type 'items' = max item count. 0 = unlimited.
    capacity: { type: 'weight', value: 0 },
    // Extradimensional storage (Bag of Holding): contents do not count toward encumbrance.
    weightlessContents: false,
  };
```

## Passo 3: helpers (`scripts/prepare-data.mjs` ou arquivo novo `scripts/containers.mjs`)

Exportar funções puras, que recebem a lista de itens do ator:

- `getContents(items, containerId)`: filhos diretos.
- `isDescendant(items, containerId, candidateId)`: detecção de ciclo.
- `containerLoad(items, containerId)`: `{ weight, count }` recursivo (peso × quantidade de cada
  item, e containers aninhados somam o próprio peso + o conteúdo deles).
- Item com `container` apontando pra um id que **não existe** no ator (container apagado fora
  da ficha, ou dado velho) é tratado como raiz. Nunca desaparece da ficha.

## Passo 4: carga (`prepEncumbrance`, `prepare-data.mjs:133`)

Hoje soma todo item físico (`prepare-data.mjs:149-156`). Novo cálculo: soma os itens físicos,
**mas** pula qualquer item cujo ancestral (em qualquer nível) seja um container com
`weightlessContents: true`. O peso do próprio container extradimensional continua contando.

## Passo 5: ficha de personagem

- `character-sheet.mjs:473-489` (`byType` / `_inventory`): os grupos por tipo passam a listar
  **só itens da raiz** (`container` vazio ou órfão). Adicionar `'container'` ao `_inventory` (grupo
  só visível se tiver item, igual loot).
- Cada linha de container mostra o conteúdo aninhado logo abaixo (recuado), com todos os
  botões normais daquele tipo de item, e a carga `12 / 30 lb` ou `5 / 20 items` quando
  `capacity.value > 0` (unidade de peso: siga o que a ficha já mostra na carga). Colapsar e
  expandir por container com `data-action="toggle-container"`; o estado aberto fica em memória na
  instância da ficha (ex.: um `Set` de ids), sem persistir.
- Isso exige renderização recursiva no Handlebars: registrar um partial
  (procure como o ruleset registra templates/partials, `rtk grep -n "registerPartial\|PARTS" scripts`)
  **ou** achatar no `.mjs` numa lista com `depth` e usar um estilo de recuo por `depth`. **Prefira achatar
  com `depth`**: menos acoplamento ao mixin de templates do core.
- Mover item pra dentro de container: botão `data-action="move-to-container"` na linha de
  todo item físico, que abre um `LoomDialog` (já usado em `scripts/roll-dialog.mjs`) com um select:
  "Inventário (raiz)" + cada container do ator que **não** crie ciclo. Gravar `container` no item via
  `PUT /items/:id` (mesmo padrão de `consumeUse`, `roll-engine.mjs:1113`). Arrastar e soltar dentro
  da ficha fica **fora** deste handout.
- Capacidade estourada: permitir e mostrar a carga em vermelho, com toast de aviso ao mover. Não bloquear.
- `hasQuantity` não se aplica a container.

## Passo 6: apagar container

Quando um container é apagado, os filhos diretos voltam pra raiz (`container: ''`), **não** são
apagados. Implementar em dois pontos:
1. Na ação `delete-item` da ficha (procure o handler em `character-sheet.mjs`): antes de apagar
   um container, atualizar os filhos.
2. O passo 3 já trata item órfão como raiz, o que cobre container apagado fora da ficha
   (sidebar, API). Não é preciso listener de socket.

## Passo 7: ficha do item (`scripts/sheet-schemas.mjs`)

`container` em `ITEM_SHEET_SCHEMAS`: description, `capacity.type` (select weight/items),
`capacity.value` (number), weightlessContents (boolean), weight, price, rarity.

## Passo 8: compêndio

Em `packs/magic-items.json`, converter **só** estas entradas de `item` pra `container`,
preservando `id` e campos base: Bag of Holding (capacity 500 weight, weightlessContents true),
Handy Haversack (capacity 120 weight, weightlessContents true), Portable Hole (capacity 0,
weightlessContents true). Confirme os números na descrição de cada uma antes de gravar e
reporte. Script in-place `.dev/migrate-containers-48.mjs` + conversão
`node E:\modules\LoomVTT\scripts\build-compendium-pack.mjs packs\magic-items.json`.

## Critério de aceite

- `node --check` em todo `.mjs` tocado; o script é idempotente.
- Ao vivo:
  1. Criar container "Backpack" (capacity 30 weight) e mover 2 itens pra dentro → somem da raiz e
     aparecem recuados sob a mochila, com a carga `x / 30`.
  2. Com `encumbranceTracking` ligado → peso total igual ao de antes de mover.
  3. Arrastar Bag of Holding do compêndio e mover um item de 20 de peso pra dentro → carga total
     cai 20 e sobe o peso da bolsa.
  4. Tentar mover a mochila pra dentro de um container que está dentro dela → a mochila não aparece
     como opção no select.
  5. Apagar a mochila → os 2 itens voltam pra raiz.
  6. Personagem antigo sem nenhum container → ficha idêntica à de antes.

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
`.planning/done/48-item-container.md` como último passo, depois do critério de aceite confirmado.
