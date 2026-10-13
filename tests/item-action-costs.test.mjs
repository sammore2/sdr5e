import test from 'node:test';
import { hasSrdReference, srdReferencePath, srdSkip } from './_srd-reference.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getDefaultData } from '../scripts/schema.mjs';
import { ITEM_ACTION_COSTS, ITEM_ACTION_COST_OPTIONS, itemActionCostNoticeKey, itemActionReminderKey, normalizeItemActionCost, VERIFIED_SRD_ITEM_ACTION_COSTS } from '../scripts/item-action-costs.mjs';
import { ITEM_SHEET_SCHEMAS } from '../scripts/sheet-schemas.mjs';
import { cappedHealingResult, rollPotionOfHealing } from '../scripts/potion-mechanics.mjs';

test('item action-cost metadata defaults to unclassified and rejects unknown enum values', () => {
  for (const type of ['armor', 'feature', 'item', 'consumable', 'tool']) {
    assert.equal(getDefaultData(type).actionCost, ITEM_ACTION_COSTS.UNKNOWN, `${type} must not infer an action cost`);
    const field = ITEM_SHEET_SCHEMAS[type].tabs[0].fields.find((entry) => entry.key === 'actionCost');
    assert.ok(field, `${type} exposes the typed action cost in its item sheet`);
    assert.deepEqual(field.options.map((entry) => entry.value), ITEM_ACTION_COST_OPTIONS.map((entry) => entry.value));
  }
  assert.equal(normalizeItemActionCost('utilize'), ITEM_ACTION_COSTS.UTILIZE);
  assert.equal(normalizeItemActionCost('free_text_guess'), ITEM_ACTION_COSTS.UNKNOWN);
  assert.equal(itemActionCostNoticeKey('invalid'), 'UnknownCostWarning');
  assert.equal(itemActionCostNoticeKey(ITEM_ACTION_COSTS.UTILIZE), 'KnownCostConfirmation');
  assert.equal(itemActionReminderKey(ITEM_ACTION_COSTS.UTILIZE), 'ActionReminderUtilize');
  assert.equal(itemActionReminderKey(ITEM_ACTION_COSTS.MAGIC_ACTION), 'ActionReminderMagic');
  assert.equal(itemActionReminderKey(ITEM_ACTION_COSTS.ACTION), 'ActionReminderOther');
  assert.equal(itemActionReminderKey(ITEM_ACTION_COSTS.BONUS_ACTION), 'ActionReminderBonusAction');
  assert.equal(itemActionReminderKey(ITEM_ACTION_COSTS.REACTION), 'ActionReminderReaction');
  for (const cost of [ITEM_ACTION_COSTS.NONE, ITEM_ACTION_COSTS.FREE_INTERACTION, ITEM_ACTION_COSTS.SPECIAL_TIMING, ITEM_ACTION_COSTS.UNKNOWN]) {
    assert.equal(itemActionReminderKey(cost), '', `${cost} must not imply an action checklist marker`);
  }
  assert.deepEqual(new Set(ITEM_ACTION_COST_OPTIONS.map((entry) => entry.value)), new Set(Object.values(ITEM_ACTION_COSTS)));
});

test('the two reference items have distinct verified costs supported by literal local SRD passages', { skip: srdSkip('equipment.md') }, () => {
  const source = readFileSync(srdReferencePath('equipment.md'), 'utf8');
  assert.match(source, /Healer's Kit[\s\S]{0,300}As a Utilize action[\s\S]{0,180}stabilize an Unconscious creature that has 0 Hit Points/);
  assert.match(source, /Potion of Healing[\s\S]{0,500}As a Bonus Action[\s\S]{0,200}regains 2d4 \+ 2 Hit Points/);
  assert.equal(VERIFIED_SRD_ITEM_ACTION_COSTS["healer's kit"], ITEM_ACTION_COSTS.UTILIZE);
  assert.equal(VERIFIED_SRD_ITEM_ACTION_COSTS['potion of healing'], ITEM_ACTION_COSTS.BONUS_ACTION);
  assert.equal(ITEM_ACTION_COSTS.MAGIC_ACTION, 'magic_action');
});

test('Potion of Healing pack row is source-classified for Bonus Action without changing its SRD healing formula', () => {
  const db = new DatabaseSync(new URL('../packs/magic-items.sqlite', import.meta.url), { readOnly: true });
  try {
    const rows = db.prepare('SELECT name, type, data FROM entries WHERE id = ?').all('ec1f7637-4232-4970-9db8-942232f24b8b');
    assert.equal(rows.length, 1);
    const item = JSON.parse(rows[0].data);
    assert.equal(rows[0].name, 'Potion of Healing');
    assert.equal(rows[0].type, 'consumable');
    assert.equal(item.identifier, 'potion-of-healing');
    assert.equal(item.actionCost, ITEM_ACTION_COSTS.BONUS_ACTION);
    assert.equal(item.healing.formula, '2d4+2');
    assert.equal(item.uses.value, 1);
    assert.equal(item.uses.max, 1);
  } finally {
    db.close();
  }
});

test('common Potion of Healing rolls two real d4s plus two and caps actual healing at maximum HP', () => {
  const samples = [0, 0.999999];
  const amount = rollPotionOfHealing(() => samples.shift());
  assert.equal(amount, 7, 'the controlled d4 results are 1 and 4, plus 2');
  assert.deepEqual(cappedHealingResult(8, 10, amount), { newValue: 10, actualHealing: 2 });
  assert.deepEqual(cappedHealingResult(3, 10, 4), { newValue: 7, actualHealing: 4 });
  assert.equal(rollPotionOfHealing(() => 0), 4, 'minimum is 1+1+2');
  assert.equal(rollPotionOfHealing(() => 0.999999), 10, 'maximum is 4+4+2');
});
