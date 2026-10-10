import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDamageThreshold } from '../scripts/damage-mechanics.mjs';

test('damage below a threshold is superficial; damage at or above it is taken in full (SRD 5.2 example)', () => {
  assert.deepEqual(applyDamageThreshold(9, 10), { amount: 0, blocked: true, threshold: 10 });
  assert.deepEqual(applyDamageThreshold(10, 10), { amount: 10, blocked: false, threshold: 10 });
  assert.deepEqual(applyDamageThreshold(11, 10), { amount: 11, blocked: false, threshold: 10 });
});

test('the threshold is checked on the single instance before Resistance or Vulnerability', () => {
  // 9 incoming fire damage fails a threshold of 10 even though Vulnerability would double it to 18.
  assert.equal(applyDamageThreshold(9, 10).amount, 0);
  // 11 incoming damage passes the threshold; the traits are then applied to all of it.
  assert.equal(applyDamageThreshold(11, 10).amount, 11);
});

test('a threshold of zero or less does not block damage, and negative damage is clamped to zero', () => {
  assert.deepEqual(applyDamageThreshold(9, 0), { amount: 9, blocked: false, threshold: 0 });
  assert.equal(applyDamageThreshold(-3, 10).amount, 0);
});
