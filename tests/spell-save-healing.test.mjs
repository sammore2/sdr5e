import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSpellSaveInfo,
  isSpellAttackItem,
  isSpellHealingItem,
  resolveSpellHealingFormula,
  SPELL_HEALING_PRESETS,
} from '../scripts/spell-action-mechanics.mjs';
import { cappedHealingResult } from '../scripts/potion-mechanics.mjs';

test('getSpellSaveInfo extracts DC, ability, and half-on-save from description or item data', () => {
  const fireball = {
    description: 'Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one.',
  };
  assert.deepEqual(getSpellSaveInfo(fireball, { dc: 15 }), { dc: 15, ability: 'dex', isHalfOnSave: true });

  const sacredFlame = {
    description: 'The target must succeed on a Dexterity saving throw or take 1d8 Radiant damage.',
  };
  assert.deepEqual(getSpellSaveInfo(sacredFlame, { dc: 13 }), { dc: 13, ability: 'dex', isHalfOnSave: false });

  const thunderwave = {
    description: 'Each creature in a 15-foot Cube originating from you must make a Constitution saving throw.',
  };
  assert.deepEqual(getSpellSaveInfo(thunderwave, { dc: 14 }), { dc: 14, ability: 'con', isHalfOnSave: false });

  const nonSave = { description: 'Make a ranged spell attack against the target.' };
  assert.equal(getSpellSaveInfo(nonSave, { dc: 12 }), null);
});

test('isSpellAttackItem detects spell attacks from actionType or description', () => {
  assert.equal(isSpellAttackItem({ actionType: 'rsak' }), true);
  assert.equal(isSpellAttackItem({ description: 'Make a ranged spell attack against the target.' }), true);
  assert.equal(isSpellAttackItem({ description: 'Each creature must make a Dexterity saving throw.' }), false);
});

test('isSpellHealingItem detects healing from name, formula or description', () => {
  assert.equal(isSpellHealingItem({}, 'Cure Wounds'), true);
  assert.equal(isSpellHealingItem({}, 'Healing Word'), true);
  assert.equal(isSpellHealingItem({ healing: { formula: '1d8' } }), true);
  assert.equal(isSpellHealingItem({ description: 'A creature you touch regains 2d8 Hit Points.' }), true);
  assert.equal(isSpellHealingItem({ description: 'Deals 8d6 fire damage.' }, 'Fireball'), false);
});

test('resolveSpellHealingFormula computes exact 5e healing formulas and upcast scaling', () => {
  assert.equal(resolveSpellHealingFormula({ name: 'Cure Wounds' }, { slotLevel: 1, abilityMod: 3 }), '2d8 + 3');
  assert.equal(resolveSpellHealingFormula({ name: 'Cure Wounds' }, { slotLevel: 2, abilityMod: 3 }), '4d8 + 3');
  assert.equal(resolveSpellHealingFormula({ name: 'Healing Word' }, { slotLevel: 1, abilityMod: 2 }), '2d4 + 2');
  assert.equal(resolveSpellHealingFormula({ name: 'Healing Word' }, { slotLevel: 3, abilityMod: 4 }), '6d4 + 4');
  assert.equal(resolveSpellHealingFormula({ name: 'Heal' }, { slotLevel: 6 }), '70');
  assert.equal(resolveSpellHealingFormula({ name: 'Heal' }, { slotLevel: 7 }), '80');
});

test('cappedHealingResult never exceeds max HP and handles zero HP recovery', () => {
  assert.deepEqual(cappedHealingResult(5, 20, 10), { newValue: 15, actualHealing: 10 });
  assert.deepEqual(cappedHealingResult(18, 20, 10), { newValue: 20, actualHealing: 2 });
  assert.deepEqual(cappedHealingResult(0, 30, 8), { newValue: 8, actualHealing: 8 });
});
