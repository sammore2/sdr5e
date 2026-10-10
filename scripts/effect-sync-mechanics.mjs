/** Compare effect changes as a set so property insertion order does not trigger writes. */
function comparableChanges(changes) {
  if (!Array.isArray(changes)) return [];
  return changes.map((change) => ({
    key: String(change?.key || ''),
    mode: String(change?.mode || ''),
    value: change?.value,
  })).sort((left, right) => left.key.localeCompare(right.key)
    || left.mode.localeCompare(right.mode)
    || String(left.value).localeCompare(String(right.value)));
}

export function effectChangesEqual(left, right) {
  return JSON.stringify(comparableChanges(left)) === JSON.stringify(comparableChanges(right));
}

/** Plan only the effect writes needed to match the current equipped item. */
export function planEquippedEffectSync({ itemId, itemName, equipped, changes }, existingEffects = []) {
  const id = String(itemId || '');
  if (!id) return { kind: 'noop' };
  const existing = Array.isArray(existingEffects) ? existingEffects.filter((effect) => effect?.id) : [];
  if (!equipped || !Array.isArray(changes) || changes.length === 0) {
    return existing.length ? { kind: 'remove' } : { kind: 'noop' };
  }
  if (!existing.length) return { kind: 'create' };

  const updates = existing.filter((effect) => effect.name !== itemName || !effectChangesEqual(effect.changes, changes))
    .map((effect) => ({ id: String(effect.id), name: String(itemName || ''), changes: changes.map((change) => ({ ...change })) }));
  return updates.length ? { kind: 'update', updates } : { kind: 'noop' };
}
