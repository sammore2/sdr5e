import { SKILL_ABILITIES } from './config.mjs';
import { resolveAdvantageSources } from './class-feature-mechanics.mjs';

export const INFLUENCE_CHECK_OPTIONS = Object.freeze({
  deception: { abilityKey: 'cha', interaction: 'deceive' },
  intimidation: { abilityKey: 'cha', interaction: 'intimidate' },
  performance: { abilityKey: 'cha', interaction: 'amuse' },
  persuasion: { abilityKey: 'cha', interaction: 'persuade' },
  animalHandling: { abilityKey: 'wis', interaction: 'gently-coax' },
});

export function resolveInfluenceAdjudication(input = {}, systemData = {}) {
  const branch = String(input.branch || '');
  const targetName = String(input.targetName || '').trim().slice(0, 100);
  if (!targetName || !['willing', 'unwilling', 'hesitant'].includes(branch)) return { valid: false, reason: 'invalid-branch-or-target' };
  if (branch !== 'hesitant') return { valid: true, branch, targetName, requiresCheck: false };

  const skillKey = String(input.skillKey || '');
  const option = INFLUENCE_CHECK_OPTIONS[skillKey];
  const skill = systemData.skills?.[skillKey];
  const skillTotal = Number(skill?.total);
  if (!option || SKILL_ABILITIES[skillKey] !== option.abilityKey || !Number.isFinite(skillTotal)) return { valid: false, reason: 'skill-unavailable' };
  const attitude = String(input.attitude || '');
  if (!['friendly', 'indifferent', 'hostile'].includes(attitude)) return { valid: false, reason: 'invalid-attitude' };
  const intelligence = Number(input.intelligence);
  if (!Number.isInteger(intelligence) || intelligence < 1) return { valid: false, reason: 'invalid-intelligence' };
  const rawOverride = input.dcOverride === '' || input.dcOverride === null || input.dcOverride === undefined ? null : Number(input.dcOverride);
  if (rawOverride !== null && (!Number.isInteger(rawOverride) || rawOverride < 1)) return { valid: false, reason: 'invalid-dc' };
  const defaultDC = Math.max(15, intelligence);
  return {
    valid: true,
    branch,
    targetName,
    requiresCheck: true,
    skillKey,
    abilityKey: option.abilityKey,
    skillTotal,
    interaction: option.interaction,
    attitude,
    attitudeAdvantage: attitude === 'friendly' ? 1 : attitude === 'hostile' ? -1 : 0,
    intelligence,
    defaultDC,
    dc: rawOverride ?? defaultDC,
    dcOverridden: rawOverride !== null,
  };
}

export function composeInfluenceAdvantage(existingMode, attitudeAdvantage) {
  const advantages = (existingMode === 1 ? 1 : 0) + (attitudeAdvantage === 1 ? 1 : 0);
  const disadvantages = (existingMode === -1 ? 1 : 0) + (attitudeAdvantage === -1 ? 1 : 0);
  return resolveAdvantageSources(advantages, disadvantages);
}

export function influenceFormView(systemData = {}, localize = (key) => key) {
  return {
    title: localize('SDR5E.Influence.Title'),
    note: localize('SDR5E.Influence.Note'),
    targetLabel: localize('SDR5E.Influence.Target'),
    branchLabel: localize('SDR5E.Influence.Branch'),
    willingnessLabel: localize('SDR5E.Influence.Willingness'),
    attitudeLabel: localize('SDR5E.Influence.Attitude'),
    intelligenceLabel: localize('SDR5E.Influence.Intelligence'),
    dcOverrideLabel: localize('SDR5E.Influence.DCOverride'),
    skillLabel: localize('SDR5E.Influence.Skill'),
    resolveLabel: localize('SDR5E.Influence.Resolve'),
    willingLabel: localize('SDR5E.Influence.Willing'),
    unwillingLabel: localize('SDR5E.Influence.Unwilling'),
    hesitantLabel: localize('SDR5E.Influence.Hesitant'),
    friendlyLabel: localize('SDR5E.Influence.Friendly'),
    indifferentLabel: localize('SDR5E.Influence.Indifferent'),
    hostileLabel: localize('SDR5E.Influence.Hostile'),
    skillOptions: Object.keys(INFLUENCE_CHECK_OPTIONS).map((key) => ({
      key,
      label: localize(`srd5e.Skills.${key}`),
      available: Number.isFinite(Number(systemData.skills?.[key]?.total)),
    })),
    branchOptions: [
      { key: 'willing', label: localize('SDR5E.Influence.Willing') },
      { key: 'unwilling', label: localize('SDR5E.Influence.Unwilling') },
      { key: 'hesitant', label: localize('SDR5E.Influence.Hesitant') },
    ],
    attitudeOptions: [
      { key: 'friendly', label: localize('SDR5E.Influence.Friendly') },
      { key: 'indifferent', label: localize('SDR5E.Influence.Indifferent') },
      { key: 'hostile', label: localize('SDR5E.Influence.Hostile') },
    ],
    invalidMessage: localize('SDR5E.Influence.InvalidInput'),
    skillMessage: localize('SDR5E.Influence.SkillUnavailable'),
    attitudeMessage: localize('SDR5E.Influence.AttitudeRequired'),
    intelligenceMessage: localize('SDR5E.Influence.IntelligenceRequired'),
    dcMessage: localize('SDR5E.Influence.InvalidDC'),
    saveFailed: localize('SDR5E.Influence.PostFailed'),
    willingMessage: localize('SDR5E.Influence.WillingMessage'),
    unwillingMessage: localize('SDR5E.Influence.UnwillingMessage'),
  };
}
