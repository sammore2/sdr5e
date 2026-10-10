export function initiativeTieBreakBonus(enabled, dexterityScore) {
  if (!enabled) return 0;
  const score = Number(dexterityScore);
  return Number.isFinite(score) ? score / 100 : 0;
}

export const DEFAULT_INITIATIVE_FORMULA = '1d20 + floor((@abilities.dex.value - 10) / 2) + @attributes.initiative.value + @attributes.initiative.bonus';

export function combatInitiativeFormula(configuredFormula, tieBreakerEnabled) {
  const formula = String(configuredFormula || DEFAULT_INITIATIVE_FORMULA).trim();
  if (!tieBreakerEnabled || formula !== DEFAULT_INITIATIVE_FORMULA) return formula;
  return `${formula} + (@abilities.dex.value / 100)`;
}

/**
 * SRD (rules-glossary): Invisible gives Advantage on Initiative rolls; Incapacitated
 * gives Disadvantage. Paralyzed, Petrified, Stunned and Unconscious each include
 * the Incapacitated condition.
 */
export function initiativeConditionSources(conditions = []) {
  const list = Array.isArray(conditions) ? conditions : [];
  const has = (...names) => names.some((name) => list.includes(name));
  return {
    advantage: has('invisible') ? 1 : 0,
    disadvantage: has('incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious') ? 1 : 0,
  };
}

/** Base Initiative sources for the roll dialog: condition-derived plus a feature (e.g. Feral Instinct) advantage. */
export function initiativeBaseSources(conditions = [], featureAdvantage = false) {
  const fromConditions = initiativeConditionSources(conditions);
  return {
    advantage: fromConditions.advantage || (featureAdvantage ? 1 : 0),
    disadvantage: fromConditions.disadvantage,
  };
}

function normalizeInitiativeBase(baseAdvantage) {
  if (baseAdvantage && typeof baseAdvantage === 'object') {
    return { advantage: Math.max(0, Number(baseAdvantage.advantage) || 0), disadvantage: Math.max(0, Number(baseAdvantage.disadvantage) || 0) };
  }
  const base = Number(baseAdvantage) || 0;
  return { advantage: Math.max(0, base), disadvantage: Math.max(0, -base) };
}

/**
 * baseAdvantage is either a signed mode (1, 0, -1) or a `{ advantage, disadvantage }`
 * source object from initiativeBaseSources. Any Advantage source plus any Disadvantage
 * source cancel (SRD: Advantage and Disadvantage on the same roll cancel).
 */
export function resolveInitiativeAdvantage(baseAdvantage = 0, selectedAdvantage = 0, surprised = false) {
  const base = normalizeInitiativeBase(baseAdvantage);
  const selected = Number(selectedAdvantage) || 0;
  const advantageSources = base.advantage + Math.max(0, selected);
  const disadvantageSources = base.disadvantage + Math.max(0, -selected) + (surprised ? 1 : 0);
  if (advantageSources > 0 && disadvantageSources > 0) return 0;
  if (advantageSources > 0) return 1;
  if (disadvantageSources > 0) return -1;
  return 0;
}
