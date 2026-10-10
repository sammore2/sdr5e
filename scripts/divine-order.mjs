export const CLERIC_DIVINE_ORDER_CHOICES = Object.freeze(['protector', 'thaumaturge']);

/** Validate the Cleric level-one order and Thaumaturge's extra SRD cantrip. */
export function resolveClericDivineOrderChoice(order, extraCantripId, spellEntries = [], baseCantripIds = []) {
  if (!CLERIC_DIVINE_ORDER_CHOICES.includes(order)) {
    return { valid: false, reason: 'invalid-divine-order', order: '', extraCantrip: null };
  }
  if (order === 'protector') {
    return { valid: !extraCantripId, reason: extraCantripId ? 'unexpected-divine-order-cantrip' : '', order, extraCantrip: null };
  }
  const extraCantrip = spellEntries.find((entry) => entry?.id === extraCantripId
    && entry.data?.classes?.includes('cleric')
    && Number(entry.data?.spellLevel) === 0
    && entry.data?.source === 'SRD 5.2 (CC-BY-4.0)') || null;
  const valid = !!extraCantrip && !baseCantripIds.includes(extraCantripId);
  return { valid, reason: valid ? '' : 'eligible-extra-cantrip-required', order, extraCantrip };
}

/** Dynamic skill bonus granted by Thaumaturge; recomputed from current Wisdom. */
export function clericDivineOrderSkillBonus(order, skillKey, wisdomModifier) {
  return order === 'thaumaturge' && ['arcana', 'religion'].includes(skillKey)
    ? Math.max(1, Number(wisdomModifier) || 0) : 0;
}
