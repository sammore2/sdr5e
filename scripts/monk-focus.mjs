export function monkFocusPointsAtLevel(classLevel) {
  const level = Number(classLevel);
  if (!Number.isInteger(level) || level < 2 || level > 20) return 0;
  return level;
}

/** Keep the Monk Focus pool at the Monk level while preserving spent points. */
export function syncMonkFocusUses(uses = {}, classLevel) {
  const max = monkFocusPointsAtLevel(classLevel);
  if (!max) throw new RangeError('Monk Focus requires a Monk level from 2 through 20.');
  const previousMax = Math.max(0, Number(uses.max) || 0);
  const previousValue = Math.max(0, Math.min(previousMax, Number(uses.value) || 0));
  const value = !previousMax || previousValue >= previousMax
    ? max
    : Math.max(0, max - (previousMax - previousValue));
  return { ...uses, value, max, recovery: 'sr' };
}
