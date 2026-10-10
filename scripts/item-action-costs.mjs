/** Closed action-cost vocabulary for item activation metadata. Unknown is the
 * safe default: no item handler should infer or spend a cost from item type. */
export const ITEM_ACTION_COSTS = Object.freeze({
  NONE: 'none',
  FREE_INTERACTION: 'free_interaction',
  UTILIZE: 'utilize',
  BONUS_ACTION: 'bonus_action',
  MAGIC_ACTION: 'magic_action',
  ACTION: 'action',
  REACTION: 'reaction',
  SPECIAL_TIMING: 'special_timing',
  UNKNOWN: 'unknown',
});

export const ITEM_ACTION_COST_OPTIONS = Object.freeze([
  { value: ITEM_ACTION_COSTS.UNKNOWN, labelKey: 'ActionCostUnknown' },
  { value: ITEM_ACTION_COSTS.NONE, labelKey: 'ActionCostNone' },
  { value: ITEM_ACTION_COSTS.FREE_INTERACTION, labelKey: 'ActionCostFreeInteraction' },
  { value: ITEM_ACTION_COSTS.UTILIZE, labelKey: 'ActionCostUtilize' },
  { value: ITEM_ACTION_COSTS.BONUS_ACTION, labelKey: 'ActionCostBonusAction' },
  { value: ITEM_ACTION_COSTS.MAGIC_ACTION, labelKey: 'ActionCostMagicAction' },
  { value: ITEM_ACTION_COSTS.ACTION, labelKey: 'ActionCostAction' },
  { value: ITEM_ACTION_COSTS.REACTION, labelKey: 'ActionCostReaction' },
  { value: ITEM_ACTION_COSTS.SPECIAL_TIMING, labelKey: 'ActionCostSpecialTiming' },
]);

const VALID_COSTS = new Set(Object.values(ITEM_ACTION_COSTS));

export const ITEM_ACTION_COST_LABEL_KEYS = Object.freeze(Object.fromEntries(
  ITEM_ACTION_COST_OPTIONS.map((option) => [option.value, option.labelKey]),
));

export function normalizeItemActionCost(value) {
  return VALID_COSTS.has(value) ? value : ITEM_ACTION_COSTS.UNKNOWN;
}

export function itemActionCostNoticeKey(value) {
  const cost = normalizeItemActionCost(value);
  return cost === ITEM_ACTION_COSTS.UNKNOWN ? 'UnknownCostWarning' : 'KnownCostConfirmation';
}

export function itemActionReminderKey(value) {
  const cost = normalizeItemActionCost(value);
  return ({
    [ITEM_ACTION_COSTS.UTILIZE]: 'ActionReminderUtilize',
    [ITEM_ACTION_COSTS.MAGIC_ACTION]: 'ActionReminderMagic',
    [ITEM_ACTION_COSTS.ACTION]: 'ActionReminderOther',
    [ITEM_ACTION_COSTS.BONUS_ACTION]: 'ActionReminderBonusAction',
    [ITEM_ACTION_COSTS.REACTION]: 'ActionReminderReaction',
  })[cost] || '';
}

// Explicitly source-verified examples; intentionally not applied by item name
// to existing records until content provenance/import contracts are audited.
export const VERIFIED_SRD_ITEM_ACTION_COSTS = Object.freeze({
  "healer's kit": ITEM_ACTION_COSTS.UTILIZE,
  'potion of healing': ITEM_ACTION_COSTS.BONUS_ACTION,
});
