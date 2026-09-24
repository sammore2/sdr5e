# Handout 51: Ator `encounter` (encontro preparado)

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende do handout 49 (ator `group`, setting `primaryParty`, helper de payload de drop).

Encounter é um ator que representa **um conjunto de inimigos preparado pelo mestre antes da
sessão**: lista de NPCs com quantidade (fixa ou fórmula), XP total, dificuldade contra o grupo
principal e um botão que coloca todos na cena.

## Regras

- **XP**: soma de `details.xp.value` de cada NPC × quantidade. O pack `packs/monsters.json` tem XP
  em 315 das 318 entradas (as 3 sem XP são CR 0 ou página de regra, o que está correto).
- **Dificuldade** (SRD 5.2, `.dev/srd5.2_markdown/gameplay-toolbox.md:824-830+`, "XP Budget per
  Character"): orçamento = valor da tabela pro nível × número de personagens. Classificação: XP do
  encontro ≤ orçamento Low → **Low**; ≤ Moderate → **Moderate**; ≤ High → **High**; acima → **Beyond High**.
  Copie a tabela inteira (níveis 1–20 × Low/Moderate/High) do markdown pra `scripts/config.mjs`
  como `ENCOUNTER_XP_BUDGET` e confira contra os exemplos da mesma página (linhas 967, 973, 977:
  nível 1 Low = 50, nível 3 Moderate = 225, nível 15 High = 7800).
  A tabela 5.2 é usada porque o SRD 5.1 não tem regra de montagem de encontro; está sob CC-BY-4.0,
  a mesma licença do conteúdo do ruleset.
- **Nível do grupo**: média dos `details.level` dos membros `character` do grupo principal,
  arredondada pra baixo. **Número de personagens**: quantos `character` o grupo tem. NPC membro do grupo não conta.

## Passo 1: declarar o tipo

- `ruleset.json` → `actorTypes`: adicionar `"encounter"`. `srd5e.mjs:100`: adicionar `'encounter'`.
- `srd5e.mjs`: `sheets.catalog('actor', 'encounter', Sdr5eEncounterSheet);`.

## Passo 2: schema (`scripts/schema.mjs`, novo `case 'encounter'`)

```js
case 'encounter':
  return {
    // actorId: world npc actor id. quantity.formula (e.g. "1d4+1") is rolled by "Roll quantities"
    // and replaces quantity.value; an empty formula keeps the fixed value.
    members: [],   // [{ actorId: '', quantity: { value: 1, formula: '' } }]
    description: '',
  };
```

## Passo 3: ficha (`scripts/encounter-sheet.mjs` + `templates/encounter-sheet.hbs`, novos)

Mesma base/padrão da ficha de grupo (handout 49). Conteúdo:

- **Membros**: retrato, nome, CR, XP unitário, input `quantity.value` (number) e input
  `quantity.formula` (texto), XP da linha, botão remover. NPC apagado → linha "Membro removido".
- **Drop**: só `{ type: 'Actor' }` com `type === 'npc'`. Personagem ou grupo → toast "Só NPCs
  entram em encontros". NPC que já está na lista → `quantity.value + 1` em vez de duplicar a linha.
  NPC arrastado **do compêndio** (payload diferente do da sidebar; logue o payload recebido e compare)
  → toast pedindo pra importar o NPC pro mundo antes. Importar automático fica fora deste handout.
  Reusar o helper de leitura de payload criado nos handouts 49/50.
- **Resumo**: XP total, e dificuldade contra o grupo principal (`primaryParty`) com o orçamento de
  cada faixa visível (`Low 400 · Moderate 600 · High 900`). Sem grupo principal definido → texto
  "Defina um Grupo Principal pra ver a dificuldade".
- **Ações** (switch de `data-action` delegado):
  - `roll-quantities`: pra cada membro com `formula`, rolar com `evaluateDamageFormula`
    (`roll-engine.mjs:270`, que serve pra qualquer fórmula aditiva) e gravar em `quantity.value`
    (mínimo 1). Mensagem de chat **whisper pro mestre** (veja como `sdr5eRoll`/`dispatchRoll` usam
    `mode: 'gmroll'`) com o resultado. Encontro é segredo do mestre.
  - `place-on-stage`: ver passo 4.
  - `remove-member`.

## Passo 4: colocar na cena

**Não** usar o drop no canvas: o core, ao soltar um ator no mapa
(`E:\modules\LoomVTT\client\canvas\canvas-manager.ts:6896-6910` → evento `canvas-actor-drop`,
tratado em `client/screens/game-hud/game-hud.ts`), cria um token do **próprio** ator encounter, e mexer
nisso é mudança no motor. Em vez disso, um botão `place-on-stage` na ficha:

1. Descobrir a Stage ativa e o tamanho do grid pela API que o core já expõe ao cliente (leia como o
   handler de `canvas-actor-drop` em `game-hud.ts` obtém stage e posição, **reuse o mesmo caminho de
   API**, e não reimplemente a conversão de coordenadas).
2. Pra cada membro, `quantity.value` vezes: `POST /api/cast` com `actorId`, `isLinked: false`
   (NPC não vinculado, regra 6 do projeto: cada cópia tem PV próprio), `stageId` da ativa e
   posições em grade a partir do centro da Stage (uma célula de grid entre cada token, linhas
   de até 5). Os campos aceitos estão em `E:\modules\LoomVTT\server\applications\api\cast.ts:44-69`.
   Nome: `"<NPC> 1"`, `"<NPC> 2"`… quando a quantidade é maior que 1.
3. Criar os casts em sequência (sem `Promise.all` de dezenas de POSTs). Toast final
   "N criaturas colocadas".
4. Só o mestre vê o botão (a ficha é do mestre, mas confirme como o ruleset testa se o usuário é GM;
   `rtk grep -n "isGM" scripts`).

Se o passo 1 mostrar que o cliente **não tem** como descobrir a Stage ativa sem mexer no motor,
**pare**, não invente uma rota nova e relate o que falta. Vira uma ponte no LoomVTT.

## Critério de aceite

- `node --check` em todo `.mjs` tocado.
- Ao vivo (pré-requisito: grupo principal com 4 personagens nível 1, do handout 49):
  1. Criar encounter, arrastar "Goblin" (CR 1/4, 50 XP) da sidebar 2 vezes → 1 linha, quantidade 2, XP 100.
  2. Resumo: orçamento Low 200 (50 × 4) → "Low".
  3. Adicionar "Wolf" com fórmula `1d4+1` → Roll quantities → quantidade entre 2 e 5, whisper pro mestre.
  4. Arrastar um personagem → toast, nada muda.
  5. Place on stage → aparecem na Stage ativa tokens de Goblin 1, Goblin 2, Wolf 1…,
     não vinculados: dano num Goblin não mexe no outro nem no ator Goblin da sidebar.
  6. Remover o grupo principal (setting vazio) → resumo mostra o aviso, sem erro.

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
`E:\modules\LoomVTT\client\canvas\canvas-manager.ts` e `game-hud.ts` são enormes: leia só o trecho
indicado (`rtk read -l minimal` com faixa de linhas, ou `rtk grep -n` com contexto).

## Ao terminar

Criar `.planning/done/` se não existir e mover este arquivo pra
`.planning/done/51-actor-encounter.md` como último passo, depois do critério de aceite confirmado.
