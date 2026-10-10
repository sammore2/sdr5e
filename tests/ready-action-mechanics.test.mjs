import test from 'node:test';
import assert from 'node:assert/strict';
import { appendReadyRecord, createReadyRecord, normalizeReadyRecords, readyActionView, removeReadyRecord } from '../scripts/ready-action-mechanics.mjs';

test('Ready nonspell records require a perceivable trigger and typed action or movement within Speed', () => {
  assert.equal(createReadyRecord({ responseType: 'action', response: 'Attack' }).reason, 'trigger-required');
  assert.equal(createReadyRecord({ trigger: 'Goblin opens door', responseType: 'action' }).reason, 'response-required');
  const action = createReadyRecord({ trigger: 'Goblin opens door', responseType: 'action', response: 'Attack goblin' }, 9);
  assert.equal(action.valid, true);
  assert.deepEqual(action.record, { trigger: 'Goblin opens door', responseType: 'action', response: 'Attack goblin' });
  const movement = createReadyRecord({ trigger: 'Orc approaches', responseType: 'movement', distance: '6' }, 9);
  assert.equal(movement.valid, true);
  assert.equal(movement.record.speed, 9);
  assert.equal(createReadyRecord({ trigger: 'Orc approaches', responseType: 'movement', distance: 10 }, 9).reason, 'movement-exceeds-speed');
  assert.equal(createReadyRecord({ trigger: 'Orc approaches', responseType: 'movement', distance: 2 }, 0).reason, 'speed-unavailable');
  assert.equal(createReadyRecord({ trigger: 'Orc approaches', responseType: 'spell' }, 9).reason, 'spell-required');
});

test('Ready spell record requires a trigger and spell name without changing legacy records', () => {
  assert.equal(createReadyRecord({ responseType: 'spell', spellName: 'Shield' }).reason, 'trigger-required');
  assert.equal(createReadyRecord({ trigger: 'Goblin attacks', responseType: 'spell' }).reason, 'spell-required');
  const result = createReadyRecord({ trigger: 'Goblin attacks', responseType: 'spell', spellName: '  Shield  ' });
  assert.deepEqual(result, { valid: true, record: { trigger: 'Goblin attacks', responseType: 'spell', spellName: 'Shield' } });
  assert.deepEqual(normalizeReadyRecords([{ trigger: 'Goblin attacks', responseType: 'spell', spellName: 'Shield' }]), [result.record]);
  assert.deepEqual(normalizeReadyRecords([{ trigger: 'Goblin attacks', responseType: 'spell', spellName: '' }]), []);
  const view = readyActionView(9, [result.record], (key) => key);
  assert.equal(view.records[0].description, 'SDR5E.ReadyAction.SpellRecord');
  assert.deepEqual(view.responseOptions.map(({ value }) => value), ['action', 'movement', 'spell']);
});

test('Ready state persists one manual declaration and permits explicit removal/clear', () => {
  const first = { trigger: 'door opens', responseType: 'action', response: 'pull lever' };
  const second = { trigger: 'door opens', responseType: 'movement', distance: 5, speed: 9 };
  assert.deepEqual(appendReadyRecord([], first), [first]);
  assert.deepEqual(appendReadyRecord([first], second), [first], 'a stale declaration must be cleared before another is recorded');
  assert.deepEqual(normalizeReadyRecords([{ ...first, trigger: '' }, { ...second, distance: 10 }]), []);
  assert.deepEqual(removeReadyRecord([first], 0), []);
  assert.deepEqual(removeReadyRecord([first], 1), [first]);
  const view = readyActionView(9, [first], (key) => key);
  assert.equal(view.canRecord, false);
  assert.match(view.note, /SDR5E\.ReadyAction\.Note/);
});
