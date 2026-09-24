# Handout 43: Nível de subclasse por classe

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende do handout 42.

O conteúdo de classes do compêndio (`packs/classes.json`) é **SRD 5.1**: a tabela do Cleric
mostra "Spellcasting, Divine Domain" no 1º nível, e as subclasses são as 12 do 5.1 (Life Domain,
Circle of the Land, The Fiend, Draconic Bloodline, School of Evocation…). As regras de exaustão
do ruleset também são 5.1 (`prepare-data.mjs:303`, "nível 4 HP pela metade").

## Achado

`SUBCLASS_LEVEL = 3` (`scripts/config.mjs:165`) é fixo pra todas as classes, com o comentário
"mesmo nível nas demais classes deste SRD". Isso vale no 5.2, mas **não no 5.1**, que é o
conteúdo carregado. No 5.1:

| Classe | Nível da subclasse | Nome no SRD 5.1 |
|---|---|---|
| cleric | 1 | Divine Domain |
| sorcerer | 1 | Sorcerous Origin |
| warlock | 1 | Otherworldly Patron |
| druid | 2 | Druid Circle |
| wizard | 2 | Arcane Tradition |
| barbarian, bard, fighter, monk, paladin, ranger, rogue | 3 | — |

Antes de codar, **confirme cada linha** contra a tabela de classe em `packs/classes.json`
(procurar a coluna "Features" de cada classe) e registre no seu relatório se alguma divergir.

Consequência hoje: Clérigo, Feiticeiro e Bruxo nunca recebem o passo de subclasse (o level-up
só dispara com `nextClassLevel === 3`, e no nível 3 eles já deveriam ter). Druida e Mago
recebem no nível errado.

## Passo 1: `scripts/config.mjs`

Substituir `SUBCLASS_LEVEL` (linha 165 e o comentário acima) por:

```js
// SRD 5.1 class tables: the level at which each class picks its subclass.
// Keyed by `classIdentifier` (see CLASS_IDENTIFIER_LABELS). Classes not listed
// (including 'none'/homebrew) fall back to SUBCLASS_LEVEL_DEFAULT.
export const SUBCLASS_LEVEL_BY_CLASS = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };
export const SUBCLASS_LEVEL_DEFAULT = 3;
export const subclassLevelFor = (classIdentifier) => SUBCLASS_LEVEL_BY_CLASS[classIdentifier] ?? SUBCLASS_LEVEL_DEFAULT;
```

Remover o export `SUBCLASS_LEVEL`. Depois, `rtk grep -n "SUBCLASS_LEVEL\b" .` deve apontar só
pro `level-up-wizard.mjs`, que o passo 2 corrige.

## Passo 2: `scripts/level-up-wizard.mjs`

- Import (linha 20): trocar `SUBCLASS_LEVEL` por `subclassLevelFor`.
- Linha 119: trocar
  `const showSubclass = nextClassLevel === SUBCLASS_LEVEL && !idata?.subclassName;`
  por uma condição `>=`:
  `const showSubclass = nextClassLevel >= subclassLevelFor(classIdentifier) && !idata?.subclassName;`
  O `>=` é intencional: é a rede de segurança pra personagens que já passaram do nível sem
  escolher (ex.: Clérigo nível 3 criado antes desta correção ganha o passo no próximo level-up).
  `classIdentifier` já existe na linha 109.

## Passo 3: `scripts/character-wizard.mjs`, subclasse na criação quando é nível 1

Hoje os passos são identity → race → class → abilities → review (`STEPS`, e as flags em
`character-wizard.mjs:73-77`). Pra classes com `subclassLevelFor(...) === 1`:

- Adicionar um passo `subclass` entre `class` e `abilities`, que só aparece quando a classe
  escolhida tem `subclassLevelFor(classIdentifier) === 1`. `classIdentifier` vem do item de
  classe escolhido (`compendiumData`), no mesmo lugar em que o wizard já lê `hitDie`/`casterType`.
- **Não duplicar** a busca de subclasses: o `level-up-wizard.mjs` já busca subclasses no
  compêndio pro passo `subclass` dele. Localize essa função (`rtk grep -n "subclass" scripts/level-up-wizard.mjs`)
  e, se ela for um método da classe, extraia a parte de busca pra uma função exportada
  reutilizável (no próprio `level-up-wizard.mjs` ou em `scripts/utils.mjs`), chamada pelos dois wizards.
- Filtrar subclasses por `classIdentifier` da subclasse (schema `subclass.classIdentifier`,
  `schema.mjs`) igual ao classIdentifier da classe escolhida.
- Ao finalizar a criação, gravar o item de subclasse no ator **e** preencher
  `subclassName` no item de classe. Use o mesmo formato que o level-up já grava; leia como o
  level-up finaliza o passo `subclass` e replique o resultado, não a UI.
- Se a classe não tem `classIdentifier` (homebrew, `'none'`), o passo não aparece.

## Critério de aceite

- `node --check` sem erro em `scripts/config.mjs`, `scripts/level-up-wizard.mjs`,
  `scripts/character-wizard.mjs` (e `scripts/utils.mjs` se tocado).
- Ao vivo:
  1. Criar personagem Cleric → o wizard mostra o passo de subclasse com Life Domain; ao
     concluir, o ator tem o item de subclasse e o item de classe mostra a subclasse.
  2. Criar Fighter → sem passo de subclasse na criação; level-up 1→2 sem passo; 2→3 com passo.
  3. Wizard nível 1 → level-up 1→2 mostra o passo de subclasse (School of Evocation).
  4. Criar Cleric, pular/cancelar a subclasse por algum caminho que o wizard permita (se não
     permitir, pule este item) → o próximo level-up mostra o passo.

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
`.planning/done/43-subclass-nivel-por-classe.md` como último passo, depois do critério de aceite confirmado.
