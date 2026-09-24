# Handout 50: Ator `vehicle`

## Contexto

Diretório de trabalho: `E:\LoomVTT\marketplace\rulesets\srd5e`. Leia `.planning/00-INDICE.md`.
Depende dos handouts 44 (formato `movement`) e 49 (ficha de grupo como base pra lista de atores e
leitura do payload de drop).

## Regra (SRD 5.2, `.dev/srd5.2_markdown/equipment.md:1821+`, "Large Vehicles")

Veículo grande (navio, dirigível) tem: deslocamento de viagem (mph), tripulação, passageiros,
carga (toneladas), CA, PV e **Damage Threshold**. Regra de objeto: dano **abaixo** do limite é
ignorado por inteiro; dano **igual ou acima** entra inteiro. A tabela do markdown traz os 7
navios com esses números.

## O que o motor/ruleset já oferece

- Tipo novo e ficha: mesmo caminho do handout 49 (`ruleset.json` + `defineSystem` + `sheets.catalog`).
- PV: `getHealthPool` (`roll-engine.mjs:253`) lê `sd.resources.health` pra qualquer tipo. Se o
  veículo guardar PV ali, o botão **Apply Damage** do chat já funciona nele.
- Resistências: `getTraits` (`roll-engine.mjs:432`) lê `sd.traits` pra todo tipo que não é `npc`.
  Se o veículo guardar `traits: { di, dr, dv, ci }`, imunidade já funciona.

## Passo 1: declarar o tipo

- `ruleset.json` → `actorTypes`: adicionar `"vehicle"`. `srd5e.mjs:100`: adicionar `'vehicle'`.
- `srd5e.mjs`: `sheets.catalog('actor', 'vehicle', Sdr5eVehicleSheet);`.

## Passo 2: schema (`scripts/schema.mjs`, novo `case 'vehicle'`)

```js
case 'vehicle':
  return {
    // 'water' | 'air' | 'land'
    vehicleType: 'water',
    attributes: {
      ac: 10,
      damageThreshold: 0,
      // Tactical movement (meters, same shape as characters, see handout 44).
      movement: { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false },
      // Overland travel speed in miles per hour (the SRD vehicle table unit).
      travelSpeed: 0,
    },
    resources: { health: { value: 10, max: 10, bonus: 0, temp: 0 } },
    // Objects: poison and psychic immunity by default (SRD object rules).
    traits: { di: ['poison', 'psychic'], dr: [], dv: [], ci: [] },
    crew: { max: 0, members: [] },        // members: world actor ids
    passengers: { max: 0, members: [] },  // members: world actor ids
    cargo: { value: 0, max: 0 },          // tons
    description: '',
  };
```

Confirmar em `roll-engine.mjs` (Apply Damage → `applyDamage`) que nada mais exige `abilities` ou
`attributes.da` do alvo. Se exigir, anote no relatório e trate com guarda (`?.`) só naquele ponto.

## Passo 3: Damage Threshold (`scripts/roll-engine.mjs`, `applyDamage`)

Depois de aplicar resistência e imunidade e **antes** do HP temporário: se `actor.type === 'vehicle'`
e `attributes.damageThreshold > 0` e o dano final `< damageThreshold`, o dano vira 0. A mensagem de chat do
dano aplicado mostra "abaixo do limite de dano (N)". Um comentário cita a regra.

## Passo 4: `alias` de token

A CA do token/tooltip de alvo: o ataque lê a CA do alvo por `getTargetAcInfo`
(`roll-engine.mjs`, handout 36). Veja qual caminho ele lê (`attributes.da.value` hoje) e faça o
veículo responder. **Preferência**: em `prepareData` (`srd5e.mjs:47`), pra `row.type === 'vehicle'`,
definir `sd.attributes.da = { value: sd.attributes.ac }` e `sd.attributes.hp = sd.resources.health`
(mesmo padrão de alias de `prepare-data.mjs:318-320`). Assim não precisa de `if vehicle` no motor de rolagem.
Atenção: o `prepareData` hoje sai cedo em `if (!sd.abilities) return row;`; o alias do
veículo precisa vir **antes** desse retorno.

## Passo 5: ficha (`scripts/vehicle-sheet.mjs` + `templates/vehicle-sheet.hbs`, novos)

Mesma base e padrão da ficha de grupo (handout 49) e de NPC:
- Cabeçalho: retrato, nome, tipo (select), CA, PV (value/max, editáveis), Damage Threshold,
  travelSpeed (mph) e os modos de `movement` > 0.
- **Tripulação** e **Passageiros**: duas listas de atores (drop de `{ type: 'Actor' }` da sidebar,
  mesmo código de drop do grupo; se der, **extraia** a leitura do payload de drop do handout 49
  pra um helper em `scripts/utils.mjs` e use nos dois). Mostrar `n / max` e avisar (toast, sem
  bloquear) quando passar do máximo. Um ator não pode estar nas duas listas.
- **Carga**: `cargo.value / cargo.max` t.
- **Imunidades/resistências**: mesmo componente de traits que a ficha de personagem usa
  (`character-sheet.mjs:717`, lista `DAMAGE_TYPES`), se ele for reutilizável sem copiar; se não for,
  uma lista simples de tags com `DAMAGE_TYPES`.
- **Itens**: armas de cerco etc. Listar itens `weapon`/`feature` do veículo com botão de postar
  no chat (`postItemToChat`). **Sem** rolagem de ataque (veículo não tem habilidades; quem ataca é a
  tripulação). Aceitar drop de itens igual `npc-sheet.mjs:144`.
- Descrição.

## Passo 6: compêndio novo `packs/vehicles.json`

Criar um pack novo (aqui os ids podem ser gerados com `crypto.randomUUID()`, porque o pack é
novo) com os 7 navios da tabela "Airborne and Waterborne Vehicles"
(`.dev/srd5.2_markdown/equipment.md:1821+`): `type: 'vehicle'`, `data` no schema do passo 2,
`travelSpeed` em mph, `vehicleType` 'air' pro Airship e 'water' pros outros. Formato do JSON:
igual aos outros packs (`{ name, type, entries: [...] }`; confira um pack existente com
`node -e`). Converter com `node E:\modules\LoomVTT\scripts\build-compendium-pack.mjs packs\vehicles.json` e
registrar `"packs/vehicles.sqlite"` em `ruleset.json` → `compendiums`.
Escreva o gerador como `.dev/build-vehicles-50.mjs`, pra dar pra refazer.

## Critério de aceite

- `node --check` em todo `.mjs` tocado.
- Ao vivo:
  1. Importar "Sailing Ship" do compêndio → ficha com CA/PV/limite/tripulação/carga da tabela.
  2. Colocar o token do navio na cena, marcar como alvo e atacar com um personagem → o card mostra
     HIT/MISS contra a CA do navio.
  3. Apply Damage 5 num navio com limite 15 → PV não muda, chat avisa. Apply Damage 20 → PV cai 20.
  4. Dano de veneno → 0 (imunidade).
  5. Arrastar 2 personagens pra tripulação e 1 pra passageiros; arrastar um tripulante pra
     passageiros → recusado com toast.
  6. Personagem/NPC/grupo continuam funcionando (abrir, rolar, aplicar dano).

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
`.planning/done/50-actor-vehicle.md` como último passo, depois do critério de aceite confirmado.
