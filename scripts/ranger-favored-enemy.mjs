const RANGER_FAVORED_ENEMY_USES_BY_LEVEL = Object.freeze([
  2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
]);

export function rangerFavoredEnemyUsesAtLevel(classLevel) {
  const level = Number(classLevel);
  if (!Number.isInteger(level) || level < 1 || level > 20) return 0;
  return RANGER_FAVORED_ENEMY_USES_BY_LEVEL[level - 1];
}

/** Preserve spent free casts while increasing the Ranger's long-rest pool. */
export function syncRangerFavoredEnemyUses(uses = {}, classLevel) {
  const max = rangerFavoredEnemyUsesAtLevel(classLevel);
  if (!max) throw new RangeError('Ranger Favored Enemy requires a Ranger level from 1 through 20.');
  const previousMax = Math.max(0, Number(uses.max) || 0);
  const previousValue = Math.max(0, Math.min(previousMax, Number(uses.value) || 0));
  const value = !previousMax || previousValue >= previousMax
    ? max
    : Math.max(0, max - (previousMax - previousValue));
  return { ...uses, value, max, recovery: 'lr' };
}

/** Find the single verified Hunter's Mark entry to grant as always prepared. */
export function resolveRangerFavoredEnemySpell(spellEntries = [], selectedPreparedIds = []) {
  const matches = (Array.isArray(spellEntries) ? spellEntries : []).filter((entry) =>
    String(entry?.name || '').trim().toLocaleLowerCase() === "hunter's mark"
      && Number(entry.data?.spellLevel) === 1
      && Array.isArray(entry.data?.classes) && entry.data.classes.includes('ranger'));
  if (matches.length !== 1) return { valid: false, spell: null, reason: 'verified-hunters-mark-missing-or-ambiguous' };
  const [spell] = matches;
  if ((Array.isArray(selectedPreparedIds) ? selectedPreparedIds : []).map(String).includes(String(spell.id))) {
    return { valid: false, spell: null, reason: 'favored-enemy-spell-already-selected' };
  }
  return { valid: true, spell, reason: '' };
}

export function rangerFavoredEnemySpellItemData(spellData = {}) {
  return {
    ...spellData,
    sourceClassIdentifier: 'ranger',
    prepared: true,
    alwaysPrepared: true,
  };
}
