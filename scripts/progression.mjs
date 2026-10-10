import { abilityChoiceLevelsFor, EPIC_BOON_LEVEL, subclassLevelFor } from './config.mjs';
import { featMechanicsSupport, getFeatMechanics, resolveFeatMechanicChoices } from './feat-mechanics.mjs';

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// Each inner array is one valid primary-ability combination from the SRD.
// Multiple combinations mean OR (Fighter); abilities in one combination mean AND.
export const MULTICLASS_PRIMARY_ABILITY_REQUIREMENTS = Object.freeze({
  barbarian: [['str']],
  bard: [['cha']],
  cleric: [['wis']],
  druid: [['wis']],
  fighter: [['str'], ['dex']],
  monk: [['dex', 'wis']],
  paladin: [['str', 'cha']],
  ranger: [['dex', 'wis']],
  rogue: [['dex']],
  sorcerer: [['cha']],
  warlock: [['cha']],
  wizard: [['int']],
});

/**
 * Check the SRD ability-score prerequisites before adding a new class.
 * This intentionally does not modify a character or imply that the wizard
 * currently supports adding a class.
 */
export function resolveMulticlassPrerequisites(newClassIdentifier, currentClassIdentifiers, abilityScores) {
  const newClass = String(newClassIdentifier || '').trim().toLowerCase();
  const currentClasses = [...new Set((Array.isArray(currentClassIdentifiers) ? currentClassIdentifiers : [])
    .map((identifier) => String(identifier || '').trim().toLowerCase()).filter(Boolean))];
  const classes = [...new Set([...currentClasses, newClass].filter(Boolean))];
  const unknownClasses = classes.filter((identifier) => !MULTICLASS_PRIMARY_ABILITY_REQUIREMENTS[identifier]);
  const errors = [];
  if (!newClass) errors.push({ code: 'missing-new-class' });
  if (currentClasses.includes(newClass)) errors.push({ code: 'class-already-present', classIdentifier: newClass });
  if (unknownClasses.length) errors.push(...unknownClasses.map((classIdentifier) => ({ code: 'unknown-class', classIdentifier })));

  const scoreFor = (ability) => {
    const raw = abilityScores?.[ability];
    const score = typeof raw === 'object' && raw !== null ? raw.value : raw;
    return score === undefined || score === null || score === '' || !Number.isFinite(Number(score)) ? null : Number(score);
  };
  const checks = classes.filter((identifier) => MULTICLASS_PRIMARY_ABILITY_REQUIREMENTS[identifier]).map((classIdentifier) => {
    const alternatives = MULTICLASS_PRIMARY_ABILITY_REQUIREMENTS[classIdentifier].map((combination) => ({
      abilities: [...combination],
      met: combination.every((ability) => scoreFor(ability) !== null && scoreFor(ability) >= 13),
      scores: Object.fromEntries(combination.map((ability) => [ability, scoreFor(ability)])),
    }));
    return { classIdentifier, met: alternatives.some(({ met }) => met), alternatives };
  });
  return {
    valid: errors.length === 0 && checks.every(({ met }) => met),
    missing: !newClass || classes.some((identifier) => !MULTICLASS_PRIMARY_ABILITY_REQUIREMENTS[identifier]),
    errors,
    failedClasses: checks.filter(({ met }) => !met).map(({ classIdentifier }) => classIdentifier),
    checks,
  };
}

export function exhaustionD20Penalty(level) {
  const exhaustion = Math.max(0, Math.min(6, Number(level) || 0));
  return -2 * exhaustion;
}

/** Deterministic class-level entitlements shared by character creation and Level Up. */
export function progressionAtLevel(classIdentifier, level, { hasSubclass = false } = {}) {
  const classLevel = Number(level);
  if (!Number.isInteger(classLevel) || classLevel < 1 || classLevel > 20) {
    throw new RangeError(`Class level must be an integer from 1 to 20; received ${level}.`);
  }
  return {
    classIdentifier,
    level: classLevel,
    abilityImprovement: abilityChoiceLevelsFor(classIdentifier).includes(classLevel),
    epicBoon: classLevel === EPIC_BOON_LEVEL,
    subclass: !hasSubclass && classLevel >= subclassLevelFor(classIdentifier),
  };
}

/**
 * Build the deterministic level-by-level choices a wizard must collect.
 * This is the shared rules engine for starting characters and level-ups; UI
 * flows may group these choices differently, but must not invent entitlements.
 */
export function buildProgressionPlan(classIdentifier, fromLevel, toLevel, options = {}) {
  const from = Number(fromLevel);
  const to = Number(toLevel);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > 20) {
    throw new RangeError(`Invalid progression range ${fromLevel}..${toLevel}.`);
  }

  let hasSubclass = !!options.hasSubclass;
  const levels = [];
  const choices = [];
  for (let level = from + 1; level <= to; level++) {
    const entitlements = progressionAtLevel(classIdentifier, level, { hasSubclass });
    if (entitlements.subclass) {
      choices.push({ id: `${classIdentifier}:${level}:subclass`, classIdentifier, level, kind: 'subclass' });
      hasSubclass = true;
    }
    if (entitlements.abilityImprovement) {
      choices.push({ id: `${classIdentifier}:${level}:ability-improvement`, classIdentifier, level, kind: 'ability-improvement' });
    }
    if (entitlements.epicBoon) {
      choices.push({ id: `${classIdentifier}:${level}:epic-boon`, classIdentifier, level, kind: 'epic-boon' });
    }
    levels.push(entitlements);
  }

  return { classIdentifier, fromLevel: from, toLevel: to, levels, choices };
}

export function progressionBetween(classIdentifier, fromLevel, toLevel, options = {}) {
  return buildProgressionPlan(classIdentifier, fromLevel, toLevel, options).levels;
}

/**
 * Only expose feats whose prerequisites the ruleset can verify today.
 * Prerequisites beyond a single explicit level requirement stay unavailable
 * until the feat has structured prerequisite data and a tested evaluator.
 */
export function isFeatEligibleForProgression(entry, characterLevel, {
  epicBoon = false,
  existingNames = [],
  selectedNames = [],
} = {}) {
  const data = entry?.data || {};
  const description = String(data.description || '');
  const category = description.match(/Category:\s*([^\n]+)/i)?.[1]?.trim().toLowerCase();
  if (epicBoon ? category !== 'epic boon feat' : category !== 'origin feat' && category !== 'general feat') return false;
  if ((Number(data.requiresLevel) || 1) > Number(characterLevel)) return false;

  const prerequisite = description.match(/Prerequisite:\s*([^\n]+)/i)?.[1]?.trim() || '';
  if (prerequisite && !/^Level\s+\d+\+$/i.test(prerequisite)) return false;
  const prerequisiteLevel = Number(prerequisite.match(/^Level\s+(\d+)\+$/i)?.[1]) || 1;
  if (prerequisiteLevel > Number(characterLevel)) return false;

  const repeatable = /(?:^|\n)Repeatable:\s*Yes\s*(?:\n|$)/i.test(description);
  if (!repeatable) {
    const name = String(entry.name || '').toLocaleLowerCase();
    const existing = [...existingNames, ...selectedNames].some((candidate) => String(candidate || '').toLocaleLowerCase() === name);
    if (existing) return false;
  }
  return true;
}

/** Validate every player-facing choice before any character document is written. */
export function resolveAbilityScoreIncrease(initialAbilities, selection, { totalIncrease = 2, maxScore = 20 } = {}) {
  const scores = Object.fromEntries(ABILITY_KEYS.map((key) => [key, Number(initialAbilities?.[key]) || 10]));
  const first = selection?.first;
  const second = selection?.second;
  if (!ABILITY_KEYS.includes(first)) return { valid: false, missing: true, errors: [], scores, bumps: {} };
  if (second && (!ABILITY_KEYS.includes(second) || second === first)) {
    return { valid: false, missing: false, errors: [{ code: 'invalid-ability-pair' }], scores, bumps: {} };
  }
  const bumps = second
    ? { [first]: Math.floor(totalIncrease / 2), [second]: Math.ceil(totalIncrease / 2) }
    : { [first]: totalIncrease };
  const errors = [];
  for (const [key, amount] of Object.entries(bumps)) {
    scores[key] += amount;
    if (scores[key] > maxScore) errors.push({ code: 'ability-score-cap', ability: key });
  }
  return { valid: errors.length === 0, missing: false, errors, scores, bumps, first, second: second || '' };
}

export function resolveProgressionChoices(plan, initialAbilities, selections = {}, featDataByChoice = {}, initialProficiencies = {}) {
  const abilities = Object.fromEntries(ABILITY_KEYS.map((key) => [key, Number(initialAbilities?.[key]) || 10]));
  const missing = [];
  const errors = [];
  const feats = [];
  const decisions = [];
  const skills = new Set(initialProficiencies.skills || []);
  const tools = new Map((initialProficiencies.tools || []).map((tool) => [String(tool).toLocaleLowerCase(), String(tool)]));

  for (const choice of plan?.choices || []) {
    const selected = selections[choice.id] || {};
    if (choice.kind === 'subclass') {
      if (!selected.selected) missing.push(choice.id);
      else decisions.push({ ...choice, name: selected.name || '' });
      continue;
    }

    if (choice.kind === 'epic-boon' || selected.mode === 'feat') {
      if (!selected.featName) missing.push(choice.id);
      else {
        const featData = featDataByChoice[choice.id];
        const mechanics = getFeatMechanics(featData);
        const supported = featMechanicsSupport(featData);
        const abilityEffect = mechanics?.effects?.find((effect) => effect.type === 'ability-score-increase');
        if (supported.valid && mechanics.support === 'automatic' && abilityEffect) {
          const increase = resolveAbilityScoreIncrease(abilities, {
            first: selected.featAbilityFirst,
            second: selected.featAbilitySecond,
          }, abilityEffect.parameters);
          if (increase.missing) missing.push(`${choice.id}:feat-effect`);
          else if (increase.errors.length) errors.push(...increase.errors.map((error) => ({ ...error, id: choice.id })));
          else {
            for (const [key, amount] of Object.entries(increase.bumps)) abilities[key] += amount;
            decisions.push({ ...choice, kind: 'feat-effect', name: selected.featName, bumps: increase.bumps });
          }
        }
        const proficiencyEffect = mechanics?.effects?.find((effect) => effect.type === 'proficiency');
        if (supported.valid && mechanics.support === 'automatic' && proficiencyEffect) {
          const grants = resolveFeatMechanicChoices(featData, selected.featChoices, {
            skills: Object.fromEntries([...skills].map((key) => [key, { proficient: true }])), tools: [...tools.values()],
          });
          if (grants.missing) missing.push(`${choice.id}:feat-choices`);
          else if (!grants.valid) errors.push(...grants.errors.map((code) => ({ code, id: choice.id })));
          else {
            grants.skills.forEach((key) => skills.add(key));
            grants.tools.forEach((key) => tools.set(key.toLocaleLowerCase(), key));
            decisions.push({ ...choice, kind: 'feat-proficiency', name: selected.featName, skills: grants.skills, tools: grants.tools });
          }
        }
        feats.push({ ...choice, name: selected.featName, entryId: selected.featEntryId || '' });
        decisions.push({ ...choice, name: selected.featName });
      }
      continue;
    }

    const increase = resolveAbilityScoreIncrease(abilities, selected);
    if (increase.missing) {
      missing.push(choice.id);
      continue;
    }
    if (increase.errors.length) {
      errors.push(...increase.errors.map((error) => ({ ...error, id: choice.id })));
      continue;
    }
    for (const [key, amount] of Object.entries(increase.bumps)) abilities[key] += amount;
    decisions.push({ ...choice, first: increase.first, second: increase.second, bumps: increase.bumps });
  }

  return { valid: missing.length === 0 && errors.length === 0, missing, errors, abilities, feats, decisions, skills: [...skills], tools: [...tools.values()] };
}

/** Fixed-value starting HP for a single-class character at the chosen level. */
export function startingHitPoints(hitDie, level, constitutionModifier, { maxAtFirstLevel = true } = {}) {
  const classLevel = Number(level);
  if (!Number.isInteger(classLevel) || classLevel < 1 || classLevel > 20) {
    throw new RangeError(`Starting class level must be an integer from 1 to 20; received ${level}.`);
  }
  const dieSize = Number(String(hitDie || '').match(/\d+/)?.[0]) || 8;
  const con = Number(constitutionModifier) || 0;
  const firstLevel = (maxAtFirstLevel ? dieSize : Math.ceil((dieSize + 1) / 2)) + con;
  const laterLevel = Math.max(1, Math.ceil((dieSize + 1) / 2) + con);
  return Math.max(1, firstLevel) + (classLevel - 1) * laterLevel;
}
