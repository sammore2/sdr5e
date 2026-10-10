import { SKILL_ABILITIES } from './config.mjs';

export const CORE_ACTION_SKILL_OPTIONS = Object.freeze({
  hide: ['stealth'],
  search: ['insight', 'medicine', 'perception', 'survival'],
  study: ['arcana', 'history', 'investigation', 'nature', 'religion'],
});

export const CORE_ACTION_FIXED_DC = Object.freeze({ hide: 15 });

export function normalizeCoreActionContext(action, value) {
  if (!['search', 'study'].includes(action)) return '';
  return String(value || '').trim().slice(0, 160);
}

export function coreActionContextMetadata(action, value) {
  const context = normalizeCoreActionContext(action, value);
  return context ? { srd5eContext: context } : {};
}

export function resolveCoreActionSkillCheck(action, skillKey, systemData = {}) {
  const allowedSkills = CORE_ACTION_SKILL_OPTIONS[action];
  if (!allowedSkills) return { valid: false, reason: 'unsupported-action' };
  if (!allowedSkills.includes(skillKey)) return { valid: false, reason: 'skill-not-eligible' };
  const abilityKey = SKILL_ABILITIES[skillKey];
  const skill = systemData.skills?.[skillKey];
  const total = Number(skill?.total);
  if (!abilityKey || !skill || !Number.isFinite(total)) return { valid: false, reason: 'skill-data-unavailable' };
  return { valid: true, action, skillKey, abilityKey, total, fixedDC: CORE_ACTION_FIXED_DC[action] ?? null };
}

export function coreActionActivityView(skills = {}, localize = (key) => key) {
  return Object.entries(CORE_ACTION_SKILL_OPTIONS).map(([action, allowedSkills]) => {
    const allOptions = allowedSkills.map((key) => ({
      key,
      label: localize(`srd5e.Skills.${key}`),
      available: Number.isFinite(Number(skills?.[key]?.total)),
    }));
    const firstAvailable = allOptions.find((option) => option.available);
    return {
      action,
      label: localize(`SDR5E.CoreActions.${action}`),
      contextLabel: ['search', 'study'].includes(action) ? localize('SDR5E.CoreActions.ContextLabel') : '',
      contextPlaceholder: ['search', 'study'].includes(action) ? localize('SDR5E.CoreActions.ContextPlaceholder') : '',
      rollLabel: localize('SDR5E.CoreActions.RollCheck'),
      skillOptions: allOptions.map((option) => ({ ...option, selected: option.key === firstAvailable?.key })),
      selectedSkill: firstAvailable?.key || '',
      disabled: !firstAvailable,
    };
  });
}
