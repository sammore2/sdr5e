# Handout 42: Config completo (tipos, condições, movimento/sentidos)

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e` (ruleset nativo do LoomVTT,
Vanilla JS `.mjs` + Handlebars). Leia `.planning/00-INDICE.md` antes (regras gerais).

`scripts/config.mjs` é o módulo de constantes puras (sem imports) do ruleset. Hoje ele está
incompleto em três pontos, que este handout fecha. **Não há mudança de comportamento aqui**:
é fundação pros handouts 43–51.

## Achados

1. `ITEM_TYPE_ICON` e `ITEM_TYPE_LABEL` (`scripts/config.mjs:52-53`) só cobrem 5 dos 11 tipos
   (weapon/armor/feature/item/language). Race/class/subclass/background/feat/spell caem no
   fallback `'📦'` (`character-sheet.mjs:478`, `item-sheet.mjs:189`) ou `'⭐'` (`npc-sheet.mjs:285`).
2. `roll-engine.mjs:1064` tem uma função local `ITEM_TYPE_SINGULAR_LABEL(type)` que só
   capitaliza o id do tipo, duplicando `ITEM_TYPE_SINGULAR` (`config.mjs:59`), que já existe e é correto.
3. A lista de condições SRD (`SRD_CONDITIONS`) vive no entry point `srd5e.mjs:117-132`, e não no
   config. Os handouts seguintes precisam importá-la.

## Passo 1: `scripts/config.mjs`, completar tipos

Substituir `ITEM_TYPE_ICON` e `ITEM_TYPE_LABEL` (linhas 52-53) por versões que cubram **todos**
os tipos atuais **e** os 4 tipos de item que os handouts 45-48 vão criar:

| tipo | ícone | label (plural) | singular (já existe em ITEM_TYPE_SINGULAR? adicionar se não) |
|---|---|---|---|
| weapon | 🗡️ | Weapons | Weapon |
| armor | 🛡️ | Armor | Armor |
| feature | ⭐ | Features | Feature |
| item | 🎒 | Items | Item |
| language | 🗣️ | Languages | Language |
| race | 🧬 | Races | Race |
| class | 📜 | Classes | Class |
| subclass | 📜 | Subclasses | Subclass |
| background | 🏛️ | Backgrounds | Background |
| feat | 🎖️ | Feats | Feat |
| spell | ✨ | Spells | Spell |
| consumable | 🧪 | Consumables | Consumable |
| tool | 🔧 | Tools | Tool |
| loot | 💰 | Loot | Loot |
| container | 🧰 | Containers | Container |

Adicionar também uma constante nova, `ACTOR_TYPE_LABEL`:
`{ character: 'Character', npc: 'NPC', group: 'Group', vehicle: 'Vehicle', encounter: 'Encounter' }`.

**Não** declarar os tipos novos em `ruleset.json` nem no `defineSystem` aqui. Cada handout
declara o próprio tipo, porque um tipo declarado sem ficha registrada abre a ficha genérica do core.

## Passo 2: `scripts/roll-engine.mjs`, remover a duplicata

- Apagar a função `ITEM_TYPE_SINGULAR_LABEL` (`roll-engine.mjs:1064-1066`).
- No uso (`roll-engine.mjs:1038`), trocar por `ITEM_TYPE_SINGULAR[item.type] || 'Item'`, com
  import de `ITEM_TYPE_SINGULAR` de `./config.mjs` (conferir o bloco de imports no topo do arquivo;
  se já importa algo de `./config.mjs`, estender aquele import).

## Passo 3: condições pro config

- Mover o array `SRD_CONDITIONS` de `srd5e.mjs:117-129` pra `scripts/config.mjs`, exportado como
  `CONDITIONS` (mesmo conteúdo, mesma ordem, inclusive `cover-half` e `cover-3q`).
- Em `srd5e.mjs`, importar `CONDITIONS` de `./scripts/config.mjs` e usar no loop de registro
  (`srd5e.mjs:130-132`). O comentário acima do array fica no config, junto com o array.

## Passo 4: constantes de movimento e sentidos (consumidas pelo handout 44)

Adicionar a `scripts/config.mjs`:

```js
// Movement modes, in display order. Values on actors/races are numbers in meters.
export const MOVEMENT_TYPES = ['walk', 'fly', 'swim', 'climb', 'burrow'];
export const MOVEMENT_LABELS = { walk: 'Walk', fly: 'Fly', swim: 'Swim', climb: 'Climb', burrow: 'Burrow' };

// Special senses with a range, in meters. 0 = does not have the sense.
export const SENSE_TYPES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];
export const SENSE_LABELS = { darkvision: 'Darkvision', blindsight: 'Blindsight', tremorsense: 'Tremorsense', truesight: 'Truesight' };

// The ruleset's distance unit. Conversion used by the compendium build (.dev/build-compendium.mjs
// `feetToLoom`): meters = round(feet * 0.3), so 30 ft -> 9 m, 120 ft -> 36 m.
export const DISTANCE_UNIT = 'm';
export const feetToMeters = (ft) => Math.round((Number(ft) || 0) * 0.3);
```

Atenção: `config.mjs` diz no cabeçalho "Pure data, no imports". `feetToMeters` é uma função
pura sem import, então pode ficar.

## Critério de aceite

- `node --check` sem erro em `scripts/config.mjs`, `scripts/roll-engine.mjs`, `srd5e.mjs`.
- `rtk grep -n "ITEM_TYPE_SINGULAR_LABEL" .` → zero resultados.
- `rtk grep -n "SRD_CONDITIONS" .` → zero resultados.
- Teste ao vivo (LoomVTT rodando, mundo com srd5e): abrir ficha de personagem com raça/classe →
  o ícone do card da raça/classe no inventário/lista não é mais `📦`. Postar uma arma no chat → o
  subtítulo do card continua "Weapon". Os marcadores de condição (Charmed…Three-Quarters Cover)
  continuam aparecendo no HUD de status do token.

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

Criar `.planning/done/` se não existir e mover este arquivo pra `.planning/done/42-config-completo.md`
como último passo, depois do critério de aceite confirmado.
