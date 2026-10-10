import test from 'node:test';
import assert from 'node:assert/strict';
import { creatureSizeEligibleByOneStep } from '../scripts/creature-size-mechanics.mjs';
import { addProneMarker, resolveShoveOutcome, resolveShovePrerequisites } from '../scripts/shove-mechanics.mjs';

test('Shove enforces the one-size-larger limit and asks for confirmation when size is unknown', () => {
  assert.equal(creatureSizeEligibleByOneStep('Medium', 'Large'), true);
  assert.equal(creatureSizeEligibleByOneStep('Medium', 'Huge'), false);
  assert.equal(resolveShovePrerequisites({ attackerSize: 'medium', targetSize: 'huge', withinRangeConfirmed: true }).reason, 'target-too-large');
  assert.equal(resolveShovePrerequisites({ attackerSize: 'unknown', targetSize: 'medium', withinRangeConfirmed: true }).reason, 'confirm-size');
  assert.equal(resolveShovePrerequisites({ attackerSize: 'unknown', targetSize: 'medium', sizeConfirmed: true, withinRangeConfirmed: true }).valid, true);
});

test('Shove requires explicit range confirmation and does not accept an unknown save outcome', () => {
  assert.equal(resolveShovePrerequisites({ attackerSize: 'medium', targetSize: 'medium' }).reason, 'range-required');
  assert.deepEqual(resolveShoveOutcome(null, 'prone'), { valid: false, reason: 'unadjudicated-save' });
  assert.equal(resolveShoveOutcome('success', 'push_5ft').effect, null);
});

test('failed Shove applies Prone or reports a manual 5-foot push without moving anything', () => {
  const prone = resolveShoveOutcome('failure', 'prone');
  assert.equal(prone.applyProne, true);
  assert.equal(prone.manualMovement, false);
  assert.deepEqual(addProneMarker(['grappled'], prone), ['grappled', 'prone']);
  assert.deepEqual(addProneMarker(['prone'], prone), ['prone']);
  const push = resolveShoveOutcome('failure', 'push_5ft');
  assert.equal(push.applyProne, false);
  assert.equal(push.manualMovement, true);
  assert.deepEqual(addProneMarker([], push), []);
});
