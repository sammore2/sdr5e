const RAGE_USES = Object.freeze([
  2, 2, 3, 3, 3, 4, 4, 4, 4, 4,
  4, 5, 5, 5, 5, 5, 6, 6, 6, 6,
]);
const RAGE_DAMAGE_BONUS = Object.freeze([2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);

export function rageDamageBonusAtLevel(level) {
  const classLevel = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  return RAGE_DAMAGE_BONUS[classLevel - 1];
}

export function rageDamageBonusForAttack(items = [], abilityKey, confirmedHit, targetCount) {
  if (abilityKey !== 'str' || !confirmedHit || Number(targetCount) !== 1) return 0;
  const raging = (items || []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'feature' && data.classIdentifier === 'barbarian'
      && data.identifier === 'rage' && data.rageActive === true;
  });
  if (!raging) return 0;
  const barbarian = (items || []).find((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'class' && data.classIdentifier === 'barbarian';
  });
  if (!barbarian) return 0;
  const data = barbarian?.system || barbarian?.data || {};
  if (!Number.isFinite(Number(data.levels)) || Number(data.levels) < 1) return 0;
  return rageDamageBonusAtLevel(data.levels);
}

export function rageResistanceTypes(items = []) {
  const active = (items || []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'feature' && data.classIdentifier === 'barbarian'
      && data.identifier === 'rage' && data.rageActive === true;
  });
  return active ? ['bludgeoning', 'piercing', 'slashing'] : [];
}

/** SRD Rage prevents its user from casting spells while the feature is active. */
export function canCastSpellsDuringRage(items = []) {
  return !(items || []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'feature' && data.classIdentifier === 'barbarian'
      && data.identifier === 'rage' && data.rageActive === true;
  });
}

/** Rage grants advantage only on Strength checks and Strength saving throws. */
export function rageStrengthAdvantage(items = [], abilityKey) {
  if (abilityKey !== 'str') return false;
  return (items || []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'feature' && data.classIdentifier === 'barbarian'
      && data.identifier === 'rage' && data.rageActive === true;
  });
}

export function canEnterRage(items = []) {
  return !(items || []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'armor' && data.equipped === true && data.armorType === 'heavy';
  });
}

/** Whether an item update represents donning Heavy armor during Rage. */
export function heavyArmorRageEndTriggered(item) {
  const data = item?.system || item?.data || {};
  return item?.type === 'armor' && data.equipped === true && data.armorType === 'heavy';
}

const INCAPACITATING_CONDITIONS = new Set(['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']);

/** Marker state that means the creature has the Incapacitated condition. */
export function incapacitatedRageEndTriggered(cast, persistent = false) {
  const data = cast?.data || cast;
  const markers = Array.isArray(data?.statusMarkers) ? data.statusMarkers : [];
  if (persistent) return markers.some((marker) => String(marker).toLowerCase() === 'unconscious');
  return markers.some((marker) => INCAPACITATING_CONDITIONS.has(String(marker).toLowerCase()));
}

/** Persist the combat turn that began this Rage so expiration survives sheet reloads. */
export function createRageCombatState(combat, combatantId, persistent = false) {
  const round = Number(combat?.round);
  if (!combat?.id || !Number.isInteger(round) || round < 1 || !combatantId) return null;
  return {
    combatId: String(combat.id), combatantId: String(combatantId), activatedRound: round,
    nextTurnSeen: false, nextTurnRound: 0, extensionCount: 0, persistent: persistent === true,
  };
}

/** Resolve the SRD end-of-next-turn transition using the updated combat tracker. */
export function resolveRageCombatTurn(state, combat) {
  if (!state?.combatId || state.combatId !== String(combat?.id)) return { action: 'ignore', state };
  const combatants = Array.isArray(combat?.combatants) ? combat.combatants : [];
  const turn = Number(combat?.currentTurn);
  const round = Number(combat?.round);
  if (!combatants.length || !Number.isInteger(turn) || turn < 0 || turn >= combatants.length || !Number.isInteger(round)) {
    return { action: 'ignore', state };
  }
  const currentId = String(combatants[turn]?.id || '');
  const previousIndex = (turn - 1 + combatants.length) % combatants.length;
  const previousId = String(combatants[previousIndex]?.id || '');
  if (!currentId || !previousId) return { action: 'ignore', state };
  if (round - Number(state.activatedRound) >= 100) return { action: 'end', state: null, reason: 'ten-minute-limit' };
  if (state.persistent === true) return { action: 'ignore', state };
  if (state.nextTurnSeen === true && previousId === String(state.combatantId)) {
    return { action: 'end', state: null, reason: 'next-turn-ended' };
  }
  if (state.nextTurnSeen !== true && currentId === String(state.combatantId)
    && round > Number(state.activatedRound)) {
    const next = { ...state, nextTurnSeen: true, nextTurnRound: round };
    return { action: 'update', state: next };
  }
  return { action: 'ignore', state };
}

/** A player confirms one of the SRD's qualifying extension actions during their turn. */
export function resolveRageExtension(state, combat) {
  const combatants = Array.isArray(combat?.combatants) ? combat.combatants : [];
  const turn = Number(combat?.currentTurn);
  const round = Number(combat?.round);
  const currentId = Number.isInteger(turn) ? String(combatants[turn]?.id || '') : '';
  if (!state?.combatId || state.combatId !== String(combat?.id) || state.persistent === true
    || state.nextTurnSeen !== true || currentId !== String(state.combatantId)
    || !Number.isInteger(round) || round - Number(state.activatedRound) >= 100) {
    return { valid: false, state, reason: 'extension-unavailable' };
  }
  return {
    valid: true,
    state: { ...state, nextTurnSeen: false, nextTurnRound: 0, extensionCount: (Number(state.extensionCount) || 0) + 1 },
  };
}

export function rageUsesAtLevel(level) {
  const classLevel = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  return RAGE_USES[classLevel - 1];
}

/** On level-up, increase an unspent full pool; preserve already-spent uses. */
export function syncRageUses(uses = {}, classLevel) {
  const nextMax = rageUsesAtLevel(classLevel);
  const oldMax = Math.max(0, Number(uses.max) || 0);
  const current = Math.max(0, Number(uses.value) || 0);
  const nextValue = oldMax === 0 || current >= oldMax ? nextMax : Math.min(current, nextMax);
  return { ...uses, max: nextMax, value: nextValue, recovery: 'lr', shortRestRestore: 1 };
}

export function restoredFeatureUses(uses = {}, restKind) {
  const max = Math.max(0, Number(uses.max) || 0);
  const current = Math.max(0, Number(uses.value) || 0);
  if (restKind === 'long' && uses.recovery === 'lr') return max;
  if (restKind === 'long' && uses.recovery === 'sr') return max;
  if (restKind === 'short' && Number(uses.shortRestRestore) > 0) {
    return Math.min(max, current + Math.trunc(Number(uses.shortRestRestore)));
  }
  if (uses.recovery === 'sr' && restKind === 'short') return max;
  return current;
}
