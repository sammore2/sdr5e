// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/level-up-wizard.mjs
// Component Version: 0.2.0
//
// Level up guiado pra um personagem já existente — mesmo padrão do
// character-wizard.mjs (LoomHandlebarsMixin, steps pré-computados, sem
// helper `eq`), mas ligado a um `actorId` real via LoomActorSheet em vez de
// criar documentos do zero. Ganho de HP usa valor médio fixo (mesma
// convenção de spendHitDie em roll-engine.mjs) — sem rolagem de verdade,
// dispatchRoll não retorna resultado pro código.
//
// Feat/Subclass/Spell agora puxam do compendium de verdade (GET /compendium/
// browse/entries), igual ao picker de Raça/Classe em character-wizard.mjs —
// nenhum sourceId hardcoded, funciona com qualquer pack de terceiro instalado
// depois. Fallback freeform continua existindo pra Feat/Subclass quando não
// há entrada correspondente em nenhum pack carregado.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, showToast } from '/_loom/sdk/index.js';
import { ABILITY_KEYS, ABILITY_LABELS, SKILL_LABELS, subclassLevelFor, pactMagicAtLevel, SPELL_SLOT_TABLE } from './config.mjs';
import { buildProgressionPlan, isFeatEligibleForProgression, progressionAtLevel, resolveAbilityScoreIncrease, resolveMulticlassPrerequisites } from './progression.mjs';
import { featMechanicsSupport, getFeatMechanics, resolveFeatMechanicChoices, withFeatMechanics } from './feat-mechanics.mjs';
import { getSetting } from './settings.mjs';
import { resolveLevelUpEligibility } from './xp-progression.mjs';
import { searchCompendiumEntries } from './utils.mjs';
import { KNOWN_SPELLS_TABLE, KNOWN_CANTRIPS_TABLE, classSpellcastingAtLevel, classSpellcastingLevelUpAtLevel, inspectBardSpellState, inspectPreparedSpellState, inspectWizardSpellbookState, wizardSpellcastingLevelUpAtLevel, isValidMysticArcanumSpell, mysticArcanumCircleAtLevel, mysticArcanumUseState } from './class-spellcasting.mjs';
import { applyPrimalChampion } from './class-feature-mechanics.mjs';
import { planSubclassSpellGrantWrites, resolveSubclassAlwaysPreparedSpells, subclassAlwaysPreparedSpellNames, subclassSpellGrantItemData } from './subclass-spell-grants.mjs';
import { createMulticlassLevelUpJournal, MULTICLASS_ENTRY_CLASS_IDS } from './multiclass-levelup.mjs';
import { multiclassAdvancementApiAdapter, readMulticlassAdvancementJournal, runMulticlassAdvancementJournal } from './multiclass-advancement-journal.mjs';
import { resolveWizardScholarChoice, WIZARD_SCHOLAR_SKILLS } from './wizard-scholar.mjs';
import { resolveWizardSignatureSpellChoices, resolveWizardSpellMasteryChoices } from './wizard-spell-mechanics.mjs';
import { selectClassFeaturesToGrant } from './class-feature-grants.mjs';
import { createClassLevelUpJournal } from './wizard-levelup-journal.mjs';
import { buildClassFeatureGrantPlan } from './class-feature-grant-plan.mjs';
import { resolveWeaponMasteryChoices, weaponMasteryCountAtLevel } from './weapon-mastery.mjs';
import { resolveClericDivineOrderChoice } from './divine-order.mjs';
import { multiclassProficiencyChoiceContext } from './class-proficiencies.mjs';
import { resolveExpertiseChoices } from './expertise-mechanics.mjs';
import { resolveRogueAdditionalLanguage, ROGUE_SPECIAL_LANGUAGE } from './language-mechanics.mjs';
import { resolveDruidPrimalOrderChoice } from './druid-primal-order.mjs';
import { resolveWarlockLevelOneInvocation, WARLOCK_LEVEL_ONE_INVOCATIONS } from './warlock-invocations.mjs';

const STEPS = ['class', 'hp', 'asi', 'subclass', 'choices', 'spells', 'review'];

function localizeWizard(key) {
  return window.Loom.i18n.localize(`SDR5E.Wizard.LevelUp.${key}`);
}

export class Sdr5eLevelUpWizard extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 480, height: 580 } };
  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/apps/level-up-wizard.hbs' } };

  constructor(props) {
    super({
      ...props,
      id: props?.id || `sdr5e-levelup-${props?.actorId}`,
      title: 'Level Up',
      showFooter: false,
      resizable: true,
      classes: ['sdrn-sheet', 'sdrn-wizard'],
    });
  }

  _step = 0;
  _classId = null;
  _addingNewClass = false;
  _multiclassClassPick = null;
  _pendingMulticlassJournal = null;
  _storedMulticlassJournal = null;
  _asiMode = 'scores'; // 'scores' | 'feat'
  _hpMode = 'fixed';
  _hpRoll = null;
  _asiPicks = { first: '', second: '' };
  _featName = '';
  _featPick = null; // full compendium entry ({id, name, data, sourceId, sourceName}) once picked
  _featChoices = [];
  _featAbilityPicks = { first: '', second: '' };
  _subclassName = '';
  _subclassPick = null;
  _spellPicks = { leveled: [], cantrips: [] };
  _arcanumPick = '';
  _arcanumReplaceOut = '';
  _arcanumReplaceIn = '';
  _bardReplacement = { spellOut: '', spellIn: '', cantripOut: '', cantripIn: '' };
  _wizardSpellbookPicks = [];
  _wizardPreparedPicks = [];
  _wizardCantripPicks = [];
  _wizardPreparedPickLimit = 0;
  _wizardScholarSkill = '';
  _wizardSpellMasteryLevelOne = '';
  _wizardSpellMasteryLevelTwo = '';
  _wizardSignatureSpellIds = ['', ''];
  _weaponMasteryPicks = [];
  _fighterStylePick = null;
  _divineOrderChoice = '';
  _divineOrderCantripPick = null;
  _primalOrderChoice = '';
  _primalOrderCantripPick = null;
  _warlockInvocationPick = '';
  _multiclassSkillPicks = [];
  _multiclassToolPicks = [];
  _bardExpertisePicks = [];
  _rogueExpertisePicks = [];
  _rogueLanguagePick = '';
  _initialized = false;
  _lastActiveStepId = null;

  // Um bucket de query/results/timer por picker ligado ao compendium neste
  // wizard — mesmo padrão do `_search` em character-wizard.mjs.
  _search = {
    class: { query: '', results: [], timer: null },
    feat: { query: '', results: [], timer: null },
    subclass: { query: '', results: [], timer: null },
    spell: { query: '', results: [], timer: null },
  };

  _currentClassItem() {
    const items = this.document?.items || [];
    return items.find((i) => i.id === this._classId) || null;
  }

  _currentClassIdentifier() {
    if (this._multiclassClassPick) return this._multiclassClassPick.data?.classIdentifier || '';
    const classItem = this._currentClassItem();
    const idata = classItem ? (classItem.system || classItem.data || {}) : null;
    return idata?.classIdentifier || '';
  }

  /** Nível de magia mais alto disponível em `classLevel` pro `casterType`
   * dado. Pact Magic do Warlock não usa SPELL_SLOT_TABLE (ver nota da própria
   * tabela em config.mjs) — aproximado pela progressão real do SRD (1 nos
   * níveis 1-2, 2 no 3-4, 3 no 5-6, 4 no 7-8, teto 5 a partir do 9). */
  _maxSpellLevelAt(casterType, classLevel) {
    if (casterType === 'pact') return Math.min(5, Math.ceil(Math.min(classLevel, 9) / 2));
    const table = SPELL_SLOT_TABLE[casterType];
    const row = table?.[classLevel - 1] || [];
    for (let i = row.length - 1; i >= 0; i--) { if (row[i] > 0) return i + 1; }
    return 0;
  }

  _newCountFromTable(table, classIdentifier, currentLevel, nextLevel) {
    const perLevel = table[classIdentifier];
    if (!perLevel) return 0;
    const cur = perLevel[currentLevel - 1] ?? 0;
    const next = perLevel[nextLevel - 1] ?? cur;
    return Math.max(0, next - cur);
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const sd = this.document?.systemData || {};
    const items = this.document?.items || [];
    const classItems = items.filter((i) => i.type === 'class');

    // Primeira renderização: escolhe a única classe automaticamente (caso
    // comum, sem multiclasse) e já resolve o nome de subclasse atual.
    if (!this._initialized) {
      this._initialized = true;
      if (classItems.length === 1) this._classId = classItems[0].id;
    }

    const isMulticlassEntry = !!this._multiclassClassPick;
    const classItem = isMulticlassEntry ? null : classItems.find((i) => i.id === this._classId) || null;
    const idata = isMulticlassEntry ? this._multiclassClassPick.data
      : classItem ? (classItem.system || classItem.data || {}) : null;
    const currentClassLevel = isMulticlassEntry ? 0 : idata ? Number(idata.levels) || 1 : 0;
    const nextClassLevel = currentClassLevel + 1;
    const nextTotalLevel = (Number(sd.details?.level) || 1) + 1;
    const classIdentifier = idata?.classIdentifier || '';
    const multiclassPrerequisites = isMulticlassEntry
      ? resolveMulticlassPrerequisites(classIdentifier, classItems.map((item) => (item.system || item.data || {}).classIdentifier),
        Object.fromEntries(ABILITY_KEYS.map((key) => [key, sd.abilities?.[key]?.value ?? sd.abilities?.[key]])))
      : { valid: true, errors: [] };
    const multiclassProficiencyChoices = isMulticlassEntry
      ? multiclassProficiencyChoiceContext(classIdentifier, {
        skills: this._multiclassSkillPicks, tools: this._multiclassToolPicks,
      }, {
        alreadyProficientSkills: Object.keys(sd.skills || {}).filter((key) => sd.skills[key]?.proficient),
        alreadyProficientTools: sd.proficiencies?.tools || [],
      })
      : { valid: true, skillOptions: [], toolOptions: [], skillCount: 0, toolChoiceCount: 0 };
    const multiclassProficiencyChoiceRequired = isMulticlassEntry
      && (multiclassProficiencyChoices.skillCount > 0 || multiclassProficiencyChoices.toolChoiceCount > 0);
    const casterType = idata?.casterType || 'none';

    const die = idata?.hitDie || 'd8';
    const dieMax = Number(die.replace(/\D/g, '')) || 8;
    const conMod = sd.abilities?.con?.modifier ?? 0;
    const avgRoll = Math.ceil((dieMax + 1) / 2);
    const fixedHpGain = Math.max(1, avgRoll + conMod);
    if (this._hpRoll === null) this._hpRoll = 1 + Math.floor(Math.random() * dieMax);
    const hpMode = getSetting('levelUpHpMode', 'player');
    const selectedHpMode = hpMode === 'fixed' || hpMode === 'roll' ? hpMode : this._hpMode;
    const hpGain = Math.max(1, (selectedHpMode === 'roll' ? this._hpRoll : avgRoll) + conMod);

    const entitlement = buildProgressionPlan(classIdentifier, currentClassLevel, nextClassLevel, {
      hasSubclass: !!idata?.subclassName,
    }).levels.at(-1) || progressionAtLevel(classIdentifier, nextClassLevel, { hasSubclass: !!idata?.subclassName });
    if (entitlement.epicBoon && this._asiMode !== 'feat') this._asiMode = 'feat';
    const showAsi = entitlement.abilityImprovement || entitlement.epicBoon;
    const showSubclass = entitlement.subclass;
    const wizardScholarFeature = items.find((item) => item.type === 'feature'
      && (item.system || item.data || {}).classIdentifier === 'wizard'
      && Number((item.system || item.data || {}).levelGained) === 2
      && ((item.system || item.data || {}).identifier === 'scholar' || item.name === 'Scholar'));
    if (classIdentifier !== 'wizard') this._wizardScholarSkill = '';
    const storedScholarSkill = (wizardScholarFeature?.system || wizardScholarFeature?.data || {}).expertiseSkill || '';
    if (!this._wizardScholarSkill && storedScholarSkill) this._wizardScholarSkill = storedScholarSkill;
    const wizardScholarRequired = classIdentifier === 'wizard' && nextClassLevel === 2;
    const wizardScholarChoice = wizardScholarRequired
      ? resolveWizardScholarChoice(sd.skills || {}, this._wizardScholarSkill, storedScholarSkill)
      : { valid: true };
    const wizardScholarOptions = WIZARD_SCHOLAR_SKILLS.filter((key) => sd.skills?.[key]?.proficient
      && (Number(sd.skills?.[key]?.multiplier) <= 1 || key === storedScholarSkill))
      .map((key) => ({ key, label: SKILL_LABELS[key] || key, selected: key === this._wizardScholarSkill }));
    const bardExpertiseRequired = !isMulticlassEntry && classIdentifier === 'bard' && [2, 9].includes(nextClassLevel);
    const bardExpertiseChoice = bardExpertiseRequired
      ? resolveExpertiseChoices(sd.skills || {}, this._bardExpertisePicks, 2)
      : { valid: true, options: [], required: 0 };
    const bardExpertiseOptions = bardExpertiseChoice.options
      .map((key) => ({ key, label: SKILL_LABELS[key] || key, selected: this._bardExpertisePicks.includes(key) }));
    const rogueChoicesRequired = isMulticlassEntry && classIdentifier === 'rogue';
    const rogueSkillState = Object.fromEntries(Object.entries(sd.skills || {}).map(([key, value]) => [key, { ...value }]));
    for (const key of this._multiclassSkillPicks) rogueSkillState[key] = { ...(rogueSkillState[key] || {}), proficient: true };
    const rogueExpertiseChoice = rogueChoicesRequired
      ? resolveExpertiseChoices(rogueSkillState, this._rogueExpertisePicks, 2)
      : { valid: true, options: [] };
    const rogueKnownLanguages = [...(sd.details?.languages?.value || []), ...items.filter((item) => item.type === 'language').map((item) => item.name)];
    const rogueLanguageChoice = rogueChoicesRequired
      ? resolveRogueAdditionalLanguage(this._rogueLanguagePick, rogueKnownLanguages)
      : { valid: true, selected: '', options: [] };
    const rogueExpertiseOptions = rogueExpertiseChoice.options.map((key) => ({ key, label: SKILL_LABELS[key] || key, selected: this._rogueExpertisePicks.includes(key) }));
    const rogueLanguageOptions = rogueLanguageChoice.options.map((name) => ({ name, selected: name === this._rogueLanguagePick }));
    const isMasteryEntry = isMulticlassEntry && ['barbarian', 'fighter', 'paladin', 'ranger', 'rogue'].includes(classIdentifier);
    const currentMasteryFeature = !isMulticlassEntry ? items.find((item) => item.type === 'feature'
      && (item.system || item.data || {}).classIdentifier === classIdentifier
      && (item.system || item.data || {}).identifier === 'weapon-mastery') : null;
    const currentMasteryData = currentMasteryFeature?.system || currentMasteryFeature?.data || {};
    const currentMasteryCount = isMulticlassEntry ? 0 : weaponMasteryCountAtLevel(classIdentifier, currentClassLevel);
    const nextMasteryCount = isMulticlassEntry ? 0 : weaponMasteryCountAtLevel(classIdentifier, nextClassLevel);
    const masteryIncrease = isMasteryEntry ? 0 : Math.max(0, nextMasteryCount - currentMasteryCount);
    const weaponMasteryRequired = isMasteryEntry || masteryIncrease > 0;
    const masterySelectionCount = isMasteryEntry ? undefined : masteryIncrease;
    const weaponMasteryChoice = weaponMasteryRequired
      ? resolveWeaponMasteryChoices(classIdentifier, this._weaponMasteryPicks,
        [...(sd.proficiencies?.weapons || []), ...(multiclassProficiencyChoices.weapons || [])], masterySelectionCount)
      : { valid: true, options: [], required: 0 };
    const existingMasteryChoices = Array.isArray(currentMasteryData.masteredWeaponIdentifiers)
      ? currentMasteryData.masteredWeaponIdentifiers : [];
    const masteryProgressionValid = isMasteryEntry || !masteryIncrease || (!!currentMasteryFeature
      && resolveWeaponMasteryChoices(classIdentifier, existingMasteryChoices,
        sd.proficiencies?.weapons || [], currentMasteryCount).valid);
    const weaponMasteryOptions = weaponMasteryChoice.options
      .map((weapon) => ({ ...weapon, selected: this._weaponMasteryPicks.includes(weapon.identifier) }));
    const fighterStyleRequired = isMulticlassEntry && classIdentifier === 'fighter';
    const divineOrderRequired = isMulticlassEntry && classIdentifier === 'cleric';
    const divineOrderChoice = divineOrderRequired
      ? resolveClericDivineOrderChoice(this._divineOrderChoice, this._divineOrderCantripPick?.id,
        [...this._search.spell.results, ...(this._divineOrderCantripPick ? [this._divineOrderCantripPick] : [])])
      : { valid: true, order: '', extraCantrip: null };
    const primalOrderRequired = isMulticlassEntry && classIdentifier === 'druid';
    const druidCantripEntries = [...this._search.spell.results, ...(this._primalOrderCantripPick ? [this._primalOrderCantripPick] : [])];
    const primalOrderChoice = primalOrderRequired
      ? resolveDruidPrimalOrderChoice(this._primalOrderChoice, this._primalOrderCantripPick?.id, druidCantripEntries,
        this._spellPicks.cantrips.map(({ id }) => id))
      : { valid: true, order: '', extraCantrip: null };
    const warlockInvocationRequired = isMulticlassEntry && classIdentifier === 'warlock';
    const warlockInvocationChoice = warlockInvocationRequired
      ? resolveWarlockLevelOneInvocation(this._warlockInvocationPick)
      : { valid: true, invocation: null };

    // Step de magias: aparece sempre que a classe tem alguma conjuração E
    // este nível concede slot/cantrip novo de verdade.
    const isBardSpellProgression = !isMulticlassEntry && ['bard', 'sorcerer', 'warlock'].includes(classIdentifier);
    const levelOnePreparedSpells = isMulticlassEntry && classIdentifier !== 'wizard'
      ? classSpellcastingAtLevel(classIdentifier, 1) : null;
    const preparedProgression = levelOnePreparedSpells
      ? { classIdentifier, currentClassLevel: 0, nextClassLevel: 1,
        newPreparedSpells: levelOnePreparedSpells.prepared, newCantrips: levelOnePreparedSpells.cantrips,
        maximumSpellLevel: levelOnePreparedSpells.maximumSpellLevel, replacePreparedSpell: false, replaceCantrip: false }
      : classSpellcastingLevelUpAtLevel(classIdentifier, currentClassLevel, nextClassLevel);
    const newArcanumCircle = mysticArcanumCircleAtLevel(classIdentifier, nextClassLevel);
    const ownedArcanums = items.filter((item) => item.type === 'spell'
      && Number((item.system || item.data || {}).mysticArcanumCircle) >= 6);
    const arcanumCircleForOptions = newArcanumCircle || Number(ownedArcanums.find((item) => item.id === this._arcanumReplaceOut)
      ? ((ownedArcanums.find((item) => item.id === this._arcanumReplaceOut).system || ownedArcanums.find((item) => item.id === this._arcanumReplaceOut).data || {}).mysticArcanumCircle) : 0);
    const isKnownCaster = Object.prototype.hasOwnProperty.call(KNOWN_SPELLS_TABLE, classIdentifier)
      && (isMulticlassEntry || !preparedProgression);
    const maxSpellLevel = this._maxSpellLevelAt(casterType, nextClassLevel);
    const newSpellsRequired = preparedProgression?.newPreparedSpells
      ?? (isKnownCaster ? this._newCountFromTable(KNOWN_SPELLS_TABLE, classIdentifier, currentClassLevel, nextClassLevel) : 0);
    const newCantripsRequired = preparedProgression?.newCantrips
      ?? this._newCountFromTable(KNOWN_CANTRIPS_TABLE, classIdentifier, currentClassLevel, nextClassLevel);
    const levelOneWizardProgression = isMulticlassEntry && classIdentifier === 'wizard'
      ? classSpellcastingAtLevel('wizard', 1) : null;
    const wizardProgression = classIdentifier === 'wizard'
      ? levelOneWizardProgression
        ? { currentClassLevel: 0, nextClassLevel: 1, newSpellbookSpells: 6,
          newCantrips: levelOneWizardProgression.cantrips, currentPreparedCapacity: 0,
          nextPreparedCapacity: levelOneWizardProgression.prepared, maximumSpellLevel: levelOneWizardProgression.maximumSpellLevel }
        : wizardSpellcastingLevelUpAtLevel(currentClassLevel, nextClassLevel)
      : null;
    const wizardBookItems = items.filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).wizardSpellbook === true
      && (item.system || item.data || {}).sourceClassIdentifier === 'wizard');
    const wizardSpellMasteryRequired = !isMulticlassEntry && classIdentifier === 'wizard' && nextClassLevel === 18;
    const wizardSignatureSpellsRequired = !isMulticlassEntry && classIdentifier === 'wizard' && nextClassLevel === 20;
    const spellMasteryOptions = (spellLevel) => wizardBookItems.filter((item) => {
      const data = item.system || item.data || {};
      return Number(data.spellLevel) === spellLevel && data.classes?.includes('wizard')
        && /^1 action$/i.test(String(data.castingTime || '').trim());
    }).map((item) => ({ id: item.id, name: item.name, selected: String(item.id) === String(spellLevel === 1
      ? this._wizardSpellMasteryLevelOne : this._wizardSpellMasteryLevelTwo) }));
    const signatureSpellOptions = wizardBookItems.filter((item) => Number((item.system || item.data || {}).spellLevel) === 3
      && (item.system || item.data || {}).classes?.includes('wizard')).map((item) => ({
      id: item.id, name: item.name, firstSelected: String(item.id) === String(this._wizardSignatureSpellIds[0]),
      secondSelected: String(item.id) === String(this._wizardSignatureSpellIds[1]),
    }));
    const wizardSpellMasteryChoice = wizardSpellMasteryRequired
      ? resolveWizardSpellMasteryChoices(18, wizardBookItems, this._wizardSpellMasteryLevelOne, this._wizardSpellMasteryLevelTwo)
      : { valid: true };
    const wizardSignatureSpellChoice = wizardSignatureSpellsRequired
      ? resolveWizardSignatureSpellChoices(20, wizardBookItems, this._wizardSignatureSpellIds)
      : { valid: true };
    const wizardCantripItems = items.filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
      && Number((item.system || item.data || {}).spellLevel) === 0);
    const wizardPreparedCount = wizardBookItems.filter((item) => (item.system || item.data || {}).prepared).length;
    const wizardState = isMulticlassEntry && classIdentifier === 'wizard'
      ? { valid: true, expectedSpellbookCount: 0, preparedCount: 0 }
      : wizardProgression
      ? inspectWizardSpellbookState(currentClassLevel, wizardBookItems, wizardCantripItems)
      : { valid: true, expectedSpellbookCount: 0, preparedCount: 0 };
    const bardPreparedItems = items.filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).sourceClassIdentifier === classIdentifier
      && (item.system || item.data || {}).prepared
      && Number((item.system || item.data || {}).spellLevel) > 0);
    const bardCantripItems = items.filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).sourceClassIdentifier === classIdentifier
      && Number((item.system || item.data || {}).spellLevel) === 0);
    const bardState = isBardSpellProgression
      ? inspectPreparedSpellState(classIdentifier, currentClassLevel, bardPreparedItems, bardCantripItems, true)
      : { valid: true, errors: [] };
    const wizardExpectedBookCount = wizardState.expectedSpellbookCount;
    const wizardMetadataValid = wizardState.valid;
    const wizardPreparedRequired = wizardProgression && wizardMetadataValid
      ? Math.max(0, wizardProgression.nextPreparedCapacity - wizardPreparedCount) : 0;
    this._wizardPreparedPickLimit = wizardPreparedRequired;
    const wizardBookRows = wizardBookItems.map((item) => ({
      id: item.id, name: item.name, data: item.system || item.data || {}, actorItem: true,
    })).concat(this._wizardSpellbookPicks.map((entry) => ({ ...entry, actorItem: false })));
    const preparedPickIds = new Set(this._wizardPreparedPicks.map((entry) => entry.id));
    const wizardBookRowsForContext = wizardBookRows.map((entry) => ({
      ...entry,
      canPrepare: !entry.data?.prepared,
      selectedForPreparation: preparedPickIds.has(entry.id),
    }));
    const isPreparedCaster = (casterType === 'full' || casterType === 'half') && !isKnownCaster;
    const isPreparedProgressionCaster = !!preparedProgression;
    const isWizardSpellProgression = !!wizardProgression;
    const showSpells = isBardSpellProgression || isWizardSpellProgression || (isPreparedProgressionCaster
      ? newSpellsRequired > 0 || newCantripsRequired > 0
      : maxSpellLevel > 0 || newCantripsRequired > 0 || isPreparedCaster);

    const activeSteps = STEPS.filter((s) => {
      if (s === 'class') return classItems.length > 1 || this._addingNewClass;
      if (s === 'asi') return showAsi;
      if (s === 'subclass') return showSubclass;
      if (s === 'choices') return wizardScholarRequired || wizardSpellMasteryRequired || wizardSignatureSpellsRequired || weaponMasteryRequired || fighterStyleRequired
        || divineOrderRequired || primalOrderRequired || warlockInvocationRequired || multiclassProficiencyChoiceRequired || bardExpertiseRequired || rogueChoicesRequired;
      if (s === 'spells') return showSpells;
      return true;
    });
    const step = activeSteps[this._step] || activeSteps[activeSteps.length - 1];
    this._lastActiveStepId = step;
    const worldId = window.Loom?.world?.id;
    this._storedMulticlassJournal = readMulticlassAdvancementJournal(worldId, this.document?.id);

    const spellResults = this._search.spell.results.filter((e) => {
      const alreadyPicked = this._spellPicks.leveled.some((p) => p.id === e.id) || this._spellPicks.cantrips.some((p) => p.id === e.id);
      const spellLevel = Number(e.data?.spellLevel) || 0;
      const wizardPicked = this._wizardSpellbookPicks.some((p) => p.id === e.id)
        || this._wizardCantripPicks.some((p) => p.id === e.id);
      const rangerFavoredEnemySpell = classIdentifier === 'ranger' && String(e.name).toLocaleLowerCase() === "hunter's mark";
      return !alreadyPicked && !wizardPicked && !rangerFavoredEnemySpell
        && e.id !== this._divineOrderCantripPick?.id && spellLevel <= maxSpellLevel;
    });
    const featMechanics = getFeatMechanics(this._featPick?.data);
    const featSupport = featMechanicsSupport(this._featPick?.data);
    const featAbilityEffect = featSupport.valid && featMechanics?.support === 'automatic'
      ? featMechanics.effects.find((effect) => effect.type === 'ability-score-increase') : null;
    const featAbilityOptions = featMechanics?.choices?.find((choice) => choice.id === featAbilityEffect?.parameters?.choiceId)?.options || [];
    const proficiencyEffect = featMechanics?.effects?.find((effect) => effect.type === 'proficiency');
    const proficiencyChoice = featMechanics?.choices?.find((choice) => choice.id === proficiencyEffect?.parameters?.choiceId);
    const featChoiceGrants = proficiencyEffect ? resolveFeatMechanicChoices(this._featPick?.data, this._featChoices, {
      skills: sd.skills || {}, tools: sd.proficiencies?.tools || [],
    }) : { valid: true, missing: false, skills: [], tools: [], errors: [] };

    return {
      ...context,
      _classItems: classItems.map((i) => ({ id: i.id, name: i.name, levels: (i.system || i.data || {}).levels || 1, selected: i.id === this._classId })),
      _isMulticlassEntry: isMulticlassEntry,
      _addingNewClass: this._addingNewClass,
      _multiclassClassName: this._multiclassClassPick?.name || '',
      _rangerFavoredEnemyRequired: isMulticlassEntry && classIdentifier === 'ranger',
      _multiclassPrerequisitesValid: multiclassPrerequisites.valid,
      _multiclassClassResults: this._search.class.results,
      _hasMulticlassRecovery: !!this._storedMulticlassJournal && this._storedMulticlassJournal.status !== 'complete',
      _multiclassRecoveryNeedsReview: this._storedMulticlassJournal?.status === 'needs-review' || !!this._storedMulticlassJournal?.invalidCheckpoint,
      _stepClass: step === 'class',
      _stepHp: step === 'hp',
      _stepAsi: step === 'asi',
      _stepSubclass: step === 'subclass',
      _stepChoices: step === 'choices',
      _wizardScholarRequired: wizardScholarRequired,
      _wizardScholarChoiceValid: wizardScholarChoice.valid,
      _wizardScholarOptions: wizardScholarOptions,
      _wizardScholarSkill: this._wizardScholarSkill,
      _wizardSpellMasteryRequired: wizardSpellMasteryRequired,
      _wizardSpellMasteryValid: wizardSpellMasteryChoice.valid,
      _wizardSpellMasteryLevelOne: this._wizardSpellMasteryLevelOne,
      _wizardSpellMasteryLevelTwo: this._wizardSpellMasteryLevelTwo,
      _wizardSpellMasteryLevelOneOptions: spellMasteryOptions(1),
      _wizardSpellMasteryLevelTwoOptions: spellMasteryOptions(2),
      _wizardSignatureSpellsRequired: wizardSignatureSpellsRequired,
      _wizardSignatureSpellsValid: wizardSignatureSpellChoice.valid,
      _wizardSignatureSpellOptions: signatureSpellOptions,
      _bardExpertiseRequired: bardExpertiseRequired,
      _bardExpertiseValid: bardExpertiseChoice.valid,
      _bardExpertiseOptions: bardExpertiseOptions,
      _bardExpertiseCount: this._bardExpertisePicks.length,
      _rogueChoicesRequired: rogueChoicesRequired,
      _rogueExpertiseValid: rogueExpertiseChoice.valid,
      _rogueExpertiseOptions: rogueExpertiseOptions,
      _rogueExpertiseCount: this._rogueExpertisePicks.length,
      _rogueLanguageOptions: rogueLanguageOptions,
      _rogueLanguagePick: this._rogueLanguagePick,
      _rogueLanguageValid: rogueLanguageChoice.valid,
      _rogueSpecialLanguage: ROGUE_SPECIAL_LANGUAGE,
      _weaponMasteryRequired: weaponMasteryRequired,
      _weaponMasteryValid: weaponMasteryChoice.valid && masteryProgressionValid,
      _weaponMasteryOptions: weaponMasteryOptions,
      _weaponMasteryCount: this._weaponMasteryPicks.length,
      _weaponMasteryNeeded: weaponMasteryChoice.required,
      _fighterStyleRequired: fighterStyleRequired,
      _fighterStylePicked: this._fighterStylePick,
      _fighterStyleQuery: this._search.feat.query,
      _fighterStyleResults: this._search.feat.results,
      _divineOrderRequired: divineOrderRequired,
      _divineOrderChoice: this._divineOrderChoice,
      _divineOrderProtector: this._divineOrderChoice === 'protector',
      _divineOrderThaumaturge: this._divineOrderChoice === 'thaumaturge',
      _divineOrderCantripPick: this._divineOrderCantripPick,
      _divineOrderCantripOptions: this._search.spell.results.filter((entry) => Number(entry.data?.spellLevel) === 0
        && entry.data?.classes?.includes('cleric')).map((entry) => ({ ...entry, selected: entry.id === this._divineOrderCantripPick?.id })),
      _divineOrderChoiceValid: divineOrderChoice.valid,
      _primalOrderRequired: primalOrderRequired,
      _primalOrderMagician: this._primalOrderChoice === 'magician',
      _primalOrderWarden: this._primalOrderChoice === 'warden',
      _primalOrderCantripPick: this._primalOrderCantripPick,
      _primalOrderCantripOptions: this._search.spell.results.filter((entry) => Number(entry.data?.spellLevel) === 0
        && entry.data?.classes?.includes('druid') && !this._spellPicks.cantrips.some(({ id }) => id === entry.id))
        .map((entry) => ({ ...entry, selected: entry.id === this._primalOrderCantripPick?.id })),
      _primalOrderChoiceValid: primalOrderChoice.valid,
      _warlockInvocationRequired: warlockInvocationRequired,
      _warlockInvocationPick: this._warlockInvocationPick,
      _warlockInvocationOptions: WARLOCK_LEVEL_ONE_INVOCATIONS.map((entry) => ({
        ...entry, selected: entry.identifier === this._warlockInvocationPick,
      })),
      _warlockInvocationChoiceValid: warlockInvocationChoice.valid,
      _multiclassProficiencyChoiceRequired: multiclassProficiencyChoiceRequired,
      _multiclassSkillChoiceCount: multiclassProficiencyChoices.skillCount,
      _multiclassToolChoiceCount: multiclassProficiencyChoices.toolChoiceCount,
      _multiclassSkillChoicesValid: multiclassProficiencyChoices.valid,
      _multiclassSkillCount: this._multiclassSkillPicks.length,
      _multiclassToolCount: this._multiclassToolPicks.length,
      _multiclassSkillOptions: multiclassProficiencyChoices.skillOptions.map((key) => ({
        key, label: SKILL_LABELS[key] || key, selected: this._multiclassSkillPicks.includes(key),
      })),
      _multiclassToolOptions: multiclassProficiencyChoices.toolOptions.map((option) => ({
        ...option,
        label: window.Loom.i18n.localize(option.label),
        selected: this._multiclassToolPicks.includes(option.value),
      })),
      _stepSpells: step === 'spells',
      _stepReview: step === 'review',
      _isFirst: activeSteps.indexOf(step) === 0,
      _isLast: activeSteps.indexOf(step) === activeSteps.length - 1,
      _activeSteps: activeSteps,
      _className: isMulticlassEntry ? this._multiclassClassPick.name : classItem?.name || '(no class selected)',
      _currentClassLevel: currentClassLevel,
      _nextClassLevel: nextClassLevel,
      _nextTotalLevel: nextTotalLevel,
      _die: die,
      _hpGain: hpGain,
      _fixedHpGain: fixedHpGain,
      _hpRoll: this._hpRoll,
      _hpModePlayer: hpMode === 'player',
      _hpModeFixed: selectedHpMode === 'fixed',
      _hpModeRoll: selectedHpMode === 'roll',
      _asiModeScores: this._asiMode === 'scores',
      _asiModeFeat: this._asiMode === 'feat',
      _isEpicBoon: entitlement.epicBoon,
      _abilities: ABILITY_KEYS.map((k) => ({ key: k, label: ABILITY_LABELS[k], value: sd.abilities?.[k]?.value ?? 10, atCap: (sd.abilities?.[k]?.value ?? 10) >= 20, selectedFirst: this._asiPicks.first === k, selectedSecond: this._asiPicks.second === k, selectedFeatFirst: this._featAbilityPicks.first === k, selectedFeatSecond: this._featAbilityPicks.second === k })),
      _featName: this._featName,
      _featPicked: !!this._featPick,
      _featDescription: this._featPick?.data?.description || '',
      _featHasAbilityIncrease: !!featAbilityEffect,
      _featManual: !!this._featPick && (!featSupport.valid || featSupport.support !== 'automatic'),
      _featHasChoices: !!proficiencyEffect,
      _featChoiceValid: featChoiceGrants.valid,
      _featChoiceOptions: (proficiencyChoice?.options || []).map((value) => {
        const [kind, ...parts] = value.split(':');
        const key = parts.join(':');
        return { value, label: kind === 'skill' ? SKILL_LABELS[key] || key : key,
          selectedFirst: this._featChoices[0] === value, selectedSecond: this._featChoices[1] === value, selectedThird: this._featChoices[2] === value };
      }),
      _featChoiceSummary: this._featChoices.map((value) => {
        const [kind, ...parts] = value.split(':');
        const key = parts.join(':');
        return kind === 'skill' ? SKILL_LABELS[key] || key : key;
      }).filter(Boolean).join(', '),
      _featAbilityOptions: ABILITY_KEYS.filter((key) => featAbilityOptions.includes(key)).map((key) => ({ key, label: ABILITY_LABELS[key], value: sd.abilities?.[key]?.value ?? 10, atCap: (sd.abilities?.[key]?.value ?? 10) >= 20, selectedFirst: this._featAbilityPicks.first === key, selectedSecond: this._featAbilityPicks.second === key })),
      _featQuery: this._search.feat.query,
      _featResults: this._search.feat.results,
      _subclassName: this._subclassName,
      _subclassPicked: !!this._subclassPick,
      _subclassQuery: this._search.subclass.query,
      _subclassResults: this._search.subclass.results,
      _isKnownCaster: isKnownCaster,
      _isBardSpellProgression: isBardSpellProgression,
      _isSorcererSpellProgression: classIdentifier === 'sorcerer',
      _isWarlockSpellProgression: classIdentifier === 'warlock',
      _newArcanumCircle: newArcanumCircle,
      _arcanumPick: this._arcanumPick,
      _arcanumNewOptions: this._search.spell.results.filter((entry) => isValidMysticArcanumSpell(entry.data, newArcanumCircle)
        && !items.some((item) => item.type === 'spell' && String(item.name).localeCompare(entry.name, undefined, { sensitivity: 'base' }) === 0))
        .map((entry) => ({ id: entry.id, name: entry.name, selected: entry.id === this._arcanumPick })),
      _arcanumOwnedOptions: ownedArcanums.map((item) => ({ id: item.id, name: item.name, selected: item.id === this._arcanumReplaceOut })),
      _arcanumReplacementOptions: this._search.spell.results.filter((entry) => isValidMysticArcanumSpell(entry.data, arcanumCircleForOptions)
        && !items.some((item) => item.type === 'spell' && item.id !== this._arcanumReplaceOut
          && String(item.name).localeCompare(entry.name, undefined, { sensitivity: 'base' }) === 0))
        .map((entry) => ({ id: entry.id, name: entry.name, selected: entry.id === this._arcanumReplaceIn })),
      _bardMetadataValid: bardState.valid,
      _bardPreparedOptions: bardPreparedItems.map((item) => ({ id: item.id, name: item.name, selected: item.id === this._bardReplacement.spellOut })),
      _bardCantripOptions: bardCantripItems.map((item) => ({ id: item.id, name: item.name, selected: item.id === this._bardReplacement.cantripOut })),
      _bardSpellReplacementOptions: this._search.spell.results.filter((entry) => Number(entry.data?.spellLevel) >= 1
        && Number(entry.data?.spellLevel) <= maxSpellLevel && entry.data?.classes?.includes(classIdentifier))
        .map((entry) => ({ id: entry.id, name: entry.name, selected: entry.id === this._bardReplacement.spellIn })),
      _bardCantripReplacementOptions: this._search.spell.results.filter((entry) => Number(entry.data?.spellLevel) === 0
        && entry.data?.classes?.includes(classIdentifier))
        .map((entry) => ({ id: entry.id, name: entry.name, selected: entry.id === this._bardReplacement.cantripIn })),
      _isPreparedProgressionCaster: isPreparedProgressionCaster,
      _isWizardSpellProgression: isWizardSpellProgression,
      _wizardMetadataValid: wizardMetadataValid,
      _wizardBookPicks: this._wizardSpellbookPicks,
      _wizardBookRows: wizardBookRowsForContext,
      _wizardPreparedPicks: this._wizardPreparedPicks,
      _wizardCantripPicks: this._wizardCantripPicks,
      _wizardSpellbookCurrentCount: wizardBookItems.length,
      _wizardSpellbookExpectedCount: wizardExpectedBookCount,
      _wizardPreparedCurrentCount: wizardPreparedCount,
      _wizardPreparedRequired: wizardPreparedRequired,
      _newSpellsRequired: newSpellsRequired,
      _newCantripsRequired: newCantripsRequired,
      _spellQuery: this._search.spell.query,
      _spellResults: spellResults,
      _spellPicksLeveled: this._spellPicks.leveled,
      _spellPicksCantrips: this._spellPicks.cantrips,
      _spellLeveledCount: this._spellPicks.leveled.length,
      _spellCantripCount: this._spellPicks.cantrips.length,
      _preparedSpellCapacity: preparedProgression?.newPreparedSpells || 0,
      _canFinish: (!!classItem || (isMulticlassEntry && multiclassPrerequisites.valid))
        && nextTotalLevel <= 20
        && (!isMulticlassEntry || multiclassProficiencyChoices.valid)
        && (!entitlement.subclass || !!this._subclassPick)
        && (!(entitlement.abilityImprovement || entitlement.epicBoon)
          || (this._asiMode === 'feat' ? !!this._featPick && (!featAbilityEffect || !!this._featAbilityPicks.first) : !!this._asiPicks.first))
        && featChoiceGrants.valid
        && (!isPreparedProgressionCaster
          || (this._spellPicks.leveled.length === newSpellsRequired
            && this._spellPicks.cantrips.length === newCantripsRequired))
        && (!isBardSpellProgression || (bardState.valid
          && !!this._bardReplacement.spellOut && !!this._bardReplacement.spellIn
          && !!this._bardReplacement.cantripOut && !!this._bardReplacement.cantripIn
          && this._spellPicks.leveled.length === newSpellsRequired
          && this._spellPicks.cantrips.length === newCantripsRequired))
        && (!isWizardSpellProgression || (wizardMetadataValid
          && this._wizardSpellbookPicks.length === wizardProgression.newSpellbookSpells
          && this._wizardCantripPicks.length === wizardProgression.newCantrips
          && this._wizardPreparedPicks.length === wizardPreparedRequired))
        && (!wizardScholarRequired || wizardScholarChoice.valid)
        && (!wizardSpellMasteryRequired || wizardSpellMasteryChoice.valid)
        && (!wizardSignatureSpellsRequired || wizardSignatureSpellChoice.valid)
        && (!bardExpertiseRequired || bardExpertiseChoice.valid)
        && (!rogueChoicesRequired || (rogueExpertiseChoice.valid && rogueLanguageChoice.valid))
        && (!weaponMasteryRequired || (weaponMasteryChoice.valid && masteryProgressionValid))
        && (!fighterStyleRequired || !!this._fighterStylePick)
        && (!divineOrderRequired || divineOrderChoice.valid)
        && (!newArcanumCircle || !!this._arcanumPick),
    };
  }

  _onChangeForm(event) {
    const target = event.target;
    const searchKind = target?.dataset?.wizardSearch;
    if (searchKind && this._search[searchKind]) {
      const bucket = this._search[searchKind];
      bucket.query = target.value;
      clearTimeout(bucket.timer);
      bucket.timer = setTimeout(() => void this._runSearch(searchKind), 300);
      return;
    }
    if (!target?.name) return;
    const featChoiceMatch = /^w:featChoice([123])$/.exec(target.name);
    if (featChoiceMatch) {
      const choices = [...this._featChoices];
      choices[Number(featChoiceMatch[1]) - 1] = target.value;
      this._featChoices = choices;
      void this.render();
      return;
    }
    if (target.name === 'w:classId') {
      this._classId = target.value;
      this._addingNewClass = false;
      this._multiclassClassPick = null;
      this._hpRoll = null;
      this._spellPicks = { leveled: [], cantrips: [] };
      this._bardReplacement = { spellOut: '', spellIn: '', cantripOut: '', cantripIn: '' };
      this._wizardSpellbookPicks = [];
      this._wizardPreparedPicks = [];
      this._wizardCantripPicks = [];
      this._wizardScholarSkill = '';
      this._wizardSpellMasteryLevelOne = '';
      this._wizardSpellMasteryLevelTwo = '';
      this._wizardSignatureSpellIds = ['', ''];
      this._weaponMasteryPicks = [];
      this._bardExpertisePicks = [];
      this._rogueExpertisePicks = [];
      this._rogueLanguagePick = '';
      this._search.spell.query = '';
      this._search.spell.results = [];
      void this.render().then(() => this._preloadStepData());
      return;
    }
    if (target.name === 'w:hpMode') { this._hpMode = target.value; void this.render(); return; }
    if (target.name === 'w:asiMode') {
      this._asiMode = target.value;
      void this.render().then(() => this._preloadStepData());
      return;
    }
    if (target.name === 'w:asiFirst') { this._asiPicks.first = target.value; return; }
    if (target.name === 'w:asiSecond') { this._asiPicks.second = target.value; return; }
    if (target.name === 'w:wizardScholarSkill') { this._wizardScholarSkill = target.value; void this.render(); return; }
    if (target.name === 'w:wizardSpellMasteryLevelOne') { this._wizardSpellMasteryLevelOne = target.value; void this.render(); return; }
    if (target.name === 'w:wizardSpellMasteryLevelTwo') { this._wizardSpellMasteryLevelTwo = target.value; void this.render(); return; }
    if (target.name === 'w:wizardSignatureSpellFirst') { this._wizardSignatureSpellIds[0] = target.value; void this.render(); return; }
    if (target.name === 'w:wizardSignatureSpellSecond') { this._wizardSignatureSpellIds[1] = target.value; void this.render(); return; }
    if (target.name === 'w:bardExpertiseSkill') {
      const selected = new Set(this._bardExpertisePicks);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      this._bardExpertisePicks = [...selected];
      void this.render();
      return;
    }
    if (target.name === 'w:rogueExpertiseSkill') {
      const selected = new Set(this._rogueExpertisePicks);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      this._rogueExpertisePicks = [...selected];
      void this.render();
      return;
    }
    if (target.name === 'w:rogueLanguage') { this._rogueLanguagePick = target.value; void this.render(); return; }
    if (target.name === 'w:warlockInvocation') { this._warlockInvocationPick = target.value; void this.render(); return; }
    if (target.name === 'w:weaponMastery') {
      const selected = new Set(this._weaponMasteryPicks);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      this._weaponMasteryPicks = [...selected];
      void this.render();
      return;
    }
    if (target.name === 'w:multiclassSkillChoice') {
      const selected = new Set(this._multiclassSkillPicks);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      this._multiclassSkillPicks = [...selected];
      void this.render();
      return;
    }
    if (target.name === 'w:multiclassToolChoice') {
      const selected = new Set(this._multiclassToolPicks);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      this._multiclassToolPicks = [...selected];
      void this.render();
      return;
    }
    if (target.name === 'w:featAbilityFirst') { this._featAbilityPicks.first = target.value; void this.render(); return; }
    if (target.name === 'w:featAbilitySecond') { this._featAbilityPicks.second = target.value; void this.render(); return; }
    if (target.name.startsWith('w:bardReplacement.')) {
      const key = target.name.slice('w:bardReplacement.'.length);
      if (Object.hasOwn(this._bardReplacement, key)) this._bardReplacement[key] = target.value;
      void this.render();
      return;
    }
    if (target.name === 'w:arcanumPick') { this._arcanumPick = target.value; void this.render(); return; }
    if (target.name === 'w:arcanumReplaceOut') { this._arcanumReplaceOut = target.value; this._arcanumReplaceIn = ''; void this.render(); return; }
    if (target.name === 'w:arcanumReplaceIn') { this._arcanumReplaceIn = target.value; void this.render(); }
  }

  onAction(action, id, target) {
    if (action === 'wizard-next') { void this._goStep(1); return; }
    if (action === 'wizard-back') { void this._goStep(-1); return; }
    if (action === 'wizard-add-multiclass') { void this._startMulticlassWizard(); return; }
    if (action === 'wizard-pick-class') { this._pickFromResults('class', id); return; }
    if (action === 'wizard-resume-multiclass') {
      void this._resumeMulticlassAdvancement().catch((error) => {
        console.error('[srd5e] Multiclass recovery stopped:', error);
        showToast?.(localizeWizard('MulticlassRecoveryReview'), 'error');
      });
      return;
    }
    if (action === 'wizard-finish') {
      void this._finish().catch((error) => {
        console.error('[srd5e] Level Up commit failed:', error);
        showToast?.(localizeWizard('ProgressionCommitFailed'), 'error');
      });
      return;
    }
    if (action === 'wizard-pick-feat') { this._pickFromResults('feat', id); return; }
    if (action === 'wizard-pick-fighting-style') {
      this._fighterStylePick = this._search.feat.results.find((entry) => entry.id === id) || null;
      void this.render();
      return;
    }
    if (action === 'wizard-clear-fighting-style') { this._fighterStylePick = null; void this.render(); return; }
    if (action === 'wizard-pick-divine-order') {
      this._divineOrderChoice = id;
      if (id === 'protector') this._divineOrderCantripPick = null;
      void this.render().then(() => this._preloadStepData());
      return;
    }
    if (action === 'wizard-pick-divine-order-cantrip') {
      this._divineOrderCantripPick = this._search.spell.results.find((entry) => entry.id === id) || null;
      void this.render();
      return;
    }
    if (action === 'wizard-clear-divine-order-cantrip') { this._divineOrderCantripPick = null; void this.render(); return; }
    if (action === 'wizard-pick-primal-order') {
      this._primalOrderChoice = id;
      if (id === 'warden') this._primalOrderCantripPick = null;
      void this.render().then(() => this._preloadStepData());
      return;
    }
    if (action === 'wizard-pick-primal-order-cantrip') {
      this._primalOrderCantripPick = this._search.spell.results.find((entry) => entry.id === id) || null;
      void this.render();
      return;
    }
    if (action === 'wizard-clear-primal-order-cantrip') { this._primalOrderCantripPick = null; void this.render(); return; }
    if (action === 'wizard-clear-feat') { void this._clearFeat(); return; }
    if (action === 'wizard-pick-subclass') { this._pickFromResults('subclass', id); return; }
    if (action === 'wizard-clear-subclass') { void this._clearSubclass(); return; }
    if (action === 'wizard-toggle-spell') { this._toggleSpellPick(id); return; }
    if (action === 'wizard-toggle-wizard-book') { this._toggleWizardSpellPick('spellbook', id); return; }
    if (action === 'wizard-toggle-wizard-prepared') { this._toggleWizardSpellPick('prepared', id); return; }
    if (action === 'wizard-toggle-wizard-cantrip') { this._toggleWizardSpellPick('cantrips', id); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _goStep(delta) {
    if (delta > 0 && this._lastActiveStepId === 'class' && this._addingNewClass && !this._multiclassClassPick) {
      showToast?.(localizeWizard('ChooseMulticlassClassFirst'), 'warning');
      return;
    }
    this._step = Math.max(0, this._step + delta);
    await this.render();
    await this._preloadStepData();
  }

  async _startMulticlassWizard() {
    this._addingNewClass = true;
    this._multiclassClassPick = null;
    this._step = 0;
    this._search.class.query = '';
    this._search.class.results = [];
    await this.render();
    await this._preloadStepData();
  }

  async _runMulticlassAdvancement(journal) {
    const worldId = window.Loom?.world?.id;
    const actorId = this.document?.id;
    const storage = globalThis.localStorage;
    const hasStartedWrites = journal.operations.some(({ status }) => status !== 'pending');
    if (!hasStartedWrites && getSetting('learningMilestones', true) !== true) {
      const latestActor = await api.get(`/actors/${encodeURIComponent(actorId)}?populate=true`);
      const latestData = latestActor?.systemData || {};
      const eligibility = resolveLevelUpEligibility(latestData.details?.xp?.value ?? 0,
        latestData.details?.level ?? 1, false);
      if (!eligibility.allowed) {
        throw new Error(localizeWizard('InsufficientXP')
          .replace('{max}', eligibility.progress.nextThreshold.toLocaleString())
          .replace('{current}', eligibility.progress.xp.toLocaleString()));
      }
    }
    const adapter = multiclassAdvancementApiAdapter({ api, worldId, actorId });
    const completed = await runMulticlassAdvancementJournal(journal, { storage, ...adapter });
    if (completed.status !== 'complete') throw new Error('Multiclass advancement is not fully confirmed.');
    showToast?.(localizeWizard('ProgressionLevelUpComplete'), 'success');
    windowManager.close(this.options.id);
  }

  async _resumeMulticlassAdvancement() {
    const worldId = window.Loom?.world?.id;
    const journal = readMulticlassAdvancementJournal(worldId, this.document?.id);
    if (!journal || journal.status === 'complete') return;
    await this._runMulticlassAdvancement(journal);
  }

  async _commitWizardAdvancementRecoverably({ worldId, actorId, classItem, currentClassLevel, currentSystemData,
    classData, actorPatch, featToGrant, existingItems, subclassSpellWrites }) {
    const priorJournal = readMulticlassAdvancementJournal(worldId, actorId);
    if (priorJournal && priorJournal.status !== 'complete') {
      throw new Error(localizeWizard('MulticlassRecoveryResumeFirst'));
    }
    const actor = await api.get(`/actors/${actorId}?populate=true`);
    const featureEntries = await searchCompendiumEntries('feature', '', true);
    if (!actor?.id || actor.id !== actorId) throw new Error('Could not verify the character before Wizard progression.');
    const latestSystem = actor.systemData || {};
    const stalePaths = [
      ['details', 'level'], ['details', 'xp'], ['resources', 'health'], ['resources', 'hitDice'],
      ['abilities'], ['skills'], ['proficiencies', 'tools'],
    ];
    const pathValue = (object, path) => path.reduce((value, key) => value?.[key], object);
    const stable = (value) => value && typeof value === 'object'
      ? Array.isArray(value) ? `[${value.map(stable).join(',')}]`
        : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    if (stalePaths.some((path) => stable(pathValue(latestSystem, path))
      !== stable(pathValue(currentSystemData, path)))) {
      throw new Error(localizeWizard('ProgressionActorChanged'));
    }
    const liveClassItem = (actor.items || []).find((item) => item.id === classItem.id && item.type === 'class');
    if (!liveClassItem || Number((liveClassItem.system || liveClassItem.data || {}).levels) !== currentClassLevel) {
      throw new Error(localizeWizard('ProgressionActorChanged'));
    }

    const items = actor.items || [];
    const wizardSpellbook = items.filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
      && (item.system || item.data || {}).wizardSpellbook === true);
    const wizardSpellMasteryChoice = classData.levels === 18
      ? resolveWizardSpellMasteryChoices(18, wizardSpellbook, this._wizardSpellMasteryLevelOne, this._wizardSpellMasteryLevelTwo)
      : { valid: true };
    const wizardSignatureSpellChoice = classData.levels === 20
      ? resolveWizardSignatureSpellChoices(20, wizardSpellbook, this._wizardSignatureSpellIds)
      : { valid: true };
    if (!wizardSpellMasteryChoice.valid || !wizardSignatureSpellChoice.valid) {
      throw new Error('Wizard spell feature choices changed or are not present in the verified spellbook.');
    }
    const existingFeatures = items.filter((item) => item.type === 'feature');
    const featurePlan = selectClassFeaturesToGrant(featureEntries, 'wizard', currentClassLevel, classData.levels, existingFeatures);
    if (featurePlan.skippedSourceCount) {
      const message = window.Loom?.i18n?.localize?.('SDR5E.Progression.UnverifiedClassFeaturesSkipped');
      if (message) window.Loom?.showToast?.(`${message} (${featurePlan.skippedSourceCount})`, 'warning');
    }
    const creates = [];
    const updates = [];
    const keyPart = (value) => String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const addCreate = (key, name, type, data) => creates.push({ key, name, type, data });
    const addUpdate = (key, item, data, name) => {
      const prior = updates.find((entry) => entry.id === item.id);
      if (prior) {
        prior.data = { ...prior.data, ...structuredClone(data) };
        if (name) prior.name = name;
      } else updates.push({ key, id: item.id, data, ...(name ? { name } : {}) });
    };

    if (featToGrant) addCreate('feat-choice', featToGrant.name, 'feat', featToGrant.data);
    const selectedSubclassExists = items.some((item) => item.type === 'subclass'
      && String(item.name).localeCompare(this._subclassPick?.name || '', undefined, { sensitivity: 'base' }) === 0);
    if (this._subclassPick && !selectedSubclassExists) {
      addCreate('subclass-choice', this._subclassPick.name, 'subclass', this._subclassPick.data);
    }

    const selectedSpellNames = new Set([...this._spellPicks.leveled, ...this._spellPicks.cantrips]
      .map((entry) => String(entry.name).toLocaleLowerCase()));
    for (const entry of [...this._spellPicks.leveled, ...this._spellPicks.cantrips]) {
      if (items.some((item) => item.type === 'spell'
        && String(item.name).localeCompare(entry.name, undefined, { sensitivity: 'base' }) === 0)) continue;
      const subclassGrant = subclassSpellWrites.find((write) => write.kind === 'create'
        && String(write.name).localeCompare(entry.name, undefined, { sensitivity: 'base' }) === 0);
      addCreate(`spell-${keyPart(entry.name)}`, entry.name, 'spell', subclassGrant
        ? { ...subclassGrant.data, independentlyOwned: true }
        : entry.data);
    }
    for (const write of subclassSpellWrites) {
      if (selectedSpellNames.has(String(write.name).toLocaleLowerCase())) continue;
      if (write.kind === 'update') addUpdate(`subclass-spell-${keyPart(write.item.name)}`, write.item, write.data);
      else addCreate(`subclass-spell-${keyPart(write.name)}`, write.name, write.type, write.data);
    }

    const preparedSpellIds = new Set(this._wizardPreparedPicks.map((entry) => entry.id));
    for (const entry of this._wizardCantripPicks) {
      addCreate(`cantrip-${keyPart(entry.name)}`, entry.name, 'spell', {
        ...entry.data, prepared: true, sourceClassIdentifier: 'wizard', wizardSpellbook: false,
        learnedAtWizardLevel: classData.levels,
      });
    }
    for (const entry of this._wizardSpellbookPicks) {
      addCreate(`spellbook-${keyPart(entry.name)}`, entry.name, 'spell', {
        ...entry.data, prepared: preparedSpellIds.has(entry.id), sourceClassIdentifier: 'wizard',
        wizardSpellbook: true, learnedAtWizardLevel: classData.levels,
      });
    }
    for (const entry of this._wizardPreparedPicks.filter((pick) => pick.actorItem)) {
      addUpdate(`prepare-${keyPart(entry.name)}`, entry, { ...entry.data, prepared: true });
    }
    const alwaysPreparedIds = classData.levels === 18
      ? [wizardSpellMasteryChoice.levelOneId, wizardSpellMasteryChoice.levelTwoId]
      : classData.levels === 20 ? wizardSignatureSpellChoice.spellIds : [];
    for (const id of alwaysPreparedIds) {
      const spell = wizardSpellbook.find((item) => String(item.id) === String(id));
      if (!spell) throw new Error('A selected Wizard feature spell is no longer in the verified spellbook.');
      addUpdate(`always-prepare-${keyPart(spell.name)}`, spell,
        { ...(spell.system || spell.data || {}), prepared: true, alwaysPrepared: true });
    }

    const scholarChoice = classData.levels === 2 ? this._wizardScholarSkill : '';
    const currentScholar = existingFeatures.find((item) => (item.system || item.data || {}).classIdentifier === 'wizard'
      && Number((item.system || item.data || {}).levelGained) === 2
      && ((item.system || item.data || {}).identifier === 'scholar' || item.name === 'Scholar'));
    let scholarGranted = false;
    for (const entry of featurePlan.selected) {
      let data = { ...entry.data };
      if (data.identifier === 'spell-mastery' && classData.levels === 18) {
        data = { ...data, levelOneSpellId: wizardSpellMasteryChoice.levelOneId,
          levelTwoSpellId: wizardSpellMasteryChoice.levelTwoId };
      }
      if (data.identifier === 'signature-spells' && classData.levels === 20) {
        data = { ...data, signatureSpellIds: wizardSignatureSpellChoice.spellIds,
          signatureSpellUses: Object.fromEntries(wizardSignatureSpellChoice.spellIds.map((id) => [id, 0])) };
      }
      const previous = entry.data?.supersedesName && existingFeatures.find((item) => item.name === entry.data.supersedesName
        && (item.system || item.data || {}).classIdentifier === 'wizard');
      if (entry.data?.identifier === 'scholar' && scholarChoice) {
        data.expertiseSkill = scholarChoice;
        scholarGranted = true;
      }
      if (previous) addUpdate(`feature-${keyPart(entry.name)}`, previous, data, entry.name);
      else addCreate(`feature-${Number(entry.data?.levelGained)}-${keyPart(entry.name)}`, entry.name, 'feature', data);
    }
    for (const [level, identifier, dataPatch] of [
      [18, 'spell-mastery', classData.levels === 18 ? {
        levelOneSpellId: wizardSpellMasteryChoice.levelOneId, levelTwoSpellId: wizardSpellMasteryChoice.levelTwoId,
      } : null],
      [20, 'signature-spells', classData.levels === 20 ? {
        signatureSpellIds: wizardSignatureSpellChoice.spellIds,
        signatureSpellUses: Object.fromEntries(wizardSignatureSpellChoice.spellIds.map((id) => [id, 0])),
      } : null],
    ]) {
      if (!dataPatch) continue;
      const wasSelected = featurePlan.selected.some((entry) => entry.data?.identifier === identifier);
      const prior = existingFeatures.find((item) => (item.system || item.data || {}).identifier === identifier
        && Number((item.system || item.data || {}).levelGained) === level);
      if (!wasSelected && prior) addUpdate(`feature-choice-${identifier}`, prior,
        { ...(prior.system || prior.data || {}), ...dataPatch });
      else if (!wasSelected && !prior) throw new Error(`${identifier} feature is missing; Wizard advancement was not written.`);
    }
    if (scholarChoice && currentScholar && !scholarGranted) {
      const data = currentScholar.system || currentScholar.data || {};
      addUpdate('feature-scholar-choice', currentScholar, { ...data, expertiseSkill: scholarChoice });
      scholarGranted = true;
    }
    if (classData.levels === 2 && !scholarGranted) throw new Error('Scholar feature is missing; Wizard advancement was not written.');

    const transactionId = globalThis.crypto?.randomUUID?.()
      || `wizard-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const journal = createClassLevelUpJournal({
      worldId, actor, transactionId, classItem: liveClassItem, classData, actorPatch,
      creates, updates,
    });
    await this._runMulticlassAdvancement(journal);
  }

  async _commitClassAdvancementRecoverably({ worldId, actorId, classItem, currentClassLevel,
    currentSystemData, currentItems, classData, actorPatch, featToGrant, subclassSpellWrites, resolvedSubclassSpells,
    nextAbilityScores, bardExpertiseChoice, replacementOut, replacementEntry, replacementCircle,
    newArcanumEntry, arcanumCircle, bardProgression, bardReplacementItems, bardReplacementEntries, weaponMasteryProgression }) {
    const priorJournal = readMulticlassAdvancementJournal(worldId, actorId);
    if (priorJournal && priorJournal.status !== 'complete') throw new Error(localizeWizard('MulticlassRecoveryResumeFirst'));

    const featureEntries = await searchCompendiumEntries('feature', '', true);
    const actor = await api.get(`/actors/${encodeURIComponent(actorId)}?populate=true`);
    if (!actor?.id || actor.id !== actorId) throw new Error(localizeWizard('ProgressionRefreshFailed'));
    const latestSystem = actor.systemData || {};
    const stalePaths = [
      ['details', 'level'], ['details', 'xp'], ['resources', 'health'], ['resources', 'hitDice'],
      ['abilities'], ['skills'], ['proficiencies', 'tools'],
    ];
    const pathValue = (object, path) => path.reduce((value, key) => value?.[key], object);
    const stable = (value) => value && typeof value === 'object'
      ? Array.isArray(value) ? `[${value.map(stable).join(',')}]`
        : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    const itemSnapshot = (items) => (items || []).map((item) => ({
      id: item.id, name: item.name, type: item.type, data: item.system || item.data || {},
    }));
    if (stalePaths.some((path) => stable(pathValue(latestSystem, path)) !== stable(pathValue(currentSystemData, path)))
      || stable(itemSnapshot(actor.items)) !== stable(itemSnapshot(currentItems))) {
      throw new Error(localizeWizard('ProgressionActorChanged'));
    }
    const liveClassItem = (actor.items || []).find((item) => item.id === classItem.id && item.type === 'class');
    if (!liveClassItem || Number((liveClassItem.system || liveClassItem.data || {}).levels) !== currentClassLevel) {
      throw new Error(localizeWizard('ProgressionActorChanged'));
    }

    const items = actor.items || [];
    const existingFeatures = items.filter((item) => item.type === 'feature');
    const featurePlan = buildClassFeatureGrantPlan({
      classIdentifier: (classData.classIdentifier || (liveClassItem.system || liveClassItem.data || {}).classIdentifier),
      fromLevel: currentClassLevel,
      toLevel: classData.levels,
      featureEntries,
      existingItems: existingFeatures,
      charismaScore: nextAbilityScores.cha,
      bardExpertiseSelections: bardExpertiseChoice?.selected?.length
        ? { [classData.levels]: bardExpertiseChoice.selected } : {},
    });
    if (featurePlan.skippedSourceCount) {
      const message = window.Loom?.i18n?.localize?.('SDR5E.Progression.UnverifiedClassFeaturesSkipped');
      if (message) showToast?.(`${message} (${featurePlan.skippedSourceCount})`, 'warning');
    }

    const creates = [];
    const updates = [];
    const deletes = [];
    const keyPart = (value) => String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const addCreate = (key, name, type, data) => creates.push({ key, name, type, data: structuredClone(data) });
    const addUpdate = (key, item, data, name) => {
      const prior = updates.find((entry) => entry.id === item.id);
      if (prior) {
        prior.data = { ...prior.data, ...structuredClone(data) };
        if (name) prior.name = name;
      } else updates.push({ key, id: item.id, data: structuredClone(data), ...(name ? { name } : {}) });
    };
    const addDelete = (key, item) => {
      if (item?.id && !deletes.some((entry) => entry.id === item.id)) deletes.push({ key, id: item.id });
    };
    if (featToGrant) addCreate('feat-choice', featToGrant.name, 'feat', featToGrant.data);
    const selectedSubclassExists = items.some((item) => item.type === 'subclass'
      && String(item.name).localeCompare(this._subclassPick?.name || '', undefined, { sensitivity: 'base' }) === 0);
    if (this._subclassPick && !selectedSubclassExists) {
      addCreate('subclass-choice', this._subclassPick.name, 'subclass', this._subclassPick.data);
    }

    const selectedSpellNames = new Set([...this._spellPicks.leveled, ...this._spellPicks.cantrips]
      .map((entry) => String(entry.name).toLocaleLowerCase()));
    for (const entry of [...this._spellPicks.leveled, ...this._spellPicks.cantrips]) {
      if (items.some((item) => item.type === 'spell'
        && String(item.name).localeCompare(entry.name, undefined, { sensitivity: 'base' }) === 0)) continue;
      const classIdentifier = classData.classIdentifier || (liveClassItem.system || liveClassItem.data || {}).classIdentifier;
      const isPreparedProgression = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'paladin', 'ranger'].includes(classIdentifier);
      const subclassGrant = resolvedSubclassSpells.grants.find((grant) =>
        String(grant.name).localeCompare(entry.name, undefined, { sensitivity: 'base' }) === 0);
      const grantData = subclassGrant
        ? subclassSpellGrantItemData(subclassGrant, { independentlyOwned: true, priorData: entry.data })
        : isPreparedProgression
          ? { ...entry.data, prepared: Number(entry.data?.spellLevel) > 0, sourceClassIdentifier: classIdentifier }
          : entry.data;
      addCreate(`spell-${keyPart(entry.name)}`, entry.name, 'spell', grantData);
    }
    for (const write of subclassSpellWrites) {
      if (selectedSpellNames.has(String(write.name).toLocaleLowerCase())) continue;
      if (write.kind === 'update') addUpdate(`subclass-spell-${keyPart(write.item.name)}`, write.item, write.data);
      else addCreate(`subclass-spell-${keyPart(write.name)}`, write.name, write.type, write.data);
    }

    if (replacementOut && replacementEntry) {
      addCreate('mystic-arcanum-replacement', replacementEntry.name, 'spell', {
        ...replacementEntry.data, prepared: false, sourceClassIdentifier: 'warlock',
        mysticArcanumCircle: replacementCircle, uses: mysticArcanumUseState(),
      });
      addDelete('mystic-arcanum-replaced-spell', replacementOut);
    }
    if (arcanumCircle && newArcanumEntry) addCreate('mystic-arcanum-new-spell', newArcanumEntry.name, 'spell', {
      ...newArcanumEntry.data, prepared: false, sourceClassIdentifier: 'warlock',
      mysticArcanumCircle: arcanumCircle, uses: mysticArcanumUseState(),
    });
    if (bardProgression && bardReplacementItems && bardReplacementEntries) {
      addCreate('known-spell-replacement', bardReplacementEntries.newSpell.name, 'spell', {
        ...bardReplacementEntries.newSpell.data, prepared: true, sourceClassIdentifier: classData.classIdentifier,
      });
      addCreate('cantrip-replacement', bardReplacementEntries.newCantrip.name, 'spell', {
        ...bardReplacementEntries.newCantrip.data, prepared: false, sourceClassIdentifier: classData.classIdentifier,
      });
      addDelete('known-spell-replaced', bardReplacementItems.replaceSpell);
      addDelete('cantrip-replaced', bardReplacementItems.replaceCantrip);
    }
    for (const operation of featurePlan.operations) {
      if (operation.kind === 'create-item') addCreate(operation.key, operation.payload.name, 'feature', operation.payload.data);
      else if (operation.kind === 'update-item') {
        const item = items.find((candidate) => candidate.id === operation.payload.id);
        if (!item) throw new Error('A class feature changed before the level-up could be committed.');
        addUpdate(operation.key, item, operation.payload.data, operation.payload.name);
      }
    }
    if (weaponMasteryProgression) {
      const masteryFeature = items.find((item) => item.id === weaponMasteryProgression.featureId
        && item.type === 'feature' && (item.system || item.data || {}).identifier === 'weapon-mastery');
      if (!masteryFeature || stable(weaponMasteryProgression.data)
        !== stable(masteryFeature.system || masteryFeature.data || {})) {
        throw new Error(localizeWizard('ProgressionActorChanged'));
      }
      addUpdate('weapon-mastery-level-increase', masteryFeature, {
        ...(masteryFeature.system || masteryFeature.data || {}),
        masteryCount: weaponMasteryProgression.masteryCount,
        masteredWeaponIdentifiers: weaponMasteryProgression.choices,
      });
    }

    const transactionId = globalThis.crypto?.randomUUID?.()
      || `class-level-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const journal = createClassLevelUpJournal({
      worldId, actor, transactionId, classItem: liveClassItem, classData,
      actorPatch, creates, updates, deletes,
    });
    await this._runMulticlassAdvancement(journal);
  }

  async _finishMulticlassWizardEntry() {
    const worldId = window.Loom?.world?.id;
    const actorId = this.document?.id;
    if (!worldId || !actorId || !this._multiclassClassPick) return;
    const existingJournal = readMulticlassAdvancementJournal(worldId, actorId);
    if (existingJournal && existingJournal.status !== 'complete') {
      showToast?.(localizeWizard('MulticlassRecoveryResumeFirst'), 'warning');
      return;
    }

    let actor;
    let featureEntries;
    try {
      [actor, featureEntries] = await Promise.all([
        api.get(`/actors/${actorId}?populate=true`),
        searchCompendiumEntries('feature', '', true),
      ]);
    } catch (error) {
      console.error('[srd5e] Could not prepare the multiclass advancement:', error);
      showToast?.(localizeWizard('MulticlassLevelUpPrepareFailed'), 'error');
      return;
    }
    const multiclassSystem = actor?.systemData || {};
    const multiclassXpEligibility = resolveLevelUpEligibility(multiclassSystem.details?.xp?.value ?? 0,
      multiclassSystem.details?.level ?? 1, getSetting('learningMilestones', true));
    if (!multiclassXpEligibility.allowed) {
      showToast?.(localizeWizard('InsufficientXP')
        .replace('{max}', multiclassXpEligibility.progress.nextThreshold.toLocaleString())
        .replace('{current}', multiclassXpEligibility.progress.xp.toLocaleString()), 'warning');
      return;
    }
    const spellEntriesById = new Map([
      ...this._search.spell.results,
      ...this._wizardSpellbookPicks,
      ...this._wizardPreparedPicks,
      ...this._wizardCantripPicks,
      ...this._spellPicks.leveled,
      ...this._spellPicks.cantrips,
      ...(this._divineOrderCantripPick ? [this._divineOrderCantripPick] : []),
      ...(this._primalOrderCantripPick ? [this._primalOrderCantripPick] : []),
    ].map((entry) => [entry.id, entry]));
    if (this._multiclassClassPick.data?.classIdentifier === 'ranger') {
      const favoredEnemyEntries = await searchCompendiumEntries('spell', "Hunter's Mark", true);
      for (const entry of favoredEnemyEntries) {
        if (String(entry.name).trim().toLocaleLowerCase() === "hunter's mark"
          && entry.data?.classes?.includes('ranger')) spellEntriesById.set(entry.id, entry);
      }
    }
    const wizardEntry = this._multiclassClassPick.data?.classIdentifier === 'wizard';
    const spellSelection = wizardEntry ? {
      spellbook: this._wizardSpellbookPicks.map(({ id }) => id),
      cantrips: this._wizardCantripPicks.map(({ id }) => id),
      prepared: this._wizardPreparedPicks.map(({ id }) => id),
    } : {
      spellbook: [],
      cantrips: this._spellPicks.cantrips.map(({ id }) => id),
      prepared: this._spellPicks.leveled.map(({ id }) => id),
    };
    const transactionId = globalThis.crypto?.randomUUID?.()
      || `multiclass-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const hpSetting = getSetting('levelUpHpMode', 'player');
    const useRolledHp = hpSetting === 'roll' || (hpSetting === 'player' && this._hpMode === 'roll');
    const result = createMulticlassLevelUpJournal({
      worldId,
      actor,
      classEntry: this._multiclassClassPick,
      featureEntries,
      spellEntries: [...spellEntriesById.values()],
      spellSelection,
      weaponMasterySelection: this._weaponMasteryPicks,
      fighterStyleSelection: this._fighterStylePick,
      divineOrderSelection: { order: this._divineOrderChoice, extraCantripId: this._divineOrderCantripPick?.id || '' },
      primalOrderSelection: { order: this._primalOrderChoice, extraCantripId: this._primalOrderCantripPick?.id || '' },
      warlockInvocationSelection: this._warlockInvocationPick,
      rogueChoices: { expertiseSkills: this._rogueExpertisePicks, additionalLanguage: this._rogueLanguagePick },
      proficiencySelection: { skills: this._multiclassSkillPicks, tools: this._multiclassToolPicks },
      hitDieRoll: useRolledHp ? this._hpRoll : null,
      transactionId,
      featureChoicesReviewed: true,
    });
    if (!result.valid || !result.journal) {
      console.warn('[srd5e] Multiclass advancement validation failed:', result.errors, result.blockers);
      showToast?.(localizeWizard('MulticlassLevelUpChoicesInvalid'), 'warning');
      return;
    }
    this._pendingMulticlassJournal = result.journal;
    try {
      await this._runMulticlassAdvancement(this._pendingMulticlassJournal);
    } catch (error) {
      console.error('[srd5e] Multiclass advancement needs recovery:', error);
      showToast?.(localizeWizard('MulticlassLevelUpCommitFailed'), 'error');
      await this.render();
    }
  }

  /** Carrega o grid de opções do compendium assim que o step correspondente
   * é aberto (ou o modo ASI vira "feat") — mesmo comportamento do grid de
   * Raça/Classe em character-wizard.mjs: navegável por padrão, a busca só
   * filtra o que já está carregado. */
  async _preloadStepData() {
    const stepId = this._lastActiveStepId;
    if (stepId === 'choices' && this._multiclassClassPick?.data?.classIdentifier === 'fighter'
      && !this._fighterStylePick && !this._search.feat.results.length && !this._search.feat.query) {
      void this._runSearch('feat');
    }
    if (stepId === 'choices' && this._multiclassClassPick?.data?.classIdentifier === 'cleric'
      && this._divineOrderChoice === 'thaumaturge' && !this._divineOrderCantripPick
      && !this._search.spell.results.length && !this._search.spell.query) {
      void this._runSearch('spell');
    }
    if (stepId === 'choices' && this._multiclassClassPick?.data?.classIdentifier === 'druid'
      && this._primalOrderChoice === 'magician' && !this._primalOrderCantripPick
      && !this._search.spell.results.length && !this._search.spell.query) {
      void this._runSearch('spell');
    }
    if (stepId === 'class' && this._addingNewClass && !this._search.class.results.length) {
      void this._runSearch('class');
    } else if (stepId === 'asi' && this._asiMode === 'feat' && !this._featPick && !this._search.feat.results.length && !this._search.feat.query) {
      void this._runSearch('feat');
    } else if (stepId === 'subclass' && !this._subclassPick && !this._search.subclass.results.length && !this._search.subclass.query) {
      void this._runSearch('subclass');
    } else if (stepId === 'spells' && !this._search.spell.results.length && !this._search.spell.query) {
      void this._runSearch('spell');
    }
  }

  /** `entryType` é o mesmo nome do `kind` aqui (feat/subclass/spell).
   * `includeData: true` é necessário pro subclass (filtrado por
   * `classIdentifier`) e spell (filtrado por `classes[]`/`spellLevel`). */
  async _searchEntries(entryType, query) {
    return searchCompendiumEntries(entryType, query, true);
  }

  async _runSearch(kind) {
    const queryAtRequest = this._search[kind].query;
    let results = await this._searchEntries(kind, queryAtRequest);

    const classIdentifier = this._currentClassIdentifier();
    if (kind === 'class') {
      const ownedClasses = new Set((this.document?.items || []).filter((item) => item.type === 'class')
        .map((item) => (item.system || item.data || {}).classIdentifier));
      results = results.filter((entry) => MULTICLASS_ENTRY_CLASS_IDS.includes(entry.data?.classIdentifier)
        && !ownedClasses.has(entry.data?.classIdentifier));
    } else if (kind === 'subclass' && classIdentifier) {
      results = results.filter((e) => (e.data?.classIdentifier || '') === classIdentifier);
    } else if (kind === 'spell' && classIdentifier) {
      results = results.filter((e) => Array.isArray(e.data?.classes) && e.data.classes.includes(classIdentifier));
      if (classIdentifier === 'ranger') results = results.filter((entry) => String(entry.name).toLocaleLowerCase() !== "hunter's mark");
      if (['bard', 'sorcerer', 'warlock'].includes(classIdentifier)) {
        const classItem = this._currentClassItem();
        const idata = classItem?.system || classItem?.data || {};
        const nextLevel = (Number(idata.levels) || 1) + 1;
        const ownedArcanumMax = Math.max(0, ...(this.document?.items || []).map((item) => Number((item.system || item.data || {}).mysticArcanumCircle) || 0));
        const maxLevel = Math.max(this._maxSpellLevelAt('full', nextLevel),
          classIdentifier === 'warlock' ? mysticArcanumCircleAtLevel('warlock', nextLevel) : 0,
          classIdentifier === 'warlock' ? ownedArcanumMax : 0);
        results = results.filter((entry) => (Number(entry.data?.spellLevel) || 0) <= maxLevel);
      }
      if (classIdentifier === 'wizard') {
        const classItem = this._currentClassItem();
        const idata = this._multiclassClassPick?.data || classItem?.system || classItem?.data || {};
        const nextLevel = this._multiclassClassPick ? 1 : (Number(idata.levels) || 1) + 1;
        const maxLevel = this._maxSpellLevelAt(idata.casterType || 'full', nextLevel);
        const ownedNames = new Set((this.document?.items || []).filter((item) => item.type === 'spell'
          && ((item.system || item.data || {}).wizardSpellbook === true
            || (item.system || item.data || {}).sourceClassIdentifier === 'wizard'))
          .map((item) => String(item.name).toLocaleLowerCase()));
        results = results.filter((entry) => (Number(entry.data?.spellLevel) || 0) <= maxLevel
          && !ownedNames.has(String(entry.name).toLocaleLowerCase()));
      }
    } else if (kind === 'feat') {
      results = results.map(withFeatMechanics);
      results = results.map(withFeatMechanics);
      if (this._multiclassClassPick?.data?.classIdentifier === 'fighter' && this._lastActiveStepId === 'choices') {
        results = results.filter((entry) => entry.data?.source === 'SRD 5.2 (CC-BY-4.0)'
          && /Category:\s*Fighting Style Feat/i.test(String(entry.data?.description || ''))
          && /Prerequisite:\s*Fighting Style Feature/i.test(String(entry.data?.description || '')));
      } else {
      const classItem = this._currentClassItem();
      const idata = classItem?.system || classItem?.data || {};
      const classLevel = (Number(idata.levels) || 1) + 1;
      const characterLevel = (Number(this.document?.systemData?.details?.level) || 1) + 1;
      const entitlement = progressionAtLevel(classIdentifier, classLevel, { hasSubclass: !!idata.subclassName });
      const existingNames = (this.document?.items || [])
        .filter((item) => item.type === 'feat')
        .map((item) => item.name);
      results = results.filter((entry) => entitlement.epicBoon || entitlement.abilityImprovement
        ? isFeatEligibleForProgression(entry, characterLevel, {
          epicBoon: entitlement.epicBoon,
          existingNames,
        })
        : false);
      }
    }

    // Resposta pode ter chegado depois de uma busca mais nova — mesma guarda
    // anti-race de character-wizard.mjs's _runSearch.
    if (this._search[kind].query !== queryAtRequest) return;
    this._search[kind].results = results;
    await this.render();
  }

  _pickFromResults(kind, entryId) {
    const entry = this._search[kind].results.find((e) => e.id === entryId);
    if (!entry) return;
    if (kind === 'class') {
      this._multiclassClassPick = entry;
      this._addingNewClass = true;
      this._classId = null;
      this._hpRoll = null;
      this._spellPicks = { leveled: [], cantrips: [] };
      this._wizardSpellbookPicks = [];
      this._wizardPreparedPicks = [];
      this._wizardCantripPicks = [];
      this._wizardScholarSkill = '';
      this._bardExpertisePicks = [];
      this._rogueExpertisePicks = [];
      this._rogueLanguagePick = '';
      this._weaponMasteryPicks = [];
      this._fighterStylePick = null;
      this._divineOrderChoice = '';
      this._divineOrderCantripPick = null;
      this._primalOrderChoice = '';
      this._primalOrderCantripPick = null;
      this._warlockInvocationPick = '';
      this._multiclassSkillPicks = [];
      this._multiclassToolPicks = [];
      this._search.class.results = [];
      this._search.spell.query = '';
      this._search.spell.results = [];
      this._step = 0;
      void this.render().then(() => this._preloadStepData());
      return;
    } else if (kind === 'feat') {
      this._featPick = entry;
      this._featName = entry.name;
      this._featChoices = [];
      this._search.feat.results = [];
      this._search.feat.query = entry.name;
    } else if (kind === 'subclass') {
      this._subclassPick = entry;
      this._subclassName = entry.name;
      this._search.subclass.results = [];
      this._search.subclass.query = entry.name;
    }
    void this.render();
  }

  async _clearFeat() {
    this._featPick = null;
    this._featName = '';
    this._search.feat.query = '';
    this._search.feat.results = [];
    await this.render();
    await this._preloadStepData();
  }

  async _clearSubclass() {
    this._subclassPick = null;
    this._subclassName = '';
    this._search.subclass.query = '';
    this._search.subclass.results = [];
    await this.render();
    await this._preloadStepData();
  }

  _toggleSpellPick(entryId) {
    const all = [...this._search.spell.results, ...this._spellPicks.leveled, ...this._spellPicks.cantrips];
    const entry = all.find((e) => e.id === entryId);
    if (!entry) return;
    const bucket = (entry.data?.spellLevel ?? 0) === 0 ? 'cantrips' : 'leveled';
    const list = this._spellPicks[bucket];
    const idx = list.findIndex((e) => e.id === entryId);
    if (idx >= 0) list.splice(idx, 1);
    else {
      const classItem = this._currentClassItem();
      const idata = classItem?.system || classItem?.data || {};
      const classIdentifier = this._currentClassIdentifier();
      const classLevel = Number(idata.levels) || 1;
      const progression = this._multiclassClassPick
        ? classSpellcastingAtLevel(classIdentifier, 1)
        : classSpellcastingLevelUpAtLevel(classIdentifier, classLevel, classLevel + 1);
      if (progression) {
        const max = this._multiclassClassPick
          ? (bucket === 'cantrips' ? progression.cantrips : progression.prepared)
          : (bucket === 'cantrips' ? progression.newCantrips : progression.newPreparedSpells);
        if (list.length >= max) {
          showToast?.(localizeWizard('CompleteSpellChoices'), 'warning');
          return;
        }
      }
      list.push(entry);
    }
    void this.render();
  }

  _toggleWizardSpellPick(kind, entryId) {
    const pools = {
      spellbook: this._wizardSpellbookPicks,
      prepared: this._wizardPreparedPicks,
      cantrips: this._wizardCantripPicks,
    };
    const list = pools[kind];
    if (!list) return;
    const classItem = this._currentClassItem();
    const idata = classItem?.system || classItem?.data || {};
    const classLevel = Number(idata.levels) || 1;
    const progression = this._multiclassClassPick
      ? { currentClassLevel: 0, nextClassLevel: 1, newSpellbookSpells: 6, newCantrips: 3,
        currentPreparedCapacity: 0, nextPreparedCapacity: classSpellcastingAtLevel('wizard', 1).prepared,
        maximumSpellLevel: classSpellcastingAtLevel('wizard', 1).maximumSpellLevel }
      : wizardSpellcastingLevelUpAtLevel(classLevel, classLevel + 1);
    if (!progression) return;
    const existingBook = (this.document?.items || []).filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).wizardSpellbook === true
      && (item.system || item.data || {}).sourceClassIdentifier === 'wizard')
      .map((item) => ({ id: item.id, name: item.name, data: item.system || item.data || {}, actorItem: true }));
    const available = [
      ...this._search.spell.results,
      ...this._wizardSpellbookPicks,
      ...this._wizardCantripPicks,
      ...existingBook,
      ...this._wizardPreparedPicks,
    ];
    const entry = available.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    const spellLevel = Number(entry.data?.spellLevel) || 0;
    if ((kind === 'cantrips' && spellLevel !== 0)
      || (kind === 'spellbook' && (spellLevel < 1 || spellLevel > progression.maximumSpellLevel))
      || (kind === 'prepared' && (spellLevel < 1 || !existingBook.some((spell) => spell.id === entryId)
        && !this._wizardSpellbookPicks.some((spell) => spell.id === entryId)))) return;
    const index = list.findIndex((candidate) => candidate.id === entryId);
    if (index >= 0) {
      list.splice(index, 1);
      if (kind === 'spellbook') this._wizardPreparedPicks = this._wizardPreparedPicks.filter((entry) => entry.id !== entryId);
    } else {
      const maximum = kind === 'spellbook' ? progression.newSpellbookSpells
        : kind === 'cantrips' ? progression.newCantrips : this._wizardPreparedPickLimit;
      if (list.length >= maximum) {
        showToast?.(localizeWizard('CompleteWizardSpellChoices'), 'warning');
        return;
      }
      list.push(entry);
    }
    void this.render();
  }

  async _finish() {
    if (!this.document?.id) return;
    if (this._multiclassClassPick) return this._finishMulticlassWizardEntry();
    let freshActor;
    try {
      freshActor = await api.get(`/actors/${this.document.id}?populate=true`);
    } catch (error) {
      console.error('[srd5e] Level Up could not refresh the actor before committing:', error);
      showToast?.(localizeWizard('ProgressionRefreshFailed'), 'error');
      return;
    }
    const sd = freshActor?.systemData || this.document.systemData;
    const items = freshActor?.items || this.document.items || [];
    const xpEligibility = resolveLevelUpEligibility(sd.details?.xp?.value ?? 0,
      sd.details?.level ?? 1, getSetting('learningMilestones', true));
    if (!xpEligibility.allowed) {
      showToast?.(localizeWizard('InsufficientXP')
        .replace('{max}', xpEligibility.progress.nextThreshold.toLocaleString())
        .replace('{current}', xpEligibility.progress.xp.toLocaleString()), 'warning');
      return;
    }
    const classItem = items.find((i) => i.id === this._classId);
    if (!sd || !classItem) { showToast?.('Pick a class first.', 'warning'); return; }

    const worldId = window.Loom?.world?.id;
    const idata = classItem.system || classItem.data || {};
    const currentClassLevel = Number(idata.levels) || 1;
    const nextClassLevel = currentClassLevel + 1;
    const nextTotalLevel = (Number(sd.details?.level) || 1) + 1;
    if (nextTotalLevel > 20) {
      showToast?.(localizeWizard('CharacterLevelCap'), 'warning');
      return;
    }
    let weaponMasteryProgression = null;
    const masteryIncrease = Math.max(0, weaponMasteryCountAtLevel(idata.classIdentifier, nextClassLevel)
      - weaponMasteryCountAtLevel(idata.classIdentifier, currentClassLevel));
    if (masteryIncrease) {
      const masteryFeature = items.find((item) => item.type === 'feature'
        && (item.system || item.data || {}).classIdentifier === idata.classIdentifier
        && (item.system || item.data || {}).identifier === 'weapon-mastery');
      const masteryData = masteryFeature?.system || masteryFeature?.data || {};
      const saved = masteryData.masteredWeaponIdentifiers;
      const proficiencyTypes = sd.proficiencies?.weapons || [];
      if (!masteryFeature || !Array.isArray(saved)
        || !resolveWeaponMasteryChoices(idata.classIdentifier, saved, proficiencyTypes,
          weaponMasteryCountAtLevel(idata.classIdentifier, currentClassLevel)).valid) {
        showToast?.(localizeWizard('ChooseWeaponMastery'), 'warning');
        return;
      }
      const resolved = resolveWeaponMasteryChoices(idata.classIdentifier, [...saved, ...this._weaponMasteryPicks],
        proficiencyTypes, weaponMasteryCountAtLevel(idata.classIdentifier, nextClassLevel));
      if (!resolved.valid || this._weaponMasteryPicks.length !== masteryIncrease) {
        showToast?.(localizeWizard('ChooseWeaponMastery'), 'warning');
        return;
      }
      weaponMasteryProgression = { featureId: masteryFeature.id, data: masteryData,
        choices: resolved.choices, masteryCount: resolved.required };
    }
    const subclassName = this._subclassPick?.name
      || idata.subclassName
      || items.find((item) => item.type === 'subclass'
        && (item.system || item.data || {}).classIdentifier === idata.classIdentifier)?.name
      || '';
    let resolvedSubclassSpells = { valid: true, grants: [], errors: [] };
    let subclassSpellWrites = [];
    if (subclassAlwaysPreparedSpellNames(idata.classIdentifier, subclassName, nextClassLevel).length) {
      let spellEntries = [];
      try { spellEntries = await searchCompendiumEntries('spell', '', true); }
      catch {
        showToast?.(localizeWizard('SubclassSpellGrantUnavailable'), 'error');
        return;
      }
      resolvedSubclassSpells = resolveSubclassAlwaysPreparedSpells(idata.classIdentifier, subclassName, nextClassLevel, spellEntries);
      if (!resolvedSubclassSpells.valid) {
        showToast?.(localizeWizard('SubclassSpellGrantUnavailable'), 'error');
        return;
      }
      const selectedNames = new Set([...this._spellPicks.leveled, ...this._spellPicks.cantrips]
        .map((entry) => String(entry.name).toLocaleLowerCase()));
      subclassSpellWrites = planSubclassSpellGrantWrites(
        resolvedSubclassSpells.grants.filter((grant) => !selectedNames.has(grant.name.toLocaleLowerCase())), items,
      );
    }
    const wizardProgression = idata.classIdentifier === 'wizard'
      ? wizardSpellcastingLevelUpAtLevel(currentClassLevel, nextClassLevel) : null;
    const bardProgression = ['bard', 'sorcerer', 'warlock'].includes(idata.classIdentifier)
      ? classSpellcastingLevelUpAtLevel(idata.classIdentifier, currentClassLevel, nextClassLevel) : null;
    let bardReplacementItems = null;
    let bardReplacementEntries = null;
    if (bardProgression) {
      const spellData = (item) => item.system || item.data || {};
      const spellClass = idata.classIdentifier;
      const bardPrepared = items.filter((item) => item.type === 'spell' && spellData(item).sourceClassIdentifier === spellClass
        && spellData(item).prepared && Number(spellData(item).spellLevel) > 0);
      const bardCantrips = items.filter((item) => item.type === 'spell' && spellData(item).sourceClassIdentifier === spellClass
        && Number(spellData(item).spellLevel) === 0);
      const bardState = inspectPreparedSpellState(spellClass, currentClassLevel, bardPrepared, bardCantrips, true);
      const replaceSpell = bardPrepared.find((item) => item.id === this._bardReplacement.spellOut);
      const replaceCantrip = bardCantrips.find((item) => item.id === this._bardReplacement.cantripOut);
      const newSpell = this._search.spell.results.find((entry) => entry.id === this._bardReplacement.spellIn);
      const newCantrip = this._search.spell.results.find((entry) => entry.id === this._bardReplacement.cantripIn);
      const collides = (entry, exceptId) => items.some((item) => item.type === 'spell' && item.id !== exceptId
        && String(item.name).localeCompare(entry?.name || '', undefined, { sensitivity: 'base' }) === 0);
      const replacementsValid = !!replaceSpell && !!replaceCantrip
        && newSpell?.data?.classes?.includes(spellClass)
        && Number(newSpell.data?.spellLevel) >= 1 && Number(newSpell.data?.spellLevel) <= bardProgression.maximumSpellLevel
        && newCantrip?.data?.classes?.includes(spellClass) && Number(newCantrip.data?.spellLevel) === 0
        && !collides(newSpell, replaceSpell.id) && !collides(newCantrip, replaceCantrip.id);
      const additions = [...this._spellPicks.leveled, ...this._spellPicks.cantrips];
      const additionsValid = this._spellPicks.leveled.length === bardProgression.newPreparedSpells
        && this._spellPicks.cantrips.length === bardProgression.newCantrips
        && additions.every((entry) => entry.data?.classes?.includes(spellClass)
          && !items.some((item) => item.type === 'spell' && String(item.name).localeCompare(entry.name, undefined, { sensitivity: 'base' }) === 0))
        && new Set([...additions, newSpell, newCantrip].map((entry) => entry?.id).filter(Boolean)).size === additions.length + 2;
      if (!bardState.valid || !replacementsValid || !additionsValid) {
        showToast?.(localizeWizard(spellClass === 'sorcerer' ? 'SorcererSpellbookReview' : 'BardSpellbookReview'), 'warning');
        return;
      }
      bardReplacementItems = { replaceSpell, replaceCantrip };
      bardReplacementEntries = { newSpell, newCantrip };
    }
    if (wizardProgression) {
      const spellData = (item) => item.system || item.data || {};
      const wizardBook = items.filter((item) => item.type === 'spell'
        && spellData(item).wizardSpellbook === true
        && spellData(item).sourceClassIdentifier === 'wizard');
      const wizardCantrips = items.filter((item) => item.type === 'spell'
        && spellData(item).sourceClassIdentifier === 'wizard'
        && Number(spellData(item).spellLevel) === 0);
      const wizardState = inspectWizardSpellbookState(currentClassLevel, wizardBook, wizardCantrips);
      const currentPreparedCount = wizardBook.filter((item) => spellData(item).prepared).length;
      const cantripPicksValid = this._wizardCantripPicks.length === wizardProgression.newCantrips
        && this._wizardCantripPicks.every((entry) => Number(entry.data?.spellLevel) === 0 && entry.data?.classes?.includes('wizard'));
      const bookPicksValid = this._wizardSpellbookPicks.length === wizardProgression.newSpellbookSpells
        && this._wizardSpellbookPicks.every((entry) => Number(entry.data?.spellLevel) >= 1
          && Number(entry.data?.spellLevel) <= wizardProgression.maximumSpellLevel && entry.data?.classes?.includes('wizard'));
      const eligiblePreparedIds = new Set([
        ...wizardBook.filter((item) => !spellData(item).prepared).map((item) => item.id),
        ...this._wizardSpellbookPicks.map((entry) => entry.id),
      ]);
      const preparedPicksValid = this._wizardPreparedPicks.length === wizardProgression.nextPreparedCapacity - currentPreparedCount
        && this._wizardPreparedPicks.every((entry) => eligiblePreparedIds.has(entry.id));
      if (!wizardState.valid
        || !cantripPicksValid || !bookPicksValid || !preparedPicksValid) {
        showToast?.(localizeWizard('WizardSpellbookReview'), 'warning');
        return;
      }
    }
    if (idata.casterType === 'pact' && sd.resources?.pactMagic?.needsReview) {
      showToast?.(localizeWizard('PactMigrationReview'), 'warning');
      return;
    }
    const arcanumCircle = mysticArcanumCircleAtLevel(idata.classIdentifier, nextClassLevel);
    const arcanumItems = items.filter((item) => item.type === 'spell'
      && Number((item.system || item.data || {}).mysticArcanumCircle) >= 6);
    const replacementOut = arcanumItems.find((item) => item.id === this._arcanumReplaceOut);
    const replacementCircle = Number((replacementOut?.system || replacementOut?.data || {}).mysticArcanumCircle) || 0;
    const replacementEntry = this._search.spell.results.find((entry) => entry.id === this._arcanumReplaceIn);
    const newArcanumEntry = this._search.spell.results.find((entry) => entry.id === this._arcanumPick);
    const spellNameCollides = (entry, exceptId = '') => items.some((item) => item.type === 'spell' && item.id !== exceptId
      && String(item.name).localeCompare(entry?.name || '', undefined, { sensitivity: 'base' }) === 0);
    const arcanumReplacementSelected = !!this._arcanumReplaceOut || !!this._arcanumReplaceIn;
    const arcanumValid = (!arcanumCircle || (isValidMysticArcanumSpell(newArcanumEntry?.data, arcanumCircle)
        && !spellNameCollides(newArcanumEntry)))
      && (!arcanumReplacementSelected || (!!replacementOut && !!replacementEntry
        && isValidMysticArcanumSpell(replacementEntry.data, replacementCircle)
        && !spellNameCollides(replacementEntry, replacementOut.id)));
    if (!arcanumValid) {
      showToast?.(localizeWizard('MysticArcanumReview'), 'warning');
      return;
    }
    const preparedSpellProgression = classSpellcastingLevelUpAtLevel(idata.classIdentifier, currentClassLevel, nextClassLevel);
    if (preparedSpellProgression
      && (this._spellPicks.leveled.length !== preparedSpellProgression.newPreparedSpells
        || this._spellPicks.cantrips.length !== preparedSpellProgression.newCantrips)) {
      showToast?.(localizeWizard('CompleteSpellChoices'), 'warning');
      return;
    }
    const entitlement = buildProgressionPlan(idata.classIdentifier, currentClassLevel, nextClassLevel, {
      hasSubclass: !!idata.subclassName,
    }).levels.at(-1) || progressionAtLevel(idata.classIdentifier, nextClassLevel, { hasSubclass: !!idata.subclassName });
    if (entitlement.subclass && !this._subclassPick) {
      showToast?.(localizeWizard('ChooseSubclassRequired'), 'warning');
      return;
    }
    if ((entitlement.abilityImprovement || entitlement.epicBoon)
      && (this._asiMode === 'feat' ? !this._featPick : !this._asiPicks.first)) {
      showToast?.(localizeWizard('CompleteAbilityChoice'), 'warning');
      return;
    }
    const scholarFeature = items.find((item) => item.type === 'feature'
      && (item.system || item.data || {}).classIdentifier === 'wizard'
      && Number((item.system || item.data || {}).levelGained) === 2
      && ((item.system || item.data || {}).identifier === 'scholar' || item.name === 'Scholar'));
    const wizardScholarRequired = idata.classIdentifier === 'wizard' && nextClassLevel === 2;
    const scholarChoice = wizardScholarRequired
      ? resolveWizardScholarChoice(sd.skills || {}, this._wizardScholarSkill,
        (scholarFeature?.system || scholarFeature?.data || {}).expertiseSkill || '')
      : { valid: true };
    if (!scholarChoice.valid) {
      showToast?.(localizeWizard('ChooseWizardScholarSkill'), 'warning');
      return;
    }
    const bardExpertiseRequired = idata.classIdentifier === 'bard' && [2, 9].includes(nextClassLevel);
    const bardExpertiseChoice = bardExpertiseRequired
      ? resolveExpertiseChoices(sd.skills || {}, this._bardExpertisePicks, 2)
      : { valid: true, selected: [] };
    if (!bardExpertiseChoice.valid) {
      showToast?.(localizeWizard('ChooseBardExpertiseSkills'), 'warning');
      return;
    }
    const abilityBumps = {};
    const featMechanics = getFeatMechanics(this._featPick?.data);
    const featSupport = featMechanicsSupport(this._featPick?.data);
    const featAbilityEffect = featSupport.valid && featMechanics?.support === 'automatic'
      ? featMechanics.effects.find((effect) => effect.type === 'ability-score-increase') : null;
    const proficiencyEffect = featMechanics?.effects?.find((effect) => effect.type === 'proficiency');
    const featProficiencyGrants = proficiencyEffect ? resolveFeatMechanicChoices(this._featPick?.data, this._featChoices, {
      skills: sd.skills || {}, tools: sd.proficiencies?.tools || [],
    }) : { valid: true, missing: false, skills: [], tools: [], errors: [] };
    if (!featProficiencyGrants.valid) {
      showToast?.(localizeWizard(featProficiencyGrants.errors.includes('proficiency-already-owned') ? 'FeatChoiceAlreadyOwned' : 'CompleteFeatChoices'), 'warning');
      return;
    }
    if (entitlement.abilityImprovement && this._asiMode === 'feat' && featAbilityEffect) {
      const increase = resolveAbilityScoreIncrease(sd.abilities, this._featAbilityPicks, featAbilityEffect.parameters);
      if (increase.missing || increase.errors.length) {
        showToast?.(increase.errors.some((error) => error.code === 'ability-score-cap') ? localizeWizard('AbilityScoreCap') : localizeWizard('CompleteFeatAbilityChoice'), 'warning');
        return;
      }
      Object.assign(abilityBumps, increase.bumps);
    }
    if (entitlement.abilityImprovement && this._asiMode === 'scores') {
      const first = this._asiPicks.first;
      const second = this._asiPicks.second;
      if (second && second === first) {
        showToast?.(localizeWizard('DistinctAbilityChoices'), 'warning');
        return;
      }
      const firstValue = Number(sd.abilities?.[first]?.value) || 10;
      const secondValue = second ? (Number(sd.abilities?.[second]?.value) || 10) : 0;
      if ((!second && firstValue > 18) || (second && (firstValue > 19 || secondValue > 19))) {
        showToast?.(localizeWizard('AbilityScoreCap'), 'warning');
        return;
      }
      abilityBumps[first] = second ? 1 : 2;
      if (second) abilityBumps[second] = 1;
    }
    // Prepara o dado da classe em memória. O nível só é persistido depois das
    // concessões que podem falhar, para um retry continuar processando a mesma
    // faixa de features.
    const updatedClassData = { ...idata, levels: nextClassLevel };
    if (this._subclassPick) updatedClassData.subclassName = this._subclassPick.name;

    // 2) HP: soma no máximo E no atual (diferente de cura de descanso curto,
    // que só reabastece até o máximo velho — aqui o máximo sobe de verdade).
    const die = idata.hitDie || 'd8';
    const dieMax = Number(die.replace(/\D/g, '')) || 8;
    const conMod = sd.abilities?.con?.modifier ?? 0;
    const abilityScoresAfterChoices = Object.fromEntries(ABILITY_KEYS.map((key) => [key,
      Math.min(20, Number(sd.abilities?.[key]?.value) || 10) + (abilityBumps[key] || 0)]));
    const nextAbilityScores = applyPrimalChampion(abilityScoresAfterChoices, idata.classIdentifier, nextClassLevel);
    const nextConScore = nextAbilityScores.con;
    const nextConMod = Math.floor((nextConScore - 10) / 2);
    const hpSetting = getSetting('levelUpHpMode', 'player');
    const useRoll = hpSetting === 'roll' || (hpSetting === 'player' && this._hpMode === 'roll');
    const hpRoll = this._hpRoll ?? (1 + Math.floor(Math.random() * dieMax));
    const hpGain = Math.max(1, (useRoll ? hpRoll : Math.ceil((dieMax + 1) / 2)) + nextConMod)
      + ((nextConMod - conMod) * (Number(sd.details?.level) || 1));
    const hp = sd.resources?.health || { value: 10, max: 10, bonus: 0, temp: 0 };
    const hd = sd.resources?.hitDice || { value: 1, max: 1, die };

    const patch = {
      'system.details.level': (Number(sd.details?.level) || 1) + 1,
      'system.resources.health.max': hp.max + hpGain,
      'system.resources.health.value': hp.value + hpGain,
      'system.resources.hitDice.max': hd.max + 1,
      'system.resources.hitDice.value': hd.value + 1,
    };
    let featToGrant = null;
    if (wizardScholarRequired) patch[`system.skills.${scholarChoice.skill}.multiplier`] = 2;
    for (const skill of bardExpertiseChoice.selected) patch[`system.skills.${skill}.multiplier`] = 2;
    for (const skill of featProficiencyGrants.skills) patch[`system.skills.${skill}.proficient`] = true;
    if (featProficiencyGrants.tools.length) {
      patch['system.proficiencies.tools'] = [...new Set([...(sd.proficiencies?.tools || []), ...featProficiencyGrants.tools])];
    }
    const hitDicePools = { ...(hd.pools || {}) };
    const classPool = hitDicePools[idata.classIdentifier] || { value: 0, max: 0, die: idata.hitDie || die, needsReview: false };
    hitDicePools[idata.classIdentifier] = { ...classPool, value: classPool.value + 1, max: classPool.max + 1 };
    patch['system.resources.hitDice.pools'] = hitDicePools;
    if (idata.casterType === 'pact') {
      const priorPact = sd.resources?.pactMagic || { value: 0, max: 0 };
      const nextPact = pactMagicAtLevel(nextClassLevel);
      const gainedPoolCapacity = Math.max(0, nextPact.max - (Number(priorPact.max) || 0));
      patch['system.resources.pactMagic.max'] = nextPact.max;
      patch['system.resources.pactMagic.spellLevel'] = nextPact.spellLevel;
      patch['system.resources.pactMagic.value'] = Math.min(nextPact.max, (Number(priorPact.value) || 0) + gainedPoolCapacity);
      patch['system.resources.pactMagic.needsReview'] = false;
    }

    // 3) ASI (só se este step apareceu — checa de novo aqui, não confia só
    // no _asiMode do estado, caso o nível não bata mais o filtro de fora).
    if (entitlement.abilityImprovement || entitlement.epicBoon) {
      if (this._asiMode === 'scores' || Object.keys(abilityBumps).length) {
        for (const [key, amount] of Object.entries(abilityBumps)) {
          patch[`system.abilities.${key}.value`] = Number(sd.abilities?.[key]?.value || 10) + amount;
        }
      } else if (this._asiMode === 'feat') {
        if (this._featPick) {
          const alreadyOwned = items.some((item) => item.type === 'feat'
            && String(item.name).localeCompare(this._featPick.name, undefined, { sensitivity: 'base' }) === 0);
          if (!alreadyOwned) featToGrant = this._featPick;
        }
      }
    }
    if (idata.classIdentifier === 'barbarian' && nextClassLevel >= 20) {
      for (const key of ['str', 'con']) patch[`system.abilities.${key}.value`] = nextAbilityScores[key];
    }

    if (wizardProgression) {
      try {
        await this._commitWizardAdvancementRecoverably({
          worldId,
          actorId: this.document.id,
          classItem,
          currentClassLevel,
          currentSystemData: sd,
          classData: updatedClassData,
          actorPatch: patch,
          featToGrant,
          existingItems: items,
          subclassSpellWrites,
        });
      } catch (error) {
        console.error('[srd5e] Recoverable Wizard level-up failed:', error);
        showToast?.(localizeWizard('ProgressionCommitFailed'), 'error');
      }
      return;
    }

    try {
      await this._commitClassAdvancementRecoverably({
        worldId, actorId: this.document.id, classItem, currentClassLevel,
        currentSystemData: sd, currentItems: items, classData: updatedClassData,
        actorPatch: patch, featToGrant, subclassSpellWrites, resolvedSubclassSpells,
        nextAbilityScores, bardExpertiseChoice, replacementOut, replacementEntry,
        replacementCircle, newArcanumEntry, arcanumCircle, bardProgression,
        bardReplacementItems, bardReplacementEntries, weaponMasteryProgression,
      });
    } catch (error) {
      console.error('[srd5e] Recoverable class level-up failed:', error);
      showToast?.(localizeWizard('ProgressionCommitFailed'), 'error');
    }
  }
}
