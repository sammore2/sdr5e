// Answers the host's `combatInitiative` hook: when the GM starts a combat, each selected token reports its
// initiative modifier and Advantage/Disadvantage (same bonus and conditions as the sheet's own initiative
// roll) plus the health this ruleset tracks. The d20 itself is rolled later, from the die in the combat tab.

import { LoomHooks, api } from '/_loom/sdk/index.js';
import { fetchPreparedActor, prepareActorRow } from './prepare-data.mjs';
import { getActorConditions } from './roll-engine.mjs';
import { initiativeBaseSources, resolveInitiativeAdvantage } from './initiative-mechanics.mjs';
import { hasFeralInstinct } from './class-feature-mechanics.mjs';

/** The actor behind a token, derived like the sheet does; an unlinked token falls back to its own data. */
async function preparedSource(cast) {
  if (cast.actorId) {
    const actor = await fetchPreparedActor(cast.actorId);
    if (actor) return actor;
  }
  return prepareActorRow({ ...cast, systemData: structuredClone(cast.systemData || {}) });
}

async function describeCombatant(castId) {
  const cast = await api.get(`/cast/${castId}`);
  if (!cast) return null;
  const source = await preparedSource(cast);
  const sd = source?.systemData;
  if (!sd) return null;

  const conditions = await getActorConditions(cast.actorId);
  const base = initiativeBaseSources(conditions, hasFeralInstinct(source.items || []));
  const health = sd.resources?.health;
  return {
    roll: { bonus: Number(sd.attributes?.initiative?.total) || 0, mode: resolveInitiativeAdvantage(base, 0, false) },
    health: health && Number.isFinite(Number(health.max))
      ? { hp: Number(health.value) || 0, maxHp: Number(health.max) }
      : null,
  };
}

export function registerCombatInitiative() {
  LoomHooks.on('combatInitiative', (ctx) => {
    ctx.pending.push((async () => {
      for (const castId of ctx.castIds) {
        try {
          const info = await describeCombatant(castId);
          if (!info) continue;
          ctx.rolls[castId] = info.roll;
          if (info.health) ctx.health[castId] = info.health;
        } catch (e) {
          // One broken token must not stop the others: it keeps the host's default (a plain d20).
          console.warn('[srd5e] initiative for', castId, 'failed', e);
        }
      }
    })());
  });
}
