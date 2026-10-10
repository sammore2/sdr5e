import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMovementSheetContext } from '../scripts/movement-sheet-context.mjs';

const combat = { id: 'combat-1', combatants: [{ id: 'cast-a' }, { id: 'cast-b' }, { id: 'other' }] };
const casts = {
  'cast-a': { id: 'cast-a', actorId: 'actor-1', name: 'A', systemData: { srd5eCombatEffects: [{ id: 'slow-a', type: 'slow', sourceCastId: 'enemy', targetCastId: 'cast-a', combatId: 'combat-1', appliedTurn: { combatId: 'combat-1', round: 1, castId: 'enemy' }, expiry: 'source-next-turn-start' }], srd5eMovementLedger: { segments: [{ distance: 2, mode: 'walk' }] } } },
  'cast-b': { id: 'cast-b', actorId: 'actor-1', name: 'B', systemData: { srd5eMovementLedger: { segments: [] } } },
  other: { id: 'other', actorId: 'actor-2', name: 'Other', systemData: {} },
};
const api = { get: async (path) => casts[decodeURIComponent(path.split('/').at(-1))] };

test('movement sheet requires explicit Cast choice only when an Actor has multiple combat tokens', async () => {
  const unresolved = await resolveMovementSheetContext({ actorId: 'actor-1', combat, api, actorSpeeds: { walk: 9 } });
  assert.equal(unresolved.requiresSelection, true);
  assert.equal(unresolved.castId, '');
  assert.equal(unresolved.view, null);

  const selected = await resolveMovementSheetContext({ actorId: 'actor-1', combat, api, selectedCastId: 'cast-a', actorSpeeds: { walk: 9 } });
  assert.equal(selected.castId, 'cast-a');
  assert.equal(selected.penaltyFeet, 10);
  assert.equal(selected.speeds.walk, 6);
  assert.equal(selected.ledger.segments.length, 1);
  assert.equal(selected.view.remaining, 4);
});

test('single combat Cast is selected automatically and unrelated Casts are ignored', async () => {
  const oneCastCombat = { id: 'combat-1', combatants: [{ id: 'other' }, { id: 'cast-b' }] };
  const context = await resolveMovementSheetContext({ actorId: 'actor-1', combat: oneCastCombat, api, actorSpeeds: { walk: 9 } });
  assert.equal(context.castId, 'cast-b');
  assert.equal(context.speeds.walk, 9);
});

test('outside combat the sheet keeps the Actor-level movement ledger and speed', async () => {
  const ledger = { segments: [{ distance: 1.5, mode: 'walk' }] };
  const context = await resolveMovementSheetContext({ actorId: 'actor-1', combat: null, api, actorLedger: ledger, actorSpeeds: { walk: 9 } });
  assert.equal(context.inCombat, false);
  assert.equal(context.ledger, ledger);
  assert.equal(context.view.remaining, 7.5);
});
