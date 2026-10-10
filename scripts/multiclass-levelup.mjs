import { multiclassProficiencyChoiceContext } from './class-proficiencies.mjs';
import { multiclassEntryHitDicePatch, multiclassLevelHitPointGain } from './hit-die-mechanics.mjs';
import { resolveMulticlassPrerequisites } from './progression.mjs';
import { selectClassFeaturesToGrant } from './class-feature-grants.mjs';
import { createMulticlassAdvancementJournal } from './multiclass-advancement-journal.mjs';
import { classSpellcastingAtLevel, resolvePreparedClassSpellChoices, resolveWizardLevelOneChoices } from './class-spellcasting.mjs';
import { prepSpellSlots } from './prepare-data.mjs';
import { resolveWeaponMasteryChoices } from './weapon-mastery.mjs';
import { resolveClericDivineOrderChoice } from './divine-order.mjs';
import { bardicInspirationDieAtLevel, syncBardicInspiration } from './bardic-inspiration.mjs';
import { resolveExpertiseChoices } from './expertise-mechanics.mjs';
import { resolveRogueAdditionalLanguage, ROGUE_SPECIAL_LANGUAGE } from './language-mechanics.mjs';
import { resolveRangerFavoredEnemySpell, rangerFavoredEnemySpellItemData, syncRangerFavoredEnemyUses } from './ranger-favored-enemy.mjs';
import { resolveDruidPrimalOrderChoice } from './druid-primal-order.mjs';
import { resolveWarlockLevelOneInvocation } from './warlock-invocations.mjs';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const MULTICLASS_ENTRY_CLASS_IDS = Object.freeze([
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
]);
const LEVEL_ONE_CHOICE_HANDLERS_PENDING = Object.freeze({});

/**
 * Build a read-only preview for taking the first level in a new class.
 * This does not write actor/item documents; Level Up must collect remaining
 * choices and use a recoverable write contract before it can commit the plan.
 */
export function resolveMulticlassLevelUpPlan({
  actorSystemData = {},
  currentItems = [],
  classEntry,
  featureEntries = [],
  spellEntries = [],
  proficiencySelection = {},
  hitDieRoll = null,
  featureChoicesReviewed = false,
  spellChoicesReviewed = false,
  weaponMasterySelection = [],
  fighterStyleSelection = null,
  divineOrderSelection = {},
  primalOrderSelection = {},
  warlockInvocationSelection = '',
  spellCantripSelection = [],
  rogueChoices = {},
} = {}) {
  const classData = classEntry?.data || classEntry?.system || {};
  const classIdentifier = String(classData.classIdentifier || '').trim().toLowerCase();
  const currentClasses = currentItems.filter((item) => item.type === 'class')
    .map((item) => (item.system || item.data || {}).classIdentifier).filter(Boolean);
  const abilityScores = Object.fromEntries(ABILITIES.map((key) => [key, actorSystemData.abilities?.[key]?.value ?? actorSystemData.abilities?.[key]]));
  const prerequisites = resolveMulticlassPrerequisites(classIdentifier, currentClasses, abilityScores);
  const skillKeys = Object.keys(actorSystemData.skills || {}).filter((key) => actorSystemData.skills[key]?.proficient);
  const existingTools = actorSystemData.proficiencies?.tools || [];
  const proficiencies = multiclassProficiencyChoiceContext(classIdentifier, proficiencySelection, {
    alreadyProficientSkills: skillKeys,
    alreadyProficientTools: existingTools,
  });
  const totalLevel = Number(actorSystemData.details?.level) || 1;
  const health = actorSystemData.resources?.health || {};
  const hitDice = actorSystemData.resources?.hitDice || {};
  const blockers = [];
  const errors = [];

  if (!classEntry?.name || !classIdentifier || !classData.hitDie) errors.push({ code: 'invalid-class-entry' });
  if (!prerequisites.valid) errors.push({ code: 'multiclass-prerequisites', result: prerequisites });
  if (!proficiencies.valid) errors.push({ code: 'multiclass-proficiency-choices', result: proficiencies });
  if (!Number.isInteger(totalLevel) || totalLevel < 1 || totalLevel >= 20) errors.push({ code: 'character-level-cap', totalLevel });

  let hpGain = null;
  let hitDiceNext = null;
  let features = { candidates: [], compatible: [], selected: [], skippedSourceCount: 0 };
  try {
    const conScore = Number(actorSystemData.abilities?.con?.value ?? actorSystemData.abilities?.con) || 10;
    const conModifier = Number.isFinite(Number(actorSystemData.abilities?.con?.modifier))
      ? Number(actorSystemData.abilities.con.modifier) : Math.floor((conScore - 10) / 2);
    hpGain = multiclassLevelHitPointGain(classData.hitDie, conModifier, { roll: hitDieRoll });
  } catch (error) {
    errors.push({ code: 'invalid-hit-point-preview', message: error.message });
  }
  try {
    hitDiceNext = multiclassEntryHitDicePatch(hitDice, classIdentifier, classData.hitDie);
  } catch (error) {
    errors.push({ code: 'invalid-hit-die-pool', message: error.message });
  }
  features = selectClassFeaturesToGrant(featureEntries, classIdentifier, 0, 1, currentItems);
  if (!features.selected.length) blockers.push({ code: 'missing-verified-level-one-features' });
  if (features.skippedSourceCount > 0) blockers.push({ code: 'feature-source-review', count: features.skippedSourceCount });
  if (!featureChoicesReviewed) blockers.push({ code: 'level-one-feature-choices-not-reviewed' });
  if (LEVEL_ONE_CHOICE_HANDLERS_PENDING[classIdentifier]) {
    blockers.push({ code: 'unhandled-level-one-class-choices', choices: LEVEL_ONE_CHOICE_HANDLERS_PENDING[classIdentifier] });
  }
  let rogueChoice = { valid: true, expertise: { valid: true, selected: [] }, language: { valid: true, selected: '', options: [] } };
  if (classIdentifier === 'rogue') {
    const skillState = Object.fromEntries(Object.entries(actorSystemData.skills || {}).map(([key, value]) => [key, { ...value }]));
    for (const key of proficiencies.skills) skillState[key] = { ...(skillState[key] || {}), proficient: true };
    const expertise = resolveExpertiseChoices(skillState, rogueChoices.expertiseSkills, 2);
    const knownLanguages = [...(actorSystemData.details?.languages?.value || []),
      ...currentItems.filter((item) => item.type === 'language').map((item) => item.name)];
    const language = resolveRogueAdditionalLanguage(rogueChoices.additionalLanguage, knownLanguages);
    rogueChoice = { valid: expertise.valid && language.valid, expertise, language };
    if (!expertise.valid) blockers.push({ code: 'rogue-expertise-choice-required', reason: expertise.reason });
    if (!language.valid) blockers.push({ code: 'rogue-additional-language-required', reason: language.reason });
  }
  const fightingStyleFeature = features.selected.find((entry) => entry.data?.identifier === 'fighting-style'
    || (classIdentifier === 'fighter' && entry.name === 'Fighting Style'));
  let fighterStyle = { valid: true, entry: null };
  if (fightingStyleFeature) {
    const data = fighterStyleSelection?.data || fighterStyleSelection?.system || {};
    const description = String(data.description || '');
    const isSrdFightingStyle = data.source === 'SRD 5.2 (CC-BY-4.0)'
      && /Category:\s*Fighting Style Feat/i.test(description)
      && /Prerequisite:\s*Fighting Style Feature/i.test(description);
    fighterStyle = { valid: isSrdFightingStyle, entry: isSrdFightingStyle ? fighterStyleSelection : null };
    if (!fighterStyle.valid) blockers.push({ code: 'fighting-style-choice-required' });
  } else if (classIdentifier === 'fighter') {
    blockers.push({ code: 'fighting-style-feature-missing' });
  }
  const divineOrderFeature = features.selected.find((entry) => entry.data?.identifier === 'divine-order');
  let divineOrder = { valid: true, order: '', extraCantripId: '' };
  if (divineOrderFeature) {
    const order = String(divineOrderSelection.order || '');
    const extraCantripId = String(divineOrderSelection.extraCantripId || '');
    divineOrder = { valid: ['protector', 'thaumaturge'].includes(order)
      && (order === 'thaumaturge' ? !!extraCantripId : !extraCantripId), order, extraCantripId };
    if (!divineOrder.valid) blockers.push({ code: 'divine-order-choice-required' });
  } else if (classIdentifier === 'cleric') {
    blockers.push({ code: 'divine-order-feature-missing' });
  }
  const primalOrderFeature = features.selected.find((entry) => entry.data?.identifier === 'primal-order');
  let primalOrder = { valid: true, order: '', extraCantrip: null };
  if (primalOrderFeature) {
    primalOrder = resolveDruidPrimalOrderChoice(primalOrderSelection.order, primalOrderSelection.extraCantripId,
      spellEntries, spellCantripSelection);
    if (!primalOrder.valid) blockers.push({ code: 'primal-order-choice-required', reason: primalOrder.reason });
  } else if (classIdentifier === 'druid') {
    blockers.push({ code: 'primal-order-feature-missing' });
  }
  const invocationFeature = features.selected.find((entry) => entry.data?.identifier === 'eldritch-invocations');
  const warlockInvocation = invocationFeature
    ? resolveWarlockLevelOneInvocation(warlockInvocationSelection)
    : { valid: classIdentifier !== 'warlock', reason: 'invocation-feature-missing', invocation: null };
  if (invocationFeature && !warlockInvocation.valid) blockers.push({ code: 'warlock-invocation-choice-required' });
  if (!invocationFeature && classIdentifier === 'warlock') blockers.push({ code: 'warlock-invocation-feature-missing' });
  const masteryFeature = features.selected.find((entry) => entry.data?.identifier === 'weapon-mastery');
  let weaponMastery = { valid: true, choices: [], options: [], required: 0 };
  if (masteryFeature) {
    weaponMastery = resolveWeaponMasteryChoices(classIdentifier, weaponMasterySelection,
      [...new Set([...(actorSystemData.proficiencies?.weapons || []), ...proficiencies.weapons])]);
    if (!weaponMastery.valid) blockers.push({ code: 'weapon-mastery-choice-required', reason: weaponMastery.reason });
  }
  const spellcastingClass = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'].includes(classIdentifier);
  if (spellcastingClass && !spellChoicesReviewed) blockers.push({ code: 'level-one-spell-choices-not-reviewed' });

  const currentHp = Number(health.value);
  const currentMaxHp = Number(health.max);
  const canPreviewHp = Number.isFinite(currentHp) && Number.isFinite(currentMaxHp) && currentMaxHp >= currentHp && hpGain !== null;
  if (!canPreviewHp) errors.push({ code: 'invalid-current-health' });
  const currentProficiency = Number(actorSystemData.attributes?.prof?.value) || Math.floor((totalLevel - 1) / 4) + 2;
  const nextLevel = totalLevel + 1;
  const nextProficiency = Math.floor((nextLevel - 1) / 4) + 2;
  const classItem = classEntry?.name && classIdentifier && classData.hitDie
    ? { name: classEntry.name, type: 'class', data: { ...classData, levels: 1 } }
    : null;

  return {
    valid: errors.length === 0,
    readyForCommit: errors.length === 0 && blockers.length === 0,
    errors,
    blockers,
    classIdentifier,
    prerequisites,
    proficiencies,
    preview: {
      classLevel: 1,
      characterLevel: { current: totalLevel, next: nextLevel },
      proficiencyBonus: { current: currentProficiency, next: nextProficiency },
      hitPoints: canPreviewHp ? {
        gain: hpGain,
        current: currentHp,
        maximum: currentMaxHp,
        afterLevelUp: { current: currentHp + hpGain, maximum: currentMaxHp + hpGain },
      } : null,
      hitDice: hitDiceNext,
      classItem,
      features: features.selected.map((entry) => ({ name: entry.name, data: entry.data?.identifier === 'weapon-mastery'
        ? { ...entry.data, masteredWeaponIdentifiers: [...weaponMastery.choices] }
        : classIdentifier === 'rogue' && entry.data?.identifier === 'expertise'
        ? { ...entry.data, selectedExpertiseSkills: [...rogueChoice.expertise.selected] }
        : classIdentifier === 'rogue' && entry.data?.identifier === 'thieves-cant'
        ? { ...entry.data, selectedAdditionalLanguage: rogueChoice.language.selected }
        : entry.data })),
      weaponMastery,
      fighterStyle,
      divineOrder,
      primalOrder,
      warlockInvocation,
      rogueChoice,
      skippedFeatureCount: features.skippedSourceCount,
    },
  };
}

const LEVEL_ONE_SPELLCASTERS = new Set(['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard']);

/**
 * Turn a reviewed, validated first level in a new class into a recoverable
 * sequence: create class/features/spells, then update actor data last.
 */
export function createMulticlassLevelUpJournal({
  worldId,
  actor,
  classEntry,
  featureEntries = [],
  spellEntries = [],
  spellSelection = {},
  proficiencySelection = {},
  weaponMasterySelection = [],
  fighterStyleSelection = null,
  divineOrderSelection = {},
  primalOrderSelection = {},
  warlockInvocationSelection = '',
  rogueChoices = {},
  transactionId,
  featureChoicesReviewed = false,
} = {}) {
  const actorSystemData = actor?.systemData || {};
  const currentItems = actor?.items || [];
  const preliminary = resolveMulticlassLevelUpPlan({
    actorSystemData,
    currentItems,
    classEntry,
    featureEntries,
    spellEntries,
    proficiencySelection,
    weaponMasterySelection,
    fighterStyleSelection,
    divineOrderSelection,
    primalOrderSelection,
    warlockInvocationSelection,
    spellCantripSelection: spellSelection.cantrips || [],
    rogueChoices,
    featureChoicesReviewed,
    spellChoicesReviewed: true,
  });
  const errors = [...preliminary.errors];
  const classIdentifier = preliminary.classIdentifier;
  let resolvedSpells = { valid: true, cantrips: [], prepared: [], spellbook: [] };
  if (LEVEL_ONE_SPELLCASTERS.has(classIdentifier)) {
    resolvedSpells = classIdentifier === 'wizard'
      ? resolveWizardLevelOneChoices(spellEntries, spellSelection)
      : resolvePreparedClassSpellChoices(classIdentifier, 1, spellEntries, spellSelection);
    if (!resolvedSpells.valid) errors.push({ code: 'invalid-level-one-spell-choices', errors: resolvedSpells.errors });
  } else if (spellSelection.cantrips?.length || spellSelection.prepared?.length || spellSelection.spellbook?.length) {
    errors.push({ code: 'unexpected-spell-choices' });
  }
  const rangerFavoredEnemy = classIdentifier === 'ranger'
    ? resolveRangerFavoredEnemySpell(spellEntries, spellSelection.prepared || [])
    : { valid: true, spell: null };
  if (!rangerFavoredEnemy.valid) errors.push({ code: 'invalid-ranger-favored-enemy-spell', reason: rangerFavoredEnemy.reason });
  if (classIdentifier === 'ranger' && !(featureEntries || []).some((entry) => entry.data?.identifier === 'favored-enemy')) {
    errors.push({ code: 'missing-ranger-favored-enemy-feature' });
  }
  const warlockInvocation = classIdentifier === 'warlock'
    ? resolveWarlockLevelOneInvocation(warlockInvocationSelection)
    : { valid: true, invocation: null };
  if (!warlockInvocation.valid) errors.push({ code: 'invalid-warlock-invocation-choice' });
  let divineOrder = { valid: true, order: '', extraCantrip: null };
  if (classIdentifier === 'cleric') {
    divineOrder = resolveClericDivineOrderChoice(divineOrderSelection.order, divineOrderSelection.extraCantripId,
      spellEntries, spellSelection.cantrips || []);
    if (!divineOrder.valid) errors.push({ code: 'invalid-divine-order-choice', reason: divineOrder.reason });
  }
  let primalOrder = { valid: true, order: '', extraCantrip: null };
  if (classIdentifier === 'druid') {
    primalOrder = resolveDruidPrimalOrderChoice(primalOrderSelection.order, primalOrderSelection.extraCantripId,
      spellEntries, spellSelection.cantrips || []);
    if (!primalOrder.valid) errors.push({ code: 'invalid-primal-order-choice', reason: primalOrder.reason });
  }
  const chosenSpells = classIdentifier === 'wizard'
    ? [...(resolvedSpells.cantrips || []), ...(resolvedSpells.spellbook || [])]
    : [...(resolvedSpells.cantrips || []), ...(resolvedSpells.prepared || []), ...(divineOrder.extraCantrip ? [divineOrder.extraCantrip] : []),
      ...(primalOrder.extraCantrip ? [primalOrder.extraCantrip] : [])];
  const chosenSpellNames = chosenSpells.map(({ name }) => String(name || '').trim().toLocaleLowerCase());
  const alreadyOwnedSpellNames = new Set(currentItems.filter(({ type }) => type === 'spell')
    .map(({ name }) => String(name || '').trim().toLocaleLowerCase()));
  if (new Set(chosenSpellNames).size !== chosenSpellNames.length
    || chosenSpellNames.some((name) => !name || alreadyOwnedSpellNames.has(name))) {
    errors.push({ code: 'duplicate-or-already-owned-spell-choice' });
  }
  if (rangerFavoredEnemy.spell && alreadyOwnedSpellNames.has(String(rangerFavoredEnemy.spell.name).trim().toLocaleLowerCase())) {
    errors.push({ code: 'ranger-favored-enemy-spell-already-owned' });
  }

  if (!preliminary.valid || preliminary.blockers.length || errors.length) {
    return { valid: false, errors, blockers: preliminary.blockers, preview: preliminary.preview, journal: null };
  }

  const classData = classEntry.data || classEntry.system || {};
  const operations = [{
    key: 'class-item', kind: 'create-item',
    payload: { name: classEntry.name, type: 'class', data: { ...classData, levels: 1 } },
  }];
  for (const [index, feature] of preliminary.preview.features.entries()) {
    const charismaScore = actorSystemData.abilities?.cha?.value ?? actorSystemData.abilities?.cha;
    const featureData = classIdentifier === 'bard' && feature.data?.identifier === 'bardic-inspiration'
      ? { ...feature.data,
        bardicInspirationDie: bardicInspirationDieAtLevel(1),
        uses: syncBardicInspiration(feature.data.uses, charismaScore, 1),
        mechanicsSupport: { ...(feature.data.mechanicsSupport || {}), manualNoticeKey: 'SDR5E.ClassFeatures.BardicInspirationManual' },
      }
      : feature.data?.identifier === 'fighting-style'
      || (classIdentifier === 'fighter' && feature.name === 'Fighting Style')
      ? { ...feature.data, selectedFightingStyleIdentifier: preliminary.preview.fighterStyle.entry.data.identifier }
      : feature.data?.identifier === 'divine-order'
      ? { ...feature.data, selectedOrder: divineOrder.order,
        ...(divineOrder.extraCantrip ? { selectedCantripIdentifier: divineOrder.extraCantrip.data.identifier } : {}) }
      : feature.data?.identifier === 'primal-order'
      ? { ...feature.data, selectedOrder: primalOrder.order,
        ...(primalOrder.extraCantrip ? { selectedCantripIdentifier: primalOrder.extraCantrip.data.identifier } : {}) }
      : feature.data?.identifier === 'eldritch-invocations'
      ? { ...feature.data, selectedInvocationIdentifier: warlockInvocation.invocation.identifier }
      : classIdentifier === 'ranger' && feature.data?.identifier === 'favored-enemy'
      ? { ...feature.data, uses: syncRangerFavoredEnemyUses(feature.data.uses, 1) }
      : feature.data;
    operations.push({ key: `feature-${index + 1}`, kind: 'create-item',
      payload: { name: feature.name, type: 'feature', data: featureData } });
  }
  if (preliminary.preview.fighterStyle.entry) {
    const selectedStyle = preliminary.preview.fighterStyle.entry;
    operations.push({ key: 'fighting-style-feat', kind: 'create-item', payload: {
      name: selectedStyle.name, type: 'feat',
      data: { ...selectedStyle.data, sourceClassIdentifier: 'fighter', acquiredAtClassLevel: 1, effectAutomation: 'manual' },
    } });
  }

  const wizardPreparedIds = new Set((spellSelection.prepared || []).map(String));
  const spellItems = [
    ...(resolvedSpells.cantrips || []).map((entry) => ({
      name: entry.name, type: 'spell',
      data: { ...entry.data, sourceClassIdentifier: classIdentifier, prepared: false,
        ...(classIdentifier === 'wizard' ? { wizardSpellbook: false, learnedAtWizardLevel: 1 } : {}) },
    })),
    ...(classIdentifier === 'wizard' ? [] : resolvedSpells.prepared || []).map((entry) => ({
      name: entry.name, type: 'spell',
      data: { ...entry.data, sourceClassIdentifier: classIdentifier, prepared: true },
    })),
    ...(rangerFavoredEnemy.spell ? [{
      name: rangerFavoredEnemy.spell.name,
      type: 'spell',
      data: rangerFavoredEnemySpellItemData(rangerFavoredEnemy.spell.data),
    }] : []),
    ...(primalOrder.extraCantrip ? [{
      name: primalOrder.extraCantrip.name, type: 'spell',
      data: { ...primalOrder.extraCantrip.data, sourceClassIdentifier: 'druid', prepared: false, primalOrderCantrip: true },
    }] : []),
    ...(resolvedSpells.spellbook || []).map((entry) => ({
      name: entry.name, type: 'spell',
      data: { ...entry.data, sourceClassIdentifier: 'wizard', wizardSpellbook: true,
        learnedAtWizardLevel: 1, prepared: wizardPreparedIds.has(entry.id) },
    })),
    ...(divineOrder.extraCantrip ? [{
      name: divineOrder.extraCantrip.name, type: 'spell',
      data: { ...divineOrder.extraCantrip.data, sourceClassIdentifier: 'cleric', prepared: false, divineOrderCantrip: true },
    }] : []),
  ];
  if (warlockInvocation.invocation) operations.push({ key: 'warlock-invocation', kind: 'create-item', payload: {
    name: warlockInvocation.invocation.name, type: 'feature',
    data: {
      identifier: `warlock-invocation-${warlockInvocation.invocation.identifier}`,
      source: 'SRD 5.2 (CC-BY-4.0)', sourceClassIdentifier: 'warlock', acquiredAtClassLevel: 1,
      description: warlockInvocation.invocation.summary, effectAutomation: 'manual',
      mechanicsSupport: { status: 'manual', manualNoticeKey: 'SDR5E.ClassFeatures.WarlockInvocationManual' },
    },
  } });
  for (const [index, spell] of spellItems.entries()) {
    operations.push({ key: `spell-${index + 1}`, kind: 'create-item', payload: spell });
  }

  const systemData = structuredClone(actorSystemData);
  systemData.details ||= {};
  systemData.details.level = preliminary.preview.characterLevel.next;
  systemData.attributes ||= {};
  systemData.attributes.prof ||= {};
  systemData.attributes.prof.value = preliminary.preview.proficiencyBonus.next;
  systemData.resources ||= {};
  const health = systemData.resources.health || {};
  systemData.resources.health = {
    ...health,
    value: preliminary.preview.hitPoints.afterLevelUp.current,
    max: preliminary.preview.hitPoints.afterLevelUp.maximum,
  };
  systemData.resources.hitDice = preliminary.preview.hitDice;
  systemData.proficiencies ||= {};
  systemData.proficiencies.weapons = [...new Set([...(systemData.proficiencies.weapons || []), ...preliminary.proficiencies.weapons])];
  systemData.proficiencies.armor = [...new Set([...(systemData.proficiencies.armor || []), ...preliminary.proficiencies.armor])];
  systemData.proficiencies.tools = [...new Set([...(systemData.proficiencies.tools || []), ...preliminary.proficiencies.tools])];
  if (classIdentifier === 'cleric' && divineOrder.order === 'protector') {
    systemData.proficiencies.weapons = [...new Set([...systemData.proficiencies.weapons, 'martialM', 'martialR'])];
    systemData.proficiencies.armor = [...new Set([...systemData.proficiencies.armor, 'heavy'])];
  }
  if (classIdentifier === 'druid' && primalOrder.order === 'warden') {
    systemData.proficiencies.weapons = [...new Set([...systemData.proficiencies.weapons, 'martialM', 'martialR'])];
    systemData.proficiencies.armor = [...new Set([...systemData.proficiencies.armor, 'medium'])];
  }
  for (const skill of preliminary.proficiencies.skills) {
    systemData.skills ||= {};
    systemData.skills[skill] = { ...(systemData.skills[skill] || {}), proficient: true };
  }
  if (classIdentifier === 'rogue') {
    for (const skill of preliminary.preview.rogueChoice.expertise.selected) {
      systemData.skills[skill] = { ...(systemData.skills[skill] || {}), proficient: true, multiplier: 2 };
    }
    systemData.details ||= {};
    systemData.details.languages ||= { value: [], custom: '' };
    systemData.details.languages.value = [...new Set([
      ...(systemData.details.languages.value || []), ROGUE_SPECIAL_LANGUAGE, preliminary.preview.rogueChoice.language.selected,
    ])];
  }
  const newClassItem = { ...preliminary.preview.classItem };
  const spellClassItems = [...currentItems, newClassItem];
  prepSpellSlots(systemData, spellClassItems);

  operations.push({ key: 'actor-update', kind: 'update-actor',
    payload: { systemData, flags: actor.flags || {} } });
  const journal = createMulticlassAdvancementJournal({ worldId, actorId: actor.id, transactionId, operations });
  return { valid: true, errors: [], blockers: [], preview: preliminary.preview, journal, resolvedSpells };
}
