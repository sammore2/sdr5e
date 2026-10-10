import { pactMagicAtLevel, SPELL_SLOT_TABLE } from './config.mjs';

/** SRD 5.2 Class Features tables; indices are class levels 1 through 20. */
export const PREPARED_CLASS_SPELLCASTING = Object.freeze({
  bard: { cantrips: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4], prepared: [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22] },
  cleric: { cantrips: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5], prepared: [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22] },
  druid: { cantrips: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4], prepared: [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22] },
  sorcerer: { cantrips: [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6], prepared: [2,4,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22] },
  warlock: { cantrips: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4], prepared: [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15] },
  wizard: { cantrips: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5], prepared: [4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25] },
  paladin: { cantrips: Array(20).fill(0), prepared: [2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15] },
  ranger: { cantrips: Array(20).fill(0), prepared: [2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15] },
});

/**
 * Per-class-level spell counts for the "known caster" flag (knownCasterType). SRD 5.2 gives
 * Bard, Sorcerer, Warlock and Ranger Prepared Spells columns, so these derive from PREPARED_CLASS_SPELLCASTING.
 */
export const KNOWN_SPELLS_TABLE = Object.freeze({
  bard: PREPARED_CLASS_SPELLCASTING.bard.prepared,
  sorcerer: PREPARED_CLASS_SPELLCASTING.sorcerer.prepared,
  warlock: PREPARED_CLASS_SPELLCASTING.warlock.prepared,
  ranger: PREPARED_CLASS_SPELLCASTING.ranger.prepared,
});

export const KNOWN_CANTRIPS_TABLE = Object.freeze({
  bard: PREPARED_CLASS_SPELLCASTING.bard.cantrips,
  sorcerer: PREPARED_CLASS_SPELLCASTING.sorcerer.cantrips,
  warlock: PREPARED_CLASS_SPELLCASTING.warlock.cantrips,
});

/** Warlock Mystic Arcanum circles granted by the SRD 5.2 class progression. */
export const MYSTIC_ARCANUM_BY_LEVEL = Object.freeze({ 11: 6, 13: 7, 15: 8, 17: 9 });
export const SPELLCASTING_ABILITY_BY_CLASS = Object.freeze({
  bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha',
  ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int',
});

export function spellcastingAbilityForClass(classIdentifier, classItems = []) {
  if (!Object.hasOwn(SPELLCASTING_ABILITY_BY_CLASS, classIdentifier)) return null;
  return classItems.some((item) => item?.type === 'class'
    && (item.system || item.data || {}).classIdentifier === classIdentifier)
    ? SPELLCASTING_ABILITY_BY_CLASS[classIdentifier] : null;
}

export function mysticArcanumCircleAtLevel(classIdentifier, classLevel) {
  return classIdentifier === 'warlock' ? (MYSTIC_ARCANUM_BY_LEVEL[Number(classLevel)] || 0) : 0;
}

export function isValidMysticArcanumSpell(data, circle, classIdentifier = 'warlock') {
  return classIdentifier === 'warlock' && Number(data?.spellLevel) === Number(circle)
    && data?.classes?.includes('warlock');
}

export function mysticArcanumUseState(value = 1) {
  const current = Math.max(0, Math.min(1, Number(value) || 0));
  return { value: current, max: 1, recovery: 'lr', recharge: 0 };
}

/** Validate an exact Cleric/Druid replacement list selected after a Long Rest. */
export function resolveLongRestPreparedSpellChoices(classIdentifier, classLevel, candidates, selectedIds, replacement = {}) {
  const progression = classSpellcastingAtLevel(classIdentifier, classLevel);
  if (!['cleric', 'druid', 'paladin', 'ranger', 'wizard'].includes(classIdentifier) || !progression
    || !Array.isArray(candidates) || !Array.isArray(selectedIds)) {
    return { valid: false, errors: ['unsupported-preparation-flow'], selected: [] };
  }
  if (['paladin', 'ranger'].includes(classIdentifier)) {
    const currentIds = replacement.currentPreparedIds;
    const outId = replacement.replaceId || '';
    const inId = replacement.replacementId || '';
    if (!Array.isArray(currentIds) || currentIds.length !== progression.prepared
      || new Set(currentIds).size !== currentIds.length) return { valid: false, errors: ['prepared-count-mismatch'], selected: [] };
    const current = currentIds.map((id) => candidates.find((entry) => entry.id === id)).filter(Boolean);
    const selected = selectedIds.map((id) => candidates.find((entry) => entry.id === id)).filter(Boolean);
    const errors = [];
    if (current.length !== currentIds.length || current.some((entry) => !entry.actorItem
      || !entry.data?.classes?.includes(classIdentifier) || Number(entry.data?.spellLevel) < 1
      || Number(entry.data?.spellLevel) > progression.maximumSpellLevel)) errors.push('current-provenance-invalid');
    if (selected.length !== progression.prepared || selected.length !== selectedIds.length
      || new Set(selectedIds).size !== selectedIds.length) errors.push('prepared-count-mismatch');
    if (!!outId !== !!inId) errors.push('incomplete-replacement');
    let result = current;
    if (outId && inId) {
      const oldSpell = current.find((entry) => entry.id === outId);
      const newSpell = candidates.find((entry) => entry.id === inId);
      if (!oldSpell || !newSpell || newSpell.id === oldSpell.id
        || !newSpell.data?.classes?.includes(classIdentifier)
        || Number(newSpell.data?.spellLevel) < 1
        || Number(newSpell.data?.spellLevel) > progression.maximumSpellLevel
        || current.some((entry) => entry.id !== oldSpell.id
          && String(entry.name).localeCompare(newSpell.name, undefined, { sensitivity: 'base' }) === 0)) {
        errors.push('replacement-not-eligible');
      } else result = current.filter((entry) => entry.id !== oldSpell.id).concat({ ...newSpell, actorItem: newSpell.actorItem });
    }
    return { valid: errors.length === 0, errors, selected: result };
  }
  const selected = selectedIds.map((id) => candidates.find((entry) => entry.id === id)).filter(Boolean);
  const names = selected.map((entry) => String(entry.name || '').trim().toLocaleLowerCase());
  const eligibleForClass = (entry) => entry.data?.classes?.includes(classIdentifier)
    && Number(entry.data?.spellLevel) >= 1
    && Number(entry.data?.spellLevel) <= progression.maximumSpellLevel
    && (classIdentifier !== 'wizard' || (entry.actorItem === true
      && entry.data?.wizardSpellbook === true && entry.data?.sourceClassIdentifier === 'wizard'));
  const valid = selected.length === progression.prepared
    && new Set(selectedIds).size === selectedIds.length
    && selected.length === selectedIds.length
    && new Set(names).size === names.length
    && selected.every(eligibleForClass);
  const errors = [];
  if (selected.length !== progression.prepared) errors.push('prepared-count-mismatch');
  if (selected.length !== selectedIds.length || new Set(selectedIds).size !== selectedIds.length) errors.push('invalid-or-duplicate-choice');
  if (new Set(names).size !== names.length) errors.push('duplicate-spell-name');
  if (selected.some((entry) => !eligibleForClass(entry))) errors.push('spell-not-eligible');
  return { valid: errors.length === 0, errors, selected };
}

/** Validate all Long Rest preparation changes before any actor items are written. */
export function resolveMulticlassLongRestPreparedSpellChoices(classes, choices) {
  const eligibleClasses = (classes || []).filter(({ classIdentifier, classLevel }) =>
    ['cleric', 'druid', 'paladin', 'ranger', 'wizard'].includes(classIdentifier)
      && classSpellcastingAtLevel(classIdentifier, classLevel));
  if (!Array.isArray(choices) || choices.length !== eligibleClasses.length) {
    return { valid: false, errors: ['class-choice-count-mismatch'], choices: [] };
  }
  const byClass = new Map();
  for (const choice of choices) {
    if (!choice || byClass.has(choice.classIdentifier)) return { valid: false, errors: ['duplicate-or-invalid-class-choice'], choices: [] };
    byClass.set(choice.classIdentifier, choice);
  }
  const resolved = [];
  const errors = [];
  for (const { classIdentifier, classLevel, itemId, subclassName } of eligibleClasses) {
    const choice = byClass.get(classIdentifier);
    if (!choice) { errors.push(`missing-class-choice:${classIdentifier}`); continue; }
    const result = resolveLongRestPreparedSpellChoices(classIdentifier, classLevel,
      choice.candidates, choice.selectedIds, {
        currentPreparedIds: choice.currentPreparedIds,
        replaceId: choice.replaceId,
        replacementId: choice.replacementId,
      });
    if (!result.valid) errors.push(...result.errors.map((error) => `${classIdentifier}:${error}`));
    else {
      const isCircleLand = classIdentifier === 'druid'
        && String(subclassName || '').trim().toLocaleLowerCase() === 'circle of the land';
      const circleLandTerrain = isCircleLand ? String(choice.circleLandTerrain || '').trim().toLocaleLowerCase() : '';
      if (isCircleLand && !['arid', 'polar', 'temperate', 'tropical'].includes(circleLandTerrain)) {
        errors.push('druid:circle-land-choice-required');
      } else resolved.push({ classIdentifier, classLevel, itemId, selected: result.selected,
        ...(isCircleLand ? { circleLandTerrain, circleLandCandidates: choice.circleLandCandidates || [] } : {}),
      });
    }
  }
  if (byClass.size !== eligibleClasses.length) errors.push('unexpected-class-choice');
  return { valid: errors.length === 0, errors, choices: resolved };
}

export function classSpellcastingAtLevel(classIdentifier, classLevel) {
  const level = Number(classLevel);
  const progression = PREPARED_CLASS_SPELLCASTING[classIdentifier];
  if (!progression || !Number.isInteger(level) || level < 1 || level > 20) return null;
  const slotProgression = ['paladin', 'ranger'].includes(classIdentifier) ? SPELL_SLOT_TABLE.half : SPELL_SLOT_TABLE.full;
  const slots = slotProgression[level - 1] || [];
  let maximumSpellLevel = 0;
  slots.forEach((count, index) => { if (Number(count) > 0) maximumSpellLevel = index + 1; });
  if (classIdentifier === 'warlock') maximumSpellLevel = pactMagicAtLevel(level).spellLevel;
  return {
    classIdentifier,
    classLevel: level,
    cantrips: progression.cantrips[level - 1],
    prepared: progression.prepared[level - 1],
    maximumSpellLevel,
  };
}

export function preparedSpellCapacityForClass(classIdentifier, classItems = []) {
  const classItem = classItems.find((item) => item?.type === 'class'
    && (item.system || item.data || {}).classIdentifier === classIdentifier);
  if (!classItem) return null;
  const data = classItem.system || classItem.data || {};
  return classSpellcastingAtLevel(classIdentifier, data.levels)?.prepared ?? null;
}

export function spellEligibleForClassPreparation(spellData, classIdentifier, classItems = []) {
  const classItem = classItems.find((item) => item?.type === 'class'
    && (item.system || item.data || {}).classIdentifier === classIdentifier);
  if (!classItem || spellData?.sourceClassIdentifier !== classIdentifier
    || !spellData?.classes?.includes(classIdentifier)) return false;
  const data = classItem.system || classItem.data || {};
  const progression = classSpellcastingAtLevel(classIdentifier, data.levels);
  const spellLevel = Number(spellData?.spellLevel);
  if (!progression || !Number.isInteger(spellLevel) || spellLevel < 1
    || spellLevel > progression.maximumSpellLevel) return false;
  return classIdentifier !== 'wizard' || spellData?.wizardSpellbook === true;
}

/** Table-derived prepared/cantrip deltas and replacement rules for one class level. */
export function classSpellcastingLevelUpAtLevel(classIdentifier, currentClassLevel, nextClassLevel) {
  if (!['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'paladin', 'ranger'].includes(classIdentifier)) return null;
  const current = classSpellcastingAtLevel(classIdentifier, currentClassLevel);
  const next = classSpellcastingAtLevel(classIdentifier, nextClassLevel);
  if (!current || !next || next.classLevel !== current.classLevel + 1) return null;
  return {
    classIdentifier,
    currentClassLevel: current.classLevel,
    nextClassLevel: next.classLevel,
    newCantrips: Math.max(0, next.cantrips - current.cantrips),
    newPreparedSpells: Math.max(0, next.prepared - current.prepared),
    maximumSpellLevel: next.maximumSpellLevel,
    replacePreparedSpell: ['bard', 'sorcerer', 'warlock'].includes(classIdentifier),
    replaceCantrip: ['bard', 'sorcerer', 'warlock'].includes(classIdentifier),
  };
}

/** Require explicit Bard provenance before automating its mandatory replacements. */
export function inspectBardSpellState(classLevel, preparedItems, cantripItems) {
  return inspectPreparedSpellState('bard', classLevel, preparedItems, cantripItems, true);
}

export function inspectPreparedSpellState(classIdentifier, classLevel, preparedItems, cantripItems, exactPreparedCount = false) {
  const progression = classSpellcastingAtLevel(classIdentifier, classLevel);
  if (!progression || !Array.isArray(preparedItems) || !Array.isArray(cantripItems)) {
    return { valid: false, errors: ['prepared-spell-data-unavailable'] };
  }
  const dataOf = (item) => item?.system || item?.data || {};
  const errors = [];
  if (exactPreparedCount ? preparedItems.length !== progression.prepared : preparedItems.length > progression.prepared) errors.push('prepared-spell-count-mismatch');
  if (cantripItems.length !== progression.cantrips) errors.push('cantrip-count-mismatch');
  if (preparedItems.some((item) => dataOf(item).sourceClassIdentifier !== classIdentifier
    || !dataOf(item).classes?.includes(classIdentifier) || Number(dataOf(item).spellLevel) < 1
    || Number(dataOf(item).spellLevel) > progression.maximumSpellLevel)) errors.push('bard-prepared-provenance-invalid');
  if (cantripItems.some((item) => dataOf(item).sourceClassIdentifier !== classIdentifier
    || !dataOf(item).classes?.includes(classIdentifier) || Number(dataOf(item).spellLevel) !== 0)) errors.push('cantrip-provenance-invalid');
  return { valid: errors.length === 0, errors, progression };
}

export function wizardSpellcastingLevelUpAtLevel(currentClassLevel, nextClassLevel) {
  const current = classSpellcastingAtLevel('wizard', currentClassLevel);
  const next = classSpellcastingAtLevel('wizard', nextClassLevel);
  if (!current || !next || next.classLevel !== current.classLevel + 1) return null;
  return {
    currentClassLevel: current.classLevel,
    nextClassLevel: next.classLevel,
    newSpellbookSpells: next.classLevel > 1 ? 2 : 0,
    newCantrips: Math.max(0, next.cantrips - current.cantrips),
    currentPreparedCapacity: current.prepared,
    nextPreparedCapacity: next.prepared,
    maximumSpellLevel: next.maximumSpellLevel,
  };
}

/** Reject ambiguous legacy Wizard items before any spellbook progression write. */
export function inspectWizardSpellbookState(classLevel, spellbookItems, cantripItems) {
  const progression = classSpellcastingAtLevel('wizard', classLevel);
  if (!progression || !Array.isArray(spellbookItems) || !Array.isArray(cantripItems)) {
    return { valid: false, errors: ['wizard-spellbook-data-unavailable'], preparedCount: 0, expectedSpellbookCount: 0 };
  }
  const dataOf = (item) => item?.system || item?.data || {};
  const expectedSpellbookCount = 6 + (2 * (progression.classLevel - 1));
  const errors = [];
  const bookNames = spellbookItems.map((item) => String(item.name || '').toLocaleLowerCase());
  const preparedCount = spellbookItems.filter((item) => dataOf(item).prepared).length;
  if (spellbookItems.length !== expectedSpellbookCount) errors.push('wizard-spellbook-count-mismatch');
  if (new Set(bookNames).size !== bookNames.length || bookNames.includes('')) errors.push('duplicate-or-unnamed-wizard-spell');
  if (spellbookItems.some((item) => {
    const data = dataOf(item);
    const learnedAt = Number(data.learnedAtWizardLevel);
    const acquisition = classSpellcastingAtLevel('wizard', learnedAt);
    return data.wizardSpellbook !== true || data.sourceClassIdentifier !== 'wizard'
      || !data.classes?.includes('wizard') || Number(data.spellLevel) < 1
      || !acquisition || learnedAt > progression.classLevel || Number(data.spellLevel) > acquisition.maximumSpellLevel;
  })) errors.push('wizard-spellbook-provenance-invalid');
  if (cantripItems.length !== progression.cantrips
    || cantripItems.some((item) => dataOf(item).sourceClassIdentifier !== 'wizard'
      || Number(dataOf(item).spellLevel) !== 0 || !dataOf(item).classes?.includes('wizard')
      || !wizardCreationChoicesAtLevel(Number(dataOf(item).learnedAtWizardLevel))?.cantripCount)) {
    errors.push('wizard-cantrip-provenance-invalid');
  }
  const acquiredCantrips = new Map();
  for (const item of cantripItems) {
    const level = Number(dataOf(item).learnedAtWizardLevel);
    acquiredCantrips.set(level, (acquiredCantrips.get(level) || 0) + 1);
  }
  for (let level = 1; level <= progression.classLevel; level += 1) {
    const expected = wizardCreationChoicesAtLevel(level).cantripCount;
    if ((acquiredCantrips.get(level) || 0) !== expected) errors.push('wizard-cantrip-level-provenance-invalid');
  }
  if (preparedCount > progression.prepared) errors.push('wizard-prepared-count-exceeds-table');
  return { valid: errors.length === 0, errors, preparedCount, expectedSpellbookCount, progression };
}

export function wizardCreationChoicesAtLevel(classLevel) {
  const progression = classSpellcastingAtLevel('wizard', classLevel);
  const previous = Number(classLevel) === 1 ? null : classSpellcastingAtLevel('wizard', Number(classLevel) - 1);
  if (!progression) return null;
  return {
    classLevel: progression.classLevel,
    spellbookCount: progression.classLevel === 1 ? 6 : 2,
    cantripCount: previous ? Math.max(0, progression.cantrips - previous.cantrips) : progression.cantrips,
    preparedCount: progression.prepared,
    maximumSpellLevel: progression.maximumSpellLevel,
  };
}

/** Validate a complete Wizard start; every acquired spell stays tied to its class level. */
export function resolveWizardCreationChoices(targetLevel, spellEntries, selection = {}) {
  const finalProgression = classSpellcastingAtLevel('wizard', targetLevel);
  if (!finalProgression || !Array.isArray(spellEntries)) return { valid: false, errors: ['spell-data-unavailable'], cantrips: [], spellbook: [], prepared: [] };
  const errors = [];
  const resolve = (ids, levelMin, levelMax, allowedIds = null) => {
    if (!Array.isArray(ids)) return [];
    if (new Set(ids).size !== ids.length) errors.push('duplicate-spell-choice');
    return ids.map((id) => spellEntries.find((entry) => entry?.id === id
      && entry.data?.classes?.includes('wizard')
      && Number(entry.data?.spellLevel) >= levelMin
      && Number(entry.data?.spellLevel) <= levelMax
      && (!allowedIds || allowedIds.has(id)))).filter(Boolean);
  };
  const cantrips = [];
  const spellbook = [];
  const spellbookIds = new Set();
  const cantripIds = new Set();
  for (let level = 1; level <= finalProgression.classLevel; level += 1) {
    const counts = wizardCreationChoicesAtLevel(level);
    const bookIds = selection.spellbookByLevel?.[level] || [];
    const cantripChoices = selection.cantripsByLevel?.[level] || [];
    const selectedBook = resolve(bookIds, 1, counts.maximumSpellLevel);
    const selectedCantrips = resolve(cantripChoices, 0, 0);
    if (selectedBook.length !== counts.spellbookCount) errors.push(`wizard-spellbook-count-mismatch-${level}`);
    if (selectedCantrips.length !== counts.cantripCount) errors.push(`wizard-cantrip-count-mismatch-${level}`);
    for (const entry of selectedBook) {
      if (spellbookIds.has(entry.id)) errors.push('duplicate-spell-choice');
      spellbookIds.add(entry.id);
      spellbook.push({ ...entry, learnedAtWizardLevel: level });
    }
    for (const entry of selectedCantrips) {
      if (cantripIds.has(entry.id)) errors.push('duplicate-spell-choice');
      cantripIds.add(entry.id);
      cantrips.push({ ...entry, learnedAtWizardLevel: level });
    }
    if (selectedBook.length !== bookIds.length || selectedCantrips.length !== cantripChoices.length) errors.push('spell-not-in-wizard-list-or-level');
  }
  const preparedIds = selection.prepared || [];
  const prepared = resolve(preparedIds, 1, finalProgression.maximumSpellLevel, spellbookIds);
  if (prepared.length !== finalProgression.prepared) errors.push('wizard-prepared-count-mismatch');
  if (prepared.length !== preparedIds.length) errors.push('prepared-spell-not-in-spellbook');
  return { valid: errors.length === 0, errors, cantrips, spellbook, prepared, progression: finalProgression };
}

/** Backwards-compatible helper for the SRD level-1 foundation. */
export function resolveWizardLevelOneChoices(spellEntries, selection = {}) {
  return resolveWizardCreationChoices(1, spellEntries, {
    cantripsByLevel: { 1: selection.cantrips || [] },
    spellbookByLevel: { 1: selection.spellbook || [] },
    prepared: selection.prepared || [],
  });
}

export function resolvePreparedClassSpellChoices(classIdentifier, classLevel, spellEntries, selection = {}) {
  const progression = classSpellcastingAtLevel(classIdentifier, classLevel);
  if (!progression || !Array.isArray(spellEntries)) return { valid: false, errors: ['unsupported-prepared-caster'], progression, cantrips: [], prepared: [] };
  const errors = [];
  const resolveIds = (ids, levelMin, levelMax) => {
    if (!Array.isArray(ids)) return [];
    const unique = new Set(ids);
    if (unique.size !== ids.length) errors.push('duplicate-spell-choice');
    return ids.map((id) => spellEntries.find((entry) => entry?.id === id
      && entry.data?.classes?.includes(classIdentifier)
      && Number(entry.data?.spellLevel) >= levelMin
      && Number(entry.data?.spellLevel) <= levelMax)).filter(Boolean);
  };
  const cantrips = resolveIds(selection.cantrips, 0, 0);
  const prepared = resolveIds(selection.prepared, 1, progression.maximumSpellLevel);
  if (cantrips.length !== progression.cantrips) errors.push('cantrip-count-mismatch');
  if (['bard', 'sorcerer', 'warlock', 'paladin', 'ranger'].includes(classIdentifier)
    ? prepared.length !== progression.prepared
    : prepared.length > progression.prepared) {
    errors.push(classIdentifier === 'bard' ? 'prepared-spell-count-mismatch' : 'prepared-spell-limit-exceeded');
  }
  if (cantrips.length !== (selection.cantrips || []).length || prepared.length !== (selection.prepared || []).length) errors.push('spell-not-in-class-list-or-level');
  return { valid: errors.length === 0, errors, progression, cantrips, prepared };
}
