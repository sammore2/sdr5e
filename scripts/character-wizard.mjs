// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/character-wizard.mjs
// Component Version: 0.1.0
//
// Guided character creation, matching the real dnd5e flow's shape
// (identity -> race -> class -> abilities -> review -> create) without any
// VTT legado code — a plain LoomHandlebarsMixin(BaseWindow), same pattern as
// the sheets, just not bound to an existing document.
//
// Race/Class are picked from real compendium entries (GET /api/compendium/
// browse/entries?entryType=race|class) instead of typed as free text — this
// pulls the real item (hitDie/casterType/classIdentifier/speed/creatureType/
// etc, whatever the picked entry's `data` actually has) onto the new actor.
// The search fans out across EVERY currently loaded compendium source, not
// one hardcoded sourceId — a third-party class/race pack installed later
// shows up automatically, no code change here. If nothing is picked (no
// matching pack installed, or the player wants pure homebrew), typing a
// name still creates a blank freeform item — same fallback this wizard
// always had, just no longer the only path.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, BaseWindow, api, windowManager, showToast } from '/_loom/sdk/index.js';
import { ABILITY_KEYS, ABILITY_LABELS, SKILL_LABELS, subclassLevelFor, pactMagicAtLevel } from './config.mjs';
import { buildProgressionPlan, isFeatEligibleForProgression, resolveProgressionChoices, startingHitPoints } from './progression.mjs';
import { featMechanicsSupport, getFeatMechanics, resolveFeatMechanicChoices, withFeatMechanics } from './feat-mechanics.mjs';
import { searchCompendiumEntries } from './utils.mjs';
import { getDefaultData } from './schema.mjs';
import { grantClassFeatures } from './class-features.mjs';
import { resolveExpertiseChoices, resolveBardExpertiseProgression } from './expertise-mechanics.mjs';
import { getSetting } from './settings.mjs';
import { backgroundMechanicsFor, resolveBackgroundChoices } from './background-mechanics.mjs';
import { backgroundEquipmentPackageOptions, resolveBackgroundEquipment } from './background-equipment.mjs';
import { classStartingEquipmentChoices, classStartingEquipmentPackageOptions, resolveClassStartingEquipment } from './class-equipment.mjs';
import { applyPrimalChampion } from './class-feature-mechanics.mjs';
import { rangerFavoredEnemySpellItemData, resolveRangerFavoredEnemySpell } from './ranger-favored-enemy.mjs';
import { CLASS_PROFICIENCIES, classProficiencyChoiceContext } from './class-proficiencies.mjs';
import { resolveWeaponMasteryChoices, weaponMasteryCountAtLevel } from './weapon-mastery.mjs';
import { startingExperiencePoints } from './xp-progression.mjs';
import { isHumanSpeciesChoiceValid, isSpeciesChoiceValid, normalizeFeatChoiceName, recordSpeciesChoice, speciesChoiceRule, speciesVariantEntries } from './species-mechanics.mjs';
import { clearCreationJournal, creationJournalCanResume, createCreationJournal, readCreationJournal, runCreationJournal, writeCreationJournal } from './creation-journal.mjs';
import { buildMagicInitiateSpellData, isMagicInitiate, magicInitiateAllowedLists, resolveMagicInitiateChoices } from './magic-initiate.mjs';
import { classSpellcastingAtLevel, resolvePreparedClassSpellChoices, resolveWizardCreationChoices, wizardCreationChoicesAtLevel } from './class-spellcasting.mjs';
import { resolveSubclassAlwaysPreparedSpells, subclassSpellGrantItemData } from './subclass-spell-grants.mjs';
import { applyCharacterLanguages, resolveCharacterLanguages } from './language-mechanics.mjs';

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const BASE_STEPS = ['identity', 'race', 'background', 'class', 'abilities', 'spells', 'review'];

function localizeCharacterWizard(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.CharacterWizard.${key}`) || key;
}

function mergeGeneratedData(existing, generated) {
  const result = structuredClone(existing || {});
  for (const [key, value] of Object.entries(generated || {})) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeGeneratedData(result[key], value)
      : structuredClone(value);
  }
  return result;
}

export class Sdr5eCharacterWizard extends LoomHandlebarsMixin(BaseWindow) {
  static DEFAULT_OPTIONS = { position: { width: 480, height: 560 } };
  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/character-wizard.hbs' } };

  constructor(props) {
    super({
      ...props,
      id: props?.id || `sdr5e-wizard-${Math.random().toString(36).slice(2, 9)}`,
      title: props?.actorId
        ? (window.Loom?.i18n?.localize?.('SDR5E.CharacterWizard.SetupExistingTitle') || 'Character Setup')
        : 'New Character',
      showFooter: false,
      resizable: true,
      classes: ['sdrn-sheet', 'sdrn-wizard'],
    });
    this._existingActor = props?.existingActor || null;
    if (this._existingActor) {
      this._data.name = String(this._existingActor.name || '');
      const abilities = this._existingActor.systemData?.abilities || {};
      for (const key of ABILITY_KEYS) {
        const score = Number(abilities[key]?.value);
        if (Number.isFinite(score)) this._data.abilities[key] = score;
      }
    }
  }

  _step = 0;
  _data = {
    name: '',
    level: 1,
    // `sourceId`/`entryId` are set once a compendium entry is picked (see
    // `_pickCompendiumEntry`) — empty means "nothing picked yet, or typed
    // freeform". `size`/`speed`/`creatureType`/`hitDie` stay as the editable
    // defaults for the freeform fallback path.
    race: { sourceId: '', entryId: '', name: '', size: 'med', speed: '9m', creatureType: 'humanoid', compendiumData: null },
    background: { sourceId: '', entryId: '', name: '', compendiumData: null },
    backgroundAbilities: { spread: false, first: '', second: '', tool: '' },
    backgroundEquipment: { package: '', holySymbol: '' },
    classEquipment: { package: '', instrument: '', tool: '', holySymbol: '' },
    classProficiencies: { skills: [], tools: [] },
    weaponMasterySelections: [],
    originLanguages: [],
    rogueAdditionalLanguage: '',
    raceChoices: {},
    magicInitiate: {
      background: { list: '', ability: '', cantrips: ['', ''], spell: '' },
      human: { list: '', ability: '', cantrips: ['', ''], spell: '' },
    },
    klass: { sourceId: '', entryId: '', name: '', hitDie: 'd8', compendiumData: null },
    subclass: { sourceId: '', entryId: '', name: '', compendiumData: null },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    progressionSelections: {},
    bardExpertiseChoices: {},
    classSpellChoices: { cantrips: [], prepared: [] },
    wizardSpellChoices: { cantripsByLevel: {}, spellbookByLevel: {}, prepared: [] },
  };

  // Transient search UI state — not part of `_data`, never persisted to the
  // actor. One query/results/timer pair per picker (race, klass, subclass).
  _search = {
    race: { query: '', results: [], timer: null },
    background: { query: '', results: [], timer: null },
    klass: { query: '', results: [], timer: null },
    subclass: { query: '', results: [], timer: null },
    feat: { query: '', results: [], timer: null },
    speciesFeat: { query: '', results: [], timer: null },
    classSpell: { query: '', results: [], timer: null },
  };

  _progressionFeatEntries = {};
  _backgroundFeatEntry = null;
  _humanFeatEntry = null;
  _magicInitiateSpellEntries = [];
  _classSpellEntries = [];
  _activeProgressionLevel = null;
  _creating = false;
  _creationBlocked = false;
  _createdActorId = null;

  _existingActor = null;

  _progressionPlan() {
    const classId = this._data.klass?.compendiumData?.classIdentifier || '';
    const level = Math.min(20, Math.max(1, Number(this._data.level) || 1));
    return classId && classId !== 'none' ? buildProgressionPlan(classId, 0, level) : { choices: [], levels: [] };
  }

  _ensureProgressionSelections(plan = this._progressionPlan()) {
    for (const choice of plan.choices) {
      if (this._data.progressionSelections[choice.id]) continue;
      this._data.progressionSelections[choice.id] = {
        selected: false,
        mode: choice.kind === 'epic-boon' ? 'feat' : 'scores',
        first: '', second: '', featName: '', featEntryId: '', featAbilityFirst: '', featAbilitySecond: '',
      };
    }
  }

  _activeSteps() {
    const level = Math.min(20, Math.max(1, Number(this._data.level) || 1));
    const plan = this._progressionPlan();
    this._ensureProgressionSelections(plan);
    const choiceSteps = [...new Set(plan.choices.map((choice) => choice.level))]
      .map((level) => `progression-${level}`);
    const classIdentifier = this._data.klass?.compendiumData?.classIdentifier || '';
    const bardExpertiseLevels = classIdentifier === 'bard'
      ? [2, 9].filter((value) => value <= level) : [];
    const classProficiencySteps = classIdentifier && classIdentifier !== 'none' ? ['class-proficiencies'] : [];
    const weaponMasteryStep = ['barbarian', 'fighter', 'paladin', 'ranger', 'rogue'].includes(classIdentifier)
      ? ['weapon-mastery'] : [];
    const bardExpertiseSteps = bardExpertiseLevels.map((value) => `bard-expertise-${value}`);
    const classEquipmentSteps = classStartingEquipmentPackageOptions(classIdentifier).length ? ['class-equipment'] : [];
    const wizardSpellSteps = classIdentifier === 'wizard'
      ? [...Array.from({ length: level }, (_, index) => `wizard-spells-${index + 1}`), 'wizard-prepared']
      : ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'paladin', 'ranger'].includes(classIdentifier) ? ['spells'] : [];
    return [...BASE_STEPS.slice(0, 3), ...choiceSteps, BASE_STEPS[3], 'languages', ...classProficiencySteps,
      ...weaponMasteryStep, ...bardExpertiseSteps, ...classEquipmentSteps, BASE_STEPS[4], ...wizardSpellSteps, 'review'];
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const worldId = window.Loom?.world?.id;
    const creationJournal = readCreationJournal(worldId);
    const activeSteps = this._activeSteps();
    const step = activeSteps[this._step] || activeSteps[activeSteps.length - 1];
    const progressionLevel = /^progression-(\d+)$/.exec(step || '')?.[1];
    const plan = this._progressionPlan();
    const levelChoices = progressionLevel
      ? plan.choices.filter((choice) => choice.level === Number(progressionLevel))
      : [];
    const abilityChoices = levelChoices.filter((choice) => choice.kind === 'ability-improvement' || choice.kind === 'epic-boon');
    const choice = abilityChoices[0];
    const selection = choice ? this._data.progressionSelections[choice.id] : null;
    const progressionFeats = this._activeProgressionLevel === Number(progressionLevel) ? this._search.feat.results : [];
    const pickedFeat = progressionLevel ? this._progressionFeatEntries[progressionLevel] : null;
    const featDataByChoice = Object.fromEntries(plan.choices.map((entryChoice) => [
      entryChoice.id, this._progressionFeatEntries[entryChoice.level]?.data,
    ]));
    const backgroundMechanics = backgroundMechanicsFor(this._data.background.compendiumData);
    const resolvedBackground = this._data.background.entryId
      ? resolveBackgroundChoices(backgroundMechanics, this._data.backgroundAbilities)
      : { valid: false, bumps: {}, skills: [], tools: [], errors: ['background-required'] };
    const progressionBaseAbilities = Object.fromEntries(ABILITY_KEYS.map((key) => [key,
      Number(this._data.abilities[key]) + (resolvedBackground.bumps[key] || 0)]));
    const resolvedEquipment = this._data.background.entryId
      ? resolveBackgroundEquipment(this._data.background.compendiumData?.identifier, {
        ...this._data.backgroundEquipment, tool: this._data.backgroundAbilities.tool,
      }) : { valid: false, gp: 0, items: [], errors: ['background-required'] };
    const classIdentifierForEquipment = this._data.klass.compendiumData?.classIdentifier || '';
    const resolvedLanguages = resolveCharacterLanguages({
      originLanguages: this._data.originLanguages,
      classIdentifier: classIdentifierForEquipment,
      rogueAdditionalLanguage: this._data.rogueAdditionalLanguage,
    });
    const languageOptions = resolvedLanguages.origin.options.map((name) => ({ name,
      selected: this._data.originLanguages[0] === name }));
    const secondLanguageOptions = resolvedLanguages.origin.options.map((name) => ({ name,
      selected: this._data.originLanguages[1] === name }));
    const rogueLanguageOptions = resolvedLanguages.rogue?.options.map((name) => ({ name,
      selected: this._data.rogueAdditionalLanguage === name })) || [];
    const classSpellProgression = classSpellcastingAtLevel(this._data.klass.compendiumData?.classIdentifier, this._data.level);
    const isWizardCreation = this._data.klass.compendiumData?.classIdentifier === 'wizard';
    const resolvedWizardSpells = isWizardCreation
      ? resolveWizardCreationChoices(this._data.level, this._classSpellEntries, this._data.wizardSpellChoices)
      : { valid: true, cantrips: [], spellbook: [], prepared: [], errors: [] };
    const resolvedClassSpells = classSpellProgression && !isWizardCreation
      ? resolvePreparedClassSpellChoices(this._data.klass.compendiumData.classIdentifier, this._data.level, this._classSpellEntries, this._data.classSpellChoices)
      : { valid: true, cantrips: [], prepared: [], errors: [] };
    const classSpellRows = this._classSpellEntries.filter((entry) => {
      const query = this._search.classSpell.query.trim().toLocaleLowerCase();
      const isRangerFavoredEnemySpell = this._data.klass.compendiumData?.classIdentifier === 'ranger'
        && String(entry.name).toLocaleLowerCase() === "hunter's mark";
      return (!isWizardCreation && !isRangerFavoredEnemySpell
        && Number(entry.data?.spellLevel) <= (classSpellProgression?.maximumSpellLevel || 0))
        && (!query || entry.name.toLocaleLowerCase().includes(query));
    }).slice(0, 40).map((entry) => ({ ...entry, selected: [...this._data.classSpellChoices.cantrips, ...this._data.classSpellChoices.prepared].includes(entry.id) }));
    const wizardSpellLevel = /^wizard-spells-(\d+)$/.exec(step || '')?.[1];
    const wizardPreparedStep = isWizardCreation && step === 'wizard-prepared';
    const wizardStepCounts = wizardSpellLevel ? wizardCreationChoicesAtLevel(Number(wizardSpellLevel)) : null;
    const wizardSelectedSpellIds = new Set([
      ...Object.values(this._data.wizardSpellChoices.spellbookByLevel).flat(),
      ...Object.values(this._data.wizardSpellChoices.cantripsByLevel).flat(),
    ]);
    const wizardPreparedIdSet = new Set(this._data.wizardSpellChoices.prepared);
    const wizardBookRows = resolvedWizardSpells.spellbook.filter((entry) => {
      const query = this._search.classSpell.query.trim().toLocaleLowerCase();
      return !query || entry.name.toLocaleLowerCase().includes(query);
    }).map((entry) => ({
      ...entry,
      selected: wizardPreparedIdSet.has(entry.id),
    }));
    const wizardSpellRows = isWizardCreation && wizardSpellLevel ? this._classSpellEntries.filter((entry) => {
      const query = this._search.classSpell.query.trim().toLocaleLowerCase();
      const spellLevel = Number(entry.data?.spellLevel) || 0;
      return (spellLevel === 0 ? wizardStepCounts.cantripCount > 0 : spellLevel <= wizardStepCounts.maximumSpellLevel)
        && (!query || entry.name.toLocaleLowerCase().includes(query));
    }).slice(0, 80).map((entry) => ({
      ...entry,
      cantripSelected: (this._data.wizardSpellChoices.cantripsByLevel[wizardSpellLevel] || []).includes(entry.id),
      spellbookSelected: (this._data.wizardSpellChoices.spellbookByLevel[wizardSpellLevel] || []).includes(entry.id),
      alreadySelected: wizardSelectedSpellIds.has(entry.id),
    })) : [];
    const pickedMechanics = getFeatMechanics(pickedFeat?.data);
    const pickedSupport = featMechanicsSupport(pickedFeat?.data);
    const pickedAbilityEffect = pickedSupport.valid && pickedMechanics?.support === 'automatic'
      ? pickedMechanics.effects.find((effect) => effect.type === 'ability-score-increase') : null;
    const humanFeatMechanics = getFeatMechanics(this._humanFeatEntry?.data);
    const humanProficiencyEffect = humanFeatMechanics?.effects?.find((effect) => effect.type === 'proficiency');
    const humanFeatChoice = humanFeatMechanics?.choices?.find((choice) => choice.id === humanProficiencyEffect?.parameters?.choiceId);
    const humanFeatChoices = humanFeatChoice?.options?.map((value) => {
      const [kind, ...parts] = value.split(':');
      const key = parts.join(':');
      const chosen = this._data.raceChoices.featChoices || [];
      return { value, label: kind === 'skill' ? SKILL_LABELS[key] || key : key,
        selectedFirst: chosen[0] === value, selectedSecond: chosen[1] === value, selectedThird: chosen[2] === value };
    }) || [];
    const humanFeatGrants = humanProficiencyEffect ? resolveFeatMechanicChoices(this._humanFeatEntry?.data, this._data.raceChoices.featChoices, {
      skills: Object.fromEntries([...resolvedBackground.skills, ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : [])].map((key) => [key, { proficient: true }])),
      tools: resolvedBackground.tools,
    }) : { valid: true, missing: false, skills: [], tools: [], errors: [] };
    const humanChoicesValid = this._data.race.compendiumData?.identifier !== 'human'
      || (isHumanSpeciesChoiceValid(this._data.raceChoices, this._humanFeatEntry, resolvedBackground.skills)
        && isFeatEligibleForProgression(this._humanFeatEntry, 1, { existingNames: [normalizeFeatChoiceName(backgroundMechanics?.feat)] })
        && humanFeatGrants.valid
        && normalizeFeatChoiceName(this._humanFeatEntry?.name) !== normalizeFeatChoiceName(backgroundMechanics?.feat));
    const backgroundHasMagicInitiate = isMagicInitiate(backgroundMechanics?.feat);
    const humanHasMagicInitiate = this._data.race.compendiumData?.identifier === 'human'
      && isMagicInitiate(this._humanFeatEntry?.name);
    const backgroundMagicInitiate = backgroundHasMagicInitiate
      ? resolveMagicInitiateChoices(backgroundMechanics.feat, this._data.magicInitiate.background, this._magicInitiateSpellEntries)
      : { valid: true, spells: [], errors: [] };
    const humanMagicInitiate = humanHasMagicInitiate
      ? resolveMagicInitiateChoices(this._humanFeatEntry.name, this._data.magicInitiate.human, this._magicInitiateSpellEntries,
        backgroundHasMagicInitiate ? [this._data.magicInitiate.background.list].filter(Boolean) : [])
      : { valid: true, spells: [], errors: [] };
    const magicInitiateContext = (owner, featName, current, disallowedLists = []) => {
      const allowedLists = magicInitiateAllowedLists(featName).filter((list) => !disallowedLists.includes(list));
      const list = current.list || (allowedLists.length === 1 ? allowedLists[0] : '');
      const byLevel = (level) => this._magicInitiateSpellEntries
        .filter((entry) => entry.data?.classes?.includes(list) && Number(entry.data.spellLevel) === level)
        .map((entry) => ({ id: entry.id, name: entry.name, selected: false }));
      const cantripOptions = byLevel(0);
      const spellOptions = byLevel(1);
      return {
        owner, list,
        lists: allowedLists.map((value) => ({ value, label: localizeCharacterWizard(`MagicInitiateLists.${value}`), selected: current.list === value })),
        abilities: ['int', 'wis', 'cha'].map((value) => ({ value, label: localizeCharacterWizard(`MagicInitiateAbilities.${value}`), selected: current.ability === value })),
        cantrip1: cantripOptions.map((option) => ({ ...option, selected: current.cantrips?.[0] === option.id })),
        cantrip2: cantripOptions.map((option) => ({ ...option, selected: current.cantrips?.[1] === option.id })),
        spells: spellOptions.map((option) => ({ ...option, selected: current.spell === option.id })),
      };
    };
    const progressionFeatMechanics = getFeatMechanics(pickedFeat?.data);
    const progressionProficiencyEffect = progressionFeatMechanics?.effects?.find((effect) => effect.type === 'proficiency');
    const progressionProficiencyChoice = progressionFeatMechanics?.choices?.find((entry) => entry.id === progressionProficiencyEffect?.parameters?.choiceId);
    const progressionFeatChoiceOptions = (progressionProficiencyChoice?.options || []).map((value) => {
      const [kind, ...parts] = value.split(':');
      const key = parts.join(':');
      const chosen = selection?.featChoices || [];
      return { value, label: kind === 'skill' ? SKILL_LABELS[key] || key : key,
        selectedFirst: chosen[0] === value, selectedSecond: chosen[1] === value, selectedThird: chosen[2] === value };
    });
    const resolved = resolveProgressionChoices(plan, progressionBaseAbilities, this._data.progressionSelections, featDataByChoice, {
      skills: [...resolvedBackground.skills, ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : []), ...humanFeatGrants.skills],
      tools: [...resolvedBackground.tools, ...humanFeatGrants.tools],
    });
    const classProficiencyState = classProficiencyChoiceContext(classIdentifierForEquipment, this._data.classProficiencies,
      [...resolvedBackground.skills, ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : []), ...humanFeatGrants.skills, ...resolved.skills],
      [...resolvedBackground.tools, ...humanFeatGrants.tools, ...resolved.tools]);
    const masteryRequired = weaponMasteryCountAtLevel(classIdentifierForEquipment, Number(this._data.level));
    const masteryProficiencyTypes = CLASS_PROFICIENCIES[classIdentifierForEquipment]?.weapons || [];
    const weaponMasteryChoice = masteryRequired
      ? resolveWeaponMasteryChoices(classIdentifierForEquipment, this._data.weaponMasterySelections,
        masteryProficiencyTypes, masteryRequired)
      : { valid: true, required: 0, options: [] };
    const bardExpertiseLevel = /^bard-expertise-(\d+)$/.exec(step || '')?.[1];
    const bardExistingExpertise = Object.fromEntries((this._data.bardExpertiseChoices?.[2] || []).map((key) => [key, 2]));
    const bardProficientSkills = [...new Set([
      ...resolvedBackground.skills,
      ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : []),
      ...humanFeatGrants.skills, ...resolved.skills, ...classProficiencyState.skills,
    ])];
    const bardExpertiseSkillState = Object.fromEntries(bardProficientSkills.map((key) => [key,
      { proficient: true, multiplier: bardExistingExpertise[key] || 1 }]));
    const bardExpertiseChoice = bardExpertiseLevel
      ? resolveExpertiseChoices(bardExpertiseSkillState, this._data.bardExpertiseChoices?.[bardExpertiseLevel] || [], 2)
      : { valid: true, selected: [], options: [] };
    const allBardExpertiseLevels = classIdentifierForEquipment === 'bard'
      ? [2, 9].filter((value) => value <= Number(this._data.level)) : [];
    const allBardExpertiseSkills = Object.fromEntries(bardProficientSkills.map((key) => [key, { proficient: true }]));
    const resolvedBardExpertise = allBardExpertiseLevels.length
      ? resolveBardExpertiseProgression(allBardExpertiseSkills, this._data.bardExpertiseChoices, allBardExpertiseLevels)
      : { valid: true, selections: {} };
    const hasClassEquipment = classStartingEquipmentPackageOptions(classIdentifierForEquipment).length > 0;
    const resolvedClassEquipment = hasClassEquipment
      ? resolveClassStartingEquipment(classIdentifierForEquipment, {
        ...this._data.classEquipment,
        tool: this._data.classProficiencies.tools?.[0] || '',
      })
      : { valid: true, gp: 0, items: [], errors: [], toolProficiencies: [] };
    const reviewChoices = resolved.decisions.map((decision) => {
      if (decision.kind === 'ability-improvement') return `Level ${decision.level}: ${decision.second ? `+1 ${decision.first.toUpperCase()} / +1 ${decision.second.toUpperCase()}` : `+2 ${decision.first.toUpperCase()}`}`;
      if (decision.kind === 'feat-effect') return `Level ${decision.level}: ${decision.second ? `+1 ${decision.first.toUpperCase()} / +1 ${decision.second.toUpperCase()}` : `+2 ${decision.first.toUpperCase()}`}`;
      if (decision.kind === 'feat-proficiency') return `Level ${decision.level}: ${decision.name} — ${[...decision.skills, ...decision.tools].join(', ')}`;
      if (decision.kind === 'subclass') return `Level ${decision.level}: ${decision.name || this._data.subclass.name}`;
      return `Level ${decision.level}: ${decision.name}`;
    });
    reviewChoices.push(...Object.entries(resolvedBardExpertise.selections)
      .map(([level, skills]) => localizeCharacterWizard('BardExpertiseSummary')
        .replace('{level}', level)
        .replace('{skills}', skills.map((key) => localizeCharacterWizard(`ClassSkills.${key}`)).join(', '))));
    if (masteryRequired) reviewChoices.push(`${classIdentifierForEquipment}: Weapon Mastery — ${this._data.weaponMasterySelections
      .map((id) => weaponMasteryChoice.options.find((weapon) => weapon.identifier === id)?.name || id).join(', ')}`);
    const manualFeatBenefits = resolved.feats.filter((feat) => {
      const support = featMechanicsSupport(this._progressionFeatEntries[feat.level]?.data);
      return !support.valid || support.support !== 'automatic';
    }).map((feat) => ({
      level: feat.level,
      name: feat.name,
      description: this._progressionFeatEntries[feat.level]?.data?.description || '',
    }));
    return {
      ...context,
      _steps: activeSteps.map((s, i) => ({ id: s, active: i === this._step, done: i < this._step })),
      // No `eq` helper exists in this project's Handlebars setup — precompute
      // one boolean per step instead of comparing `_step` in the template.
      _stepIdentity: step === 'identity',
      _stepRace: step === 'race',
      _stepBackground: step === 'background',
      _stepClass: step === 'class',
      _stepLanguages: step === 'languages',
      _originLanguageOneOptions: languageOptions,
      _originLanguageTwoOptions: secondLanguageOptions,
      _originLanguagesValid: resolvedLanguages.origin.valid,
      _rogueLanguageRequired: classIdentifierForEquipment === 'rogue',
      _rogueAdditionalLanguageOptions: rogueLanguageOptions,
      _rogueAdditionalLanguageValid: !resolvedLanguages.rogue || resolvedLanguages.rogue.valid,
      _reviewLanguages: resolvedLanguages.languages.join(', '),
      _stepClassProficiencies: step === 'class-proficiencies',
      _stepWeaponMastery: step === 'weapon-mastery',
      _weaponMasteryRequired: masteryRequired,
      _weaponMasteryValid: weaponMasteryChoice.valid,
      _weaponMasteryCount: this._data.weaponMasterySelections.length,
      _weaponMasteryOptions: weaponMasteryChoice.options.map((weapon) => ({ ...weapon,
        selected: this._data.weaponMasterySelections.includes(weapon.identifier),
      })),
      _stepClassEquipment: step === 'class-equipment',
      _stepProgression: !!progressionLevel,
      _stepBardExpertise: !!bardExpertiseLevel,
      _bardExpertiseLevel: bardExpertiseLevel,
      _bardExpertiseCount: (this._data.bardExpertiseChoices?.[bardExpertiseLevel] || []).length,
      _bardExpertiseOptions: bardExpertiseChoice.options.map((key) => ({ key,
        label: localizeCharacterWizard(`ClassSkills.${key}`),
        selected: (this._data.bardExpertiseChoices?.[bardExpertiseLevel] || []).includes(key),
      })),
      _bardExpertiseChoiceValid: bardExpertiseChoice.valid,
      _progressionLevel: progressionLevel,
      _hasSubclassChoice: levelChoices.some((entry) => entry.kind === 'subclass'),
      _stepSubclass: levelChoices.some((entry) => entry.kind === 'subclass'),
      _hasAbilityChoice: !!choice,
      _isEpicBoonChoice: choice?.kind === 'epic-boon',
      _asiModeScores: selection?.mode !== 'feat',
      _asiModeFeat: selection?.mode === 'feat' || choice?.kind === 'epic-boon',
      _choiceAbilities: ABILITY_KEYS.map((key) => ({
        key, label: ABILITY_LABELS[key], value: this._data.abilities[key],
        selectedFirst: selection?.first === key, selectedSecond: selection?.second === key,
        selectedFeatFirst: selection?.featAbilityFirst === key, selectedFeatSecond: selection?.featAbilitySecond === key,
      })),
      _featResults: progressionFeats.map((entry) => ({ ...withFeatMechanics(entry), progressionLevel: Number(progressionLevel) })),
      _featPicked: !!pickedFeat,
      _featName: pickedFeat?.name || selection?.featName || '',
      _featDescription: pickedFeat?.data?.description || '',
      _featHasAbilityIncrease: !!pickedAbilityEffect,
      _featHasChoices: !!progressionProficiencyEffect,
      _featChoiceOptions: progressionFeatChoiceOptions,
      _featChoiceSummary: (selection?.featChoices || []).map((value) => {
        const [kind, ...parts] = value.split(':');
        const key = parts.join(':');
        return kind === 'skill' ? SKILL_LABELS[key] || key : key;
      }).filter(Boolean).join(', '),
      _featManual: !!pickedFeat && (!pickedSupport.valid || pickedSupport.support !== 'automatic'),
      _featAbilityFirst: selection?.featAbilityFirst || '',
      _featAbilitySecond: selection?.featAbilitySecond || '',
      _featQuery: this._search.feat.query,
      _choiceId: choice?.id || '',
      _stepAbilities: step === 'abilities',
      _stepSpells: step === 'spells' || !!wizardSpellLevel || wizardPreparedStep,
      _stepWizardSpells: isWizardCreation && (!!wizardSpellLevel || wizardPreparedStep),
      _wizardCreationStepLevel: wizardSpellLevel || '',
      _wizardInitialSpellLevel: Number(wizardSpellLevel) === 1,
      _wizardPreparedStep: wizardPreparedStep,
      _wizardStepCounts: wizardStepCounts,
      _wizardCurrentSpellbookPicks: wizardSpellLevel
        ? (this._data.wizardSpellChoices.spellbookByLevel[wizardSpellLevel] || []).map((id) => this._classSpellEntries.find((entry) => entry.id === id)).filter(Boolean)
        : [],
      _wizardCurrentCantripPicks: wizardSpellLevel
        ? (this._data.wizardSpellChoices.cantripsByLevel[wizardSpellLevel] || []).map((id) => this._classSpellEntries.find((entry) => entry.id === id)).filter(Boolean)
        : [],
      _wizardPreparedChoices: this._data.wizardSpellChoices.prepared
        .map((id) => resolvedWizardSpells.spellbook.find((entry) => entry.id === id)).filter(Boolean),
      _wizardPreparedRows: wizardBookRows,
      _wizardPreparedTarget: classSpellProgression?.prepared || 0,
      _wizardCantripCount: wizardSpellLevel
        ? (this._data.wizardSpellChoices.cantripsByLevel[wizardSpellLevel] || []).length
        : resolvedWizardSpells.cantrips.length,
      _wizardSpellbookCount: wizardSpellLevel
        ? (this._data.wizardSpellChoices.spellbookByLevel[wizardSpellLevel] || []).length
        : resolvedWizardSpells.spellbook.length,
      _wizardPreparedCount: this._data.wizardSpellChoices.prepared.length,
      _wizardSpellsValid: resolvedWizardSpells.valid,
      _wizardStartingLevelOnly: false,
      _wizardSpellRows: wizardSpellRows,
      _wizardSpellQuery: this._search.classSpell.query,
      _wizardSpellSearchEmpty: !!wizardSpellLevel && wizardSpellRows.length === 0,
      _wizardPreparedRemaining: Math.max(0, (classSpellProgression?.prepared || 0) - this._data.wizardSpellChoices.prepared.length),
      _stepReview: step === 'review',
      _isFirst: this._step === 0,
      _isLast: this._step === activeSteps.length - 1,
      _activeSteps: activeSteps,
      _data: this._data,
      _abilities: ABILITY_KEYS.map((k) => ({ key: k, label: ABILITY_LABELS[k], value: this._data.abilities[k] })),
      _reviewAbilities: ABILITY_KEYS.map((k) => `${ABILITY_LABELS[k].slice(0, 3)} ${resolved.abilities[k]}`).join(' · '),
      _racePicked: !!this._data.race.entryId,
      _raceQuery: this._search.race.query,
      _raceResults: this._search.race.results,
      _speciesChoice: (() => {
        const rule = speciesChoiceRule(this._data.race.compendiumData?.identifier);
        if (!rule) return null;
        const labelKey = { draconicAncestry: 'DraconicAncestry', giantAncestry: 'GiantAncestry', size: 'SpeciesSize' }[rule.key];
        return {
          key: rule.key,
          label: localizeCharacterWizard(labelKey),
          value: this._data.raceChoices[rule.key] || '',
          options: rule.options.map((key) => ({ key, label: localizeCharacterWizard(`SpeciesChoice.${key}`), selected: this._data.raceChoices[rule.key] === key })),
        };
      })(),
      // Size is a required pick but is not a trait effect, so it does not carry the manual-handling hint.
      _speciesChoiceManual: (() => {
        const rule = speciesChoiceRule(this._data.race.compendiumData?.identifier);
        return !!rule && rule.key !== 'size';
      })(),
      _humanSpecies: this._data.race.compendiumData?.identifier === 'human',
      _humanSkillOptions: Object.entries(SKILL_LABELS)
        .filter(([key]) => !resolvedBackground.skills.includes(key))
        .map(([key, label]) => ({ key, label, selected: this._data.raceChoices.skillful === key })),
      _humanFeatPicked: !!this._humanFeatEntry,
      _humanFeatName: this._humanFeatEntry?.name || '',
      _humanFeatQuery: this._search.speciesFeat.query,
      _humanFeatResults: this._search.speciesFeat.results,
      _humanFeatManual: !!this._humanFeatEntry && !isMagicInitiate(this._humanFeatEntry.name)
        && (!featMechanicsSupport(this._humanFeatEntry.data).valid || featMechanicsSupport(this._humanFeatEntry.data).support !== 'automatic'),
      _humanFeatChoiceSummary: (this._data.raceChoices.featChoices || []).map((value) => {
        const [kind, ...parts] = value.split(':');
        const key = parts.join(':');
        return kind === 'skill' ? SKILL_LABELS[key] || key : key;
      }).filter(Boolean).join(', '),
      _humanFeatHasChoices: !!humanProficiencyEffect,
      _humanFeatChoices: humanFeatChoices,
      _humanFeatChoiceValid: humanFeatGrants.valid,
      _humanChoicesValid: humanChoicesValid,
      _speciesChoiceReview: (() => {
        const choice = speciesChoiceRule(this._data.race.compendiumData?.identifier);
        const value = choice && choice.key !== 'size' && this._data.raceChoices[choice.key];
        return value ? `${localizeCharacterWizard(choice.key === 'draconicAncestry' ? 'DraconicAncestry' : 'GiantAncestry')}: ${localizeCharacterWizard(`SpeciesChoice.${value}`)}` : '';
      })(),
      _backgroundPicked: !!this._data.background.entryId,
      _backgroundQuery: this._search.background.query,
      _backgroundResults: this._search.background.results,
      _backgroundAbilities: (backgroundMechanics?.abilities || []).map((key) => ({
        key, label: ABILITY_LABELS[key], value: progressionBaseAbilities[key],
        selectedFirst: this._data.backgroundAbilities.first === key,
        selectedSecond: this._data.backgroundAbilities.second === key,
      })),
      _backgroundSpread: !!this._data.backgroundAbilities.spread,
      _backgroundHasToolChoice: !!backgroundMechanics?.toolOptions?.length,
      _backgroundToolOptions: (backgroundMechanics?.toolOptions || []).map((value) => ({
        value, selected: this._data.backgroundAbilities.tool === value,
        label: localizeCharacterWizard(`GamingSetChoice.${value.split(': ').at(-1).toLocaleLowerCase().replaceAll(' ', '-')}`),
      })),
      _backgroundEquipmentOptions: backgroundEquipmentPackageOptions(this._data.background.compendiumData?.identifier)
        .map((value) => ({ value, label: localizeCharacterWizard(value === 'A' ? 'EquipmentPackageA' : 'EquipmentPackageB'), selected: this._data.backgroundEquipment.package === value })),
      _backgroundEquipmentNeedsHolySymbol: this._data.background.compendiumData?.identifier === 'acolyte'
        && this._data.backgroundEquipment.package === 'A',
      _holySymbolOptions: ['amulet', 'emblem', 'reliquary'].map((value) => ({
        value, label: localizeCharacterWizard(`HolySymbol.${value}`), selected: this._data.backgroundEquipment.holySymbol === value,
      })),
      _backgroundEquipmentSummary: resolvedEquipment.items.map((entry) => `${entry.data.quantity > 1 ? `${entry.data.quantity}× ` : ''}${entry.name}`).concat(resolvedEquipment.gp ? [`${resolvedEquipment.gp} ${localizeCharacterWizard('GoldAbbreviation')}`] : []).join(', '),
      _backgroundEquipmentValid: resolvedEquipment.valid,
      _classEquipmentOptions: classStartingEquipmentPackageOptions(classIdentifierForEquipment).map((value) => ({
        value, label: localizeCharacterWizard(`ClassEquipmentPackages.${classIdentifierForEquipment}.${value}`),
        selected: this._data.classEquipment.package === value,
      })),
      _classEquipmentChoices: this._data.classEquipment.package === 'A'
        ? classStartingEquipmentChoices(classIdentifierForEquipment).map((choice) => ({
          label: localizeCharacterWizard(choice.label),
          name: `w:classEquipment.${choice.field}`,
          options: choice.options.map(([value, label]) => ({
            value, label: localizeCharacterWizard(label),
            selected: this._data.classEquipment[choice.field] === value,
          })),
        })) : [],
      _classEquipmentValid: resolvedClassEquipment.valid,
      _classEquipmentSummary: resolvedClassEquipment.valid
        ? resolvedClassEquipment.items.map((entry) => `${entry.data.quantity > 1 ? `${entry.data.quantity}× ` : ''}${entry.name}`)
          .concat(resolvedClassEquipment.gp ? [`${resolvedClassEquipment.gp} ${localizeCharacterWizard('GoldAbbreviation')}`] : []).join(', ')
        : '',
      _classProficiencySkillChoiceCount: classProficiencyState.skillCount,
      _classProficiencyToolChoiceCount: classProficiencyState.toolChoiceCount,
      _classProficiencySkillChoices: Array.from({ length: classProficiencyState.skillCount }, (_, index) => {
        const selected = this._data.classProficiencies.skills?.[index] || '';
        const otherSelections = new Set((this._data.classProficiencies.skills || []).filter((_, optionIndex) => optionIndex !== index));
        return {
          label: localizeCharacterWizard(`ProficiencyChoice${index + 1}`),
          name: `w:classProficiencies.skills.${index}`,
          options: classProficiencyState.skillOptions.filter((key) => key === selected || !otherSelections.has(key))
            .map((key) => ({ value: key, label: localizeCharacterWizard(`ClassSkills.${key}`), selected: selected === key })),
        };
      }),
      _classProficiencyToolChoices: Array.from({ length: classProficiencyState.toolChoiceCount }, (_, index) => {
        const selected = this._data.classProficiencies.tools?.[index] || '';
        const otherSelections = new Set((this._data.classProficiencies.tools || []).filter((_, optionIndex) => optionIndex !== index));
        return {
          label: localizeCharacterWizard(`ClassToolChoice${index + 1}`),
          name: `w:classProficiencies.tools.${index}`,
          options: classProficiencyState.toolOptions.filter(({ value }) => value === selected || !otherSelections.has(value))
            .map(({ value, label }) => ({ value, label: localizeCharacterWizard(label), selected: selected === value })),
        };
      }),
      _classProficienciesValid: classProficiencyState.valid,
      _classProficiencySummary: classProficiencyState.valid
        ? [
          ...classProficiencyState.saves.map((key) => localizeCharacterWizard(`ClassAbilities.${key}`)),
          ...classProficiencyState.skills.map((key) => localizeCharacterWizard(`ClassSkills.${key}`)),
          ...classProficiencyState.tools.map((tool) => localizeCharacterWizard(`ClassProficiencyTools.${tool}`)),
        ].join(', ')
        : '',
      _backgroundValid: resolvedBackground.valid && ABILITY_KEYS.every((key) => progressionBaseAbilities[key] <= 20),
      _backgroundFeatName: backgroundMechanics?.feat || '',
      _backgroundFeatManual: !!backgroundMechanics?.feat && !isMagicInitiate(backgroundMechanics.feat),
      _backgroundFeatAvailable: !!this._backgroundFeatEntry,
      _backgroundMagicInitiate: backgroundHasMagicInitiate
        ? magicInitiateContext('background', backgroundMechanics.feat, this._data.magicInitiate.background) : null,
      _humanMagicInitiate: humanHasMagicInitiate
        ? magicInitiateContext('human', this._humanFeatEntry.name, this._data.magicInitiate.human,
          backgroundHasMagicInitiate ? [this._data.magicInitiate.background.list].filter(Boolean) : []) : null,
      _magicInitiateBackgroundValid: backgroundMagicInitiate.valid,
      _magicInitiateHumanValid: humanMagicInitiate.valid,
      _magicInitiateChoicesValid: backgroundMagicInitiate.valid && humanMagicInitiate.valid,
      _backgroundMagicInitiateSummary: backgroundMagicInitiate.valid && backgroundMagicInitiate.spells.length
        ? `${localizeCharacterWizard(`MagicInitiateLists.${backgroundMagicInitiate.list}`)} / ${localizeCharacterWizard(`MagicInitiateAbilities.${backgroundMagicInitiate.ability}`)}: ${backgroundMagicInitiate.spells.map((spell) => spell.name).join(', ')}` : '',
      _humanMagicInitiateSummary: humanMagicInitiate.valid && humanMagicInitiate.spells.length
        ? `${localizeCharacterWizard(`MagicInitiateLists.${humanMagicInitiate.list}`)} / ${localizeCharacterWizard(`MagicInitiateAbilities.${humanMagicInitiate.ability}`)}: ${humanMagicInitiate.spells.map((spell) => spell.name).join(', ')}` : '',
      _klassPicked: !!this._data.klass.entryId,
      _klassQuery: this._search.klass.query,
      _klassResults: this._search.klass.results,
      _subclassPicked: !!this._data.subclass.entryId,
      _subclassQuery: this._search.subclass.query,
      _subclassResults: this._search.subclass.results,
      _reviewRaceInfo: this._data.race.compendiumData ? `${this._data.race.compendiumData.size || ''}, ${this._data.race.compendiumData.movement?.walk ?? ''} m` : '',
      _reviewHitDie: this._data.klass.compendiumData?.hitDie || '',
      _reviewStartingHp: startingHitPoints(
        this._data.klass.compendiumData?.hitDie || 'd8',
        Math.min(20, Math.max(1, Number(this._data.level) || 1)),
        Math.floor((resolved.abilities.con - 10) / 2),
        { maxAtFirstLevel: getSetting('maxHpFirstLevel', true) },
      ),
      _reviewSubclass: this._data.subclass.name || '',
      _reviewProgressionChoices: reviewChoices,
      _classSpellProgression: classSpellProgression,
      _bardCreation: this._data.klass.compendiumData?.classIdentifier === 'bard',
      _sorcererCreation: this._data.klass.compendiumData?.classIdentifier === 'sorcerer',
      _warlockCreation: this._data.klass.compendiumData?.classIdentifier === 'warlock',
      _paladinCreation: this._data.klass.compendiumData?.classIdentifier === 'paladin',
      _rangerCreation: this._data.klass.compendiumData?.classIdentifier === 'ranger',
      _classSpellQuery: this._search.classSpell.query,
      _classSpellResults: classSpellRows,
      _classSpellCantrips: resolvedClassSpells.cantrips,
      _classSpellPrepared: resolvedClassSpells.prepared,
      _classSpellChoicesValid: resolvedClassSpells.valid,
      _classSpellCantripCount: resolvedClassSpells.cantrips.length,
      _classSpellPreparedCount: resolvedClassSpells.prepared.length,
      _classSpellCantripsRemaining: Math.max(0, (classSpellProgression?.cantrips || 0) - resolvedClassSpells.cantrips.length),
      _classSpellPreparedRemaining: Math.max(0, (classSpellProgression?.prepared || 0) - resolvedClassSpells.prepared.length),
      _rangerFavoredEnemyRequired: this._data.klass.compendiumData?.classIdentifier === 'ranger',
      _classSpellSummary: isWizardCreation
        ? `${localizeCharacterWizard('WizardSpellbook')}: ${resolvedWizardSpells.spellbook.map((spell) => `${spell.name} (${localizeCharacterWizard('Level')} ${spell.learnedAtWizardLevel})`).join(', ')}; ${localizeCharacterWizard('WizardCantrips')}: ${resolvedWizardSpells.cantrips.map((spell) => `${spell.name} (${localizeCharacterWizard('Level')} ${spell.learnedAtWizardLevel})`).join(', ')}; ${localizeCharacterWizard('WizardPrepared')}: ${resolvedWizardSpells.prepared.map((spell) => spell.name).join(', ')}`
        : [...resolvedClassSpells.cantrips, ...resolvedClassSpells.prepared].map((spell) => spell.name).join(', '),
      _progressionChoicesValid: resolved.valid,
      _manualFeatBenefits: manualFeatBenefits,
      _canCreate: resolved.valid && resolvedBackground.valid && resolvedEquipment.valid && resolvedClassEquipment.valid && classProficiencyState.valid && weaponMasteryChoice.valid && resolvedBardExpertise.valid && resolvedLanguages.valid && ABILITY_KEYS.every((key) => progressionBaseAbilities[key] <= 20)
        && !!this._data.name.trim()
        && isSpeciesChoiceValid(this._data.race.compendiumData?.identifier, this._data.raceChoices)
        && !!this._data.klass.entryId && !!this._data.background.entryId && !!this._backgroundFeatEntry?.data
        && humanChoicesValid && backgroundMagicInitiate.valid && humanMagicInitiate.valid && resolvedClassSpells.valid && resolvedWizardSpells.valid
        && !this._creating && !this._creationBlocked && !creationJournal,
      _creationRecovery: creationJournal ? {
        actorName: creationJournal.actorName,
        actorId: creationJournal.actor?.id || '',
        status: creationJournal.status,
        canResume: creationJournalCanResume(creationJournal),
        unknownStep: creationJournal.actor?.status === 'unknown'
          ? localizeCharacterWizard('CreationActorStep')
          : creationJournal.operations?.find(({ status }) => status === 'unknown' || status === 'in-flight')?.label || '',
        completed: creationJournal.operations?.filter(({ status }) => status === 'complete').length || 0,
        total: creationJournal.operations?.length || 0,
      } : null,
    };
  }

  /**
   * `_onChangeForm` below is never invoked on its own — `document-sheet.ts`
   * is what wires `input`/`change` listeners to it, but this wizard extends
   * `LoomHandlebarsMixin(BaseWindow)` directly (no document, nothing to
   * sheet), so nothing ever called it. Every keystroke updated the DOM
   * input but never `this._data`, so `this._data.name` stayed `''` forever
   * and "Give the character a name first" fired no matter what was typed
   * (found live). Wired here instead of in the shared engine (application.ts)
   * because that same mount() is shared with `LoomDocumentSheet`, which
   * already attaches its own `input`/`change` listeners — adding another
   * pair there would double-fire `_onChangeForm` on every actor/item sheet
   * keystroke (the exact "two auto-save triggers, one save" bug already
   * described in base-window.ts's `wireSubmitOnChange`). `this.element`
   * persists across `rerenderBody()` (only `.sheet-part` children are
   * swapped), so a listener attached once here at first mount keeps
   * catching bubbled events from every step's re-rendered content.
   */
  async mount() {
    await super.mount();
    if (this._changeListenerWired) return;
    this._changeListenerWired = true;
    this.element.addEventListener('input', (e) => this._onChangeForm(e));
    this.element.addEventListener('change', (e) => this._onChangeForm(e));
  }

  _onChangeForm(event) {
    const target = event.target;
    // Search boxes are marked with `data-wizard-search="race"|"klass"` instead
    // of a `w:` name — they drive a debounced compendium search, not a plain
    // `_data` write.
    const searchKind = target?.dataset?.wizardSearch;
    if (searchKind && this._search[searchKind]) {
      const bucket = this._search[searchKind];
      bucket.query = target.value;
      if (searchKind === 'classSpell') { void this.render(); return; }
      clearTimeout(bucket.timer);
      bucket.timer = setTimeout(() => void this._runSearch(searchKind), 300);
      return;
    }
    if (!target?.name?.startsWith('w:')) return;
    const path = target.name.slice(2);
    if (path === 'weaponMasterySelections') {
      const selected = new Set(this._data.weaponMasterySelections);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      this._data.weaponMasterySelections = [...selected];
      void this.render();
      return;
    }
    const expertiseMatch = /^bardExpertiseChoices\.(\d+)$/.exec(path);
    if (expertiseMatch) {
      const level = expertiseMatch[1];
      const selected = new Set(this._data.bardExpertiseChoices[level] || []);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      this._data.bardExpertiseChoices[level] = [...selected];
      void this.render();
      return;
    }
    const value = target.type === 'number' ? Number(target.value) : target.type === 'checkbox' ? target.checked : target.value;
    const keys = path.split('.');
    const featChoiceMatch = /^featChoice([123])$/.exec(keys.at(-1));
    if ((keys[0] === 'raceChoices' || keys[0] === 'progressionSelections') && featChoiceMatch) {
      const selection = keys[0] === 'raceChoices' ? this._data.raceChoices : this._data.progressionSelections[keys[1]];
      const choices = [...(selection.featChoices || [])];
      choices[Number(featChoiceMatch[1]) - 1] = value;
      selection.featChoices = choices;
      void this.render();
      return;
    }
    let obj = this._data;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    if (keys[0] === 'magicInitiate' && keys.at(-1) === 'list') {
      this._data.magicInitiate[keys[1]].cantrips = ['', ''];
      this._data.magicInitiate[keys[1]].spell = '';
    }
    if (keys[0] === 'progressionSelections' && keys.at(-1) === 'mode' && value === 'feat') {
      const choice = this._progressionPlan().choices.find((entry) => entry.id === keys[1]);
      this._activeProgressionLevel = choice?.level ?? null;
      if (!this._search.feat.results.length && !this._search.feat.query) void this._runSearch('feat');
    } else if (keys[0] === 'progressionSelections' && keys.at(-1) === 'mode' && value === 'scores') {
      const choice = this._progressionPlan().choices.find((entry) => entry.id === keys[1]);
      if (choice) {
        const selection = this._data.progressionSelections[choice.id];
        selection.featName = '';
        selection.featEntryId = '';
        delete this._progressionFeatEntries[choice.level];
        this._search.feat.query = '';
        this._search.feat.results = [];
      }
    }
  }

  async _runSearch(kind) {
    const entryType = kind === 'klass' ? 'class' : kind === 'speciesFeat' ? 'feat' : kind;
    const includeData = kind === 'race' || kind === 'subclass' || kind === 'feat' || kind === 'speciesFeat' || kind === 'background';
    const queryAtRequest = this._search[kind].query;
    const progressionLevelAtRequest = this._activeProgressionLevel;
    let results = await searchCompendiumEntries(entryType, queryAtRequest, includeData);
    if (kind === 'subclass') {
      const classIdentifier = this._data.klass?.compendiumData?.classIdentifier || '';
      if (classIdentifier) results = results.filter((e) => (e.data?.classIdentifier || '') === classIdentifier);
    } else if (kind === 'feat') {
      const plan = this._progressionPlan();
      const choice = plan.choices.find((entry) => entry.level === this._activeProgressionLevel
        && (entry.kind === 'ability-improvement' || entry.kind === 'epic-boon'));
      const epicBoon = choice?.kind === 'epic-boon';
      const selectedNames = Object.values(this._progressionFeatEntries).map((entry) => entry?.name);
      results = results.map(withFeatMechanics).filter((entry) => isFeatEligibleForProgression(entry, Number(this._activeProgressionLevel), {
        epicBoon,
        selectedNames,
      }));
    } else if (kind === 'race') {
      results = speciesVariantEntries(results);
    } else if (kind === 'speciesFeat') {
      const mechanics = backgroundMechanicsFor(this._data.background.compendiumData);
      const existingNames = mechanics?.feat ? [normalizeFeatChoiceName(mechanics.feat)] : [];
      results = results.map(withFeatMechanics).filter((entry) => isFeatEligibleForProgression(entry, 1, { existingNames }));
    }
    // The query may have changed again while this request was in flight — a
    // stale response landing after a newer one would flash the wrong list.
    if (this._search[kind].query !== queryAtRequest
      || (kind === 'feat' && this._activeProgressionLevel !== progressionLevelAtRequest)) return;
    this._search[kind].results = results;
    await this.render();
  }

  async _pickCompendiumEntry(kind, sourceId, entryId) {
    if (!sourceId || !entryId) return;
    let entry;
    try {
      // `api.get` returns the parsed body as-is, never `{data: ...}`-wrapped
      // (see client/core/api.ts's `request()`) — the entry's OWN `data` field
      // (its mechanical fields) is what becomes `compendiumData` below, the
      // entry object itself (id/name/type/data) is `entry`. `sourceId` looks
      // like `local::srd5e::packs/races.sqlite` — the embedded `/` splits an
      // un-encoded URL into extra path segments Express's `:sourceId` never
      // matches (404, found live) — encodeURIComponent it, same convention
      // compendium-source-window.ts already uses everywhere it builds one of
      // these URLs.
      entry = await api.get(`/compendium/browse/sources/${encodeURIComponent(sourceId)}/entries/${entryId}`);
    } catch (err) {
      console.warn('[srd5e] Failed to fetch compendium entry:', err);
      showToast?.('Failed to load that entry.', 'error');
      return;
    }
    if (!entry) return;

    const map = { klass: this._data.klass, race: this._data.race, subclass: this._data.subclass, background: this._data.background };
    const bucket = map[kind];
    if (!bucket) return;
    bucket.sourceId = sourceId;
    bucket.entryId = entryId;
    bucket.name = entry.name;
    bucket.compendiumData = entry.data || {};
    if (kind === 'klass') {
      this._data.classEquipment = { package: '', instrument: '', tool: '', holySymbol: '' };
      this._data.classProficiencies = { skills: [], tools: [] };
      this._data.weaponMasterySelections = [];
      this._data.rogueAdditionalLanguage = '';
      this._data.classSpellChoices = { cantrips: [], prepared: [] };
      this._data.wizardSpellChoices = { cantripsByLevel: {}, spellbookByLevel: {}, prepared: [] };
      this._classSpellEntries = [];
      this._search.classSpell.query = '';
    }
    if (kind === 'race') {
      this._data.raceChoices = {};
      this._humanFeatEntry = null;
    }
    if (kind === 'subclass') {
      const choice = this._progressionPlan().choices.find((entryChoice) => entryChoice.level === this._activeProgressionLevel
        && entryChoice.kind === 'subclass');
      if (choice) Object.assign(this._data.progressionSelections[choice.id], { selected: true, name: entry.name });
    }
    if (kind === 'background') {
      this._data.backgroundAbilities = { spread: false, first: '', second: '', tool: '' };
      this._data.backgroundEquipment = { package: '', holySymbol: '' };
      this._data.magicInitiate.background = { list: '', ability: '', cantrips: ['', ''], spell: '' };
      this._backgroundFeatEntry = null;
      const mechanics = backgroundMechanicsFor(bucket.compendiumData);
      if (mechanics?.feat) {
        const targetName = mechanics.feat.replace(/\s*\([^)]*\)\s*$/, '').toLocaleLowerCase();
        const matches = await searchCompendiumEntries('feat', targetName, true);
        this._backgroundFeatEntry = matches.find((candidate) => candidate.name.toLocaleLowerCase() === targetName
          && isFeatEligibleForProgression(candidate, 1)) || null;
        if (isMagicInitiate(mechanics.feat)) {
          const lists = magicInitiateAllowedLists(mechanics.feat);
          this._data.magicInitiate.background.list = lists.length === 1 ? lists[0] : '';
          await this._loadMagicInitiateSpells();
        }
      }
    }
    this._search[kind].results = [];
    this._search[kind].query = entry.name;
    // Changing class invalidates a previously picked subclass from another class.
    if (kind === 'klass') {
      this._data.classEquipment = { package: '', instrument: '', tool: '', holySymbol: '' };
      this._data.classProficiencies = { skills: [], tools: [] };
      this._data.rogueAdditionalLanguage = '';
      this._data.progressionSelections = {};
      this._progressionFeatEntries = {};
      this._data.classSpellChoices = { cantrips: [], prepared: [] };
      this._data.wizardSpellChoices = { cantripsByLevel: {}, spellbookByLevel: {}, prepared: [] };
      this._classSpellEntries = [];
      this._search.classSpell.query = '';
    }
    if (kind === 'klass' && this._data.subclass.entryId) {
      const newId = entry.data?.classIdentifier || '';
      const subId = this._data.subclass.compendiumData?.classIdentifier || '';
      if (newId !== subId) await this._clearPick('subclass');
    }
    await this.render();
    if (kind === 'race' && entry.data?.identifier === 'human') {
      this._search.speciesFeat.query = '';
      this._search.speciesFeat.results = [];
      void this._runSearch('speciesFeat');
    }
  }

  async _loadMagicInitiateSpells() {
    if (this._magicInitiateSpellEntries.length) return;
    this._magicInitiateSpellEntries = await searchCompendiumEntries('spell', '', true);
  }

  async _loadClassSpellEntries() {
    if (this._classSpellEntries.length) return;
    const classIdentifier = this._data.klass?.compendiumData?.classIdentifier || '';
    if (!['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'paladin', 'ranger', 'wizard'].includes(classIdentifier)) return;
    const entries = await searchCompendiumEntries('spell', '', true);
    this._classSpellEntries = entries.filter((entry) => entry.data?.classes?.includes(classIdentifier));
  }

  _toggleClassSpell(id) {
    const entry = this._classSpellEntries.find((candidate) => candidate.id === id);
    const progression = classSpellcastingAtLevel(this._data.klass?.compendiumData?.classIdentifier, this._data.level);
    if (!entry || !progression) return;
    const cantrips = Number(entry.data?.spellLevel) === 0;
    const bucket = cantrips ? this._data.classSpellChoices.cantrips : this._data.classSpellChoices.prepared;
    const index = bucket.indexOf(id);
    if (index >= 0) bucket.splice(index, 1);
    else {
      const maximum = cantrips ? progression.cantrips : progression.prepared;
      if (bucket.length >= maximum) {
        showToast?.(localizeCharacterWizard(cantrips ? 'ClassCantripLimitReached' : 'ClassPreparedSpellLimitReached'), 'warning');
        return;
      }
      bucket.push(id);
    }
    void this.render();
  }

  _toggleWizardSpell(kind, id) {
    const entry = this._classSpellEntries.find((candidate) => candidate.id === id);
    if (!entry || !['cantrips', 'spellbook', 'prepared'].includes(kind)) return;
    const choices = this._data.wizardSpellChoices;
    const stepId = this._activeSteps()[this._step] || '';
    const spellStepLevel = Number(/^wizard-spells-(\d+)$/.exec(stepId)?.[1]);
    const targetLevel = Number(this._data.level);
    const isPreparedStep = stepId === 'wizard-prepared';
    if (kind === 'prepared') {
      if (!isPreparedStep || Number(entry.data?.spellLevel) < 1) return;
    } else if (!spellStepLevel || stepId !== `wizard-spells-${spellStepLevel}`) return;
    const counts = spellStepLevel ? wizardCreationChoicesAtLevel(spellStepLevel) : null;
    if (kind === 'cantrips' && Number(entry.data?.spellLevel) !== 0) return;
    if (kind === 'spellbook' && (!counts || Number(entry.data?.spellLevel) < 1
      || Number(entry.data?.spellLevel) > counts.maximumSpellLevel)) return;
    const allBookIds = Object.values(choices.spellbookByLevel).flat();
    const allCantripIds = Object.values(choices.cantripsByLevel).flat();
    if (kind === 'prepared' && !allBookIds.includes(id)) return;
    const bucket = kind === 'prepared'
      ? choices.prepared
      : kind === 'spellbook'
        ? (choices.spellbookByLevel[spellStepLevel] ||= [])
        : (choices.cantripsByLevel[spellStepLevel] ||= []);
    const index = bucket.indexOf(id);
    if (index >= 0) {
      bucket.splice(index, 1);
      if (kind === 'spellbook') choices.prepared = choices.prepared.filter((spellId) => spellId !== id);
    } else {
      if (kind !== 'prepared' && (allBookIds.includes(id) || allCantripIds.includes(id))) return;
      const maximum = kind === 'prepared'
        ? classSpellcastingAtLevel('wizard', targetLevel)?.prepared
        : kind === 'spellbook' ? counts.spellbookCount : counts.cantripCount;
      if (bucket.length >= maximum) {
        showToast?.(localizeCharacterWizard('WizardSpellLimitReached'), 'warning');
        return;
      }
      bucket.push(id);
    }
    void this.render();
  }

  async _clearPick(kind) {
    const map = { klass: this._data.klass, race: this._data.race, subclass: this._data.subclass, background: this._data.background };
    const bucket = map[kind];
    if (!bucket) return;
    bucket.sourceId = '';
    bucket.entryId = '';
    bucket.name = '';
    bucket.compendiumData = null;
    if (kind === 'klass') {
      this._data.classEquipment = { package: '', instrument: '', tool: '', holySymbol: '' };
      this._data.classProficiencies = { skills: [], tools: [] };
      this._data.progressionSelections = {};
      this._progressionFeatEntries = {};
      this._data.classSpellChoices = { cantrips: [], prepared: [] };
      this._data.wizardSpellChoices = { cantripsByLevel: {}, spellbookByLevel: {}, prepared: [] };
      this._classSpellEntries = [];
      this._search.classSpell.query = '';
    } else if (kind === 'subclass') {
      const choice = this._progressionPlan().choices.find((entry) => entry.kind === 'subclass');
      if (choice) Object.assign(this._data.progressionSelections[choice.id], { selected: false, name: '' });
    } else if (kind === 'background') {
      this._data.backgroundAbilities = { spread: false, first: '', second: '', tool: '' };
      this._data.backgroundEquipment = { package: '', holySymbol: '' };
      this._backgroundFeatEntry = null;
    } else if (kind === 'race') {
      this._data.raceChoices = {};
      this._humanFeatEntry = null;
    }
    this._search[kind].query = '';
    this._search[kind].results = [];
    await this.render();
  }

  onAction(action, id, target) {
    if (action === 'wizard-next') { this._goStep(this._step + 1); return; }
    if (action === 'wizard-back') { this._goStep(this._step - 1); return; }
    if (action === 'wizard-standard-array') { void this._fillStandardArray(); return; }
    if (action === 'wizard-create') { void this._create(); return; }
    if (action === 'wizard-resume-creation') { void this._resumeCreation(); return; }
    if (action === 'wizard-acknowledge-creation-review') { this._acknowledgeCreationReview(); return; }
    if (action === 'wizard-toggle-class-spell') { this._toggleClassSpell(id); return; }
    if (action === 'wizard-toggle-wizard-cantrip') { this._toggleWizardSpell('cantrips', id); return; }
    if (action === 'wizard-toggle-wizard-book') { this._toggleWizardSpell('spellbook', id); return; }
    if (action === 'wizard-toggle-wizard-prepared') { this._toggleWizardSpell('prepared', id); return; }
    if (action === 'wizard-pick-race') { void this._pickCompendiumEntry('race', target.dataset.sourceId, id); return; }
    if (action === 'wizard-pick-background') { void this._pickCompendiumEntry('background', target.dataset.sourceId, id); return; }
    if (action === 'wizard-pick-human-feat') {
      this._humanFeatEntry = this._search.speciesFeat.results.find((entry) => entry.id === id) || null;
      this._data.raceChoices.versatileFeat = this._humanFeatEntry?.name || '';
      this._data.magicInitiate.human = { list: '', ability: '', cantrips: ['', ''], spell: '' };
      if (isMagicInitiate(this._humanFeatEntry?.name)) void this._loadMagicInitiateSpells().then(() => this.render());
      this._search.speciesFeat.query = this._humanFeatEntry?.name || '';
      this._search.speciesFeat.results = [];
      void this.render();
      return;
    }
    if (action === 'wizard-clear-human-feat') {
      this._humanFeatEntry = null;
      this._data.raceChoices.versatileFeat = '';
      this._search.speciesFeat.query = '';
      void this._runSearch('speciesFeat');
      return;
    }
    if (action === 'wizard-pick-klass') { void this._pickCompendiumEntry('klass', target.dataset.sourceId, id); return; }
    if (action === 'wizard-pick-subclass') { void this._pickCompendiumEntry('subclass', target.dataset.sourceId, id); return; }
    if (action === 'wizard-pick-feat') {
      const level = Number(target.dataset.level);
      const entry = this._search.feat.results.find((candidate) => candidate.id === id);
      if (entry && Number.isInteger(level)) {
        const choice = this._progressionPlan().choices.find((entryChoice) => entryChoice.level === level
          && (entryChoice.kind === 'ability-improvement' || entryChoice.kind === 'epic-boon'));
        if (choice) {
          this._progressionFeatEntries[level] = entry;
          Object.assign(this._data.progressionSelections[choice.id], {
            featName: entry.name, featEntryId: entry.id, featAbilityFirst: '', featAbilitySecond: '',
          });
          this._search.feat.query = entry.name;
          this._search.feat.results = [];
          void this.render();
        }
      }
      return;
    }
    if (action === 'wizard-clear-feat') {
      const level = Number(target.dataset.level);
      const choice = this._progressionPlan().choices.find((entry) => entry.level === level
        && (entry.kind === 'ability-improvement' || entry.kind === 'epic-boon'));
      if (choice) {
        this._data.progressionSelections[choice.id].featName = '';
        this._data.progressionSelections[choice.id].featEntryId = '';
        delete this._progressionFeatEntries[level];
        this._activeProgressionLevel = level;
        this._search.feat.query = '';
        this._search.feat.results = [];
        void this._runSearch('feat');
      }
      return;
    }
    if (action === 'wizard-clear-race') { void this._clearPick('race'); return; }
    if (action === 'wizard-clear-background') { void this._clearPick('background'); return; }
    if (action === 'wizard-clear-klass') { void this._clearPick('klass'); return; }
    if (action === 'wizard-clear-subclass') { void this._clearPick('subclass'); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  _goStep(next) {
    const activeSteps = this._activeSteps();
    if (next < 0 || next >= activeSteps.length) return;
    if (next > this._step && activeSteps[this._step] === 'identity' && !this._data.name.trim()) {
      showToast?.('Give the character a name first.', 'warning');
      return;
    }
    this._step = next;
    const stepId = activeSteps[next];
    const progressionLevel = /^progression-(\d+)$/.exec(stepId || '')?.[1];
    const previousProgressionLevel = this._activeProgressionLevel;
    this._activeProgressionLevel = progressionLevel ? Number(progressionLevel) : null;
    if (this._activeProgressionLevel !== previousProgressionLevel) {
      this._search.feat.query = '';
      this._search.feat.results = [];
    }
    const levelChoices = this._progressionPlan().choices.filter((choice) => choice.level === Number(progressionLevel));
    const featChoice = levelChoices.find((choice) => choice.kind === 'ability-improvement' || choice.kind === 'epic-boon');
    const featMode = featChoice && (featChoice.kind === 'epic-boon'
      || this._data.progressionSelections[featChoice.id]?.mode === 'feat');
    void this.render();
    if (stepId === 'spells') void this._loadClassSpellEntries().then(() => this.render());
    const kind = stepId === 'race' ? 'race' : stepId === 'background' ? 'background' : stepId === 'class' ? 'klass'
      : levelChoices.some((choice) => choice.kind === 'subclass') && !this._data.subclass.entryId ? 'subclass'
        : featMode ? 'feat' : null;
    if (kind && kind !== 'feat' && !this._data[kind === 'klass' ? 'klass' : kind].entryId && !this._search[kind].results.length && !this._search[kind].query) {
      void this._runSearch(kind);
    } else if (kind === 'feat' && !this._progressionFeatEntries[progressionLevel]
      && !this._search.feat.results.length && !this._search.feat.query) {
      void this._runSearch('feat');
    }
  }

  async _fillStandardArray() {
    ABILITY_KEYS.forEach((k, i) => { this._data.abilities[k] = STANDARD_ARRAY[i] ?? 10; });
    await this.render();
  }

  async _create() {
    if (this._creating) return;
    if (this._creationBlocked) {
      const message = this._createdActorId
        ? `${localizeCharacterWizard('CreationPartialFailure')} (${this._createdActorId})`
        : localizeCharacterWizard('CreationOutcomeUnknown');
      showToast?.(message, 'error');
      return;
    }
    this._creating = true;
    try {
    const worldId = window.Loom?.world?.id;
    if (!worldId) return;
    const pendingJournal = readCreationJournal(worldId);
    if (pendingJournal) {
      showToast?.(localizeCharacterWizard('CreationRecoveryRequired'), 'warning');
      return;
    }
    if (!this._data.klass.entryId || !this._data.klass.compendiumData) {
      showToast?.(localizeCharacterWizard('ChooseClass'), 'warning');
      return;
    }
    const classIdentifier = this._data.klass.compendiumData?.classIdentifier || '';
    const resolvedLanguages = resolveCharacterLanguages({
      originLanguages: this._data.originLanguages,
      classIdentifier,
      rogueAdditionalLanguage: this._data.rogueAdditionalLanguage,
    });
    if (!resolvedLanguages.valid) {
      showToast?.(localizeCharacterWizard('ChooseLanguages'), 'warning');
      return;
    }
    const targetLevel = Number(this._data.level);
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 20) {
      showToast?.(localizeCharacterWizard('InvalidLevel'), 'warning');
      return;
    }
    if (ABILITY_KEYS.some((key) => !Number.isInteger(Number(this._data.abilities[key]))
      || Number(this._data.abilities[key]) < 1 || Number(this._data.abilities[key]) > 20)) {
      showToast?.(localizeCharacterWizard('InvalidAbilityScore'), 'warning');
      return;
    }
    const requiresSubclass = classIdentifier && classIdentifier !== 'none'
      && buildProgressionPlan(classIdentifier, 0, targetLevel).choices.some((choice) => choice.kind === 'subclass');
    const plan = this._progressionPlan();
    const featDataByChoice = Object.fromEntries(plan.choices.map((entryChoice) => [
      entryChoice.id, this._progressionFeatEntries[entryChoice.level]?.data,
    ]));
    const backgroundMechanics = backgroundMechanicsFor(this._data.background.compendiumData);
    const resolvedBackground = resolveBackgroundChoices(backgroundMechanics, this._data.backgroundAbilities);
    if (!resolvedBackground.valid) {
      showToast?.(localizeCharacterWizard('CompleteBackgroundChoices'), 'warning');
      return;
    }
    const resolvedEquipment = resolveBackgroundEquipment(this._data.background.compendiumData?.identifier, {
      ...this._data.backgroundEquipment, tool: this._data.backgroundAbilities.tool,
    });
    if (!resolvedEquipment.valid) {
      showToast?.(localizeCharacterWizard('CompleteEquipmentChoices'), 'warning');
      return;
    }
    const isWizardCreation = classIdentifier === 'wizard';
    const resolvedWizardSpells = isWizardCreation
      ? resolveWizardCreationChoices(targetLevel, this._classSpellEntries, this._data.wizardSpellChoices)
      : { valid: true, cantrips: [], spellbook: [], prepared: [], errors: [] };
    const resolvedClassSpells = classSpellcastingAtLevel(classIdentifier, targetLevel) && !isWizardCreation
      ? resolvePreparedClassSpellChoices(classIdentifier, targetLevel, this._classSpellEntries, this._data.classSpellChoices)
      : { valid: true, cantrips: [], prepared: [], errors: [] };
    const resolvedRangerFavoredEnemy = classIdentifier === 'ranger'
      ? resolveRangerFavoredEnemySpell(this._classSpellEntries, this._data.classSpellChoices.prepared)
      : { valid: true, spell: null };
    const subclassName = this._data.subclass?.compendiumData?.name || this._data.subclass?.name || '';
    const resolvedSubclassSpells = resolveSubclassAlwaysPreparedSpells(classIdentifier, subclassName, targetLevel, this._classSpellEntries);
    if (!resolvedWizardSpells.valid) {
      showToast?.(localizeCharacterWizard('CompleteWizardSpellChoices'), 'warning');
      return;
    }
    if (!resolvedClassSpells.valid) {
      showToast?.(localizeCharacterWizard('CompleteClassSpellChoices'), 'warning');
      return;
    }
    if (!resolvedRangerFavoredEnemy.valid) {
      showToast?.(localizeCharacterWizard('FavoredEnemySpellUnavailable'), 'error');
      return;
    }
    if (!resolvedSubclassSpells.valid) {
      showToast?.(localizeCharacterWizard('SubclassSpellGrantUnavailable'), 'error');
      return;
    }
    const progressionBaseAbilities = Object.fromEntries(ABILITY_KEYS.map((key) => [key,
      Number(this._data.abilities[key]) + (resolvedBackground.bumps[key] || 0)]));
    if (ABILITY_KEYS.some((key) => progressionBaseAbilities[key] > 20)) {
      showToast?.(localizeCharacterWizard('AbilityScoreCap'), 'warning');
      return;
    }
    if (!this._backgroundFeatEntry?.data) {
      showToast?.(localizeCharacterWizard('BackgroundFeatUnavailable'), 'warning');
      return;
    }
    if (!isSpeciesChoiceValid(this._data.race.compendiumData?.identifier, this._data.raceChoices)) {
      showToast?.(localizeCharacterWizard('CompleteSpeciesChoice'), 'warning');
      return;
    }
    const humanFeatMechanics = getFeatMechanics(this._humanFeatEntry?.data);
    const humanProficiencyEffect = humanFeatMechanics?.effects?.find((effect) => effect.type === 'proficiency');
    const humanFeatResolution = humanProficiencyEffect ? resolveFeatMechanicChoices(this._humanFeatEntry?.data, this._data.raceChoices.featChoices, {
      skills: Object.fromEntries([...resolvedBackground.skills, ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : [])].map((key) => [key, { proficient: true }])),
      tools: resolvedBackground.tools,
    }) : { valid: true, skills: [], tools: [], errors: [] };
    const backgroundHasMagicInitiate = isMagicInitiate(backgroundMechanics?.feat);
    const humanHasMagicInitiate = this._data.race.compendiumData?.identifier === 'human'
      && isMagicInitiate(this._humanFeatEntry?.name);
    const backgroundMagicInitiate = backgroundHasMagicInitiate
      ? resolveMagicInitiateChoices(backgroundMechanics.feat, this._data.magicInitiate.background, this._magicInitiateSpellEntries)
      : { valid: true, spells: [], errors: [] };
    const humanMagicInitiate = humanHasMagicInitiate
      ? resolveMagicInitiateChoices(this._humanFeatEntry.name, this._data.magicInitiate.human, this._magicInitiateSpellEntries,
        backgroundHasMagicInitiate ? [this._data.magicInitiate.background.list].filter(Boolean) : [])
      : { valid: true, spells: [], errors: [] };
    if (!backgroundMagicInitiate.valid || !humanMagicInitiate.valid) {
      showToast?.(localizeCharacterWizard('CompleteMagicInitiateChoices'), 'warning');
      return;
    }
    if (this._data.race.compendiumData?.identifier === 'human'
      && (!isHumanSpeciesChoiceValid(this._data.raceChoices, this._humanFeatEntry, resolvedBackground.skills)
        || !isFeatEligibleForProgression(this._humanFeatEntry, 1, { existingNames: [normalizeFeatChoiceName(backgroundMechanics?.feat)] })
        || !humanFeatResolution.valid
        || normalizeFeatChoiceName(this._humanFeatEntry?.name) === normalizeFeatChoiceName(backgroundMechanics?.feat))) {
      showToast?.(localizeCharacterWizard('CompleteHumanChoices'), 'warning');
      return;
    }
    const resolvedChoices = resolveProgressionChoices(plan, progressionBaseAbilities, this._data.progressionSelections, featDataByChoice, {
      skills: [...resolvedBackground.skills, ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : []), ...humanFeatResolution.skills],
      tools: [...resolvedBackground.tools, ...humanFeatResolution.tools],
    });
    if (requiresSubclass && !this._data.subclass.entryId) {
      showToast?.('Choose the subclass required by the selected class level.', 'warning');
      return;
    }
    if (!resolvedChoices.valid) {
      const key = resolvedChoices.errors.some((error) => error.code === 'ability-score-cap')
        ? 'AbilityScoreCap' : resolvedChoices.errors.length ? 'InvalidProgressionChoice' : 'CompleteProgressionChoices';
      showToast?.(localizeCharacterWizard(key), 'warning');
      return;
    }
    const startingAbilityScores = applyPrimalChampion(resolvedChoices.abilities, classIdentifier, targetLevel);
    if (resolvedChoices.feats.some((feat) => !this._progressionFeatEntries[feat.level]?.data)) {
      showToast?.(localizeCharacterWizard('CompleteProgressionChoices'), 'warning');
      return;
    }

    const resolvedClassProficiencies = classProficiencyChoiceContext(classIdentifier, this._data.classProficiencies,
      [...resolvedBackground.skills, ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : []), ...humanFeatResolution.skills, ...resolvedChoices.skills],
      [...resolvedBackground.tools, ...humanFeatResolution.tools, ...resolvedChoices.tools]);
    if (!resolvedClassProficiencies.valid) {
      showToast?.(localizeCharacterWizard('CompleteClassProficiencyChoices'), 'warning');
      return;
    }
    const weaponMasteryRequired = weaponMasteryCountAtLevel(classIdentifier, targetLevel);
    const weaponMasteryProficiencies = CLASS_PROFICIENCIES[classIdentifier]?.weapons || [];
    const resolvedWeaponMastery = weaponMasteryRequired
      ? resolveWeaponMasteryChoices(classIdentifier, this._data.weaponMasterySelections,
        weaponMasteryProficiencies, weaponMasteryRequired)
      : { valid: true, choices: [], required: 0 };
    if (!resolvedWeaponMastery.valid) {
      showToast?.(localizeCharacterWizard('CompleteWeaponMasteryChoices'), 'warning');
      return;
    }
    const bardProficientSkills = [...new Set([
      ...resolvedBackground.skills,
      ...(this._data.raceChoices.skillful ? [this._data.raceChoices.skillful] : []),
      ...humanFeatResolution.skills, ...resolvedChoices.skills, ...resolvedClassProficiencies.skills,
    ])];
    const bardExpertiseLevels = classIdentifier === 'bard' ? [2, 9].filter((value) => value <= targetLevel) : [];
    const resolvedBardExpertise = bardExpertiseLevels.length
      ? resolveBardExpertiseProgression(Object.fromEntries(bardProficientSkills.map((key) => [key, { proficient: true }])),
        this._data.bardExpertiseChoices, bardExpertiseLevels)
      : { valid: true, selections: {} };
    if (!resolvedBardExpertise.valid) {
      showToast?.(localizeCharacterWizard('CompleteBardExpertiseChoices'), 'warning');
      return;
    }
    const hasClassEquipment = classStartingEquipmentPackageOptions(classIdentifier).length > 0;
    const resolvedClassEquipment = hasClassEquipment
      ? resolveClassStartingEquipment(classIdentifier, {
        ...this._data.classEquipment,
        tool: this._data.classProficiencies.tools?.[0] || '',
      })
      : { valid: true, gp: 0, items: [], errors: [], toolProficiencies: [] };
    if (!resolvedClassEquipment.valid) {
      showToast?.(localizeCharacterWizard('CompleteClassEquipmentChoices'), 'warning');
      return;
    }

    // Resolved BEFORE `charData` is built and posted, so the actor is
    // created with the right die the first time instead of needing a second
    // update after the fact.
    const hitDie = this._data.klass.compendiumData?.hitDie || 'd8';

    const generatedCharacterData = applyCharacterLanguages(getDefaultData('character'), resolvedLanguages);
    const charData = generatedCharacterData;
    for (const k of ABILITY_KEYS) charData.abilities[k].value = startingAbilityScores[k] || 10;
    for (const save of resolvedClassProficiencies.saves) charData.saves[save].proficient = true;
    charData.details.background = this._data.background.name;
    charData.details.gp.value = (Number(charData.details.gp.value) || 0) + resolvedEquipment.gp + resolvedClassEquipment.gp;
    for (const skill of resolvedBackground.skills) charData.skills[skill].proficient = true;
    if (this._data.race.compendiumData?.identifier === 'human') charData.skills[this._data.raceChoices.skillful].proficient = true;
    for (const skill of [...humanFeatResolution.skills, ...resolvedChoices.skills, ...resolvedClassProficiencies.skills]) charData.skills[skill].proficient = true;
    for (const skills of Object.values(resolvedBardExpertise.selections)) {
      for (const skill of skills) charData.skills[skill].multiplier = 2;
    }
    charData.proficiencies.weapons = [...new Set(resolvedClassProficiencies.weapons)];
    charData.proficiencies.armor = [...new Set(resolvedClassProficiencies.armor)];
    charData.proficiencies.tools = [...new Set([...(charData.proficiencies.tools || []), ...resolvedBackground.tools, ...humanFeatResolution.tools, ...resolvedChoices.tools])];
    charData.proficiencies.tools = [...new Set([...charData.proficiencies.tools, ...resolvedClassProficiencies.tools, ...resolvedClassEquipment.toolProficiencies])];
    charData.details.level = targetLevel;
    charData.details.xp = {
      ...(charData.details.xp || {}),
      value: startingExperiencePoints(targetLevel),
    };
    charData.attributes.prof.value = Math.floor((targetLevel - 1) / 4) + 2;
    const constitutionModifier = Math.floor((startingAbilityScores.con - 10) / 2);
    charData.resources.health.max = startingHitPoints(hitDie, targetLevel, constitutionModifier, {
      maxAtFirstLevel: getSetting('maxHpFirstLevel', true),
    });
    charData.resources.health.value = charData.resources.health.max;
    charData.resources.hitDice.max = targetLevel;
    charData.resources.hitDice.value = targetLevel;
    charData.resources.hitDice.die = hitDie;
    const classIdentifierForHitDice = this._data.klass.compendiumData?.classIdentifier || 'unclassified';
    charData.resources.hitDice.pools = {
      [classIdentifierForHitDice]: { value: targetLevel, max: targetLevel, die: hitDie, needsReview: false },
    };
    if (this._data.klass.compendiumData?.casterType === 'pact') {
      const pact = pactMagicAtLevel(targetLevel);
      charData.resources.pactMagic = { ...pact, value: pact.max, needsReview: false };
    }

    const operations = [];
    if (this._data.race.entryId && this._data.race.compendiumData) {
      // Compendium entry only — its own `data` already has the mechanical
      // fields (size/speed/creatureType/etc) filled in for real.
      const raceData = recordSpeciesChoice(this._data.race.compendiumData, this._data.race.compendiumData.identifier, this._data.raceChoices);
      operations.push({ kind: 'item', label: `${this._data.race.name} (species)`, payload: { name: this._data.race.name, type: 'race', data: raceData } });
    }
    operations.push({ kind: 'item', label: `${this._data.background.name} (background)`, payload: { name: this._data.background.name, type: 'background', data: this._data.background.compendiumData } });
    const addOriginFeat = (entry, choices, label) => {
      const data = choices.spells.length ? {
        ...entry.data,
        magicInitiateChoice: {
          version: 1, list: choices.list, ability: choices.ability,
          cantrips: choices.spells.slice(0, 2).map((spell) => spell.name), spell: choices.spells[2].name,
        },
      } : entry.data;
      operations.push({ kind: 'item', label: `${entry.name} (${label})`, payload: { name: entry.name, type: 'feat', data } });
      for (const spell of choices.spells) {
        const data = buildMagicInitiateSpellData(spell, choices);
        operations.push({ kind: 'item', label: `${spell.name} (Magic Initiate)`, payload: { name: spell.name, type: 'spell', data } });
      }
    };
    addOriginFeat(this._backgroundFeatEntry, backgroundMagicInitiate, 'origin feat');
    for (const equipment of resolvedEquipment.items) operations.push({ kind: 'item', label: equipment.name, payload: equipment });
    for (const equipment of resolvedClassEquipment.items) operations.push({
      ...(equipment.key ? { key: equipment.key } : {}),
      ...(equipment.containerOperationKey ? { containerOperationKey: equipment.containerOperationKey } : {}),
      kind: 'item', label: `${equipment.name} (class starting equipment)`,
      payload: { name: equipment.name, type: equipment.type, data: equipment.data },
    });
    if (this._data.race.compendiumData?.identifier === 'human') {
      addOriginFeat(this._humanFeatEntry, humanMagicInitiate, 'Human feat');
    }
    if (this._data.klass.entryId && this._data.klass.compendiumData) {
      const classData = { ...this._data.klass.compendiumData, levels: targetLevel };
      if (this._data.subclass.entryId && this._data.subclass.compendiumData) {
        classData.subclassName = this._data.subclass.name;
      }
      operations.push({ kind: 'item', label: `${this._data.klass.name} (class)`, payload: { name: this._data.klass.name, type: 'class', data: classData } });
      for (const spell of [...resolvedClassSpells.cantrips, ...resolvedClassSpells.prepared]) {
        operations.push({
          kind: 'item', label: `${spell.name} (${classIdentifier} spell)`,
          payload: { name: spell.name, type: 'spell', data: { ...spell.data, prepared: Number(spell.data?.spellLevel) > 0, sourceClassIdentifier: classIdentifier } },
        });
      }
      if (resolvedRangerFavoredEnemy.spell) operations.push({
        kind: 'item', label: `${resolvedRangerFavoredEnemy.spell.name} (Favored Enemy always prepared)`,
        payload: { name: resolvedRangerFavoredEnemy.spell.name, type: 'spell',
          data: rangerFavoredEnemySpellItemData(resolvedRangerFavoredEnemy.spell.data) },
      });
      for (const grant of resolvedSubclassSpells.grants) {
        const matchingClassSpellOperation = operations.find((operation) => operation.kind === 'item'
          && operation.payload?.type === 'spell'
          && String(operation.payload.name).localeCompare(grant.name, undefined, { sensitivity: 'base' }) === 0
          && operation.payload.data?.sourceClassIdentifier === classIdentifier);
        if (matchingClassSpellOperation) matchingClassSpellOperation.payload.data = subclassSpellGrantItemData(grant, {
          independentlyOwned: true, priorData: matchingClassSpellOperation.payload.data,
        });
        else operations.push({ kind: 'item', label: `${grant.name} (${grant.subclassName} always prepared)`,
          payload: { name: grant.name, type: 'spell', data: subclassSpellGrantItemData(grant) } });
      }
      if (isWizardCreation) {
        const preparedIds = new Set(resolvedWizardSpells.prepared.map((spell) => spell.id));
        for (const spell of resolvedWizardSpells.cantrips) {
          operations.push({ kind: 'item', label: `${spell.name} (wizard cantrip)`, payload: { name: spell.name, type: 'spell', data: { ...spell.data, prepared: true, sourceClassIdentifier: 'wizard', wizardSpellbook: false, learnedAtWizardLevel: spell.learnedAtWizardLevel } } });
        }
        for (const spell of resolvedWizardSpells.spellbook) {
          operations.push({ kind: 'item', label: `${spell.name} (wizard spellbook)`, payload: { name: spell.name, type: 'spell', data: { ...spell.data, prepared: preparedIds.has(spell.id), sourceClassIdentifier: 'wizard', wizardSpellbook: true, learnedAtWizardLevel: spell.learnedAtWizardLevel } } });
        }
      }
      if (this._data.subclass.entryId && this._data.subclass.compendiumData) {
        operations.push({ kind: 'item', label: `${this._data.subclass.name} (subclass)`, payload: { name: this._data.subclass.name, type: 'subclass', data: this._data.subclass.compendiumData } });
      }
      for (const feat of resolvedChoices.feats) {
        const entry = this._progressionFeatEntries[feat.level];
        if (!entry?.data) throw new Error(`Missing selected feat data for class level ${feat.level}.`);
        operations.push({ kind: 'item', label: `${entry.name} (level ${feat.level} feat)`, payload: { name: entry.name, type: 'feat', data: entry.data } });
      }
      operations.push({ kind: 'class-features', label: `${this._data.klass.name} class features`, payload: {
        classIdentifier: classData.classIdentifier, toLevel: targetLevel,
        ...(classData.classIdentifier === 'bard' ? { charismaScore: startingAbilityScores.cha } : {}),
        ...(classData.classIdentifier === 'bard' ? { bardExpertiseSelections: resolvedBardExpertise.selections } : {}),
        ...(weaponMasteryRequired ? { weaponMasterySelections: resolvedWeaponMastery.choices,
          weaponMasteryProficiencies } : {}),
      } });
    }

    if (this._existingActor) {
      const response = await api.get(`/actors/${encodeURIComponent(this._existingActor.id)}?populate=true`);
      const freshActor = response?.data?.id ? response.data : response;
      const stable = (value) => JSON.stringify(value, (_key, entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
      });
      if (!freshActor?.id || stable({ name: freshActor.name, systemData: freshActor.systemData, items: freshActor.items || [] })
        !== stable({ name: this._existingActor.name, systemData: this._existingActor.systemData, items: this._existingActor.items || [] })) {
        showToast?.(localizeCharacterWizard('ActorChangedWhileWizardOpen'), 'warning');
        return;
      }
      const existingItems = freshActor.items || [];
      const existingContainersByKey = new Map();
      const pendingOperations = [];
      for (const operation of operations) {
        if (operation.containerOperationKey && existingContainersByKey.has(operation.containerOperationKey)) {
          const containerId = existingContainersByKey.get(operation.containerOperationKey);
          operation.payload = { ...operation.payload, data: { ...operation.payload.data, container: containerId } };
          delete operation.containerOperationKey;
        }
        if (operation.kind !== 'item') {
          pendingOperations.push(operation);
          continue;
        }
        const candidate = operation.payload || {};
        const candidateData = candidate.data || {};
        const candidateName = String(candidate.name || '').trim().toLocaleLowerCase();
        const existingMatch = existingItems.find((item) => {
          const itemData = item.system || item.data || {};
          if (item.type !== candidate.type) return false;
          const candidateIdentifier = candidateData.identifier;
          if (candidateIdentifier && itemData.identifier === candidateIdentifier) return true;
          return candidateName && String(item.name || '').trim().toLocaleLowerCase() === candidateName;
        });
        if (existingMatch) {
          if (operation.key && candidate.type === 'container') existingContainersByKey.set(operation.key, existingMatch.id);
          continue;
        }
        pendingOperations.push(operation);
      }
      operations.splice(0, operations.length, ...pendingOperations);
      operations.push({ kind: 'actor-update', label: 'Update existing character', payload: {
        name: this._data.name.trim() || this._existingActor.name,
        systemData: mergeGeneratedData(this._existingActor.systemData || {}, charData),
      } });
    }

    let journal;
    try {
      journal = createCreationJournal({
        worldId,
        actorName: this._data.name.trim() || 'New Character',
        actorData: this._existingActor
          ? operations.at(-1).payload.systemData
          : charData,
        actorId: this._existingActor?.id || null,
        operations,
      });
      writeCreationJournal(journal);
      this._creationRequestStarted = true;
      await runCreationJournal(journal, {
        storage: globalThis.localStorage,
        createActor: (payload) => api.post('/actors', payload),
        createItem: (payload) => api.post('/items', payload),
        updateActor: (actorId, payload) => api.put(`/actors/${encodeURIComponent(actorId)}`, payload),
        createClassFeatures: async (actorId, payload) => {
          const existing = await api.get(`/actors/${actorId}/items`);
          await grantClassFeatures(worldId, actorId, payload.classIdentifier, 0, payload.toLevel, Array.isArray(existing) ? existing : existing?.items || [], {
            charismaScore: payload.charismaScore, bardExpertiseSelections: payload.bardExpertiseSelections,
            weaponMasterySelections: payload.weaponMasterySelections,
            weaponMasteryProficiencies: payload.weaponMasteryProficiencies,
          });
        },
      });
    } catch (error) {
      this._createdActorId = journal?.actor?.id || null;
      this._creationBlocked = journal?.actor?.status === 'unknown'
        || journal?.actor?.status === 'complete'
        || journal?.operations?.some(({ status }) => status === 'unknown' || status === 'in-flight');
      throw error;
    }
    const actorId = journal.actor.id;
    this._createdActorId = actorId;
    clearCreationJournal(worldId);

    const { Sdr5eCharacterSheet } = await import('./character-sheet.mjs');
    windowManager.open(`actor-sheet-${actorId}`, Sdr5eCharacterSheet, { actorId });
    // `windowManager.close(id)`, not `this.close()` — BaseWindow instances
    // don't expose their own close(); the manager owns lifecycle.
    windowManager.close(this.options.id);
    } catch (error) {
      console.error('[srd5e] Character creation stopped after a write failed:', error);
      const isRejectedRequest = !this._createdActorId && Number(error?.status) >= 400 && Number(error?.status) < 500;
      this._creationBlocked = !isRejectedRequest && this._creationRequestStarted;
      if (isRejectedRequest) this._creationRequestStarted = false;
      const message = this._createdActorId
        ? `${localizeCharacterWizard('CreationPartialFailure')} (${this._createdActorId})`
        : this._creationBlocked
          ? localizeCharacterWizard('CreationOutcomeUnknown')
          : localizeCharacterWizard('CreationFailed');
      showToast?.(message, 'error');
      await this.render();
    } finally {
      this._creating = false;
    }
  }

  async _resumeCreation() {
    const worldId = window.Loom?.world?.id;
    const journal = readCreationJournal(worldId);
    if (!creationJournalCanResume(journal)) {
      showToast?.(localizeCharacterWizard('CreationRecoveryUnknown'), 'warning');
      await this.render();
      return;
    }
    if (this._creating) return;
    this._creating = true;
    try {
      await runCreationJournal(journal, {
        storage: globalThis.localStorage,
        createActor: (payload) => api.post('/actors', payload),
        createItem: (payload) => api.post('/items', payload),
        updateActor: (actorId, payload) => api.put(`/actors/${encodeURIComponent(actorId)}`, payload),
        createClassFeatures: async (actorId, payload) => {
          const existing = await api.get(`/actors/${actorId}/items`);
          await grantClassFeatures(worldId, actorId, payload.classIdentifier, 0, payload.toLevel, Array.isArray(existing) ? existing : existing?.items || [], {
            charismaScore: payload.charismaScore, bardExpertiseSelections: payload.bardExpertiseSelections,
            weaponMasterySelections: payload.weaponMasterySelections,
            weaponMasteryProficiencies: payload.weaponMasteryProficiencies,
          });
        },
      });
      const actorId = journal.actor.id;
      clearCreationJournal(worldId);
      const { Sdr5eCharacterSheet } = await import('./character-sheet.mjs');
      windowManager.open(`actor-sheet-${actorId}`, Sdr5eCharacterSheet, { actorId });
      windowManager.close(this.options.id);
    } catch (error) {
      console.error('[srd5e] Character creation recovery stopped:', error);
      this._creationBlocked = true;
      showToast?.(localizeCharacterWizard('CreationRecoveryUnknown'), 'error');
      await this.render();
    } finally {
      this._creating = false;
    }
  }

  _acknowledgeCreationReview() {
    const worldId = window.Loom?.world?.id;
    const journal = readCreationJournal(worldId);
    if (!journal || journal.status === 'complete') return;
    clearCreationJournal(worldId);
    this._creationBlocked = false;
    this._createdActorId = null;
    showToast?.(localizeCharacterWizard('CreationRecoveryAcknowledged'), 'info');
    void this.render();
  }
}
