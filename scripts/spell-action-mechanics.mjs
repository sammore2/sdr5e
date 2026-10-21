export const SPELL_HEALING_PRESETS = Object.freeze({
  'Cure Wounds': { formula: '2d8', scaling: { perLevel: '2d8', fromLevel: 1 }, addAbility: true },
  'Healing Word': { formula: '2d4', scaling: { perLevel: '2d4', fromLevel: 1 }, addAbility: true },
  'Mass Cure Wounds': { formula: '5d8', scaling: { perLevel: '1d8', fromLevel: 5 }, addAbility: true },
  'Mass Healing Word': { formula: '2d4', scaling: { perLevel: '1d4', fromLevel: 3 }, addAbility: true },
  'Prayer of Healing': { formula: '2d8', scaling: { perLevel: '1d8', fromLevel: 2 }, addAbility: true },
  'Heal': { fixed: 70, scalingFixed: 10, fromLevel: 6 },
  'Power Word Heal': { fixed: 700 },
});

export function resolveSpellHealingFormula(idata = {}, { slotLevel = 1, abilityMod = 0 } = {}) {
  const name = idata.name || '';
  const preset = SPELL_HEALING_PRESETS[name] || (idata.identifier ? SPELL_HEALING_PRESETS[idata.identifier] : null);
  if (idata.healing?.formula) {
    let f = idata.healing.formula;
    if (idata.healing.scaling && slotLevel > (idata.healing.scaling.fromLevel ?? 1)) {
      const extra = slotLevel - (idata.healing.scaling.fromLevel ?? 1);
      f = `${f} + ${extra} * (${idata.healing.scaling.perLevel})`;
    }
    return f;
  }
  if (!preset) return null;
  if (preset.fixed) {
    const extra = preset.scalingFixed ? Math.max(0, slotLevel - preset.fromLevel) * preset.scalingFixed : 0;
    return String(preset.fixed + extra);
  }
  let formula = preset.formula;
  if (preset.scaling && slotLevel > preset.scaling.fromLevel) {
    const extraLevels = slotLevel - preset.scaling.fromLevel;
    const extraMatch = preset.scaling.perLevel.match(/^(\d+)d(\d+)$/);
    const baseMatch = formula.match(/^(\d+)d(\d+)$/);
    if (extraMatch && baseMatch && extraMatch[2] === baseMatch[2]) {
      const totalDice = Number(baseMatch[1]) + (Number(extraMatch[1]) * extraLevels);
      formula = `${totalDice}d${baseMatch[2]}`;
    } else {
      formula = `${formula} + ${extraLevels} * (${preset.scaling.perLevel})`;
    }
  }
  if (preset.addAbility && abilityMod) {
    formula = `${formula} ${abilityMod > 0 ? '+' : '-'} ${Math.abs(abilityMod)}`;
  }
  return formula;
}

export function isSpellAttackItem(idata = {}) {
  const at = String(idata.actionType || '').toLowerCase();
  if (at === 'rsak' || at === 'msak') return true;
  return /spell attack/i.test(idata.description || '');
}

export function isSpellHealingItem(idata = {}, name = '') {
  if (idata.healing?.formula) return true;
  if (name && SPELL_HEALING_PRESETS[name]) return true;
  if (idata.identifier && SPELL_HEALING_PRESETS[idata.identifier]) return true;
  return /regains?\s+.*hit points/i.test(idata.description || '');
}

export function getSpellSaveInfo(idata = {}, spellStats = {}) {
  const dc = spellStats?.dc ?? 10;
  let ability = (idata.save?.type && idata.save.type !== 'none') ? idata.save.type.toLowerCase() : null;
  if (!ability && idata.saveAbility) {
    ability = String(idata.saveAbility).toLowerCase();
  }
  if (!ability && idata.description) {
    const m = idata.description.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
    if (m) {
      const map = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
      ability = map[m[1].toLowerCase()] || null;
    }
  }
  if (!ability) return null;
  const isHalfOnSave = /half as much damage on a successful/i.test(idata.description || '')
    || idata.save?.effect === 'half';
  return { dc, ability, isHalfOnSave };
}
