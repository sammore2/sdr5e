import assert from 'node:assert/strict';
import test from 'node:test';
import { effectChangesEqual, planEquippedEffectSync } from '../scripts/effect-sync-mechanics.mjs';

test('equipped effect sync updates changed bonuses and display name without changing effect identity', () => {
  const plan = planEquippedEffectSync({
    itemId: 'weapon-1', itemName: 'Fine Sword', equipped: true,
    changes: [{ key: 'attributes.meleeBonus', mode: 'add', value: 2 }],
  }, [{
    id: 'effect-1', itemId: 'weapon-1', origin: 'weapon-1', name: 'Sword',
    changes: [{ key: 'attributes.meleeBonus', mode: 'add', value: 1 }],
  }]);
  assert.equal(plan.kind, 'update');
  assert.deepEqual(plan.updates, [{ id: 'effect-1', name: 'Fine Sword', changes: [{ key: 'attributes.meleeBonus', mode: 'add', value: 2 }] }]);
  assert.equal('origin' in plan.updates[0], false);
  assert.equal('itemId' in plan.updates[0], false);
});

test('equipped effect sync treats equivalent change ordering and repeated updates as no-ops', () => {
  const desired = [
    { key: 'saves.dex.misc', mode: 'add', value: 1 },
    { key: 'attributes.meleeBonus', mode: 'add', value: 2 },
  ];
  const existing = [{
    id: 'effect-1', name: 'Sword',
    changes: [desired[1], desired[0]],
  }];
  assert.equal(effectChangesEqual(existing[0].changes, desired), true);
  assert.deepEqual(planEquippedEffectSync({ itemId: 'weapon-1', itemName: 'Sword', equipped: true, changes: desired }, existing), { kind: 'noop' });
});

test('equipped effect sync creates missing effects and removes effects when unequipped or no bonuses remain', () => {
  const change = [{ key: 'attributes.da.bonus', mode: 'add', value: 1 }];
  assert.deepEqual(planEquippedEffectSync({ itemId: 'armor-1', itemName: 'Armor', equipped: true, changes: change }), { kind: 'create' });
  assert.deepEqual(planEquippedEffectSync({ itemId: 'armor-1', itemName: 'Armor', equipped: false, changes: change }, [{ id: 'effect-1' }]), { kind: 'remove' });
  assert.deepEqual(planEquippedEffectSync({ itemId: 'armor-1', itemName: 'Armor', equipped: true, changes: [] }, [{ id: 'effect-1' }]), { kind: 'remove' });
  assert.deepEqual(planEquippedEffectSync({ itemId: 'armor-1', itemName: 'Armor', equipped: false, changes: change }), { kind: 'noop' });
});
