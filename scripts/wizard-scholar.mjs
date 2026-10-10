export const WIZARD_SCHOLAR_SKILLS = Object.freeze([
  'arcana', 'history', 'investigation', 'medicine', 'nature', 'religion',
]);

/** Wizard Scholar can double proficiency only for one listed skill already proficient. */
export function resolveWizardScholarChoice(skills = {}, selectedSkill, existingChoice = '') {
  if (!WIZARD_SCHOLAR_SKILLS.includes(selectedSkill)) return { valid: false, reason: 'unsupported-skill' };
  const skill = skills[selectedSkill];
  if (!skill?.proficient) return { valid: false, reason: 'skill-not-proficient' };
  if (Number(skill.multiplier) > 1 && existingChoice !== selectedSkill) return { valid: false, reason: 'expertise-already-set' };
  return { valid: true, skill: selectedSkill, multiplier: 2 };
}
