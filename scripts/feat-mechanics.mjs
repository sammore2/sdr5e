import { FEAT_MECHANICS_BY_IDENTIFIER, TOOL_PROFICIENCY_OPTIONS } from './feat-mechanics-data.mjs';
import { SKILL_ABILITIES } from './config.mjs';

const FEAT_SUPPORT = new Set(['automatic', 'assisted', 'manual']);
const FEAT_EFFECT_TYPES = new Set([
  'ability-score-increase',
  'proficiency',
  'spell-access',
  'resource',
  'modifier',
  'passive',
]);
const FEAT_CHOICE_TYPES = new Set(['ability', 'skill', 'tool', 'skill-or-tool', 'spell', 'spellcasting-ability', 'class']);
const IMPLEMENTED_FEAT_EFFECT_TYPES = new Set(['ability-score-increase', 'proficiency']);
const IMPLEMENTED_FEAT_CHOICE_TYPES = new Set(['ability', 'skill-or-tool']);

export function getFeatMechanics(data) {
  return data?.mechanics || FEAT_MECHANICS_BY_IDENTIFIER[data?.identifier] || null;
}

/**
 * Version 1 feat data contract:
 * { version, support, effects: [{ id, type, parameters }],
 *   choices: [{ id, type, count, options?, parameters? }] }
 * Text remains the source reference. Runtime support is opt-in and must not
 * exceed implemented/tested effect handlers.
 */
export function validateFeatMechanics(mechanics) {
  const errors = [];
  if (!mechanics || typeof mechanics !== 'object' || Array.isArray(mechanics)) {
    return { valid: false, support: 'manual', errors: ['mechanics-not-structured'] };
  }
  if (mechanics.version !== 1) errors.push('unsupported-version');
  if (!FEAT_SUPPORT.has(mechanics.support)) errors.push('invalid-support-status');
  if (!Array.isArray(mechanics.effects) || !Array.isArray(mechanics.choices)) errors.push('effects-and-choices-must-be-arrays');

  const effects = Array.isArray(mechanics.effects) ? mechanics.effects : [];
  const choices = Array.isArray(mechanics.choices) ? mechanics.choices : [];
  const ids = new Set();
  for (const effect of effects) {
    if (!effect || typeof effect !== 'object' || typeof effect.id !== 'string' || !effect.id.trim()) {
      errors.push('effect-id-required');
      continue;
    }
    if (ids.has(effect.id)) errors.push('duplicate-mechanic-id');
    ids.add(effect.id);
    if (!FEAT_EFFECT_TYPES.has(effect.type)) errors.push('unknown-effect-type');
    if (!effect.parameters || typeof effect.parameters !== 'object' || Array.isArray(effect.parameters)) errors.push('effect-parameters-required');
    if (effect.type === 'ability-score-increase') {
      if (!Number.isInteger(effect.parameters?.totalIncrease) || effect.parameters.totalIncrease < 1) errors.push('invalid-ability-increase-total');
      if (!Number.isInteger(effect.parameters?.maxScore) || effect.parameters.maxScore > 20 || effect.parameters.maxScore < 1) errors.push('invalid-ability-increase-cap');
      if (!effect.parameters?.choiceId) errors.push('ability-increase-choice-required');
      const linkedChoice = choices.find((choice) => choice?.id === effect.parameters.choiceId);
      if (!linkedChoice || linkedChoice.type !== 'ability') errors.push('ability-increase-choice-missing');
      else if (linkedChoice.parameters?.allocation !== 'one-plus-two-or-two-plus-one'
        || linkedChoice.parameters?.required !== 1
        || linkedChoice.parameters?.maxScore !== effect.parameters.maxScore
        || linkedChoice.count !== 2
        || !Array.isArray(linkedChoice.options)
        || linkedChoice.options.join(',') !== 'str,dex,con,int,wis,cha') errors.push('unsupported-ability-increase-choice');
    }
    if (effect.type === 'proficiency') {
      const linkedChoice = choices.find((choice) => choice?.id === effect.parameters?.choiceId);
      if (!Number.isInteger(effect.parameters?.count) || effect.parameters.count < 1) errors.push('invalid-proficiency-count');
      if (!linkedChoice || linkedChoice.type !== 'skill-or-tool'
        || linkedChoice.count !== effect.parameters?.count
        || !Array.isArray(linkedChoice.options)
        || linkedChoice.options.some((option) => {
          if (typeof option !== 'string') return true;
          if (option.startsWith('skill:')) return !Object.hasOwn(SKILL_ABILITIES, option.slice(6));
          if (option.startsWith('tool:')) return !TOOL_PROFICIENCY_OPTIONS.includes(option.slice(5));
          return true;
        })
        || effect.parameters?.preventDuplicates !== true) errors.push('unsupported-proficiency-choice');
    }
  }
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object' || typeof choice.id !== 'string' || !choice.id.trim()) {
      errors.push('choice-id-required');
      continue;
    }
    if (ids.has(choice.id)) errors.push('duplicate-mechanic-id');
    ids.add(choice.id);
    if (!FEAT_CHOICE_TYPES.has(choice.type)) errors.push('unknown-choice-type');
    if (!Number.isInteger(choice.count) || choice.count < 1) errors.push('invalid-choice-count');
    if (choice.options !== undefined && (!Array.isArray(choice.options) || choice.options.length === 0
      || choice.options.some((option) => typeof option !== 'string' || !option.trim()))) errors.push('invalid-choice-options');
    if (choice.parameters !== undefined && (!choice.parameters || typeof choice.parameters !== 'object' || Array.isArray(choice.parameters))) errors.push('invalid-choice-parameters');
  }

  // The allowlists only include feat effect handlers implemented and tested here.
  if (mechanics.support !== 'manual' && effects.some((effect) => !IMPLEMENTED_FEAT_EFFECT_TYPES.has(effect?.type))) {
    errors.push('runtime-effect-handlers-not-verified');
  }
  if (mechanics.support !== 'manual' && choices.some((choice) => !IMPLEMENTED_FEAT_CHOICE_TYPES.has(choice?.type))) {
    errors.push('runtime-choice-handlers-not-verified');
  }
  return { valid: errors.length === 0, support: errors.length ? 'manual' : mechanics.support, errors };
}

export function resolveFeatMechanicChoices(data, selected = [], { skills = {}, tools = [] } = {}) {
  const mechanics = getFeatMechanics(data);
  const validation = validateFeatMechanics(mechanics);
  if (!validation.valid || mechanics.support !== 'automatic'
    || mechanics.effects.some((candidate) => candidate.type !== 'proficiency')) {
    return { valid: false, supported: false, missing: false, errors: ['feat-effects-manual'], skills: [], tools: [] };
  }
  const effect = mechanics.effects.find((candidate) => candidate.type === 'proficiency');
  if (!effect) return { valid: true, supported: true, missing: false, errors: [], skills: [], tools: [] };
  const choice = mechanics.choices.find((candidate) => candidate.id === effect.parameters.choiceId);
  if (!Array.isArray(selected) || selected.length !== choice.count) {
    return { valid: false, supported: true, missing: true, errors: [], skills: [], tools: [] };
  }
  if (new Set(selected).size !== selected.length || selected.some((value) => !choice.options.includes(value))) {
    return { valid: false, supported: true, missing: false, errors: ['invalid-proficiency-selections'], skills: [], tools: [] };
  }
  const skillKeys = new Set(Object.entries(skills).filter(([, value]) => value?.proficient === true || value === true).map(([key]) => key));
  const toolNames = new Set((tools || []).map((tool) => String(tool).toLocaleLowerCase()));
  const grantedSkills = [];
  const grantedTools = [];
  for (const value of selected) {
    const [kind, ...rest] = value.split(':');
    const subject = rest.join(':');
    if (kind === 'skill') {
      if (skillKeys.has(subject)) return { valid: false, supported: true, missing: false, errors: ['proficiency-already-owned'], skills: [], tools: [] };
      grantedSkills.push(subject);
    } else if (kind === 'tool') {
      if (toolNames.has(subject.toLocaleLowerCase())) return { valid: false, supported: true, missing: false, errors: ['proficiency-already-owned'], skills: [], tools: [] };
      grantedTools.push(subject);
    }
  }
  return { valid: true, supported: true, missing: false, errors: [], skills: grantedSkills, tools: grantedTools };
}

export function featMechanicsSupport(data) {
  return validateFeatMechanics(getFeatMechanics(data));
}

export function withFeatMechanics(entry) {
  const mechanics = getFeatMechanics(entry?.data);
  return mechanics ? { ...entry, data: { ...entry.data, mechanics } } : entry;
}
