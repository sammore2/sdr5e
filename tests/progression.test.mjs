import test from 'node:test';
import assert from 'node:assert/strict';
import { abilityChoiceLevelsFor, pactMagicAtLevel, subclassLevelFor } from '../scripts/config.mjs';
import { buildProgressionPlan, exhaustionD20Penalty, isFeatEligibleForProgression, MULTICLASS_PRIMARY_ABILITY_REQUIREMENTS, progressionAtLevel, progressionBetween, resolveAbilityScoreIncrease, resolveMulticlassPrerequisites, resolveProgressionChoices, startingHitPoints } from '../scripts/progression.mjs';
import { prepArmorAndDA, prepMovement, prepSkills, prepSpellSlots, prepareActorRow } from '../scripts/prepare-data.mjs';
import { getDefaultData } from '../scripts/schema.mjs';
import { selectClassFeaturesToGrant } from '../scripts/class-feature-grants.mjs';
import { featMechanicsSupport, resolveFeatMechanicChoices, validateFeatMechanics } from '../scripts/feat-mechanics.mjs';
import { FEAT_MECHANICS_BY_IDENTIFIER, TOOL_PROFICIENCY_OPTIONS } from '../scripts/feat-mechanics-data.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { BACKGROUND_MECHANICS_BY_IDENTIFIER, resolveBackgroundChoices } from '../scripts/background-mechanics.mjs';
import { ABILITY_LABELS, SKILL_LABELS } from '../scripts/config.mjs';
import { isHumanSkillValid, isHumanSpeciesChoiceValid, isSpeciesChoiceValid, normalizeFeatChoiceName, recordSpeciesChoice, speciesVariantEntries, SPECIES_CHOICE_OPTIONS, SPECIES_VARIANT_PARENTS } from '../scripts/species-mechanics.mjs';
import { backgroundEquipmentPackageOptions, resolveBackgroundEquipment, STARTING_EQUIPMENT_CATALOG } from '../scripts/background-equipment.mjs';
import { classStartingEquipmentChoices, classStartingEquipmentPackageOptions, classStartingInstrumentOptions, resolveClassStartingEquipment, CLASS_STARTING_EQUIPMENT_CATALOG } from '../scripts/class-equipment.mjs';
import { createMulticlassLevelUpJournal, MULTICLASS_ENTRY_CLASS_IDS, resolveMulticlassLevelUpPlan } from '../scripts/multiclass-levelup.mjs';
import { applyCharacterLanguages, resolveCharacterLanguages, resolveOriginLanguageChoices, resolveRogueAdditionalLanguage, ROGUE_SPECIAL_LANGUAGE, SRD_STANDARD_LANGUAGES } from '../scripts/language-mechanics.mjs';
import { actorSetupWizardRequired, clearCreationJournal, createCreationJournal, creationJournalCanResume, readCreationJournal, runCreationJournal, writeCreationJournal } from '../scripts/creation-journal.mjs';
import { canUseGrappleHand, grappleSizeEligible, normalizeGrappleSize, recordGrapple, removeGrapple, resolveGrapplePrerequisites } from '../scripts/grapple-mechanics.mjs';
import { buildMagicInitiateSpellData, magicInitiateAllowedLists, resolveMagicInitiateChoices, spellcastingStats, spellCountsTowardPreparedLimit } from '../scripts/magic-initiate.mjs';
import { classSpellcastingAtLevel, classSpellcastingLevelUpAtLevel, inspectBardSpellState, inspectPreparedSpellState, inspectWizardSpellbookState, PREPARED_CLASS_SPELLCASTING, resolvePreparedClassSpellChoices, resolveWizardCreationChoices, resolveWizardLevelOneChoices, wizardSpellcastingLevelUpAtLevel, isValidMysticArcanumSpell, mysticArcanumCircleAtLevel, mysticArcanumUseState, resolveLongRestPreparedSpellChoices, resolveMulticlassLongRestPreparedSpellChoices, preparedSpellCapacityForClass, spellEligibleForClassPreparation, spellcastingAbilityForClass, SPELLCASTING_ABILITY_BY_CLASS } from '../scripts/class-spellcasting.mjs';
import { combatInitiativeFormula, DEFAULT_INITIATIVE_FORMULA, initiativeTieBreakBonus, resolveInitiativeAdvantage } from '../scripts/initiative-mechanics.mjs';
import { CORE_ACTION_FIXED_DC, CORE_ACTION_SKILL_OPTIONS, coreActionActivityView, coreActionContextMetadata, normalizeCoreActionContext, resolveCoreActionSkillCheck } from '../scripts/core-action-checks.mjs';
import { addConcentrationSaveAttempt, concentrationSaveDc, pendingConcentrationSaveAttempts, replaceConcentrationSaveAttempt, restoreConcentrationSaveAttempt as restoreConcentrationAttempt, resolveConcentrationAfterConditionUpdate, resolveConcentrationAfterDamage, resolveConcentrationEnd, resolveConcentrationSaveRoll } from '../scripts/concentration-mechanics.mjs';
import { reconcileUnconsciousMarkers } from '../scripts/unconscious-condition-mechanics.mjs';
import { resolveArcaneRecovery } from '../scripts/arcane-recovery.mjs';
import { jackOfAllTradesSkillBonus, unarmoredDefenseBaseAC } from '../scripts/class-feature-mechanics.mjs';
import { resolveWizardScholarChoice, WIZARD_SCHOLAR_SKILLS } from '../scripts/wizard-scholar.mjs';
import { canUseWizardSignatureSpell, resetWizardSignatureSpellUses, resolveWizardMemorizeSpellChoice, resolveWizardSignatureSpellChoices, resolveWizardSpellMasteryChoices, resolveWizardSpellMasteryReplacement, wizardSpellCastOptions } from '../scripts/wizard-spell-mechanics.mjs';
import { createClassLevelUpJournal, createWizardLevelUpJournal } from '../scripts/wizard-levelup-journal.mjs';
import { resolveWeaponMasteryAttack, resolveWeaponMasteryChoices, resolveWeaponMasteryFeatureData, resolveWeaponMasteryReplacement, SRD_WEAPON_MASTERY_OPTIONS, weaponMasteryCountAtLevel, weaponMasteryForAttack, weaponMasteryRestCandidates, weaponMasterySaveDC, weaponMasteryToppleAction, weaponMasteryGrazeAction, weaponMasteryPushAction, weaponMasteryPushTargetSizeEligible, weaponMasterySapAction, weaponMasteryVexAction, weaponMasterySlowAction, weaponMasterySlowDamageRequest, weaponMasteryCleaveAction, weaponMasteryCleaveTurnAvailable, weaponMasteryDamageAbilityModifier } from '../scripts/weapon-mastery.mjs';
import { clericDivineOrderSkillBonus, resolveClericDivineOrderChoice } from '../scripts/divine-order.mjs';
import { bardicInspirationDieAtLevel, bardicInspirationUses, resolveSuperiorInspirationRecovery, superiorInspirationUsesAfterInitiative, syncBardicInspiration } from '../scripts/bardic-inspiration.mjs';
import { resolveBardExpertiseProgression, resolveExpertiseChoices } from '../scripts/expertise-mechanics.mjs';
import { rangerFavoredEnemyUsesAtLevel, resolveRangerFavoredEnemySpell, syncRangerFavoredEnemyUses } from '../scripts/ranger-favored-enemy.mjs';
import { monkFocusPointsAtLevel, syncMonkFocusUses } from '../scripts/monk-focus.mjs';
import { advanceCombatEffectRecords, appendCombatEffectRecord, clearAllCombatEffectRecords, clearCombatEffectRecords, combatEffectContextForActor, combatEffectOwnerCastId, combatEffectRecordsForActiveCombat, combatEffectsForAttack, combatSpeedPenaltyFeet, consumeCombatEffectRecords, createCombatEffectRecord } from '../scripts/combat-effects.mjs';

test('Ranger Favored Enemy use pool follows class levels and preserves spent uses', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(rangerFavoredEnemyUsesAtLevel), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  assert.equal(rangerFavoredEnemyUsesAtLevel(0), 0);
  assert.equal(rangerFavoredEnemyUsesAtLevel(21), 0);
  assert.deepEqual(syncRangerFavoredEnemyUses({ value: 1, max: 2 }, 5), { value: 2, max: 3, recovery: 'lr' });
  assert.deepEqual(syncRangerFavoredEnemyUses({ value: 2, max: 2 }, 5), { value: 3, max: 3, recovery: 'lr' });
});

test("Monk's Focus pool follows Monk levels and recovers on a Short or Long Rest", () => {
  assert.equal(monkFocusPointsAtLevel(1), 0);
  assert.equal(monkFocusPointsAtLevel(2), 2);
  assert.equal(monkFocusPointsAtLevel(20), 20);
  assert.equal(monkFocusPointsAtLevel(21), 0);
  assert.deepEqual(syncMonkFocusUses({}, 2), { value: 2, max: 2, recovery: 'sr' });
  assert.deepEqual(syncMonkFocusUses({ value: 1, max: 2 }, 3), { value: 2, max: 3, recovery: 'sr' });
  assert.deepEqual(syncMonkFocusUses({ value: 2, max: 2 }, 3), { value: 3, max: 3, recovery: 'sr' });
  const pool = syncMonkFocusUses({ value: 0, max: 2 }, 2);
  assert.equal(restoredFeatureUses(pool, 'short'), 2);
  assert.equal(restoredFeatureUses(pool, 'long'), 2);
});

test("Monk's level-2 feature pack now uses the SRD 5.2 Focus and Uncanny Metabolism records", () => {
  const db = new DatabaseSync('packs/features.sqlite', { readOnly: true });
  try {
    const rows = db.prepare("SELECT name, data FROM entries WHERE type = 'feature'").all()
      .map((row) => ({ name: row.name, data: JSON.parse(row.data) }))
      .filter((entry) => entry.data.classIdentifier === 'monk' && Number(entry.data.levelGained) === 2);
    const byId = new Map(rows.map((entry) => [entry.data.identifier, entry]));
    assert.equal(byId.has('ki'), false);
    assert.equal(byId.get('monks-focus')?.name, "Monk's Focus");
    assert.equal(byId.get('monks-focus')?.data.source, 'SRD 5.2 (CC-BY-4.0)');
    assert.deepEqual(byId.get('monks-focus')?.data.uses, { value: 2, max: 2, recovery: 'sr' });
    assert.equal(byId.get('uncanny-metabolism')?.data.uses.recovery, 'lr');
    for (const identifier of ['flurry-of-blows', 'patient-defense', 'step-of-the-wind']) {
      assert.equal(byId.get(identifier)?.data.source, 'SRD 5.2 (CC-BY-4.0)');
    }
    const laterRows = db.prepare("SELECT name, data FROM entries WHERE type = 'feature'").all()
      .map((row) => ({ name: row.name, data: JSON.parse(row.data) }))
      .filter((entry) => entry.data.classIdentifier === 'monk');
    const laterNames = new Set(laterRows.map(({ name }) => name));
    for (const name of ['Deflect Attacks', 'Empowered Strikes', 'Acrobatic Movement', 'Heightened Focus',
      'Self-Restoration', 'Deflect Energy', 'Disciplined Survivor', 'Perfect Focus', 'Superior Defense', 'Body and Mind']) {
      assert.equal(laterNames.has(name), true, `${name} should be represented as a current class feature`);
      const feature = laterRows.find((entry) => entry.name === name);
      assert.equal(feature.data.source, 'SRD 5.2 (CC-BY-4.0)');
      assert.equal(feature.data.mechanicsSupport.status, 'manual');
    }
  } finally {
    db.close();
  }
});

test('Ranger Favored Enemy resolves only the unique level-one Ranger Hunter’s Mark', () => {
  const valid = { id: 'hm', name: "Hunter's Mark", data: { spellLevel: 1, classes: ['ranger'] } };
  assert.equal(resolveRangerFavoredEnemySpell([valid]).valid, true);
  assert.equal(resolveRangerFavoredEnemySpell([valid], ['hm']).valid, false);
  assert.equal(resolveRangerFavoredEnemySpell([{ ...valid, data: { spellLevel: 2, classes: ['ranger'] } }]).valid, false);
  assert.equal(resolveRangerFavoredEnemySpell([valid, valid]).valid, false);
});

test('Bardic Inspiration uses follow Charisma modifier and its die scales by Bard class level', () => {
  assert.equal(bardicInspirationUses(8), 1);
  assert.equal(bardicInspirationUses(14), 2);
  assert.equal(bardicInspirationUses(20), 5);
  assert.deepEqual([1, 4, 5, 9, 10, 14, 15, 20].map(bardicInspirationDieAtLevel),
    ['d6', 'd6', 'd8', 'd8', 'd10', 'd10', 'd12', 'd12']);
  assert.deepEqual(syncBardicInspiration({ max: 2, value: 2 }, 16),
    { max: 3, value: 3, recovery: 'lr' });
  assert.deepEqual(syncBardicInspiration({ max: 2, value: 1 }, 16),
    { max: 3, value: 1, recovery: 'lr' });
  assert.deepEqual([0, 1, 2, 3, -1, Number.NaN].map(superiorInspirationUsesAfterInitiative),
    [2, 2, 2, 3, null, null]);
  assert.deepEqual(resolveSuperiorInspirationRecovery({ bardLevel: 18, hasFeature: true, currentUses: 1 }),
    { eligible: true, restored: true, uses: 2, reason: '' });
  assert.equal(resolveSuperiorInspirationRecovery({ bardLevel: 17, hasFeature: true, currentUses: 0 }).eligible, false);
  assert.equal(resolveSuperiorInspirationRecovery({ bardLevel: 18, hasFeature: false, currentUses: 0 }).eligible, false);
  assert.equal(resolveSuperiorInspirationRecovery({ bardLevel: 18, hasFeature: true, currentUses: 2 }).restored, false);
});

test('Bard table gaps have source-verified level records and explicit automation limits', () => {
  const db = new DatabaseSync(new URL('../packs/features.sqlite', import.meta.url), { readOnly: true });
  try {
    const ids = ['srd52-bard-expertise-2', 'srd52-bard-expertise-9', 'srd52-bard-countercharm',
      'srd52-bard-superior-inspiration', 'srd52-bard-words-of-creation'];
    const rows = db.prepare(`SELECT id, name, data FROM entries WHERE type = 'feature' AND id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    assert.equal(rows.length, ids.length);
    const features = new Map(rows.map((row) => [row.id, { ...row, data: JSON.parse(row.data) }]));
    assert.equal(features.get('srd52-bard-expertise-2').data.levelGained, 2);
    assert.equal(features.get('srd52-bard-expertise-2').data.expertiseSkillCount, 2);
    assert.equal(features.get('srd52-bard-expertise-9').data.levelGained, 9);
    assert.equal(features.get('srd52-bard-expertise-2').data.mechanicsSupport.status, 'assisted');
    assert.deepEqual(features.get('srd52-bard-expertise-9').data.mechanicsSupport.automated,
      ['ordinary-level-up-choice', 'high-level-character-creation', 'multiclass-class-level-up']);
    assert.ok(features.get('srd52-bard-expertise-2').data.mechanicsSupport.manualNoticeKey);
    assert.equal(features.get('srd52-bard-countercharm').data.mechanicsSupport.status, 'manual');
    assert.equal(features.get('srd52-bard-superior-inspiration').data.mechanicsSupport.status, 'assisted');
    assert.equal(features.get('srd52-bard-words-of-creation').data.mechanicsSupport.status, 'manual');
    assert.ok(features.get('srd52-bard-words-of-creation').data.mechanicsSupport.manualNoticeKey);
    const spells = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
    try {
      // SRD 5.2 .dev/srd5.2_markdown/spells.md "#### Power Word Heal" (Level 9 Enchantment, Bard, Cleric) is a normal spell record; Words of Creation only grants it as always-prepared.
      assert.equal(spells.prepare("SELECT COUNT(*) AS count FROM entries WHERE type = 'spell' AND name = ?").get('Power Word Heal').count, 1);
    } finally { spells.close(); }
  } finally { db.close(); }
});

test('Bard Expertise requires two distinct proficient skills without existing Expertise', () => {
  const skills = { arcana: { proficient: true }, history: { proficient: true },
    stealth: { proficient: true, multiplier: 2 }, athletics: { proficient: false } };
  assert.equal(resolveExpertiseChoices(skills, ['arcana', 'history']).valid, true);
  assert.equal(resolveExpertiseChoices(skills, ['arcana']).valid, false);
  assert.equal(resolveExpertiseChoices(skills, ['arcana', 'arcana']).valid, false);
  assert.equal(resolveExpertiseChoices(skills, ['arcana', 'stealth']).valid, false);
  assert.equal(resolveExpertiseChoices(skills, ['arcana', 'athletics']).valid, false);
});

test('high-level Bard creation resolves level-2 and level-9 Expertise cumulatively', () => {
  const skills = Object.fromEntries(['arcana', 'history', 'perception', 'performance', 'persuasion'].map((key) => [key, { proficient: true }]));
  const valid = resolveBardExpertiseProgression(skills, { 2: ['arcana', 'history'], 9: ['perception', 'performance'] }, [2, 9]);
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.selections, { 2: ['arcana', 'history'], 9: ['perception', 'performance'] });
  assert.deepEqual(Object.keys(valid.skills).filter((key) => valid.skills[key].multiplier === 2),
    ['arcana', 'history', 'perception', 'performance']);
  assert.equal(resolveBardExpertiseProgression(skills, { 2: ['arcana', 'history'], 9: ['arcana', 'persuasion'] }, [2, 9]).valid, false);
  assert.equal(resolveBardExpertiseProgression(skills, { 2: ['arcana', 'history'] }, [2, 9]).failedLevel, 9);
});

test('first-level weapon mastery choices match every weapon and mastery in the local SRD table', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/equipment.md', import.meta.url), 'utf8');
  const weaponTable = source.split('**Weapons**')[1]?.split('## Armor')[0] || '';
  const sourceRows = new Map();
  let category = '';
  for (const [, row] of weaponTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const heading = row.match(/<em>(Simple|Martial) (Melee|Ranged) Weapons<\/em>/i);
    if (heading) { category = `${heading[1].toLowerCase()}${heading[2].toLowerCase() === 'melee' ? 'M' : 'R'}`; continue; }
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, value]) => value.replace(/<[^>]+>/g, '').trim());
    if (cells.length >= 4) sourceRows.set(cells[0].toLowerCase(), { mastery: cells[3].toLowerCase(), category });
  }
  assert.equal(SRD_WEAPON_MASTERY_OPTIONS.length, 38);
  assert.equal(SRD_WEAPON_MASTERY_OPTIONS.length, sourceRows.size);
  for (const weapon of SRD_WEAPON_MASTERY_OPTIONS) {
    const sourceRow = sourceRows.get(weapon.name.toLowerCase());
    assert.ok(sourceRow, `missing weapon ${weapon.name}`);
    assert.equal(sourceRow.mastery, weapon.mastery, `${weapon.name} mastery`);
    assert.equal(sourceRow.category, weapon.weaponType, `${weapon.name} category`);
  }
});

test('Weapon Mastery choices enforce class counts and only offer weapons allowed by the feature', () => {
  const barbarian = resolveWeaponMasteryChoices('barbarian', ['greataxe', 'handaxe']);
  assert.equal(barbarian.valid, true);
  assert.equal(barbarian.options.some((weapon) => weapon.rangeType === 'ranged'), false);
  assert.equal(resolveWeaponMasteryChoices('fighter', ['longbow', 'shortbow', 'dagger']).valid, true);
  assert.equal(resolveWeaponMasteryChoices('fighter', ['longbow', 'shortbow']).reason, 'invalid-choice-count-or-weapon');
  const rogue = resolveWeaponMasteryChoices('rogue', ['dagger', 'shortsword'], ['simpleM', 'martial:light']);
  assert.equal(rogue.valid, true);
  assert.equal(resolveWeaponMasteryChoices('rogue', ['warhammer', 'shortsword'], ['martial:light']).valid, false);
  assert.equal(resolveWeaponMasteryChoices('rogue', ['dagger', 'dagger'], ['simpleM']).valid, false);
  assert.equal(resolveWeaponMasteryChoices('paladin', ['longsword', 'warhammer'], []).options.length, 0,
    'Paladin/Ranger options require an explicit weapon proficiency context');
});

test('Weapon Mastery counts follow only Barbarian and Fighter table increases', () => {
  assert.deepEqual([1, 3, 4, 9, 10, 15, 16, 20].map((level) => weaponMasteryCountAtLevel('barbarian', level)),
    [2, 2, 3, 3, 4, 4, 4, 4]);
  assert.deepEqual([1, 3, 4, 9, 10, 15, 16, 20].map((level) => weaponMasteryCountAtLevel('fighter', level)),
    [3, 3, 4, 4, 5, 5, 6, 6]);
  for (const classIdentifier of ['paladin', 'ranger', 'rogue']) {
    assert.deepEqual([1, 3, 4, 9, 10, 15, 16, 20].map((level) => weaponMasteryCountAtLevel(classIdentifier, level)),
      Array(8).fill(2), `${classIdentifier} has no increasing mastery table column`);
  }
  assert.equal(weaponMasteryCountAtLevel('barbarian', 0), 0);
  assert.equal(weaponMasteryCountAtLevel('fighter', 21), 0);
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const sourceCount = (className) => {
    const start = source.indexOf(`### ${className} Class Features`);
    const nextClass = className === 'Barbarian' ? 'Bard' : 'Monk';
    const end = source.indexOf(`\n## ${nextClass}`, start + 4);
    const section = source.slice(start, end < 0 ? undefined : end);
    const table = section.match(/<table>[\s\S]*?<\/table>/g)?.find((candidate) => /<th>Weapon Mastery<\/th>/.test(candidate));
    assert.ok(table, `local SRD contains ${className} Weapon Mastery table`);
    return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map(([, row]) => {
      const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell.trim());
      return [Number(cells[0]), Number(cells.at(-1))];
    });
  };
  for (const [className, identifier] of [['Barbarian', 'barbarian'], ['Fighter', 'fighter']]) {
    for (const [level, count] of sourceCount(className)) {
      assert.equal(weaponMasteryCountAtLevel(identifier, level), count, `${className} level ${level} matches local SRD`);
    }
  }
});

test('Long Rest mastery replacement changes only one saved eligible weapon', () => {
  const saved = ['greataxe', 'handaxe'];
  const valid = resolveWeaponMasteryReplacement('barbarian', saved, 'handaxe', 'greataxe');
  assert.equal(valid.valid, false, 'a weapon already mastered cannot replace another pick');
  const changed = resolveWeaponMasteryReplacement('barbarian', saved, 'handaxe', 'javelin');
  assert.equal(changed.valid, true);
  assert.deepEqual(changed.choices, ['greataxe', 'javelin']);
  assert.equal(resolveWeaponMasteryReplacement('barbarian', saved, 'dagger', 'javelin').valid, false);
  assert.equal(resolveWeaponMasteryReplacement('rogue', ['dagger', 'shortsword'], 'dagger', 'longbow', ['simpleM', 'martial:light']).valid, false,
    'replacement must be within the class feature’s proficient weapon options');
  const skipped = resolveWeaponMasteryReplacement('rogue', ['dagger', 'shortsword'], '', '', ['simpleM', 'martial:light']);
  assert.equal(skipped.valid, true);
  assert.deepEqual(skipped.choices, ['dagger', 'shortsword'], 'skipping is a no-op');
});

test('Weapon Mastery feature data records the complete legal class-level selection', () => {
  const feature = { identifier: 'weapon-mastery', classIdentifier: 'barbarian', masteryCount: 2 };
  const barbarian = resolveWeaponMasteryFeatureData('barbarian', 10, feature,
    ['greataxe', 'handaxe', 'javelin', 'mace'], ['simpleM', 'martialM']);
  assert.equal(barbarian.valid, true);
  assert.equal(barbarian.data.masteryCount, 4);
  assert.deepEqual(barbarian.data.masteredWeaponIdentifiers, ['greataxe', 'handaxe', 'javelin', 'mace']);
  const incomplete = resolveWeaponMasteryFeatureData('fighter', 4, feature, ['longbow', 'dagger'], ['simpleM', 'martialR']);
  assert.equal(incomplete.valid, false);
  assert.equal(incomplete.data, feature, 'invalid selections never become active saved choices');
});

test('Topple requires a unique valid saved mastery and computes the SRD save DC', () => {
  const items = [
    { type: 'class', system: { classIdentifier: 'fighter', levels: 1 } },
    { type: 'feature', system: { identifier: 'weapon-mastery', classIdentifier: 'fighter', masteredWeaponIdentifiers: ['quarterstaff', 'greatsword', 'dagger'] } },
  ];
  const staff = { id: 'weapon-1', name: 'Quarterstaff', system: { identifier: 'quarterstaff' } };
  assert.deepEqual(weaponMasteryForAttack(items, staff, ['simpleM', 'martialM']), {
    classIdentifier: 'fighter', weaponIdentifier: 'quarterstaff', property: 'topple',
  });
  assert.equal(weaponMasteryForAttack(items, { name: 'Greatsword' }, ['simpleM', 'martialM'])?.property, 'graze');
  assert.equal(weaponMasteryForAttack(items, { name: 'Maul' }, ['simpleM', 'martialM']), null,
    'a legal weapon not selected for this actor cannot use its mastery property');
  const rogueItems = [
    { type: 'class', system: { classIdentifier: 'rogue', levels: 1 } },
    { type: 'feature', system: { identifier: 'weapon-mastery', classIdentifier: 'rogue', masteredWeaponIdentifiers: ['quarterstaff', 'dagger'] } },
  ];
  assert.equal(weaponMasteryForAttack(rogueItems, staff, ['simpleM'])?.property, 'topple');
  assert.equal(weaponMasteryForAttack(rogueItems, staff, []), null,
    'a saved choice that is no longer valid for current proficiencies fails closed');
  const ambiguous = [...items, { type: 'feature', system: { identifier: 'weapon-mastery', classIdentifier: 'fighter', masteredWeaponIdentifiers: ['quarterstaff', 'greatsword', 'dagger'] } }];
  assert.equal(weaponMasteryForAttack(ambiguous, staff, ['simpleM', 'martialM']), null,
    'duplicate matching mastery features fail closed');
  const multiclass = [...items,
    { type: 'class', system: { classIdentifier: 'barbarian', levels: 1 } },
    { type: 'feature', system: { identifier: 'weapon-mastery', classIdentifier: 'barbarian', masteredWeaponIdentifiers: ['quarterstaff', 'greatclub'] } },
  ];
  assert.equal(weaponMasteryForAttack(multiclass, staff, ['simpleM', 'martialM'])?.property, 'topple',
    'the same weapon may be granted by separate valid class mastery features');
  assert.equal(weaponMasterySaveDC(3, 4), 15);
  assert.equal(weaponMasterySaveDC(-1, 2), 9);
  assert.equal(weaponMasterySaveDC(1, -1), null);
  const attackMeta = { actorId: 'attacker', itemId: 'weapon', isAttack: true, srd5eWeaponMastery: {
    property: 'topple', abilityModifier: 2, proficiencyBonus: 3, saveDC: 13,
  } };
  assert.deepEqual(weaponMasteryToppleAction(attackMeta, { castId: 'target' }, true), {
    actorId: 'attacker', itemId: 'weapon', targetCastId: 'target', saveDC: 13,
  });
  assert.equal(weaponMasteryToppleAction(attackMeta, { castId: 'target' }, false), null);
  assert.equal(weaponMasteryToppleAction({ ...attackMeta, isSpell: true }, { castId: 'target' }, true), null);
  assert.equal(weaponMasteryToppleAction(attackMeta, {}, true), null);
  const grazeMeta = { actorId: 'attacker', itemId: 'weapon', isAttack: true, srd5eWeaponMastery: {
    property: 'graze', abilityKey: 'dex', abilityModifier: 3, damageType: 'piercing',
  } };
  assert.deepEqual(weaponMasteryGrazeAction(grazeMeta, { castId: 'missed-target' }, false), {
    actorId: 'attacker', itemId: 'weapon', targetCastId: 'missed-target',
    abilityKey: 'dex', abilityModifier: 3, damageType: 'piercing',
  });
  assert.equal(weaponMasteryGrazeAction(grazeMeta, { castId: 'target' }, true), null);
  assert.equal(weaponMasteryGrazeAction({ ...grazeMeta, srd5eWeaponMastery: { ...grazeMeta.srd5eWeaponMastery, abilityModifier: 0 } }, { castId: 'target' }, false), null);
  assert.equal(weaponMasteryGrazeAction({ ...grazeMeta, srd5eWeaponMastery: { ...grazeMeta.srd5eWeaponMastery, abilityModifier: -2 } }, { castId: 'target' }, false), null);
  assert.equal(weaponMasteryGrazeAction({ ...grazeMeta, isUnarmed: true }, { castId: 'target' }, false), null);
  const pushMeta = { actorId: 'attacker', itemId: 'weapon', isAttack: true, srd5eWeaponMastery: { property: 'push' } };
  assert.deepEqual(weaponMasteryPushAction(pushMeta, { castId: 'hit-target' }, true), {
    actorId: 'attacker', itemId: 'weapon', targetCastId: 'hit-target',
  });
  assert.equal(weaponMasteryPushAction(pushMeta, { castId: 'target' }, false), null);
  assert.equal(weaponMasteryPushAction({ ...pushMeta, isSpell: true }, { castId: 'target' }, true), null);
  assert.equal(weaponMasteryPushAction({ ...pushMeta, isUnarmed: true }, { castId: 'target' }, true), null);
  assert.equal(weaponMasteryPushAction({ ...pushMeta, isAttack: false }, { castId: 'target' }, true), null);
  assert.equal(weaponMasteryPushAction(pushMeta, {}, true), null);
  const sapMeta = {
    actorId: 'attacker', itemId: 'weapon', isAttack: true, srd5eWeaponMastery: { property: 'sap' },
    srd5eSapContext: { combatId: 'combat-1', sourceCastId: 'attacker-cast', appliedTurn: { round: 2, castId: 'turn-cast' } },
    srd5eSapOperationId: 'sap-op-1',
  };
  assert.deepEqual(weaponMasterySapAction(sapMeta, { castId: 'target-cast' }, true), {
    actorId: 'attacker', itemId: 'weapon', targetCastId: 'target-cast', operationId: 'sap-op-1',
    context: { combatId: 'combat-1', sourceCastId: 'attacker-cast', appliedTurn: { round: 2, castId: 'turn-cast' } },
  });
  assert.equal(weaponMasterySapAction(sapMeta, { castId: 'target-cast' }, false), null);
  assert.equal(weaponMasterySapAction({ ...sapMeta, isSpell: true }, { castId: 'target-cast' }, true), null);
  assert.equal(weaponMasterySapAction({ ...sapMeta, srd5eSapContext: null }, { castId: 'target-cast' }, true), null);
  assert.equal(weaponMasterySapAction({ ...sapMeta, srd5eSapOperationId: '' }, { castId: 'target-cast' }, true), null);
  const vexMeta = {
    actorId: 'attacker', itemId: 'weapon', isAttack: true, srd5eWeaponMastery: { property: 'vex' },
    srd5eVexContext: { combatId: 'combat-1', sourceCastId: 'attacker-cast', appliedTurn: { round: 2, castId: 'active-cast' } },
    srd5eVexOperationId: 'vex-op-1',
  };
  const vexAction = weaponMasteryVexAction(vexMeta, { castId: 'target-cast', ac: 13 }, true, {
    total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [false] }, { kind: 'modifier', value: 5 }],
  });
  assert.deepEqual(vexAction, {
    actorId: 'attacker', itemId: 'weapon', targetCastId: 'target-cast', operationId: 'vex-op-1',
    context: vexMeta.srd5eVexContext,
    attack: { total: 15, targetAC: 13, terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [false] }] },
  });
  assert.equal(weaponMasteryVexAction(vexMeta, { castId: 'target-cast', ac: 13 }, false, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasteryVexAction({ ...vexMeta, isSpell: true }, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasteryVexAction({ ...vexMeta, srd5eVexContext: null }, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  const slowMeta = {
    actorId: 'attacker', itemId: 'weapon', isAttack: true, srd5eWeaponMastery: { property: 'slow' },
    srd5eSlowContext: { combatId: 'combat-1', sourceCastId: 'attacker-cast', appliedTurn: { round: 2, castId: 'active-cast' } },
    srd5eSlowOperationId: 'slow-op-1',
  };
  const slowAction = weaponMasterySlowAction(slowMeta, { castId: 'target-cast', ac: 13 }, true, {
    total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [false] }, { kind: 'modifier', value: 5 }],
  });
  assert.deepEqual(slowAction, {
    actorId: 'attacker', itemId: 'weapon', targetCastId: 'target-cast', operationId: 'slow-op-1',
    context: slowMeta.srd5eSlowContext,
    attack: { total: 15, targetAC: 13, terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [false] }] },
  });
  assert.equal(weaponMasterySlowAction(slowMeta, { castId: 'target-cast', ac: 13 }, false, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasterySlowAction({ ...slowMeta, isSpell: true }, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasterySlowAction({ ...slowMeta, isUnarmed: true }, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasterySlowAction({ ...slowMeta, srd5eWeaponMastery: { property: 'sap' } }, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasterySlowAction({ ...slowMeta, srd5eSlowContext: null }, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasterySlowAction({ ...slowMeta, srd5eSlowOperationId: '' }, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }] }), null);
  assert.equal(weaponMasterySlowAction(slowMeta, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [0] }] }), null);
  assert.equal(weaponMasterySlowAction(slowMeta, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [true] }] }), null);
  assert.equal(weaponMasterySlowAction(slowMeta, { castId: 'target-cast', ac: 13 }, true, { total: 15, terms: [{ kind: 'dice', faces: 20, rolls: [10] }, { kind: 'dice', faces: 20, rolls: [5] }] }), null);
  for (const size of ['tiny', 'sm', 'small', 'med', 'medium', 'lg', 'large']) {
    assert.equal(weaponMasteryPushTargetSizeEligible(size), true, `${size} is eligible`);
  }
  for (const size of ['huge', 'grg', 'gargantuan']) {
    assert.equal(weaponMasteryPushTargetSizeEligible(size), false, `${size} is too large`);
  }
  assert.equal(weaponMasteryPushTargetSizeEligible('unknown'), null);
});

test('Slow is offered only after positive damage reaches its original target', () => {
  const request = { actorId: 'actor-a', targetCastId: 'cast-a', operationId: 'slow-a' };
  assert.equal(weaponMasterySlowDamageRequest(request, []), null);
  assert.equal(weaponMasterySlowDamageRequest(request, [{ castId: 'cast-a', finalAmount: 0 }]), null);
  assert.equal(weaponMasterySlowDamageRequest(request, [{ castId: 'cast-b', finalAmount: 4 }]), null);
  assert.deepEqual(weaponMasterySlowDamageRequest(request, [
    { castId: 'cast-b', finalAmount: 4 }, { castId: 'cast-a', finalAmount: 7 },
  ]), { ...request, appliedDamage: 7 });
  assert.equal(weaponMasterySlowDamageRequest({}, [{ castId: 'cast-a', finalAmount: 7 }]), null);
});

test('Cleave follows only a valid mastered melee hit and is limited once per active turn', () => {
  const turn = { combatId: 'combat-1', round: 4, castId: 'active-cast' };
  const meta = { isAttack: true, actorId: 'actor-a', itemId: 'greataxe',
    srd5eWeaponMastery: { property: 'cleave' }, srd5eCleaveTurn: turn };
  assert.deepEqual(weaponMasteryCleaveAction(meta, { castId: 'first-target' }, true), {
    actorId: 'actor-a', itemId: 'greataxe', targetCastId: 'first-target', cleaveTurn: turn,
  });
  assert.equal(weaponMasteryCleaveAction(meta, { castId: 'first-target' }, false), null);
  assert.equal(weaponMasteryCleaveAction({ ...meta, isSpell: true }, { castId: 'first-target' }, true), null);
  assert.equal(weaponMasteryCleaveAction({ ...meta, isRanged: true }, { castId: 'first-target' }, true), null);
  assert.equal(weaponMasteryCleaveAction({ ...meta, isUnarmed: true }, { castId: 'first-target' }, true), null);
  assert.equal(weaponMasteryCleaveAction({ ...meta, srd5eCleaveTurn: null }, { castId: 'first-target' }, true), null);
  assert.equal(weaponMasteryCleaveTurnAvailable(null, turn), true);
  assert.equal(weaponMasteryCleaveTurnAvailable(turn, turn), false);
  assert.equal(weaponMasteryCleaveTurnAvailable(turn, { ...turn, castId: 'next-cast' }), true);
  assert.equal(weaponMasteryCleaveTurnAvailable(turn, { ...turn, round: 5 }), true);
  assert.equal(weaponMasteryCleaveTurnAvailable(turn, { ...turn, combatId: 'combat-2' }), true);
  assert.equal(weaponMasteryDamageAbilityModifier(4, { cleaveAttack: true }), 0);
  assert.equal(weaponMasteryDamageAbilityModifier(-2, { cleaveAttack: true }), -2);
  assert.equal(weaponMasteryDamageAbilityModifier(0, { cleaveAttack: true }), 0);
});

test('Topple, Graze, and Push resolve only from the matching original single-target weapon roll', () => {
  const base = {
    total: 14,
    terms: [{ kind: 'dice', faces: 20, rolls: [12], dropped: [] }],
    meta: {
      isAttack: true, actorId: 'actor-a', itemId: 'weapon-a', srd5eAttackAbility: 'str',
      targets: [{ castId: 'cast-a', ac: 15 }],
      srd5eWeaponMastery: { property: 'graze', abilityKey: 'str', abilityModifier: 2, damageType: 'slashing' },
    },
  };
  assert.deepEqual(resolveWeaponMasteryAttack(base, 'graze', false), {
    actorId: 'actor-a', itemId: 'weapon-a', targetCastId: 'cast-a', property: 'graze', hit: false,
    abilityKey: 'str', abilityModifier: 2, damageType: 'slashing',
  });
  assert.equal(resolveWeaponMasteryAttack(base, 'graze', true), null, 'a miss cannot be promoted to a hit');
  assert.equal(resolveWeaponMasteryAttack({ ...base, meta: { ...base.meta, targets: [...base.meta.targets, { castId: 'cast-b', ac: 10 }] } }, 'graze', false), null);
  assert.equal(resolveWeaponMasteryAttack({ ...base, meta: { ...base.meta, isSpell: true } }, 'graze', false), null);
  assert.equal(resolveWeaponMasteryAttack({ ...base, terms: [{ kind: 'dice', faces: 20, rolls: [1], dropped: [] }] }, 'graze', true), null,
    'a natural 1 cannot authorize a hit even when the total exceeds AC');

  const topple = {
    ...base, total: 16,
    terms: [{ kind: 'dice', faces: 20, rolls: [14], dropped: [] }],
    meta: { ...base.meta, targets: [{ castId: 'cast-a', ac: 15 }], srd5eWeaponMastery: {
      property: 'topple', abilityKey: 'str', abilityModifier: 2, proficiencyBonus: 3, saveDC: 13,
    } },
  };
  assert.equal(resolveWeaponMasteryAttack(topple, 'topple', true)?.saveDC, 13);
  assert.equal(resolveWeaponMasteryAttack({ ...topple, meta: { ...topple.meta,
    srd5eWeaponMastery: { ...topple.meta.srd5eWeaponMastery, saveDC: 18 } } }, 'topple', true), null,
  'Topple DC must agree with captured ability and proficiency');

  const push = { ...base, total: 15, meta: { ...base.meta, srd5eWeaponMastery: { property: 'push', abilityKey: 'str' } } };
  assert.equal(resolveWeaponMasteryAttack(push, 'push', true)?.targetCastId, 'cast-a');
  assert.equal(resolveWeaponMasteryAttack(push, 'push', false), null);
  assert.equal(resolveWeaponMasteryAttack(push, 'slow', true), null, 'a different mastery cannot authorize Push');
});

test('combat effect ledger uses stable Cast turn identities and idempotent expiry and consumption', () => {
  const sap = createCombatEffectRecord({
    id: 'sap-hit-1', type: 'sap', sourceCastId: 'attacker-cast', targetCastId: 'target-cast',
    combatId: 'combat-a', appliedTurn: { round: 2, castId: 'attacker-cast' },
  });
  const slow = createCombatEffectRecord({
    id: 'slow-hit-1', type: 'slow', sourceCastId: 'attacker-cast', targetCastId: 'target-cast',
    combatId: 'combat-a', appliedTurn: { round: 2, castId: 'attacker-cast' },
  });
  const vex = createCombatEffectRecord({
    id: 'vex-hit-1', type: 'vex', sourceCastId: 'attacker-cast', targetCastId: 'target-cast',
    combatId: 'combat-a', appliedTurn: { round: 2, castId: 'attacker-cast' },
  });
  assert.equal(combatEffectOwnerCastId(sap), 'target-cast');
  assert.equal(combatEffectOwnerCastId(slow), 'target-cast');
  assert.equal(combatEffectOwnerCastId(vex), 'attacker-cast');
  assert.equal(createCombatEffectRecord({ ...sap, appliedTurn: { round: 0, castId: 'attacker-cast' } }), null);
  assert.equal(createCombatEffectRecord({ ...sap, type: 'unknown' }), null);

  const first = appendCombatEffectRecord([], sap);
  assert.equal(first.added, true);
  assert.deepEqual(appendCombatEffectRecord(first.records, sap), { valid: true, added: false, records: first.records });
  assert.equal(appendCombatEffectRecord(first.records, { ...sap, id: 'bad', sourceCastId: '' }).valid, false);

  const stillSameTurn = advanceCombatEffectRecords([sap, slow, vex], {
    combatId: 'combat-a', round: 2, currentCastId: 'attacker-cast',
  });
  assert.deepEqual(stillSameTurn.expired, []);
  assert.equal(stillSameTurn.records[2].armedTurn, undefined);
  const otherTurn = advanceCombatEffectRecords(stillSameTurn.records, {
    combatId: 'combat-a', round: 2, currentCastId: 'other-cast',
  });
  assert.deepEqual(otherTurn.expired, []);
  const sourceNextStart = advanceCombatEffectRecords(otherTurn.records, {
    combatId: 'combat-a', round: 3, currentCastId: 'attacker-cast',
  });
  assert.deepEqual(sourceNextStart.expired, ['sap-hit-1', 'slow-hit-1']);
  assert.deepEqual(sourceNextStart.records.map((record) => record.id), ['vex-hit-1']);
  assert.deepEqual(sourceNextStart.records[0].armedTurn, {
    combatId: 'combat-a', round: 3, castId: 'attacker-cast',
  });
  const sourceNextEnd = advanceCombatEffectRecords(sourceNextStart.records, {
    combatId: 'combat-a', round: 3, currentCastId: 'other-cast',
  });
  assert.deepEqual(sourceNextEnd.expired, ['vex-hit-1']);
  assert.deepEqual(sourceNextEnd.records, []);

  const nextStartVex = createCombatEffectRecord({
    ...vex, id: 'vex-hit-2', appliedTurn: { round: 2, castId: 'other-cast' },
  });
  const activeVex = advanceCombatEffectRecords([nextStartVex], {
    combatId: 'combat-a', round: 2, currentCastId: 'attacker-cast',
  });
  assert.equal(activeVex.records[0].armedTurn.castId, 'attacker-cast');
  assert.deepEqual(advanceCombatEffectRecords(activeVex.records, {
    combatId: 'combat-a', round: 2, currentCastId: 'other-cast',
  }).expired, ['vex-hit-2']);

  assert.deepEqual(combatEffectsForAttack([sap, vex], {
    combatId: 'combat-a', sourceCastId: 'target-cast', targetCastId: 'attacker-cast',
  }).map((record) => record.id), ['sap-hit-1']);
  assert.deepEqual(combatEffectsForAttack([sap, vex], {
    combatId: 'combat-a', sourceCastId: 'attacker-cast', targetCastId: 'target-cast',
  }).map((record) => record.id), ['vex-hit-1']);
  assert.equal(combatSpeedPenaltyFeet([slow, { ...slow, id: 'slow-hit-2' }], 'combat-a', 'target-cast'), 10);
  assert.equal(combatSpeedPenaltyFeet([slow], 'combat-b', 'target-cast'), 0);
  assert.deepEqual(consumeCombatEffectRecords([sap, vex], ['sap-hit-1', 'missing']), [vex]);
  assert.deepEqual(consumeCombatEffectRecords([vex], ['vex-hit-1']), []);
  assert.deepEqual(clearCombatEffectRecords([sap, { ...sap, id: 'other-combat', combatId: 'combat-b' }], 'combat-a'), [
    createCombatEffectRecord({ ...sap, id: 'other-combat', combatId: 'combat-b', appliedTurn: { round: 2, castId: 'attacker-cast' } }),
  ]);
  assert.deepEqual(advanceCombatEffectRecords([sap], { combatId: 'combat-b', round: 2, currentCastId: 'attacker-cast' }).records, [sap]);
});

test('combat effect context binds actors to exact Casts and the current stable turn identity', () => {
  const combat = { id: 'combat-1', round: 3, currentTurn: 1, combatants: [{ id: 'cast-a' }, { id: 'cast-b' }, { id: 'cast-a-copy' }, { id: 'cast-unlinked' }] };
  const casts = [
    { id: 'cast-a', actorId: 'actor-a' },
    { id: 'cast-b', actorId: 'actor-b' },
    { id: 'cast-a-copy', actorId: 'actor-a' },
  ];
  assert.deepEqual(combatEffectContextForActor(combat, casts, 'actor-b'), {
    combatId: 'combat-1', sourceCastId: 'cast-b', appliedTurn: { round: 3, castId: 'cast-b' },
  });
  assert.equal(combatEffectContextForActor(combat, casts, 'actor-a'), null,
    'duplicate off-turn Casts are ambiguous and fail closed');
  assert.deepEqual(combatEffectContextForActor({ ...combat, currentTurn: 0 }, casts, 'actor-a'), {
    combatId: 'combat-1', sourceCastId: 'cast-a', appliedTurn: { round: 3, castId: 'cast-a' },
  }, 'the active Cast resolves an actor with multiple tokens');
  assert.deepEqual(combatEffectContextForActor(combat, [...casts, { id: 'cast-unlinked', actorId: null }], 'cast-unlinked'), {
    combatId: 'combat-1', sourceCastId: 'cast-unlinked', appliedTurn: { round: 3, castId: 'cast-b' },
  }, 'an unlinked combat Cast resolves only by its own identity');
  assert.equal(combatEffectContextForActor({ ...combat, currentTurn: 8 }, casts, 'actor-b'), null);
  assert.equal(combatEffectContextForActor({ ...combat, round: 0 }, casts, 'actor-b'), null);
  assert.deepEqual(combatEffectRecordsForActiveCombat([
    createCombatEffectRecord({ id: 'old', type: 'sap', sourceCastId: 'a', targetCastId: 'b', combatId: 'old-combat', appliedTurn: { round: 1, castId: 'a' } }),
    createCombatEffectRecord({ id: 'current', type: 'sap', sourceCastId: 'a', targetCastId: 'b', combatId: 'combat-1', appliedTurn: { round: 1, castId: 'a' } }),
  ], 'combat-1').map((effect) => effect.id), ['current']);
  assert.deepEqual(clearAllCombatEffectRecords(), []);
});

test('Long Rest offers one independent replacement for each valid weapon mastery class feature', () => {
  const items = [
    { id: 'barbarian-class', type: 'class', name: 'Barbarian', data: { classIdentifier: 'barbarian', levels: 4 } },
    { id: 'barbarian-mastery', type: 'feature', data: { identifier: 'weapon-mastery', classIdentifier: 'barbarian', masteredWeaponIdentifiers: ['greataxe', 'handaxe', 'javelin'] } },
    { id: 'fighter-class', type: 'class', name: 'Fighter', data: { classIdentifier: 'fighter', levels: 1 } },
    { id: 'fighter-mastery', type: 'feature', data: { identifier: 'weapon-mastery', classIdentifier: 'fighter', masteredWeaponIdentifiers: ['longbow', 'shortbow', 'dagger'] } },
  ];
  const offers = weaponMasteryRestCandidates(items, ['simpleM', 'simpleR', 'martialM', 'martialR']);
  assert.deepEqual(offers.map(({ featureId }) => featureId), ['barbarian-mastery', 'fighter-mastery']);
  assert.ok(offers[0].options.every((weapon) => weapon.rangeType === 'melee'));
  assert.ok(offers[1].options.some((weapon) => weapon.identifier === 'pistol'));
  items[1].data.masteredWeaponIdentifiers = ['greataxe'];
  assert.deepEqual(weaponMasteryRestCandidates(items, ['simpleM', 'simpleR', 'martialM', 'martialR'])
    .map(({ featureId }) => featureId), ['fighter-mastery'], 'malformed legacy choices are not offered for rewriting');
});

test('Cleric Divine Order validates Thaumaturge extra cantrips and Protector proficiencies', () => {
  const cantrip = { id: 'cleric-cantrip', name: 'Guidance', data: {
    identifier: 'guidance', source: 'SRD 5.2 (CC-BY-4.0)', spellLevel: 0, classes: ['cleric'],
  } };
  assert.equal(resolveClericDivineOrderChoice('protector', '', []).valid, true);
  assert.equal(resolveClericDivineOrderChoice('protector', cantrip.id, [cantrip]).valid, false);
  assert.equal(resolveClericDivineOrderChoice('thaumaturge', cantrip.id, [cantrip]).valid, true);
  assert.equal(resolveClericDivineOrderChoice('thaumaturge', cantrip.id, [cantrip], [cantrip.id]).valid, false);
  assert.equal(resolveClericDivineOrderChoice('thaumaturge', 'other', [cantrip]).valid, false);
  assert.equal(resolveClericDivineOrderChoice('invalid', '', []).valid, false);
});

test('Thaumaturge adds Wisdom-based bonus only to Arcana and Religion checks with a +1 minimum', () => {
  assert.equal(clericDivineOrderSkillBonus('thaumaturge', 'arcana', 3), 3);
  assert.equal(clericDivineOrderSkillBonus('thaumaturge', 'religion', -2), 1);
  assert.equal(clericDivineOrderSkillBonus('thaumaturge', 'history', 4), 0);
  const systemData = {
    abilities: { int: { modifier: 2 }, wis: { modifier: -1 } },
    skills: {
      arcana: { ability: 'int', proficient: true },
      religion: { ability: 'int', proficient: false },
      history: { ability: 'int', proficient: false },
    },
  };
  prepSkills(systemData, 2, [{ type: 'feature', data: {
    identifier: 'divine-order', classIdentifier: 'cleric', selectedOrder: 'thaumaturge',
  } }]);
  assert.equal(systemData.skills.arcana.total, 5);
  assert.equal(systemData.skills.religion.total, 3);
  assert.equal(systemData.skills.history.total, 2);
});

test('Wizard level-up journal stages spell, feature, class, and actor writes with a final level commit', () => {
  const actor = { id: 'actor-1', flags: { custom: { retained: true } }, systemData: { details: { level: 1 }, abilities: { int: { value: 16 } } } };
  const journal = createWizardLevelUpJournal({
    worldId: 'world-1', actor, transactionId: 'tx-wiz-2',
    classItem: { id: 'class-1' }, classData: { classIdentifier: 'wizard', levels: 2 },
    actorPatch: { 'system.details.level': 2, 'system.abilities.int.value': 18 },
    creates: [{ key: 'scholar', name: 'Scholar', type: 'feature', data: { expertiseSkill: 'arcana' } },
      { key: 'spellbook-fireball', name: 'Fireball', type: 'spell', data: { wizardSpellbook: true } }],
    updates: [{ key: 'prepare-magic-missile', id: 'spell-1', data: { prepared: true } }],
  });
  assert.deepEqual(journal.operations.map(({ key }) => key), [
    'scholar', 'spellbook-fireball', 'prepare-magic-missile', 'class-level', 'character-progression',
  ]);
  assert.equal(journal.operations.at(-1).payload.systemData.details.level, 2);
  assert.equal(journal.operations.at(-1).payload.systemData.abilities.int.value, 18);
  assert.equal(actor.systemData.details.level, 1, 'building the journal does not mutate its actor snapshot');
  assert.match(journal.operations[0].payload.data.sdr5eProgressionOperationId, /^tx-wiz-2:scholar$/);
  assert.equal(journal.operations.at(-1).payload.flags.sdr5e.multiclassProgressionOperationId, 'tx-wiz-2:character-progression');
  assert.deepEqual(journal.operations.at(-1).payload.flags.custom, { retained: true });
  assert.throws(() => createWizardLevelUpJournal({ worldId: 'world-1', actor,
    transactionId: 'tx', classItem: { id: 'class-1' }, classData: {}, actorPatch: {},
    creates: [{ key: 'same', name: 'A', type: 'feature', data: {} }, { key: 'same', name: 'B', type: 'feature', data: {} }],
  }), /unique and non-empty/);
});

test('class level-up journal confirms replacement content before deletion and the final actor level write', () => {
  const journal = createClassLevelUpJournal({
    worldId: 'world-1', actor: { id: 'actor-2', systemData: { details: { level: 4 } } }, transactionId: 'monk-5',
    classItem: { id: 'monk-class' }, classData: { classIdentifier: 'monk', levels: 5 },
    actorPatch: { 'system.details.level': 5 },
    deletes: [{ key: 'replace-monk-spell-delete', id: 'spell-old' }],
    creates: [{ key: 'replace-monk-spell-create', name: 'New Spell', type: 'spell', data: { sourceClassIdentifier: 'monk' } }],
  });

  assert.deepEqual(journal.operations.map(({ kind, key }) => [kind, key]), [
    ['create-item', 'replace-monk-spell-create'],
    ['delete-item', 'replace-monk-spell-delete'],
    ['update-item', 'class-level'],
    ['update-actor', 'character-progression'],
  ]);
  assert.equal(journal.operations.at(-1).payload.systemData.details.level, 5);
});

test('Jack of All Trades adds half proficiency only to a skill check without skill proficiency', () => {
  const feature = { type: 'feature', name: 'Jack of All Trades', data: {
    classIdentifier: 'bard', levelGained: 2, identifier: 'jack-of-all-trades',
  } };
  const actor = getDefaultData('character');
  actor.abilities.dex.modifier = 2;
  actor.abilities.str.modifier = 3;
  actor.skills.acrobatics.proficient = false;
  actor.skills.athletics.proficient = true;

  prepSkills(actor, 3, [feature]);
  assert.equal(actor.skills.acrobatics.total, 3, 'unproficient Acrobatics adds half of proficiency 3');
  assert.equal(actor.skills.athletics.total, 6, 'proficient Athletics gets proficiency once, not Jack twice');
  assert.equal(jackOfAllTradesSkillBonus([], 4, false), 0, 'feature is required');
  assert.equal(jackOfAllTradesSkillBonus([feature], 4, true), 0, 'proficient skills do not receive the extra bonus');
});

test('Unarmored Defense uses the granted class formula and exact armor/shield gates', () => {
  const barbarian = { type: 'feature', name: 'Unarmored Defense', data: {
    classIdentifier: 'barbarian', levelGained: 1, identifier: 'unarmored-defense',
  } };
  const monk = { type: 'feature', name: 'Unarmored Defense', data: {
    classIdentifier: 'monk', levelGained: 1, identifier: 'unarmored-defense',
  } };
  const modifiers = { dexterityModifier: 2, constitutionModifier: 3, wisdomModifier: 4 };
  assert.equal(unarmoredDefenseBaseAC([barbarian], modifiers), 15);
  assert.equal(unarmoredDefenseBaseAC([barbarian], { ...modifiers, shieldWielded: true }), 15,
    'Barbarian keeps the formula with a shield');
  assert.equal(unarmoredDefenseBaseAC([monk], modifiers), 16);
  assert.equal(unarmoredDefenseBaseAC([monk], { ...modifiers, shieldWielded: true }), null,
    'Monk loses the formula while wielding a shield');
  assert.equal(unarmoredDefenseBaseAC([barbarian, monk], modifiers), null,
    'when both features are eligible, the character must choose one formula');
  assert.equal(unarmoredDefenseBaseAC([barbarian, monk], { ...modifiers, selectedClass: 'barbarian' }), 15);
  assert.equal(unarmoredDefenseBaseAC([barbarian, monk], { ...modifiers, selectedClass: 'monk' }), 16);
  assert.equal(unarmoredDefenseBaseAC([barbarian, monk], { ...modifiers, shieldWielded: true }), 15,
    'with a shield, only the Barbarian formula remains eligible');
  assert.equal(unarmoredDefenseBaseAC([barbarian], { ...modifiers, bodyArmorWorn: true }), null);
  assert.equal(unarmoredDefenseBaseAC([], modifiers), null);
});

test('AC preparation applies Unarmored Defense as a base formula while preserving shields and bonuses', () => {
  const barbarian = { type: 'feature', name: 'Unarmored Defense', data: {
    classIdentifier: 'barbarian', levelGained: 1, identifier: 'unarmored-defense',
  } };
  const monk = { type: 'feature', name: 'Unarmored Defense', data: {
    classIdentifier: 'monk', levelGained: 1, identifier: 'unarmored-defense',
  } };
  const actor = () => {
    const data = getDefaultData('character');
    data.abilities.dex.modifier = 2;
    data.abilities.con.modifier = 3;
    data.abilities.wis.modifier = 4;
    data.attributes.da.base = 10;
    data.attributes.da.magic = 1;
    data.attributes.da.bonus = 2;
    return data;
  };
  const shield = { type: 'armor', system: { armorType: 'shield', acValue: 2, equipped: true } };
  const bodyArmor = { type: 'armor', system: { armorType: 'light', acValue: 12, equipped: true } };
  const barbarianData = actor();
  prepArmorAndDA(barbarianData, [barbarian, shield]);
  assert.equal(barbarianData.attributes.da.value, 20, 'Barbarian formula + shield + magic + explicit bonus');

  const monkData = actor();
  prepArmorAndDA(monkData, [monk]);
  assert.equal(monkData.attributes.da.value, 19, 'Monk uses Wisdom and does not add Dexterity twice');
  prepArmorAndDA(monkData, [monk, shield]);
  assert.equal(monkData.attributes.da.value, 17, 'Monk shield prevents Unarmored Defense and retains standard shield AC');

  const armoredData = actor();
  prepArmorAndDA(armoredData, [barbarian, bodyArmor]);
  assert.equal(armoredData.attributes.da.value, 27, 'body armor disables Unarmored Defense and uses ordinary AC');
});

test('Arcane Recovery respects Wizard level, expended slots, and the combined-level cap', () => {
  const spellSlots = { 1: { value: 0, max: 2 }, 2: { value: 0, max: 1 }, 6: { value: 0, max: 1 } };
  const valid = resolveArcaneRecovery({ wizardLevel: 5, spellSlots, selected: { 1: 1, 2: 1 } });
  assert.equal(valid.valid, true);
  assert.equal(valid.budget, 3);
  assert.equal(valid.spellSlots[1].value, 1);
  assert.equal(valid.spellSlots[2].value, 1);
  assert.equal(spellSlots[1].value, 0, 'resolution does not mutate the actor input');
  assert.equal(resolveArcaneRecovery({ wizardLevel: 5, spellSlots, selected: { 2: 2 } }).reason, 'invalid-slot-count');
  assert.equal(resolveArcaneRecovery({ wizardLevel: 5, spellSlots, selected: { 2: 1, 1: 2 } }).reason, 'budget-exceeded');
  assert.equal(resolveArcaneRecovery({ wizardLevel: 5, spellSlots, selected: {} }).reason, 'empty-choice');
  assert.equal(resolveArcaneRecovery({ wizardLevel: 5, spellSlots, selected: { 6: 1 } }).valid, false);
  assert.equal(resolveArcaneRecovery({ wizardLevel: 0, spellSlots, selected: { 1: 1 } }).valid, false);
});

test('Wizard Scholar selects one already-proficient listed skill for Expertise', () => {
  assert.deepEqual(WIZARD_SCHOLAR_SKILLS, ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion']);
  assert.deepEqual(resolveWizardScholarChoice({ arcana: { proficient: true } }, 'arcana'), {
    valid: true, skill: 'arcana', multiplier: 2,
  });
  assert.equal(resolveWizardScholarChoice({ arcana: { proficient: false } }, 'arcana').reason, 'skill-not-proficient');
  assert.equal(resolveWizardScholarChoice({ stealth: { proficient: true } }, 'stealth').reason, 'unsupported-skill');
  assert.equal(resolveWizardScholarChoice({ arcana: { proficient: true, multiplier: 2 } }, 'arcana').reason, 'expertise-already-set');
  assert.equal(resolveWizardScholarChoice({ arcana: { proficient: true, multiplier: 2 } }, 'arcana', 'arcana').valid, true);
});

test('Wizard Ritual Adept allows unprepared rituals only from that Wizard spellbook', () => {
  const bookRitual = { spellLevel: 1, sourceClassIdentifier: 'wizard', wizardSpellbook: true, ritual: true, prepared: false };
  assert.deepEqual(wizardSpellCastOptions(bookRitual, 1), {
    canCastNormally: false, canCastAsRitual: true, requiresWizardRitual: true,
  });
  assert.equal(wizardSpellCastOptions(bookRitual, 0).canCastAsRitual, false);
  assert.deepEqual(wizardSpellCastOptions({ ...bookRitual, ritual: false }, 1), {
    canCastNormally: false, canCastAsRitual: false, requiresWizardRitual: true,
  });
  assert.equal(wizardSpellCastOptions({ ...bookRitual, prepared: true }, 1).canCastNormally, true);
  assert.equal(wizardSpellCastOptions({ spellLevel: 1, ritual: true, prepared: true }, 0).canCastAsRitual, true);
});

test('Wizard Memorize Spell replaces exactly one prepared spell with a different spellbook entry at level 5+', () => {
  const book = [
    { id: 'prepared', name: 'Shield', type: 'spell', data: { spellLevel: 1, classes: ['wizard'], sourceClassIdentifier: 'wizard', wizardSpellbook: true, prepared: true } },
    { id: 'unprepared', name: 'Sleep', type: 'spell', data: { spellLevel: 1, classes: ['wizard'], sourceClassIdentifier: 'wizard', wizardSpellbook: true, prepared: false } },
  ];
  assert.deepEqual(resolveWizardMemorizeSpellChoice(5, book, 'prepared', 'unprepared'), {
    valid: true, replaceId: 'prepared', replacementId: 'unprepared',
  });
  assert.equal(resolveWizardMemorizeSpellChoice(4, book, 'prepared', 'unprepared').reason, 'feature-unavailable');
  assert.equal(resolveWizardMemorizeSpellChoice(5, book, 'unprepared', 'prepared').reason, 'prepared-spell-required');
  assert.equal(resolveWizardMemorizeSpellChoice(5, book, 'prepared', 'prepared').reason, 'unprepared-spellbook-entry-required');
  assert.equal(resolveWizardMemorizeSpellChoice(5, [...book, { ...book[1], id: 'different-id', name: 'Shield' }], 'prepared', 'different-id').reason, 'replacement-must-differ');
});

test('Wizard Spell Mastery requires two action spells from the owned spellbook and permits same-level replacement', () => {
  const spell = (id, level, overrides = {}) => ({ id, name: id, type: 'spell', data: {
    spellLevel: level, classes: ['wizard'], sourceClassIdentifier: 'wizard', wizardSpellbook: true,
    castingTime: '1 action', ...overrides,
  } });
  const book = [spell('one', 1), spell('two', 2), spell('one-alt', 1)];
  assert.deepEqual(resolveWizardSpellMasteryChoices(18, book, 'one', 'two'), { valid: true, levelOneId: 'one', levelTwoId: 'two' });
  assert.equal(resolveWizardSpellMasteryChoices(17, book, 'one', 'two').reason, 'feature-unavailable');
  assert.equal(resolveWizardSpellMasteryChoices(18, book, 'one', 'one-alt').valid, false);
  assert.equal(resolveWizardSpellMasteryChoices(18, [spell('one', 1), spell('two', 2, { castingTime: '1 bonus action' })], 'one', 'two').valid, false);
  assert.deepEqual(resolveWizardSpellMasteryReplacement(18, book, 'one', 'one-alt'), {
    valid: true, currentSpellId: 'one', replacementSpellId: 'one-alt', level: 1,
  });
  assert.equal(resolveWizardSpellMasteryReplacement(18, book, 'one', 'two').valid, false);
});

test('Wizard Signature Spells requires two distinct level-3 book spells and tracks once-per-rest use', () => {
  const book = ['a', 'b'].map((id) => ({ id, name: id, type: 'spell', data: {
    spellLevel: 3, classes: ['wizard'], sourceClassIdentifier: 'wizard', wizardSpellbook: true,
  } }));
  assert.deepEqual(resolveWizardSignatureSpellChoices(20, book, ['a', 'b']), { valid: true, spellIds: ['a', 'b'] });
  assert.equal(resolveWizardSignatureSpellChoices(19, book, ['a', 'b']).reason, 'feature-unavailable');
  assert.equal(resolveWizardSignatureSpellChoices(20, book, ['a', 'a']).valid, false);
  assert.equal(resolveWizardSignatureSpellChoices(20, book, ['a']).valid, false);
  assert.equal(canUseWizardSignatureSpell({ signatureSpellIds: ['a'], signatureSpellUses: {} }, 'a'), true);
  assert.equal(canUseWizardSignatureSpell({ signatureSpellIds: ['a'], signatureSpellUses: { a: 1 } }, 'a'), false);
  assert.equal(canUseWizardSignatureSpell({ signatureSpellIds: ['a'], signatureSpellUses: { a: 2 } }, 'a'), false);
  assert.equal(canUseWizardSignatureSpell({ signatureSpellIds: ['a'] }, 'b'), false);
  assert.deepEqual(resetWizardSignatureSpellUses({ signatureSpellIds: ['a', 'b'] }, 'short'), { a: 0, b: 0 });
  assert.deepEqual(resetWizardSignatureSpellUses({ signatureSpellIds: ['a', 'b'] }, 'long'), { a: 0, b: 0 });
  assert.equal(resetWizardSignatureSpellUses({ signatureSpellIds: ['a'] }, 'invalid'), null);
});

test('Wizard spellcasting features use exact SRD feature text and levels without spilling into the spell list', () => {
  const db = new DatabaseSync(new URL('../packs/features.sqlite', import.meta.url), { readOnly: true });
  const rows = db.prepare("SELECT name, data FROM entries WHERE type='feature' AND json_extract(data, '$.classIdentifier')='wizard' AND json_extract(data, '$.identifier') IN ('ritual-adept','scholar','memorize-spell','spell-mastery','signature-spells')").all();
  db.close();
  const features = new Map(rows.map((row) => [JSON.parse(row.data).identifier, { name: row.name, data: JSON.parse(row.data) }]));
  assert.deepEqual([...features.keys()].sort(), ['memorize-spell', 'ritual-adept', 'scholar', 'signature-spells', 'spell-mastery']);
  assert.deepEqual([...features.values()].map(({ data }) => [data.source, data.levelGained]).sort((a, b) => a[1] - b[1]), [
    ['SRD 5.2 (CC-BY-4.0)', 1], ['SRD 5.2 (CC-BY-4.0)', 2], ['SRD 5.2 (CC-BY-4.0)', 5],
    ['SRD 5.2 (CC-BY-4.0)', 18], ['SRD 5.2 (CC-BY-4.0)', 20],
  ]);
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const descriptions = extractClassFeatureDescriptions(source);
  for (const [level, identifier, key] of [[18, 'spell-mastery', 'spell mastery'], [20, 'signature-spells', 'signature spells']]) {
    assert.equal(features.get(identifier).data.description, descriptions.get(`wizard|${level}|${key}`));
    assert.doesNotMatch(features.get(identifier).data.description, /### Wizard Spell List/);
  }
});
import { npcDeathSaveView, resolveMonsterZeroHp } from '../scripts/monster-death-mechanics.mjs';
import { appendHelpRecord, createHelpRecord, helpActionView, helpProficiencyOptions, normalizeHelpRecords, removeHelpRecord } from '../scripts/help-action-mechanics.mjs';
import { composeInfluenceAdvantage, INFLUENCE_CHECK_OPTIONS, influenceFormView, resolveInfluenceAdjudication } from '../scripts/influence-mechanics.mjs';
import { applyDamageTraits, resolveDamageConsequences } from '../scripts/damage-mechanics.mjs';
import { CLASS_PROFICIENCIES, MULTICLASS_PROFICIENCIES, classProficiencyChoiceContext, multiclassProficiencyChoiceContext, weaponProficiencyMatches } from '../scripts/class-proficiencies.mjs';
import { attackRollIsCritical } from '../scripts/critical-mechanics.mjs';
import { extractClassFeatureDescriptions, formatClassFeatureTrace, traceClassFeatures } from '../.dev/review/class-feature-coverage.mjs';
import { CURRENT_CLASS_FEATURE_IDENTITIES, isCurrentClassFeatureIdentity } from '../scripts/class-feature-source-contract.mjs';
import { canCastSpellsDuringRage, canEnterRage, createRageCombatState, heavyArmorRageEndTriggered, incapacitatedRageEndTriggered, rageDamageBonusAtLevel, rageDamageBonusForAttack, rageResistanceTypes, rageStrengthAdvantage, rageUsesAtLevel, resolveRageCombatTurn, resolveRageExtension, restoredFeatureUses, syncRageUses } from '../scripts/rage-mechanics.mjs';
import { addDashMovementBonus, addMovementSegment, BARBARIAN_FAST_MOVEMENT_BONUS, evaluateMovementLedger, hasBarbarianFastMovement, normalizeMovementLedger, removeDashMovementBonus, removeMovementSegment, resetMovementLedger, speedsWithCombatEffects } from '../scripts/movement-mechanics.mjs';
import { clearHeroicInspirationReroll, getHeroicInspirationReroll, inspectHeroicInspirationReroll, registerHeroicInspirationReroll, resolveHeroicInspirationReroll } from '../scripts/inspiration-mechanics.mjs';
import { damageRollFormula } from '../scripts/damage-formula.mjs';
import { fixedHigherLevelHitDieValue, hitDieCommitPatch, hitDieHealing, multiclassEntryHitDicePatch, multiclassLevelHitPointGain } from '../scripts/hit-die-mechanics.mjs';
import { applyPrimalChampion, dangerSenseApplies, hasDangerSense, hasFeralInstinct, hasIndomitableMight, indomitableMightReplacement, resolveAdvantageSources } from '../scripts/class-feature-mechanics.mjs';
import { composeAbilityCheckConditionModifiers, composeAttackConditionModifiers, conditionsForSingleTarget } from '../scripts/advantage-mechanics.mjs';
import { circleLandAlwaysPreparedSpellNames, planSubclassSpellGrantReconciliation, planSubclassSpellGrantWrites, resolveCircleLandAlwaysPreparedSpells, resolveSubclassAlwaysPreparedSpells, subclassAlwaysPreparedSpellNames, subclassSpellGrantItemData } from '../scripts/subclass-spell-grants.mjs';

test('critical damage eligibility follows the kept natural 20 on the matching attack result', () => {
  const attack = { meta: { isAttack: true }, terms: [{ kind: 'dice', faces: 20, rolls: [20, 4], dropped: [true, false] }] };
  assert.equal(attackRollIsCritical(attack), false, 'a dropped natural 20 does not make the kept attack critical');
  attack.terms[0].dropped = [false, true];
  assert.equal(attackRollIsCritical(attack), true);
  assert.equal(attackRollIsCritical({ ...attack, meta: { isAttack: false } }), false);
  assert.equal(attackRollIsCritical({ meta: { isAttack: true }, terms: [{ kind: 'dice', faces: 20, rolls: [19] }] }), false);
});

test('Heroic Inspiration rerolls one supported die and recomputes kept results before accepting the new total', () => {
  const roll = {
    formula: '2d20kh1 + 4', total: 20, mode: 'public', meta: { actorId: 'actor-test', isAttack: true },
    terms: [{ kind: 'dice', faces: 20, rolls: [5, 16], dropped: [true, false] }, { kind: 'modifier', value: 4 }],
  };
  const droppedDieSnapshot = inspectHeroicInspirationReroll(roll, 0, 0);
  assert.ok(droppedDieSnapshot, 'a dropped die is still eligible to reroll');
  const droppedReplacement = resolveHeroicInspirationReroll(droppedDieSnapshot, {
    terms: [{ kind: 'dice', faces: 20, rolls: [20] }],
  });
  assert.equal(droppedReplacement.total, 24, 'the replacement becomes the kept advantage die');
  assert.deepEqual(droppedReplacement.terms[0].dropped, [false, true]);

  const keptDieSnapshot = inspectHeroicInspirationReroll(roll, 0, 1);
  const keptReplacement = resolveHeroicInspirationReroll(keptDieSnapshot, {
    terms: [{ kind: 'dice', faces: 20, rolls: [2] }],
  });
  assert.equal(keptReplacement.total, 9, 'the previously dropped die becomes the retained result');
  assert.deepEqual(keptReplacement.terms[0].dropped, [false, true]);
  assert.equal(inspectHeroicInspirationReroll({ ...roll, formula: '2d20kh1 + 1d4' }, 0, 0), null, 'unsupported multiple dice terms fail closed');
  assert.equal(inspectHeroicInspirationReroll({ ...roll, total: 19 }, 0, 0), null, 'an inconsistent source result fails closed');
  assert.equal(inspectHeroicInspirationReroll({ ...roll, mode: 'blindroll' }, 0, 0), null, 'private rolls do not create public companion results');
});

test('Heroic Inspiration snapshots preserve the target token and weapon mastery context needed by reroll cards', () => {
  const snapshot = inspectHeroicInspirationReroll({
    formula: '1d20 + 5', total: 15, mode: 'public',
    meta: {
      actorId: 'attacker', isAttack: true, itemId: 'weapon',
      targets: [{ castId: 'target-cast', name: 'Ogre', ac: 13 }],
      srd5eWeaponMastery: { classIdentifier: 'fighter', weaponIdentifier: 'maul', property: 'topple',
        abilityKey: 'str', abilityModifier: 2, damageType: 'bludgeoning', saveDC: 13 },
    },
    terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [false] }, { kind: 'modifier', value: 5 }],
  }, 0, 0);
  assert.equal(snapshot.meta.targets[0].castId, 'target-cast');
  assert.deepEqual(snapshot.meta.srd5eWeaponMastery, {
    classIdentifier: 'fighter', weaponIdentifier: 'maul', property: 'topple',
    abilityKey: 'str', abilityModifier: 2, damageType: 'bludgeoning', saveDC: 13,
  });
  const pushSnapshot = inspectHeroicInspirationReroll({
    formula: '1d20 + 5', total: 15, mode: 'public',
    meta: {
      actorId: 'attacker', isAttack: true, itemId: 'weapon',
      targets: [{ castId: 'push-target-cast', name: 'Ogre', ac: 13 }],
      srd5eWeaponMastery: { classIdentifier: 'fighter', weaponIdentifier: 'pike', property: 'push' },
    },
    terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [false] }, { kind: 'modifier', value: 5 }],
  }, 0, 0);
  assert.equal(pushSnapshot.meta.targets[0].castId, 'push-target-cast');
  assert.equal(pushSnapshot.meta.srd5eWeaponMastery.property, 'push');
  const sapContext = { combatId: 'combat-1', sourceCastId: 'attacker-cast', appliedTurn: { round: 2, castId: 'active-cast' } };
  const sapSnapshot = inspectHeroicInspirationReroll({
    formula: '1d20 + 5', total: 15, mode: 'public',
    meta: {
      actorId: 'attacker', isAttack: true, itemId: 'weapon', targets: [{ castId: 'target-cast', name: 'Ogre', ac: 13 }],
      srd5eWeaponMastery: { classIdentifier: 'fighter', weaponIdentifier: 'longsword', property: 'sap' },
      srd5eSapContext: sapContext, srd5eSapOperationId: 'sap-op-1',
      srd5eVexContext: sapContext, srd5eVexOperationId: 'vex-op-1',
      srd5eDamage: { type: 'slashing', critical: false, targetBound: true, targetId: 'target-cast', vexRequest: { operationId: 'vex-op-1' } },
    },
    terms: [{ kind: 'dice', faces: 20, rolls: [10], dropped: [false] }, { kind: 'modifier', value: 5 }],
  }, 0, 0);
  assert.deepEqual(sapSnapshot.meta.srd5eSapContext, sapContext);
  assert.equal(sapSnapshot.meta.srd5eSapOperationId, 'sap-op-1');
  assert.deepEqual(sapSnapshot.meta.srd5eVexContext, sapContext);
  assert.equal(sapSnapshot.meta.srd5eVexOperationId, 'vex-op-1');
  assert.deepEqual(sapSnapshot.meta.srd5eDamage.vexRequest, { operationId: 'vex-op-1' });
});

test('Heroic Inspiration reroll coordination locks one actor per browser and clears only matching pending requests', () => {
  const snapshot = inspectHeroicInspirationReroll({
    formula: '1d8 + 3', total: 7, mode: 'public', meta: { actorId: 'inspiration-lock-test' },
    terms: [{ kind: 'dice', faces: 8, rolls: [4], dropped: [false] }, { kind: 'modifier', value: 3 }],
  }, 0, 0);
  assert.equal(registerHeroicInspirationReroll('request-a', snapshot), true);
  assert.equal(registerHeroicInspirationReroll('request-b', snapshot), false);
  assert.equal(getHeroicInspirationReroll('request-a'), snapshot);
  assert.equal(clearHeroicInspirationReroll('request-a'), true);
  assert.equal(getHeroicInspirationReroll('request-a'), null);
  assert.equal(registerHeroicInspirationReroll('request-b', snapshot), true);
  clearHeroicInspirationReroll('request-b');
});

test('server damage formulas preserve ordinary and configured critical damage without locally rolling dice', () => {
  assert.equal(damageRollFormula('1d8 + 3'), '1d8 + 3');
  assert.equal(damageRollFormula('1d8 + 3', true, 'doubleDice'), '2d8 + 3');
  assert.equal(damageRollFormula('2d6 + 1d8 - 2', true, 'doubleDice'), '4d6 + 2d8 - 2');
  assert.equal(damageRollFormula('2d6 + 1d8 - 2', true), '4d6 + 2d8 - 2');
  assert.equal(damageRollFormula('2d6 + 3', true), '4d6 + 3');
  assert.equal(damageRollFormula('-1d4 + 2', true, 'doubleDice'), '-2d4 + 2');
  assert.throws(() => damageRollFormula('1d6 * 2', true), TypeError, 'unsupported expressions fail closed');
});

test('Hit Die choices commit healing, one die and optional Heroic Inspiration together', () => {
  const actor = { resources: {
    hitDice: { value: 3, pools: { fighter: { die: 'd10', value: 2 }, wizard: { die: 'd6', value: 1 } } },
    health: { value: 8, max: 12 }, inspiration: true,
  } };
  const patch = hitDieCommitPatch(actor, 7, { poolId: 'fighter', spendInspiration: true });
  assert.equal(patch['system.resources.health.value'], 12, 'healing is capped at maximum HP');
  assert.equal(patch['system.resources.hitDice.value'], 2);
  assert.equal(patch['system.resources.hitDice.pools'].fighter.value, 1);
  assert.equal(patch['system.resources.hitDice.pools'].wizard.value, 1, 'the other class pool is preserved');
  assert.equal(patch['system.resources.inspiration'], false);
  assert.equal(hitDieHealing(-3), 1); // SRD 5.2: each spent Hit Point Die regains at least 1 Hit Point
  assert.throws(() => hitDieCommitPatch({ resources: { hitDice: { value: 1, pools: { fighter: { value: 1 } } }, health: {} } }, 4), /selected/);
  assert.throws(() => hitDieCommitPatch({ resources: { hitDice: { value: 0 }, health: {} } }, 4), /No Hit Dice/);
});

test('multiclass entry uses higher-level HP rules and creates one fresh class Hit Die pool', () => {
  for (const [die, fixed] of [['d6', 4], ['d8', 5], ['d10', 6], ['d12', 7]]) {
    assert.equal(fixedHigherLevelHitDieValue(die), fixed);
    assert.equal(multiclassLevelHitPointGain(die, 2), fixed + 2);
    assert.equal(multiclassLevelHitPointGain(die, -20), 1, 'each new level grants at least 1 HP');
  }
  assert.equal(multiclassLevelHitPointGain('d10', 2, { roll: 3 }), 5);
  assert.throws(() => multiclassLevelHitPointGain('d8', 0, { roll: 9 }), RangeError);
  const patch = multiclassEntryHitDicePatch({ value: 2, max: 4, pools: {
    fighter: { value: 1, max: 3, die: 'd10', needsReview: false },
  } }, 'wizard', 'd6');
  assert.equal(patch.value, 3);
  assert.equal(patch.max, 5);
  assert.deepEqual(patch.pools, {
    fighter: { value: 1, max: 3, die: 'd10', needsReview: false },
    wizard: { value: 1, max: 1, die: 'd6', needsReview: false },
  });
  assert.throws(() => multiclassEntryHitDicePatch({ value: 1, max: 1, pools: { wizard: { value: 1, max: 1 } } }, 'wizard', 'd6'), /already exists/);
  assert.throws(() => multiclassEntryHitDicePatch({ value: 1, max: 1, needsReview: true }, 'wizard', 'd6'), /review/);
  assert.throws(() => multiclassEntryHitDicePatch({ value: 2, max: 1 }, 'wizard', 'd6'), /invalid/);
});

test('condition-derived d20 modifiers fail closed when fear or target context is incomplete', () => {
  assert.equal(composeAbilityCheckConditionModifiers(0, ['frightened']), 0, 'Frightened needs the fear source in line of sight');
  assert.equal(composeAbilityCheckConditionModifiers(0, ['poisoned']), -1);
  assert.equal(composeAbilityCheckConditionModifiers(0, [], false, true), 1, 'feature advantage joins other d20 sources');
  assert.equal(composeAbilityCheckConditionModifiers(-1, [], false, true), 0, 'Rage cancels an explicit disadvantage');
  assert.equal(composeAttackConditionModifiers(0, ['invisible']), 0, 'an opponent may be able to see the invisible attacker');
  assert.equal(composeAttackConditionModifiers(0, ['frightened']), 0, 'Frightened needs source/line-of-sight context');
  assert.equal(composeAttackConditionModifiers(0, [], true, false, ['prone']), 0, 'Prone needs target distance, not just ranged/melee category');
  assert.equal(composeAttackConditionModifiers(0, [], false, false, ['invisible']), 0, 'Invisible needs per-opponent visibility');
  assert.equal(composeAttackConditionModifiers(0, [], false, false, ['restrained']), 1);
  assert.equal(composeAttackConditionModifiers(0, [], false, false, ['blinded']), 1);
  assert.equal(composeAttackConditionModifiers(0, [], false, false, [], 1), -1, 'Sap adds disadvantage before source cancellation');
  assert.equal(composeAttackConditionModifiers(1, [], false, false, [], 2), 0, 'advantage cancels any number of disadvantage sources');
  assert.equal(composeAttackConditionModifiers(-1, [], false, false, ['blinded']), 0, 'advantage and disadvantage cancel');
  assert.equal(composeAttackConditionModifiers(0, [], false, false, [], 0, 1), 1, 'Vex contributes advantage');
  assert.equal(composeAttackConditionModifiers(0, [], false, false, [], 1, 1), 0, 'Vex advantage cancels Sap disadvantage');
});

test('target conditions are only attributed to a shared attack roll for exactly one target', () => {
  const restrained = { id: 'one', statusMarkers: ['restrained'] };
  assert.deepEqual(conditionsForSingleTarget([restrained]), ['restrained']);
  assert.deepEqual(conditionsForSingleTarget([]), []);
  assert.deepEqual(conditionsForSingleTarget([restrained, { id: 'two', statusMarkers: ['blinded'] }]), []);
});

test('Barbarian Danger Sense grants Dexterity-save advantage except while Incapacitated and cancels disadvantage', () => {
  const items = [
    { type: 'feature', name: 'Danger Sense', system: { classIdentifier: 'barbarian', levelGained: 2, identifier: 'danger-sense' } },
    { type: 'feature', name: 'Danger Sense', system: { classIdentifier: 'barbarian', levelGained: 2, identifier: 'danger-sense' } },
  ];
  assert.equal(hasDangerSense(items), true);
  assert.equal(hasDangerSense([{ ...items[0], system: { ...items[0].system, classIdentifier: 'fighter' } }]), false);
  assert.equal(dangerSenseApplies('dex', [], true), true);
  assert.equal(dangerSenseApplies('str', [], true), false);
  assert.equal(dangerSenseApplies('dex', ['incapacitated'], true), false);
  assert.equal(resolveAdvantageSources(1, 0), 1);
  assert.equal(resolveAdvantageSources(1, 1), 0, 'Danger Sense cancels restraint or armor disadvantage');
  assert.equal(resolveAdvantageSources(1, 2), 0, 'multiple disadvantage sources still cancel advantage');
});

test('Barbarian Feral Instinct is gated by its granted level-7 feature identity', () => {
  assert.equal(hasFeralInstinct([{ type: 'feature', name: 'Feral Instinct', system: { classIdentifier: 'barbarian', levelGained: 7, identifier: 'feral-instinct' } }]), true);
  assert.equal(hasFeralInstinct([{ type: 'feature', name: 'Feral Instinct', system: { classIdentifier: 'barbarian', levelGained: 6, identifier: 'feral-instinct' } }]), false);
  assert.equal(hasFeralInstinct([{ type: 'feature', name: 'Feral Instinct', system: { classIdentifier: 'ranger', levelGained: 7, identifier: 'feral-instinct' } }]), false);
  assert.equal(resolveAdvantageSources(1, 0), 1);
  assert.equal(resolveAdvantageSources(1, 1), 0);
});

test('Barbarian Indomitable Might offers Strength-score replacement only for lower Strength totals', () => {
  const feature = [{ type: 'feature', name: 'Indomitable Might', system: { classIdentifier: 'barbarian', levelGained: 18, identifier: 'indomitable-might' } }];
  assert.equal(hasIndomitableMight(feature), true);
  assert.equal(hasIndomitableMight([{ ...feature[0], system: { ...feature[0].system, levelGained: 17 } }]), false);
  assert.equal(indomitableMightReplacement('str', 13, 18, true), 18);
  assert.equal(indomitableMightReplacement('str', 18, 18, true), null);
  assert.equal(indomitableMightReplacement('dex', 3, 18, true), null);
  assert.equal(indomitableMightReplacement('str', 3, 18, false), null);
});

test('Barbarian Primal Champion adds four Strength and Constitution at class level 20 up to 25', () => {
  assert.deepEqual(applyPrimalChampion({ str: 18, con: 20, dex: 12 }, 'barbarian', 20), { str: 22, con: 24, dex: 12 });
  assert.deepEqual(applyPrimalChampion({ str: 23, con: 25 }, 'barbarian', 20), { str: 25, con: 25 });
  assert.deepEqual(applyPrimalChampion({ str: 18, con: 20 }, 'barbarian', 19), { str: 18, con: 20 });
  assert.deepEqual(applyPrimalChampion({ str: 18, con: 20 }, 'fighter', 20), { str: 18, con: 20 });
});

test('Barbarian Rage uses follow the SRD table and recover one use on a short rest', () => {
  assert.deepEqual([1, 2, 3, 6, 12, 17, 20].map(rageUsesAtLevel), [2, 2, 3, 4, 5, 6, 6]);
  assert.deepEqual(syncRageUses({ value: 2, max: 2 }, 5), { value: 3, max: 3, recovery: 'lr', shortRestRestore: 1 });
  assert.deepEqual(syncRageUses({ value: 1, max: 2 }, 5), { value: 1, max: 3, recovery: 'lr', shortRestRestore: 1 });
  assert.equal(restoredFeatureUses({ value: 0, max: 3, recovery: 'lr', shortRestRestore: 1 }, 'short'), 1);
  assert.equal(restoredFeatureUses({ value: 2, max: 3, recovery: 'lr', shortRestRestore: 1 }, 'short'), 3);
  assert.equal(restoredFeatureUses({ value: 1, max: 3, recovery: 'lr', shortRestRestore: 1 }, 'long'), 3);
  assert.equal(restoredFeatureUses({ value: 1, max: 3, recovery: 'sr' }, 'long'), 3);
  assert.equal(restoredFeatureUses({ value: 1, max: 3, recovery: 'sr' }, 'short'), 3);
  assert.equal(restoredFeatureUses({ value: 1, max: 3, recovery: 'lr', shortRestRestore: 1 }, 'other'), 1);
  const rage = { type: 'feature', system: { identifier: 'rage', classIdentifier: 'barbarian', rageActive: true } };
  assert.deepEqual(rageResistanceTypes([rage]), ['bludgeoning', 'piercing', 'slashing']);
  assert.deepEqual(rageResistanceTypes([{ ...rage, system: { ...rage.system, rageActive: false } }]), []);
  assert.equal(canCastSpellsDuringRage([rage]), false);
  assert.equal(canCastSpellsDuringRage([{ ...rage, system: { ...rage.system, rageActive: false } }]), true);
  assert.equal(canCastSpellsDuringRage([{ type: 'feature', system: { identifier: 'rage', classIdentifier: 'barbarian' } }]), true);
  assert.equal(rageStrengthAdvantage([rage], 'str'), true);
  assert.equal(rageStrengthAdvantage([rage], 'dex'), false);
  assert.equal(rageStrengthAdvantage([{ ...rage, system: { ...rage.system, rageActive: false } }], 'str'), false);
  assert.equal(canEnterRage([{ type: 'armor', system: { armorType: 'heavy', equipped: true } }]), false);
  assert.equal(canEnterRage([{ type: 'armor', system: { armorType: 'heavy', equipped: false } }]), true);
  assert.equal(heavyArmorRageEndTriggered({ type: 'armor', system: { armorType: 'heavy', equipped: true } }), true);
  assert.equal(heavyArmorRageEndTriggered({ type: 'armor', system: { armorType: 'heavy', equipped: false } }), false);
  assert.equal(heavyArmorRageEndTriggered({ type: 'armor', system: { armorType: 'light', equipped: true } }), false);
  assert.equal(incapacitatedRageEndTriggered({ statusMarkers: ['stunned'] }), true);
  assert.equal(incapacitatedRageEndTriggered({ statusMarkers: ['stunned'] }, true), false);
  assert.equal(incapacitatedRageEndTriggered({ data: { statusMarkers: ['unconscious'] } }), true);
  assert.equal(incapacitatedRageEndTriggered({ statusMarkers: ['unconscious'] }, true), true);
  assert.equal(incapacitatedRageEndTriggered({ statusMarkers: ['prone'] }), false);
  assert.deepEqual([1, 8, 9, 15, 16, 20].map(rageDamageBonusAtLevel), [2, 2, 3, 3, 4, 4]);
  const ragingItems = [rage, { type: 'class', system: { classIdentifier: 'barbarian', levels: 9 } }];
  assert.equal(rageDamageBonusForAttack(ragingItems, 'str', true, 1), 3);
  assert.equal(rageDamageBonusForAttack(ragingItems, 'dex', true, 1), 0);
  assert.equal(rageDamageBonusForAttack(ragingItems, 'str', false, 1), 0);
  assert.equal(rageDamageBonusForAttack(ragingItems, 'str', true, 2), 0);
  assert.equal(rageDamageBonusForAttack([{ ...rage, system: { ...rage.system, rageActive: false } }, ragingItems[1]], 'str', true, 1), 0);
});

test('Rage combat duration lasts through the next own turn and needs a qualifying extension each round', () => {
  const started = createRageCombatState({ id: 'combat-1', round: 1 }, 'barbarian-token');
  assert.deepEqual(started, {
    combatId: 'combat-1', combatantId: 'barbarian-token', activatedRound: 1,
    nextTurnSeen: false, nextTurnRound: 0, extensionCount: 0, persistent: false,
  });
  const afterOwnStartTurn = resolveRageCombatTurn(started, {
    id: 'combat-1', round: 1, currentTurn: 1, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  });
  assert.equal(afterOwnStartTurn.action, 'ignore');
  const nextOwnTurn = resolveRageCombatTurn(started, {
    id: 'combat-1', round: 2, currentTurn: 0, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  });
  assert.equal(nextOwnTurn.action, 'update');
  assert.equal(nextOwnTurn.state.nextTurnSeen, true);
  const extension = resolveRageExtension(nextOwnTurn.state, {
    id: 'combat-1', round: 2, currentTurn: 0, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  });
  assert.equal(extension.valid, true);
  assert.equal(extension.state.extensionCount, 1);
  assert.equal(extension.state.nextTurnSeen, false);
  assert.equal(resolveRageCombatTurn(extension.state, {
    id: 'combat-1', round: 2, currentTurn: 1, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  }).action, 'ignore', 'the extension keeps Rage through the following cycle');
  const extendedNextTurn = resolveRageCombatTurn(extension.state, {
    id: 'combat-1', round: 3, currentTurn: 0, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  });
  assert.equal(extendedNextTurn.action, 'update');
  assert.equal(extendedNextTurn.state.nextTurnSeen, true);
  assert.equal(resolveRageCombatTurn(extendedNextTurn.state, {
    id: 'combat-1', round: 3, currentTurn: 1, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  }).reason, 'next-turn-ended');
  const nextOwnTurnEnd = resolveRageCombatTurn(nextOwnTurn.state, {
    id: 'combat-1', round: 2, currentTurn: 1, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  });
  assert.deepEqual(nextOwnTurnEnd, { action: 'end', state: null, reason: 'next-turn-ended' });
  assert.equal(resolveRageExtension(started, { id: 'combat-1', round: 1, currentTurn: 0, combatants: [{ id: 'barbarian-token' }] }).valid, false);
});

test('Persistent Rage skips per-turn extensions and expires at the ten-minute round limit', () => {
  const state = createRageCombatState({ id: 'combat-1', round: 3 }, 'barbarian-token', true);
  assert.equal(resolveRageCombatTurn(state, {
    id: 'combat-1', round: 4, currentTurn: 0, combatants: [{ id: 'barbarian-token' }, { id: 'enemy-token' }],
  }).action, 'ignore');
  assert.equal(resolveRageExtension({ ...state, nextTurnSeen: true }, {
    id: 'combat-1', round: 4, currentTurn: 0, combatants: [{ id: 'barbarian-token' }],
  }).valid, false);
  const expiry = resolveRageCombatTurn(state, {
    id: 'combat-1', round: 103, currentTurn: 0, combatants: [{ id: 'barbarian-token' }],
  });
  assert.deepEqual(expiry, { action: 'end', state: null, reason: 'ten-minute-limit' });
  assert.equal(resolveRageCombatTurn(state, { id: 'other-combat', round: 103, currentTurn: 0, combatants: [{ id: 'barbarian-token' }] }).action, 'ignore');
});

test('Rage pack metadata follows the local SRD 5.2 source and marks unimplemented effects manual', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const expectedDescription = extractClassFeatureDescriptions(source).get('barbarian|1|rage');
  const db = new DatabaseSync(new URL('../packs/features.sqlite', import.meta.url), { readOnly: true });
  const rows = db.prepare("SELECT name, data FROM entries WHERE type = 'feature'").all()
    .map((row) => ({ name: row.name, data: JSON.parse(row.data) }))
    .filter((row) => row.data.identifier === 'rage');
  db.close();
  assert.equal(rows.length, 1);
  const [rage] = rows;
  assert.equal(rage.name, 'Rage');
  assert.equal(rage.data.source, 'SRD 5.2 (CC-BY-4.0)');
  assert.equal(rage.data.description, expectedDescription);
  assert.deepEqual(rage.data.uses, { max: 2, value: 2, recovery: 'lr', shortRestRestore: 1 });
  assert.deepEqual(rage.data.mechanicsSupport, {
    status: 'partial',
    automated: [
      'use-count', 'short-rest-restoration', 'long-rest-restoration', 'resistance', 'rage-damage-bonus',
      'spell-blocking', 'strength-check-advantage', 'strength-save-advantage', 'end-concentration-on-entry',
      'end-on-heavy-armor', 'end-on-incapacitated', 'combat-next-turn-duration', 'combat-turn-extension',
      'persistent-rage-ten-minute-duration',
    ],
    manualNoticeKey: 'SDR5E.ClassFeatures.RageManualEffects',
  });
});

test('resistance and vulnerability cancel while immunity takes precedence', () => {
  // SRD 5.2 Order of Application: halve (round down) for Resistance, then double for Vulnerability.
  assert.deepEqual(applyDamageTraits(5, { dr: ['slashing'] }, 'slashing'), { amount: 2, label: 'Resistant' });
  assert.deepEqual(applyDamageTraits(5, { dr: ['slashing'], dv: ['slashing'] }, 'slashing'), { amount: 4, label: 'Resistant and Vulnerable' });
  assert.deepEqual(applyDamageTraits(28, { dr: ['all'], dv: ['fire'] }, 'fire'), { amount: 28, label: 'Resistant and Vulnerable' });
  assert.deepEqual(applyDamageTraits(7, { dr: ['all'] }, 'fire'), { amount: 3, label: 'Resistant' });
  assert.deepEqual(applyDamageTraits(9, { di: ['slashing'], dr: ['slashing'] }, 'slashing'), { amount: 0, label: 'Immune' });
});

test('class proficiency contracts cover all twelve SRD classes and reject duplicate granted skills', () => {
  assert.deepEqual(Object.keys(CLASS_PROFICIENCIES).sort(), [
    'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
  ]);
  for (const [classId, contract] of Object.entries(CLASS_PROFICIENCIES)) {
    assert.equal(contract.saves.length, 2, `${classId} saves`);
    assert.ok(contract.skills.length >= contract.skillCount, `${classId} skill option count`);
    assert.equal(classProficiencyChoiceContext(classId, {}).valid, contract.skillCount === 0 && contract.toolChoiceCount === 0);
  }
  const bard = classProficiencyChoiceContext('bard', { skills: ['performance', 'performance', 'history'], tools: ['lute', 'drum', 'flute'] });
  assert.equal(bard.valid, false, 'duplicate skill picks are rejected');
  const validBard = classProficiencyChoiceContext('bard', { skills: ['performance', 'history', 'insight'], tools: ['lute', 'drum', 'flute'] });
  assert.equal(validBard.valid, true);
  assert.deepEqual(validBard.tools, ['Musical Instrument: Lute', 'Musical Instrument: Drum', 'Musical Instrument: Flute']);
  assert.equal(classProficiencyChoiceContext('monk', { skills: ['acrobatics', 'stealth'], tools: ['instrument:lute'] }).valid, true);
  assert.equal(classProficiencyChoiceContext('rogue', { skills: ['stealth', 'perception', 'insight', 'deception'] }, ['stealth']).valid, false);
});

test('all class proficiency counts and selectable skills are backed by local SRD Core Class Traits', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const classNames = Object.fromEntries(Object.keys(CLASS_PROFICIENCIES).map((id) => [id, id[0].toUpperCase() + id.slice(1)]));
  const abilityNames = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  for (const [classId, contract] of Object.entries(CLASS_PROFICIENCIES)) {
    const section = source.match(new RegExp(`## ${classNames[classId]}\\s+([\\s\\S]*?)(?=\\n## |$)`))?.[1] || '';
    const readRow = (label) => section.match(new RegExp(`<td>${label}</td>\\s*<td>([^<]+)</td>`))?.[1] || '';
    assert.equal(readRow('Saving Throw Proficiencies'), contract.saves.map((key) => abilityNames[key]).join(' and '), classId);
    const skillsText = readRow('Skill Proficiencies');
    assert.match(skillsText, new RegExp(`choose (any )?${contract.skillCount}`, 'i'), `${classId} choice count`);
    if (classId !== 'bard') {
      const sourceSkills = skillsText.replace(/^Choose \d+: /i, '').replace(/, or /g, ', ').split(', ').map((label) => label.replace(/,$/, ''));
      const contractSkills = contract.skills.map((key) => SKILL_LABELS[key]);
      assert.deepEqual([...contractSkills].sort(), [...sourceSkills].sort(), `${classId} skill options`);
    } else assert.equal(contract.skills.length, Object.keys(SKILL_LABELS).length, 'Bard may choose any skill');
  }
});

test('multiclass-entry proficiency contracts match the SRD grants for all twelve classes', () => {
  const expected = {
    barbarian: { skillCount: 0, weapons: ['martialM', 'martialR'], armor: ['shield'], tools: [] },
    bard: { skillCount: 1, weapons: [], armor: ['light'], tools: [] },
    cleric: { skillCount: 0, weapons: [], armor: ['light', 'medium', 'shield'], tools: [] },
    druid: { skillCount: 0, weapons: [], armor: ['light', 'shield'], tools: [] },
    fighter: { skillCount: 0, weapons: ['martialM', 'martialR'], armor: ['light', 'medium', 'shield'], tools: [] },
    monk: { skillCount: 0, weapons: [], armor: [], tools: [] },
    paladin: { skillCount: 0, weapons: ['martialM', 'martialR'], armor: ['light', 'medium', 'shield'], tools: [] },
    ranger: { skillCount: 1, weapons: ['martialM', 'martialR'], armor: ['light', 'medium', 'shield'], tools: [] },
    rogue: { skillCount: 1, weapons: [], armor: ['light'], tools: ["Thieves' Tools"] },
    sorcerer: { skillCount: 0, weapons: [], armor: [], tools: [] },
    warlock: { skillCount: 0, weapons: [], armor: ['light'], tools: [] },
    wizard: { skillCount: 0, weapons: [], armor: [], tools: [] },
  };
  assert.deepEqual(Object.keys(MULTICLASS_PROFICIENCIES).sort(), Object.keys(CLASS_PROFICIENCIES).sort());
  for (const [classId, grants] of Object.entries(expected)) {
    assert.deepEqual({
      skillCount: MULTICLASS_PROFICIENCIES[classId].skillCount,
      weapons: MULTICLASS_PROFICIENCIES[classId].weapons,
      armor: MULTICLASS_PROFICIENCIES[classId].armor,
      tools: MULTICLASS_PROFICIENCIES[classId].tools,
    }, grants, `${classId} multiclass entry grants`);
  }
  const bardOptions = multiclassProficiencyChoiceContext('bard');
  assert.equal(bardOptions.valid, false);
  assert.equal(bardOptions.missing, true);
  assert.equal(bardOptions.skillOptions.includes('performance'), true);
  assert.ok(bardOptions.toolOptions.some(({ value }) => value === 'lute'));
  const bard = multiclassProficiencyChoiceContext('bard', { skills: ['performance'], tools: ['lute'] });
  assert.equal(bard.valid, true);
  assert.deepEqual(bard.tools, ['Musical Instrument: Lute']);
  const ranger = multiclassProficiencyChoiceContext('ranger', { skills: ['survival'] });
  assert.equal(ranger.valid, true);
  assert.deepEqual(ranger.weapons, ['martialM', 'martialR']);
  const rogue = multiclassProficiencyChoiceContext('rogue', { skills: ['stealth'] });
  assert.equal(rogue.valid, true);
  assert.deepEqual(rogue.tools, ["Thieves' Tools"]);
  assert.equal(multiclassProficiencyChoiceContext('rogue', { skills: ['stealth'] }, { alreadyProficientSkills: ['stealth'] }).valid, false);
  assert.equal(multiclassProficiencyChoiceContext('unknown').valid, false);
});

test('all twelve class feature tables are exhaustively traced to same-class same-level feature rows or explicit gaps', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const db = new DatabaseSync(new URL('../packs/features.sqlite', import.meta.url), { readOnly: true });
  const entries = db.prepare("SELECT name, data FROM entries WHERE type = 'feature'").all()
    .map((row) => ({ name: row.name, data: JSON.parse(row.data) }));
  db.close();
  const rows = traceClassFeatures(source, entries);
  assert.ok(rows.length >= 200, `expected a full feature-table trace, got ${rows.length}`);
  assert.equal(new Set(rows.map((row) => row.classIdentifier)).size, 12);
  assert.ok(rows.every((row) => ['pack-match', 'progression-choice', 'subclass-defined', 'pack-gap', 'pack-unmatched'].includes(row.status)));
  assert.ok(rows.filter((row) => row.status === 'pack-match').every((row) => row.matches.every((entry) => entry.level === row.level && entry.data.classIdentifier === row.classIdentifier)));
  assert.ok(rows.filter((row) => row.status === 'pack-match').every((row) => row.matches.every((entry) => !String(entry.data.source || '').startsWith('SRD 5.1'))),
    'direct class/level/name matches do not retain stale SRD 5.1 source gates');
  // SRD 5.2 "#### Level 9: Brutal Strike" is present in the reconciled feature pack, so the same-class/level row is a match, not a gap.
  assert.ok(rows.some((row) => row.classIdentifier === 'barbarian' && row.level === 9 && row.name === 'Brutal Strike' && row.status === 'pack-match'));
  // SRD 5.2 Barbarian Features table has no "Brutal Critical" (5.1 level-9 feature replaced by Brutal Strike), and the pack has no such row.
  assert.ok(!rows.some((row) => row.name === 'Brutal Critical'));
  const report = formatClassFeatureTrace(rows);
  assert.ok(report.includes('não prova que o efeito foi automatizado'));
  assert.ok(report.includes('pack-gap'));
  const tracedIdentities = [...new Set(rows.filter((row) => row.status === 'pack-match').map((row) => `${row.classIdentifier}|${row.level}|${row.normalizedName}`))].sort();
  assert.deepEqual([...CURRENT_CLASS_FEATURE_IDENTITIES].sort(), tracedIdentities, 'generated runtime gate stays synchronized with source and pack trace');
  // SRD 5.2 "#### Level 9: Brutal Strike" is a current feature; the 5.1 "Brutal Critical" is not.
  assert.equal(isCurrentClassFeatureIdentity('barbarian', 9, 'Brutal Strike'), true);
  assert.equal(isCurrentClassFeatureIdentity('barbarian', 9, 'Brutal Critical'), false);
});

test('new multiclass level-one feature grants are class/level bounded and safe to retry', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const db = new DatabaseSync(new URL('../packs/features.sqlite', import.meta.url), { readOnly: true });
  const entries = db.prepare("SELECT name, data FROM entries WHERE type = 'feature'").all()
    .map((row) => ({ name: row.name, data: JSON.parse(row.data) }));
  db.close();
  const tracedLevelOne = traceClassFeatures(source, entries).filter((row) => row.level === 1 && row.status === 'pack-match');
  for (const classIdentifier of Object.keys(CLASS_PROFICIENCIES)) {
    const planned = selectClassFeaturesToGrant(entries, classIdentifier, 0, 1, []);
    assert.ok(planned.candidates.every((entry) => Number(entry.data.levelGained) === 1), `${classIdentifier} only gains level-1 features`);
    assert.ok(planned.selected.every((entry) => entry.data.classIdentifier === classIdentifier), `${classIdentifier} cannot inherit another class's grant`);
    const expectedIdentities = tracedLevelOne.filter((row) => row.classIdentifier === classIdentifier)
      .flatMap((row) => row.matches
        .filter((entry) => !String(entry.data.source || '').startsWith('SRD') || String(entry.data.source).startsWith('SRD 5.2'))
        .map((entry) => `${entry.data.identifier}|${entry.name}`)).sort();
    const selectedIdentities = planned.selected.map((entry) => `${entry.data.identifier}|${entry.name}`).sort();
    assert.deepEqual(selectedIdentities, expectedIdentities, `${classIdentifier} level-1 pack rows match the SRD trace`);
    const retry = selectClassFeaturesToGrant(entries, classIdentifier, 0, 1, planned.selected.map((entry) => ({
      name: entry.name, data: entry.data,
    })));
    assert.equal(retry.selected.length, 0, `${classIdentifier} level-1 grants are not duplicated on retry`);
  }
  const barbarianDefense = entries.find((entry) => entry.name === 'Unarmored Defense' && entry.data.classIdentifier === 'barbarian');
  assert.equal(barbarianDefense.data.source, 'SRD 5.2 (CC-BY-4.0)');
  assert.equal(barbarianDefense.data.description,
    "While you aren't wearing any armor, your base Armor Class equals 10 plus your Dexterity and Constitution modifiers. You can use a Shield and still gain this benefit.");
  const barbarianPlan = selectClassFeaturesToGrant(entries, 'barbarian', 0, 1, []);
  assert.equal(barbarianPlan.selected.some((entry) => entry.name === 'Unarmored Defense'), true,
    'source-corrected Barbarian feature is now eligible for the automatic level-1 grant');
  const descriptions = extractClassFeatureDescriptions(source);
  const sourceCorrectedLevelOne = new Set([
    'bard|bardic-inspiration', 'bard|spellcasting', 'cleric|cleric-spellcasting',
    'druid|druidic', 'druid|druid-spellcasting', 'monk|martial-arts', 'monk|unarmored-defense',
    'paladin|lay-on-hands', 'ranger|favored-enemy', 'rogue|expertise', 'rogue|sneak-attack',
    'rogue|thieves-cant', 'sorcerer|spellcasting', 'warlock|pact-magic',
    'wizard|arcane-recovery', 'wizard|spellcasting',
  ]);
  const sourceCorrectedSeen = new Set();
  for (const row of tracedLevelOne) {
    const key = `${row.classIdentifier}|1|${row.normalizedName}`;
    for (const entry of row.matches) {
      assert.ok(!String(entry.data.source || '').startsWith('SRD 5.1'), `${row.classIdentifier}/${entry.name} is not gated out as an old edition`);
      const correctedKey = `${row.classIdentifier}|${entry.data.identifier}`;
      if (sourceCorrectedLevelOne.has(correctedKey)) {
        sourceCorrectedSeen.add(correctedKey);
        assert.equal(entry.data.source, 'SRD 5.2 (CC-BY-4.0)', `${correctedKey} explicitly carries its current edition source`);
        assert.equal(entry.data.description, descriptions.get(key), `${correctedKey} uses its corresponding local SRD 5.2 description`);
      }
    }
  }
  assert.deepEqual([...sourceCorrectedSeen].sort(), [...sourceCorrectedLevelOne].sort(), 'all directly matched level-one legacy feature rows are source-corrected');
});

test('restricted Monk and Rogue martial weapon proficiencies match weapon properties', () => {
  assert.equal(weaponProficiencyMatches('martial:light', { weaponType: 'martialM', properties: ['Light'] }), true);
  assert.equal(weaponProficiencyMatches('martial:light', { weaponType: 'martialM', properties: ['Finesse'] }), false);
  assert.equal(weaponProficiencyMatches('martial:finesse-or-light', { weaponType: 'martialR', properties: ['Finesse'] }), true);
  assert.equal(weaponProficiencyMatches('martial:finesse-or-light', { weaponType: 'martialM', properties: ['Heavy'] }), false);
  assert.equal(weaponProficiencyMatches('simpleM', { weaponType: 'simpleM' }), true);
});

test('damage consequences share SRD massive-damage and at-zero death rules', () => {
  const massive = resolveDamageConsequences({ health: { value: 6, max: 12, temp: 0 }, finalDamage: 18 });
  assert.equal(massive.hpAfter, 0);
  assert.equal(massive.deathState, 'dead', 'overflow equal to max HP is instant death');

  const belowThreshold = resolveDamageConsequences({ health: { value: 6, max: 12, temp: 0 }, finalDamage: 17 });
  assert.equal(belowThreshold.hpAfter, 0);
  assert.equal(belowThreshold.deathState, 'alive', 'overflow below max HP is not instant death');

  const stableHit = resolveDamageConsequences({
    health: { value: 0, max: 12, temp: 0 }, finalDamage: 1, deathState: 'stable', deathSaves: { successes: 3, failures: 0 },
  });
  assert.equal(stableHit.deathState, 'alive');
  assert.deepEqual(stableHit.deathSaves, { successes: 0, failures: 1 });

  const thirdFailure = resolveDamageConsequences({
    health: { value: 0, max: 12, temp: 0 }, finalDamage: 1, deathState: 'alive', deathSaves: { successes: 1, failures: 2 },
  });
  assert.equal(thirdFailure.deathState, 'dead');
  assert.equal(thirdFailure.deathSaves.failures, 3);

  const criticalDamageAtZero = resolveDamageConsequences({
    health: { value: 0, max: 12, temp: 0 }, finalDamage: 2, deathState: 'alive', deathSaves: { successes: 0, failures: 0 }, critical: true,
  });
  assert.equal(criticalDamageAtZero.deathState, 'alive');
  assert.equal(criticalDamageAtZero.deathSaves.failures, 2, 'critical damage at 0 HP causes two death-save failures');

  const criticalThirdFailure = resolveDamageConsequences({
    health: { value: 0, max: 12, temp: 0 }, finalDamage: 1, deathState: 'alive', deathSaves: { successes: 0, failures: 1 }, critical: true,
  });
  assert.equal(criticalThirdFailure.deathState, 'dead');
  assert.equal(criticalThirdFailure.deathSaves.failures, 3, 'critical failures cap at three and cause death');

  const ordinaryDamageAtZero = resolveDamageConsequences({
    health: { value: 0, max: 12, temp: 0 }, finalDamage: 1, deathState: 'alive', deathSaves: { successes: 0, failures: 0 },
  });
  assert.equal(ordinaryDamageAtZero.deathSaves.failures, 1, 'ordinary damage still causes one failure');

  const damageAtZero = resolveDamageConsequences({
    health: { value: 0, max: 12, temp: 0 }, finalDamage: 12, deathState: 'stable', deathSaves: { successes: 3, failures: 0 },
  });
  assert.equal(damageAtZero.deathState, 'dead', 'damage equal to max HP while at zero kills');

  const immune = resolveDamageConsequences({ health: { value: 0, max: 12, temp: 0 }, finalDamage: 0, deathState: 'stable', deathSaves: { successes: 3, failures: 0 } });
  assert.equal(immune.deathState, 'stable');
  assert.deepEqual(immune.deathSaves, { successes: 3, failures: 0 });
});

test('Unconscious marker reconciliation owns only markers added from HP state', () => {
  const tokens = [
    { id: 'auto', statusMarkers: ['prone'] },
    { id: 'manual', statusMarkers: ['unconscious', 'restrained'] },
  ];
  const down = reconcileUnconsciousMarkers(tokens, [], true);
  assert.deepEqual(down.updates, [{ id: 'auto', statusMarkers: ['prone', 'unconscious'] }]);
  assert.deepEqual(down.ownedCastIds, ['auto']);

  const healed = reconcileUnconsciousMarkers([
    { id: 'auto', statusMarkers: ['prone', 'unconscious'] },
    { id: 'manual', statusMarkers: ['unconscious', 'restrained'] },
  ], down.ownedCastIds, false);
  assert.deepEqual(healed.updates, [{ id: 'auto', statusMarkers: ['prone'] }]);
  assert.deepEqual(healed.ownedCastIds, []);

  const stable = reconcileUnconsciousMarkers([
    { id: 'auto', statusMarkers: ['unconscious'] },
  ], down.ownedCastIds, true);
  assert.deepEqual(stable.updates, []);
  assert.deepEqual(stable.ownedCastIds, ['auto']);
});

test('monsters die at 0 HP by default while the NPC override uses character death saves', () => {
  const npc = getDefaultData('npc');
  assert.equal(npc.details.useCharacterDeathSaves, false);
  assert.deepEqual(npc.resources.deathSaves, { successes: 0, failures: 0 });
  assert.equal(resolveMonsterZeroHp({ actorType: 'npc', hpAfter: 0, deathState: 'alive' }).deathState, 'dead');
  assert.equal(resolveMonsterZeroHp({ actorType: 'npc', hpAfter: 0, deathState: 'alive', useCharacterDeathSaves: true }).deathState, 'alive');
  assert.equal(resolveMonsterZeroHp({ actorType: 'character', hpAfter: 0, deathState: 'alive' }).deathState, 'alive');
  assert.equal(resolveMonsterZeroHp({ actorType: 'npc', hpAfter: 1, deathState: 'alive' }).deathState, 'alive');
});

test('NPC death-save controls require the override and hide the roll after a settled outcome', () => {
  const hidden = npcDeathSaveView({ healthValue: 0, useCharacterDeathSaves: false });
  assert.equal(hidden.visible, false);
  const active = npcDeathSaveView({
    healthValue: 0, useCharacterDeathSaves: true, deathState: 'alive',
    deathSaves: { successes: 1, failures: 2 },
  });
  assert.equal(active.visible, true);
  assert.equal(active.canRoll, true);
  assert.deepEqual(active.successPips.map((pip) => pip.filled), [true, false, false]);
  assert.deepEqual(active.failurePips.map((pip) => pip.filled), [true, true, false]);
  assert.equal(npcDeathSaveView({ healthValue: 0, useCharacterDeathSaves: true, deathState: 'stable' }).canRoll, false);
  assert.equal(npcDeathSaveView({ healthValue: 0, useCharacterDeathSaves: true, deathState: 'dead' }).canRoll, false);
  assert.equal(npcDeathSaveView({ healthValue: 1, useCharacterDeathSaves: true }).visible, false);
});

test('concentration damage handling distinguishes zero, surviving damage, and dropping to zero HP', () => {
  const resources = { concentrating: true, concentratingOn: 'spell-origin' };
  assert.deepEqual(resolveConcentrationAfterDamage({ finalDamage: 0, hpAfter: 12, resources }), {
    saveDamage: null, clear: false, originToRemove: '',
  });
  assert.deepEqual(resolveConcentrationAfterDamage({ finalDamage: 3, hpAfter: 8, resources }), {
    saveDamage: 3, clear: false, originToRemove: '',
  });
  assert.deepEqual(resolveConcentrationAfterDamage({ finalDamage: 3, hpAfter: 0, resources }), {
    saveDamage: null, clear: true, originToRemove: 'spell-origin',
  });
  assert.deepEqual(resolveConcentrationAfterDamage({ finalDamage: 0, hpAfter: 0, resources }), {
    saveDamage: null, clear: true, originToRemove: 'spell-origin',
  });
  assert.deepEqual(resolveConcentrationAfterDamage({ finalDamage: 9, hpAfter: 3, resources: {} }), {
    saveDamage: null, clear: false, originToRemove: '',
  });
});

test('Concentration saves use SRD DC bounds and resolve only from a posted server d20', () => {
  assert.equal(concentrationSaveDc(0), 10);
  assert.equal(concentrationSaveDc(1), 10);
  assert.equal(concentrationSaveDc(20), 10);
  assert.equal(concentrationSaveDc(21), 10);
  assert.equal(concentrationSaveDc(60), 30);
  assert.equal(concentrationSaveDc(100), 30);
  assert.equal(concentrationSaveDc(-1), null);
  assert.equal(concentrationSaveDc(Number.NaN), null);

  const base = {
    total: 9,
    terms: [{ kind: 'dice', faces: 20, rolls: [7], dropped: [] }],
    meta: { srd5eConcentrationSave: true, srd5eAbilityKey: 'con', srd5eConcentrationOriginId: 'spell-a',
      srd5eConcentrationId: 'concentration-instance-a', srd5eConcentrationSaveAttemptId: 'attempt-a',
      srd5eConcentrationDamage: 9, actorId: 'actor-a', dc: 10 },
  };
  assert.deepEqual(resolveConcentrationSaveRoll(base), {
    actorId: 'actor-a', recordType: 'actor', originId: 'spell-a', concentrationId: 'concentration-instance-a', attemptId: 'attempt-a', dc: 10, total: 9, success: false,
  });
  assert.equal(resolveConcentrationSaveRoll({ ...base, total: 10 })?.success, true);
  assert.equal(resolveConcentrationSaveRoll({ ...base, meta: { ...base.meta, srd5eConcentrationRecordType: 'cast' } })?.recordType, 'cast');
  assert.equal(resolveConcentrationSaveRoll({ ...base, meta: { ...base.meta, srd5eConcentrationSave: false } }), null);
  assert.equal(resolveConcentrationSaveRoll({ ...base, meta: { ...base.meta, srd5eConcentrationDamage: 60 } }), null);
  assert.equal(resolveConcentrationSaveRoll({ ...base, terms: [] }), null);
  assert.equal(resolveConcentrationSaveRoll({ ...base, terms: [{ kind: 'dice', faces: 20, rolls: [7, 12], dropped: [true, true] }] }), null);
});

test('Concentration keeps simultaneous damage saves independent and replaces only the rerolled attempt', () => {
  const first = addConcentrationSaveAttempt({}, 'attempt-a');
  const second = addConcentrationSaveAttempt(first, 'attempt-b');
  assert.deepEqual(pendingConcentrationSaveAttempts(second), ['attempt-a', 'attempt-b']);
  const rerolled = replaceConcentrationSaveAttempt(second, 'attempt-a', 'attempt-a-reroll');
  assert.deepEqual(pendingConcentrationSaveAttempts(rerolled), ['attempt-a-reroll', 'attempt-b']);
  assert.equal(pendingConcentrationSaveAttempts(rerolled).includes('attempt-a'), false);
  const restored = restoreConcentrationAttempt(rerolled, 'attempt-a-reroll', 'attempt-a', ['attempt-a', 'attempt-b'], 'attempt-b');
  assert.deepEqual(restored, { concentrationSaveAttemptId: 'attempt-b', concentrationSaveAttemptIds: ['attempt-a', 'attempt-b'] });
  assert.equal(restoreConcentrationAttempt({ concentrationSaveAttemptId: 'attempt-c', concentrationSaveAttemptIds: ['attempt-c'] },
    'attempt-a-reroll', 'attempt-a', ['attempt-a', 'attempt-b'], 'attempt-b'), null);
});

test('ending concentration clears its flag and records the originating effect for cleanup', () => {
  assert.deepEqual(resolveConcentrationEnd({ concentrating: true, concentratingOn: 'spell-1' }), {
    ended: true, originToRemove: 'spell-1', patch: { concentrating: false, concentratingOn: '', concentrationId: '', concentrationSaveAttemptId: '', concentrationSaveAttemptIds: [] },
  });
  assert.deepEqual(resolveConcentrationEnd({ concentrating: false, concentratingOn: 'stale' }), {
    ended: false, originToRemove: '', patch: null,
  });
  assert.deepEqual(resolveConcentrationEnd({ concentrating: true }), {
    ended: true, originToRemove: '', patch: { concentrating: false, concentratingOn: '', concentrationId: '', concentrationSaveAttemptId: '', concentrationSaveAttemptIds: [] },
  });
});

test('Incapacitating SRD conditions end Concentration from direct or enveloped Cast update payloads', () => {
  for (const condition of ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']) {
    const result = resolveConcentrationAfterConditionUpdate(
      { concentrating: true, concentratingOn: 'origin' }, { data: { actorId: 'actor', statusMarkers: [condition] } },
    );
    assert.equal(result.ended, true, condition);
    assert.equal(result.triggered, true, condition);
    assert.equal(result.condition, condition);
    assert.equal(result.originToRemove, 'origin');
  }
  assert.equal(resolveConcentrationAfterConditionUpdate({ concentrating: true }, { statusMarkers: ['prone'] }).triggered, false);
  assert.equal(resolveConcentrationAfterConditionUpdate({ concentrating: false }, { statusMarkers: ['stunned'] }).ended, false,
    'repeat events or actors without an active concentration do not write again');
  assert.equal(resolveConcentrationAfterConditionUpdate({ concentrating: true }, { statusMarkers: ['STUNNED'] }).ended, true);
});

test('SRD 5.2 class progression entitlements', () => {
  assert.deepEqual(abilityChoiceLevelsFor('wizard'), [4, 8, 12, 16]);
  assert.deepEqual(abilityChoiceLevelsFor('fighter'), [4, 6, 8, 12, 14, 16]);
  assert.deepEqual(abilityChoiceLevelsFor('rogue'), [4, 8, 10, 12, 16]);
  assert.equal(progressionAtLevel('wizard', 19).epicBoon, true);
  assert.equal(progressionAtLevel('wizard', 19).abilityImprovement, false);
  for (const classIdentifier of ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']) {
    assert.equal(subclassLevelFor(classIdentifier), 3);
  }
  assert.equal(progressionBetween('wizard', 0, 8).filter((level) => level.subclass).length, 1);
});

test('multiclass prerequisites require 13 in each current and new class primary ability', () => {
  assert.deepEqual(Object.keys(MULTICLASS_PRIMARY_ABILITY_REQUIREMENTS).sort(), [
    'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
  ]);
  const barbarianToDruid = resolveMulticlassPrerequisites('druid', ['barbarian'], { str: 13, wis: 13 });
  assert.equal(barbarianToDruid.valid, true);
  assert.deepEqual(barbarianToDruid.failedClasses, []);
  assert.deepEqual(resolveMulticlassPrerequisites('druid', ['barbarian'], { str: 12, wis: 13 }).failedClasses, ['barbarian']);
  assert.deepEqual(resolveMulticlassPrerequisites('druid', ['barbarian'], { str: 13, wis: 12 }).failedClasses, ['druid']);
  assert.equal(resolveMulticlassPrerequisites('monk', [], { dex: 13, wis: 13 }).valid, true, 'compound primary abilities require both scores');
  assert.deepEqual(resolveMulticlassPrerequisites('monk', [], { dex: 13, wis: 12 }).failedClasses, ['monk']);
  assert.equal(resolveMulticlassPrerequisites('fighter', [], { str: 13 }).valid, true, 'Fighter accepts either listed primary ability');
  assert.equal(resolveMulticlassPrerequisites('fighter', [], { dex: 13 }).valid, true);
  assert.equal(resolveMulticlassPrerequisites('fighter', [], { str: 12, dex: 12 }).valid, false);
  assert.equal(resolveMulticlassPrerequisites('wizard', [], { int: { value: 13 } }).valid, true, 'Loom-style ability values are accepted');
});

test('multiclass prerequisites reject duplicate and unknown class identifiers without throwing', () => {
  const duplicate = resolveMulticlassPrerequisites('barbarian', ['barbarian'], { str: 18 });
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some(({ code }) => code === 'class-already-present'));
  const unknown = resolveMulticlassPrerequisites('artificer', ['barbarian'], { str: 18, int: 18 });
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some(({ code, classIdentifier }) => code === 'unknown-class' && classIdentifier === 'artificer'));
  assert.equal(resolveMulticlassPrerequisites('', [], {}).valid, false);
});

test('multiclass Level Up planner composes preflight, proficiency, HP, Hit Dice, and feature previews without writes', () => {
  const systemData = {
    details: { level: 4 },
    abilities: {
      str: { value: 13, modifier: 1 }, dex: { value: 12, modifier: 1 }, con: { value: 14, modifier: 2 },
      int: { value: 10, modifier: 0 }, wis: { value: 13, modifier: 1 }, cha: { value: 10, modifier: 0 },
    },
    attributes: { prof: { value: 2 } },
    skills: { athletics: { proficient: true }, arcana: { proficient: false } },
    proficiencies: { tools: ['Herbalism Kit'], armor: [], weapons: [] },
    resources: {
      health: { value: 22, max: 30 },
      hitDice: { value: 3, max: 4, pools: { fighter: { value: 3, max: 4, die: 'd10', needsReview: false } } },
    },
  };
  const currentItems = [{ id: 'fighter-class', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 4 } }];
  const featureEntries = [
    { name: 'Druidic', data: { identifier: 'druidic', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'druid', levelGained: 1 } },
    { name: 'Spellcasting', data: { identifier: 'spellcasting', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'druid', levelGained: 1 } },
  ];
  const plan = resolveMulticlassLevelUpPlan({
    actorSystemData: systemData,
    currentItems,
    classEntry: { name: 'Druid', data: { classIdentifier: 'druid', hitDie: 'd8', casterType: 'full' } },
    featureEntries,
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.readyForCommit, false, 'preview explicitly blocks until feature/spell choices and a recoverable commit are implemented');
  assert.equal(plan.prerequisites.valid, true);
  assert.equal(plan.proficiencies.valid, true);
  assert.deepEqual(plan.preview.characterLevel, { current: 4, next: 5 });
  assert.deepEqual(plan.preview.proficiencyBonus, { current: 2, next: 3 });
  assert.deepEqual(plan.preview.hitPoints, { gain: 7, current: 22, maximum: 30, afterLevelUp: { current: 29, maximum: 37 } });
  assert.deepEqual(plan.preview.hitDice, {
    value: 4, max: 5,
    pools: {
      fighter: { value: 3, max: 4, die: 'd10', needsReview: false },
      druid: { value: 1, max: 1, die: 'd8', needsReview: false },
    },
  });
  assert.equal(plan.preview.classItem.type, 'class');
  assert.equal(plan.preview.classItem.data.levels, 1);
  assert.deepEqual(plan.preview.features.map(({ name }) => name), ['Druidic', 'Spellcasting']);
  assert.ok(plan.blockers.some(({ code }) => code === 'level-one-feature-choices-not-reviewed'));
  assert.ok(plan.blockers.some(({ code }) => code === 'level-one-spell-choices-not-reviewed'));
  assert.ok(!plan.blockers.some(({ code }) => code === 'recoverable-actor-and-item-commit-required'), 'the item and actor journal contract now exists');
  assert.deepEqual(systemData.resources.hitDice.pools, { fighter: { value: 3, max: 4, die: 'd10', needsReview: false } }, 'planning is read-only');
});

test('multiclass entry exposes Druid only after Primal Order and keeps Warlock blocked on unresolved invocations', () => {
  assert.deepEqual(MULTICLASS_ENTRY_CLASS_IDS, [
    'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
  ]);
  const common = {
    actorSystemData: {
      details: { level: 4 }, abilities: { str: { value: 13 }, wis: { value: 13 }, con: { value: 12 } },
      resources: { health: { value: 20, max: 24 }, hitDice: { value: 3, max: 4, pools: {} } },
    },
    currentItems: [{ type: 'class', data: { classIdentifier: 'fighter', levels: 4 } }],
  };
  const druid = resolveMulticlassLevelUpPlan({ ...common,
    classEntry: { name: 'Druid', data: { classIdentifier: 'druid', hitDie: 'd8' } },
    featureEntries: [{ name: 'Primal Order', data: { identifier: 'primal-order', classIdentifier: 'druid', levelGained: 1, source: 'SRD 5.2 (CC-BY-4.0)' } }],
  });
  const warlock = resolveMulticlassLevelUpPlan({ ...common,
    classEntry: { name: 'Warlock', data: { classIdentifier: 'warlock', hitDie: 'd8' } },
    featureEntries: [{ name: 'Eldritch Invocations', data: { identifier: 'eldritch-invocations', classIdentifier: 'warlock', levelGained: 1, source: 'SRD 5.2 (CC-BY-4.0)' } }],
  });
  assert.ok(druid.blockers.some(({ code }) => code === 'primal-order-choice-required'));
  assert.ok(!druid.blockers.some(({ code }) => code === 'unhandled-level-one-class-choices'));
  assert.ok(warlock.blockers.some(({ code }) => code === 'warlock-invocation-choice-required'));
});

test('Warlock multiclass records one eligible level-one invocation in its recovery journal', () => {
  const progression = classSpellcastingAtLevel('warlock', 1);
  const spellEntries = [
    ...Array.from({ length: progression.cantrips }, (_, index) => ({ id: `warlock-c${index}`, name: `Warlock Cantrip ${index}`,
      type: 'spell', data: { identifier: `warlock-c${index}`, classes: ['warlock'], spellLevel: 0 } })),
    ...Array.from({ length: progression.prepared }, (_, index) => ({ id: `warlock-s${index}`, name: `Warlock Spell ${index}`,
      type: 'spell', data: { identifier: `warlock-s${index}`, classes: ['warlock'], spellLevel: 1 } })),
  ];
  const actor = {
    id: 'actor-warlock-entry', flags: {},
    systemData: { details: { level: 4 }, abilities: { str: { value: 13 }, cha: { value: 14 }, con: { value: 12, modifier: 1 } },
      resources: { health: { value: 20, max: 24 }, hitDice: { value: 3, max: 4, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
      skills: {}, proficiencies: { weapons: [], armor: [], tools: [] } },
    items: [{ id: 'fighter-entry', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 4, hitDie: 'd10' } }],
  };
  const base = {
    worldId: 'world-1', actor, transactionId: 'warlock-entry',
    classEntry: { name: 'Warlock', data: { classIdentifier: 'warlock', hitDie: 'd8', casterType: 'pact' } },
    featureEntries: [
      { name: 'Eldritch Invocations', data: { identifier: 'eldritch-invocations', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'warlock', levelGained: 1 } },
      { name: 'Pact Magic', data: { identifier: 'pact-magic', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'warlock', levelGained: 1 } },
    ],
    spellEntries, featureChoicesReviewed: true,
    spellSelection: { cantrips: spellEntries.filter(({ data }) => data.spellLevel === 0).map(({ id }) => id),
      prepared: spellEntries.filter(({ data }) => data.spellLevel > 0).map(({ id }) => id) },
  };
  const missing = createMulticlassLevelUpJournal(base);
  assert.equal(missing.valid, false);
  assert.ok(missing.blockers.some(({ code }) => code === 'warlock-invocation-choice-required'));
  const result = createMulticlassLevelUpJournal({ ...base, warlockInvocationSelection: 'pact-of-the-tome' });
  assert.equal(result.valid, true, JSON.stringify({ errors: result.errors, blockers: result.blockers }));
  const feature = result.journal.operations.find(({ payload }) => payload.type === 'feature'
    && payload.data.identifier === 'eldritch-invocations');
  assert.equal(feature.payload.data.selectedInvocationIdentifier, 'pact-of-the-tome');
  const invocation = result.journal.operations.find(({ key }) => key === 'warlock-invocation');
  assert.equal(invocation.payload.name, 'Pact of the Tome');
  assert.equal(invocation.payload.data.effectAutomation, 'manual');
  assert.ok(result.journal.operations.some(({ key }) => key === 'spell-1'));
});

test('Druid multiclass journals Magician cantrip or Warden proficiencies from a valid Primal Order choice', () => {
  const progression = classSpellcastingAtLevel('druid', 1);
  const spellEntries = [
    ...Array.from({ length: progression.cantrips + 1 }, (_, index) => ({ id: `druid-c${index}`, name: `Druid Cantrip ${index}`,
      type: 'spell', data: { identifier: `druid-c${index}`, classes: ['druid'], spellLevel: 0 } })),
    ...Array.from({ length: progression.prepared }, (_, index) => ({ id: `druid-s${index}`, name: `Druid Spell ${index}`,
      type: 'spell', data: { identifier: `druid-s${index}`, classes: ['druid'], spellLevel: 1 } })),
  ];
  const actor = {
    id: 'actor-druid-entry', flags: {},
    systemData: { details: { level: 4 }, abilities: { str: { value: 13 }, wis: { value: 14, modifier: 2 }, con: { value: 12, modifier: 1 } },
      resources: { health: { value: 20, max: 24 }, hitDice: { value: 3, max: 4, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
      skills: {}, proficiencies: { weapons: [], armor: [], tools: [] } },
    items: [{ id: 'fighter-entry', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 4, hitDie: 'd10' } }],
  };
  const base = {
    worldId: 'world-1', actor, transactionId: 'druid-entry',
    classEntry: { name: 'Druid', data: { classIdentifier: 'druid', hitDie: 'd8', casterType: 'full' } },
    featureEntries: [
      { name: 'Druidic', data: { identifier: 'druidic', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'druid', levelGained: 1 } },
      { name: 'Spellcasting', data: { identifier: 'spellcasting', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'druid', levelGained: 1 } },
      { name: 'Primal Order', data: { identifier: 'primal-order', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'druid', levelGained: 1 } },
    ],
    spellEntries, featureChoicesReviewed: true,
    spellSelection: { cantrips: spellEntries.filter(({ data }) => data.spellLevel === 0).slice(0, progression.cantrips).map(({ id }) => id),
      prepared: spellEntries.filter(({ data }) => data.spellLevel > 0).map(({ id }) => id) },
  };
  const missing = createMulticlassLevelUpJournal(base);
  assert.equal(missing.valid, false);
  assert.ok(missing.blockers.some(({ code }) => code === 'primal-order-choice-required'));

  const magicianCantrip = spellEntries.find(({ id }) => id === `druid-c${progression.cantrips}`);
  const magician = createMulticlassLevelUpJournal({ ...base,
    primalOrderSelection: { order: 'magician', extraCantripId: magicianCantrip.id } });
  assert.equal(magician.valid, true);
  const magicianFeature = magician.journal.operations.find(({ payload }) => payload.type === 'feature' && payload.data.identifier === 'primal-order');
  assert.equal(magicianFeature.payload.data.selectedOrder, 'magician');
  assert.ok(magician.journal.operations.some(({ payload }) => payload.type === 'spell' && payload.data.primalOrderCantrip));

  const warden = createMulticlassLevelUpJournal({ ...base, primalOrderSelection: { order: 'warden' } });
  assert.equal(warden.valid, true);
  const wardenData = warden.journal.operations.at(-1).payload.systemData;
  assert.ok(wardenData.proficiencies.weapons.includes('martialM') && wardenData.proficiencies.weapons.includes('martialR'));
  assert.ok(wardenData.proficiencies.armor.includes('medium'));
});

test('multiclass Level Up planner rejects failed prerequisites and flags stale feature sources', () => {
  const actorSystemData = {
    details: { level: 3 }, abilities: { str: { value: 12 }, wis: { value: 12 }, con: { value: 10 } },
    resources: { health: { value: 15, max: 20 }, hitDice: { value: 3, max: 3, pools: { barbarian: { value: 3, max: 3, die: 'd12' } } } },
  };
  const base = {
    actorSystemData,
    currentItems: [{ type: 'class', name: 'Barbarian', data: { classIdentifier: 'barbarian' } }],
    classEntry: { name: 'Druid', data: { classIdentifier: 'druid', hitDie: 'd8' } },
    featureEntries: [{ name: 'Druidic', data: { source: 'SRD 5.1 (CC-BY-4.0)', classIdentifier: 'druid', levelGained: 1 } }],
  };
  const plan = resolveMulticlassLevelUpPlan(base);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some(({ code }) => code === 'multiclass-prerequisites'));
  assert.ok(plan.blockers.some(({ code }) => code === 'feature-source-review'));
  const improved = resolveMulticlassLevelUpPlan({
    ...base,
    actorSystemData: { ...actorSystemData, abilities: { ...actorSystemData.abilities, str: { value: 13 }, wis: { value: 13 } } },
  });
  assert.equal(improved.valid, true, 'source review blocks commit, not preview calculation');
  assert.equal(improved.preview.skippedFeatureCount, 1);
});

test('Monk multiclass Level Up builds a recoverable class, feature, and actor update journal', () => {
  const actor = {
    id: 'actor-monk-entry', flags: {},
    systemData: {
      details: { level: 4 },
      abilities: { dex: { value: 14, modifier: 2 }, wis: { value: 13, modifier: 1 }, con: { value: 12, modifier: 1 } },
      attributes: { prof: { value: 2 } }, skills: { athletics: { proficient: true } },
      proficiencies: { weapons: ['simpleM'], armor: [], tools: [] },
      resources: { health: { value: 21, max: 26 }, hitDice: { value: 2, max: 4, pools: { fighter: { value: 2, max: 4, die: 'd10' } } },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 4, hitDie: 'd10', casterType: 'none' } }],
  };
  const result = createMulticlassLevelUpJournal({
    worldId: 'world-1', actor, transactionId: 'monk-entry-1',
    classEntry: { name: 'Monk', data: { classIdentifier: 'monk', hitDie: 'd8', casterType: 'none' } },
    featureEntries: [
      { name: 'Martial Arts', data: { source: 'Homebrew test fixture', classIdentifier: 'monk', levelGained: 1 } },
      { name: 'Unarmored Defense', data: { source: 'Homebrew test fixture', classIdentifier: 'monk', levelGained: 1 } },
    ],
    featureChoicesReviewed: true,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.journal.operations.map(({ kind }) => kind), ['create-item', 'create-item', 'create-item', 'update-actor']);
  const actorWrite = result.journal.operations.at(-1).payload.systemData;
  assert.equal(actorWrite.details.level, 5);
  assert.deepEqual(actorWrite.resources.health, { value: 27, max: 32 });
  assert.deepEqual(actorWrite.resources.hitDice.pools.monk, { value: 1, max: 1, die: 'd8', needsReview: false });
  assert.equal(actorWrite.attributes.prof.value, 3);
  assert.deepEqual(actor.systemData.resources.hitDice.pools, { fighter: { value: 2, max: 4, die: 'd10' } }, 'builder must leave input actor untouched');
});

test('Barbarian multiclass Level Up requires and journals exactly two SRD melee masteries', () => {
  const actor = {
    id: 'actor-barbarian-entry', flags: { custom: { retained: true } },
    systemData: {
      details: { level: 3 }, abilities: { str: { value: 14 }, con: { value: 12, modifier: 1 } },
      attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: [], armor: [], tools: [] },
      resources: { health: { value: 20, max: 24 }, hitDice: { value: 3, max: 3, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 3, hitDie: 'd10', casterType: 'none' } }],
  };
  const classEntry = { name: 'Barbarian', data: { classIdentifier: 'barbarian', hitDie: 'd12', casterType: 'none' } };
  const featureEntries = [
    { name: 'Rage', data: { source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'barbarian', levelGained: 1, identifier: 'rage' } },
    { name: 'Unarmored Defense', data: { source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'barbarian', levelGained: 1, identifier: 'unarmored-defense' } },
    { name: 'Weapon Mastery', data: { source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'barbarian', levelGained: 1, identifier: 'weapon-mastery', masteryCount: 2 } },
  ];
  const base = { worldId: 'world-1', actor, transactionId: 'barbarian-entry-1', classEntry, featureEntries, featureChoicesReviewed: true };
  const missing = createMulticlassLevelUpJournal(base);
  assert.equal(missing.valid, false);
  assert.ok(missing.blockers.some(({ code }) => code === 'weapon-mastery-choice-required'));
  assert.equal(missing.journal, null);

  const result = createMulticlassLevelUpJournal({ ...base, weaponMasterySelection: ['greataxe', 'handaxe'] });
  assert.equal(result.valid, true);
  const mastery = result.journal.operations.find(({ payload }) => payload.type === 'feature'
    && payload.data.identifier === 'weapon-mastery');
  assert.deepEqual(mastery.payload.data.masteredWeaponIdentifiers, ['greataxe', 'handaxe']);
  assert.equal(result.journal.operations.at(-1).payload.flags.custom.retained, true);
});

test('Paladin multiclass entry collects and journals its two proficient Weapon Mastery choices', () => {
  const paladinSpellProgression = classSpellcastingAtLevel('paladin', 1);
  const spellEntries = Array.from({ length: paladinSpellProgression.prepared }, (_, index) => ({
    id: `paladin-spell-${index}`, name: `Paladin Spell ${index + 1}`, type: 'spell',
    data: { classes: ['paladin'], spellLevel: 1 },
  }));
  const actor = {
    id: 'actor-paladin-entry', flags: {},
    systemData: { details: { level: 2 }, abilities: { str: { value: 13 }, cha: { value: 14 }, con: { value: 12, modifier: 1 } },
      attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: ['simpleM'], armor: [], tools: [] },
      resources: { health: { value: 18, max: 22 }, hitDice: { value: 2, max: 2, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) } },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 2, hitDie: 'd10', casterType: 'none' } }],
  };
  const base = { worldId: 'world-1', actor, transactionId: 'paladin-entry-1',
    classEntry: { name: 'Paladin', data: { classIdentifier: 'paladin', hitDie: 'd10', casterType: 'half' } },
    spellEntries,
    featureEntries: [{ name: 'Weapon Mastery', data: { source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'paladin', levelGained: 1,
      identifier: 'weapon-mastery', masteryCount: 2 } }], featureChoicesReviewed: true, spellChoicesReviewed: true,
    spellSelection: { cantrips: [], prepared: spellEntries.map(({ id }) => id) } };
  const missing = createMulticlassLevelUpJournal(base);
  assert.equal(missing.valid, false);
  assert.ok(missing.blockers.some(({ code }) => code === 'weapon-mastery-choice-required'));
  const result = createMulticlassLevelUpJournal({ ...base, weaponMasterySelection: ['longsword', 'longbow'] });
  assert.equal(result.valid, true, JSON.stringify({ errors: result.errors, blockers: result.blockers }));
  const mastery = result.journal.operations.find(({ payload }) => payload.type === 'feature'
    && payload.data.identifier === 'weapon-mastery');
  assert.deepEqual(mastery.payload.data.masteredWeaponIdentifiers, ['longsword', 'longbow']);
});

test('Fighter multiclass Level Up validates an SRD Fighting Style feat and records its manual effect', () => {
  const featDb = new DatabaseSync('packs/feats.sqlite', { readOnly: true });
  const styles = featDb.prepare("SELECT name, data FROM entries WHERE type = 'feat'").all()
    .map((row) => ({ name: row.name, data: JSON.parse(row.data) }))
    .filter(({ data }) => /Category:\s*Fighting Style Feat/i.test(String(data.description || '')));
  featDb.close();
  assert.deepEqual(styles.map(({ name }) => name).sort(), ['Archery', 'Defense', 'Great Weapon Fighting', 'Two-Weapon Fighting']);
  assert.deepEqual(['Dueling', 'Protection'].filter((name) => styles.some((style) => style.name === name)), [],
    'the UI must disclose the two choices named by the class text but absent from this pack');
  const actor = {
    id: 'actor-fighter-entry', flags: {},
    systemData: {
      details: { level: 3 }, abilities: { str: { value: 14 }, con: { value: 12, modifier: 1 } },
      attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: [], armor: [], tools: [] },
      resources: { health: { value: 20, max: 24 }, hitDice: { value: 3, max: 3, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'barbarian', name: 'Barbarian', type: 'class', data: { classIdentifier: 'barbarian', levels: 3, hitDie: 'd12', casterType: 'none' } }],
  };
  const base = {
    worldId: 'world-1', actor, transactionId: 'fighter-entry-1',
    classEntry: { name: 'Fighter', data: { classIdentifier: 'fighter', hitDie: 'd10', casterType: 'none' } },
    featureEntries: [
      { name: 'Fighting Style', data: { source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'fighter', levelGained: 1 } },
      { name: 'Second Wind', data: { source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'fighter', levelGained: 1 } },
      { name: 'Weapon Mastery', data: { source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'fighter', levelGained: 1, identifier: 'weapon-mastery', masteryCount: 3 } },
    ],
    featureChoicesReviewed: true,
    weaponMasterySelection: ['longsword', 'longbow', 'dagger'],
  };
  const missing = createMulticlassLevelUpJournal(base);
  assert.equal(missing.valid, false);
  assert.ok(missing.blockers.some(({ code }) => code === 'fighting-style-choice-required'));

  const defense = { id: 'defense', name: 'Defense', data: {
    identifier: 'defense', source: 'SRD 5.2 (CC-BY-4.0)',
    description: 'Category: Fighting Style Feat\nPrerequisite: Fighting Style Feature\nWhile wearing armor, you gain +1 AC.',
  } };
  const result = createMulticlassLevelUpJournal({ ...base, fighterStyleSelection: defense });
  assert.equal(result.valid, true);
  const featWrite = result.journal.operations.find(({ key }) => key === 'fighting-style-feat');
  assert.equal(featWrite.payload.name, 'Defense');
  assert.equal(featWrite.payload.data.effectAutomation, 'manual');
  const featureWrite = result.journal.operations.find(({ payload }) => payload.type === 'feature'
    && payload.name === 'Fighting Style');
  assert.equal(featureWrite.payload.data.selectedFightingStyleIdentifier, 'defense');
  const invalid = createMulticlassLevelUpJournal({ ...base, fighterStyleSelection: {
    id: 'homebrew', name: 'Homebrew', data: { source: 'Homebrew', description: 'Category: Fighting Style Feat' },
  } });
  assert.equal(invalid.valid, false, 'only a verified SRD 5.2 fighting style can be recorded');
});

test('Bard multiclass Level Up validates and journals first-level class spells with actor progression', () => {
  const actor = {
    id: 'actor-bard-entry', flags: {},
    systemData: {
      details: { level: 3 },
      abilities: { str: { value: 13 }, dex: { value: 10 }, con: { value: 12, modifier: 1 }, cha: { value: 14 } },
      attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: [], armor: [], tools: [] },
      resources: { health: { value: 18, max: 22 }, hitDice: { value: 3, max: 3, pools: { fighter: { value: 3, max: 3, die: 'd10' } } },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 3, hitDie: 'd10', casterType: 'none' } }],
  };
  const cantrips = ['cantrip-a', 'cantrip-b'].map((id) => ({ id, name: id, data: { spellLevel: 0, classes: ['bard'] } }));
  const prepared = ['spell-a', 'spell-b', 'spell-c', 'spell-d'].map((id) => ({ id, name: id, data: { spellLevel: 1, classes: ['bard'] } }));
  const result = createMulticlassLevelUpJournal({
    worldId: 'world-1', actor, transactionId: 'bard-entry-1',
    classEntry: { name: 'Bard', data: { classIdentifier: 'bard', hitDie: 'd8', casterType: 'full' } },
    featureEntries: [
      { name: 'Bardic Inspiration', data: { identifier: 'bardic-inspiration', source: 'SRD 5.2 (CC-BY-4.0)', classIdentifier: 'bard', levelGained: 1, uses: { max: 3, value: 3, recovery: 'lr' } } },
      { name: 'Spellcasting', data: { source: 'Homebrew test fixture', classIdentifier: 'bard', levelGained: 1 } },
    ],
    spellEntries: [...cantrips, ...prepared],
    spellSelection: { cantrips: cantrips.map(({ id }) => id), prepared: prepared.map(({ id }) => id) },
    proficiencySelection: { skills: ['performance'], tools: ['lute'] },
    featureChoicesReviewed: true,
  });

  assert.equal(result.valid, true);
  assert.equal(result.resolvedSpells.cantrips.length, 2);
  assert.equal(result.resolvedSpells.prepared.length, 4);
  assert.equal(result.journal.operations.filter(({ kind }) => kind === 'create-item').length, 9);
  const updatedActor = result.journal.operations.at(-1).payload.systemData;
  assert.equal(updatedActor.resources.spellSlots[1].max, 2);
  assert.equal(updatedActor.skills.performance.proficient, true);
  assert.ok(updatedActor.proficiencies.armor.includes('light'));
  assert.ok(updatedActor.proficiencies.tools.includes('Musical Instrument: Lute'));
  const bardicInspiration = result.journal.operations.find(({ kind, payload }) => kind === 'create-item' && payload.data.identifier === 'bardic-inspiration').payload.data;
  assert.equal(bardicInspiration.uses.max, 2);
  assert.equal(bardicInspiration.uses.value, 2);
  assert.equal(bardicInspiration.uses.recovery, 'lr');
  assert.equal(bardicInspiration.bardicInspirationDie, 'd6');
  assert.equal(bardicInspiration.mechanicsSupport.manualNoticeKey, 'SDR5E.ClassFeatures.BardicInspirationManual');
});

test('Rogue multiclass entry resolves Expertise, Cant, language, and eligible weapon masteries', () => {
  assert.equal(resolveRogueAdditionalLanguage('Elvish', ['common', "Thieves' Cant"]).valid, true);
  assert.equal(resolveRogueAdditionalLanguage('Common', []).valid, false);
  assert.equal(resolveRogueAdditionalLanguage('Elvish', ['elvish']).valid, false);
  const actor = {
    id: 'actor-rogue-entry', flags: {},
    systemData: {
      details: { level: 3, languages: { value: ['Common', 'Elvish'], custom: '' } },
      abilities: { dex: { value: 14 }, int: { value: 13 }, con: { value: 12, modifier: 1 } },
      attributes: { prof: { value: 2 } },
      skills: { stealth: { proficient: true }, perception: { proficient: true }, arcana: { proficient: false } },
      proficiencies: { weapons: ['simpleM', 'martial:light'], armor: [], tools: [] },
      resources: { health: { value: 20, max: 24 }, hitDice: { value: 3, max: 3, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 3, hitDie: 'd10', casterType: 'none' } }],
  };
  const base = {
    worldId: 'world-1', actor, transactionId: 'rogue-entry-1',
    classEntry: { name: 'Rogue', data: { classIdentifier: 'rogue', hitDie: 'd8', casterType: 'none' } },
    proficiencySelection: { skills: ['deception'] },
    featureChoicesReviewed: true,
    featureEntries: [
      { name: 'Expertise', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'expertise', classIdentifier: 'rogue', levelGained: 1 } },
      { name: 'Sneak Attack', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'sneak-attack', classIdentifier: 'rogue', levelGained: 1 } },
      { name: "Thieves' Cant", data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'thieves-cant', classIdentifier: 'rogue', levelGained: 1 } },
      { name: 'Weapon Mastery', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'weapon-mastery', classIdentifier: 'rogue', levelGained: 1, masteryCount: 2 } },
    ],
  };
  const missing = createMulticlassLevelUpJournal(base);
  assert.equal(missing.valid, false);
  assert.ok(missing.blockers.some(({ code }) => code === 'rogue-expertise-choice-required'));
  assert.ok(missing.blockers.some(({ code }) => code === 'rogue-additional-language-required'));
  assert.equal(missing.journal, null);

  const result = createMulticlassLevelUpJournal({ ...base,
    rogueChoices: { expertiseSkills: ['stealth', 'deception'], additionalLanguage: 'Dwarvish' },
    weaponMasterySelection: ['dagger', 'shortsword'],
  });
  assert.equal(result.valid, true, JSON.stringify({ errors: result.errors, blockers: result.blockers }));
  const actorWrite = result.journal.operations.at(-1).payload.systemData;
  assert.equal(actorWrite.skills.stealth.multiplier, 2);
  assert.equal(actorWrite.skills.deception.multiplier, 2);
  assert.deepEqual(new Set(actorWrite.details.languages.value), new Set(['Common', 'Elvish', ROGUE_SPECIAL_LANGUAGE, 'Dwarvish']));
  const expertise = result.journal.operations.find(({ payload }) => payload.data?.identifier === 'expertise');
  assert.deepEqual(expertise.payload.data.selectedExpertiseSkills, ['stealth', 'deception']);
  const mastery = result.journal.operations.find(({ payload }) => payload.data?.identifier === 'weapon-mastery');
  assert.deepEqual(mastery.payload.data.masteredWeaponIdentifiers, ['dagger', 'shortsword']);
  const invalid = createMulticlassLevelUpJournal({ ...base,
    rogueChoices: { expertiseSkills: ['stealth', 'deception'], additionalLanguage: 'Elvish' },
    weaponMasterySelection: ['dagger', 'shortsword'],
  });
  assert.equal(invalid.valid, false, 'already-known languages cannot be selected again');
});

test('character language choices follow SRD origin rules and add Rogue languages without duplicates', () => {
  const creationRules = readFileSync('.dev/srd5.2_markdown/character-creation.md', 'utf8');
  const standardSection = creationRules.match(/\*\*Standard Languages\*\*([\s\S]*?)\*\*Rare Languages\*\*/)?.[1] || '';
  const standardFromSource = [...standardSection.matchAll(/<tr>\s*<td>[^<]*<\/td>\s*<td>([^<]+)<\/td>\s*<\/tr>/g)]
    .map(([, name]) => name.trim());
  assert.deepEqual(SRD_STANDARD_LANGUAGES, standardFromSource, 'standard language options match the local SRD table');
  assert.equal(SRD_STANDARD_LANGUAGES.includes('Common'), true);
  assert.deepEqual(resolveOriginLanguageChoices(['Dwarvish', 'Elvish']).selected, ['Dwarvish', 'Elvish']);
  assert.equal(resolveOriginLanguageChoices(['Common', 'Elvish']).valid, false, 'Common is granted automatically');
  assert.equal(resolveOriginLanguageChoices(['Elvish', 'Elvish']).valid, false, 'origin languages must be distinct');
  assert.equal(resolveOriginLanguageChoices(['Abyssal', 'Elvish']).valid, false, 'origin choices come from the Standard table');
  assert.deepEqual(resolveCharacterLanguages({ originLanguages: ['Draconic', 'Gnomish'] }), {
    valid: true, errors: [], languages: ['Common', 'Draconic', 'Gnomish'],
    origin: resolveOriginLanguageChoices(['Draconic', 'Gnomish']), rogue: null,
  });
  const rogue = resolveCharacterLanguages({ originLanguages: ['Draconic', 'Gnomish'], classIdentifier: 'rogue', rogueAdditionalLanguage: 'Abyssal' });
  assert.equal(rogue.valid, true);
  assert.deepEqual(rogue.languages, ['Common', 'Draconic', 'Gnomish', ROGUE_SPECIAL_LANGUAGE, 'Abyssal']);
  assert.equal(resolveCharacterLanguages({ originLanguages: ['Draconic', 'Gnomish'], classIdentifier: 'rogue', rogueAdditionalLanguage: 'Draconic' }).valid, false);
  assert.equal(resolveCharacterLanguages({ originLanguages: ['Draconic', 'Gnomish'], rogueAdditionalLanguage: 'Abyssal' }).valid, false);
  const prior = { details: { languages: { value: ['custom'], custom: 'homebrew dialect' }, background: 'Acolyte' } };
  const saved = applyCharacterLanguages(prior, rogue);
  assert.deepEqual(saved.details.languages, { value: rogue.languages, custom: 'homebrew dialect' });
  assert.equal(prior.details.languages.value[0], 'custom', 'persistence helper does not mutate the source actor data');
  assert.throws(() => applyCharacterLanguages(prior, { valid: false, languages: [] }), /valid character language resolution/);
});

test('Paladin multiclass entry records prepared spells', () => {
  for (const [classIdentifier, ability] of [['paladin', 'cha']]) {
    const actor = {
      id: `actor-${classIdentifier}-entry`, flags: {},
      systemData: {
        details: { level: 2 },
        abilities: { str: { value: 14 }, dex: { value: 14 }, con: { value: 12, modifier: 1 }, [ability]: { value: 14 } },
        attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: [], armor: [], tools: [] },
        resources: { health: { value: 16, max: 20 }, hitDice: { value: 2, max: 2, pools: {} },
          spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
      },
      items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 2, hitDie: 'd10', casterType: 'none' } }],
    };
    const spells = ['spell-a', 'spell-b'].map((id) => ({ id, name: `${classIdentifier}-${id}`, data: { spellLevel: 1, classes: [classIdentifier] } }));
    const result = createMulticlassLevelUpJournal({
      worldId: 'world-1', actor, transactionId: `${classIdentifier}-entry-1`,
      classEntry: { name: classIdentifier, data: { classIdentifier, hitDie: 'd10', casterType: 'half' } },
      featureEntries: [{ name: 'Spellcasting', data: { source: 'Homebrew test fixture', classIdentifier, levelGained: 1 } }],
      spellEntries: spells,
      spellSelection: { prepared: spells.map(({ id }) => id) },
      proficiencySelection: classIdentifier === 'ranger' ? { skills: ['survival'] } : {},
      featureChoicesReviewed: true,
    });

    assert.equal(result.valid, true, classIdentifier);
    assert.deepEqual(result.resolvedSpells.prepared.map(({ name }) => name), spells.map(({ name }) => name));
    assert.equal(result.journal.operations.filter(({ key }) => key.startsWith('spell-')).length, 2);
    assert.equal(result.journal.operations.at(-1).payload.systemData.resources.spellSlots[1].max, 2);
  }
});

test('Ranger multiclass entry grants two chosen spells plus always-prepared Hunter’s Mark and free casts', () => {
  const actor = {
    id: 'actor-ranger-entry', flags: {},
    systemData: {
      details: { level: 2 }, abilities: { str: { value: 14 }, dex: { value: 14 }, con: { value: 12, modifier: 1 }, wis: { value: 14 } },
      attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: [], armor: [], tools: [] },
      resources: { health: { value: 16, max: 20 }, hitDice: { value: 2, max: 2, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 2, hitDie: 'd10', casterType: 'none' } }],
  };
  const chosen = ['spell-a', 'spell-b'].map((id) => ({ id, name: id, data: { spellLevel: 1, classes: ['ranger'] } }));
  const huntersMark = { id: 'hunters-mark', name: "Hunter's Mark", data: { spellLevel: 1, classes: ['ranger'] } };
  const result = createMulticlassLevelUpJournal({
    worldId: 'world-1', actor, transactionId: 'ranger-entry-1',
    classEntry: { name: 'Ranger', data: { classIdentifier: 'ranger', hitDie: 'd10', casterType: 'half' } },
    featureEntries: [
      { name: 'Favored Enemy', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'favored-enemy', classIdentifier: 'ranger', levelGained: 1 } },
      { name: 'Weapon Mastery', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'weapon-mastery', classIdentifier: 'ranger', levelGained: 1, masteryCount: 2 } },
    ],
    spellEntries: [...chosen, huntersMark], spellSelection: { prepared: chosen.map(({ id }) => id) },
    proficiencySelection: { skills: ['survival'] }, weaponMasterySelection: ['longbow', 'shortsword'],
    featureChoicesReviewed: true,
  });
  const noFeature = createMulticlassLevelUpJournal({
    worldId: 'world-1', actor, transactionId: 'ranger-entry-no-feature',
    classEntry: { name: 'Ranger', data: { classIdentifier: 'ranger', hitDie: 'd10', casterType: 'half' } },
    featureEntries: [], spellEntries: [...chosen, huntersMark],
    spellSelection: { prepared: chosen.map(({ id }) => id) },
    proficiencySelection: { skills: ['survival'] }, weaponMasterySelection: ['longbow', 'shortsword'], featureChoicesReviewed: true,
  });
  assert.equal(noFeature.valid, false);
  assert.ok(noFeature.errors.some(({ code }) => code === 'missing-ranger-favored-enemy-feature'));

  const noVerifiedSpell = createMulticlassLevelUpJournal({
    worldId: 'world-1', actor, transactionId: 'ranger-entry-no-mark',
    classEntry: { name: 'Ranger', data: { classIdentifier: 'ranger', hitDie: 'd10', casterType: 'half' } },
    featureEntries: [{ name: 'Favored Enemy', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'favored-enemy', classIdentifier: 'ranger', levelGained: 1 } }],
    spellEntries: chosen, spellSelection: { prepared: chosen.map(({ id }) => id) },
    proficiencySelection: { skills: ['survival'] }, weaponMasterySelection: ['longbow', 'shortsword'], featureChoicesReviewed: true,
  });
  assert.equal(noVerifiedSpell.valid, false);
  assert.ok(noVerifiedSpell.errors.some(({ code }) => code === 'invalid-ranger-favored-enemy-spell'));

  assert.equal(result.valid, true, JSON.stringify({ errors: result.errors, blockers: result.blockers }));
  const rangerMark = result.journal.operations.find(({ payload }) => payload.name === "Hunter's Mark");
  assert.equal(rangerMark.payload.data.alwaysPrepared, true);
  assert.equal(rangerMark.payload.data.sourceClassIdentifier, 'ranger');
  const favoredEnemy = result.journal.operations.find(({ payload }) => payload.type === 'feature' && payload.data.identifier === 'favored-enemy');
  assert.deepEqual(favoredEnemy.payload.data.uses, { value: 2, max: 2, recovery: 'lr' });
  assert.equal(result.journal.operations.filter(({ key }) => key.startsWith('spell-')).length, 3);
  assert.equal(result.journal.operations.at(-1).payload.systemData.resources.spellSlots[1].max, 2);
});

test('Cleric multiclass Level Up journals either Divine Order and the resulting grants', () => {
  const actor = {
    id: 'actor-cleric-entry', flags: {},
    systemData: {
      details: { level: 2 },
      abilities: { str: { value: 13 }, wis: { value: 13 }, con: { value: 12, modifier: 1 } },
      attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: [], armor: [], tools: [] },
      resources: { health: { value: 16, max: 20 }, hitDice: { value: 2, max: 2, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 2, hitDie: 'd10', casterType: 'none' } }],
  };
  const cantrips = ['cantrip-a', 'cantrip-b', 'cantrip-c'].map((id) => ({ id, name: `cleric-${id}`, data: { identifier: id, source: 'SRD 5.2 (CC-BY-4.0)', spellLevel: 0, classes: ['cleric'] } }));
  const spells = ['spell-a', 'spell-b', 'spell-c', 'spell-d'].map((id) => ({ id, name: `cleric-${id}`, data: { spellLevel: 1, classes: ['cleric'] } }));
  const extraCantrip = { id: 'extra-cantrip', name: 'Guidance', data: { identifier: 'guidance', source: 'SRD 5.2 (CC-BY-4.0)', spellLevel: 0, classes: ['cleric'] } };
  const base = {
    worldId: 'world-1', actor, transactionId: 'cleric-entry-1',
    classEntry: { name: 'Cleric', data: { classIdentifier: 'cleric', hitDie: 'd8', casterType: 'full' } },
    featureEntries: [
      { name: 'Spellcasting', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'cleric-spellcasting', classIdentifier: 'cleric', levelGained: 1 } },
      { name: 'Divine Order', data: { source: 'SRD 5.2 (CC-BY-4.0)', identifier: 'divine-order', classIdentifier: 'cleric', levelGained: 1 } },
    ],
    spellEntries: [...cantrips, ...spells],
    spellSelection: { cantrips: cantrips.map(({ id }) => id), prepared: spells.map(({ id }) => id) },
    featureChoicesReviewed: true,
  };
  const missing = createMulticlassLevelUpJournal(base);
  assert.equal(missing.valid, false);
  assert.ok(missing.blockers.some(({ code }) => code === 'divine-order-choice-required'));
  assert.equal(missing.journal, null);

  const protector = createMulticlassLevelUpJournal({ ...base, divineOrderSelection: { order: 'protector' } });
  assert.equal(protector.valid, true);
  assert.ok(protector.journal.operations.at(-1).payload.systemData.proficiencies.weapons.includes('martialM'));
  assert.ok(protector.journal.operations.at(-1).payload.systemData.proficiencies.armor.includes('heavy'));
  const protectorFeature = protector.journal.operations.find(({ payload }) => payload.type === 'feature'
    && payload.data.identifier === 'divine-order');
  assert.equal(protectorFeature.payload.data.selectedOrder, 'protector');

  const thaumaturge = createMulticlassLevelUpJournal({
    ...base, spellEntries: [...cantrips, ...spells, extraCantrip],
    divineOrderSelection: { order: 'thaumaturge', extraCantripId: extraCantrip.id },
  });
  assert.equal(thaumaturge.valid, true);
  const extraSpell = thaumaturge.journal.operations.find(({ payload }) => payload.type === 'spell'
    && payload.data.divineOrderCantrip);
  assert.equal(extraSpell.payload.name, 'Guidance');
  const thaumaturgeFeature = thaumaturge.journal.operations.find(({ payload }) => payload.type === 'feature'
    && payload.data.identifier === 'divine-order');
  assert.equal(thaumaturgeFeature.payload.data.selectedOrder, 'thaumaturge');
  assert.equal(thaumaturgeFeature.payload.data.selectedCantripIdentifier, 'guidance');
});

test('Wizard multiclass Level Up journals the full level-one spellbook, preparation, features, and slot change', () => {
  const actor = {
    id: 'actor-wizard-entry', flags: {},
    systemData: {
      details: { level: 2 },
      abilities: { str: { value: 13 }, dex: { value: 13 }, con: { value: 12, modifier: 1 }, int: { value: 14 } },
      attributes: { prof: { value: 2 } }, skills: {}, proficiencies: { weapons: [], armor: [], tools: [] },
      resources: { health: { value: 16, max: 20 }, hitDice: { value: 2, max: 2, pools: {} },
        spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, { value: 0, max: 0 }])) },
    },
    items: [{ id: 'fighter', name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 2, hitDie: 'd10', casterType: 'none' } }],
  };
  const cantrips = ['cantrip-a', 'cantrip-b', 'cantrip-c'].map((id) => ({ id, name: `wizard-${id}`, data: { spellLevel: 0, classes: ['wizard'] } }));
  const spellbook = ['spell-a', 'spell-b', 'spell-c', 'spell-d', 'spell-e', 'spell-f']
    .map((id) => ({ id, name: `wizard-${id}`, data: { spellLevel: 1, classes: ['wizard'] } }));
  const result = createMulticlassLevelUpJournal({
    worldId: 'world-1', actor, transactionId: 'wizard-entry-1',
    classEntry: { name: 'Wizard', data: { classIdentifier: 'wizard', hitDie: 'd6', casterType: 'full' } },
    featureEntries: [
      { name: 'Arcane Recovery', data: { source: 'Homebrew test fixture', classIdentifier: 'wizard', levelGained: 1 } },
      { name: 'Spellcasting', data: { source: 'Homebrew test fixture', classIdentifier: 'wizard', levelGained: 1 } },
    ],
    spellEntries: [...cantrips, ...spellbook],
    spellSelection: {
      cantrips: cantrips.map(({ id }) => id),
      spellbook: spellbook.map(({ id }) => id),
      prepared: spellbook.slice(0, 4).map(({ id }) => id),
    },
    featureChoicesReviewed: true,
  });

  assert.equal(result.valid, true, JSON.stringify({ errors: result.errors, blockers: result.blockers }));
  const createOperations = result.journal.operations.filter(({ kind }) => kind === 'create-item');
  assert.equal(createOperations.filter(({ payload }) => payload.type === 'feature').length, 2);
  assert.equal(createOperations.filter(({ payload }) => payload.type === 'spell' && payload.data.wizardSpellbook).length, 6);
  assert.equal(createOperations.filter(({ payload }) => payload.type === 'spell' && payload.data.spellLevel === 0).length, 3);
  assert.equal(createOperations.filter(({ payload }) => payload.type === 'spell' && payload.data.prepared).length, 4);
  assert.equal(result.journal.operations.at(-1).payload.systemData.details.level, 3);
  assert.equal(result.journal.operations.at(-1).payload.systemData.resources.spellSlots[1].max, 2);
});

test('shared progression plan lists every level-specific choice for high-level starts', () => {
  const plan = buildProgressionPlan('fighter', 0, 20);
  assert.equal(plan.levels.length, 20);
  assert.deepEqual(plan.choices.filter((choice) => choice.kind === 'subclass').map((choice) => choice.level), [3]);
  assert.deepEqual(plan.choices.filter((choice) => choice.kind === 'ability-improvement').map((choice) => choice.level), [4, 6, 8, 12, 14, 16]);
  assert.deepEqual(plan.choices.filter((choice) => choice.kind === 'epic-boon').map((choice) => choice.level), [19]);
  assert.deepEqual(buildProgressionPlan('wizard', 2, 4).choices.map((choice) => choice.kind), ['subclass', 'ability-improvement']);
  assert.throws(() => buildProgressionPlan('wizard', 0, 21), RangeError);
});

test('progression choices resolve cumulatively and reject missing choices or ability caps', () => {
  const plan = buildProgressionPlan('wizard', 0, 4);
  const subclass = plan.choices.find((choice) => choice.kind === 'subclass');
  const asi = plan.choices.find((choice) => choice.kind === 'ability-improvement');
  const missing = resolveProgressionChoices(plan, { str: 10, int: 19 }, {});
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missing, [subclass.id, asi.id]);

  const valid = resolveProgressionChoices(plan, { str: 10, int: 18 }, {
    [subclass.id]: { selected: true, name: 'Evoker' },
    [asi.id]: { mode: 'scores', first: 'int', second: '' },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.abilities.int, 20);

  const capped = resolveProgressionChoices(plan, { str: 10, int: 19 }, {
    [subclass.id]: { selected: true },
    [asi.id]: { mode: 'scores', first: 'int', second: '' },
  });
  assert.equal(capped.valid, false);
  assert.equal(capped.errors[0].code, 'ability-score-cap');
});

test('feat choices are recorded without inventing text-only feat effects', () => {
  const plan = buildProgressionPlan('wizard', 0, 4);
  const subclass = plan.choices.find((choice) => choice.kind === 'subclass');
  const asi = plan.choices.find((choice) => choice.kind === 'ability-improvement');
  const resolved = resolveProgressionChoices(plan, { int: 14 }, {
    [subclass.id]: { selected: true, name: 'Evoker' },
    [asi.id]: { mode: 'feat', featName: 'Grappler', featEntryId: 'grappler' },
  });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.abilities.int, 14);
  assert.deepEqual(resolved.feats.map((feat) => feat.name), ['Grappler']);
});

test('structured ability-improvement feat applies bounded cumulative score choices', () => {
  const plan = buildProgressionPlan('wizard', 0, 8);
  const subclass = plan.choices.find((choice) => choice.kind === 'subclass');
  const asis = plan.choices.filter((choice) => choice.kind === 'ability-improvement');
  const entry = { identifier: 'ability-score-improvement' };
  const dataByChoice = Object.fromEntries(asis.map((choice) => [choice.id, entry]));
  const selections = {
    [subclass.id]: { selected: true, name: 'Evoker' },
    [asis[0].id]: { mode: 'feat', featName: 'Ability Score Improvement', featEntryId: 'asi', featAbilityFirst: 'int', featAbilitySecond: 'wis' },
    [asis[1].id]: { mode: 'feat', featName: 'Ability Score Improvement', featEntryId: 'asi', featAbilityFirst: 'int', featAbilitySecond: '' },
  };
  const resolved = resolveProgressionChoices(plan, { int: 17, wis: 12 }, selections, dataByChoice);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.abilities.int, 20);
  assert.equal(resolved.abilities.wis, 13);
  assert.equal(resolved.decisions.filter((decision) => decision.kind === 'feat-effect').length, 2);

  selections[asis[1].id].featAbilityFirst = '';
  const missing = resolveProgressionChoices(plan, { int: 17, wis: 12 }, selections, dataByChoice);
  assert.equal(missing.valid, false);
  assert.ok(missing.missing.includes(`${asis[1].id}:feat-effect`));
});

test('feat picker permits only categories and prerequisites currently verified by code', () => {
  const feat = (name, category, prerequisite = '', repeatable = false, requiresLevel = 1) => ({
    name,
    data: { requiresLevel, description: `Category: ${category}${prerequisite ? `\nPrerequisite: ${prerequisite}` : ''}${repeatable ? '\nRepeatable: Yes' : ''}` },
  });
  assert.equal(isFeatEligibleForProgression(feat('Skilled', 'Origin Feat'), 4), true);
  assert.equal(isFeatEligibleForProgression({ name: 'Late Feat', data: { description: 'Category: General Feat\nPrerequisite: Level 19+' } }, 4), false);
  assert.equal(isFeatEligibleForProgression(feat('Ability Score Improvement', 'General Feat', 'Level 4+', true, 4), 4), true);
  assert.equal(isFeatEligibleForProgression(feat('Grappler', 'General Feat', 'Level 4+, Strength or Dexterity 13+', false, 4), 4), false);
  assert.equal(isFeatEligibleForProgression(feat('Boon of Spell Recall', 'Epic Boon Feat', 'Level 19+, Spellcasting Feature', false, 19), 20, { epicBoon: true }), false);
  assert.equal(isFeatEligibleForProgression(feat('Alert', 'Origin Feat'), 4, { existingNames: ['alert'] }), false);
  assert.equal(isFeatEligibleForProgression(feat('Skilled', 'Origin Feat', '', true), 4, { existingNames: ['Skilled'] }), true);
});

test('feat mechanics contract validates typed effects and refuses unsupported automation claims', () => {
  const manual = {
    version: 1,
    support: 'manual',
    effects: [{ id: 'increase', type: 'ability-score-increase', parameters: { choiceId: 'ability', totalIncrease: 2, maxScore: 20 } }],
    choices: [{ id: 'ability', type: 'ability', count: 2, options: ['str', 'dex', 'con', 'int', 'wis', 'cha'], parameters: { allocation: 'one-plus-two-or-two-plus-one', required: 1, maxScore: 20 } }],
  };
  assert.deepEqual(validateFeatMechanics(manual), { valid: true, support: 'manual', errors: [] });
  assert.deepEqual(featMechanicsSupport({ description: 'text only' }), {
    valid: false, support: 'manual', errors: ['mechanics-not-structured'],
  });
  assert.equal(validateFeatMechanics({ ...manual, support: 'automatic' }).valid, true);
  const unsupportedAutomatic = validateFeatMechanics({ ...manual, support: 'automatic', effects: [{ ...manual.effects[0], type: 'unknown' }] });
  assert.equal(unsupportedAutomatic.valid, false);
  assert.equal(unsupportedAutomatic.support, 'manual');
  assert.ok(unsupportedAutomatic.errors.includes('runtime-effect-handlers-not-verified'));
  assert.ok(validateFeatMechanics({ ...manual, effects: [{ ...manual.effects[0], id: '' }] }).errors.includes('effect-id-required'));
  assert.equal(validateFeatMechanics(FEAT_MECHANICS_BY_IDENTIFIER['ability-score-improvement']).valid, true);
  assert.equal(validateFeatMechanics(FEAT_MECHANICS_BY_IDENTIFIER.skilled).valid, true);
});

test('Skilled typed handler grants exactly three distinct available skill/tool proficiencies', () => {
  const data = { identifier: 'skilled' };
  const choices = ['skill:perception', 'skill:survival', "tool:Thieves' Tools"];
  const grants = resolveFeatMechanicChoices(data, choices);
  assert.equal(grants.valid, true);
  assert.deepEqual(grants.skills, ['perception', 'survival']);
  assert.deepEqual(grants.tools, ["Thieves' Tools"]);
  assert.equal(resolveFeatMechanicChoices(data, ['skill:perception']).missing, true);
  assert.equal(resolveFeatMechanicChoices(data, ['skill:perception', 'skill:perception', 'tool:Gaming Set: Dice']).valid, false);
  assert.equal(resolveFeatMechanicChoices(data, choices, { skills: { perception: { proficient: true } } }).errors[0], 'proficiency-already-owned');
  assert.equal(resolveFeatMechanicChoices(data, choices, { tools: ["Thieves' Tools"] }).errors[0], 'proficiency-already-owned');
  assert.equal(resolveFeatMechanicChoices(data, ['skill:not-a-skill', 'skill:survival', 'tool:Gaming Set: Dice']).valid, false);
  assert.equal(TOOL_PROFICIENCY_OPTIONS.length > 30, true);
});

test('progression applies structured proficiency feat choices to its deterministic result', () => {
  const plan = buildProgressionPlan('wizard', 0, 4);
  const subclass = plan.choices.find((choice) => choice.kind === 'subclass');
  const asi = plan.choices.find((choice) => choice.kind === 'ability-improvement');
  const feat = { identifier: 'skilled' };
  const result = resolveProgressionChoices(plan, { int: 12 }, {
    [subclass.id]: { selected: true, name: 'Evoker' },
    [asi.id]: { mode: 'feat', featName: 'Skilled', featChoices: ['skill:arcana', 'skill:history', 'tool:Gaming Set: Dice'] },
  }, { [asi.id]: feat });
  assert.equal(result.valid, true);
  assert.deepEqual(result.skills, ['arcana', 'history']);
  assert.deepEqual(result.tools, ['Gaming Set: Dice']);
});

test('ability increase handler enforces one +2 or two distinct +1 choices and cumulative cap', () => {
  const single = resolveAbilityScoreIncrease({ int: 18 }, { first: 'int', second: '' });
  assert.deepEqual(single.bumps, { int: 2 });
  assert.equal(single.valid, true);
  const pair = resolveAbilityScoreIncrease({ int: 18, wis: 13 }, { first: 'int', second: 'wis' });
  assert.deepEqual(pair.bumps, { int: 1, wis: 1 });
  assert.equal(pair.scores.int, 19);
  assert.equal(pair.scores.wis, 14);
  assert.equal(resolveAbilityScoreIncrease({ int: 19 }, { first: 'int', second: '' }).valid, false);
  assert.equal(resolveAbilityScoreIncrease({ int: 10 }, { first: 'int', second: 'int' }).errors[0].code, 'invalid-ability-pair');
});

test('background mechanics map every local SRD record and validate score, skill, and tool choices', () => {
  const db = new DatabaseSync(new URL('../packs/backgrounds.sqlite', import.meta.url), { readOnly: true });
  try {
    const entries = db.prepare('select id, name, data from entries').all();
    assert.equal(entries.length, Object.keys(BACKGROUND_MECHANICS_BY_IDENTIFIER).length);
    for (const entry of entries) {
      const data = JSON.parse(entry.data);
      const mechanics = BACKGROUND_MECHANICS_BY_IDENTIFIER[data.identifier];
      assert.ok(mechanics, `missing structured background: ${entry.name}`);
      // SRD 5.2 .dev/srd5.2_markdown/character-origins.md "Background Descriptions": each **Ability Scores:** line ends without a period, so read to end of line.
      const abilityText = data.description.match(/Ability Scores:\s*([^\n]*)/)?.[1] || '';
      const sourceAbilities = abilityText.match(/Intelligence|Wisdom|Charisma|Dexterity|Constitution|Strength/g)?.map((label) => Object.entries(ABILITY_LABELS).find(([, value]) => value === label)?.[0]);
      assert.deepEqual(mechanics.abilities, sourceAbilities);
      const skillText = data.description.match(/Skill Proficiencies:\s*([^\n]+)/)?.[1] || '';
      const sourceSkills = skillText.split(/ and /).map((label) => Object.entries(SKILL_LABELS).find(([, value]) => value === label)?.[0]);
      assert.deepEqual(mechanics.skills, sourceSkills);
      // SRD 5.2 character-origins.md: "(see \"Feats\")" is a cross-reference to the Feats section, not part of the feat name.
      const featName = data.description.match(/Feat:\s*([^\n]+)/)?.[1]?.replace(/\s*\(see "Feats"\)$/, '');
      assert.equal(mechanics.feat, featName);
      const toolText = data.description.match(/Tool Proficiency:\s*([^\n]+)/)?.[1];
      if (toolText.includes('Gaming Set')) assert.ok(mechanics.toolOptions?.length);
      else assert.deepEqual(mechanics.tools, [toolText]);
      const choice = { first: mechanics.abilities[0], second: mechanics.abilities[1], tool: mechanics.toolOptions?.[0] };
      const resolved = resolveBackgroundChoices(mechanics, choice);
      assert.equal(resolved.valid, true);
      assert.deepEqual(resolved.bumps, { [mechanics.abilities[0]]: 2, [mechanics.abilities[1]]: 1 });
      assert.equal(resolveBackgroundChoices(mechanics, { ...choice, first: mechanics.abilities[0], second: mechanics.abilities[0] }).valid, false);
      assert.equal(resolveBackgroundChoices(mechanics, { ...choice, spread: true }).valid, true);
    }
  } finally {
    db.close();
  }
});

test('background equipment packages resolve exact SRD quantities, required variants, and 50 GP alternative', () => {
  const expected = {
    acolyte: { gp: 8, names: ["Calligrapher's Supplies", 'Book (prayers)', 'Holy Symbol (Amulet)', 'Parchment', 'Robe'], quantities: [1, 1, 1, 10, 1] },
    criminal: { gp: 16, names: ['Dagger', "Thieves' Tools", 'Crowbar', 'Pouch', "Clothes, Traveler's"], quantities: [2, 1, 1, 2, 1] },
    sage: { gp: 8, names: ['Quarterstaff', "Calligrapher's Supplies", 'Book (history)', 'Parchment', 'Robe'], quantities: [1, 1, 1, 8, 1] },
    soldier: { gp: 14, names: ['Spear', 'Shortbow', 'Arrows', 'Gaming Set: Dice', "Healer's Kit", 'Quiver', "Clothes, Traveler's"], quantities: [1, 1, 20, 1, 1, 1, 1] },
  };
  for (const [background, contract] of Object.entries(expected)) {
    assert.deepEqual(backgroundEquipmentPackageOptions(background), ['A', 'B']);
    const resolved = resolveBackgroundEquipment(background, {
      package: 'A', holySymbol: 'amulet', tool: 'Gaming Set: Dice',
    });
    assert.equal(resolved.valid, true, background);
    assert.equal(resolved.gp, contract.gp);
    assert.deepEqual(resolved.items.map(({ name }) => name), contract.names);
    assert.deepEqual(resolved.items.map(({ data }) => data.quantity), contract.quantities);
    assert.ok(resolved.items.every(({ type, data }) => type === data.type && typeof data.identifier === 'string'));
    const cash = resolveBackgroundEquipment(background, { package: 'B' });
    assert.deepEqual({ valid: cash.valid, gp: cash.gp, items: cash.items }, { valid: true, gp: 50, items: [] });
  }
  assert.equal(resolveBackgroundEquipment('acolyte', { package: 'A' }).valid, false);
  assert.equal(resolveBackgroundEquipment('soldier', { package: 'A' }).valid, false);
  assert.equal(resolveBackgroundEquipment('soldier', { package: 'A', tool: 'unknown' }).valid, false);
  assert.equal(resolveBackgroundEquipment('unknown', { package: 'A' }).valid, false);
  assert.equal(STARTING_EQUIPMENT_CATALOG.dagger.damage.formula, '1d4');
  assert.equal(STARTING_EQUIPMENT_CATALOG.shortbow.ammunitionType, 'arrows');
});

test('Bard class starting equipment resolves both SRD packages and requires an instrument for package A', () => {
  assert.deepEqual(classStartingEquipmentPackageOptions('bard'), ['A', 'B']);
  assert.deepEqual(classStartingEquipmentPackageOptions('fighter'), ['A', 'B', 'C']);
  assert.equal(classStartingInstrumentOptions().length, 10);
  assert.equal(resolveClassStartingEquipment('bard', {}).valid, false);
  assert.equal(resolveClassStartingEquipment('bard', { package: 'A' }).valid, false);
  const packageA = resolveClassStartingEquipment('bard', { package: 'A', instrument: 'lute' });
  assert.equal(packageA.valid, true);
  assert.equal(packageA.gp, 19);
  assert.deepEqual(packageA.items.map(({ name, data }) => [name, data.quantity]), [
    ['Leather Armor', 1], ['Dagger', 2], ['Musical Instrument: Lute', 1], ["Entertainer's Pack", 1], ['Backpack', 1],
    ['Bedroll', 1], ['Bell', 1], ['Lantern, Bullseye', 1], ['Costume', 3], ['Mirror', 1],
    ['Oil', 8], ['Rations', 9], ['Tinderbox', 1], ['Waterskin', 1],
  ]);
  assert.ok(packageA.items.every(({ type, data }) => type === data.type && data.identifier));
  assert.equal(packageA.items.find(({ name }) => name.includes('Lute')).data.toolType, 'musical');
  const pack = packageA.items.find(({ type }) => type === 'container');
  assert.equal(pack.key, 'bard-entertainers-pack');
  assert.ok(packageA.items.filter(({ containerOperationKey }) => containerOperationKey).every(({ containerOperationKey }) => containerOperationKey === pack.key));
  assert.equal(CLASS_STARTING_EQUIPMENT_CATALOG.dagger.damage.formula, '1d4');
  assert.deepEqual(resolveClassStartingEquipment('bard', { package: 'B' }), {
    valid: true, errors: [], gp: 90, items: [], toolProficiencies: [],
  });
});

test('all twelve class equipment packages match their SRD package choices and have resolvable typed contents', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const classes = {
    barbarian: ['Barbarian', ['A', 'B'], { A: 15, B: 75 }],
    bard: ['Bard', ['A', 'B'], { A: 19, B: 90 }],
    cleric: ['Cleric', ['A', 'B'], { A: 7, B: 110 }],
    druid: ['Druid', ['A', 'B'], { A: 9, B: 50 }],
    fighter: ['Fighter', ['A', 'B', 'C'], { A: 4, B: 11, C: 155 }],
    monk: ['Monk', ['A', 'B'], { A: 11, B: 50 }],
    paladin: ['Paladin', ['A', 'B'], { A: 9, B: 150 }],
    ranger: ['Ranger', ['A', 'B'], { A: 7, B: 150 }],
    rogue: ['Rogue', ['A', 'B'], { A: 8, B: 100 }],
    sorcerer: ['Sorcerer', ['A', 'B'], { A: 28, B: 50 }],
    warlock: ['Warlock', ['A', 'B'], { A: 15, B: 100 }],
    wizard: ['Wizard', ['A', 'B'], { A: 5, B: 55 }],
  };
  for (const [classIdentifier, [className, options, cashPackages]] of Object.entries(classes)) {
    const section = source.match(new RegExp(`## ${className}\\s+([\\s\\S]*?)(?=\\n## |$)`))?.[1] || '';
    const packageText = section.match(/<td>Starting Equipment<\/td>\s*<td>([^<]+)<\/td>/)?.[1] || '';
    const choicePhrase = options.length === 2 ? `${options[0]} or ${options[1]}` : `${options[0]}, ${options[1]}, or ${options[2]}`;
    assert.ok(packageText.includes(`Choose ${choicePhrase}:`), className);
    assert.deepEqual(classStartingEquipmentPackageOptions(classIdentifier), options, className);
    for (const packageChoice of options) {
      const selection = { package: packageChoice, instrument: 'lute', tool: 'artisans-weaver', holySymbol: 'amulet' };
      const result = resolveClassStartingEquipment(classIdentifier, selection);
      assert.equal(result.valid, true, `${className} package ${packageChoice}: ${result.errors.join(',')}`);
      assert.equal(result.gp, cashPackages[packageChoice]);
      assert.ok(result.items.every(({ name, type, data }) => name && type === data.type && data.identifier && data.quantity > 0));
      const keys = new Set(result.items.filter(({ key }) => key).map(({ key }) => key));
      for (const child of result.items.filter(({ containerOperationKey }) => containerOperationKey)) {
        assert.ok(keys.has(child.containerOperationKey), `${className} package ${packageChoice} has an orphan pack item`);
      }
    }
  }
  assert.equal(resolveClassStartingEquipment('bard', { package: 'A' }).valid, false);
  assert.equal(resolveClassStartingEquipment('monk', { package: 'A' }).valid, false);
  assert.equal(resolveClassStartingEquipment('cleric', { package: 'A' }).valid, false);
  const monkChoice = classStartingEquipmentChoices('monk')[0];
  assert.equal(monkChoice.field, 'tool');
  assert.ok(monkChoice.options.some(([value]) => value === 'artisans-weaver'));
  assert.ok(monkChoice.options.some(([value]) => value === 'instrument:flute'));
  const artisanChoice = resolveClassStartingEquipment('monk', { package: 'A', tool: 'artisans-weaver' });
  assert.deepEqual(artisanChoice.toolProficiencies, ["Weaver's Tools"]);
  const instrumentChoice = resolveClassStartingEquipment('monk', { package: 'A', tool: 'instrument:flute' });
  assert.deepEqual(instrumentChoice.toolProficiencies, ['Musical Instrument: Flute']);
  assert.ok(instrumentChoice.items.some(({ name }) => name === 'Musical Instrument: Flute'));
});

test('creation journal resumes confirmed work and never retries an unknown or interrupted write', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const journal = createCreationJournal({
    worldId: 'world-test', actorName: 'Example', actorData: { details: { level: 1 } },
    operations: [{ kind: 'item', label: 'Race', payload: { name: 'Elf', type: 'race', data: {} } }],
  });
  writeCreationJournal(journal, storage);
  let actorWrites = 0;
  let itemWrites = 0;
  await assert.rejects(runCreationJournal(journal, {
    storage,
    createActor: async () => { actorWrites++; return { id: 'actor-1' }; },
    createItem: async () => { itemWrites++; throw new Error('response lost'); },
  }), /response lost/);
  assert.equal(actorWrites, 1);
  assert.equal(itemWrites, 1);
  assert.equal(journal.actor.status, 'complete');
  assert.equal(journal.operations[0].status, 'unknown');
  assert.equal(creationJournalCanResume(readCreationJournal('world-test', storage)), false);
  await assert.rejects(runCreationJournal(journal, {
    storage,
    createActor: async () => { actorWrites++; return { id: 'actor-2' }; },
    createItem: async () => { itemWrites++; return { id: 'item-2' }; },
  }), /unknown outcome/);
  assert.equal(actorWrites, 1);
  assert.equal(itemWrites, 1);

  const resumable = createCreationJournal({
    worldId: 'world-resume', actorName: 'Confirmed', actorData: {},
    operations: [{ kind: 'item', label: 'Background', payload: { name: 'Sage', type: 'background', data: {} } }],
  });
  resumable.actor = { status: 'complete', id: 'actor-2' };
  resumable.status = 'in-progress';
  writeCreationJournal(resumable, storage);
  assert.equal(creationJournalCanResume(resumable), true);
  await runCreationJournal(resumable, {
    storage,
    createItem: async (payload) => ({ id: `${payload.actorId}-item` }),
  });
  assert.equal(resumable.status, 'complete');
  assert.equal(resumable.operations[0].status, 'complete');
  clearCreationJournal('world-resume', storage);
  assert.equal(readCreationJournal('world-resume', storage), null);

  const interrupted = createCreationJournal({ worldId: 'world-crash', actorName: 'Interrupted', actorData: {}, operations: [] });
  interrupted.actor.status = 'in-flight';
  writeCreationJournal(interrupted, storage);
  assert.equal(creationJournalCanResume(readCreationJournal('world-crash', storage)), false);
});

test('creation journal can configure an existing classless actor without creating a duplicate', async () => {
  const writes = [];
  const stored = new Map();
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  };
  const journal = createCreationJournal({
    worldId: 'world-existing-setup', actorName: 'Existing Hero', actorId: 'actor-existing', actorData: { details: { level: 1 } },
    operations: [
      { kind: 'item', label: 'Wizard class', payload: { name: 'Wizard', type: 'class', data: { levels: 1 } } },
      { kind: 'actor-update', label: 'Update existing character', payload: { name: 'Existing Hero', systemData: { details: { level: 1 } } } },
    ],
  });
  await runCreationJournal(journal, {
    storage,
    createActor: async () => { throw new Error('must not create an actor'); },
    createItem: async (payload) => { writes.push(['item', payload.actorId]); return { id: 'class-item' }; },
    updateActor: async (actorId, payload) => { writes.push(['actor', actorId, payload.name]); return {}; },
  });
  assert.deepEqual(writes, [['item', 'actor-existing'], ['actor', 'actor-existing', 'Existing Hero']]);
  assert.equal(journal.actor.id, 'actor-existing');
  assert.equal(journal.actor.existing, true);
  assert.equal(journal.status, 'complete');
  assert.ok(journal.operations.every((operation) => operation.status === 'complete'));
});

test('class setup wizard opens for classless actors and for actors with pending setup recovery', () => {
  const pending = { actor: { id: 'actor-1' }, status: 'needs-review' };
  assert.equal(actorSetupWizardRequired('actor-1', false, null), true);
  assert.equal(actorSetupWizardRequired('actor-1', true, pending), true);
  assert.equal(actorSetupWizardRequired('actor-2', true, pending), false);
  assert.equal(actorSetupWizardRequired('actor-1', true, { actor: { id: 'actor-1' }, status: 'complete' }), false);
  assert.equal(actorSetupWizardRequired(null, false, null), false);
});

test('creation journal resolves dependent pack contents only after the parent container is confirmed', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const journal = createCreationJournal({
    worldId: 'world-container-test', actorName: 'Example', actorData: { details: { level: 1 } },
    operations: [
      { key: 'explorer-pack', kind: 'item', label: 'Explorer’s Pack', payload: { name: 'Explorer’s Pack', type: 'container', data: { identifier: 'explorers-pack' } } },
      { kind: 'item', label: 'Backpack', containerOperationKey: 'explorer-pack', payload: { name: 'Backpack', type: 'item', data: { identifier: 'backpack' } } },
    ],
  });
  const createdPayloads = [];
  await runCreationJournal(journal, {
    storage,
    createActor: async () => ({ id: 'actor-container' }),
    createItem: async (payload) => {
      createdPayloads.push(payload);
      return { id: createdPayloads.length === 1 ? 'pack-container-id' : 'backpack-id' };
    },
  });
  assert.equal(createdPayloads[0].type, 'container');
  assert.equal(createdPayloads[1].data.container, 'pack-container-id');
  assert.equal(journal.operations[1].status, 'complete');

  const resumed = createCreationJournal({
    worldId: 'world-container-resume', actorName: 'Example', actorData: { details: { level: 1 } },
    operations: [
      { key: 'pack', kind: 'item', label: 'Pack', payload: { name: 'Pack', type: 'container', data: {} } },
      { kind: 'item', label: 'Contents', containerOperationKey: 'pack', payload: { name: 'Contents', type: 'item', data: {} } },
    ],
  });
  resumed.actor = { status: 'complete', id: 'actor-resume' };
  resumed.operations[0] = { ...resumed.operations[0], status: 'complete', id: 'confirmed-pack' };
  const resumedPayloads = [];
  await runCreationJournal(resumed, {
    storage,
    createItem: async (payload) => { resumedPayloads.push(payload); return { id: 'child' }; },
  });
  assert.equal(resumedPayloads[0].data.container, 'confirmed-pack');
  assert.throws(() => createCreationJournal({
    worldId: 'world-invalid-container', actorName: 'Example', actorData: {},
    operations: [{ kind: 'item', label: 'Orphan', containerOperationKey: 'missing', payload: { type: 'item' } }],
  }), /missing or invalid parent container/);
});

test('Magic Initiate choices match the same SRD spell list and distinct cantrips', () => {
  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  try {
    const entries = db.prepare('select id, name, data from entries').all()
      .map((row) => ({ id: row.id, name: row.name, data: JSON.parse(row.data) }));
    for (const list of ['cleric', 'druid', 'wizard']) {
      const cantrips = entries.filter((entry) => entry.data.spellLevel === 0 && entry.data.classes.includes(list));
      const firstLevel = entries.find((entry) => entry.data.spellLevel === 1 && entry.data.classes.includes(list));
      assert.ok(cantrips.length >= 2, `${list} has two local cantrips`);
      assert.ok(firstLevel, `${list} has a local level 1 spell`);
      const selected = resolveMagicInitiateChoices('Magic Initiate', {
        list, ability: 'wis', cantrips: [cantrips[0].id, cantrips[1].id], spell: firstLevel.id,
      }, entries);
      assert.equal(selected.valid, true, list);
      assert.equal(selected.spells.length, 3);
      assert.ok(selected.spells.every((spell) => spell.data.classes.includes(list)));
      const cantripData = buildMagicInitiateSpellData(selected.spells[0], selected);
      const levelOneData = buildMagicInitiateSpellData(selected.spells[2], selected);
      assert.equal(cantripData.prepared, true);
      assert.equal(cantripData.uses, undefined);
      assert.deepEqual(levelOneData.uses, { value: 1, max: 1, recovery: 'lr', amount: 1, type: 'feat', recharge: 0 });
      assert.deepEqual(levelOneData.magicInitiate, { version: 1, list, ability: 'wis', source: 'magic-initiate-level-1', freeCast: true });
      assert.equal(spellCountsTowardPreparedLimit(levelOneData), false);
      assert.equal(spellCountsTowardPreparedLimit({ spellLevel: 1, prepared: true }), true);
      assert.equal(resolveMagicInitiateChoices('Magic Initiate (Cleric)', {
        list: 'wizard', ability: 'int', cantrips: [cantrips[0].id, cantrips[1].id], spell: firstLevel.id,
      }, entries).valid, false);
      assert.deepEqual(magicInitiateAllowedLists(`Magic Initiate (${list})`), [list]);
    }
    const cantrips = entries.filter((entry) => entry.data.spellLevel === 0 && entry.data.classes.includes('cleric'));
    const firstLevel = entries.find((entry) => entry.data.spellLevel === 1 && entry.data.classes.includes('cleric'));
    assert.equal(resolveMagicInitiateChoices('Magic Initiate', {
      list: 'cleric', ability: 'wis', cantrips: [cantrips[0].id, cantrips[0].id], spell: firstLevel.id,
    }, entries).valid, false);
  } finally { db.close(); }
});

test('Magic Initiate spell ability overrides only that spell and uses standard save DC math', () => {
  const data = {
    abilities: { int: { value: 18, modifier: 4 }, wis: { value: 14, modifier: 2 }, cha: { value: 10, modifier: 0 } },
    attributes: { prof: { value: 3 }, spellcasting: { ability: 'int', dc: 15, attackBonus: 7 } },
  };
  assert.deepEqual(spellcastingStats(data, { spellcastingAbility: 'wis' }), { ability: 'wis', dc: 13, attackBonus: 5 });
  assert.deepEqual(spellcastingStats(data, {}), { ability: 'int', dc: 15, attackBonus: 7 });
});

test('Bard, Cleric, and Druid spell counts match all SRD 5.2 class table levels', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  try {
    const spells = db.prepare('select id,name,data from entries').all().map((row) => ({ id: row.id, name: row.name, data: JSON.parse(row.data) }));
    for (const className of ['Bard', 'Cleric', 'Druid']) {
      const classId = className.toLocaleLowerCase();
      const start = source.indexOf(`### ${className} Class Features`);
      const tableStart = source.indexOf('<table>', start);
      const tableEnd = source.indexOf('</table>', tableStart);
      const rows = source.slice(tableStart, tableEnd).split('<tr>')
        .map((row) => row.split('</tr>')[0].split('<td>').slice(1).map((cell) => cell.split('</td>')[0].replace(/<[^>]*>/g, '').trim()))
        .filter((row) => row[0] && !Number.isNaN(Number(row[0])) && row.length > 10);
      assert.equal(rows.length, 20);
      for (const row of rows) {
        const result = classSpellcastingAtLevel(classId, Number(row[0]));
        assert.equal(result.cantrips, Number(row[4]), `${className} ${row[0]} cantrips`);
        assert.equal(result.prepared, Number(row[5]), `${className} ${row[0]} prepared spells`);
        const sourceSlots = row.slice(6, 15).map((value) => value === '—' ? 0 : Number(value));
        assert.equal(result.maximumSpellLevel, sourceSlots.reduce((highest, count, index) => count > 0 ? index + 1 : highest, 0), `${className} ${row[0]} highest slot`);
        assert.equal(PREPARED_CLASS_SPELLCASTING[classId].cantrips[Number(row[0]) - 1], Number(row[4]));
      }
    }
    const bardCantrips = spells.filter((entry) => entry.data.classes.includes('bard') && entry.data.spellLevel === 0);
    const bardPrepared = spells.filter((entry) => entry.data.classes.includes('bard') && entry.data.spellLevel >= 1);
    const bardSelected = resolvePreparedClassSpellChoices('bard', 20, spells, {
      cantrips: bardCantrips.slice(0, 4).map((entry) => entry.id), prepared: bardPrepared.slice(0, 22).map((entry) => entry.id),
    });
    assert.equal(bardSelected.valid, true);
    assert.equal(bardSelected.prepared.length, 22);
    assert.equal(resolvePreparedClassSpellChoices('bard', 20, spells, {
      cantrips: bardCantrips.slice(0, 4).map((entry) => entry.id), prepared: bardPrepared.slice(0, 21).map((entry) => entry.id),
    }).valid, false, 'Bard preparation must match the table exactly');
    const clericCantrips = spells.filter((entry) => entry.data.classes.includes('cleric') && entry.data.spellLevel === 0);
    const clericLevel1 = spells.filter((entry) => entry.data.classes.includes('cleric') && entry.data.spellLevel === 1);
    const selected = resolvePreparedClassSpellChoices('cleric', 1, spells, {
      cantrips: clericCantrips.slice(0, 3).map((entry) => entry.id), prepared: clericLevel1.slice(0, 4).map((entry) => entry.id),
    });
    assert.equal(selected.valid, true);
    assert.equal(selected.progression.prepared, 4);
    assert.equal(resolvePreparedClassSpellChoices('cleric', 1, spells, {
      cantrips: clericCantrips.slice(0, 3).map((entry) => entry.id), prepared: clericLevel1.slice(0, 5).map((entry) => entry.id),
    }).valid, false);
    assert.equal(resolvePreparedClassSpellChoices('cleric', 1, spells, {
      cantrips: clericCantrips.slice(0, 2).map((entry) => entry.id), prepared: [],
    }).valid, false);
    const druidCantrips = spells.filter((entry) => entry.data.classes.includes('druid') && entry.data.spellLevel === 0);
    const druidLevel1 = spells.filter((entry) => entry.data.classes.includes('druid') && entry.data.spellLevel === 1);
    const druidSelected = resolvePreparedClassSpellChoices('druid', 1, spells, {
      cantrips: druidCantrips.slice(0, 2).map((entry) => entry.id), prepared: druidLevel1.slice(0, 2).map((entry) => entry.id),
    });
    assert.equal(druidSelected.valid, true, 'Druid may prepare fewer than the maximum');
    assert.equal(druidSelected.prepared.length, 2);
    assert.equal(classSpellcastingAtLevel('barbarian', 1), null);
  } finally { db.close(); }
});

test('Sorcerer creation counts and spell-slot gates match every SRD 5.2 class table level', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const start = source.indexOf('### Sorcerer Class Features');
  const end = source.indexOf('### Sorcerer Spell List', start);
  const section = source.slice(start, end);
  const tbody = section.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
  const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(([, cell]) => cell.trim())).filter((row) => /^\d+$/.test(row[0] || ''));
  assert.equal(rows.length, 20, 'all Sorcerer class levels are present in the local source');
  for (const row of rows) {
    const level = Number(row[0]);
    const progression = classSpellcastingAtLevel('sorcerer', level);
    assert.equal(progression.cantrips, Number(row[4]), `Sorcerer ${level} cantrips`);
    assert.equal(progression.prepared, Number(row[5]), `Sorcerer ${level} prepared spells`);
    const maxSpellLevel = row.slice(6).reduce((last, value, index) => value !== '—' && Number(value) > 0 ? index + 1 : last, 0);
    assert.equal(progression.maximumSpellLevel, maxSpellLevel, `Sorcerer ${level} maximum spell level`);
  }

  const entries = [
    { id: 's-cantrip-1', data: { classes: ['sorcerer'], spellLevel: 0 } },
    { id: 's-cantrip-2', data: { classes: ['sorcerer'], spellLevel: 0 } },
    { id: 's-cantrip-3', data: { classes: ['sorcerer'], spellLevel: 0 } },
    { id: 's-cantrip-4', data: { classes: ['sorcerer'], spellLevel: 0 } },
    { id: 's-level-1-a', data: { classes: ['sorcerer'], spellLevel: 1 } },
    { id: 's-level-1-b', data: { classes: ['sorcerer'], spellLevel: 1 } },
    { id: 's-level-2', data: { classes: ['sorcerer'], spellLevel: 2 } },
  ];
  assert.equal(resolvePreparedClassSpellChoices('sorcerer', 1, entries, {
    cantrips: entries.slice(0, 4).map((entry) => entry.id), prepared: ['s-level-1-a', 's-level-1-b'],
  }).valid, true, 'level-1 Sorcerer selects exactly four cantrips and two level-1 spells');
  assert.equal(resolvePreparedClassSpellChoices('sorcerer', 1, entries, {
    cantrips: entries.slice(0, 4).map((entry) => entry.id), prepared: ['s-level-1-a', 's-level-1-b', 's-level-2'],
  }).valid, false, 'prepared spell count and maximum level are enforced');
});

test('Cleric and Druid Level Up asks only for spell choices newly granted by the next class level', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  for (const className of ['Cleric', 'Druid']) {
    const classId = className.toLocaleLowerCase();
    const start = source.indexOf(`### ${className} Class Features`);
    const tableStart = source.indexOf('<table>', start);
    const tableEnd = source.indexOf('</table>', tableStart);
    const rows = source.slice(tableStart, tableEnd).split('<tr>')
      .map((row) => row.split('</tr>')[0].split('<td>').slice(1).map((cell) => cell.split('</td>')[0].replace(/<[^>]*>/g, '').trim()))
      .filter((row) => row[0] && !Number.isNaN(Number(row[0])) && row.length > 10);
    for (let level = 2; level <= 20; level += 1) {
      const choices = classSpellcastingLevelUpAtLevel(classId, level - 1, level);
      assert.equal(choices.newPreparedSpells, Number(rows[level - 1][5]) - Number(rows[level - 2][5]), `${className} ${level} prepared delta`);
      assert.equal(choices.newCantrips, Number(rows[level - 1][4]) - Number(rows[level - 2][4]), `${className} ${level} cantrip delta`);
    }
  }
  assert.equal(classSpellcastingLevelUpAtLevel('cleric', 1, 3), null, 'skip-level transitions are rejected');
  assert.equal(classSpellcastingLevelUpAtLevel('wizard', 1, 2), null, 'unsupported classes remain outside this handler');
});

test('Bard Level Up requires class-provenanced replacements and exact table deltas', () => {
  for (let level = 2; level <= 20; level += 1) {
    const progression = classSpellcastingLevelUpAtLevel('bard', level - 1, level);
    assert.equal(progression.newPreparedSpells, PREPARED_CLASS_SPELLCASTING.bard.prepared[level - 1] - PREPARED_CLASS_SPELLCASTING.bard.prepared[level - 2]);
    assert.equal(progression.newCantrips, PREPARED_CLASS_SPELLCASTING.bard.cantrips[level - 1] - PREPARED_CLASS_SPELLCASTING.bard.cantrips[level - 2]);
    assert.equal(progression.replacePreparedSpell, true);
    assert.equal(progression.replaceCantrip, true);
  }
  const prepared = Array.from({ length: 4 }, (_, index) => ({ id: `p${index}`, name: `Prepared ${index}`, system: {
    sourceClassIdentifier: 'bard', prepared: true, spellLevel: 1, classes: ['bard'],
  } }));
  const cantrips = Array.from({ length: 2 }, (_, index) => ({ id: `c${index}`, name: `Cantrip ${index}`, system: {
    sourceClassIdentifier: 'bard', prepared: false, spellLevel: 0, classes: ['bard'],
  } }));
  assert.equal(inspectBardSpellState(1, prepared, cantrips).valid, true);
  assert.equal(inspectBardSpellState(1, prepared.map((item) => ({ ...item, system: { ...item.system, sourceClassIdentifier: '' } })), cantrips).valid, false);
  assert.equal(inspectBardSpellState(1, prepared.slice(1), cantrips).valid, false);
});

test('Sorcerer Level Up requires exact new choices and both class-provenanced replacements', () => {
  for (let level = 2; level <= 20; level += 1) {
    const transition = classSpellcastingLevelUpAtLevel('sorcerer', level - 1, level);
    assert.ok(transition, `Sorcerer level ${level} has a contiguous progression`);
    assert.equal(transition.replacePreparedSpell, true);
    assert.equal(transition.replaceCantrip, true);
    assert.equal(transition.newPreparedSpells, Math.max(0, PREPARED_CLASS_SPELLCASTING.sorcerer.prepared[level - 1] - PREPARED_CLASS_SPELLCASTING.sorcerer.prepared[level - 2]));
    assert.equal(transition.newCantrips, Math.max(0, PREPARED_CLASS_SPELLCASTING.sorcerer.cantrips[level - 1] - PREPARED_CLASS_SPELLCASTING.sorcerer.cantrips[level - 2]));
  }
  const prepared = [
    { name: 'A', data: { classes: ['sorcerer'], sourceClassIdentifier: 'sorcerer', spellLevel: 1, prepared: true } },
    { name: 'B', data: { classes: ['sorcerer'], sourceClassIdentifier: 'sorcerer', spellLevel: 1, prepared: true } },
  ];
  const cantrips = Array.from({ length: 4 }, (_, index) => ({ name: `Cantrip ${index}`, data: { classes: ['sorcerer'], sourceClassIdentifier: 'sorcerer', spellLevel: 0 } }));
  assert.equal(inspectPreparedSpellState('sorcerer', 1, prepared, cantrips, true).valid, true);
  assert.equal(inspectPreparedSpellState('sorcerer', 1, prepared.slice(1), cantrips, true).valid, false, 'a missing prepared spell blocks an ambiguous migration');
  assert.equal(inspectPreparedSpellState('sorcerer', 1, prepared, cantrips.map((item) => ({ ...item, data: { ...item.data, sourceClassIdentifier: 'bard' } })), true).valid, false, 'cantrip provenance must match Sorcerer');
  assert.equal(classSpellcastingLevelUpAtLevel('sorcerer', 1, 3), null, 'skip-level transitions are rejected');
});

test('Warlock Pact Magic spell choices match every SRD table level without using full-caster slots', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const start = source.indexOf('### Warlock Class Features');
  const end = source.indexOf('### Warlock Spell List', start);
  const section = source.slice(start, end);
  const tbody = section.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
  const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(([, cell]) => cell.trim())).filter((row) => /^\d+$/.test(row[0] || ''));
  assert.equal(rows.length, 20);
  const spellEntries = [];
  for (const row of rows) {
    const level = Number(row[0]);
    const progression = classSpellcastingAtLevel('warlock', level);
    assert.equal(progression.cantrips, Number(row[4]), `Warlock ${level} cantrips`);
    assert.equal(progression.prepared, Number(row[5]), `Warlock ${level} prepared spells`);
    assert.equal(progression.maximumSpellLevel, Number(row[7]), `Warlock ${level} Pact Magic slot level`);
    assert.equal(pactMagicAtLevel(level).max, Number(row[6]), `Warlock ${level} Pact Magic slot count`);
    if (level > 1) {
      assert.equal(classSpellcastingLevelUpAtLevel('warlock', level - 1, level)?.replacePreparedSpell, true);
      assert.equal(classSpellcastingLevelUpAtLevel('warlock', level - 1, level)?.replaceCantrip, true);
    }
    if (level === 1) {
      spellEntries.push(...Array.from({ length: 2 }, (_, index) => ({ id: `w-cantrip-${index}`, data: { classes: ['warlock'], spellLevel: 0 } })));
      spellEntries.push(...Array.from({ length: 2 }, (_, index) => ({ id: `w-spell-${index}`, data: { classes: ['warlock'], spellLevel: 1 } })));
      spellEntries.push({ id: 'w-spell-2', data: { classes: ['warlock'], spellLevel: 2 } });
    }
  }
  assert.equal(resolvePreparedClassSpellChoices('warlock', 1, spellEntries, {
    cantrips: ['w-cantrip-0', 'w-cantrip-1'], prepared: ['w-spell-0', 'w-spell-1'],
  }).valid, true, 'level-1 Warlock starts with two cantrips and two eligible prepared spells');
  assert.equal(resolvePreparedClassSpellChoices('warlock', 1, spellEntries, {
    cantrips: ['w-cantrip-0', 'w-cantrip-1'], prepared: ['w-spell-0', 'w-spell-1', 'w-spell-2'],
  }).valid, false, 'Warlock cannot exceed the table count or Pact slot level');
  assert.equal(classSpellcastingAtLevel('warlock', 1).maximumSpellLevel, 1, 'Pact Magic does not use the full-caster slot table');
});

test('Warlock Mystic Arcanum circles, spell eligibility, and long-rest use state follow SRD progression', () => {
  assert.deepEqual([11, 13, 15, 17].map((level) => mysticArcanumCircleAtLevel('warlock', level)), [6, 7, 8, 9]);
  for (let level = 1; level <= 20; level += 1) {
    if (![11, 13, 15, 17].includes(level)) assert.equal(mysticArcanumCircleAtLevel('warlock', level), 0);
  }
  assert.equal(mysticArcanumCircleAtLevel('wizard', 11), 0);
  assert.equal(isValidMysticArcanumSpell({ spellLevel: 6, classes: ['warlock'] }, 6), true);
  assert.equal(isValidMysticArcanumSpell({ spellLevel: 5, classes: ['warlock'] }, 6), false);
  assert.equal(isValidMysticArcanumSpell({ spellLevel: 6, classes: ['wizard'] }, 6), false);
  assert.deepEqual(mysticArcanumUseState(), { value: 1, max: 1, recovery: 'lr', recharge: 0 });
  assert.deepEqual(mysticArcanumUseState(0), { value: 0, max: 1, recovery: 'lr', recharge: 0 });
  assert.deepEqual(mysticArcanumUseState(5), { value: 1, max: 1, recovery: 'lr', recharge: 0 });
});

test('Cleric and Druid long-rest spell changes require exact class-list choices within available circles', () => {
  const candidates = Array.from({ length: 4 }, (_, index) => ({ id: `cleric-${index}`, name: `Spell ${index}`, data: { classes: ['cleric'], spellLevel: 1 } }));
  assert.equal(resolveLongRestPreparedSpellChoices('cleric', 1, candidates, candidates.map((entry) => entry.id)).valid, true);
  assert.equal(resolveLongRestPreparedSpellChoices('cleric', 1, candidates, candidates.slice(0, 3).map((entry) => entry.id)).valid, false, 'requires exact table count');
  assert.equal(resolveLongRestPreparedSpellChoices('cleric', 1, candidates, ['cleric-0', 'cleric-0', 'cleric-1', 'cleric-2']).valid, false, 'rejects duplicate ids');
  assert.equal(resolveLongRestPreparedSpellChoices('cleric', 1, candidates.map((entry) => ({ ...entry, data: { ...entry.data, classes: ['druid'] } })), candidates.map((entry) => entry.id)).valid, false, 'rejects off-list spells');
  assert.equal(resolveLongRestPreparedSpellChoices('druid', 1, candidates, candidates.map((entry) => entry.id)).valid, false, 'rejects a class-mismatched list');
});

test('Paladin and Ranger Long Rests allow at most one eligible class spell replacement', () => {
  const candidates = [
    { id: 'ranger-a', name: 'Cure Wounds', actorItem: true, data: { classes: ['ranger'], spellLevel: 1, prepared: true } },
    { id: 'ranger-b', name: 'Ensnaring Strike', actorItem: true, data: { classes: ['ranger'], spellLevel: 1, prepared: true } },
    { id: 'ranger-c', name: 'Fog Cloud', actorItem: false, data: { classes: ['ranger'], spellLevel: 1 } },
    { id: 'ranger-high', name: 'Conjure Animals', actorItem: false, data: { classes: ['ranger'], spellLevel: 3 } },
    { id: 'wizard-a', name: 'Shield', actorItem: false, data: { classes: ['wizard'], spellLevel: 1 } },
  ];
  const currentIds = ['ranger-a', 'ranger-b'];
  const valid = resolveLongRestPreparedSpellChoices('ranger', 1, candidates, currentIds, {
    currentPreparedIds: currentIds, replaceId: 'ranger-a', replacementId: 'ranger-c',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.selected.map((entry) => entry.id).sort(), ['ranger-b', 'ranger-c']);
  assert.equal(resolveLongRestPreparedSpellChoices('ranger', 1, candidates, currentIds, {
    currentPreparedIds: currentIds, replaceId: 'ranger-a', replacementId: 'ranger-high',
  }).valid, false, 'rejects a spell above the class slot level');
  assert.equal(resolveLongRestPreparedSpellChoices('ranger', 1, candidates, currentIds, {
    currentPreparedIds: currentIds, replaceId: 'ranger-a', replacementId: 'wizard-a',
  }).valid, false, 'rejects a spell outside the class list');
  assert.equal(resolveLongRestPreparedSpellChoices('ranger', 1, candidates, currentIds, {
    currentPreparedIds: currentIds, replaceId: 'ranger-a', replacementId: '',
  }).valid, false, 'requires both sides of an optional replacement');
  assert.equal(resolveLongRestPreparedSpellChoices('ranger', 1, candidates, currentIds, {
    currentPreparedIds: currentIds,
  }).valid, true, 'preserves all existing choices when no replacement is selected');
});

test('Wizard Long Rest preparation is limited to verified spellbook items and table capacity', () => {
  const book = Array.from({ length: 4 }, (_, index) => ({ id: `book-${index}`, name: `Wizard Spell ${index}`,
    actorItem: true, data: { classes: ['wizard'], spellLevel: 1, wizardSpellbook: true, sourceClassIdentifier: 'wizard' } }));
  assert.equal(resolveLongRestPreparedSpellChoices('wizard', 1, book, book.map((entry) => entry.id)).valid, true);
  assert.equal(resolveLongRestPreparedSpellChoices('wizard', 1, book.slice(0, 3), book.slice(0, 3).map((entry) => entry.id)).valid, false, 'requires the table prepared count');
  assert.equal(resolveLongRestPreparedSpellChoices('wizard', 1, book.map((entry) => ({ ...entry, data: { ...entry.data, wizardSpellbook: false } })), book.map((entry) => entry.id)).valid, false, 'does not prepare spells outside the book');
  assert.equal(resolveLongRestPreparedSpellChoices('wizard', 1, book.map((entry) => ({ ...entry, actorItem: false })), book.map((entry) => entry.id)).valid, false, 'requires owned spellbook items');
});

test('Multiclass Long Rest preparation validates every class separately before returning choices', () => {
  const classes = [{ classIdentifier: 'cleric', classLevel: 1 }, { classIdentifier: 'druid', classLevel: 1 }];
  const clericCandidates = Array.from({ length: 4 }, (_, index) => ({ id: `cleric-${index}`, name: index === 0 ? 'Detect Magic' : `Cleric ${index}`,
    data: { classes: ['cleric'], spellLevel: 1, sourceClassIdentifier: 'cleric' } }));
  const druidCandidates = Array.from({ length: 4 }, (_, index) => ({ id: `druid-${index}`, name: index === 0 ? 'Detect Magic' : `Druid ${index}`,
    data: { classes: ['druid'], spellLevel: 1, sourceClassIdentifier: 'druid' } }));
  const choices = [
    { classIdentifier: 'cleric', candidates: clericCandidates, selectedIds: clericCandidates.map((entry) => entry.id) },
    { classIdentifier: 'druid', candidates: druidCandidates, selectedIds: druidCandidates.map((entry) => entry.id) },
  ];
  const valid = resolveMulticlassLongRestPreparedSpellChoices(classes, choices);
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.choices.map((entry) => entry.classIdentifier), ['cleric', 'druid']);
  assert.equal(valid.choices[0].selected[0].name, valid.choices[1].selected[0].name,
    'the same spell name is valid as a distinct association with each class');
  assert.equal(resolveMulticlassLongRestPreparedSpellChoices(classes, choices.slice(0, 1)).valid, false,
    'requires a choice for every eligible class');
  assert.equal(resolveMulticlassLongRestPreparedSpellChoices(classes, [choices[0], choices[0]]).valid, false,
    'rejects duplicate class choice records');
  const invalidDruidChoice = { ...choices[1], selectedIds: choices[1].selectedIds.slice(0, 3) };
  assert.equal(resolveMulticlassLongRestPreparedSpellChoices(classes, [choices[0], invalidDruidChoice]).valid, false,
    'validates each class count before exposing any resolved changes');
});

test('Circle of the Land terrain is validated as part of the Druid Long Rest choice', () => {
  const classes = [{ itemId: 'druid-class', classIdentifier: 'druid', classLevel: 3, subclassName: 'Circle of the Land' }];
  const candidates = Array.from({ length: 6 }, (_, index) => ({ id: `druid-${index}`, name: `Druid ${index}`,
    data: { classes: ['druid'], spellLevel: 1, sourceClassIdentifier: 'druid' } }));
  const circleLandCandidates = ['Burning Hands', 'Fire Bolt', 'Blur'].map((name) => ({ name, data: { spellLevel: name === 'Fire Bolt' ? 0 : 1 } }));
  const choice = { classIdentifier: 'druid', candidates, selectedIds: candidates.map(({ id }) => id),
    circleLandTerrain: 'arid', circleLandCandidates };
  const valid = resolveMulticlassLongRestPreparedSpellChoices(classes, [choice]);
  assert.equal(valid.valid, true);
  assert.equal(valid.choices[0].itemId, 'druid-class');
  assert.equal(valid.choices[0].circleLandTerrain, 'arid');
  assert.equal(resolveMulticlassLongRestPreparedSpellChoices(classes, [{ ...choice, circleLandTerrain: '' }]).valid, false,
    'requires a land choice before completing the preparation selection');
});

test('initiative follows SRD ties by default and surprise cancels against advantage', () => {
  assert.equal(initiativeTieBreakBonus(false, 18), 0, 'SRD ties remain exact by default');
  assert.equal(initiativeTieBreakBonus(true, 18), 0.18, 'the optional house-rule setting remains available');
  assert.equal(combatInitiativeFormula(undefined, false), DEFAULT_INITIATIVE_FORMULA);
  assert.equal(combatInitiativeFormula(undefined, true), `${DEFAULT_INITIATIVE_FORMULA} + (@abilities.dex.value / 100)`);
  assert.equal(combatInitiativeFormula('1d20 + @custom', true), '1d20 + @custom', 'does not rewrite a custom tracker formula');
  assert.equal(resolveInitiativeAdvantage(0, 0, true), -1, 'surprise imposes disadvantage');
  assert.equal(resolveInitiativeAdvantage(1, 0, true), 0, 'surprise cancels Feral Instinct advantage');
  assert.equal(resolveInitiativeAdvantage(0, 1, true), 0, 'user-selected advantage cancels surprise');
  assert.equal(resolveInitiativeAdvantage(0, -1, true), -1, 'multiple disadvantage sources remain disadvantage');
});

test('Hide, Search, Study, and Influence use only their literal SRD skill and ability options', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/playing-the-game.md', import.meta.url), 'utf8');
  const actionStart = source.indexOf('**Actions**');
  const actionEnd = source.indexOf('</table>', actionStart);
  const actionTable = source.slice(actionStart, actionEnd);
  const glossary = readFileSync(new URL('../.dev/srd5.2_markdown/rules-glossary.md', import.meta.url), 'utf8');
  assert.ok(glossary.includes('succeed on a DC 15 Dexterity (Stealth) check'));
  for (const [name, checkText] of [
    ['Hide', 'Make a Dexterity (Stealth) check.'],
    ['Search', 'Make a Wisdom (Insight, Medicine, Perception, or Survival) check.'],
    ['Study', 'Make an Intelligence (Arcana, History, Investigation, Nature, or Religion) check.'],
  ]) {
    assert.ok(actionTable.includes(`<td>${name}</td>`));
    assert.ok(actionTable.includes(checkText));
  }
  assert.deepEqual(CORE_ACTION_SKILL_OPTIONS, {
    hide: ['stealth'],
    search: ['insight', 'medicine', 'perception', 'survival'],
    study: ['arcana', 'history', 'investigation', 'nature', 'religion'],
  });
  assert.deepEqual(CORE_ACTION_FIXED_DC, { hide: 15 });
  const systemData = { skills: Object.fromEntries(Object.values(CORE_ACTION_SKILL_OPTIONS).flat().map((key) => [key, { total: 0 }])) };
  for (const [action, skillKey, abilityKey] of [
    ['hide', 'stealth', 'dex'], ['search', 'perception', 'wis'], ['study', 'arcana', 'int'],
  ]) {
    assert.deepEqual(resolveCoreActionSkillCheck(action, skillKey, systemData), {
      valid: true, action, skillKey, abilityKey, total: 0, fixedDC: action === 'hide' ? 15 : null,
    });
  }
  assert.equal(resolveCoreActionSkillCheck('search', 'investigation', systemData).reason, 'skill-not-eligible');
  assert.equal(resolveCoreActionSkillCheck('influence', 'arcana', systemData).reason, 'unsupported-action');
  assert.equal(resolveCoreActionSkillCheck('hide', 'stealth', {}).reason, 'skill-data-unavailable');
  assert.equal(normalizeCoreActionContext('search', '  tracks near the north gate  '), 'tracks near the north gate');
  assert.deepEqual(coreActionContextMetadata('study', 'old journal'), { srd5eContext: 'old journal' });
  assert.deepEqual(coreActionContextMetadata('hide', 'should be ignored'), {});
  assert.equal(normalizeCoreActionContext('search', 'x'.repeat(200)).length, 160);
  const view = coreActionActivityView(systemData.skills, (key) => key);
  assert.equal(view.length, 3);
  assert.equal(view.find((activity) => activity.action === 'hide').skillOptions[0].selected, true);
  assert.equal(view.find((activity) => activity.action === 'hide').disabled, false);
  assert.equal(view.find((activity) => activity.action === 'search').contextLabel, 'SDR5E.CoreActions.ContextLabel');
  assert.equal(view.find((activity) => activity.action === 'study').contextPlaceholder, 'SDR5E.CoreActions.ContextPlaceholder');
  assert.equal(view.find((activity) => activity.action === 'hide').contextLabel, '');
});

test('Influence adjudication follows the literal SRD branches, supported checks, attitudes, and default DC', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/rules-glossary.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const influenceStart = source.indexOf('#### Influence [Action]');
  const influenceEnd = source.indexOf('#### Initiative', influenceStart);
  const section = source.slice(influenceStart, influenceEnd);
  assert.ok(section.includes('willing, unwilling, or hesitant'));
  assert.ok(section.includes("a default DC equal to 15 or the monster's Intelligence score, whichever is higher"));
  assert.ok(section.includes('wait 24 hours (or a duration set by the GM)'));
  assert.ok(source.includes('You have Advantage on an ability check to influence a Friendly creature'));
  assert.ok(source.includes('You have Disadvantage on an ability check to influence a Hostile creature'));
  assert.deepEqual(INFLUENCE_CHECK_OPTIONS, {
    deception: { abilityKey: 'cha', interaction: 'deceive' },
    intimidation: { abilityKey: 'cha', interaction: 'intimidate' },
    performance: { abilityKey: 'cha', interaction: 'amuse' },
    persuasion: { abilityKey: 'cha', interaction: 'persuade' },
    animalHandling: { abilityKey: 'wis', interaction: 'gently-coax' },
  });

  const actor = { skills: Object.fromEntries(Object.keys(INFLUENCE_CHECK_OPTIONS).map((key) => [key, { total: 4 }])) };
  assert.deepEqual(resolveInfluenceAdjudication({ branch: 'willing', targetName: 'Guard' }, actor), {
    valid: true, branch: 'willing', targetName: 'Guard', requiresCheck: false,
  });
  assert.equal(resolveInfluenceAdjudication({ branch: 'unwilling', targetName: 'Guard' }, actor).requiresCheck, false);
  const friendly = resolveInfluenceAdjudication({ branch: 'hesitant', targetName: 'Guard', attitude: 'friendly', skillKey: 'persuasion', intelligence: 18 }, actor);
  assert.equal(friendly.valid, true);
  assert.equal(friendly.defaultDC, 18);
  assert.equal(friendly.dc, 18);
  assert.equal(friendly.attitudeAdvantage, 1);
  const hostile = resolveInfluenceAdjudication({ branch: 'hesitant', targetName: 'Guard', attitude: 'hostile', skillKey: 'intimidation', intelligence: 8, dcOverride: 17 }, actor);
  assert.equal(hostile.defaultDC, 15);
  assert.equal(hostile.dc, 17);
  assert.equal(hostile.dcOverridden, true);
  assert.equal(hostile.attitudeAdvantage, -1);
  assert.equal(resolveInfluenceAdjudication({ branch: 'hesitant', targetName: 'Guard', attitude: 'indifferent', skillKey: 'stealth', intelligence: 10 }, actor).reason, 'skill-unavailable');
  assert.equal(resolveInfluenceAdjudication({ branch: 'hesitant', targetName: 'Guard', attitude: 'indifferent', skillKey: 'persuasion', intelligence: '' }, actor).reason, 'invalid-intelligence');
  assert.equal(composeInfluenceAdvantage(1, -1), 0, 'one Advantage source cancels one Disadvantage source');
  assert.equal(influenceFormView(actor).skillOptions.every((option) => option.available), true);
});

test('Help action records both SRD modes and restricts ability-check help to the helper’s actual proficiencies', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/rules-glossary.md', import.meta.url), 'utf8');
  const start = source.indexOf('#### Help [Action]');
  const end = source.indexOf('#### Heroic Inspiration', start);
  const helpText = source.slice(start, end).replace(/\s+/g, ' ');
  assert.ok(helpText.includes('one ally who is near enough'));
  assert.ok(helpText.includes('Advantage on the next ability check'));
  assert.ok(helpText.includes('within 5 feet of you'));
  assert.ok(helpText.includes('next attack roll by one of your allies against that enemy'));
  assert.ok(helpText.includes('The GM has final say'));

  const actor = {
    skills: { stealth: { proficient: true }, perception: { proficient: false } },
    proficiencies: { tools: ['Thieves’ Tools'] },
  };
  assert.deepEqual(helpProficiencyOptions(actor).map(({ kind, key }) => `${kind}:${key}`), ['skill:stealth', 'tool:Thieves’ Tools']);
  const ability = createHelpRecord({ mode: 'ability', allyName: 'Ari', proficiencyKind: 'skill', proficiencyKey: 'stealth' }, actor);
  assert.deepEqual(ability, { valid: true, record: { mode: 'ability', allyName: 'Ari', proficiencyKind: 'skill', proficiencyKey: 'stealth' } });
  assert.equal(createHelpRecord({ mode: 'ability', allyName: 'Ari', proficiencyKind: 'skill', proficiencyKey: 'perception' }, actor).reason, 'proficiency-unavailable');
  assert.equal(createHelpRecord({ mode: 'attack', allyName: 'Ari', enemyName: 'Ogre' }, actor).valid, true);
  assert.equal(createHelpRecord({ mode: 'attack', allyName: 'Ari' }, actor).reason, 'invalid-target');
  const records = appendHelpRecord([], ability.record);
  assert.deepEqual(appendHelpRecord(records, { mode: 'invalid' }), records);
  assert.equal(helpActionView(actor, records, (key) => key === 'SDR5E.HelpAction.AbilityRecord' ? 'Help {ally} with {proficiency}' : key).records[0].description.includes('Ari'), true);
  assert.deepEqual(removeHelpRecord(records, 0), []);
  assert.deepEqual(normalizeHelpRecords([{ mode: 'ability', allyName: ' ', proficiencyKind: 'skill', proficiencyKey: 'stealth' }]), []);
});

test('ordinary prepared spell toggles resolve capacity and eligibility from each source class', () => {
  const classes = [
    { type: 'class', data: { classIdentifier: 'cleric', levels: 3 } },
    { type: 'class', data: { classIdentifier: 'wizard', levels: 1 } },
  ];
  assert.equal(preparedSpellCapacityForClass('cleric', classes), 6);
  assert.equal(preparedSpellCapacityForClass('wizard', classes), 4);
  assert.equal(preparedSpellCapacityForClass('druid', classes), null);
  const clericSpell = { sourceClassIdentifier: 'cleric', classes: ['cleric'], spellLevel: 2 };
  assert.equal(spellEligibleForClassPreparation(clericSpell, 'cleric', classes), true);
  assert.equal(spellEligibleForClassPreparation({ ...clericSpell, spellLevel: 3 }, 'cleric', classes), false,
    'does not allow a class to prepare a spell above its own slot level');
  assert.equal(spellEligibleForClassPreparation({ ...clericSpell, classes: ['wizard'] }, 'cleric', classes), false,
    'requires the spell to appear on the source class list');
  assert.equal(spellEligibleForClassPreparation({ ...clericSpell, sourceClassIdentifier: 'wizard', classes: ['wizard'] }, 'wizard', classes), false,
    'Wizard preparation requires a spellbook entry');
  assert.equal(spellEligibleForClassPreparation({ ...clericSpell, sourceClassIdentifier: 'wizard', classes: ['wizard'], spellLevel: 1, wizardSpellbook: true }, 'wizard', classes), true);
});

test('Life Domain always-prepared spell grants match SRD levels, class list, and idempotent provenance', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const heading = '### Cleric Subclass: Life Domain';
  const start = source.indexOf(heading);
  assert.notEqual(start, -1);
  const end = source.indexOf('\n### ', start + heading.length);
  const section = source.slice(start, end < 0 ? undefined : end);
  const tableStart = section.indexOf('**Life Domain Spells**');
  const tableEnd = section.indexOf('</table>', tableStart);
  const table = section.slice(tableStart, tableEnd);
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(([, cell]) => cell.trim()));
  const sourceGrants = rows.filter((row) => /^\d+$/.test(row[0] || '')).map(([level, spells]) => [Number(level), spells.split(',').map((name) => name.trim())]);
  const expected = sourceGrants.flatMap(([level, names]) => names.map((name) => ({ level, name })));
  assert.deepEqual(subclassAlwaysPreparedSpellNames('cleric', 'Life Domain', 20).map(({ grantLevel, name }) => ({ level: grantLevel, name })), expected);
  assert.equal(subclassAlwaysPreparedSpellNames('cleric', 'Life Domain', 4).length, 4);
  assert.equal(subclassAlwaysPreparedSpellNames('cleric', 'Life Domain', 5).length, 6);
  assert.deepEqual(subclassAlwaysPreparedSpellNames('druid', 'Life Domain', 20), []);

  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  const spellEntries = db.prepare('SELECT name,data FROM entries').all().map((row) => ({ id: row.name, name: row.name, data: JSON.parse(row.data) }));
  db.close();
  const auraOfLife = spellEntries.find((entry) => entry.name === 'Aura of Life');
  assert.ok(auraOfLife);
  assert.equal(auraOfLife.data.source, 'SRD 5.2 (CC-BY-4.0)');
  assert.equal(auraOfLife.data.spellLevel, 4);
  assert.equal(auraOfLife.data.school, 'abjuration');
  assert.equal(auraOfLife.data.castingTime, '1 action');
  assert.equal(auraOfLife.data.range, 'Self');
  assert.deepEqual(auraOfLife.data.components, { v: true, s: false, m: false, material: '' });
  assert.equal(auraOfLife.data.duration, 'up to 10 minutes');
  assert.equal(auraOfLife.data.durationRounds, 100);
  assert.equal(auraOfLife.data.concentration, true);
  assert.deepEqual(auraOfLife.data.classes, ['cleric', 'paladin']);
  assert.match(auraOfLife.data.description, /Resistance to Necrotic damage/);
  const resolved = resolveSubclassAlwaysPreparedSpells('cleric', 'Life Domain', 20, spellEntries);
  assert.equal(resolved.valid, true, 'every listed subclass spell is present in the bundled spell compendium');
  assert.equal(resolved.grants.length, 10);
  assert.equal(resolved.grants.find((grant) => grant.name === 'Aura of Life').entry.data.classes.includes('cleric'), true,
    'Aura of Life is also in the Cleric class list');
  const grantData = subclassSpellGrantItemData(resolved.grants[0]);
  assert.equal(grantData.prepared, true);
  assert.equal(grantData.alwaysPrepared, true);
  assert.equal(grantData.sourceClassIdentifier, 'cleric');
  assert.ok(grantData.subclassSpellGrantId);

  const preexisting = { id: 'spell-aid', type: 'spell', name: 'Aid', data: { classes: ['cleric'], sourceClassIdentifier: 'cleric', prepared: false } };
  const writes = planSubclassSpellGrantWrites(resolved.grants, [preexisting]);
  assert.equal(writes.find((write) => write.item === preexisting)?.kind, 'update', 'same-class owned spells receive grant provenance in place');
  assert.equal(writes.filter((write) => write.kind === 'create').length, 9);
  const reconciled = [{ ...preexisting, data: { ...preexisting.data, ...writes.find((write) => write.item === preexisting).data } },
    ...writes.filter((write) => write.kind === 'create').map((write, index) => ({ id: `new-${index}`, ...write }))];
  assert.equal(planSubclassSpellGrantWrites(resolved.grants, reconciled).length, 0, 'repeating the grant does not duplicate or rewrite items');
});

test('Oath of Devotion always-prepared grants match the Paladin SRD table and use Paladin provenance', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const heading = '### Paladin Subclass: Oath of Devotion';
  const start = source.indexOf(heading);
  assert.notEqual(start, -1);
  const end = source.indexOf('\n### ', start + heading.length);
  const section = source.slice(start, end < 0 ? undefined : end);
  const tableStart = section.indexOf('**Oath of Devotion Spells**');
  const tableEnd = section.indexOf('</table>', tableStart);
  const table = section.slice(tableStart, tableEnd);
  const expected = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(([, cell]) => cell.trim()))
    .filter((row) => /^\d+$/.test(row[0] || ''))
    .flatMap(([level, spells]) => spells.split(',').map((name) => ({ level: Number(level), name: name.trim() })));
  assert.deepEqual(subclassAlwaysPreparedSpellNames('paladin', 'Oath of Devotion', 20)
    .map(({ grantLevel, name }) => ({ level: grantLevel, name })), expected);
  assert.equal(subclassAlwaysPreparedSpellNames('paladin', 'Oath of Devotion', 4).length, 2);
  assert.equal(subclassAlwaysPreparedSpellNames('paladin', 'Oath of Devotion', 5).length, 4);
  assert.deepEqual(subclassAlwaysPreparedSpellNames('cleric', 'Oath of Devotion', 20), []);
  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  const spellEntries = db.prepare('SELECT name,data FROM entries').all().map((row) => ({ id: row.name, name: row.name, data: JSON.parse(row.data) }));
  db.close();
  const resolved = resolveSubclassAlwaysPreparedSpells('paladin', 'Oath of Devotion', 20, spellEntries);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.grants.length, 10);
  // SRD 5.2 .dev/srd5.2_markdown/spells.md: Freedom of Movement is "(Bard, Cleric, Druid, Ranger)", so it is also off the base Paladin list.
  assert.deepEqual(resolved.grants.filter((grant) => !grant.entry.data.classes.includes('paladin')).map((grant) => grant.name),
    ['Beacon of Hope', 'Freedom of Movement', 'Guardian of Faith', 'Commune', 'Flame Strike'],
    'oath grants remain valid even when their spell is not on the base Paladin list');
  assert.equal(subclassSpellGrantItemData(resolved.grants[0]).sourceClassIdentifier, 'paladin');
  assert.ok(subclassSpellGrantItemData(resolved.grants[0]).subclassSpellGrantId.startsWith('oath-of-devotion:'));
});

test('Circle of the Land Long Rest terrain tables match SRD and resolve granted cantrips/spells', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const expectedByTerrain = {};
  for (const terrain of ['arid', 'polar', 'temperate', 'tropical']) {
    const title = `**${terrain[0].toUpperCase()}${terrain.slice(1)} Land**`;
    const start = source.indexOf(title);
    assert.notEqual(start, -1, `${terrain} table exists`);
    const tableEnd = source.indexOf('</table>', start);
    const table = source.slice(start, tableEnd);
    expectedByTerrain[terrain] = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map(([, row]) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(([, cell]) => cell.trim()))
      .filter((row) => /^\d+$/.test(row[0] || ''))
      .flatMap(([level, names]) => names.split(',').map((name) => ({ level: Number(level), name: name.trim() })));
    assert.deepEqual(circleLandAlwaysPreparedSpellNames(terrain, 20).map(({ grantLevel, name }) => ({ level: grantLevel, name })), expectedByTerrain[terrain]);
  }
  assert.equal(circleLandAlwaysPreparedSpellNames('unknown', 20).length, 0);
  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  const spellEntries = db.prepare('SELECT name,data FROM entries').all().map((row) => ({ id: row.name, name: row.name, data: JSON.parse(row.data) }));
  db.close();
  for (const terrain of Object.keys(expectedByTerrain)) {
    const resolved = resolveCircleLandAlwaysPreparedSpells(terrain, 20, spellEntries);
    assert.equal(resolved.valid, true, `${terrain} table entries resolve from the spell pack`);
    assert.equal(resolved.grants.length, expectedByTerrain[terrain].length);
    assert.ok(resolved.grants.every((grant) => grant.classIdentifier === 'druid' && grant.grantId.startsWith(`circle-land:${terrain}:`)));
  }
  const aridLevel3 = resolveCircleLandAlwaysPreparedSpells('arid', 3, spellEntries);
  assert.equal(aridLevel3.grants.length, 3);
  assert.ok(aridLevel3.grants.some((grant) => Number(grant.entry.data.spellLevel) === 0), 'Fire Bolt remains a granted cantrip');
});

test('Circle of the Land terrain replacement restores independent spell state and removes only owned old grants', () => {
  const oldOwned = { id: 'owned-grant', type: 'spell', name: 'Fog Cloud', data: {
    sourceClassIdentifier: 'druid', prepared: true, alwaysPrepared: true,
    subclassSpellGrantId: 'circle-land:polar:fog-cloud', subclassSpellGrantIds: ['circle-land:polar:fog-cloud'],
    subclassSpellGrantOwned: true,
  } };
  const oldIndependent = { id: 'manual-grant', type: 'spell', name: 'Hold Person', data: {
    sourceClassIdentifier: 'druid', prepared: true, alwaysPrepared: true,
    subclassSpellGrantId: 'circle-land:polar:hold-person', subclassSpellGrantIds: ['circle-land:polar:hold-person'],
    subclassSpellGrantOwned: false, subclassSpellGrantPrevious: { prepared: false, alwaysPrepared: false },
  } };
  const otherGrant = { id: 'shared-grant', type: 'spell', name: 'Sleep', data: {
    sourceClassIdentifier: 'druid', prepared: true, alwaysPrepared: true,
    subclassSpellGrantId: 'another-feature:sleep', subclassSpellGrantIds: ['circle-land:polar:sleep', 'another-feature:sleep'],
    subclassSpellGrantOwned: false, subclassSpellGrantPrevious: { prepared: false, alwaysPrepared: false },
  } };
  const desired = [{ classIdentifier: 'druid', name: 'Burning Hands', grantId: 'circle-land:arid:burning-hands',
    entry: { data: { spellLevel: 1, classes: ['sorcerer', 'wizard'] } } }];
  const writes = planSubclassSpellGrantReconciliation([oldOwned, oldIndependent, otherGrant], 'druid', desired, 'circle-land:');
  assert.ok(writes.some((write) => write.kind === 'delete' && write.item.id === 'owned-grant'));
  const restored = writes.find((write) => write.kind === 'update' && write.item.id === 'manual-grant');
  assert.equal(restored.data.prepared, false);
  assert.equal(restored.data.alwaysPrepared, false);
  assert.equal('subclassSpellGrantId' in restored.data, false);
  const retained = writes.find((write) => write.kind === 'update' && write.item.id === 'shared-grant');
  assert.deepEqual(retained.data.subclassSpellGrantIds, ['another-feature:sleep']);
  assert.equal(retained.data.alwaysPrepared, true);
  assert.ok(writes.some((write) => write.kind === 'create' && write.name === 'Burning Hands'));
});

test('Ray of Sickness is present with its SRD 5.2 spell data for the Tropical Land grant', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/spells.md', import.meta.url), 'utf8');
  const start = source.indexOf('#### Ray of Sickness');
  const end = source.indexOf('\n#### ', start + 1);
  const section = source.slice(start, end < 0 ? undefined : end);
  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  const row = db.prepare('SELECT name,data FROM entries WHERE name=?').get('Ray of Sickness');
  db.close();
  assert.ok(row, 'Circle of the Land Tropical table requires this spell');
  const spell = JSON.parse(row.data);
  assert.match(section, /_Level 1 Necromancy \(Sorcerer, Wizard\)_/);
  assert.match(section, /takes 2d8 Poison damage/);
  assert.match(section, /damage increases by 1d8 for each spell slot level above 1/);
  assert.equal(spell.source, 'SRD 5.2 (CC-BY-4.0)');
  assert.equal(spell.spellLevel, 1);
  assert.equal(spell.school, 'necromancy');
  assert.equal(spell.castingTime, '1 action');
  assert.equal(spell.range, '60 feet');
  assert.deepEqual(spell.components, { v: true, s: true, m: false, material: '' });
  assert.equal(spell.concentration, false);
  // SRD 5.2 spells.md: "damage increases by 1d8 for each spell slot level above 1" (asserted above).
  assert.deepEqual(spell.damage, { formula: '2d8', type: 'poison', scaling: { perLevel: '1d8', fromLevel: 1, atSlotLevel: 1 } });
  assert.deepEqual(spell.classes, ['sorcerer', 'wizard']);
  assert.match(spell.description, /higher-level spell slot/i);
});

test('Multiclass spells use the casting ability of their recorded class', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const abilityNames = { int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  for (const [classIdentifier, ability] of Object.entries(SPELLCASTING_ABILITY_BY_CLASS)) {
    const heading = `### ${classIdentifier[0].toUpperCase()}${classIdentifier.slice(1)} Class Features`;
    const start = source.indexOf(heading);
    assert.notEqual(start, -1, `${classIdentifier} source section exists`);
    const next = source.indexOf('\n### ', start + heading.length);
    const section = source.slice(start, next < 0 ? undefined : next);
    assert.match(section, new RegExp(`${abilityNames[ability]} is (?:your|the) spellcasting ability`, 'i'), `${classIdentifier} ability follows SRD source`);
  }
  const classItems = ['warlock', 'wizard', 'cleric'].map((classIdentifier) => ({ type: 'class', data: { classIdentifier } }));
  const actorData = { attributes: { spellcasting: { ability: 'int' }, prof: { value: 3 } }, abilities: {
    int: { value: 16, modifier: 3 }, wis: { value: 12, modifier: 1 }, cha: { value: 18, modifier: 4 },
  } };
  assert.equal(spellcastingAbilityForClass('warlock', classItems), 'cha');
  assert.equal(spellcastingStats(actorData, { sourceClassIdentifier: 'warlock' }, classItems).dc, 15);
  assert.equal(spellcastingStats(actorData, { sourceClassIdentifier: 'wizard' }, classItems).attackBonus, 6);
  assert.equal(spellcastingStats(actorData, { sourceClassIdentifier: 'cleric', spellcastingAbility: 'cha' }, classItems).ability, 'cha', 'explicit feat-granted ability remains authoritative');
  assert.equal(spellcastingAbilityForClass('warlock', classItems.filter((entry) => entry.data.classIdentifier !== 'warlock')), null, 'does not infer a class the actor does not have');
});

test('Warlock Level Up validates recorded preparation provenance and table deltas', () => {
  for (let level = 2; level <= 20; level += 1) {
    const transition = classSpellcastingLevelUpAtLevel('warlock', level - 1, level);
    assert.ok(transition);
    assert.equal(transition.newPreparedSpells, Math.max(0, PREPARED_CLASS_SPELLCASTING.warlock.prepared[level - 1] - PREPARED_CLASS_SPELLCASTING.warlock.prepared[level - 2]));
    assert.equal(transition.newCantrips, Math.max(0, PREPARED_CLASS_SPELLCASTING.warlock.cantrips[level - 1] - PREPARED_CLASS_SPELLCASTING.warlock.cantrips[level - 2]));
  }
  const prepared = [
    { name: 'Hex', data: { classes: ['warlock'], sourceClassIdentifier: 'warlock', spellLevel: 1, prepared: true } },
    { name: 'Armor of Agathys', data: { classes: ['warlock'], sourceClassIdentifier: 'warlock', spellLevel: 1, prepared: true } },
  ];
  const cantrips = ['Eldritch Blast', 'Prestidigitation'].map((name) => ({ name, data: { classes: ['warlock'], sourceClassIdentifier: 'warlock', spellLevel: 0 } }));
  assert.equal(inspectPreparedSpellState('warlock', 1, prepared, cantrips, true).valid, true);
  assert.equal(inspectPreparedSpellState('warlock', 1, prepared.slice(1), cantrips, true).valid, false);
  assert.equal(inspectPreparedSpellState('warlock', 1, prepared, cantrips.map((item) => ({ ...item, data: { ...item.data, sourceClassIdentifier: 'wizard' } })), true).valid, false);
});

test('Paladin and Ranger prepared choices and half-caster slots match their SRD 5.2 tables', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const sampleEntries = [
    { id: 'half-1a', data: { classes: ['paladin', 'ranger'], spellLevel: 1 } },
    { id: 'half-1b', data: { classes: ['paladin', 'ranger'], spellLevel: 1 } },
    { id: 'half-2', data: { classes: ['paladin', 'ranger'], spellLevel: 2 } },
  ];
  for (const classIdentifier of ['paladin', 'ranger']) {
    const className = classIdentifier[0].toUpperCase() + classIdentifier.slice(1);
    const start = source.indexOf(`### ${className} Class Features`);
    const end = source.indexOf(`### ${className} Spell List`, start);
    const section = source.slice(start, end);
    const tbody = section.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
    const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(([, cell]) => cell.trim())).filter((row) => /^\d+$/.test(row[0] || ''));
    assert.equal(rows.length, 20, `${className} has all 20 source levels`);
    for (const row of rows) {
      const level = Number(row[0]);
      const progression = classSpellcastingAtLevel(classIdentifier, level);
      assert.equal(progression.prepared, Number(row[4]), `${className} ${level} prepared spells`);
      const sourceSlots = row.slice(5).map((value) => value === '—' ? 0 : Number(value));
      assert.equal(progression.maximumSpellLevel, sourceSlots.reduce((highest, count, index) => count > 0 ? index + 1 : highest, 0), `${className} ${level} highest slot`);
      assert.equal(PREPARED_CLASS_SPELLCASTING[classIdentifier].cantrips[level - 1], 0, `${className} grants no class cantrips`);
      if (level > 1) {
        const transition = classSpellcastingLevelUpAtLevel(classIdentifier, level - 1, level);
        assert.equal(transition.newPreparedSpells, Math.max(0, Number(row[4]) - Number(rows[level - 2][4])), `${className} ${level} Level Up picks only the new table delta`);
        assert.equal(transition.replacePreparedSpell, false);
        assert.equal(transition.replaceCantrip, false);
      }
    }
    assert.equal(classSpellcastingAtLevel(classIdentifier, 1).maximumSpellLevel, 1, `${className} has first-level slots at class level 1`);
    assert.equal(resolvePreparedClassSpellChoices(classIdentifier, 1, sampleEntries, { cantrips: [], prepared: ['half-1a', 'half-1b'] }).valid, true);
    assert.equal(resolvePreparedClassSpellChoices(classIdentifier, 1, sampleEntries, { cantrips: [], prepared: ['half-1a', 'half-1b', 'half-2'] }).valid, false, `${className} enforces exact count and level-1 slot limit`);
  }
});

test('Wizard level-one creation keeps spellbook ownership separate from its four prepared spells', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const start = source.indexOf('### Wizard Class Features');
  const tableStart = source.indexOf('<table>', start);
  const tableEnd = source.indexOf('</table>', tableStart);
  const rows = source.slice(tableStart, tableEnd).split('<tr>')
    .map((row) => row.split('</tr>')[0].split('<td>').slice(1).map((cell) => cell.split('</td>')[0].replace(/<[^>]*>/g, '').trim()))
    .filter((row) => row[0] && !Number.isNaN(Number(row[0])) && row.length > 10);
  assert.equal(rows.length, 20);
  for (const row of rows) {
    const result = classSpellcastingAtLevel('wizard', Number(row[0]));
    assert.equal(result.cantrips, Number(row[3]), `Wizard ${row[0]} cantrips`);
    assert.equal(result.prepared, Number(row[4]), `Wizard ${row[0]} prepared spells`);
  }
  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  try {
    const spells = db.prepare('select id,name,data from entries').all().map((row) => ({ id: row.id, name: row.name, data: JSON.parse(row.data) }));
    const cantrips = spells.filter((entry) => entry.data.classes.includes('wizard') && entry.data.spellLevel === 0);
    const firstLevel = spells.filter((entry) => entry.data.classes.includes('wizard') && entry.data.spellLevel === 1);
    const valid = resolveWizardLevelOneChoices(spells, {
      cantrips: cantrips.slice(0, 3).map((entry) => entry.id),
      spellbook: firstLevel.slice(0, 6).map((entry) => entry.id),
      prepared: firstLevel.slice(0, 4).map((entry) => entry.id),
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.spellbook.length, 6);
    assert.equal(valid.prepared.length, 4);
    const tooFewPrepared = resolveWizardLevelOneChoices(spells, {
      cantrips: cantrips.slice(0, 3).map((entry) => entry.id),
      spellbook: firstLevel.slice(0, 6).map((entry) => entry.id),
      prepared: firstLevel.slice(0, 2).map((entry) => entry.id),
    });
    assert.equal(tooFewPrepared.valid, false, 'Wizard preparation follows the class table, not the ability modifier');
    assert.equal(tooFewPrepared.prepared.length, 2);
    assert.equal(resolveWizardLevelOneChoices(spells, {
      cantrips: cantrips.slice(0, 3).map((entry) => entry.id),
      spellbook: firstLevel.slice(0, 6).map((entry) => entry.id),
      prepared: firstLevel.slice(6, 10).map((entry) => entry.id),
    }).valid, false, 'prepared spells must come from the selected spellbook');
  } finally { db.close(); }
});

test('Wizard Level Up separates two new spellbook spells from prepared capacity and cantrip table gains', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');
  const start = source.indexOf('### Wizard Class Features');
  const tableStart = source.indexOf('<table>', start);
  const tableEnd = source.indexOf('</table>', tableStart);
  const rows = source.slice(tableStart, tableEnd).split('<tr>')
    .map((row) => row.split('</tr>')[0].split('<td>').slice(1).map((cell) => cell.split('</td>')[0].replace(/<[^>]*>/g, '').trim()))
    .filter((row) => row[0] && !Number.isNaN(Number(row[0])) && row.length > 10);
  for (let level = 2; level <= 20; level += 1) {
    const progression = wizardSpellcastingLevelUpAtLevel(level - 1, level);
    assert.equal(progression.newSpellbookSpells, 2);
    assert.equal(progression.newCantrips, Number(rows[level - 1][3]) - Number(rows[level - 2][3]));
    assert.equal(progression.nextPreparedCapacity, Number(rows[level - 1][4]));
  }
  assert.equal(wizardSpellcastingLevelUpAtLevel(1, 3), null, 'non-adjacent levels cannot be advanced');
});

test('Wizard Level Up rejects ambiguous spell items without explicit and level-valid spellbook provenance', () => {
  const book = Array.from({ length: 6 }, (_, index) => ({
    id: `book-${index}`, name: `Spell ${index}`,
    data: { classes: ['wizard'], spellLevel: 1, wizardSpellbook: true, sourceClassIdentifier: 'wizard', learnedAtWizardLevel: 1, prepared: index < 4 },
  }));
  const cantrips = Array.from({ length: 3 }, (_, index) => ({
    id: `cantrip-${index}`, name: `Cantrip ${index}`,
    data: { classes: ['wizard'], spellLevel: 0, sourceClassIdentifier: 'wizard', learnedAtWizardLevel: 1 },
  }));
  assert.equal(inspectWizardSpellbookState(1, book, cantrips).valid, true);
  assert.equal(inspectWizardSpellbookState(1, book.map((entry) => ({ ...entry, data: { ...entry.data, wizardSpellbook: false } })), cantrips).valid, false);
  assert.equal(inspectWizardSpellbookState(1, book.map((entry) => ({ ...entry, data: { ...entry.data, learnedAtWizardLevel: 2 } })), cantrips).valid, false);
});

test('Wizard high-level creation preserves each learned-at-level spell-slot limit', () => {
  const db = new DatabaseSync(new URL('../packs/spells.sqlite', import.meta.url), { readOnly: true });
  try {
    const spells = db.prepare('select id,name,data from entries').all().map((row) => ({ id: row.id, name: row.name, data: JSON.parse(row.data) }));
    const firstLevel = spells.filter((entry) => entry.data.classes.includes('wizard') && entry.data.spellLevel === 1);
    const secondLevel = spells.filter((entry) => entry.data.classes.includes('wizard') && entry.data.spellLevel === 2);
    const cantrips = spells.filter((entry) => entry.data.classes.includes('wizard') && entry.data.spellLevel === 0);
    const choices = {
      cantripsByLevel: { 1: cantrips.slice(0, 3).map((entry) => entry.id) },
      spellbookByLevel: { 1: firstLevel.slice(0, 6).map((entry) => entry.id), 2: firstLevel.slice(6, 8).map((entry) => entry.id) },
      prepared: firstLevel.slice(0, 5).map((entry) => entry.id),
    };
    const valid = resolveWizardCreationChoices(2, spells, choices);
    assert.equal(valid.valid, true);
    assert.deepEqual(valid.spellbook.map((entry) => entry.learnedAtWizardLevel), [1,1,1,1,1,1,2,2]);
    const invalid = resolveWizardCreationChoices(2, spells, {
      ...choices,
      spellbookByLevel: { ...choices.spellbookByLevel, 2: [secondLevel[0].id, firstLevel[7].id] },
    });
    assert.equal(invalid.valid, false, 'level-2 Wizard only has level-1 slots for its acquisitions');
  } finally { db.close(); }
});

test('Skilled tool options are grounded in the local SRD 5.2 equipment source', () => {
  const source = readFileSync(new URL('../.dev/srd5.2_markdown/equipment.md', import.meta.url), 'utf8').toLocaleLowerCase();
  for (const tool of TOOL_PROFICIENCY_OPTIONS) {
    const documentedName = tool.includes(': ') ? tool.split(': ').at(-1) : tool;
    assert.ok(source.includes(documentedName.toLocaleLowerCase()), `tool choice missing from SRD source: ${tool}`);
  }
});

test('species choices are constrained to local records and persist without claiming effect automation', () => {
  const db = new DatabaseSync(new URL('../packs/races.sqlite', import.meta.url), { readOnly: true });
  try {
    const rows = db.prepare('select name, data from entries').all().map((row) => ({ name: row.name, data: JSON.parse(row.data) }));
    const ids = new Set(rows.map((row) => row.data.identifier));
    for (const variants of Object.values(SPECIES_VARIANT_PARENTS)) for (const id of variants) assert.ok(ids.has(id), `missing species variant ${id}`);
    const visible = speciesVariantEntries(rows);
    for (const parent of Object.keys(SPECIES_VARIANT_PARENTS)) assert.equal(visible.some((row) => row.data.identifier === parent), false);
    for (const [identifier, choice] of Object.entries(SPECIES_CHOICE_OPTIONS)) {
      const source = rows.find((row) => row.data.identifier === identifier);
      assert.ok(source);
      for (const option of choice.options) assert.ok(source.data.description.toLowerCase().includes(option.toLowerCase()), `${identifier} lacks ${option}`);
      assert.equal(isSpeciesChoiceValid(identifier, { [choice.key]: choice.options[0] }), true);
      assert.equal(isSpeciesChoiceValid(identifier, { [choice.key]: 'not-a-rule-option' }), false);
      const recorded = recordSpeciesChoice(source.data, identifier, { [choice.key]: choice.options[0] });
      assert.match(recorded.description, /Trait effects still need manual application/);
      assert.throws(() => recordSpeciesChoice(source.data, identifier, { [choice.key]: 'invalid' }), RangeError);
    }
    assert.equal(isSpeciesChoiceValid('dwarf', {}), true);
  } finally {
    db.close();
  }
});

test('Human Skillful and Versatile choices require a distinct supported skill and eligible Origin feat', () => {
  const feat = { name: 'Alert', data: { description: 'Category: Origin Feat' } };
  assert.equal(isHumanSkillValid('perception'), true);
  assert.equal(isHumanSkillValid('not-a-skill'), false);
  assert.equal(isHumanSpeciesChoiceValid({ skillful: 'perception' }, feat, []), true);
  assert.equal(isHumanSpeciesChoiceValid({ skillful: 'perception' }, feat, ['perception']), false);
  assert.equal(isHumanSpeciesChoiceValid({ skillful: 'perception' }, null, []), false);
  assert.equal(isFeatEligibleForProgression(feat, 1, { existingNames: [normalizeFeatChoiceName('Magic Initiate (Cleric)')] }), true);
  assert.equal(isFeatEligibleForProgression({ name: 'Grappler', data: { description: 'Category: General Feat\nPrerequisite: Level 4+, Strength or Dexterity 13+' } }, 1), false);
  assert.equal(normalizeFeatChoiceName('Magic Initiate (Wizard)'), 'magic initiate');
});

test('Ranger, Paladin, and multiclass spell-slot progressions', () => {
  const slotData = () => ({ resources: { spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { value: 0, max: 0 }])) } });
  const actorClasses = (...data) => data.map((system) => ({ type: 'class', system }));
  const ranger = slotData();
  prepSpellSlots(ranger, actorClasses({ classIdentifier: 'ranger', casterType: 'half', levels: 1 }));
  assert.equal(ranger.resources.spellSlots[1].max, 2);

  const paladin = slotData();
  prepSpellSlots(paladin, actorClasses({ classIdentifier: 'paladin', casterType: 'half', levels: 1 }));
  assert.equal(paladin.resources.spellSlots[1].max, 2);

  const multiclass = slotData();
  prepSpellSlots(multiclass, actorClasses(
    { classIdentifier: 'wizard', casterType: 'full', levels: 1 },
    { classIdentifier: 'paladin', casterType: 'half', levels: 1 },
  ));
  assert.equal(multiclass.resources.spellSlots[1].max, 3);
});

test('SRD 5.2 exhaustion reduces D20 Tests and speed without changing HP maximum', () => {
  assert.equal(exhaustionD20Penalty(3), -6);
  assert.equal(exhaustionD20Penalty(9), -12);
  const data = getDefaultData('character');
  data.resources.exhaustion = 2;
  data.resources.health.max = 40;
  const prepared = prepareActorRow({ type: 'character', systemData: data, items: [] }).systemData;
  assert.equal(prepared.resources.health.effectiveMax, 40);
  assert.equal(prepared.attributes.movement.effective.walk, 6);
});

test('Barbarian Fast Movement adds 10 feet to walking speed from level 5 unless Heavy armor is equipped', () => {
  const barbarian = { type: 'class', system: { classIdentifier: 'barbarian', levels: 5 } };
  const heavyArmor = { type: 'armor', system: { armorType: 'heavy', equipped: true } };
  const lightArmor = { type: 'armor', system: { armorType: 'light', equipped: true } };
  assert.equal(BARBARIAN_FAST_MOVEMENT_BONUS, 3);
  assert.equal(hasBarbarianFastMovement([barbarian]), true);
  assert.equal(hasBarbarianFastMovement([{ ...barbarian, system: { ...barbarian.system, levels: 4 } }]), false);
  assert.equal(hasBarbarianFastMovement([barbarian, { ...heavyArmor, system: { ...heavyArmor.system, equipped: false } }]), true);
  assert.equal(hasBarbarianFastMovement([barbarian, lightArmor]), true);
  assert.equal(hasBarbarianFastMovement([barbarian, heavyArmor]), false);

  const data = getDefaultData('character');
  const row = { type: 'character', systemData: data, items: [barbarian] };
  prepareActorRow(row);
  assert.equal(row.systemData.attributes.movement.effective.walk, 12);
  assert.equal(row.systemData.attributes.movement.effective.fly, 0);
  prepareActorRow(row);
  assert.equal(row.systemData.attributes.movement.effective.walk, 12, 'derived preparation must not stack the bonus');
  row.items.push(heavyArmor);
  prepareActorRow(row);
  assert.equal(row.systemData.attributes.movement.effective.walk, 9, 'Heavy armor suppresses the feature');
});

test('movement ledger applies SRD segment costs, difficult terrain, special movement modes, and speed switching', () => {
  const speeds = { walk: 9, climb: 0, swim: 3, fly: 12, burrow: 0 };
  let ledger = resetMovementLedger();
  let result = addMovementSegment(ledger, { distance: 3, mode: 'walk', difficultTerrain: true }, speeds);
  assert.equal(result.valid, true);
  ledger = result.ledger;
  assert.equal(evaluateMovementLedger(ledger, speeds).spent, 6, 'ordinary Difficult Terrain costs double movement');

  result = addMovementSegment(resetMovementLedger(), { distance: 1, mode: 'climb', difficultTerrain: true }, speeds);
  assert.equal(result.valid, true);
  assert.equal(evaluateMovementLedger(result.ledger, speeds).spent, 3, 'climbing without a Climb Speed in Difficult Terrain costs three times the distance');
  result = addMovementSegment(resetMovementLedger(), { distance: 1, mode: 'climb', difficultTerrain: false }, { ...speeds, climb: 6 });
  assert.equal(evaluateMovementLedger(result.ledger, { ...speeds, climb: 6 }).spent, 1, 'using a Climb Speed removes the extra climbing cost');
  result = addMovementSegment(resetMovementLedger(), { distance: 1, mode: 'crawl', difficultTerrain: true }, speeds);
  assert.equal(evaluateMovementLedger(result.ledger, speeds).spent, 3, 'crawling in Difficult Terrain costs three times the distance');
  result = addMovementSegment(resetMovementLedger(), { distance: 1, mode: 'swim', difficultTerrain: false }, { ...speeds, swim: 0 });
  assert.equal(evaluateMovementLedger(result.ledger, { ...speeds, swim: 0 }).spent, 2, 'swimming without a Swim Speed has an extra movement cost');

  ledger = { segments: [] };
  for (const segment of [
    { distance: 3, mode: 'walk' },
    { distance: 3, mode: 'fly' },
    { distance: 1, mode: 'walk' },
  ]) {
    result = addMovementSegment(ledger, segment, speeds);
    assert.equal(result.valid, true);
    ledger = result.ledger;
  }
  const evaluated = evaluateMovementLedger(ledger, speeds);
  assert.equal(evaluated.spent, 7);
  assert.equal(evaluated.remaining, 2, 'switching back to walking subtracts all previously spent movement from walking Speed');
  assert.equal(addMovementSegment(ledger, { distance: 3, mode: 'walk' }, speeds).reason, 'movement-exceeded');
});

test('Slow reduces only the affected Cast walking Speed and its derived movement modes', () => {
  const slow = createCombatEffectRecord({
    id: 'slow-hit-movement', type: 'slow', sourceCastId: 'attacker-cast', targetCastId: 'slowed-cast',
    combatId: 'combat-a', appliedTurn: { round: 2, castId: 'attacker-cast' },
  });
  const original = { walk: 9, climb: 0, swim: 0, fly: 12, burrow: 3 };
  const reduced = speedsWithCombatEffects(original, [slow], 'combat-a', 'slowed-cast');
  assert.deepEqual(reduced, { walk: 6, climb: 0, swim: 0, fly: 12, burrow: 3 });
  assert.deepEqual(original, { walk: 9, climb: 0, swim: 0, fly: 12, burrow: 3 }, 'the Actor speed data is not mutated');

  for (const mode of ['crawl', 'climb', 'swim']) {
    const result = addMovementSegment(resetMovementLedger(), { distance: 1, mode }, reduced);
    assert.equal(result.valid, true);
    assert.equal(result.evaluation.segments[0].speed, 6, `${mode} inherits reduced walking Speed when no dedicated Speed exists`);
  }
  assert.equal(speedsWithCombatEffects(original, [slow], 'combat-b', 'slowed-cast').walk, 9, 'an inactive combat effect does not apply');
  assert.equal(speedsWithCombatEffects(original, [slow], 'combat-a', 'different-cast').walk, 9, 'another Cast is unaffected');
});

test('movement ledger normalizes, removes, and resets persisted segments safely', () => {
  const ledger = normalizeMovementLedger({ segments: [
    { distance: 2.345, mode: 'walk', difficultTerrain: 1 },
    { distance: -1, mode: 'fly' },
    { distance: 1, mode: 'teleport' },
  ] });
  assert.deepEqual(ledger.segments, [{ distance: 2.35, mode: 'walk', difficultTerrain: false }]);
  assert.deepEqual(removeMovementSegment({ dashBonuses: [{ mode: 'walk', amount: 9 }], segments: [{ distance: 1, mode: 'walk' }] }, 0), { dashBonuses: [{ mode: 'walk', amount: 9 }], segments: [] });
  assert.deepEqual(resetMovementLedger(), { dashBonuses: [], segments: [] });
});

test('Unarmed Grapple enforces size, range confirmation, hand ownership, and explicit release state', () => {
  assert.equal(normalizeGrappleSize('MED'), 'med');
  assert.equal(grappleSizeEligible('medium', 'large'), true);
  assert.equal(grappleSizeEligible('small', 'large'), false);
  assert.equal(grappleSizeEligible('unknown', 'small'), null);
  assert.deepEqual(resolveGrapplePrerequisites({ grapplerSize: 'sm', targetSize: 'lg', sizeConfirmed: true, freeHandConfirmed: true, withinRangeConfirmed: true }), { valid: false, reason: 'target-too-large' });
  assert.equal(resolveGrapplePrerequisites({ grapplerSize: '', targetSize: '', sizeConfirmed: false, freeHandConfirmed: true, withinRangeConfirmed: true }).reason, 'confirm-size');
  assert.equal(resolveGrapplePrerequisites({ grapplerSize: 'med', targetSize: 'med', sizeConfirmed: true, freeHandConfirmed: false, withinRangeConfirmed: true }).reason, 'free-hand-required');
  assert.equal(resolveGrapplePrerequisites({ grapplerSize: 'med', targetSize: 'med', sizeConfirmed: true, freeHandConfirmed: true, withinRangeConfirmed: false }).reason, 'range-required');
  assert.equal(resolveGrapplePrerequisites({ grapplerSize: 'med', targetSize: 'med', sizeConfirmed: true, freeHandConfirmed: true, withinRangeConfirmed: true }).valid, true);
  const grapple = recordGrapple([], { targetCastId: 'cast-a', hand: 'left', escapeDC: 13 });
  assert.deepEqual(grapple, [{ targetCastId: 'cast-a', hand: 'left', escapeDC: 13 }]);
  assert.equal(canUseGrappleHand(grapple, 'left', 'cast-b'), false);
  assert.equal(canUseGrappleHand(grapple, 'right', 'cast-b'), true);
  assert.deepEqual(removeGrapple(grapple, 'cast-a'), []);
  assert.equal(recordGrapple([], { targetCastId: 'cast-a', hand: 'tentacle', escapeDC: 13 }), null);
});

test('Dash adds the effective selected Speed to the movement ledger without automatic action spending', () => {
  const speeds = { walk: 9, fly: 12, swim: 3, climb: 0, burrow: 0 };
  const dash = addDashMovementBonus(resetMovementLedger(), 'fly', speeds);
  assert.equal(dash.valid, true);
  assert.deepEqual(dash.ledger.dashBonuses, [{ mode: 'fly', amount: 12 }]);
  let ledger = dash.ledger;
  for (const segment of [{ distance: 9, mode: 'walk' }, { distance: 12, mode: 'fly' }]) {
    const result = addMovementSegment(ledger, segment, speeds);
    assert.equal(result.valid, true);
    ledger = result.ledger;
  }
  assert.equal(evaluateMovementLedger(ledger, speeds).remaining, 3, 'the selected Fly Speed plus recorded Dash allowance sets the current cap');
  assert.equal(addMovementSegment(ledger, { distance: 1, mode: 'walk' }, speeds).reason, 'movement-exceeded');
  assert.equal(addDashMovementBonus(ledger, 'crawl', speeds).valid, false, 'crawling is not a special speed selectable for Dash');
  assert.equal(addDashMovementBonus(ledger, 'fly', { ...speeds, fly: 0 }).valid, false);
  assert.deepEqual(removeDashMovementBonus(ledger, 0).dashBonuses, []);
});

test('class feature grants skip incompatible editions and already-granted rows on retry', () => {
  const entries = [
    { id: 'f1', name: 'Fighting Style', data: { classIdentifier: 'fighter', levelGained: 1, source: 'SRD 5.2' } },
    { id: 'f1-old', name: 'Second Wind', data: { classIdentifier: 'fighter', levelGained: 1, source: 'SRD 5.1' } },
    { id: 'f2', name: 'Action Surge', data: { classIdentifier: 'fighter', levelGained: 2, source: 'SRD 5.2' } },
    { id: 'r1', name: 'Rage', data: { classIdentifier: 'barbarian', levelGained: 1, source: 'SRD 5.2' } },
    { id: 'f1-mismatch', name: 'Brutal Critical', data: { classIdentifier: 'barbarian', levelGained: 9, source: 'SRD 5.2' } },
    { id: 'f1-homebrew', name: 'My Custom Feature', data: { classIdentifier: 'fighter', levelGained: 3, source: 'Campaign Homebrew' } },
  ];
  const existing = [{ name: 'Fighting Style', system: { classIdentifier: 'fighter', levelGained: 1 } }];
  const result = selectClassFeaturesToGrant(entries, 'fighter', 0, 2, existing);
  assert.deepEqual(result.selected.map((entry) => entry.name), ['Action Surge']);
  assert.equal(result.skippedSourceCount, 1);
  const sourceMismatch = selectClassFeaturesToGrant(entries, 'barbarian', 8, 10);
  assert.deepEqual(sourceMismatch.selected, [], 'a source-tagged feature that is absent from the current source table is not granted');
  const homebrew = selectClassFeaturesToGrant(entries, 'fighter', 2, 3);
  assert.deepEqual(homebrew.selected.map((entry) => entry.name), ['My Custom Feature']);
});

test('character creation calculates first-level and higher-level hit points from class die and Constitution', () => {
  assert.equal(startingHitPoints('d8', 1, 2), 10);
  assert.equal(startingHitPoints('d10', 3, 1), 25);
  assert.equal(startingHitPoints('d6', 1, 0, { maxAtFirstLevel: false }), 4);
  assert.equal(startingHitPoints('d6', 5, -4), 6);
  assert.throws(() => startingHitPoints('d8', 0, 0), RangeError);
});


