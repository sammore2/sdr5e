const PENDING_HIT_DICE = new Map();

export function registerPendingHitDie(id, pending) {
  if (!id || PENDING_HIT_DICE.has(id)) return false;
  PENDING_HIT_DICE.set(id, pending);
  return true;
}

export function getPendingHitDie(id) { return PENDING_HIT_DICE.get(String(id)) || null; }

export function clearPendingHitDie(id) {
  const pending = getPendingHitDie(id);
  if (!pending) return null;
  PENDING_HIT_DICE.delete(String(id));
  return pending;
}

export function expirePendingHitDie(id) {
  const pending = clearPendingHitDie(id);
  pending?.resolve(null);
  return !!pending;
}

/** Build the one-write resource patch for a confirmed Hit Die roll. */
export function hitDieCommitPatch(systemData, healAmount, { spendInspiration = false, poolId = '' } = {}) {
  const resources = systemData?.resources || {};
  const hitDice = resources.hitDice || {};
  if ((Number(hitDice.value) || 0) <= 0) throw new RangeError('No Hit Dice remaining.');
  if (spendInspiration && !resources.inspiration) throw new RangeError('Heroic Inspiration is not available.');
  const pools = hitDice.pools || {};
  const eligible = Object.entries(pools).filter(([, pool]) => !pool.needsReview && (Number(pool.value) || 0) > 0);
  if (eligible.length && !poolId) throw new RangeError('Hit Die pool must be selected.');
  const pool = poolId ? pools[poolId] : null;
  if (poolId && (!pool || pool.needsReview || (Number(pool.value) || 0) <= 0)) throw new RangeError('Hit Die pool is no longer available.');
  const health = resources.health || {};
  const before = Number(health.value) || 0;
  const max = Number(health.effectiveMax ?? health.max ?? before);
  const patch = {
    'system.resources.hitDice.value': Number(hitDice.value) - 1,
    'system.resources.health.value': Math.min(max, before + Math.max(0, Number(healAmount) || 0)),
  };
  if (pool) patch['system.resources.hitDice.pools'] = { ...pools, [poolId]: { ...pool, value: Number(pool.value) - 1 } };
  if (spendInspiration) patch['system.resources.inspiration'] = false;
  return patch;
}

/** SRD 5.2 (Short Rest): each spent Hit Point Die regains at least 1 Hit Point. */
export function hitDieHealing(total) {
  return Math.max(1, Number(total) || 0);
}

/** SRD fixed value for a Hit Die gained after character level 1. */
export function fixedHigherLevelHitDieValue(hitDie) {
  const size = Number(String(hitDie || '').match(/\d+/)?.[0]);
  if (!Number.isInteger(size) || size < 2) throw new RangeError(`Invalid Hit Die: ${hitDie}.`);
  return Math.ceil((size + 1) / 2);
}

/** HP gained for a level taken in a new class (which is never character level 1). */
export function multiclassLevelHitPointGain(hitDie, constitutionModifier, { roll = null } = {}) {
  const size = Number(String(hitDie || '').match(/\d+/)?.[0]);
  if (!Number.isInteger(size) || size < 2) throw new RangeError(`Invalid Hit Die: ${hitDie}.`);
  if (roll !== null && (!Number.isInteger(Number(roll)) || Number(roll) < 1 || Number(roll) > size)) {
    throw new RangeError(`Hit Die result must be from 1 to ${size}.`);
  }
  const dieResult = roll === null ? fixedHigherLevelHitDieValue(hitDie) : Number(roll);
  const con = Number(constitutionModifier);
  if (!Number.isFinite(con)) throw new TypeError('Constitution modifier must be a finite number.');
  return Math.max(1, dieResult + con);
}

/** Build the resource patch for the first Hit Die in a newly added class pool. */
export function multiclassEntryHitDicePatch(hitDice, classIdentifier, hitDie) {
  const classId = String(classIdentifier || '').trim().toLowerCase();
  if (!classId) throw new TypeError('Class identifier is required.');
  const size = Number(String(hitDie || '').match(/\d+/)?.[0]);
  if (!Number.isInteger(size) || size < 2) throw new RangeError(`Invalid Hit Die: ${hitDie}.`);
  const resource = hitDice || {};
  const pools = resource.pools || {};
  if (resource.needsReview || pools[classId]?.needsReview) throw new RangeError('Hit Dice need review before multiclass progression.');
  if (pools[classId]) throw new RangeError(`Hit Die pool already exists for ${classId}.`);
  const value = Number(resource.value);
  const max = Number(resource.max);
  if (!Number.isInteger(value) || value < 0 || !Number.isInteger(max) || max < value) {
    throw new RangeError('Current Hit Dice totals are invalid.');
  }
  return {
    value: value + 1,
    max: max + 1,
    pools: { ...pools, [classId]: { value: 1, max: 1, die: `d${size}`, needsReview: false } },
  };
}
