/** Available cast modes for prepared spells and Wizard spellbook rituals. */
export function wizardSpellCastOptions(spell = {}, wizardLevel = 0) {
  const spellLevel = Number(spell.spellLevel) || 0;
  const wizardBookSpell = spellLevel > 0 && spell.sourceClassIdentifier === 'wizard'
    && spell.wizardSpellbook === true;
  // SRD 5.2 Spells: a spell must be prepared (or have access from a feature, such as an
  // always-prepared spell, Magic Initiate or Mystic Arcanum) before you can cast it.
  // Every class with a "Prepared Spells" column prepares its spells, so cantrips are the only exemption.
  const prepared = !!spell.prepared || !!spell.alwaysPrepared || !!spell.magicInitiate
    || Number(spell.mysticArcanumCircle) > 0;
  const preparedClassSpell = spellLevel > 0 && Object.hasOwn(PREPARED_CLASS_SPELLCASTING, spell.sourceClassIdentifier);
  const canCastAsRitual = spellLevel > 0 && spell.ritual === true
    && (prepared || (wizardBookSpell && Number(wizardLevel) >= 1));
  return {
    canCastNormally: !preparedClassSpell || prepared,
    canCastAsRitual,
    requiresWizardRitual: wizardBookSpell && !prepared,
  };
}

/** Resolve the one prepared-spell replacement available to Wizard 5+ on a Short Rest. */
export function resolveWizardMemorizeSpellChoice(wizardLevel, spellItems = [], replaceId, replacementId) {
  const level = Number(wizardLevel);
  if (!Number.isInteger(level) || level < 5 || !Array.isArray(spellItems)) return { valid: false, reason: 'feature-unavailable' };
  const dataOf = (item) => item?.system || item?.data || {};
  const replace = spellItems.find((item) => item.id === replaceId);
  const replacement = spellItems.find((item) => item.id === replacementId);
  const validWizardBookSpell = (item) => item?.type === 'spell' && dataOf(item).sourceClassIdentifier === 'wizard'
    && dataOf(item).wizardSpellbook === true && dataOf(item).classes?.includes('wizard')
    && Number(dataOf(item).spellLevel) >= 1
    && Number(dataOf(item).spellLevel) <= (classSpellMaximum(level));
  if (!validWizardBookSpell(replace) || !dataOf(replace).prepared) return { valid: false, reason: 'prepared-spell-required' };
  if (!validWizardBookSpell(replacement) || dataOf(replacement).prepared) return { valid: false, reason: 'unprepared-spellbook-entry-required' };
  if (replace.id === replacement.id || String(replace.name).localeCompare(replacement.name, undefined, { sensitivity: 'base' }) === 0) {
    return { valid: false, reason: 'replacement-must-differ' };
  }
  return { valid: true, replaceId, replacementId };
}

/** Validate the two spellbook selections granted by Wizard Spell Mastery. */
export function resolveWizardSpellMasteryChoices(wizardLevel, spellItems = [], levelOneId, levelTwoId) {
  if (Number(wizardLevel) < 18 || !Array.isArray(spellItems)) return { valid: false, reason: 'feature-unavailable' };
  const byId = new Map(spellItems.map((item) => [String(item?.id || ''), item]));
  const selected = [byId.get(String(levelOneId || '')), byId.get(String(levelTwoId || ''))];
  const eligible = (item, level) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'spell' && data.sourceClassIdentifier === 'wizard' && data.wizardSpellbook === true
      && data.classes?.includes('wizard') && Number(data.spellLevel) === level
      && /^1 action$/i.test(String(data.castingTime || '').trim());
  };
  if (!eligible(selected[0], 1) || !eligible(selected[1], 2)) return { valid: false, reason: 'spellbook-action-spells-required' };
  return { valid: true, levelOneId: String(levelOneId), levelTwoId: String(levelTwoId) };
}

/** Validate the two level-3 spellbook selections granted by Signature Spells. */
export function resolveWizardSignatureSpellChoices(wizardLevel, spellItems = [], selectedIds = []) {
  if (Number(wizardLevel) < 20 || !Array.isArray(spellItems) || !Array.isArray(selectedIds)) {
    return { valid: false, reason: 'feature-unavailable' };
  }
  const selected = selectedIds.map((id) => spellItems.find((item) => String(item?.id) === String(id))).filter(Boolean);
  const eligible = (item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'spell' && data.sourceClassIdentifier === 'wizard' && data.wizardSpellbook === true
      && data.classes?.includes('wizard') && Number(data.spellLevel) === 3;
  };
  const names = selected.map((item) => String(item.name || '').trim().toLocaleLowerCase());
  if (selected.length !== 2 || selected.length !== selectedIds.length || new Set(selectedIds.map(String)).size !== 2
    || new Set(names).size !== 2 || !selected.every(eligible)) {
    return { valid: false, reason: 'two-distinct-level-three-spellbook-spells-required' };
  }
  return { valid: true, spellIds: selected.map((item) => String(item.id)) };
}

/** Return an eligible same-level Spell Mastery replacement from the spellbook. */
export function resolveWizardSpellMasteryReplacement(wizardLevel, spellItems = [], currentSpellId, replacementSpellId) {
  if (Number(wizardLevel) < 18 || !Array.isArray(spellItems)) return { valid: false, reason: 'feature-unavailable' };
  const current = spellItems.find((item) => String(item?.id) === String(currentSpellId));
  const replacement = spellItems.find((item) => String(item?.id) === String(replacementSpellId));
  const dataOf = (item) => item?.system || item?.data || {};
  const level = Number(dataOf(current).spellLevel);
  const eligible = (item) => item?.type === 'spell' && dataOf(item).sourceClassIdentifier === 'wizard'
    && dataOf(item).wizardSpellbook === true && dataOf(item).classes?.includes('wizard')
    && Number(dataOf(item).spellLevel) === level && /^1 action$/i.test(String(dataOf(item).castingTime || '').trim());
  if (![1, 2].includes(level) || !eligible(current) || !eligible(replacement)
    || String(currentSpellId) === String(replacementSpellId)) return { valid: false, reason: 'same-level-action-spellbook-replacement-required' };
  return { valid: true, currentSpellId: String(currentSpellId), replacementSpellId: String(replacementSpellId), level };
}

/** Whether a selected Signature Spell may be cast without a slot before a rest. */
export function canUseWizardSignatureSpell(featureData = {}, spellId) {
  const ids = featureData.signatureSpellIds;
  const used = featureData.signatureSpellUses || {};
  const id = String(spellId || '');
  return Array.isArray(ids) && ids.map(String).includes(id) && Number(used[id] || 0) === 0;
}

/** Reset the once-per-rest uses for the two Wizard Signature Spells. */
export function resetWizardSignatureSpellUses(featureData = {}, restKind) {
  if (!['short', 'long'].includes(restKind) || !Array.isArray(featureData.signatureSpellIds)) return null;
  return Object.fromEntries(featureData.signatureSpellIds.map((id) => [String(id), 0]));
}

function classSpellMaximum(level) {
  return classSpellcastingAtLevel('wizard', level)?.maximumSpellLevel || 0;
}
import { classSpellcastingAtLevel, PREPARED_CLASS_SPELLCASTING } from './class-spellcasting.mjs';

