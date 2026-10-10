/** SRD 5.2 Bardic Inspiration pool for a Bard's current class level. */
export function bardicInspirationUses(charismaScore) {
  const score = Number(charismaScore);
  const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
  return Math.max(1, modifier);
}

/** Bardic Inspiration die at a Bard class level (not total character level). */
export function bardicInspirationDieAtLevel(level) {
  const classLevel = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  if (classLevel >= 15) return 'd12';
  if (classLevel >= 10) return 'd10';
  if (classLevel >= 5) return 'd8';
  return 'd6';
}

/** Scale a tracked pool without restoring uses already spent on this rest. */
export function syncBardicInspiration(uses = {}, charismaScore) {
  const nextMax = bardicInspirationUses(charismaScore);
  const oldMax = Math.max(0, Number(uses.max) || 0);
  const current = Math.max(0, Number(uses.value) || 0);
  const nextValue = oldMax === 0 || current >= oldMax ? nextMax : Math.min(current, nextMax);
  return {
    ...uses,
    max: nextMax,
    value: nextValue,
    recovery: 'lr',
  };
}

/** At Initiative, Superior Inspiration refills expended uses up to two. */
export function superiorInspirationUsesAfterInitiative(currentUses) {
  const current = Number(currentUses);
  if (!Number.isFinite(current) || current < 0) return null;
  const normalized = Math.trunc(current);
  return normalized < 2 ? 2 : normalized;
}

export function resolveSuperiorInspirationRecovery({ bardLevel, hasFeature, currentUses } = {}) {
  const level = Number(bardLevel);
  const current = Number(currentUses);
  if (!Number.isFinite(level) || level < 18 || !hasFeature) {
    return { eligible: false, restored: false, uses: null, reason: 'feature-unavailable' };
  }
  const uses = superiorInspirationUsesAfterInitiative(current);
  if (uses === null) return { eligible: false, restored: false, uses: null, reason: 'invalid-uses' };
  return { eligible: true, restored: uses > current, uses, reason: '' };
}
