import { ITEM_ACTION_COSTS } from './item-action-costs.mjs';

export const HEALERS_KIT_USES = 10;

/** Validate a manually adjudicated Healer's Kit use and return its one-write item patch. */
export function resolveHealersKitUse(itemData, confirmation = {}) {
  if (itemData?.identifier !== 'healers-kit') return { valid: false, error: 'wrong-item' };
  const actionCost = itemData.actionCost === undefined || itemData.actionCost === 'unknown'
    ? ITEM_ACTION_COSTS.UTILIZE
    : itemData.actionCost;
  if (actionCost !== ITEM_ACTION_COSTS.UTILIZE) return { valid: false, error: 'action-cost-unverified' };

  const targetName = String(confirmation.targetName || '').trim();
  if (!targetName) return { valid: false, error: 'target-required' };
  if (confirmation.confirmedUnconsciousAtZeroHp !== true) return { valid: false, error: 'target-prerequisite-unconfirmed' };

  const storedMax = Number(itemData.uses?.max) || 0;
  const hasStoredCount = itemData.uses?.value !== null && itemData.uses?.value !== undefined
    && Number.isInteger(Number(itemData.uses.value));
  const max = HEALERS_KIT_USES;
  const current = hasStoredCount && storedMax === HEALERS_KIT_USES
    ? Number(itemData.uses.value)
    : Number(confirmation.remainingUses);
  if (!Number.isInteger(current) || current < 1 || current > max) return { valid: false, error: 'remaining-uses-invalid' };

  return {
    valid: true,
    targetName,
    remainingUses: current - 1,
    uses: { ...(itemData.uses || {}), value: current - 1, max: HEALERS_KIT_USES, recovery: 'none', recharge: 0 },
    actionCost,
  };
}
