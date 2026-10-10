import test from 'node:test';
import assert from 'node:assert/strict';
import { groupXpAwardPreview, resolveGroupXpRecipients } from '../scripts/group-xp.mjs';

test('XP award preview grants the entered amount to every recipient', () => {
  assert.deepEqual(groupXpAwardPreview(250, 4), {
    xpPerCharacter: 250,
    recipientCount: 4,
    totalXp: 1000,
  });
});

test('XP award preview rejects invalid amounts and missing recipients', () => {
  for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => groupXpAwardPreview(amount, 2), RangeError);
  }
  assert.throws(() => groupXpAwardPreview(100, 0), RangeError);
  assert.throws(() => groupXpAwardPreview(Number.MAX_SAFE_INTEGER, 2), RangeError);
});

test('group XP recipients default to everyone or resolve an explicit individual/subset', () => {
  const members = ['a1', 'a2', 'a3'];
  assert.deepEqual(resolveGroupXpRecipients(members, ['a2'], false), members);
  assert.deepEqual(resolveGroupXpRecipients(members, ['a2'], true), ['a2']);
  assert.deepEqual(resolveGroupXpRecipients(members, ['a1', 'a3'], true), ['a1', 'a3']);
  assert.throws(() => resolveGroupXpRecipients(members, ['outside'], true), RangeError);
});
