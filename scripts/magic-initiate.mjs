import { spellcastingAbilityForClass } from './class-spellcasting.mjs';

export const MAGIC_INITIATE_LISTS = Object.freeze(['cleric', 'druid', 'wizard']);
export const MAGIC_INITIATE_ABILITIES = Object.freeze(['int', 'wis', 'cha']);

export function isMagicInitiate(featName) {
  return /^magic initiate(?:\s*\((?:cleric|druid|wizard)\))?$/i.test(String(featName || '').trim());
}

export function magicInitiateAllowedLists(featName) {
  const match = /^magic initiate\s*\((cleric|druid|wizard)\)$/i.exec(String(featName || '').trim());
  return match ? [match[1].toLowerCase()] : isMagicInitiate(featName) ? [...MAGIC_INITIATE_LISTS] : [];
}

/** Validates choices against the installed spell entries, including level and list. */
export function resolveMagicInitiateChoices(featName, selection = {}, spellEntries = [], disallowedLists = []) {
  const allowedLists = magicInitiateAllowedLists(featName).filter((list) => !disallowedLists.includes(list));
  const errors = [];
  if (!allowedLists.length) errors.push('magic-initiate-no-eligible-list');
  if (!allowedLists.includes(selection.list)) errors.push('magic-initiate-list-required');
  if (!MAGIC_INITIATE_ABILITIES.includes(selection.ability)) errors.push('magic-initiate-ability-required');

  const findSpell = (id, level) => spellEntries.find((entry) => entry?.id === id
    && Number(entry.data?.spellLevel) === level
    && Array.isArray(entry.data?.classes) && entry.data.classes.includes(selection.list));
  const first = findSpell(selection.cantrips?.[0], 0);
  const second = findSpell(selection.cantrips?.[1], 0);
  const leveled = findSpell(selection.spell, 1);
  if (!first || !second || !leveled) errors.push('magic-initiate-spells-required');
  if (selection.cantrips?.[0] && selection.cantrips[0] === selection.cantrips[1]) errors.push('magic-initiate-duplicate-cantrip');

  if (errors.length) return { valid: false, errors, list: selection.list || '', ability: selection.ability || '', spells: [] };
  return {
    valid: true, errors: [], list: selection.list, ability: selection.ability,
    spells: [
      { ...first, source: 'magic-initiate-cantrip', list: selection.list, ability: selection.ability },
      { ...second, source: 'magic-initiate-cantrip', list: selection.list, ability: selection.ability },
      { ...leveled, source: 'magic-initiate-level-1', list: selection.list, ability: selection.ability },
    ],
  };
}

/** Use feat-specific casting ability for that spell without changing class casting stats. */
export function spellcastingStats(systemData = {}, spellData = {}, classItems = []) {
  const classAbility = spellcastingAbilityForClass(spellData.sourceClassIdentifier, classItems);
  const ability = MAGIC_INITIATE_ABILITIES.includes(spellData.spellcastingAbility)
    ? spellData.spellcastingAbility : classAbility || systemData.attributes?.spellcasting?.ability || 'int';
  if (ability === systemData.attributes?.spellcasting?.ability && !spellData.spellcastingAbility && !classAbility) {
    return {
      ability,
      dc: Number(systemData.attributes?.spellcasting?.dc) || 0,
      attackBonus: Number(systemData.attributes?.spellcasting?.attackBonus) || 0,
    };
  }
  const abilityData = systemData.abilities?.[ability] || {};
  const modifier = Number.isFinite(Number(abilityData.modifier))
    ? Number(abilityData.modifier) : Math.floor(((Number(abilityData.value) || 10) - 10) / 2);
  const proficiency = Number(systemData.attributes?.prof?.value) || 0;
  return { ability, dc: 8 + proficiency + modifier, attackBonus: proficiency + modifier };
}

export function buildMagicInitiateSpellData(entry, choice) {
  const level = Number(entry.data?.spellLevel) || 0;
  return {
    ...entry.data,
    prepared: true,
    spellcastingAbility: choice.ability,
    magicInitiate: { version: 1, list: entry.list || choice.list, ability: entry.ability || choice.ability, source: entry.source || '', freeCast: level === 1 },
    ...(level === 1 ? { uses: { value: 1, max: 1, recovery: 'lr', amount: 1, type: 'feat', recharge: 0 } } : {}),
  };
}

export function spellCountsTowardPreparedLimit(spellData = {}) {
  return Number(spellData.spellLevel) > 0 && !!spellData.prepared && !spellData.magicInitiate;
}

