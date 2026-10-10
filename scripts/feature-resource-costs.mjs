/** Validate all activation costs before writing either resource pool. */
export async function executeFeatureResourceCosts(actor, item, { consumeUse, spendClassResource }) {
  const data = item?.system || item?.data || {};
  const cost = Number(data.resourceCost) || 0;
  const pool = actor?.systemData?.resources?.primary;
  if (cost > 0 && !pool) {
    return { valid: false, reason: 'resource-unavailable', resource: 'Resource' };
  }
  if (cost > 0 && (Number(pool.value) || 0) < cost) {
    return { valid: false, reason: 'resource-insufficient', resource: pool.label || 'Resource' };
  }

  const uses = data.uses;
  if (uses && (Number(uses.max) || 0) > 0 && (Number(uses.value) || 0) <= 0) {
    return { valid: false, reason: 'uses-depleted', itemName: item.name };
  }

  if (!await consumeUse(actor, item)) return { valid: false, reason: 'uses-depleted', itemName: item.name };
  if (cost > 0 && !await spendClassResource(actor, cost)) {
    return { valid: false, reason: 'resource-insufficient', resource: pool?.label || 'Resource' };
  }
  return { valid: true };
}
