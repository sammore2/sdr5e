// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/npc-sheet.mjs
// Component Version: 0.1.0
//
// Native NPC/monster sheet. Before this, NPCs fell back to the generic
// engine sheet (Abilities/Resources/Details/Items/Efeitos tabs, bare inputs,
// no styling) while characters had the full custom dnd5e-styled sheet — a
// real, visible half-finished spot. Real dnd5e's NPC/monster stat block is a
// single continuous page (no side tabs), which is what this mirrors: header
// (portrait/AC/HP/speed), ability row, saves+skills+senses+traits, an
// Actions list (reuses the 'feature' item type), Biography at the bottom.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager } from '/_loom/sdk/index.js';
import {
  ABILITY_KEYS, ABILITY_LABELS, SKILL_LABELS, SKILL_ABILITIES,
  ITEM_TYPE_ICON, ITEM_TYPE_SINGULAR, DAMAGE_TYPES, DAMAGE_TYPE_LABELS,
  CONDITIONS, SENSE_TYPES, SENSE_LABELS
} from './config.mjs';
import { fmtMod, setPathValue, currentAdvantageMode, passiveScore } from './utils.mjs';
import { initiativeBaseSources } from './initiative-mechanics.mjs';
import { sdr5eRoll, rollDeathSave, applyHeal, applyDamage, getActorConditions, applyAbilityCheckConditionModifiers, applyPoisonedDisadvantage, getSaveConditionOutcome, getSaveCoverBonus, getSkillConditionOutcome, evaluateDamageFormula, postItemToChat, rollWeaponAttack, rollWeaponDamage } from './roll-engine.mjs';
import { getDefaultData } from './schema.mjs';
import { takeRest } from './rest.mjs';
import { Sdr5eItemSheet } from './item-sheet.mjs';
import { coreActionActivityView, coreActionContextMetadata, normalizeCoreActionContext, resolveCoreActionSkillCheck } from './core-action-checks.mjs';
import { appendHelpRecord, createHelpRecord, helpActionView, normalizeHelpRecords, removeHelpRecord } from './help-action-mechanics.mjs';
import { appendReadyRecord, createReadyRecord, normalizeReadyRecords, readyActionView, removeReadyRecord } from './ready-action-mechanics.mjs';
import { clearDodgeRecord, dodgeActionView, setDodgeRecord } from './dodge-mechanics.mjs';
import { composeInfluenceAdvantage, influenceFormView, resolveInfluenceAdjudication } from './influence-mechanics.mjs';
import { addDashMovementBonus, addMovementSegment, movementLedgerView, normalizeMovementLedger, removeDashMovementBonus, removeMovementSegment, resetMovementLedger } from './movement-mechanics.mjs';
import { attachTooltips, detachTooltips } from './tooltip.mjs';
import { resolveMovementSheetContext } from './movement-sheet-context.mjs';
import { npcDeathSaveView } from './monster-death-mechanics.mjs';
import { rageStrengthAdvantage } from './rage-mechanics.mjs';
import { attachSideTabs, detachSideTabs } from './side-tabs.mjs';
import { getEffectsSheetData, toggleActorCondition, clearAllActorConditions, applyBuffPresetToActor, deleteActiveEffect, toggleEffectDisabled, promptCreateCustomEffect } from './active-effects-helper.mjs';

const localizeSheet = (key) => window.Loom?.i18n?.localize?.(key) || key;

const SDR5E_HEADER_BANNER = '/marketplace/rulesets/srd5e/assets/images/banner-character.png';

export class Sdr5eNpcSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 780, height: 740 } };

  _activeTab = 'actions';

  constructor(props) {
    super({
      ...props,
      id: props.id || `actor-sheet-${props.actorId}`,
      documentId: props.actorId,
      title: (props.title && props.title !== 'undefined') ? props.title : 'SDR5E',
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['sdrn-sheet', 'sdrn-npc-sheet'],
      bannerImage: SDR5E_HEADER_BANNER,
    });
  }

  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/npc-sheet.hbs' } };

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : 'SDR5E';
  }

  get documentName() { return 'actor'; }
  get apiRoute() { return '/actors'; }
  get dataKey() { return 'systemData'; }

  async mount() {
    await super.mount();
    this._applyActiveTab();
    this._detachSideTabs();
    this._applyEditMode();
    attachTooltips(this.element);
    this._attachListeners();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveTab();
    this._detachSideTabs();
    this._applyEditMode();
    attachTooltips(this.element);
    this._attachListeners();
  }

  /**
   * Same approach as the character sheet: the tab dock is moved out of the
   * window and kept on the window's right edge, so the game canvas cannot
   * cover it. Its clicks no longer reach the window, so they are handled here.
   */
  _detachSideTabs() {
    attachSideTabs(this, (event) => {
      const tabButton = event.target instanceof Element ? event.target.closest('[data-action="tab"]') : null;
      if (!tabButton) return;
      event.preventDefault();
      this._activeTab = tabButton.dataset.tab || 'actions';
      this._applyActiveTab();
    });
  }

  _cleanupSideTabs() {
    detachSideTabs(this);
  }

  // The tab dock lives outside the window, so it has to leave with it.
  onClose() {
    this._cleanupSideTabs();
    detachTooltips(this.element);
  }

  _applyActiveTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeTab || 'actions';
    (this._sideTabsEl || root).querySelectorAll('.sdrn-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    root.querySelectorAll('[data-tab-content]').forEach((panel) => {
      panel.style.display = panel.dataset.tabContent === tab ? '' : 'none';
    });
  }

  _hasListeners = false;
  _attachListeners() {
    this._attachDropListener();
    if (!this.element || this._hasListeners) return;
    this._hasListeners = true;
    this.element.addEventListener('click', (event) => {
      const tabButton = event.target instanceof Element
        ? event.target.closest('.sdrn-side-tabs [data-action="tab"]')
        : null;
      if (!tabButton) return;
      event.preventDefault();
      this._activeTab = tabButton.dataset.tab || 'actions';
      this._applyActiveTab();
    });
    this.element.addEventListener('change', (e) => {
      const movementSelect = e.target?.closest?.('[data-movement-cast-select]');
      if (movementSelect) {
        this._movementCastId = movementSelect.value || '';
        void this._reloadDocument();
        return;
      }
      const select = e.target?.closest?.('select.sdrn-npc-quick-select[data-action]');
      if (!select) return;
      const action = select.dataset.action;
      const val = select.value;
      if (action && val) {
        select.value = '';
        void this._onSelectAction(action, val, select);
      }
    });
  }

  _hasDropListener = false;
  _attachDropListener() {
    if (!this.element || this._hasDropListener) return;
    this._hasDropListener = true;
    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.element.addEventListener('drop', (e) => void this._onDropItem(e));
  }

  async _onDropItem(event) {
    event.preventDefault();
    if (!this.document) return;
    let data;
    try {
      const raw = event.dataTransfer?.getData('application/json') || event.dataTransfer?.getData('text/plain');
      if (raw) data = JSON.parse(raw);
    } catch {}
    if (!data) return;
    const itemId = data.id || data.itemId;
    if (!itemId && !data.data) return;
    try {
      let source = data.data;
      if (!source && itemId) {
        source = await api.get(`/items/${itemId}`);
      }
      if (!source) return;

      const itemType = source.type || 'item';
      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: source.name,
        type: itemType,
        imgUrl: source.imgUrl || source.img || '',
        data: source.system || source.data || getDefaultData(itemType),
        actorId: this.document.id,
      });

      if (itemType === 'language') {
        const sd = this.document.systemData || {};
        const details = sd.details || {};
        const langs = details.languages?.value || [];
        if (!langs.includes(source.name)) {
          await api.put(`${this.apiRoute}/${this.document.id}`, {
            systemData: {
              ...sd,
              details: {
                ...details,
                languages: { ...(details.languages || {}), value: [...langs, source.name] },
              },
            },
          });
        }
      }

      await this._reloadDocument();
    } catch (err) {
      console.error('Failed to drop item onto NPC:', err);
    }
  }

  _formSaveTimer;
  // See the note in item-sheet.mjs's _pendingFields — a single shared timer
  // only remembered the last field touched within the debounce window and
  // silently dropped the rest.
  _pendingFields = new Map();

  _onChangeForm(event) {
    const target = event.target;
    if (!target || !target.name) return;
    if (target.name !== 'name' && !target.name.startsWith('sd:')) return;
    const value = target.type === 'checkbox' ? target.checked
      : target.type === 'number' ? Number(target.value)
      : target.value;
    this._pendingFields.set(target.name, value);
    clearTimeout(this._formSaveTimer);
    this._formSaveTimer = setTimeout(() => void this._flushPendingFields(), 300);
  }

  async _flushPendingFields() {
    if (!this.document || this._pendingFields.size === 0) return;
    const pending = this._pendingFields;
    this._pendingFields = new Map();

    const sd = this.document.systemData || {};
    let name;
    for (const [key, value] of pending) {
      if (key === 'name') name = value;
      else setPathValue(sd, key.slice(3), value);
    }
    if (sd.resources?.health) {
      if (!sd.attributes) sd.attributes = {};
      sd.attributes.hp = {
        value: Number(sd.resources.health.value) || 0,
        max: Number(sd.resources.health.max) || 0,
        temp: Number(sd.resources.health.temp) || 0,
      };
    }
    const submitData = { systemData: sd };
    if (name !== undefined) submitData.name = name;

    await api.put(`${this.apiRoute}/${this.document.id}`, submitData);
    await this._reloadDocument();
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const sd = this.document?.systemData || {};
    const abilities = sd.abilities || {};
    const saves = sd.saves || {};
    const skills = sd.skills || {};
    const attrs = sd.attributes || {};
    const res = sd.resources || {};
    const details = sd.details || {};
    const conditions = await getActorConditions(this.document?.id);
    const effectsData = await getEffectsSheetData(this.document);
    this._movementContext = await resolveMovementSheetContext({ actorId: this.document?.id, combat: window.Loom?.combat, api,
      selectedCastId: this._movementCastId, actorLedger: sd.srd5eMovementLedger,
      actorSpeeds: attrs.movement?.effective || attrs.movement || {}, conditions, localize: localizeSheet });
    if (this._movementContext.castId) this._movementCastId = this._movementContext.castId;
    const deathSaveView = npcDeathSaveView({
      healthValue: res.health?.value,
      useCharacterDeathSaves: details.useCharacterDeathSaves === true,
      deathState: res.deathState,
      deathSaves: res.deathSaves,
    });

    const _abilities = ABILITY_KEYS.map((k) => ({
      key: k, abbr: k.toUpperCase(), label: ABILITY_LABELS[k],
      score: abilities[k]?.value ?? 10, mod: fmtMod(abilities[k]?.modifier ?? 0),
      saveTotal: fmtMod(saves[k]?.total ?? abilities[k]?.modifier ?? 0),
      saveProficient: !!saves[k]?.proficient,
    }));

    // Real monster stat blocks only list saves the creature is actually
    // proficient in — a flat row of all 6 (mostly +0) is just noise.
    const _saves = ABILITY_KEYS
      .map((k) => ({ key: k, label: ABILITY_LABELS[k].slice(0, 3).toUpperCase(), total: fmtMod(saves[k]?.total ?? 0), proficient: !!saves[k]?.proficient }))
      .filter((s) => s.proficient);

    const _availableSaves = ABILITY_KEYS
      .filter((k) => !saves[k]?.proficient)
      .map((k) => ({ key: k, label: ABILITY_LABELS[k] }));

    const _skills = Object.keys(SKILL_LABELS)
      .map((k) => ({ key: k, label: SKILL_LABELS[k], total: fmtMod(skills[k]?.total ?? 0), proficient: !!skills[k]?.proficient }))
      .filter((s) => s.proficient)
      .sort((a, b) => a.label.localeCompare(b.label));

    const _availableSkills = Object.keys(SKILL_LABELS)
      .filter((k) => !skills[k]?.proficient)
      .map((k) => ({ key: k, label: SKILL_LABELS[k] }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // SRD: todo stat block de monstro lista "passive Perception N" nos
    // sentidos, com ou sem proficiência na perícia (Handout 34).
    // SRD Passive score: +/-5 only from persistent Advantage/Disadvantage (conditions such as Poisoned), never Shift/Ctrl.
    const _passivePerception = passiveScore(skills.perception?.total, applyAbilityCheckConditionModifiers(0, conditions));
    // Portrait choice per actor: 'art' shows the actor picture, 'token' shows the prototype token image when one is set.
    const portraitCfg = sd.portrait || {};
    const _portraitSource = portraitCfg.source === 'token' ? 'token' : 'art';
    const _portraitUrl = (_portraitSource === 'token' ? portraitCfg.tokenImg : '') || this.document?.avatarUrl || this.document?.img || '';
    const _headerImg = portraitCfg.headerImg || '';
    // Passive Investigation and Insight use the same rule as Passive Perception.
    const _passiveInvestigation = passiveScore(skills.investigation?.total, applyAbilityCheckConditionModifiers(0, conditions));
    const _passiveInsight = passiveScore(skills.insight?.total, applyAbilityCheckConditionModifiers(0, conditions));
    // Proficiency groups with the origin of each entry; an entry without a recorded origin reads as Manual.
    const profOrigins = sd.proficiencyOrigins || {};
    const profList = (key) => (sd.proficiencies?.[key] || []).map((v) => ({ name: String(v), origin: (profOrigins[key + ':' + v] || ['Manual']).join(', ') }));
    const _profGroups = [
      { label: 'Armaduras', entries: profList('armor') },
      { label: 'Armas', entries: profList('weapons') },
      { label: 'Ferramentas', entries: profList('tools') },
    ].filter((group) => group.entries.length);

    const items = this.document?.items || [];
    const _featuresList = [];
    const _attacksList = [];
    const _spellsList = [];
    const _inventoryList = [];
    const _gearChips = [];

    const _actions = items.filter((i) => i.type !== 'language').map((i) => {
      const idata = i.system || i.data || {};
      const formula = idata.damage?.formula || '';
      const uses = idata.uses?.max ? `${idata.uses.value ?? 0}/${idata.uses.max}` : '—';
      const attackBonus = (idata.attackBonus !== undefined && idata.attackBonus !== null && idata.attackBonus !== '')
        ? fmtMod(idata.attackBonus)
        : (i.type === 'weapon' ? fmtMod((attrs.prof?.value ?? 2) + (sd.abilities?.str?.modifier ?? 0)) : '—');
      const enriched = {
        ...i,
        imgUrl: i.imgUrl || i.img || i.avatarUrl || '',
        icon: ITEM_TYPE_ICON[i.type] || '⭐',
        isWeapon: i.type === 'weapon',
        isSpell: i.type === 'spell',
        isFeature: i.type === 'feature',
        hasDamage: !!formula,
        usesText: uses,
        rollText: attackBonus,
        formulaText: formula || '—',
        subtitle: idata.actionType || (i.type === 'weapon' ? 'Ação' : (i.type || 'Característica')),
      };

      if (i.type === 'weapon') {
        _attacksList.push(enriched);
        _gearChips.push(i.name);
      } else if (i.type === 'spell') {
        _spellsList.push(enriched);
      } else if (['armor', 'consumable', 'tool', 'loot', 'container'].includes(i.type)) {
        _inventoryList.push(enriched);
        if (i.type === 'armor' && idata.equipped) _gearChips.push(i.name);
      } else {
        _featuresList.push(enriched);
      }

      return enriched;
    });

    const langItems = items.filter((i) => i.type === 'language').map((i) => ({ id: i.id, name: i.name }));
    const langValues = (details.languages?.value || []).map((v) => ({ name: v }));
    const seenLangs = new Set();
    const _languages = [];
    for (const l of [...langItems, ...langValues]) {
      const lower = l.name.toLowerCase();
      if (!seenLangs.has(lower)) {
        seenLangs.add(lower);
        _languages.push(l);
      }
    }

    const healthMax = res.health?.max ?? 10;
    const healthPct = healthMax > 0 ? Math.max(0, Math.min(100, Math.round(((res.health?.value ?? 0) / healthMax) * 100))) : 0;

    const _traits = details.traits || { di: [], dr: [], dv: [], ci: [] };
    const _hasTraits = ((_traits.dr?.length || 0) + (_traits.di?.length || 0) + (_traits.ci?.length || 0) + (_traits.dv?.length || 0)) > 0;

    const _traitItems = [];
    for (const v of (_traits.dv || [])) {
      _traitItems.push({ type: 'dv', typeLabel: 'Vulnerability', cssClass: 'vulnerability', value: v, label: DAMAGE_TYPE_LABELS[v] || v });
    }
    for (const r of (_traits.dr || [])) {
      _traitItems.push({ type: 'dr', typeLabel: 'Resistance', cssClass: 'resistance', value: r, label: DAMAGE_TYPE_LABELS[r] || r });
    }
    for (const i of (_traits.di || [])) {
      _traitItems.push({ type: 'di', typeLabel: 'Immunity', cssClass: 'immunity', value: i, label: DAMAGE_TYPE_LABELS[i] || i });
    }
    for (const c of (_traits.ci || [])) {
      const cond = CONDITIONS.find((cd) => cd.id === c);
      _traitItems.push({ type: 'ci', typeLabel: 'Condition Immunity', cssClass: 'condition', value: c, label: cond ? cond.label : (c.charAt(0).toUpperCase() + c.slice(1)) });
    }

    const _traitOptions = [
      ...DAMAGE_TYPES.filter((t) => !(_traits.dr || []).includes(t)).map((t) => ({ value: `dr:${t}`, label: `Resistance: ${DAMAGE_TYPE_LABELS[t]}` })),
      ...DAMAGE_TYPES.filter((t) => !(_traits.di || []).includes(t)).map((t) => ({ value: `di:${t}`, label: `Immunity: ${DAMAGE_TYPE_LABELS[t]}` })),
      ...DAMAGE_TYPES.filter((t) => !(_traits.dv || []).includes(t)).map((t) => ({ value: `dv:${t}`, label: `Vulnerability: ${DAMAGE_TYPE_LABELS[t]}` })),
      ...CONDITIONS.filter((c) => !(_traits.ci || []).includes(c.id)).map((c) => ({ value: `ci:${c.id}`, label: `Cond. Immunity: ${c.label}` })),
    ];

    const COMMON_SENSES = [
      'Darkvision 18 m', 'Darkvision 36 m', 'Blindsight 9 m', 'Blindsight 18 m', 'Tremorsense 9 m', 'Tremorsense 18 m', 'Truesight 18 m', 'Truesight 36 m',
    ];
    const currentSensesList = [
      ...((() => { const se = attrs.senses || {}; const eff = se.effective || se; const l=[]; for(const s of ['darkvision','blindsight','tremorsense','truesight']) if(eff[s]>0) l.push(`${s.charAt(0).toUpperCase()+s.slice(1)} ${eff[s]} m`); return l; })()),
      ...(details.senses?.value || [])
    ];
    const _availableSensesList = COMMON_SENSES.filter((s) => !currentSensesList.includes(s));

    const COMMON_LANGUAGES = [
      'Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
      'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon', 'Telepathy 36 m'
    ];
    const _availableLanguagesList = COMMON_LANGUAGES.filter((lang) => !_languages.some((l) => l.name.toLowerCase() === lang.toLowerCase()));

    const SIZES = [
      { value: 'tiny', label: 'Tiny' },
      { value: 'sm', label: 'Small' },
      { value: 'med', label: 'Medium' },
      { value: 'lg', label: 'Large' },
      { value: 'huge', label: 'Huge' },
      { value: 'grg', label: 'Gargantuan' },
    ];
    const _size = details.size || 'med';
    const _sizeOptions = SIZES.map((s) => ({
      ...s,
      selected: s.value === _size,
    }));

    return {
      ...context,
      ...this.document,
      avatarUrl: this.document?.avatarUrl || this.document?.img || '',
      _portraitUrl,
      _portraitSource,
      _headerImg,
      _passiveInvestigation,
      _passiveInsight,
      _profGroups,
      _portraitSourceIsArt: _portraitSource === 'art',
      _portraitSourceIsToken: _portraitSource === 'token',
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      systemData: sd,
      _abilities,
      _npcTabActions: localizeSheet('srd5e.NPC.Actions'),
      _npcTabSpells: localizeSheet('srd5e.NPC.Spells') || 'Magias',
      _npcTabInventory: localizeSheet('srd5e.NPC.Inventory') || 'Inventário',
      _npcTabDetails: localizeSheet('srd5e.NPC.Biography'),
      _npcTabConfig: localizeSheet('srd5e.NPC.Configuration'),
      _saves,
      _availableSaves,
      _skills,
      _availableSkills,
      _actions,
      _featuresList,
      _attacksList,
      _spellsList,
      _inventoryList,
      _gearChips,
      _coreActionActivities: coreActionActivityView(sd.skills, localizeSheet),
      _coreActionActivitiesTitle: localizeSheet('SDR5E.CoreActions.Title'),
      _coreActionActivitiesNote: localizeSheet('SDR5E.CoreActions.Note'),
      _coreActionRollLabel: localizeSheet('SDR5E.CoreActions.RollCheck'),
      _movementLedger: this._movementContext.view,
      _movementCastChoices: this._movementContext.choices,
      _movementCastId: this._movementContext.castId,
      _movementNeedsCastSelection: this._movementContext.requiresSelection,
      _movementCastUnavailable: this._movementContext.inCombat && !this._movementContext.castId && !this._movementContext.choices.length,
      _movementInCombat: this._movementContext.inCombat,
      _movementSlowPenalty: this._movementContext.penaltyFeet || 0,
      _helpAction: helpActionView(sd, sd.srd5eHelpRecords, localizeSheet),
      _readyAction: readyActionView(attrs.movement?.effective?.walk ?? attrs.movement?.walk, sd.srd5eReadyRecords, localizeSheet),
      _dodgeAction: dodgeActionView(sd.srd5eDodgeRecord, localizeSheet),
      _influence: influenceFormView(sd, localizeSheet),
      _prof: fmtMod(attrs.prof?.value ?? 2),
      _profValue: attrs.prof?.value ?? 2,
      _ac: attrs.da?.value ?? 10,
      _acBase: attrs.da?.base ?? 10,
      _initiative: fmtMod(attrs.initiative?.total ?? 0),
      _speed: `${attrs.movement?.effective?.walk ?? attrs.movement?.walk ?? 9} m`,
      _movement: (() => {
        const mv = attrs.movement || { walk: 9, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false };
        const eff = mv.effective || mv;
        return {
          walk: eff.walk ?? 9, fly: eff.fly ?? 0, swim: eff.swim ?? 0, climb: eff.climb ?? 0, burrow: eff.burrow ?? 0, hover: !!eff.hover,
          walkLabel: `${eff.walk ?? 9} m`, walkTitle: eff.walk !== mv.walk ? `Base ${mv.walk} m` : '',
        };
      })(),
      _movementInputs: {
        walk: attrs.movement?.walk ?? 9, fly: attrs.movement?.fly ?? 0, swim: attrs.movement?.swim ?? 0, climb: attrs.movement?.climb ?? 0, burrow: attrs.movement?.burrow ?? 0, hover: !!attrs.movement?.hover,
      },
      _health: { value: res.health?.value ?? 0, max: healthMax, pct: healthPct, temp: res.health?.temp ?? 0 },
      _deathSaves: deathSaveView,
      _showDeathSaves: deathSaveView.visible,
      _canRollDeathSave: deathSaveView.canRoll,
      _deathSaveLabel: localizeSheet('srd5e.NPC.DeathSaves'),
      _rollDeathSaveLabel: localizeSheet('srd5e.NPC.RollDeathSave'),
      _deathStateLabel: localizeSheet(`srd5e.NPC.${deathSaveView.state === 'dead' ? 'Dead' : 'Stable'}`),
      _useCharacterDeathSaves: details.useCharacterDeathSaves === true,
      _deathSaveOverrideLabel: localizeSheet('srd5e.NPC.UseCharacterDeathSaves'),
      _deathSaveOverrideHint: localizeSheet('srd5e.NPC.UseCharacterDeathSavesHint'),
      ...effectsData,
      _hpFormula: attrs.hp?.formula || '',
      _cr: details.cr ?? 0,
      _xpLabel: `${(() => {
        const crToXp = { '0': 10, '1/8': 25, '0.125': 25, '1/4': 50, '0.25': 50, '1/2': 100, '0.5': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000 };
        const stored = details.xp?.value;
        return (stored !== undefined && stored !== null && stored !== '') ? Number(stored) : (crToXp[String(details.cr ?? 0)] ?? 0);
      })()} XP`,
      _xpValue: (() => {
        const crToXp = { '0': 10, '1/8': 25, '0.125': 25, '1/4': 50, '0.25': 50, '1/2': 100, '0.5': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000 };
        const stored = details.xp?.value;
        return (stored !== undefined && stored !== null && stored !== '') ? Number(stored) : (crToXp[String(details.cr ?? 0)] ?? 0);
      })(),
      _size,
      _sizeOptions,
      _alignment: details.alignment || '',
      _type: details.type?.value || (typeof details.type === 'string' ? details.type : ''),
      _subtype: details.type?.subtype || details.subtype || '',
      _source: details.source || '',
      _senses: [...((() => { const se = attrs.senses || {}; const eff = se.effective || se; const l=[]; for(const s of ['darkvision','blindsight','tremorsense','truesight']) if(eff[s]>0) l.push(`${s.charAt(0).toUpperCase()+s.slice(1)} ${eff[s]} m`); return l; })()), ...(details.senses?.value || [])],
      _sensesRaw: details.senses?.value || [],
      _sensesCustom: details.senses?.custom || '',
      _sensesInputs: (() => { const se = attrs.senses || {}; return { darkvision: se.darkvision ?? 0, blindsight: se.blindsight ?? 0, tremorsense: se.tremorsense ?? 0, truesight: se.truesight ?? 0 }; })(),
      _passivePerception,
      _languages,
      _languagesCustom: details.languages?.custom || '',
      _traits,
      _hasTraits,
      _traitItems,
      _traitOptions,
      _availableSensesList,
      _availableLanguagesList,
      _legendaryActions: details.legendaryActions || 0,
      _legendaryResistances: details.legendaryResistances || 0,
      _biography: details.biography || '',
    };
  }

  async _onSelectAction(action, value, target) {
    if (!this.document || !action || !value) return;
    const sd = this.document.systemData || {};

    if (action === 'add-save-prof') {
      const saves = { ...(sd.saves || {}) };
      const currentSave = saves[value] || { proficient: false, total: 10 };
      const ablMod = sd.abilities?.[value]?.modifier ?? 0;
      const prof = sd.attributes?.prof?.value ?? 2;
      saves[value] = {
        ...currentSave,
        proficient: true,
        total: ablMod + prof,
      };
      await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, saves } });
      await this._reloadDocument();
      return;
    }

    if (action === 'add-skill-prof') {
      const skills = { ...(sd.skills || {}) };
      const currentSkill = skills[value] || { proficient: false, total: 0 };
      const ablKey = currentSkill.ability || SKILL_ABILITIES[value] || 'int';
      const ablMod = sd.abilities?.[ablKey]?.modifier ?? 0;
      const prof = sd.attributes?.prof?.value ?? 2;
      skills[value] = {
        ...currentSkill,
        proficient: true,
        total: ablMod + prof,
      };
      await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, skills } });
      await this._reloadDocument();
      return;
    }

    if (action === 'add-language') {
      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: value,
        type: 'language',
        data: getDefaultData('language'),
        actorId: this.document.id,
      });
      const details = sd.details || {};
      const langs = details.languages?.value || [];
      if (!langs.includes(value)) {
        await api.put(`${this.apiRoute}/${this.document.id}`, {
          systemData: {
            ...sd,
            details: {
              ...details,
              languages: { ...(details.languages || {}), value: [...langs, value] },
            },
          },
        });
      }
      await this._reloadDocument();
      return;
    }

    if (action === 'add-sense') {
      const details = sd.details || {};
      const senses = details.senses?.value || [];
      if (!senses.includes(value)) {
        await api.put(`${this.apiRoute}/${this.document.id}`, {
          systemData: {
            ...sd,
            details: {
              ...details,
              senses: { ...(details.senses || {}), value: [...senses, value] },
            },
          },
        });
        await this._reloadDocument();
      }
      return;
    }

    if (action === 'add-trait') {
      const [type, trait] = value.split(':');
      if (!type || !trait) return;
      const details = sd.details || {};
      const traits = { ...(details.traits || { di: [], dr: [], dv: [], ci: [] }) };
      const list = traits[type] || [];
      if (!list.includes(trait)) {
        traits[type] = [...list, trait];
        await api.put(`${this.apiRoute}/${this.document.id}`, {
          systemData: { ...sd, details: { ...details, traits } },
        });
        await this._reloadDocument();
      }
      return;
    }
  }

  // Lock/edit mode: 'Jogo' (locked, default) hides every editable field; 'Edição' shows the controls marked data-edit-only.
  _applyEditMode() {
    const root = this.element;
    if (!root) return;
    // Sheets open locked (clean reading view); the toggle opens editing.
    if (this._editMode === undefined) this._editMode = false;
    root.querySelector('.sdrn-npc-root')?.classList.toggle('is-editing', this._editMode);
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.hasAttribute('data-always-on')) return;
      el.disabled = !this._editMode;
    });
    const btn = root.querySelector('[data-action="toggle-edit-mode"]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(this._editMode));
      btn.querySelector('i')?.setAttribute('class', this._editMode ? 'fas fa-lock-open' : 'fas fa-lock');
      const label = btn.querySelector('.sdrn-mode-label');
      if (label) label.textContent = this._editMode ? 'Edição' : 'Jogo';
    }
  }

  async _toggleSaveProf(key) {
    if (!key || !this.document?.id) return;
    const sd = this.document.systemData || {};
    const saves = { ...(sd.saves || {}) };
    const current = saves[key] || { proficient: false, total: 0 };
    const ablMod = sd.abilities?.[key]?.modifier ?? 0;
    const prof = sd.attributes?.prof?.value ?? 2;
    const proficient = !current.proficient;
    saves[key] = { ...current, proficient, total: ablMod + (proficient ? prof : 0) };
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, saves } });
    await this._reloadDocument();
  }

  // Quick HP: heal stops at max; damage uses temporary HP first and never goes below 0.
  async _adjustHp(kind) {
    const input = this.element?.querySelector('[data-quick-hp]');
    const amount = Math.max(0, Math.floor(Number(input?.value) || 0));
    if (!amount || !this.document?.id) return;
    const sd = this.document.systemData;
    const health = { ...(sd.resources?.health || {}) };
    let value = Number(health.value) || 0;
    const max = Number(health.max) || 0;
    let temp = Number(health.temp) || 0;
    if (kind === 'heal') {
      value = Math.min(max, value + amount);
    } else {
      const fromTemp = Math.min(temp, amount);
      temp -= fromTemp;
      value = Math.max(0, value - (amount - fromTemp));
    }
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, resources: { ...sd.resources, health: { ...health, value, temp } } } });
    await this._reloadDocument();
  }

  // Portrait source per actor: 'art' uses the actor picture, 'token' uses the prototype token image.
  async _setPortraitSource(source) {
    if (!this.document?.id) return;
    const sd = this.document.systemData;
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, portrait: { ...(sd.portrait || {}), source } } });
    await this._reloadDocument();
  }

  async _takeRest(type) {
    if (!this.document) return;
    await takeRest(this.document, type);
    await this._reloadDocument();
  }

  async _pickPortrait() {
    if (!this.document?.id) return;
    const sd = this.document.systemData || {};
    const cfg = sd.portrait || {};
    const token = cfg.source === 'token';
    const current = token ? (cfg.tokenImg || '') : (this.document.avatarUrl || this.document.img || '');
    const url = (typeof window.prompt === 'function') ? window.prompt('URL da imagem do retrato', current) : current;
    if (url === null || url === undefined) return;
    if (token) {
      await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, portrait: { ...cfg, tokenImg: url.trim() } } });
    } else {
      await api.put(`${this.apiRoute}/${this.document.id}`, { avatarUrl: url.trim() });
    }
    await this._reloadDocument();
  }

  async onAction(action, id, target) {
    if (action === 'short-rest') {
      void this._takeRest('short');
      return;
    }
    if (action === 'long-rest') {
      void this._takeRest('long');
      return;
    }
    // The portrait opens the engine's layered art editor instead of the plain file picker.
    if (action === 'pick-portrait') {
      if (window.Loom?.openPortraitEditor && this.document?.id) {
        window.Loom.openPortraitEditor(this.document.id);
      } else {
        void this._pickPortrait();
      }
      return;
    }
    // The disc of a save pill toggles its proficiency while editing; while locked it just rolls the save.
    if (action === 'toggle-save-prof') {
      if (!this._editMode) {
        this.onAction('roll-save', id, target);
        return;
      }
      void this._toggleSaveProf(target?.dataset?.key);
      return;
    }
    if (action === 'toggle-edit-mode') {
      this._editMode = !this._editMode;
      this._applyEditMode();
      return;
    }
    if (action === 'portrait-source') {
      void this._setPortraitSource(target?.dataset?.value === 'token' ? 'token' : 'art');
      return;
    }
    if (action === 'toggle-condition') {
      const condId = target?.dataset?.condition;
      if (condId && this.document) {
        await toggleActorCondition(this.document, condId);
        await this._reloadDocument();
      }
      return;
    }
    if (action === 'clear-conditions') {
      if (this.document) {
        await clearAllActorConditions(this.document);
        await this._reloadDocument();
      }
      return;
    }
    if (action === 'apply-buff-preset') {
      const presetId = target?.dataset?.presetId;
      if (presetId && this.document) {
        await applyBuffPresetToActor(this.document, presetId);
        await this._reloadDocument();
      }
      return;
    }
    if (action === 'create-custom-effect') {
      if (this.document) {
        await promptCreateCustomEffect(this.document, () => this._reloadDocument());
      }
      return;
    }
    if (action === 'delete-effect') {
      const effId = target?.dataset?.id || id;
      if (effId) {
        await deleteActiveEffect(effId);
        await this._reloadDocument();
      }
      return;
    }
    if (action === 'toggle-effect-disabled') {
      const effId = target?.dataset?.id || id;
      if (effId) {
        const isCurrentlyDisabled = target.closest('.sdrn-effect-row')?.classList?.contains('is-disabled');
        await toggleEffectDisabled(effId, !!isCurrentlyDisabled);
        await this._reloadDocument();
      }
      return;
    }
    if (action === 'hp-heal') {
      void this._adjustHp('heal');
      return;
    }
    if (action === 'hp-damage') {
      void this._adjustHp('damage');
      return;
    }
    if (action === 'movement-ledger-add') {
      void this._addMovementSegment(target);
      return;
    }
    if (action === 'movement-ledger-remove') {
      const current = this._movementContext?.ledger || {};
      void this._saveMovementLedger(removeMovementSegment(current, target?.dataset?.segmentIndex));
      return;
    }
    if (action === 'movement-ledger-reset') {
      void this._saveMovementLedger(resetMovementLedger());
      return;
    }
    if (action === 'movement-ledger-add-dash') {
      void this._addDashMovementBonus(target);
      return;
    }
    if (action === 'movement-ledger-remove-dash') {
      const current = this._movementContext?.ledger || {};
      void this._saveMovementLedger(removeDashMovementBonus(current, target?.dataset?.dashIndex));
      return;
    }
    if (action === 'roll-core-action') {
      void this._rollCoreAction(target?.dataset?.activity, target);
      return;
    }
    if (action === 'resolve-influence') {
      void this._resolveInfluence(target);
      return;
    }
    if (action === 'help-record-ability' || action === 'help-record-attack') {
      void this._recordHelpAction(action === 'help-record-ability' ? 'ability' : 'attack', target);
      return;
    }
    if (action === 'help-remove-record') {
      const current = this.document?.systemData?.srd5eHelpRecords || [];
      void this._saveHelpRecords(removeHelpRecord(current, target?.dataset?.helpIndex));
      return;
    }
    if (action === 'help-clear-records') {
      void this._saveHelpRecords([]);
      return;
    }
    if (action === 'ready-record') {
      void this._recordReadyAction(target);
      return;
    }
    if (action === 'ready-remove-record') {
      const current = this.document?.systemData?.srd5eReadyRecords || [];
      void this._saveReadyRecords(removeReadyRecord(current, target?.dataset?.readyIndex));
      return;
    }
    if (action === 'ready-clear-records') {
      void this._saveReadyRecords([]);
      return;
    }
    if (action === 'dodge-record') {
      void this._saveDodgeRecord(setDodgeRecord());
      return;
    }
    if (action === 'dodge-clear') {
      void this._saveDodgeRecord(clearDodgeRecord());
      return;
    }

    if (action === 'tab') {
      const tab = target?.dataset?.tab;
      if (!tab) return;
      this._activeTab = tab;
      this._applyActiveTab();
      return;
    }

    if (action === 'roll-ability') {
      void this._rollAbility(target.dataset.key, target.dataset.mode || 'test');
      return;
    }
    if (action === 'roll-skill') {
      void this._rollSkill(target.dataset.key);
      return;
    }
    if (action === 'roll-save') {
      void this._rollAbility(target.dataset.key, 'save');
      return;
    }

    if (action === 'remove-save-prof') {
      const key = target?.dataset?.key;
      if (key && this.document) {
        const sd = this.document.systemData || {};
        const saves = { ...(sd.saves || {}) };
        if (saves[key]) {
          const ablMod = sd.abilities?.[key]?.modifier ?? 0;
          saves[key] = { ...saves[key], proficient: false, total: ablMod };
          void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, saves } })
            .then(() => this._reloadDocument());
        }
      }
      return;
    }

    if (action === 'remove-skill-prof') {
      const key = target?.dataset?.key;
      if (key && this.document) {
        const sd = this.document.systemData || {};
        const skills = { ...(sd.skills || {}) };
        if (skills[key]) {
          const ablKey = skills[key].ability || SKILL_ABILITIES[key] || 'int';
          const ablMod = sd.abilities?.[ablKey]?.modifier ?? 0;
          skills[key] = { ...skills[key], proficient: false, total: ablMod };
          void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, skills } })
            .then(() => this._reloadDocument());
        }
      }
      return;
    }

    if (action === 'remove-language') {
      const id = target?.dataset?.id;
      const name = target?.dataset?.name;
      const promises = [];
      if (id) {
        promises.push(api.delete(`/items/${id}`));
      }
      if (name && this.document) {
        const sd = this.document.systemData || {};
        const details = sd.details || {};
        const langs = (details.languages?.value || []).filter((l) => l.toLowerCase() !== name.toLowerCase());
        promises.push(api.put(`${this.apiRoute}/${this.document.id}`, {
          systemData: {
            ...sd,
            details: {
              ...details,
              languages: { ...(details.languages || {}), value: langs },
            },
          },
        }));
      }
      Promise.all(promises).then(() => this._reloadDocument());
      return;
    }

    if (action === 'remove-sense') {
      const val = target?.dataset?.value;
      if (val && this.document) {
        const sd = this.document.systemData || {};
        const details = sd.details || {};
        const senses = (details.senses?.value || []).filter((s) => s !== val);
        void api.put(`${this.apiRoute}/${this.document.id}`, {
          systemData: {
            ...sd,
            details: {
              ...details,
              senses: { ...(details.senses || {}), value: senses },
            },
          },
        }).then(() => this._reloadDocument());
      }
      return;
    }

    if (action === 'remove-trait') {
      const type = target?.dataset?.traitType;
      const val = target?.dataset?.value;
      if (type && val && this.document) {
        const sd = this.document.systemData || {};
        const details = sd.details || {};
        const traits = { ...(details.traits || { di: [], dr: [], dv: [], ci: [] }) };
        traits[type] = (traits[type] || []).filter((t) => t !== val);
        void api.put(`${this.apiRoute}/${this.document.id}`, {
          systemData: { ...sd, details: { ...details, traits } },
        }).then(() => this._reloadDocument());
      }
      return;
    }

    if (action === 'roll-initiative') {
      void this._rollInitiative();
      return;
    }
    if (action === 'roll-death-save') {
      void rollDeathSave(this.document).then(() => this._reloadDocument());
      return;
    }
    if (action === 'hp-delta') {
      const delta = Number(target.dataset.delta) || 0;
      void this._applyHpDelta(delta);
      return;
    }
    if (action === 'roll-attack') {
      const item = (this.document.items || []).find((i) => i.id === id);
      if (item) void rollWeaponAttack(this.document, item);
      return;
    }
    if (action === 'roll-damage') {
      const item = (this.document.items || []).find((i) => i.id === id);
      if (item) void rollWeaponDamage(this.document, item);
      return;
    }
    if (action === 'roll-action-damage') {
      const item = (this.document.items || []).find((i) => i.id === id);
      if (item?.type === 'weapon') void rollWeaponDamage(this.document, item);
      else void this._rollActionDamage(id);
      return;
    }
    if (action === 'post-action-chat') {
      void this._postActionToChat(id);
      return;
    }
    if (action === 'open-item') {
      void this._openItem(id);
      return;
    }
    if (action === 'delete-item') {
      void this._deleteItem(id);
      return;
    }
    if (action === 'create-item') {
      const type = target?.dataset?.itemType || target?.closest?.('[data-item-type]')?.dataset?.itemType || 'feature';
      void this._createItem(type);
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _rollAbility(key, mode) {
    if (!key || !this.document) return;
    const sd = this.document.systemData;
    if (mode === 'save') {
      const conditions = await getActorConditions(this.document.id);
      const { autoFail, advantage: featureAdvantage, disadvantage } = getSaveConditionOutcome(key, conditions, 0, false, { items: this.document.items });
      if (autoFail) {
        await window.Loom.ChatMessage.create({
          speaker: window.Loom.ChatMessage.getSpeaker({ actor: this.document }),
          content: `Save: ${ABILITY_LABELS[key]} — automatic failure`,
          flags: { srd5e: { name: `${this.document.name} — Save: ${ABILITY_LABELS[key]}`, description: '<span style="color:#ef4444">Automatic failure (condition)</span>' } },
        });
        return;
      }
      const save = sd.saves?.[key];
      const coverBonus = await getSaveCoverBonus(key, conditions);
      if (coverBonus === null) return;
      const kb = currentAdvantageMode();
      const advantageSources = (kb === 1 ? 1 : 0) + (featureAdvantage ? 1 : 0);
      const disadvantageSources = (kb === -1 ? 1 : 0) + (disadvantage ? 1 : 0);
      const advantage = advantageSources > disadvantageSources ? 1 : advantageSources < disadvantageSources ? -1 : 0;
      await sdr5eRoll({ label: `Save: ${ABILITY_LABELS[key]}`, parts: [{ label: 'Modifier', value: (save?.total ?? 0) + coverBonus }], actor: this.document, advantage });
    } else {
      const conditions = await getActorConditions(this.document.id);
      const advantage = applyAbilityCheckConditionModifiers(currentAdvantageMode(), conditions, 0, false, rageStrengthAdvantage(this.document.items, key));
      const abl = sd.abilities?.[key];
      await sdr5eRoll({ label: `Ability Check: ${ABILITY_LABELS[key]}`, parts: [{ label: 'Modifier', value: abl?.modifier ?? 0 }], actor: this.document, advantage });
    }
  }

  async _rollInitiative() {
    if (!this.document) return;
    const bonus = this.document.systemData?.attributes?.initiative?.total ?? 0;
    const conditions = await getActorConditions(this.document.id);
    const advantage = initiativeBaseSources(conditions);
    await sdr5eRoll({ label: `${this.document.name} rolls Initiative!`, parts: [{ label: 'Initiative', value: bonus }], actor: this.document, advantage, initiative: true });
  }

  async _rollSkill(key) {
    if (!key || !this.document) return;
    const skill = this.document.systemData?.skills?.[key];
    const conditions = await getActorConditions(this.document.id);
    const { autoFail } = getSkillConditionOutcome(key, conditions);
    if (autoFail) {
      await window.Loom.ChatMessage.create({
        speaker: window.Loom.ChatMessage.getSpeaker({ actor: this.document }),
        content: `Skill Check: ${SKILL_LABELS[key] || key} — automatic failure`,
        flags: { srd5e: { name: `${this.document.name} — Skill Check: ${SKILL_LABELS[key] || key}`, description: '<span style="color:#ef4444">Automatic failure (deafened)</span>' } },
      });
      return;
    }
    const advantage = applyPoisonedDisadvantage(currentAdvantageMode(), conditions);
    await sdr5eRoll({ label: `Skill Check: ${SKILL_LABELS[key] || key}`, parts: [{ label: 'Modifier', value: skill?.total ?? 0 }], actor: this.document, advantage });
  }

  async _applyHpDelta(delta) {
    if (!this.document || !delta) return;
    if (delta > 0) await applyHeal(this.document, delta);
    else await applyDamage(this.document, -delta, 'untyped');
    await this._reloadDocument();
  }

  async _addMovementSegment(target) {
    const section = target?.closest?.('[data-movement-ledger]');
    const distance = section?.querySelector('[data-movement-distance]')?.value;
    const mode = section?.querySelector('[data-movement-mode]')?.value;
    const difficultTerrain = section?.querySelector('[data-movement-difficult]')?.checked === true;
    const current = this._movementContext?.ledger || {};
    const speeds = this._movementContext?.speeds || {};
    const result = addMovementSegment(current, { distance, mode, difficultTerrain }, speeds);
    if (!result.valid) {
      window.Loom?.showToast?.(localizeSheet(result.reason === 'speed-unavailable' ? 'SDR5E.MovementLedger.SpeedUnavailable' : result.reason === 'movement-exceeded' ? 'SDR5E.MovementLedger.Exceeded' : 'SDR5E.MovementLedger.InvalidSegment'), 'warning');
      return;
    }
    await this._saveMovementLedger(result.ledger);
  }

  async _saveMovementLedger(value) {
    if (!this.document?.id || this._movementLedgerSaving) return;
    this._movementLedgerSaving = true;
    try {
      if (this._movementContext?.inCombat) {
        if (!this._movementContext.castId) throw new Error('Cast de combate não selecionado.');
        await api.put(`/cast/${encodeURIComponent(this._movementContext.castId)}`, { systemData: { srd5eMovementLedger: normalizeMovementLedger(value) } });
      } else {
        await api.put(`/actors/${encodeURIComponent(this.document.id)}`, { systemData: { srd5eMovementLedger: normalizeMovementLedger(value) } });
      }
      await this._reloadDocument();
    } catch {
      window.Loom?.showToast?.(localizeSheet('SDR5E.MovementLedger.SaveFailed'), 'error');
    } finally {
      this._movementLedgerSaving = false;
    }
  }

  async _addDashMovementBonus(target) {
    const mode = target?.closest?.('[data-movement-ledger]')?.querySelector('[data-dash-speed]')?.value;
    const current = this._movementContext?.ledger || {};
    const speeds = this._movementContext?.speeds || {};
    const result = addDashMovementBonus(current, mode, speeds);
    if (!result.valid) {
      window.Loom?.showToast?.(localizeSheet(result.reason === 'speed-unavailable' ? 'SDR5E.MovementLedger.SpeedUnavailable' : 'SDR5E.MovementLedger.InvalidDash'), 'warning');
      return;
    }
    await this._saveMovementLedger(result.ledger);
  }

  async _resolveInfluence(target) {
    const section = target?.closest?.('[data-influence-form]');
    if (!section || !this.document) return;
    const value = (key) => section.querySelector(`[data-influence-${key}]`)?.value ?? '';
    const decision = resolveInfluenceAdjudication({
      branch: value('branch'), targetName: value('target'), attitude: value('attitude'), skillKey: value('skill'),
      intelligence: value('intelligence'), dcOverride: value('dc'),
    }, this.document.systemData || {});
    if (!decision.valid) {
      const key = decision.reason === 'skill-unavailable' ? 'Skill' : decision.reason === 'invalid-attitude' ? 'Attitude' : decision.reason === 'invalid-intelligence' ? 'Intelligence' : decision.reason === 'invalid-dc' ? 'DC' : 'Input';
      window.Loom?.showToast?.(localizeSheet(`SDR5E.Influence.${key}Required`), 'warning');
      return;
    }
    const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    if (!decision.requiresCheck) {
      const message = localizeSheet(decision.branch === 'willing' ? 'SDR5E.Influence.WillingMessage' : 'SDR5E.Influence.UnwillingMessage').replace('{target}', escapeHtml(decision.targetName));
      try {
        await window.Loom.ChatMessage.create({
          speaker: window.Loom.ChatMessage.getSpeaker({ actor: this.document }),
          content: message,
          flags: { srd5e: { name: localizeSheet('SDR5E.Influence.NoCheckTitle'), srd5eInfluence: { branch: decision.branch, targetName: decision.targetName } } },
        });
      } catch {
        window.Loom?.showToast?.(localizeSheet('SDR5E.Influence.PostFailed'), 'error');
      }
      return;
    }
    const skillLabel = localizeSheet(`srd5e.Skills.${decision.skillKey}`);
    const conditions = await getActorConditions(this.document.id);
    const baseAdvantage = applyAbilityCheckConditionModifiers(currentAdvantageMode(), conditions, this.document.systemData?.resources?.exhaustion ?? 0);
    const advantage = composeInfluenceAdvantage(baseAdvantage, decision.attitudeAdvantage);
    const label = localizeSheet('SDR5E.Influence.RollLabel')
      .replace('{target}', escapeHtml(decision.targetName))
      .replace('{skill}', skillLabel)
      .replace('{dc}', String(decision.dc));
    await sdr5eRoll({
      label,
      parts: [{ label: skillLabel, value: decision.skillTotal }],
      actor: this.document,
      advantage,
      dc: decision.dc,
      extraMeta: { srd5eActivity: 'influence', srd5eSkillKey: decision.skillKey, srd5eAbilityKey: decision.abilityKey,
        srd5eActionCost: 'action', srd5eInfluence: { branch: 'hesitant', targetName: decision.targetName, attitude: decision.attitude,
          intelligence: decision.intelligence, defaultDC: decision.defaultDC, dcOverridden: decision.dcOverridden,
          interaction: decision.interaction, outcomeAdjudication: 'manual' } },
    });
  }

  async _recordHelpAction(mode, target) {
    const section = target?.closest?.('[data-help-mode-form]');
    const allyName = section?.querySelector('[data-help-ally]')?.value;
    const enemyName = section?.querySelector('[data-help-enemy]')?.value;
    const selected = section?.querySelector('[data-help-proficiency]')?.value || '';
    const split = selected.indexOf(':');
    const candidate = mode === 'ability'
      ? { mode, allyName, proficiencyKind: split > 0 ? selected.slice(0, split) : '', proficiencyKey: split > 0 ? selected.slice(split + 1) : '' }
      : { mode, allyName, enemyName };
    const sd = this.document?.systemData || {};
    const result = createHelpRecord(candidate, sd);
    if (!result.valid) {
      window.Loom?.showToast?.(localizeSheet(result.reason === 'proficiency-unavailable' ? 'SDR5E.HelpAction.UnavailableProficiency' : 'SDR5E.HelpAction.InvalidTarget'), 'warning');
      return;
    }
    await this._saveHelpRecords(appendHelpRecord(sd.srd5eHelpRecords, result.record));
  }

  async _saveHelpRecords(value) {
    if (!this.document?.id || this._helpRecordsSaving) return;
    this._helpRecordsSaving = true;
    try {
      await api.put(`/actors/${encodeURIComponent(this.document.id)}`, { systemData: { srd5eHelpRecords: normalizeHelpRecords(value) } });
      await this._reloadDocument();
    } catch {
      window.Loom?.showToast?.(localizeSheet('SDR5E.HelpAction.SaveFailed'), 'error');
    } finally {
      this._helpRecordsSaving = false;
    }
  }

  async _recordReadyAction(target) {
    const form = target?.closest?.('[data-ready-action-form]');
    const speed = this.document?.systemData?.attributes?.movement?.effective?.walk
      ?? this.document?.systemData?.attributes?.movement?.walk;
    const candidate = {
      trigger: form?.querySelector('[data-ready-trigger]')?.value,
      responseType: form?.querySelector('[data-ready-response-type]')?.value,
      response: form?.querySelector('[data-ready-response]')?.value,
      spellName: form?.querySelector('[data-ready-spell]')?.value,
      distance: form?.querySelector('[data-ready-distance]')?.value,
    };
    const result = createReadyRecord(candidate, speed);
    if (!result.valid) {
      const key = result.reason === 'speed-unavailable' || result.reason === 'movement-exceeds-speed'
        ? 'SDR5E.ReadyAction.MovementInvalid'
        : 'SDR5E.ReadyAction.Invalid';
      window.Loom?.showToast?.(localizeSheet(key), 'warning');
      return;
    }
    const current = this.document?.systemData?.srd5eReadyRecords || [];
    if (current.length) {
      window.Loom?.showToast?.(localizeSheet('SDR5E.ReadyAction.AlreadyRecorded'), 'warning');
      return;
    }
    await this._saveReadyRecords(appendReadyRecord(current, result.record));
  }

  async _saveReadyRecords(value) {
    if (!this.document?.id || this._readyRecordsSaving) return;
    this._readyRecordsSaving = true;
    try {
      await api.put(`/actors/${encodeURIComponent(this.document.id)}`, { systemData: { srd5eReadyRecords: normalizeReadyRecords(value) } });
      await this._reloadDocument();
    } catch {
      window.Loom?.showToast?.(localizeSheet('SDR5E.ReadyAction.SaveFailed'), 'error');
    } finally {
      this._readyRecordsSaving = false;
    }
  }

  async _saveDodgeRecord(value) {
    if (!this.document?.id || this._dodgeSaving) return;
    this._dodgeSaving = true;
    try {
      await api.put(`/actors/${encodeURIComponent(this.document.id)}`, { systemData: { srd5eDodgeRecord: value } });
      await this._reloadDocument();
    } catch {
      window.Loom?.showToast?.(localizeSheet('SDR5E.DodgeAction.SaveFailed'), 'error');
    } finally {
      this._dodgeSaving = false;
    }
  }

  async _rollCoreAction(action, target) {
    if (!this.document) return;
    const row = target?.closest?.('[data-core-action-row]');
    const skillKey = row?.querySelector('select')?.value || '';
    const context = normalizeCoreActionContext(action, row?.querySelector('[data-core-action-context]')?.value);
    const check = resolveCoreActionSkillCheck(action, skillKey, this.document.systemData || {});
    if (!check.valid) {
      window.Loom?.showToast?.(localizeSheet('SDR5E.CoreActions.SkillUnavailable'), 'warning');
      return;
    }
    const skillLabel = localizeSheet(`srd5e.Skills.${check.skillKey}`);
    const actionLabel = localizeSheet(`SDR5E.CoreActions.${check.action}`);
    const dcLabel = check.fixedDC ? ` (${localizeSheet('SDR5E.CoreActions.DCLabel').replace('{dc}', String(check.fixedDC))})` : '';
    const contextLabel = context ? ` — ${localizeSheet('SDR5E.CoreActions.ContextInRoll').replace('{context}', context)}` : '';
    await sdr5eRoll({
      label: `${actionLabel}: ${skillLabel}${dcLabel}${contextLabel}`,
      parts: [{ label: skillLabel, value: check.total }],
      actor: this.document,
      dc: check.fixedDC,
      extraMeta: { srd5eActivity: check.action, srd5eSkillKey: check.skillKey,
        srd5eAbilityKey: check.abilityKey, srd5eActionCost: 'action', ...coreActionContextMetadata(action, context) },
    });
  }

  async _openItem(itemId) {
    if (!itemId) return;
    windowManager.open(`item-sheet-${itemId}`, Sdr5eItemSheet, { itemId });
  }

  async _deleteItem(itemId) {
    if (!itemId) return;
    await api.delete(`/items/${itemId}`);
    await this._reloadDocument();
  }

  async _rollActionDamage(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const idata = item.system || item.data || {};
    const formula = idata.damage?.formula;
    if (!formula) return;
    const type = idata.damage?.type || '';
    const typeSuffix = type ? ` (${type})` : '';
    const total = evaluateDamageFormula(formula);
    window.Loom.dispatchRoll({
      formula: String(total),
      actorId: this.document.id,
      mode: 'public',
      meta: { label: `Damage: ${item.name}${typeSuffix}`, srd5eDamage: { amount: total, type } },
    });
  }

  async _postActionToChat(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    await postItemToChat(this.document, item);
  }

  async _createItem(type = 'feature') {
    if (!this.document) return;
    const itemType = type || 'feature';
    const singular = ITEM_TYPE_SINGULAR[itemType] || itemType;
    await api.post('/items', {
      worldId: window.Loom?.world?.id || this.document.worldId,
      name: `New ${singular}`,
      type: itemType,
      data: getDefaultData(itemType),
      actorId: this.document.id,
    });
    await this._reloadDocument();
  }
}
