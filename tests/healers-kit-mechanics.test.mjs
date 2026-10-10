import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHealersKitUse, HEALERS_KIT_USES } from '../scripts/healers-kit-mechanics.mjs';
import { STARTING_EQUIPMENT_CATALOG } from '../scripts/background-equipment.mjs';
import { ITEM_ACTION_COSTS } from '../scripts/item-action-costs.mjs';

test("Soldier starting Healer's Kit has ten tracked uses and the source-verified Utilize cost", () => {
  const kit = STARTING_EQUIPMENT_CATALOG['healers-kit'];
  assert.equal(kit.identifier, 'healers-kit');
  assert.equal(kit.actionCost, ITEM_ACTION_COSTS.UTILIZE);
  assert.deepEqual(kit.uses, { value: 10, max: 10, recovery: 'none', recharge: 0 });
  assert.equal(HEALERS_KIT_USES, 10);
});

test("Healer's Kit consumes one use only after manual target and prerequisite confirmation", () => {
  const kit = { identifier: 'healers-kit', actionCost: 'utilize', uses: { value: 2, max: 10, recovery: 'none' } };
  const valid = resolveHealersKitUse(kit, { targetName: 'Fallen ally', confirmedUnconsciousAtZeroHp: true });
  assert.equal(valid.valid, true);
  assert.equal(valid.remainingUses, 1);
  assert.deepEqual(valid.uses, { value: 1, max: 10, recovery: 'none', recharge: 0 });
  assert.equal(resolveHealersKitUse(kit, { confirmedUnconsciousAtZeroHp: true }).error, 'target-required');
  assert.equal(resolveHealersKitUse(kit, { targetName: 'Fallen ally' }).error, 'target-prerequisite-unconfirmed');
  assert.equal(resolveHealersKitUse(kit, { targetName: 'Fallen ally', confirmedUnconsciousAtZeroHp: true }).remainingUses, 1);
  assert.equal(resolveHealersKitUse({ ...kit, uses: { value: 0, max: 10 } }, { targetName: 'Fallen ally', confirmedUnconsciousAtZeroHp: true }).error, 'remaining-uses-invalid');
  assert.equal(resolveHealersKitUse({ ...kit, actionCost: 'bonus_action' }, { targetName: 'Fallen ally', confirmedUnconsciousAtZeroHp: true }).error, 'action-cost-unverified');
  assert.equal(resolveHealersKitUse({ ...kit, identifier: 'other-item' }, { targetName: 'Fallen ally', confirmedUnconsciousAtZeroHp: true }).error, 'wrong-item');
});

test("legacy Healer's Kit asks the user to establish its current count instead of refilling it", () => {
  const legacy = { identifier: 'healers-kit', actionCost: 'unknown' };
  assert.equal(resolveHealersKitUse(legacy, { targetName: 'Ally', confirmedUnconsciousAtZeroHp: true }).error, 'remaining-uses-invalid');
  const resolved = resolveHealersKitUse(legacy, { targetName: 'Ally', confirmedUnconsciousAtZeroHp: true, remainingUses: '4' });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.remainingUses, 3);
  assert.equal(resolved.actionCost, 'utilize');
});
