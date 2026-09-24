# Handout 46: Item `tool`

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende do handout 42 (ícone/rótulo `tool` em `scripts/config.mjs`).

O personagem já tem `proficiencies.tools: []` (`schema.mjs`, case `'character'`), exibido como tags em
`templates/character-sheet.hbs:249`, mas não existe item de ferramenta nem teste de ferramenta.

## Regra (SRD 5.1, Equipment → Tools)

Teste com ferramenta = d20 + modificador da habilidade que o teste usar + bônus de proficiência
se o personagem é proficiente com a ferramenta. A habilidade depende do uso (Thieves' Tools
normalmente DEX); o item guarda uma habilidade padrão, e a caixa de rolagem deixa o jogador
somar bônus situacional.

## Passo 1: declarar o tipo

- `ruleset.json` → `itemTypes`: adicionar `"tool"`.
- `srd5e.mjs:101` (`itemTypes` do `defineSystem`): adicionar `'tool'`. As duas listas precisam ficar iguais.

## Passo 2: schema (`scripts/schema.mjs`, novo `case 'tool'`)

```js
case 'tool':
  return {
    ...defaultBaseItem(),
    // 'artisan' | 'gaming' | 'musical' | 'kit' | 'other'
    toolType: 'artisan',
    // Default ability for checks with this tool.
    ability: 'dex',
    // Flat bonus added to every check with this tool (magic tools, etc).
    bonus: 0,
  };
```

## Passo 3: proficiência e rolagem (`scripts/roll-engine.mjs`)

- Criar `isToolProficient(sd, item)`: verdadeiro se algum valor de `sd.proficiencies.tools`
  bate, sem diferenciar maiúsculas e ignorando espaços nas pontas, com `item.data.identifier` (se não
  vazio) **ou** com `item.name`. As tags já gravadas nas fichas são nomes livres, então o match
  por nome é o que faz o legado funcionar.
- Criar e exportar `rollToolCheck(actor, item)`: monta os `parts` no **mesmo formato** que os
  testes de perícia montam (procure como `sdr5eRoll` é chamado pra skill check e siga o mesmo
  formato de `parts`): modificador da `ability` do item, bônus de proficiência se proficiente
  (`sd.attributes.prof.value`), `bonus` do item. Label: `Tool Check: <nome>`. Passar `actor`
  pra aplicar as condições que o `sdr5eRoll` já aplica (poisoned, frightened etc.) e abrir a caixa
  de rolagem do handout 37.
- `srd5e.mjs` → `useItem`: `case 'tool': await rollToolCheck(actor, item); break;`.
- `scripts/api.mjs`: exportar `rollToolCheck` (listas das linhas 22 e 39).

## Passo 4: fichas

- `character-sheet.mjs:487`: incluir `'tool'` no `_inventory` e nos grupos sempre visíveis;
  `hasQuantity` também vale pra `tool`. Flag nova `isTool` no `byType`, e `proficient` calculado com
  `isToolProficient`.
- `templates/character-sheet.hbs`: pra `tool`, um botão `data-action="roll-tool" data-id="{{id}}"`
  (ícone `fa-screwdriver-wrench`, texto "Check") e um marcador visual de proficiente (reuse o
  estilo de proficiência que a lista de perícias já usa). Sem botão Equip pra ferramenta.
- Handler `'roll-tool'` no switch de `data-action` existente de `character-sheet.mjs`, sem listener novo.
- Proficiência a partir do item: **não** criar toggle no item. A fonte de verdade continua
  sendo `proficiencies.tools` do ator. No item listado, adicionar um botão
  `data-action="toggle-tool-prof"` que adiciona ou remove o nome do item em `proficiencies.tools`
  (mesmo mecanismo de `api.put` que a ficha usa pros outros campos do ator).
- `PHYSICAL_ITEM_TYPES` (`prepare-data.mjs:123`): incluir `'tool'`.

## Passo 5: ficha do item (`scripts/sheet-schemas.mjs`)

`tool` em `ITEM_SHEET_SCHEMAS`: description, toolType (select), ability (select com as 6
habilidades, labels de `ABILITY_LABELS`), bonus (number), quantity, weight, price.

## Passo 6: compêndio

Não existe pack de equipamento comum. **Não criar pack novo** neste handout. Relate no final
se o markdown de origem (`.dev/srd5.2_markdown` / `.dev/srd5.1_legacy_markdown`, pasta Equipment)
tem a tabela de ferramentas, pra virar um pack num handout futuro.

## Critério de aceite

- `node --check` em todo `.mjs` tocado.
- Ao vivo:
  1. Criar ferramenta "Thieves' Tools" na ficha (botão + Add Tools) → aparece em "Tools" com o botão Check.
  2. Personagem sem proficiência, DEX +3 → caixa de rolagem mostra `1d20 + 3`.
  3. Clicar no toggle de proficiência → a tag "Thieves' Tools" aparece em Proficiências → Tools;
     o Check agora mostra `1d20 + 3 + 2` (prof 2).
  4. Personagem antigo que já tinha a tag "thieves' tools" (minúsculas) → a ferramenta criada já
     aparece como proficiente.
  5. Personagem com a condição Poisoned → a caixa já vem com desvantagem.

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
`.planning/done/46-item-tool.md` como último passo, depois do critério de aceite confirmado.
