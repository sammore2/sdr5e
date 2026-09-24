# SRD5E — Handouts 42–51: Tipos de Ficha + Fundação

> Planejado em 24/09/2026. Continua a numeração de `.dev/handouts/` (01–41, todos concluídos).
> Executores: agentes (Muse Spark / GPT Luna). Revisão: Claude, que só aponta bugs e não corrige.

## Regras que valem pra TODOS os handouts desta pasta

1. **Um handout por vez, na ordem abaixo.** Quase todos tocam `scripts/schema.mjs`,
   `scripts/config.mjs` e as fichas, então dois agentes em paralelo no ruleset geram conflito.
2. **Ao terminar**, o agente cria `.planning/done/` (se não existir) e move o próprio
   handout pra lá. Esse é o último passo.
3. **Não commitar.** A revisão acontece antes do commit.
4. `packs/*.sqlite` **já estavam modificados antes** deste plano (git status de 24/09).
   Não reverter nem incluir essas mudanças no seu trabalho, a menos que o handout mande
   regenerar um pack específico.
5. **Comentários de código novo em inglês**, mesmo em arquivo com comentários em PT-BR.
6. **Nunca usar "D&D"/"dnd5e"** em nome de arquivo, id, classe CSS, chave ou texto
   visível. O dnd5e do Foundry serve só de referência de comportamento, e o código dele nunca é copiado.
7. **Não quebrar dado existente.** Todo campo novo no schema é backfilled pelo
   `mergeDefaults` (`srd5e.mjs:53`). Nenhum campo existente é renomeado ou removido.

## Ordem

| # | Handout | Fase | Depende de |
|---|---|---|---|
| 42 | Config completo (ícones/rótulos de todos os tipos, condições, movimento/sentidos) | A | — |
| 43 | Nível de subclasse por classe | A | 42 |
| 44 | Movimento e sentidos estruturados + Exhaustion 2/5 | A | 42 |
| 45 | Item `consumable` | B | 42 |
| 46 | Item `tool` | B | 42 |
| 47 | Item `loot` | B | 42 |
| 48 | Item `container` | B | 45, 46, 47 |
| 49 | Ator `group` (party) | C | 42 |
| 50 | Ator `vehicle` | C | 44, 49 |
| 51 | Ator `encounter` | C | 49 |
| 52 | Correções da revisão de 42–51 (24/09/2026) | — | 42–51 |
| 53 | `populate` nos fetches de ator + ordem da checagem do cofre | — | 52 |
| 54 | Restaurar `prepare-data.mjs` (revertido no 53), **urgente** | — | 53 |

## Fora deste plano (rodada de planejamento própria depois)

- **Registry** (índice de classes, subclasses e listas de magia do compêndio)
- **Advancement** (progressão de classe como dado no item de classe)
- **Activities** (várias ações por item)
- **Cover na CA**: ponte no motor (repositório LoomVTT), não aqui.
- **Tipos de ChatMessage** (rest/turn/request): descartado, porque `flags.srd5e` já cobre.

## Seção padrão de ferramental (repetida em cada handout)

Cada handout traz a seção "Ferramental obrigatório". Ela vale mesmo se o seu ambiente não
tiver os hooks deste projeto.
