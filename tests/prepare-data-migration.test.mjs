import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareActorRow } from '../scripts/prepare-data.mjs';

test('legacy actor preparation is idempotent and preserves ambiguous multiclass resource totals', () => {
  const row = {
    id: 'legacy-multiclass-fixture',
    type: 'character',
    systemData: {
      details: { level: 3, senses: { custom: 'Darkvision 60 ft., Tremorsense 30 ft.', value: [] } },
      attributes: { speed: '30 ft.' },
      resources: {
        health: { value: 18, max: 22, temp: 0 },
        spellSlots: { 1: { value: 1, max: 2 }, 2: { value: 1, max: 1 } },
        hitDice: { value: 3, max: 4, die: 'd10' },
      },
    },
    items: [
      { type: 'class', system: { classIdentifier: 'wizard', levels: 1, casterType: 'full', hitDie: 'd6' } },
      { type: 'class', system: { classIdentifier: 'warlock', levels: 2, casterType: 'pact', hitDie: 'd8' } },
    ],
  };

  prepareActorRow(row);
  const afterFirstPreparation = structuredClone(row);

  assert.equal(row.systemData.resources.pactMagic.needsReview, true);
  assert.equal(row.systemData.resources.pactMagic.value, 0);
  assert.equal(row.systemData.resources.hitDice.needsReview, true);
  assert.equal(row.systemData.resources.hitDice.value, 3);
  assert.equal(row.systemData.resources.hitDice.max, 4);
  assert.equal(row.systemData.resources.spellSlots[1].value, 1);
  assert.ok(row.systemData.attributes.movement);
  assert.ok(row.systemData.attributes.senses);

  prepareActorRow(row);
  assert.deepEqual(row, afterFirstPreparation, 'a second preparation must not change migrated or derived state');
});

test('prepareActorRow handles items with a getter-only system property without throwing', () => {
  class MockItem {
    constructor(data) {
      this.systemData = data;
      this.type = data.type || 'feature';
      this.name = data.name || 'Feature';
    }
    get system() {
      return this.systemData;
    }
  }

  const fighterClass = new MockItem({
    type: 'class',
    classIdentifier: 'fighter',
    levels: 2,
    hitDie: 'd10',
  });

  const actionSurge = new MockItem({
    type: 'feature',
    classIdentifier: 'fighter',
    identifier: 'action-surge',
    uses: { value: 1, max: 1 },
  });

  const row = {
    id: 'fighter-fixture',
    type: 'character',
    systemData: {
      details: { level: 2 },
      abilities: { str: { value: 16 } },
      resources: { health: { value: 20, max: 20 } },
    },
    items: [fighterClass, actionSurge],
  };

  assert.doesNotThrow(() => {
    prepareActorRow(row);
  });
  assert.equal(actionSurge.system.uses.max, 1);
});

