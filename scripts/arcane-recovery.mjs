/** Resolve the SRD Wizard Arcane Recovery choice without mutating its input. */
export function resolveArcaneRecovery({ wizardLevel, spellSlots = {}, selected = {} } = {}) {
  const level = Math.trunc(Number(wizardLevel));
  if (!Number.isInteger(level) || level < 1 || level > 20) return { valid: false, reason: 'invalid-wizard-level' };
  const budget = Math.ceil(level / 2);
  let spent = 0;
  const recovered = {};
  for (let slotLevel = 1; slotLevel <= 5; slotLevel += 1) {
    const count = Math.trunc(Number(selected[slotLevel]) || 0);
    const slot = spellSlots[slotLevel] || spellSlots[String(slotLevel)];
    const missing = Math.max(0, (Number(slot?.max) || 0) - (Number(slot?.value) || 0));
    if (count < 0 || count > missing) return { valid: false, reason: 'invalid-slot-count', slotLevel };
    spent += count * slotLevel;
    if (count) recovered[slotLevel] = count;
  }
  if (Object.keys(selected).some((key) => !/^[1-5]$/.test(String(key)) && Number(selected[key]) > 0)) {
    return { valid: false, reason: 'slot-level-not-eligible' };
  }
  if (!spent || spent > budget) return { valid: false, reason: spent ? 'budget-exceeded' : 'empty-choice', budget, spent };
  const nextSlots = structuredClone(spellSlots);
  for (const [slotLevel, count] of Object.entries(recovered)) {
    const slot = nextSlots[slotLevel] || nextSlots[Number(slotLevel)];
    slot.value = Math.min(Number(slot.max) || 0, (Number(slot.value) || 0) + count);
  }
  return { valid: true, budget, spent, recovered, spellSlots: nextSlots };
}
