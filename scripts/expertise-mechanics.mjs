/** Validate a fixed-size Expertise choice against the actor's current skills. */
export function resolveExpertiseChoices(skills = {}, selectedSkills = [], requiredCount = 2) {
  const selected = Array.isArray(selectedSkills) ? [...new Set(selectedSkills)] : [];
  const options = Object.entries(skills)
    .filter(([, skill]) => skill?.proficient && Number(skill?.multiplier || 1) <= 1)
    .map(([key]) => key);
  const valid = Number.isInteger(requiredCount) && requiredCount > 0
    && selected.length === requiredCount && selected.every((key) => options.includes(key));
  return { valid, selected: valid ? selected : [], options, required: requiredCount,
    reason: valid ? '' : 'invalid-expertise-choices' };
}

/** Resolve Bard's cumulative level-2 and level-9 Expertise choices. */
export function resolveBardExpertiseProgression(skills = {}, selections = {}, levels = [2, 9]) {
  const effectiveSkills = Object.fromEntries(Object.entries(skills).map(([key, skill]) => [key, { ...skill }]));
  const resolved = {};
  for (const level of [...new Set(levels)].sort((a, b) => a - b)) {
    if (![2, 9].includes(level)) return { valid: false, selections: {}, skills: effectiveSkills, failedLevel: level };
    const choice = resolveExpertiseChoices(effectiveSkills, selections[level] || selections[String(level)] || [], 2);
    if (!choice.valid) return { valid: false, selections: {}, skills: effectiveSkills, failedLevel: level };
    resolved[level] = choice.selected;
    for (const key of choice.selected) effectiveSkills[key] = { ...effectiveSkills[key], multiplier: 2 };
  }
  return { valid: true, selections: resolved, skills: effectiveSkills, failedLevel: null };
}
