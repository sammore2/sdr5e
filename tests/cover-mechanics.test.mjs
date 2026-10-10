import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_DEGREES,
  chooseDexteritySaveCoverBonus,
  resolveCoverForAttack,
  resolveCoverForDexteritySave,
  strongestMarkedCover,
} from '../scripts/cover-mechanics.mjs';

test('Cover adds only the selected strongest AC bonus and Total Cover blocks direct attacks', () => {
  assert.deepEqual(resolveCoverForAttack(COVER_DEGREES.NONE, 15), {
    valid: true, directlyTargetable: true, armorClass: 15, bonus: 0,
  });
  assert.equal(resolveCoverForAttack(COVER_DEGREES.HALF, 15).armorClass, 17);
  assert.equal(resolveCoverForAttack(COVER_DEGREES.THREE_QUARTERS, 15).armorClass, 20);
  assert.deepEqual(resolveCoverForAttack(COVER_DEGREES.TOTAL, 15), {
    valid: true, directlyTargetable: false, armorClass: null, bonus: 0,
  });
  assert.equal(resolveCoverForAttack('invalid', 15).valid, false);
});

test('Dexterity save cover applies only when the effect originates opposite the cover', () => {
  assert.deepEqual(resolveCoverForDexteritySave(COVER_DEGREES.HALF, true), { valid: true, bonus: 2 });
  assert.deepEqual(resolveCoverForDexteritySave(COVER_DEGREES.THREE_QUARTERS, true), { valid: true, bonus: 5 });
  assert.deepEqual(resolveCoverForDexteritySave(COVER_DEGREES.THREE_QUARTERS, false), { valid: true, bonus: 0 });
  assert.deepEqual(resolveCoverForDexteritySave(COVER_DEGREES.TOTAL, true), { valid: true, bonus: 0 });
});

test('multiple cover markers select the strongest degree without stacking', () => {
  assert.equal(strongestMarkedCover(['cover-half', 'cover-3q']), COVER_DEGREES.THREE_QUARTERS);
  assert.equal(strongestMarkedCover(['cover-total', 'cover-3q']), COVER_DEGREES.TOTAL);
  assert.equal(strongestMarkedCover([]), COVER_DEGREES.NONE);
});

test('Dexterity-save cover prompts only with a cover marker and defaults to the strongest marker', async () => {
  let prompt;
  const bonus = await chooseDexteritySaveCoverBonus('dex', new Set(['cover-half', 'cover-3q']), async (value) => {
    prompt = value;
    return COVER_DEGREES.THREE_QUARTERS;
  });
  assert.equal(bonus, 5);
  assert.deepEqual(prompt, {
    defaultDegree: COVER_DEGREES.THREE_QUARTERS,
    options: [COVER_DEGREES.NONE, COVER_DEGREES.HALF, COVER_DEGREES.THREE_QUARTERS],
  });
});

test('Dexterity-save cover cancellation stops before applying a bonus', async () => {
  const bonus = await chooseDexteritySaveCoverBonus('dex', ['cover-half'], async () => null);
  assert.equal(bonus, null);
});

test('Strength saves and unmarked Dexterity saves do not prompt for cover', async () => {
  let prompted = false;
  const choose = async () => { prompted = true; return COVER_DEGREES.HALF; };
  assert.equal(await chooseDexteritySaveCoverBonus('str', ['cover-half'], choose), 0);
  assert.equal(await chooseDexteritySaveCoverBonus('dex', [], choose), 0);
  assert.equal(prompted, false);
});
