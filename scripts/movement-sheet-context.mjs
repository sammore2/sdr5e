import { combatSpeedPenaltyFeet } from './combat-effects.mjs';
import { movementLedgerView, speedsWithCombatEffects, speedsWithConditions } from './movement-mechanics.mjs';

function unwrap(response) {
  return response?.data?.id ? response.data : response;
}

/** Resolve a sheet's movement state to one exact combat Cast when possible. */
export async function resolveMovementSheetContext({ actorId, combat, api, selectedCastId, actorLedger = {}, actorSpeeds: rawActorSpeeds = {}, conditions = [], localize } = {}) {
  // Speed 0 conditions apply before any combat-effect reduction, to every path below.
  const actorSpeeds = speedsWithConditions(rawActorSpeeds, conditions);
  const combatants = Array.isArray(combat?.combatants) ? combat.combatants : [];
  if (!actorId || !combat?.id || !combatants.length || typeof api?.get !== 'function') {
    return { inCombat: false, castId: '', ledger: actorLedger, speeds: actorSpeeds, choices: [], view: movementLedgerView(actorLedger, actorSpeeds, localize) };
  }

  const casts = await Promise.all([...new Set(combatants.map((entry) => String(entry?.id || '')).filter(Boolean))]
    .map(async (castId) => {
      try {
        const cast = unwrap(await api.get(`/cast/${encodeURIComponent(castId)}`));
        return cast?.id && String(cast.actorId || '') === String(actorId) ? cast : null;
      } catch {
        return null;
      }
    }));
  const rawChoices = casts.filter(Boolean).map((cast) => ({ id: String(cast.id), name: String(cast.name || cast.id) }));
  const choices = rawChoices;
  const selected = choices.length === 1 ? choices[0]
    : choices.find((choice) => choice.id === String(selectedCastId || ''));
  const choiceView = choices.map((choice) => ({ ...choice, selected: choice.id === selected?.id }));
  if (!selected) {
    return { inCombat: true, castId: '', ledger: {}, speeds: actorSpeeds, choices: choiceView, requiresSelection: choices.length > 1,
      view: null };
  }
  const cast = casts.find((entry) => String(entry?.id || '') === selected.id);
  const castData = cast?.systemData || {};
  const penaltyFeet = combatSpeedPenaltyFeet(castData.srd5eCombatEffects, combat.id, selected.id);
  const speeds = speedsWithConditions(speedsWithCombatEffects(actorSpeeds, castData.srd5eCombatEffects, combat.id, selected.id), conditions);
  const ledger = castData.srd5eMovementLedger || {};
  return { inCombat: true, castId: selected.id, castName: selected.name, choices: choiceView, ledger, speeds, penaltyFeet,
    view: movementLedgerView(ledger, speeds, localize) };
}
