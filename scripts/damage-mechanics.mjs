/** Deterministic SRD 5.2 HP, temporary HP, and at-zero damage consequences. */
export function resolveDamageConsequences({ health = {}, finalDamage, deathState = 'alive', deathSaves = {}, critical = false }) {
  const amount = Math.max(0, Number(finalDamage) || 0);
  const hpBefore = Math.max(0, Number(health.value) || 0);
  const hpMax = Math.max(0, Number(health.max) || 0);
  const tempBefore = Math.max(0, Number(health.temp) || 0);
  const tempAfter = Math.max(0, tempBefore - amount);
  const hpDamage = Math.max(0, amount - tempBefore);
  const hpAfter = Math.max(0, hpBefore - hpDamage);
  const overflow = Math.max(0, hpDamage - hpBefore);
  const nextDeathSaves = {
    successes: Math.max(0, Number(deathSaves.successes) || 0),
    failures: Math.max(0, Number(deathSaves.failures) || 0),
  };
  let nextDeathState = deathState || 'alive';

  if (nextDeathState !== 'dead') {
    if (hpBefore > 0 && hpAfter === 0 && hpMax > 0 && overflow >= hpMax) {
      nextDeathState = 'dead';
    } else if (hpBefore === 0 && amount > 0) {
      if (nextDeathState === 'stable') nextDeathSaves.successes = 0;
      nextDeathSaves.failures = Math.min(3, nextDeathSaves.failures + (critical ? 2 : 1));
      nextDeathState = amount >= hpMax && hpMax > 0 || nextDeathSaves.failures >= 3 ? 'dead' : 'alive';
    }
  }

  return {
    health: { ...health, value: hpAfter, temp: tempAfter },
    hpAfter,
    hpDamage,
    overflow,
    deathSaves: nextDeathSaves,
    deathState: nextDeathState,
  };
}

/**
 * SRD 5.2 (Resistance and Vulnerability): Immunity stops the damage; then
 * Resistance halves it (round down) and Vulnerability doubles it. Resistance
 * and Vulnerability to the same type do NOT cancel. "All" matches every type
 * and counts as one instance per category (No Stacking).
 */
export function applyDamageTraits(amount, traits = {}, damageType = '') {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  const type = String(damageType || '').toLowerCase();
  const has = (category) => (traits[category] || []).some((entry) => {
    const name = String(entry).toLowerCase();
    return name === type || name === 'all';
  });
  if (!type) return { amount: value, label: '' };
  if (has('di')) return { amount: 0, label: 'Immune' };
  let result = value;
  const labels = [];
  if (has('dr')) { result = Math.floor(result / 2); labels.push('Resistant'); }
  if (has('dv')) { result *= 2; labels.push('Vulnerable'); }
  return { amount: result, label: labels.join(' and ') };
}

/**
 * SRD 5.2 (Damage Threshold, rules-glossary.md): a creature or object with a
 * damage threshold is immune to all damage unless a single attack or effect
 * deals an amount equal to or greater than the threshold; then it takes the
 * entire instance. The check uses the damage of that single instance, before
 * Resistance or Vulnerability is applied.
 */
export function applyDamageThreshold(amount, threshold) {
  const damage = Math.max(0, Math.floor(Number(amount) || 0));
  const minimum = Math.max(0, Number(threshold) || 0);
  if (minimum > 0 && damage < minimum) {
    return { amount: 0, blocked: true, threshold: minimum };
  }
  return { amount: damage, blocked: false, threshold: minimum };
}
