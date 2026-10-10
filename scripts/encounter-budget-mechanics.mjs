import { ENCOUNTER_XP_BUDGET } from './config.mjs';

const readLevel = (value) => {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 20 ? level : null;
};

/** Sum the per-character thresholds so mixed-level parties retain each member's contribution. */
export function encounterXpBudgetForLevels(levels, table = ENCOUNTER_XP_BUDGET) {
  if (!Array.isArray(levels) || levels.length === 0) return null;

  const normalizedLevels = levels.map(readLevel);
  if (normalizedLevels.some((level) => level === null)) return null;
  const thresholdsByLevel = normalizedLevels.map((level) => table[level]);
  if (thresholdsByLevel.some((thresholds) => !thresholds)) return null;

  return thresholdsByLevel.reduce((total, thresholds) => {
    total.low += thresholds.low;
    total.moderate += thresholds.moderate;
    total.high += thresholds.high;
    return total;
  }, { low: 0, moderate: 0, high: 0 });
}

export function encounterDifficultyForXp(xp, budget) {
  const totalXp = Number(xp);
  if (!Number.isFinite(totalXp) || !budget) return null;
  if (totalXp <= budget.low) return 'Low';
  if (totalXp <= budget.moderate) return 'Moderate';
  if (totalXp <= budget.high) return 'High';
  return 'Beyond High';
}
