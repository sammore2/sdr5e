import test from 'node:test';
import assert from 'node:assert/strict';
import { clearDodgeRecord, dodgeActionView, normalizeDodgeRecord, setDodgeRecord } from '../scripts/dodge-mechanics.mjs';

test('Dodge is a manual reminder only and can be explicitly cleared', () => {
  assert.deepEqual(normalizeDodgeRecord(false), { active: false });
  assert.deepEqual(setDodgeRecord(), { active: true });
  assert.equal(dodgeActionView(true).active, true);
  assert.deepEqual(clearDodgeRecord(), { active: false });
  assert.deepEqual(normalizeDodgeRecord({ active: 'yes' }), { active: false });
});
