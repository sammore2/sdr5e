# Handout 53: `populate` nos fetches de ator + ordem da checagem do cofre

Diretório: `E:\LoomVTT\marketplace\rulesets\srd5e`. Regras de `.planning/00-INDICE.md` valem. Handout pequeno: faça só isto.

## Causa

`GET /actors/:id` só traz os itens do ator com `?populate=true`
(`E:\modules\LoomVTT\server\applications\api\actors.ts`, `req.query.populate`). Sem isso, `actor.items` vem vazio.

## 1. Adicionar `?populate=true` nestes 4 pontos (e só neles)

| Arquivo | Onde | Sintoma hoje |
|---|---|---|
| `scripts/rest.mjs` | todos os `api.get(\`/actors/${...}\`)` (linhas ~11, 23, 31, 54) | descanso não restaura usos de item nem o Pact Magic do Warlock |
| `scripts/prepare-data.mjs` | `fetchPreparedActor` (~linha 527) | a ficha de grupo mostra CA sem armadura |
| `srd5e.mjs` | `useItem` (~linha 66) | macro de item ignora feature/TWF |
| `srd5e.mjs` | listener dos botões do chat (~linha 144) | Attack/Damage pelo chat ignora TWF |

Formato: `` `/actors/${id}?populate=true` ``.

## 2. Cofre do grupo: checar antes de pagar

`scripts/group-sheet.mjs`, `_award`: o bloco `if (result.fromVault) { ... 'Vault has insufficient funds' ... return; }`
roda **depois** do `for` que paga os personagens. Mova só a checagem de saldo pra **antes** do `for`.
A dedução do cofre continua onde está.
Apague também o comentário `// then add remainder back? Actually...` que ficou nesse bloco.

## 3. Restos

- `scripts/character-sheet.mjs:785`: apagar `_sensesList` (não é usado em nenhum template).
- `scripts/prepare-data.mjs`: `prepEncumbrance` passa a usar `computeCarriedWeight(items)` em vez da cópia
  interna de `isInsideWeightless` e do reduce (linhas ~227-250). O resultado precisa continuar idêntico.

## Aceite

- `node --check` nos 5 arquivos tocados.
- Ao vivo: Warlock com slots gastos → Short Rest (pela ficha **e** pelo grupo) → slots de volta.
  Personagem com armadura no grupo → CA igual à da ficha. Award de 10 gp "do cofre" com o cofre em 0
  → aviso, e ninguém recebe nada.

## Ferramental

`rtk read -l minimal` / `rtk grep -n` / `rtk git diff`, nunca `cat`/`grep`/`git` puros. Não repetir
busca, não reler arquivo recém-editado. Se o `rtk` falhar, use o nativo e diga isso no relatório.

## Ao terminar

Mover este arquivo pra `.planning/done/53-populate-e-cofre.md`.
