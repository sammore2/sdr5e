import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCOUNTER_XP_BUDGET } from '../scripts/config.mjs';
import { encounterDifficultyForXp, encounterXpBudgetForLevels } from '../scripts/encounter-budget-mechanics.mjs';

test('encounter thresholds sum each character contribution in mixed-level parties', () => {
  assert.deepEqual(encounterXpBudgetForLevels([1, 4]), {
    low: 300,
    moderate: 450,
    high: 600,
  });
  assert.deepEqual(encounterXpBudgetForLevels([2, 2, 5]), {
    low: 700,
    moderate: 1050,
    high: 1500,
  });
});

test('same-level encounter thresholds match the SRD per-character table multiplied by party size', () => {
  for (let level = 1; level <= 20; level += 1) {
    const perCharacter = ENCOUNTER_XP_BUDGET[level];
    assert.deepEqual(encounterXpBudgetForLevels([level, level, level]), {
      low: perCharacter.low * 3,
      moderate: perCharacter.moderate * 3,
      high: perCharacter.high * 3,
    });
  }
});

test('encounter difficulty preserves inclusive SRD budget boundaries', () => {
  const budget = { low: 700, moderate: 1050, high: 1600 };
  assert.equal(encounterDifficultyForXp(700, budget), 'Low');
  assert.equal(encounterDifficultyForXp(701, budget), 'Moderate');
  assert.equal(encounterDifficultyForXp(1050, budget), 'Moderate');
  assert.equal(encounterDifficultyForXp(1051, budget), 'High');
  assert.equal(encounterDifficultyForXp(1600, budget), 'High');
  assert.equal(encounterDifficultyForXp(1601, budget), 'Beyond High');
});

test('encounter budget refuses empty parties and invalid levels instead of inventing levels', () => {
  assert.equal(encounterXpBudgetForLevels([0]), null);
  assert.equal(encounterXpBudgetForLevels([1.9]), null);
  assert.equal(encounterXpBudgetForLevels(['bad']), null);
  assert.equal(encounterXpBudgetForLevels([21]), null);
  assert.equal(encounterXpBudgetForLevels([]), null);
  assert.equal(encounterDifficultyForXp(10, null), null);
});
