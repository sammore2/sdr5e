function cleanId(value) {
  const id = String(value || '').trim();
  return id && id.length <= 160 ? id : '';
}

/** Resolve the exact active turn identity from Loom's combat tracker. */
export function activeSpellSlotTurn(combat) {
  const combatId = cleanId(combat?.id);
  const round = Number(combat?.round);
  const index = Number(combat?.currentTurn);
  const combatants = Array.isArray(combat?.combatants) ? combat.combatants : [];
  if (!combatId || combat?.isActive === false || !Number.isInteger(round) || round < 1
    || !Number.isInteger(index) || index < 0 || index >= combatants.length) return null;
  const castId = cleanId(combatants[index]?.id);
  return castId ? { combatId, round, castId } : null;
}

export function sameSpellSlotTurn(spent, turn) {
  return !!turn && cleanId(spent?.combatId) === turn.combatId
    && Number(spent?.round) === turn.round && cleanId(spent?.castId) === turn.castId;
}

/** Persist an auditable marker alongside the slot debit for this exact turn. */
export function spellSlotTurnSpendRecord(turn, { spellId, overridden = false, userId = '' } = {}) {
  if (!turn?.combatId || !turn?.castId || !Number.isInteger(Number(turn.round)) || Number(turn.round) < 1) return null;
  const spell = cleanId(spellId);
  if (!spell) return null;
  return {
    combatId: String(turn.combatId), round: Number(turn.round), castId: String(turn.castId),
    spellId: spell, overridden: overridden === true, ...(overridden === true && cleanId(userId) ? { userId: cleanId(userId) } : {}),
  };
}
