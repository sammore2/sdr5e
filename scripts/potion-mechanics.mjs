/** Rolls the common Potion of Healing's exact SRD 5.2 2d4+2 hit points. */
export function rollPotionOfHealing(random = Math.random) {
  const rollD4 = () => {
    const sample = Number(random());
    if (!Number.isFinite(sample)) throw new TypeError('Random source must return a finite number.');
    return Math.min(4, Math.max(1, Math.floor(sample * 4) + 1));
  };
  return rollD4() + rollD4() + 2;
}

/** Apply healing up to the actor's effective HP cap and report the actual amount. */
export function cappedHealingResult(currentHp, maxHp, amount) {
  const current = Number(currentHp) || 0;
  const healing = Number(amount) || 0;
  const cap = maxHp !== null && maxHp !== undefined && Number.isFinite(Number(maxHp))
    ? Number(maxHp)
    : current + healing;
  const newValue = Math.min(cap, current + healing);
  return { newValue, actualHealing: Math.max(0, newValue - current) };
}
