const SIZE_RANK = Object.freeze({ tiny: 0, sm: 1, small: 1, med: 2, medium: 2, lg: 3, large: 3, huge: 4, grg: 5, gargantuan: 5 });

export function normalizeCreatureSize(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.hasOwn(SIZE_RANK, key) ? key : null;
}

/** Returns null when either size is unknown; otherwise enforces the one-size-larger limit. */
export function creatureSizeEligibleByOneStep(attackerSize, targetSize) {
  const attacker = SIZE_RANK[normalizeCreatureSize(attackerSize)];
  const target = SIZE_RANK[normalizeCreatureSize(targetSize)];
  if (!Number.isInteger(attacker) || !Number.isInteger(target)) return null;
  return target <= attacker + 1;
}
