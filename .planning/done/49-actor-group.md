# Handout 49: Ator `group` (grupo de aventureiros)

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende do handout 42 (`ACTOR_TYPE_LABEL` em `scripts/config.mjs`).

Não existe hoje como agrupar os PJs. O mestre divide XP e moedas na mão, ficha por ficha, e manda
cada jogador descansar separadamente. O handout 51 (`encounter`) depende deste: a dificuldade
do encontro é calculada contra o grupo principal.

## O que o motor já oferece (confirmado, não precisa mexer no LoomVTT)

- Tipo de ator novo: basta declarar no `ruleset.json` (o servidor valida por ele,
  `E:\modules\LoomVTT\server\applications\api\actors.ts:28-47`) e no `defineSystem`.
- Ficha por tipo: `sheets.catalog('actor', '<tipo>', Classe)` (ver `srd5e.mjs:350-352`).
- Arrastar ator da sidebar: o payload em `text/plain` é JSON
  `{ type: 'Actor', id, uuid: 'Actor.<id>' }` (`E:\modules\LoomVTT\client\screens\game-hud\sidebar.ts:498-504`).
- `prepareData` (`srd5e.mjs:47-59`) já pula atores sem `abilities`, então group não passa por prep de personagem.

## Passo 1: declarar o tipo

- `ruleset.json` → `actorTypes`: `["character", "npc", "group"]`.
- `srd5e.mjs:100` (`actorTypes` do `defineSystem`): adicionar `'group'`.
- `srd5e.mjs` (fim do arquivo): `sheets.catalog('actor', 'group', Sdr5eGroupSheet);`.

## Passo 2: schema (`scripts/schema.mjs`, novo `case 'group'`)

```js
case 'group':
  return {
    // World actor ids (character or npc). Order = display order.
    members: [],
    description: '',
    // Shared party funds, not split until the GM awards them.
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  };
```

## Passo 3: grupo principal (setting)

Em `scripts/settings.mjs` (array `SDR5E_SETTINGS`) **e** em `ruleset.json` → `settings`
(as duas listas existem hoje; mantenha as duas em sincronia, seguindo o padrão das entradas atuais):
`primaryParty`, `scope: 'world'`, tipo string, default `''`, nome "Grupo Principal", hint
"Ator do tipo Grupo usado como referência de dificuldade de encontros." Não precisa aparecer
como select na tela de configurações: o valor é gravado pelo botão do passo 5.
Leia como `getSetting` é implementado (`rtk grep -n "export function getSetting" scripts`) e use o
setter correspondente. Se não existir setter exportado, criar `setSetting` no mesmo módulo,
usando a mesma API do core que `getSetting` usa.

## Passo 4: rest compartilhado (refatoração pequena, obrigatória antes da ficha)

`_takeRest(kind)` é um **método** da ficha de personagem (`character-sheet.mjs:1120`) e usa
`this.document`, `this._promptHitDiceToSpend` e `this._reloadDocument`. Pra o grupo reutilizar:

- Extrair o corpo pra uma função exportada `takeRest(actor, kind, { promptHitDice })` num
  arquivo novo `scripts/rest.mjs`. `promptHitDice` é um callback opcional
  `(available) => Promise<number>`; sem callback, o descanso curto não gasta Hit Dice.
  No lugar de `_reloadDocument`, buscar o ator de novo com `window.Loom.api.get('/actors/<id>')`
  entre os gastos.
- `character-sheet.mjs` → `_takeRest(kind)` passa a só chamar `takeRest(this.document, kind, { promptHitDice: (n) => this._promptHitDiceToSpend(n) })`
  e depois `this._reloadDocument()`. O comportamento da ficha de personagem **não muda**.
- Rodar o critério de aceite 6 antes de continuar.

## Passo 5: ficha (`scripts/group-sheet.mjs` + `templates/group-sheet.hbs`, novos)

Estrutura: seguir `scripts/npc-sheet.mjs:14-40` (mesma base `LoomHandlebarsMixin(LoomActorSheet)`,
mesmo padrão de construtor/`PARTS`, classes CSS `sdrn-sheet sdrn-group-sheet`).

Conteúdo:
- **Membros**: pra cada id em `members`, buscar o ator (`window.Loom.api.get('/actors/<id>')`,
  em paralelo) e mostrar retrato, nome, nível (`details.level` do personagem ou `CR` do NPC), PV
  `value/max`, CA (`attributes.da.value`), Percepção passiva (`10 + skills.perception.total`).
  Ator que não existe mais (apagado): mostrar a linha "Membro removido" com botão pra tirar do
  grupo. Não remover automaticamente.
- Clique no nome abre a ficha do membro (procurar como o ruleset abre ficha de outro documento,
  ex.: `windowManager` importado em `npc-sheet.mjs:14`).
- **Drop**: aceitar `{ type: 'Actor' }` do tipo `character` ou `npc`, sem duplicata e sem o próprio grupo.
  Rejeitar outros tipos com toast. Registrar o listener de `drop` do mesmo jeito que
  `npc-sheet.mjs:136-141` faz (um listener, guardado por flag).
- **Ações** (todas pelo switch de `data-action` delegado na raiz, sem listener por elemento):
  - `remove-member`
  - `short-rest-all` / `long-rest-all`: `takeRest(membro, kind)` pra cada membro `character`, sem
    prompt de Hit Dice no descanso curto, e uma mensagem de chat única resumindo.
  - `award`: `LoomDialog` com XP e moedas (pp/gp/ep/sp/cp) a dividir. Divide igualmente entre os
    membros `character` (arredondando pra baixo; o resto fica no `currency` do grupo), soma em
    `details.xp.value` e `details.<moeda>.value` de cada um, e posta uma mensagem de chat com a divisão.
    Checkbox "tirar do cofre do grupo" que desconta de `currency` do grupo em vez de criar dinheiro novo.
  - `set-primary-party`: grava o id deste grupo no setting `primaryParty`. A ficha mostra um
    selo "Grupo Principal" quando é o grupo principal.
- **Cofre**: inputs de `currency.*` editáveis (mesmo mecanismo `sd:` das outras fichas).
- **Descrição**: textarea `description`.
- CSS: acrescentar em `styles/srd5e.css` reaproveitando as classes `sdrn-*` existentes
  (`sdrn-box`, `sdrn-box-title`, `sdrn-item-row`), e só criar classe nova quando nada existente servir.

## Passo 6: criação

Confirmar que o diálogo "novo ator" do core oferece o tipo `group`
(`E:\modules\LoomVTT\client\screens\game-hud\sidebar.ts:3244-3267` lista `actorTypes`) e mostra
o rótulo legível. Se o rótulo sair cru ("group"), ver de onde o `typeLabel` do core lê e registrar
o rótulo pelo caminho que ele espera (lang file `lang/en.json`/`lang/pt-BR.json` ou equivalente).
**Não** editar o core.

## Critério de aceite

- `node --check` em todo `.mjs` tocado.
- Ao vivo:
  1. Criar ator "A Companhia", tipo Group → abre a ficha de grupo.
  2. Arrastar 3 personagens e 1 NPC da sidebar → 4 linhas com PV/CA/percepção passiva corretos;
     arrastar o mesmo personagem de novo → toast, sem duplicar.
  3. Award 300 XP + 10 gp → cada um dos 3 personagens ganha 100 XP e 3 gp; o grupo fica com 1 gp;
     o NPC não recebe nada; o chat mostra a divisão.
  4. Long rest all → os 3 personagens com PV cheio e slots recuperados, como no botão da ficha individual.
  5. Set primary party → selo aparece; o setting `primaryParty` tem o id.
  6. **Regressão**: descanso curto e longo pela ficha de personagem continuam idênticos (prompt de Hit Dice, cura, recuperação).
  7. Apagar um membro na sidebar → a ficha do grupo mostra "Membro removido", sem erro no console.

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
`styles/srd5e.css` tem 16 mil linhas: nunca leia inteiro, busque a classe.

## Ao terminar

Criar `.planning/done/` se não existir e mover este arquivo pra
`.planning/done/49-actor-group.md` como último passo, depois do critério de aceite confirmado.
