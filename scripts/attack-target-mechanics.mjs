/** Kept natural d20 on one attack result; dropped advantage dice do not count. */
export function keptAttackD20(roll = {}) {
  if (roll.meta?.isAttack !== true) return null;
  for (const term of roll.terms || []) {
    if (term.kind !== 'dice' || Number(term.faces) !== 20) continue;
    const rolls = Array.isArray(term.rolls) ? term.rolls : [];
    const index = rolls.findIndex((value, rollIndex) => value >= 1 && value <= 20 && !term.dropped?.[rollIndex]);
    if (index >= 0) return Number(rolls[index]);
  }
  return null;
}

/** Resolve one captured target against one attack roll using SRD natural 1/20 rules. */
export function resolveAttackAgainstTarget(roll = {}, armorClass) {
  if (roll.meta?.isAttack !== true) return { resolved: false, hit: false, critical: false, natural: null };
  const natural = keptAttackD20(roll);
  if (natural === 20) return { resolved: true, hit: true, critical: true, natural };
  if (natural === 1) return { resolved: true, hit: false, critical: false, natural };
  const total = Number(roll.total);
  const ac = Number(armorClass);
  if (!Number.isFinite(total) || !Number.isFinite(ac)) return { resolved: false, hit: false, critical: false, natural };
  return { resolved: true, hit: total >= ac, critical: false, natural };
}

export function isSingleAttackTargetCount(count) {
  return Number.isInteger(Number(count)) && Number(count) >= 0 && Number(count) <= 1;
}

/** Damage from an attack card is bound to its one captured hit, never a later target selection. */
export function attackDamageBinding(targets, hit) {
  const captured = Array.isArray(targets) ? targets : [];
  if (captured.length === 0) return { canRollDamage: true, targetBound: true, targetId: '' };
  if (captured.length !== 1 || hit !== true) return { canRollDamage: false, targetBound: true, targetId: '' };
  return { canRollDamage: true, targetBound: true, targetId: String(captured[0]?.castId || '') };
}

/**
 * Charmed: the charmed attacker cannot choose its charmer as an attack target.
 * `gmOverride === true` lifts the block.
 */
export function charmerTargetBlocked(attackerConditions, attackerCharmerIds, targetId, gmOverride) {
  if (gmOverride === true) return false;
  const conditions = Array.isArray(attackerConditions) ? attackerConditions : [];
  if (!conditions.includes('charmed')) return false;
  const charmers = Array.isArray(attackerCharmerIds) ? attackerCharmerIds.map(String) : [];
  return targetId !== undefined && targetId !== null && charmers.includes(String(targetId));
}
