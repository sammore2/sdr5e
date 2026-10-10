import test from 'node:test';
import assert from 'node:assert/strict';
import { attackDamageBinding, isSingleAttackTargetCount, keptAttackD20, resolveAttackAgainstTarget } from '../scripts/attack-target-mechanics.mjs';

test('attack hit uses kept natural 20 and 1 before comparing the total to AC', () => {
  const attack = { meta: { isAttack: true }, total: 1, terms: [{ kind: 'dice', faces: 20, rolls: [20] }] };
  assert.deepEqual(resolveAttackAgainstTarget(attack, 30), { resolved: true, hit: true, critical: true, natural: 20 });
  assert.deepEqual(resolveAttackAgainstTarget({ ...attack, total: 99, terms: [{ kind: 'dice', faces: 20, rolls: [1] }] }, 5), {
    resolved: true, hit: false, critical: false, natural: 1,
  });
  assert.equal(resolveAttackAgainstTarget({ ...attack, total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [15] }] }, 15).hit, true);
  assert.equal(resolveAttackAgainstTarget({ ...attack, total: 14, terms: [{ kind: 'dice', faces: 20, rolls: [15] }] }, 15).hit, false);
  assert.equal(resolveAttackAgainstTarget({ total: 20, terms: attack.terms }, 30).resolved, false, 'non-attack d20s do not resolve as attacks');
});

test('dropped natural 1/20 do not determine the attack outcome', () => {
  const roll = { meta: { isAttack: true }, total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [20, 15], dropped: [true, false] }] };
  assert.equal(keptAttackD20(roll), 15);
  assert.deepEqual(resolveAttackAgainstTarget(roll, 15), { resolved: true, hit: true, critical: false, natural: 15 });
  assert.equal(keptAttackD20({ ...roll, terms: [{ kind: 'dice', faces: 20, rolls: [1, 20], dropped: [true, false] }] }), 20);
});

test('single attack selection permits zero or one token and rejects a shared attack roll against multiple tokens', () => {
  assert.equal(isSingleAttackTargetCount(0), true, 'unselected object/location attacks remain manually adjudicated');
  assert.equal(isSingleAttackTargetCount(1), true);
  assert.equal(isSingleAttackTargetCount(2), false);
  assert.equal(isSingleAttackTargetCount(1.5), false);
});

test('attack damage stays bound to the one captured hit and never invents a target', () => {
  assert.deepEqual(attackDamageBinding([], false), { canRollDamage: true, targetBound: true, targetId: '' });
  assert.deepEqual(attackDamageBinding([{ castId: 'cast-1' }], true), { canRollDamage: true, targetBound: true, targetId: 'cast-1' });
  assert.deepEqual(attackDamageBinding([{ castId: 'cast-1' }], false), { canRollDamage: false, targetBound: true, targetId: '' });
  assert.deepEqual(attackDamageBinding([{ castId: 'cast-1' }, { castId: 'cast-2' }], true), { canRollDamage: false, targetBound: true, targetId: '' });
  assert.deepEqual(attackDamageBinding([{ name: 'Object', ac: 10 }], true), { canRollDamage: true, targetBound: true, targetId: '' }, 'unresolved target identity cannot become an application target');
});
