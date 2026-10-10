import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSpellSlotTurn, sameSpellSlotTurn, spellSlotTurnSpendRecord } from '../scripts/spell-slot-turn.mjs';

test('active spell-slot turn uses Loom tracker combat, round, and active Cast identity', () => {
  assert.deepEqual(activeSpellSlotTurn({ id: 'combat-1', round: 3, currentTurn: 1,
    combatants: [{ id: 'cast-a' }, { id: 'cast-b' }] }), { combatId: 'combat-1', round: 3, castId: 'cast-b' });
  assert.equal(activeSpellSlotTurn({ id: 'combat-1', round: 3, currentTurn: 2, combatants: [{ id: 'cast-a' }] }), null);
  assert.equal(activeSpellSlotTurn({ id: 'combat-1', round: 3, currentTurn: 0, isActive: false, combatants: [{ id: 'cast-a' }] }), null);
});

test('one spell-slot spend is limited to the same exact tracked turn, regardless of slot pool', () => {
  const turn = { combatId: 'combat-1', round: 3, castId: 'cast-a' };
  assert.equal(sameSpellSlotTurn({ combatId: 'combat-1', round: 3, castId: 'cast-a', pool: 'pact' }, turn), true);
  assert.equal(sameSpellSlotTurn({ combatId: 'combat-1', round: 3, castId: 'cast-b' }, turn), false);
  assert.equal(sameSpellSlotTurn({ combatId: 'combat-1', round: 4, castId: 'cast-a' }, turn), false);
  assert.equal(sameSpellSlotTurn({ combatId: 'combat-2', round: 3, castId: 'cast-a' }, turn), false);
  assert.equal(sameSpellSlotTurn(null, turn), false);
  assert.equal(sameSpellSlotTurn({ combatId: 'combat-1', round: 3, castId: 'cast-a' }, null), false);
});

test('turn spend record captures spell identity and records only an explicit GM override', () => {
  const turn = { combatId: 'combat-1', round: 3, castId: 'cast-a' };
  assert.deepEqual(spellSlotTurnSpendRecord(turn, { spellId: 'spell-1' }), {
    combatId: 'combat-1', round: 3, castId: 'cast-a', spellId: 'spell-1', overridden: false,
  });
  assert.deepEqual(spellSlotTurnSpendRecord(turn, { spellId: 'spell-2', overridden: true, userId: 'gm-1' }), {
    combatId: 'combat-1', round: 3, castId: 'cast-a', spellId: 'spell-2', overridden: true, userId: 'gm-1',
  });
  assert.equal(spellSlotTurnSpendRecord(turn, { spellId: '' }), null);
  assert.equal(spellSlotTurnSpendRecord(null, { spellId: 'spell-1' }), null);
});
