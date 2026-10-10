const ORDERS = new Set(['magician', 'warden']);

function isDruidCantrip(entry) {
  return entry?.type === 'spell' && entry.data?.classes?.includes('druid')
    && Number(entry.data?.spellLevel) === 0;
}

export function resolveDruidPrimalOrderChoice(order, extraCantripId, spellEntries = [], baseCantripIds = []) {
  if (!ORDERS.has(order)) return { valid: false, reason: 'invalid-order', order: '', extraCantrip: null };
  if (order === 'warden') return extraCantripId
    ? { valid: false, reason: 'unexpected-extra-cantrip', order, extraCantrip: null }
    : { valid: true, reason: '', order, extraCantrip: null };
  const extraCantrip = spellEntries.find((entry) => entry?.id === extraCantripId && isDruidCantrip(entry));
  if (!extraCantrip) return { valid: false, reason: 'extra-cantrip-required', order, extraCantrip: null };
  if (baseCantripIds.includes(extraCantrip.id)) return { valid: false, reason: 'duplicate-extra-cantrip', order, extraCantrip: null };
  return { valid: true, reason: '', order, extraCantrip };
}

export function druidMagicianCheckBonus(items = [], skillKey, wisdomModifier) {
  if (!['arcana', 'nature'].includes(String(skillKey || '').toLowerCase())) return 0;
  const feature = (Array.isArray(items) ? items : []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'feature' && data.classIdentifier === 'druid'
      && Number(data.levelGained) === 1 && data.identifier === 'primal-order'
      && data.selectedOrder === 'magician';
  });
  return feature ? Math.max(1, Number.isFinite(Number(wisdomModifier)) ? Number(wisdomModifier) : 0) : 0;
}
