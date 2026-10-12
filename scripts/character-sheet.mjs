// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/character-sheet.mjs
// Component Version: 0.1.0
//
// Character sheet — dnd5e-inspired layout, own tab bar floating
// outside the window edge (same pattern as wod6e), grimdark/gold palette.
// `this.document` here is NEVER an instance of the actor document class —
// LoomDocumentSheet only borrows the `prepareData` prototype to run
// prepareDerivedData on a plain object (see document-sheet.ts:_runPrepareData).
// That's why rolls call sdr5eRoll()/applyHeal()/applyDamage() directly
// (module functions), never `this.document.rollAbilityTest(...)`.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, LoomActorSheet, effects, api, windowManager, showToast, LoomDialog } from '/_loom/sdk/index.js';
import { ABILITY_KEYS, ABILITY_LABELS, SKILL_LABELS, ITEM_TYPE_ICON, ITEM_TYPE_LABEL, ITEM_TYPE_SINGULAR, SIZE_LABELS, SIZE_CARRY_MULTIPLIER, WEAPON_CATEGORY_CODES, WEAPON_CATEGORY_LABELS, DAMAGE_TYPES, DAMAGE_TYPE_LABELS, MULTICLASS_PREREQS } from './config.mjs';
import { fmtMod, setPathValue, currentAdvantageMode, passiveScore } from './utils.mjs';
import { initiativeBaseSources } from './initiative-mechanics.mjs';
import { getSetting } from './settings.mjs';
import { resolveLevelUpEligibility, resolveXpProgress } from './xp-progression.mjs';
import { computeCarriedWeight } from './prepare-data.mjs';
import { sdr5eRoll, rollDeathSave, toggleInspiration, setExhaustion, rollWeaponAttack, rollWeaponDamage, rollUnarmedStrike, rollUnarmedDamage, rollUnarmedGrapple, rollUnarmedShove, castSpell, rollSpellAttack, rollSpellDamage, spendHitDie, postItemToChat, getActorConditions, applyAbilityCheckConditionModifiers, getSaveConditionOutcome, getSaveCoverBonus, getSkillConditionOutcome, activateFeature, toggleRage, extendRage, useConsumable, useHealersKit, isToolProficient, rollToolCheck } from './roll-engine.mjs';
import { takeRest } from './rest.mjs';
import { rageStrengthAdvantage } from './rage-mechanics.mjs';
import { resolveArcaneRecovery } from './arcane-recovery.mjs';
import { resolveWizardMemorizeSpellChoice, resolveWizardSpellMasteryReplacement, wizardSpellCastOptions } from './wizard-spell-mechanics.mjs';
import { resolveWeaponMasteryReplacement, weaponMasteryRestCandidates } from './weapon-mastery.mjs';
import { druidMagicianCheckBonus, hasDangerSense, hasFeralInstinct, hasIndomitableMight, primalKnowledgeAbility, resolveAdvantageSources, unarmoredDefenseOptions } from './class-feature-mechanics.mjs';
import { getContents, isDescendant, containerLoad } from './containers.mjs';
import { removeItemEffects } from './effects.mjs';
import { actorSetupWizardRequired, readCreationJournal } from './creation-journal.mjs';
import { getDefaultData } from './schema.mjs';
import { Sdr5eItemSheet } from './item-sheet.mjs';
import { spellCountsTowardPreparedLimit } from './magic-initiate.mjs';
import { KNOWN_SPELLS_TABLE, KNOWN_CANTRIPS_TABLE, classSpellcastingAtLevel, inspectWizardSpellbookState, preparedSpellCapacityForClass, spellEligibleForClassPreparation } from './class-spellcasting.mjs';
import { circleLandAlwaysPreparedSpellNames, planSubclassSpellGrantReconciliation, resolveCircleLandAlwaysPreparedSpells } from './subclass-spell-grants.mjs';
import { searchCompendiumEntries } from './utils.mjs';
import { coreActionActivityView, coreActionContextMetadata, normalizeCoreActionContext, resolveCoreActionSkillCheck } from './core-action-checks.mjs';
import { appendHelpRecord, createHelpRecord, helpActionView, normalizeHelpRecords, removeHelpRecord } from './help-action-mechanics.mjs';
import { appendReadyRecord, createReadyRecord, normalizeReadyRecords, readyActionView, removeReadyRecord } from './ready-action-mechanics.mjs';
import { clearDodgeRecord, dodgeActionView, setDodgeRecord } from './dodge-mechanics.mjs';
import { composeInfluenceAdvantage, influenceFormView, resolveInfluenceAdjudication } from './influence-mechanics.mjs';
import { addDashMovementBonus, addMovementSegment, normalizeMovementLedger, removeDashMovementBonus, removeMovementSegment, resetMovementLedger } from './movement-mechanics.mjs';
import { resolveMovementSheetContext } from './movement-sheet-context.mjs';
import { attachSideTabs, detachSideTabs } from './side-tabs.mjs';
import { getEffectsSheetData, toggleActorCondition, clearAllActorConditions, applyBuffPresetToActor, deleteActiveEffect, toggleEffectDisabled, promptCreateCustomEffect } from './active-effects-helper.mjs';

const localizeSheet = (key) => window.Loom?.i18n?.localize?.(key) || key;

// Header banner — the mechanism already exists in the core (base-window.ts:665,
// `.window-has-banner` class): passing `bannerImage` to the window constructor,
// the core alone makes the title bar float transparently over the image (no
// "standard window" divider on top), with a gradient fade.
const SDR5E_HEADER_BANNER = '/marketplace/rulesets/srd5e/assets/images/banner-character.png';

export class Sdr5eCharacterSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  // `LoomHandlebarsMixin` (application.ts) always resolves width/height from
  // `merged.position` (read here via mergeOptionsChain), IGNORING any
  // width/height passed loose to the constructor — without this the window
  // fell back to BaseWindow's 600px default and the sheet's 3 columns overlapped.
  static DEFAULT_OPTIONS = { position: { width: 750, height: 890 } };

  constructor(props) {
    super({
      ...props,
      // Needs to match the key `windowManager.open(id, ...)` actually uses
      // (core convention: `actor-sheet-${actorId}`, no system prefix) — a
      // fallback with its own prefix here diverges from the real key in the
      // windowManager's Map, and `windowManager.close(this.options.id)` becomes
      // a silent no-op (the window never closes, because the key it tries to
      // close doesn't exist).
      id: props.id || `actor-sheet-${props.actorId}`,
      documentId: props.actorId,
      title: (props.title && props.title !== 'undefined') ? props.title : 'SDR5E',
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['sdrn-sheet'],
      bannerImage: SDR5E_HEADER_BANNER,
    });
  }

  _activeTab = 'main';
  _formSaveTimer;
  // See the note in item-sheet.mjs's _pendingFields — same fix, same bug
  // (a single shared timer only remembered the last field touched within
  // the debounce window and silently dropped the rest).
  _pendingFields = new Map();
  _openContainers = new Set();
  _classlessWizardOpened = false;

  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/character-sheet.hbs' } };

  // Overrides the mixin's default `_onChangeForm` (which only submits when
  // `options.form.submitOnChange` is set — not the case here). Saves field by
  // field, same pattern as wod6e: `name="name"` goes to the document's top
  // level, `name="sd:path.inside.systemData"` goes to systemData.
  _onChangeForm(event) {
    const target = event.target;
    if (!target) return;

    if (target.dataset?.action === 'set-quantity') {
      void this._setItemQuantity(target.dataset.id, Number(target.value) || 0);
      return;
    }

    if (!target.name) return;
    if (target.name !== 'name' && !target.name.startsWith('sd:')) return;
    const value = target.type === 'checkbox' ? target.checked
      : target.type === 'number' ? Number(target.value)
      : target.value;
    this._pendingFields.set(target.name, value);
    clearTimeout(this._formSaveTimer);
    this._formSaveTimer = setTimeout(() => void this._flushPendingFields(), 300);
  }

  async _setItemQuantity(itemId, quantity) {
    if (!itemId) return;
    const item = (this.document?.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const data = { ...(item.system || item.data || {}), quantity };
    await api.put(`/items/${itemId}`, { data });
    await this._reloadDocument();
  }

  async _toggleWeaponProficiency(code) {
    if (!code || !this.document) return;
    const sd = this.document.systemData;
    const current = sd.proficiencies?.weapons || [];
    const next = current.includes(code) ? current.filter((w) => w !== code) : [...current, code];
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, proficiencies: { ...sd.proficiencies, weapons: next } } });
    await this._reloadDocument();
  }

  async _toggleToolProf(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const sd = this.document.systemData;
    const name = String(item.name || '').trim();
    const id = String(item.system?.identifier || item.data?.identifier || '').trim();
    const tools = sd.proficiencies?.tools || [];
    const norm = (v) => String(v).trim().toLowerCase();
    const hasByName = tools.some((t) => norm(t) === norm(name));
    const hasById = id ? tools.some((t) => norm(t) === norm(id)) : false;
    const has = hasByName || hasById;
    let next;
    if (has) {
      next = tools.filter((t) => norm(t) !== norm(name) && (!id || norm(t) !== norm(id)));
    } else {
      next = [...tools, name];
    }
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, proficiencies: { ...sd.proficiencies, tools: next } } });
    await this._reloadDocument();
  }

  async _toggleDamageTrait(cat, type) {
    if (!cat || !type || !this.document) return;
    const sd = this.document.systemData;
    const current = sd.traits?.[cat] || [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, traits: { ...sd.traits, [cat]: next } } });
    await this._reloadDocument();
  }

  async _toggleConcentration() {
    if (!this.document) return;
    const sd = this.document.systemData;
    const next = !sd.resources?.concentrating;
    const concentratingOn = sd.resources?.concentratingOn;
    // Manually ending concentration is the same as failing the save (Passo
    // 4): drop whatever temporary effect it was holding up, same as
    // rollConcentrationSave does on a failed roll.
    if (!next && concentratingOn) await removeItemEffects({ id: concentratingOn });
    const concentrationId = next
      ? String(sd.resources?.concentrationId || globalThis.crypto?.randomUUID?.() || `concentration-${Date.now().toString(36)}`)
      : '';
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, resources: {
      ...sd.resources, concentrating: next, concentratingOn: next ? concentratingOn : '', concentrationId,
      concentrationSaveAttemptId: next ? String(sd.resources?.concentrationSaveAttemptId || '') : '',
      concentrationSaveAttemptIds: next ? (sd.resources?.concentrationSaveAttemptIds || []) : [],
    } } });
    await this._reloadDocument();
  }

  async _castSpell(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    await castSpell(this.document, item);
    await this._reloadDocument();
  }

  async _castRitual(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((entry) => entry.id === itemId);
    if (!item) return;
    await castSpell(this.document, item, { ritual: true });
    await this._reloadDocument();
  }

  async _rollSpell(itemId, kind) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    if (kind === 'attack') await rollSpellAttack(this.document, item);
    else await rollSpellDamage(this.document, item);
  }

  async _rollWeapon(itemId, kind) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    if (kind === 'attack') await rollWeaponAttack(this.document, item, { attackAction: true });
    else await rollWeaponDamage(this.document, item);
  }

  /** SRD: modificador de habilidade de conjuração + nível do personagem,
   * mínimo 1. Ver Handout 04 (.planning/handouts/) pra nota sobre classes
   * "conhecidas" vs "preparadas" — simplificação assumida de propósito. */
  _maxPreparedSpells(classIdentifier = '') {
    const sd = this.document?.systemData;
    const classItems = (this.document?.items || []).filter((item) => item.type === 'class');
    if (classIdentifier) return preparedSpellCapacityForClass(classIdentifier, classItems) ?? 0;
    if (classItems.length) {
      const capacities = classItems.map((item) => {
        const data = item.system || item.data || {};
        return preparedSpellCapacityForClass(data.classIdentifier, classItems);
      }).filter(Number.isInteger);
      if (capacities.length) return capacities.reduce((sum, value) => sum + value, 0);
    }
    if (!sd) return 0;
    const abilityKey = sd.attributes?.spellcasting?.ability || 'int';
    const abilityMod = sd.abilities?.[abilityKey]?.modifier || 0;
    const level = Number(sd.details?.level) || 1;
    return Math.max(1, abilityMod + level);
  }

  async _togglePrepared(itemId) {
    if (!itemId) return;
    const item = (this.document?.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const idata = item.system || item.data || {};
    if (idata.magicInitiate || idata.alwaysPrepared) return;
    const willPrepare = !idata.prepared;
    const isCantrip = (idata.spellLevel ?? 0) === 0;
    const classItems = (this.document?.items || []).filter((entry) => entry.type === 'class');
    const sourceClassIdentifier = idata.sourceClassIdentifier;
    if (willPrepare && !isCantrip && !spellEligibleForClassPreparation(idata, sourceClassIdentifier, classItems)) {
      showToast?.(localizeSheet('SDR5E.Spellcasting.PreparedSpellSourceInvalid'), 'warning');
      return;
    }

    // Cantrips não contam pro limite (SRD: são "always prepared", sem custo).
    if (willPrepare && !isCantrip) {
      const max = this._maxPreparedSpells(sourceClassIdentifier);
      const currentPrepared = (this.document.items || []).filter((i) => {
        if (i.type !== 'spell' || i.id === itemId) return false;
        const d = i.system || i.data || {};
        return d.sourceClassIdentifier === sourceClassIdentifier
          && spellCountsTowardPreparedLimit(d) && !d.alwaysPrepared
          && (sourceClassIdentifier !== 'wizard' || d.wizardSpellbook === true);
      }).length;
      if (currentPrepared >= max) {
        window.Loom?.showToast?.(`You can only prepare ${max} spell${max === 1 ? '' : 's'} for this class.`, 'warning');
        return;
      }
    }

    const data = { ...idata, prepared: willPrepare };
    await api.put(`/items/${itemId}`, { data });
    await this._reloadDocument();
  }

  async _toggleAttune(itemId) {
    if (!itemId) return;
    const item = (this.document?.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const idata = item.system || item.data || {};
    const willAttune = idata.attunement !== 'attuned';

    // SRD: máximo 3 itens sintonizados ao mesmo tempo. Só checa quando vai
    // LIGAR a sintonia — desatunar nunca precisa de checagem.
    if (willAttune) {
      const attunedCount = (this.document.items || []).filter((i) => {
        if (i.id === itemId) return false;
        const d = i.system || i.data || {};
        return d.attunement === 'attuned';
      }).length;
      if (attunedCount >= 3) {
        window.Loom?.showToast?.('Already attuned to 3 magic items (SRD maximum).', 'warning');
        return;
      }
    }

    const next = willAttune ? 'attuned' : 'required';
    const data = { ...idata, attunement: next };
    await api.put(`/items/${itemId}`, { data });
    await this._reloadDocument();
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
    this._attachDropListener();
    this._attachDragListener();
    this._attachMovementCastSelector();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveTab();
    this._detachSideTabs();
    this._applyEditMode();
    this._attachDropListener();
    this._attachDragListener();
    this._attachMovementCastSelector();
  }

  _movementSelectorRoot = null;
  _attachMovementCastSelector() {
    const root = this.element;
    if (!root || this._movementSelectorRoot === root) return;
    this._movementSelectorRoot = root;
    root.addEventListener('change', (event) => {
      const select = event.target?.closest?.('[data-movement-cast-select]');
      if (!select) return;
      this._movementCastId = select.value || '';
      void this._reloadDocument();
    });
  }

  // Lets a `[data-drag-item-id]` row (inventory/feature/spell — always an
  // item already embedded on THIS actor, never a bare compendium/world
  // item) be dragged onto the macro hotbar to build a "use this item"
  // macro (macro-hotbar.ts's `Item` drop type -> `use-item` macro ->
  // LoomSystem.useItem, srd5e.mjs). Delegated on `this.element` (Rule 3),
  // same idempotent-guard pattern as `_attachDropListener` right above.
  _hasDragListener = false;
  _attachDragListener() {
    if (!this.element || this._hasDragListener) return;
    this._hasDragListener = true;
    this.element.addEventListener('dragstart', (e) => {
      const row = e.target instanceof HTMLElement ? e.target.closest('[data-drag-item-id]') : null;
      if (!row || !this.document) return;
      const payload = {
        type: 'Item',
        actorId: this.document.id,
        itemId: row.dataset.dragItemId,
        name: row.dataset.dragItemName || '',
        imgUrl: row.dataset.dragItemImg || '',
      };
      e.dataTransfer?.setData('text/plain', JSON.stringify(payload));
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

      if (itemType === 'class') {
        const classIdentifier = (source.system || source.data || {}).classIdentifier;
        const existingClass = (this.document.items || []).find((i) => i.type === 'class'
          && (i.system?.classIdentifier || i.data?.classIdentifier) === classIdentifier);
        if (existingClass) {
          showToast?.(`Esta ficha já possui a classe ${source.name}. Use o Level Up para subir de nível.`, 'warning');
          return;
        }
      }

      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: source.name,
        type: itemType,
        imgUrl: source.imgUrl || source.img || '',
        data: source.system || source.data || getDefaultData(itemType),
        actorId: this.document.id,
      });

      if (itemType === 'class') {
        const classIdentifier = (source.system || source.data || {}).classIdentifier;
        if (classIdentifier) {
          const { grantClassFeatures } = await import('./class-features.mjs');
          const worldId = window.Loom?.world?.id || this.document.worldId;
          const cha = this.document.systemData?.abilities?.cha?.value ?? 10;
          await grantClassFeatures(worldId, this.document.id, classIdentifier, 0, 1, this.document.items || [], { charismaScore: cha }).catch((err) => {
            console.warn('[srd5e] Failed to grant starting class features on class drop:', err);
          });
        }
      }

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
      console.error('Failed to drop item onto Character:', err);
    }
  }

  onClose() {
    this._cleanupSideTabs();
  }

  /**
   * Real bug found live: `.sdrn-side-tabs` used to float OUTSIDE the window
   * edge via `position:absolute; right:-Npx` + the core's `allowOverflow`
   * (`overflow:visible`) — the same pattern wod6e's `.cp-side-tabs` uses.
   * Confirmed empirically (hit-testing coordinates just past the window's
   * own rect, on a fresh tab, with the banner removed, with forced
   * compositing layers, with the canvas's own z-index set to -1 — none of
   * it mattered) that ANY content escaping a window's own bounding box via
   * `overflow:visible` loses to the core's game canvas (`#game-canvas`,
   * `z-index:auto`) regardless of the window's own z-index (104). Content
   * that is NOT a descendant of `.loom-window` — a true sibling inside
   * `#windows` — stacks correctly, confirmed with a throwaway probe div.
   * So: detach the tab bar from the template and re-parent it directly
   * into `#windows`, `position:fixed`, position synced to the window's own
   * rect every frame (cheap — one rect read + two style writes). This
   * needs its own click delegation since moving it out of `this.element`
   * means clicks on it no longer bubble through the window's own listener.
   */
  _detachSideTabs() {
    attachSideTabs(this, (event) => {
      const btn = event.target instanceof Element ? event.target.closest('[data-action]') : null;
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id || btn.closest('[data-id]')?.dataset.id || null;
      if (typeof this.onAction === 'function') this.onAction(action, id, btn);
    });
  }

  _cleanupSideTabs() {
    detachSideTabs(this);
  }

  _applyActiveTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeTab || 'main';
    // The tab buttons themselves live in `_sideTabsEl` once detached (see
    // `_detachSideTabs`) — NOT inside `this.element` anymore. Querying only
    // `root` left the active-tab highlight permanently stuck on "main"
    // after the first click (found live: clicking Inventory correctly
    // swapped the panel, since that query is unaffected, but the button's
    // own `.active` class never moved).
    (this._sideTabsEl || root).querySelectorAll('.sdrn-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    root.querySelectorAll('[data-tab-content]').forEach((panel) => {
      panel.style.display = panel.dataset.tabContent === tab ? '' : 'none';
    });
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const actorIdForSetup = this.document?.id;
    const hasClass = (this.document?.items || []).some((item) => item.type === 'class');
    const pendingCreation = readCreationJournal(window.Loom?.world?.id);
    if (actorSetupWizardRequired(actorIdForSetup, hasClass, pendingCreation) && !this._classlessWizardOpened) {
      this._classlessWizardOpened = true;
      const actorId = actorIdForSetup;
      queueMicrotask(async () => {
        try {
          const response = await api.get(`/actors/${encodeURIComponent(actorId)}?populate=true`);
          const actor = response?.data?.id ? response.data : response;
          const actorNeedsSetup = actorSetupWizardRequired(actor?.id, (actor?.items || []).some((item) => item.type === 'class'), pendingCreation);
          if (!actor?.id || actor.type !== 'character' || !actorNeedsSetup) return;
          const { Sdr5eCharacterWizard } = await import('./character-wizard.mjs');
          const wid = `sdr5e-wizard-${Math.random().toString(36).slice(2, 9)}`;
          windowManager.open(wid, Sdr5eCharacterWizard, { id: wid, actorId: actor.id, existingActor: actor });
          windowManager.close(`actor-sheet-${actor.id}`);
        } catch (error) {
          console.error('[srd5e] Could not open classless character setup:', error);
          showToast?.(localizeSheet('SDR5E.CharacterWizard.SetupUnavailable'), 'warning');
        }
      });
    }
    const sd = this.document?.systemData || {};
    const abilities = sd.abilities || {};
    const saves = sd.saves || {};
    const skills = sd.skills || {};
    const attrs = sd.attributes || {};
    const res = sd.resources || {};
    const details = sd.details || {};
    const conditions = await getActorConditions(this.document?.id);
    this._movementContext = await resolveMovementSheetContext({ actorId: this.document?.id, combat: window.Loom?.combat, api,
      selectedCastId: this._movementCastId, actorLedger: sd.srd5eMovementLedger,
      actorSpeeds: attrs.movement?.effective || attrs.movement || {}, conditions, localize: localizeSheet });
    if (this._movementContext.castId) this._movementCastId = this._movementContext.castId;

    const _abilities = ABILITY_KEYS.map((k) => ({
      key: k,
      abbr: k.toUpperCase(),
      label: ABILITY_LABELS[k],
      score: abilities[k]?.value ?? 10,
      mod: fmtMod(abilities[k]?.modifier ?? 0),
    }));

    const _saves = ABILITY_KEYS.map((k) => ({
      key: k,
      label: ABILITY_LABELS[k].slice(0, 3).toUpperCase(),
      proficient: !!saves[k]?.proficient,
      total: fmtMod(saves[k]?.total ?? 0),
    }));

    // SRD Passive score: +/-5 only from persistent Advantage/Disadvantage (conditions such as Poisoned), never Shift/Ctrl.
    const passiveMode = applyAbilityCheckConditionModifiers(0, conditions);
    const _skills = Object.keys(SKILL_LABELS).map((k) => ({
      key: k,
      label: SKILL_LABELS[k],
      ability: (skills[k]?.ability || '').toUpperCase(),
      proficient: !!skills[k]?.proficient,
      total: fmtMod(skills[k]?.total ?? 0),
      passive: passiveScore(skills[k]?.total, passiveMode),
    })).sort((a, b) => a.label.localeCompare(b.label));

    const items = this.document?.items || [];
    const equippedArmor = items.filter((item) => item.type === 'armor' && (item.system || item.data || {}).equipped);
    const unarmoredDefenseChoices = unarmoredDefenseOptions(items, {
      dexterityModifier: abilities.dex?.modifier,
      constitutionModifier: abilities.con?.modifier,
      wisdomModifier: abilities.wis?.modifier,
      bodyArmorWorn: equippedArmor.some((item) => (item.system || item.data || {}).armorType !== 'shield'),
      shieldWielded: equippedArmor.some((item) => (item.system || item.data || {}).armorType === 'shield'),
    }).map(({ classIdentifier, baseAC }) => ({
      value: classIdentifier,
      baseAC,
      label: localizeSheet(`SDR5E.ClassFeatures.UnarmoredDefense${classIdentifier === 'barbarian' ? 'Barbarian' : 'Monk'}`),
      selected: sd.srd5eUnarmoredDefenseClass === classIdentifier,
    }));
    const isRoot = (it) => {
      const cid = (it.system || it.data || {}).container;
      return !cid || !items.some((x) => x.id === cid);
    };
    const byType = (type) => items.filter((i) => i.type === type && isRoot(i)).map((i) => {
      const idata = i.system || i.data || {};
      const isContainer = type === 'container';
      const load = isContainer ? containerLoad(items, i.id) : null;
      // Flatten nested containers with depth, only if ancestors are open
      function flattenContents(containerId, depth, out){
        const direct = getContents(items, containerId);
        for(const c of direct){
          const cdata = c.system || c.data || {};
          const isCont = c.type === 'container';
          out.push({
            ...c,
            icon: ITEM_TYPE_ICON[c.type] || '📦',
            hasQuantity: c.type !== 'container',
            quantity: cdata.quantity ?? 1,
            isWeapon: c.type === 'weapon',
            isHealersKit: c.type === 'item' && cdata.identifier === 'healers-kit',
            isConsumable: c.type === 'consumable',
            isTool: c.type === 'tool',
            isContainer: isCont,
            proficient: c.type === 'tool' ? isToolProficient(sd, c) : false,
            showEquip: c.type === 'weapon' || c.type === 'armor',
            usesLabel: cdata.uses?.max > 1 ? `${cdata.uses.value ?? 0}/${cdata.uses.max}` : '',
            isMovable: ['weapon','armor','item','consumable','tool','loot','container'].includes(c.type),
            depth,
            containerOpen: isCont ? this._openContainers.has(c.id) : false,
            containerLoad: isCont ? containerLoad(items, c.id) : null,
            capacityLabel: isCont && cdata.capacity?.value > 0 ? (cdata.capacity.type === 'weight' ? `${containerLoad(items, c.id).weight} / ${cdata.capacity.value} lb` : `${containerLoad(items, c.id).count} / ${cdata.capacity.value} items`) : '',
            capacityOver: isCont && cdata.capacity?.value > 0 ? (cdata.capacity.type === 'weight' ? containerLoad(items, c.id).weight > cdata.capacity.value : containerLoad(items, c.id).count > cdata.capacity.value) : false,
          });
          if(isCont && this._openContainers.has(c.id)){
            flattenContents.call(this, c.id, depth+1, out);
          }
        }
      }
      const contents = isContainer ? (()=>{ const out=[]; flattenContents.call(this, i.id, 1, out); return out; })() : null;
      return {
        ...i,
        icon: ITEM_TYPE_ICON[type] || '📦',
        equipped: !!idata.equipped,
        hasQuantity: type !== 'container' && (type === 'item' || type === 'weapon' || type === 'armor' || type === 'consumable' || type === 'tool' || type === 'loot'),
        quantity: idata.quantity ?? 1,
        attunementRequired: idata.attunement === 'required' || idata.attunement === 'attuned',
        attuned: idata.attunement === 'attuned',
        isWeapon: type === 'weapon',
        isHealersKit: type === 'item' && idata.identifier === 'healers-kit',
        isConsumable: type === 'consumable',
        isTool: type === 'tool',
        isContainer: isContainer,
        isMovable: ['weapon','armor','item','consumable','tool','loot','container'].includes(type),
        proficient: type === 'tool' ? isToolProficient(sd, i) : false,
        usesLabel: idata.uses?.max > 1 ? `${idata.uses.value ?? 0}/${idata.uses.max}` : '',
        showEquip: type === 'weapon' || type === 'armor',
        containerLoad: load,
        containerContents: contents,
        containerOpen: isContainer ? this._openContainers.has(i.id) : false,
        capacityLabel: isContainer && idata.capacity?.value > 0 ? (idata.capacity.type === 'weight' ? `${load.weight} / ${idata.capacity.value} lb` : `${load.count} / ${idata.capacity.value} items`) : '',
        capacityOver: isContainer && idata.capacity?.value > 0 ? (idata.capacity.type === 'weight' ? load.weight > idata.capacity.value : load.count > idata.capacity.value) : false,
      };
    });
    const _inventory = ['weapon', 'armor', 'item', 'consumable', 'tool', 'loot', 'container', 'language']
      .map((type) => {
        const group = { type, label: ITEM_TYPE_LABEL[type], icon: ITEM_TYPE_ICON[type], items: byType(type) };
        if (type === 'loot' && group.items.length) {
          const totalGp = group.items.reduce((sum, it) => {
            const d = it.system || it.data || {};
            const qty = Number(d.quantity) || 1;
            const gp = Number(d.price?.gp) || 0;
            const sp = Number(d.price?.sp) || 0;
            const cp = Number(d.price?.cp) || 0;
            return sum + (gp + sp / 10 + cp / 100) * qty;
          }, 0);
          group.lootTotal = totalGp % 1 === 0 ? `${totalGp} gp` : `${totalGp.toFixed(2)} gp`;
        }
        return group;
      })
      .filter((g) => g.items.length > 0 || ['weapon', 'armor', 'item', 'consumable', 'tool'].includes(g.type));
    const _features = byType('feature');
    // Grouped by `source` to match the real dnd5e Features tab
    // ("Wizard Features" / "Background Features" as separate header bars,
    // not one flat list) — features without a source (existing ones,
    // predating this field) fall into a generic group instead of vanishing.
    const _featureGroupMap = new Map();
    for (const f of _features) {
      const idata = f.system || f.data || {};
      // "Features" alone here rendered as "Features Features" once the
      // template appends " Features" to the group name — found live.
      const groupName = idata.source?.trim() || 'General';
      if (!_featureGroupMap.has(groupName)) _featureGroupMap.set(groupName, []);
      _featureGroupMap.get(groupName).push({
        ...f,
        isRage: idata.identifier === 'rage' && idata.classIdentifier === 'barbarian',
        isMonkFocusPool: idata.identifier === 'monks-focus' && idata.classIdentifier === 'monk',
        isUncannyMetabolism: idata.identifier === 'uncanny-metabolism' && idata.classIdentifier === 'monk',
        arcaneRecoveryNotice: idata.identifier === 'arcane-recovery' && this.document.flags?.sdr5e?.arcaneRecoveryUsed
          ? localizeSheet('SDR5E.ClassFeatures.ArcaneRecoveryUsed') : idata.identifier === 'arcane-recovery'
            ? localizeSheet('SDR5E.ClassFeatures.ArcaneRecoveryHow') : '',
        expertiseSkillLabel: idata.expertiseSkill ? SKILL_LABELS[idata.expertiseSkill] || idata.expertiseSkill : '',
        memorizeSpellNotice: idata.identifier === 'memorize-spell'
          ? localizeSheet('SDR5E.ClassFeatures.MemorizeSpellHowCard') : '',
        rageActive: !!idata.rageActive,
        rageCanExtend: !!idata.rageActive && idata.rageTurnState?.nextTurnSeen === true && idata.rageTurnState?.persistent !== true,
        rageNotice: idata.rageActive
          ? idata.rageTurnState?.persistent === true ? localizeSheet('SDR5E.ClassFeatures.RagePersistentTracked')
            : idata.rageTurnState?.combatId ? idata.rageTurnState?.nextTurnSeen === true
              ? localizeSheet('SDR5E.ClassFeatures.RageExtensionPrompt')
              : localizeSheet('SDR5E.ClassFeatures.RageTurnTracked')
            : localizeSheet('SDR5E.ClassFeatures.RageManualDuration')
          : '',
        usesLabel: idata.uses?.max > 0 ? `${idata.uses?.value ?? idata.uses.max} / ${idata.uses.max}` : '—',
        recoveryLabel: idata.uses?.shortRestRestore
          ? localizeSheet('SDR5E.ClassFeatures.RageRecovery')
          : { sr: 'SR', lr: 'LR' }[idata.uses?.recovery] || '—',
        supportHint: idata.mechanicsSupport?.manualNoticeKey ? localizeSheet(idata.mechanicsSupport.manualNoticeKey) : '',
        resourceCost: Number(idata.resourceCost) || 0,
      });
    }
    const _featureGroups = Array.from(_featureGroupMap, ([source, list]) => ({ source, items: list }));

    const rangerFavoredEnemyItem = items.find((item) => item.type === 'feature'
      && (item.system || item.data || {}).classIdentifier === 'ranger'
      && (item.system || item.data || {}).identifier === 'favored-enemy');
    const rangerFavoredEnemyUses = rangerFavoredEnemyItem?.system?.uses || rangerFavoredEnemyItem?.data?.uses;
    const spellItems = byType('spell').map((s) => {
      const sdata = s.system || s.data || {};
      const wizardLevel = Math.max(0, ...items.filter((item) => item.type === 'class'
        && (item.system || item.data || {}).classIdentifier === 'wizard')
        .map((item) => Number((item.system || item.data || {}).levels) || 0));
      return {
        ...s,
        isCantrip: (sdata.spellLevel ?? 0) === 0,
        prepared: !!sdata.prepared,
        alwaysPrepared: !!sdata.magicInitiate || !!sdata.alwaysPrepared,
        isRangerFavoredEnemy: sdata.classes?.includes('ranger')
          && String(s.name || '').trim().toLocaleLowerCase() === "hunter's mark"
          && Number(sdata.spellLevel) === 1,
        rangerFavoredEnemyUsesLabel: rangerFavoredEnemyUses
          ? `${rangerFavoredEnemyUses.value ?? rangerFavoredEnemyUses.max}/${rangerFavoredEnemyUses.max}` : '',
        hasDamage: !!sdata.damage?.formula,
        ...wizardSpellCastOptions(sdata, wizardLevel),
      };
    });
    const _spellsByLevel = Array.from({ length: 10 }, (_, lvl) => ({
      level: lvl,
      label: lvl === 0 ? 'Cantrips' : `Level ${lvl}`,
      slots: lvl > 0 ? sd.resources?.spellSlots?.[lvl] : null,
      spells: spellItems.filter((s) => (s.system?.spellLevel ?? s.data?.spellLevel ?? 0) === lvl),
    })).filter((g) => g.spells.length > 0);
    const preparableSpells = spellItems.filter((s) => !s.isCantrip);

    // SRD: Bardo/Feiticeiro/Bruxo/Patrulheiro "conhecem" magia (número fixo,
    // sem preparação diária) — ver Handout 09. Só olha a primeira classe
    // 'known' encontrada; multiclasse com 2+ classes 'known' não é somado
    // (limitação documentada no handout).
    const knownClassItem = items.find((i) => {
      const idata = i.system || i.data || {};
      return i.type === 'class' && KNOWN_SPELLS_TABLE[idata.knownCasterType];
    });
    const knownClassData = knownClassItem ? (knownClassItem.system || knownClassItem.data || {}) : null;
    const knownType = knownClassData?.knownCasterType;
    const knownLevel = Math.max(1, Math.min(20, Number(knownClassData?.levels) || 1));
    const knownMax = knownType ? (KNOWN_SPELLS_TABLE[knownType]?.[knownLevel - 1] ?? 0) : 0;
    const cantripsKnownMax = knownType ? (KNOWN_CANTRIPS_TABLE[knownType]?.[knownLevel - 1] ?? 0) : 0;

    const _spellcasting = {
      ability: (attrs.spellcasting?.ability || 'int').toUpperCase(),
      dc: attrs.spellcasting?.dc ?? 0,
      attackBonus: fmtMod(attrs.spellcasting?.attackBonus ?? 0),
      prepared: preparableSpells.filter((s) => {
        const data = s.system || s.data || {};
        return !!data.sourceClassIdentifier && spellCountsTowardPreparedLimit(data) && !data.alwaysPrepared
          && this._maxPreparedSpells(data.sourceClassIdentifier) > 0
          && (data.sourceClassIdentifier !== 'wizard' || data.wizardSpellbook === true);
      }).length,
      preparedMax: this._maxPreparedSpells(),
      // Só faz sentido quando `knownClassItem` existe — 0/0 pra quem prepara
      // magia em vez de "conhecer" (Cleric/Druid/Paladin/Wizard).
      known: knownClassItem ? preparableSpells.filter((s) => !(s.system || s.data || {}).magicInitiate).length : 0,
      knownMax,
      cantripsKnown: knownClassItem ? spellItems.filter((s) => s.isCantrip && !(s.system || s.data || {}).magicInitiate).length : 0,
      cantripsKnownMax,
    };

    // Race/Class/Background — 1 item of each expected per actor (the first
    // one found "wins"; the sheet doesn't prevent multiples, but that's not
    // the intended use case).
    const findFirst = (type) => items.find((i) => i.type === type) || null;
    const raceItem = findFirst('race');
    const classItem = findFirst('class');
    const backgroundItem = findFirst('background');
    const subclassItem = findFirst('subclass');
    const getItemImage = (i) => i ? (i.imgUrl || i.img || i.avatarUrl || i.systemData?.imgUrl || i.systemData?.img || i.data?.imgUrl || i.data?.img || i.system?.img || '') : '';
    const getItemIcon = (i) => i ? (i.icon || ITEM_TYPE_ICON[i.type] || '') : '';

    const _identity = {
      race: raceItem ? {
        id: raceItem.id,
        name: raceItem.name,
        imgUrl: getItemImage(raceItem),
        icon: getItemIcon(raceItem),
        subtitle: raceItem.system?.creatureType || raceItem.data?.creatureType || raceItem.systemData?.creatureType || ''
      } : null,
      class: classItem ? {
        id: classItem.id,
        name: classItem.name,
        imgUrl: getItemImage(classItem),
        icon: getItemIcon(classItem),
        subtitle: `Level ${classItem.system?.levels ?? classItem.data?.levels ?? classItem.systemData?.levels ?? 1}`,
        level: classItem.system?.levels ?? classItem.data?.levels ?? classItem.systemData?.levels ?? 1,
        subclassName: subclassItem?.name || '',
        subclassId: subclassItem?.id || null,
      } : null,
      background: backgroundItem ? {
        id: backgroundItem.id,
        name: backgroundItem.name,
        imgUrl: getItemImage(backgroundItem),
        icon: getItemIcon(backgroundItem),
        subtitle: backgroundItem.system?.creatureType || backgroundItem.data?.creatureType || backgroundItem.systemData?.creatureType || 'Background'
      } : null,
    };
    const _classLabel = classItem ? classItem.name : '';

    const raceSize = raceItem?.system?.size || raceItem?.data?.size || 'med';
    const strScore = abilities.str?.value ?? 10;
    const carriedWeight = computeCarriedWeight(items);
    const sizeMultiplier = SIZE_CARRY_MULTIPLIER[raceSize] ?? 1;
    const _carrying = {
      weight: Math.round(carriedWeight * 10) / 10,
      capacity: Math.round(strScore * 15 * sizeMultiplier),
      str: strScore,
      sizeLabel: SIZE_LABELS[raceSize] || 'Md',
      multiplier: sizeMultiplier,
    };

    const effectsData = await getEffectsSheetData(this.document);

    // SRD (Characterizations/Multiclassing.md, "Prerequisites") — só checa
    // de verdade com 2+ classes; com 0 ou 1, não há "multiclasse" pra
    // qualificar. Informativo, não bloqueia nada (ver Handout 10).
    const classItemsForPrereq = items.filter((i) => i.type === 'class');
    const multiclassQualifies = classItemsForPrereq.length <= 1 ? true : classItemsForPrereq.every((item) => {
      const cdata = item.system || item.data || {};
      const prereq = MULTICLASS_PREREQS[cdata.classIdentifier];
      if (!prereq) return true; // classe custom/'none' — não tem tabela pra checar, não bloqueia
      const scores = prereq.abilities.map((a) => sd.abilities?.[a]?.total ?? 0);
      return prereq.mode === 'or' ? scores.some((s) => s >= prereq.score) : scores.every((s) => s >= prereq.score);
    });

    const healthMax = res.health?.max ?? 10;
    const effectiveMax = res.health?.effectiveMax ?? healthMax;
    const healthPct = effectiveMax > 0 ? Math.max(0, Math.min(100, Math.round(((res.health?.value ?? 0) / effectiveMax) * 100))) : 0;

    const hitDice = res.hitDice ?? { value: 1, max: 1, die: 'd8' };
    const hitDicePct = hitDice.max > 0 ? Math.max(0, Math.min(100, Math.round((hitDice.value / hitDice.max) * 100))) : 0;

    const exhaustion = res.exhaustion ?? 0;
    const _exhaustionLevels = Array.from({ length: 6 }, (_, i) => ({ level: i + 1, filled: exhaustion >= i + 1 }));
    // Real dnd5e flanks the AC shield with the exhaustion track
    // split 3-and-3 either side, not a standalone boxed row — confirmed
    // live against the reference sheet.
    const _exhaustionLeft = _exhaustionLevels.slice(0, 3);
    const _exhaustionRight = _exhaustionLevels.slice(3, 6);

    const deathSaves = res.deathSaves ?? { successes: 0, failures: 0 };
    const _deathSaves = {
      successPips: Array.from({ length: 3 }, (_, i) => ({ filled: (deathSaves.successes || 0) > i })),
      failurePips: Array.from({ length: 3 }, (_, i) => ({ filled: (deathSaves.failures || 0) > i })),
    };

    const xpVal = Number(details.xp?.value) || 0;
    const characterLevel = Number(details.level) || 1;
    const xpProgress = resolveXpProgress(xpVal, characterLevel);
    const levelUpEligibility = resolveLevelUpEligibility(xpVal, characterLevel, getSetting('learningMilestones', true));
    const _xp = {
      value: xpVal.toLocaleString(),
      max: (xpProgress.nextThreshold ?? xpProgress.currentThreshold).toLocaleString(),
      pct: xpProgress.progressPercent,
    };
    const _levelUpTitle = levelUpEligibility.reason === 'level-cap'
      ? localizeSheet('SDR5E.Progression.LevelCap')
      : levelUpEligibility.allowed
        ? localizeSheet('SDR5E.Progression.LevelUpAvailable')
        : localizeSheet('SDR5E.Wizard.LevelUp.InsufficientXP')
          .replace('{max}', xpProgress.nextThreshold.toLocaleString())
          .replace('{current}', xpVal.toLocaleString());

    return {
      ...context,
      ...this.document,
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      systemData: sd,
      _grappleButton: localizeSheet('SDR5E.Grapple.Grapple'),
      _shoveButton: localizeSheet('SDR5E.Shove.Shove'),
      _abilities,
      _saves,
      _skills,
      _inventory,
      _features,
      _featureGroups,
      _classResource: {
        value: res.primary?.value ?? 0,
        max: res.primary?.max ?? 0,
        label: res.primary?.label || 'Resource',
        reset: res.primary?.reset || 'long',
        pct: res.primary?.max ? Math.max(0, Math.min(100, Math.round(((res.primary.value ?? 0) / res.primary.max) * 100))) : 0,
      },
      _spellsByLevel,
      _pactMagic: {
        active: (Number(res.pactMagic?.max) || 0) > 0,
        value: Number(res.pactMagic?.value) || 0,
        max: Number(res.pactMagic?.max) || 0,
        spellLevel: Number(res.pactMagic?.spellLevel) || 0,
        needsReview: !!res.pactMagic?.needsReview,
      },
      _spellcasting,
      ...effectsData,
      _prof: fmtMod(attrs.prof?.value ?? 2),
      _profValue: attrs.prof?.value ?? 2,
      _ac: attrs.da?.value ?? 10,
      _acBase: attrs.da?.base ?? 10,
      _showUnarmoredDefenseChoice: unarmoredDefenseChoices.length > 1,
      _unarmoredDefenseChoices: unarmoredDefenseChoices,
      _unarmoredDefenseLabel: localizeSheet('SDR5E.ClassFeatures.UnarmoredDefenseChoice'),
      _initiative: fmtMod(attrs.initiative?.total ?? 0),
      _speed: `${attrs.movement?.effective?.walk ?? attrs.movement?.walk ?? 9} m`,
      _movement: (() => {
        const mv = attrs.movement || { walk: 9, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false };
        const eff = mv.effective || mv;
        const base = mv;
        const others = [];
        for (const mode of ['fly', 'swim', 'climb', 'burrow']) {
          if (eff[mode] > 0) {
            const title = eff[mode] !== base[mode] ? `Base ${base[mode]} m` : '';
            others.push({ mode, label: mode.charAt(0).toUpperCase() + mode.slice(1), value: `${eff[mode]} m`, title });
          }
        }
        const walkTitle = eff.walk !== base.walk ? `Base ${base.walk} m` : '';
        return { walk: `${eff.walk ?? 9} m`, walkTitle, others, hover: !!eff.hover };
      })(),
      _health: { value: res.health?.value ?? 0, max: healthMax, effectiveMax, pct: healthPct, temp: res.health?.temp ?? 0 },
      _hitDice: { ...hitDice, pct: hitDicePct },
      _carrying,
      _currency: {
        pp: details.pp?.value ?? 0, gp: details.gp?.value ?? 0, ep: details.ep?.value ?? 0,
        sp: details.sp?.value ?? 0, cp: details.cp?.value ?? 0,
      },
      _inspiration: !!res.inspiration,
      _concentrating: !!res.concentrating,
      _exhaustionLevels,
      _exhaustionLeft,
      _exhaustionRight,
      _deathSaves,
      _showDeathSaves: (res.health?.value ?? 0) <= 0,
      _deathState: res.deathState || 'alive',
      _level: details.level ?? 1,
      _classLabel: _classLabel,
      _xp,
      _canLevelUp: levelUpEligibility.allowed,
      _levelUpTitle,
      _background: details.background || '',
      _biography: details.biography || '',
      _bio: {
        alignment: details.alignment || '', eyes: details.eyes || '', height: details.height || '',
        faith: details.deity || '', hair: details.hair || '', weight: details.weight || '',
        gender: details.gender || '', skin: details.skin || '', age: details.age || '',
        personalityTraits: details.personalityTraits || '', ideals: details.ideals || '',
        bonds: details.bonds || '', flaws: details.flaws || '', appearance: details.appearance || '',
      },
      _traits: sd.traits || { di: [], dr: [], dv: [], ci: [] },
      _damageTraits: ['di', 'dr', 'dv'].map((cat) => ({
        cat,
        label: cat === 'di' ? 'Immune' : cat === 'dr' ? 'Resistant' : 'Vulnerable',
        types: DAMAGE_TYPES.map((t) => ({
          type: t, label: DAMAGE_TYPE_LABELS[t],
          active: (sd.traits?.[cat] || []).includes(t),
        })),
      })),
      _proficiencies: sd.proficiencies || { weapons: [], armor: [], tools: [] },
      _weaponCategories: WEAPON_CATEGORY_CODES.map((code) => ({
        code, label: WEAPON_CATEGORY_LABELS[code],
        active: (sd.proficiencies?.weapons || []).includes(code),
      })),
      _namedWeaponProfs: (sd.proficiencies?.weapons || []).filter((w) => !WEAPON_CATEGORY_CODES.includes(w)),
      _senses: [...((() => { const se = attrs.senses || {}; const eff = se.effective || se; const l=[]; for(const s of ['darkvision','blindsight','tremorsense','truesight']) if(eff[s]>0) l.push(`${s.charAt(0).toUpperCase()+s.slice(1)} ${eff[s]} m`); return l; })()), ...(details.senses?.value || [])],
      _sensesRaw: details.senses?.value || [],
      _identity,
      _multiclassQualifies: multiclassQualifies,
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
    };
  }

  // Lock/edit mode: 'Jogo' (locked) turns every field into plain text; 'Edição' (default) shows the editing controls.
  _applyEditMode() {
    const root = this.element;
    if (!root) return;
    if (this._editMode === undefined) this._editMode = false;
    root.querySelector('.sdrn-root')?.classList.toggle('is-editing', this._editMode);
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

  async onAction(action, id, target) {
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
    // The portrait opens the engine's layered art editor instead of the plain file picker.
    if (action === 'pick-portrait') {
      if (this.document?.id) window.Loom?.openPortraitEditor?.(this.document.id);
      return;
    }
    if (action === 'toggle-edit-mode') {
      this._editMode = !this._editMode;
      this._applyEditMode();
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
      const tab = target.dataset.tab;
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

    if (action === 'roll-initiative') {
      void this._rollInitiative();
      return;
    }

    if (action === 'toggle-save-prof') {
      void this._toggleProficiency('saves', target.dataset.key);
      return;
    }

    if (action === 'toggle-skill-prof') {
      void this._toggleProficiency('skills', target.dataset.key);
      return;
    }

    if (action === 'toggle-equip') {
      void this._toggleEquip(id);
      return;
    }

    if (action === 'toggle-attune') {
      void this._toggleAttune(id);
      return;
    }

    if (action === 'toggle-prepared') {
      void this._togglePrepared(id);
      return;
    }

    if (action === 'cast-spell') {
      void this._castSpell(id);
      return;
    }
    if (action === 'cast-ritual') {
      void this._castRitual(id);
      return;
    }

    if (action === 'roll-spell-attack') {
      void this._rollSpell(id, 'attack');
      return;
    }

    if (action === 'roll-spell-damage') {
      void this._rollSpell(id, 'damage');
      return;
    }

    if (action === 'roll-attack') {
      void this._rollWeapon(id, 'attack');
      return;
    }

    if (action === 'roll-damage') {
      void this._rollWeapon(id, 'damage');
      return;
    }

    if (action === 'unarmed-attack') {
      void rollUnarmedStrike(this.document);
      return;
    }

    if (action === 'unarmed-grapple') {
      void rollUnarmedGrapple(this.document).catch((error) => {
        console.error('[srd5e] Unarmed Grapple failed:', error);
        showToast(localizeSheet('SDR5E.Grapple.FlowFailed'), 'error');
      });
      return;
    }

    if (action === 'unarmed-shove') {
      void rollUnarmedShove(this.document).catch((error) => {
        console.error('[srd5e] Unarmed Shove failed:', error);
        showToast(localizeSheet('SDR5E.Shove.FlowFailed'), 'error');
      });
      return;
    }

    if (action === 'unarmed-damage') {
      void rollUnarmedDamage(this.document);
      return;
    }

    if (action === 'open-item') {
      void this._openItem(id);
      return;
    }

    if (action === 'pick-item-icon') {
      void this._pickItemIcon(id);
      return;
    }

    if (action === 'post-item-chat') {
      void this._postItemChat(id);
      return;
    }

    if (action === 'activate-feature') {
      void this._activateFeature(id);
      return;
    }
    if (action === 'extend-rage') {
      void this._extendRage(id);
      return;
    }

    if (action === 'use-consumable') {
      const item = (this.document.items || []).find((i) => i.id === id);
      if (item) void useConsumable(this.document, item).then(() => this._reloadDocument());
      return;
    }

    if (action === 'use-healers-kit') {
      const item = (this.document.items || []).find((i) => i.id === id);
      if (item) void useHealersKit(this.document, item)
        .then((result) => { if (result) return this._reloadDocument(); })
        .catch(() => window.Loom?.showToast?.(localizeSheet('SDR5E.ItemUse.HealersKitSaveFailed'), 'warning'));
      return;
    }

    if (action === 'roll-tool') {
      const item = (this.document.items || []).find((i) => i.id === id);
      if (item) void rollToolCheck(this.document, item);
      return;
    }

    if (action === 'toggle-tool-prof') {
      void this._toggleToolProf(id);
      return;
    }

    if (action === 'add-class-resource') {
      void this._addClassResource();
      return;
    }

    if (action === 'delete-item') {
      void this._deleteItem(id);
      return;
    }

    if (action === 'toggle-container') {
      if (this._openContainers.has(id)) this._openContainers.delete(id);
      else this._openContainers.add(id);
      void this.render();
      return;
    }

    if (action === 'move-to-container') {
      void this._moveToContainer(id);
      return;
    }

    if (action === 'create-item') {
      void this._createItem(target.dataset.itemType);
      return;
    }

    if (action === 'delete-effect') {
      void this._deleteEffect(id);
      return;
    }

    if (action === 'toggle-inspiration') {
      void toggleInspiration(this.document).then(() => this._reloadDocument());
      return;
    }

    if (action === 'spend-hit-die') {
      void spendHitDie(this.document).then(() => this._reloadDocument());
      return;
    }

    if (action === 'toggle-weapon-prof') {
      void this._toggleWeaponProficiency(target.dataset.code);
      return;
    }

    if (action === 'toggle-damage-trait') {
      void this._toggleDamageTrait(target.dataset.cat, target.dataset.type);
      return;
    }

    if (action === 'toggle-concentration') {
      void this._toggleConcentration();
      return;
    }

    if (action === 'set-exhaustion') {
      void setExhaustion(this.document, target.dataset.level).then(() => this._reloadDocument());
      return;
    }

    if (action === 'roll-death-save') {
      void rollDeathSave(this.document).then(() => this._reloadDocument());
      return;
    }

    if (action === 'level-up-wizard') {
      void this._openLevelUpWizard();
      return;
    }

    if (action === 'short-rest') {
      void this._takeRest('short');
      return;
    }

    if (action === 'long-rest') {
      void this._takeRest('long');
      return;
    }

    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _rollAbility(key, mode) {
    if (!key || !this.document) return;
    const sd = this.document.systemData;
    if (mode === 'save') {
      // Poisoned is explicitly attack rolls/ability checks only, not saves (SRD 5.1).
      const conditions = await getActorConditions(this.document.id);
      const exhaustionLevel = sd.resources?.exhaustion ?? 0;
      const armorPenalty = !!sd.attributes?.armor?.penalty;
      const { autoFail, advantage: featureAdvantage, disadvantage } = getSaveConditionOutcome(key, conditions, exhaustionLevel, armorPenalty, {
        dangerSense: hasDangerSense(this.document.items),
        items: this.document.items,
      });
      if (autoFail) {
        await window.Loom.ChatMessage.create({
          speaker: window.Loom.ChatMessage.getSpeaker({ actor: this.document }),
          content: `Save: ${ABILITY_LABELS[key]} — automatic failure`,
          flags: { srd5e: { name: `${this.document.name} — Save: ${ABILITY_LABELS[key]}`, description: '<span style="color:#ef4444">Automatic failure (condition)</span>' } },
        });
        return;
      }
      const save = sd.saves?.[key];
      const kb = currentAdvantageMode();
      // Same cancel-out rule as attacks/ability checks: count sources, don't
      // just override the keyboard state (a Shift-held advantage should
      // still cancel a forced disadvantage per SRD, not lose to it blindly).
      const advantageSources = (kb === 1 ? 1 : 0) + (featureAdvantage ? 1 : 0);
      const disadvantageSources = (kb === -1 ? 1 : 0) + (disadvantage ? 1 : 0);
      const advantage = resolveAdvantageSources(advantageSources, disadvantageSources);
      const coverBonus = await getSaveCoverBonus(key, conditions);
      if (coverBonus === null) return;
      await sdr5eRoll({ label: `Save: ${ABILITY_LABELS[key]}`, parts: [{ label: 'Modifier', value: (save?.total ?? 0) + coverBonus }], actor: this.document, advantage,
        extraMeta: { srd5eAbilityKey: key, ...(key === 'str' && hasIndomitableMight(this.document.items) ? { srd5eIndomitableMightScore: sd.abilities?.str?.value } : {}) } });
    } else {
      const conditions = await getActorConditions(this.document.id);
      const armorPenalty = (key === 'str' || key === 'dex') && !!sd.attributes?.armor?.penalty;
      const advantage = applyAbilityCheckConditionModifiers(currentAdvantageMode(), conditions, sd.resources?.exhaustion ?? 0, armorPenalty,
        rageStrengthAdvantage(this.document.items, key));
      const abl = sd.abilities?.[key];
      await sdr5eRoll({ label: `Ability Check: ${ABILITY_LABELS[key]}`, parts: [{ label: 'Modifier', value: abl?.modifier ?? 0 }], actor: this.document, advantage,
        extraMeta: { srd5eAbilityKey: key, ...(key === 'str' && hasIndomitableMight(this.document.items) ? { srd5eIndomitableMightScore: sd.abilities?.str?.value } : {}) } });
    }
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
      showToast(localizeSheet(result.reason === 'speed-unavailable' ? 'SDR5E.MovementLedger.SpeedUnavailable' : result.reason === 'movement-exceeded' ? 'SDR5E.MovementLedger.Exceeded' : 'SDR5E.MovementLedger.InvalidSegment'), 'warning');
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
      showToast(localizeSheet('SDR5E.MovementLedger.SaveFailed'), 'error');
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
      showToast(localizeSheet(result.reason === 'speed-unavailable' ? 'SDR5E.MovementLedger.SpeedUnavailable' : 'SDR5E.MovementLedger.InvalidDash'), 'warning');
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
      showToast(localizeSheet(`SDR5E.Influence.${key}Required`), 'warning');
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
        showToast(localizeSheet('SDR5E.Influence.PostFailed'), 'error');
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
      showToast(localizeSheet(result.reason === 'proficiency-unavailable' ? 'SDR5E.HelpAction.UnavailableProficiency' : 'SDR5E.HelpAction.InvalidTarget'), 'warning');
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
      showToast(localizeSheet('SDR5E.HelpAction.SaveFailed'), 'error');
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
      showToast(localizeSheet(key), 'warning');
      return;
    }
    const current = this.document?.systemData?.srd5eReadyRecords || [];
    if (current.length) {
      showToast(localizeSheet('SDR5E.ReadyAction.AlreadyRecorded'), 'warning');
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
      showToast(localizeSheet('SDR5E.ReadyAction.SaveFailed'), 'error');
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
      showToast(localizeSheet('SDR5E.DodgeAction.SaveFailed'), 'error');
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
      showToast(localizeSheet('SDR5E.CoreActions.SkillUnavailable'), 'warning');
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

  async _rollInitiative() {
    if (!this.document) return;
    const bonus = this.document.systemData?.attributes?.initiative?.total ?? 0;
    const conditions = await getActorConditions(this.document.id);
    const advantage = initiativeBaseSources(conditions, hasFeralInstinct(this.document.items));
    await sdr5eRoll({ label: `${this.document.name} rolls Initiative!`, parts: [{ label: 'Initiative', value: bonus }], actor: this.document, advantage, initiative: true });
  }

  async _rollSkill(key) {
    if (!key || !this.document) return;
    const sd = this.document.systemData;
    const skill = sd?.skills?.[key];
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
    const checkAbility = primalKnowledgeAbility(this.document.items, key) || skill?.ability;
    const armorPenalty = (checkAbility === 'str' || checkAbility === 'dex') && !!sd?.attributes?.armor?.penalty;
    const advantage = applyAbilityCheckConditionModifiers(currentAdvantageMode(), conditions, sd?.resources?.exhaustion ?? 0, armorPenalty,
      checkAbility === 'str' ? rageStrengthAdvantage(this.document.items, 'str') : 0);
    const originalAbilityModifier = Number(sd?.abilities?.[skill?.ability]?.modifier) || 0;
    const checkAbilityModifier = Number(sd?.abilities?.[checkAbility]?.modifier) || 0;
    const modifier = Number(skill?.total || 0) - originalAbilityModifier + checkAbilityModifier
      + druidMagicianCheckBonus(this.document.items, key, sd?.abilities?.wis?.modifier);
    await sdr5eRoll({ label: `Skill Check: ${SKILL_LABELS[key] || key}`, parts: [{ label: 'Modifier', value: modifier }], actor: this.document, advantage });
  }

  async _toggleProficiency(group, key) {
    if (!key || !this.document) return;
    const sd = this.document.systemData;
    const entry = sd?.[group]?.[key];
    if (!entry) return;
    setPathValue(sd, `${group}.${key}.proficient`, !entry.proficient);
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: sd });
    await this._reloadDocument();
  }

  async _toggleEquip(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const current = item.system?.equipped ?? item.data?.equipped ?? false;
    const data = { ...(item.system || item.data || {}), equipped: !current };
    await api.put(`/items/${itemId}`, { data });
    await this._reloadDocument();
  }

  async _openLevelUpWizard() {
    const classItems = (this.document?.items || []).filter((i) => i.type === 'class');
    if (classItems.length === 0) {
      showToast?.('Add a Class item to this character first.', 'warning');
      return;
    }
    const { Sdr5eLevelUpWizard } = await import('./level-up-wizard.mjs');
    const actorId = this.document.id;
    windowManager.open(`sdr5e-levelup-${actorId}`, Sdr5eLevelUpWizard, { actorId });
  }

  async _openItem(itemId) {
    if (!itemId) return;
    windowManager.open(`item-sheet-${itemId}`, Sdr5eItemSheet, { itemId });
  }

  async _pickItemIcon(itemId) {
    if (!itemId) return;
    const item = (this.document?.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const FilePicker = window.Loom?.applications?.apps?.FilePicker?.implementation;
    if (!FilePicker) return;
    const current = item.imgUrl || item.img || item.avatarUrl || '';
    const path = await new FilePicker({ type: 'image', current }).browse();
    if (!path) return;
    await api.put(`/items/${itemId}`, { imgUrl: path });
    await this._reloadDocument();
  }

  async _postItemChat(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    await postItemToChat(this.document, item);
  }

  async _activateFeature(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const idata = item.system || item.data || {};
    if (idata.identifier === 'rage' && idata.classIdentifier === 'barbarian') {
      await toggleRage(this.document, item);
      await this._reloadDocument();
      return;
    }
    await activateFeature(this.document, item);
    await this._reloadDocument();
  }

  async _extendRage(itemId) {
    const item = (this.document?.items || []).find((entry) => entry.id === itemId);
    if (!item) return;
    await extendRage(this.document, item);
    await this._reloadDocument();
  }

  async _promptArcaneRecovery(actor) {
    const wizard = actor.items?.find((entry) => entry.type === 'class'
      && (entry.system || entry.data || {}).classIdentifier === 'wizard');
    const wizardLevel = Number((wizard?.system || wizard?.data || {}).levels) || 0;
    const slots = actor.systemData?.resources?.spellSlots || {};
    if (!wizardLevel || actor.flags?.sdr5e?.arcaneRecoveryUsed) return null;
    const budget = Math.ceil(wizardLevel / 2);
    const dialog = document.createElement('div');
    dialog.className = 'sdrn-rest-dialog';
    dialog.innerHTML = `<p>${localizeSheet('SDR5E.ClassFeatures.ArcaneRecoveryBudget').replace('{budget}', String(budget))}</p>`;
    const selects = [];
    for (let level = 1; level <= 5; level += 1) {
      const slot = slots[level] || slots[String(level)];
      const missing = Math.max(0, (Number(slot?.max) || 0) - (Number(slot?.value) || 0));
      if (!missing) continue;
      const label = document.createElement('label');
      label.textContent = `${localizeSheet('SDR5E.ClassFeatures.ArcaneRecoverySlot')} ${level}`;
      const select = document.createElement('select');
      select.className = 'sdrn-rest-hd-input';
      for (let count = 0; count <= Math.min(missing, Math.floor(budget / level)); count += 1) {
        const option = document.createElement('option');
        option.value = String(count);
        option.textContent = String(count);
        select.append(option);
      }
      label.append(select);
      dialog.append(label);
      selects.push([level, select]);
    }
    if (!selects.length) {
      return null;
    }
    const selected = await LoomDialog.wait({
      window: { title: localizeSheet('SDR5E.ClassFeatures.ArcaneRecovery') }, content: dialog, width: 360,
      buttons: [
        { action: 'cancel', label: localizeSheet('SDR5E.Spellcasting.Cancel'), variant: 'ghost', callback: () => null },
        { action: 'confirm', label: localizeSheet('SDR5E.ClassFeatures.RecoverSlots'), variant: 'primary', callback: () => Object.fromEntries(selects.map(([level, select]) => [level, Number(select.value)])) },
      ],
    });
    if (!selected) return null;
    const result = resolveArcaneRecovery({ wizardLevel, spellSlots: slots, selected });
    if (!result.valid) {
      showToast?.(localizeSheet('SDR5E.ClassFeatures.ArcaneRecoveryInvalid'), 'warning');
      return null;
    }
    return selected;
  }

  async _promptWizardMemorizeSpell(actor) {
    const wizard = actor.items?.find((entry) => entry.type === 'class'
      && (entry.system || entry.data || {}).classIdentifier === 'wizard');
    const wizardLevel = Number((wizard?.system || wizard?.data || {}).levels) || 0;
    if (wizardLevel < 5) return null;
    const book = (actor.items || []).filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
      && (item.system || item.data || {}).wizardSpellbook === true
      && Number((item.system || item.data || {}).spellLevel) >= 1
      && Number((item.system || item.data || {}).spellLevel) <= (classSpellcastingAtLevel('wizard', wizardLevel)?.maximumSpellLevel || 0));
    const prepared = book.filter((item) => (item.system || item.data || {}).prepared);
    const unprepared = book.filter((item) => !(item.system || item.data || {}).prepared);
    if (!prepared.length || !unprepared.length) return null;
    const dialog = document.createElement('div');
    dialog.className = 'sdrn-rest-dialog';
    dialog.append(document.createTextNode(localizeSheet('SDR5E.ClassFeatures.MemorizeSpellHow')));
    const makeSelect = (labelText, items) => {
      const label = document.createElement('label');
      label.textContent = labelText;
      const select = document.createElement('select');
      select.className = 'sdrn-rest-hd-input';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '—';
      select.append(empty);
      for (const item of items) {
        const data = item.system || item.data || {};
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.name} (${localizeSheet('SDR5E.Spellcasting.SlotLevel')} ${data.spellLevel})`;
        select.append(option);
      }
      label.append(select);
      dialog.append(label);
      return select;
    };
    const replaceSelect = makeSelect(localizeSheet('SDR5E.ClassFeatures.MemorizeSpellReplace'), prepared);
    const replacementSelect = makeSelect(localizeSheet('SDR5E.ClassFeatures.MemorizeSpellWith'), unprepared);
    const selection = await LoomDialog.wait({
      window: { title: localizeSheet('SDR5E.ClassFeatures.MemorizeSpell') }, content: dialog, width: 380,
      buttons: [
        { action: 'cancel', label: localizeSheet('SDR5E.Spellcasting.Cancel'), variant: 'ghost', callback: () => null },
        { action: 'confirm', label: localizeSheet('SDR5E.ClassFeatures.MemorizeSpell'), variant: 'primary', callback: () => ({ replaceId: replaceSelect.value, replacementId: replacementSelect.value }) },
      ],
    });
    if (!selection?.replaceId || !selection?.replacementId) return null;
    const result = resolveWizardMemorizeSpellChoice(wizardLevel, book, selection.replaceId, selection.replacementId);
    if (!result.valid) {
      showToast?.(localizeSheet('SDR5E.ClassFeatures.MemorizeSpellInvalid'), 'warning');
      return null;
    }
    return result;
  }

  async _promptWizardSpellMasteryReplacement(actor) {
    const wizard = actor.items?.find((item) => item.type === 'class'
      && (item.system || item.data || {}).classIdentifier === 'wizard');
    const wizardLevel = Number((wizard?.system || wizard?.data || {}).levels) || 0;
    const feature = wizardLevel >= 18 ? actor.items?.find((item) => item.type === 'feature'
      && (item.system || item.data || {}).classIdentifier === 'wizard'
      && (item.system || item.data || {}).identifier === 'spell-mastery') : null;
    const featureData = feature?.system || feature?.data || {};
    if (!feature?.id || !featureData.levelOneSpellId || !featureData.levelTwoSpellId) return null;
    const book = (actor.items || []).filter((item) => item.type === 'spell'
      && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
      && (item.system || item.data || {}).wizardSpellbook === true);
    const current = [featureData.levelOneSpellId, featureData.levelTwoSpellId]
      .map((id) => book.find((item) => String(item.id) === String(id))).filter(Boolean);
    const eligible = (item) => /^1 action$/i.test(String((item.system || item.data || {}).castingTime || '').trim());
    if (current.length !== 2 || !current.every(eligible)) return null;
    const dialog = document.createElement('div');
    dialog.className = 'sdrn-rest-dialog';
    dialog.append(document.createTextNode(localizeSheet('SDR5E.ClassFeatures.SpellMasteryReplacePrompt')));
    const makeSelect = (labelText, items, optionLabel) => {
      const label = document.createElement('label');
      label.textContent = labelText;
      const select = document.createElement('select');
      select.className = 'sdrn-rest-hd-input';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '—';
      select.append(empty);
      for (const item of items) {
        const data = item.system || item.data || {};
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.name} (${localizeSheet('SDR5E.Spellcasting.SlotLevel')} ${data.spellLevel})`;
        select.append(option);
      }
      label.append(select);
      dialog.append(label);
      return select;
    };
    const currentSelect = makeSelect(localizeSheet('SDR5E.ClassFeatures.SpellMasteryReplaceCurrent'), current);
    const replacementSelect = makeSelect(localizeSheet('SDR5E.ClassFeatures.SpellMasteryReplaceWith'), book.filter((item) => eligible(item)));
    const choice = await LoomDialog.wait({
      window: { title: localizeSheet('SDR5E.ClassFeatures.SpellMastery') }, content: dialog, width: 380,
      buttons: [
        { action: 'cancel', label: localizeSheet('SDR5E.Spellcasting.Cancel'), variant: 'ghost', callback: () => null },
        { action: 'confirm', label: localizeSheet('SDR5E.ClassFeatures.SpellMastery'), variant: 'primary', callback: () => ({ currentSpellId: currentSelect.value, replacementSpellId: replacementSelect.value }) },
      ],
    });
    if (!choice?.currentSpellId || !choice?.replacementSpellId) return null;
    const result = resolveWizardSpellMasteryReplacement(wizardLevel, book, choice.currentSpellId, choice.replacementSpellId);
    if (!result.valid) {
      showToast?.(localizeSheet('SDR5E.ClassFeatures.SpellMasteryReplaceInvalid'), 'warning');
      return null;
    }
    return { ...result, featureId: feature.id, featureData };
  }

  async _addClassResource() {
    if (!this.document) return;
    const sd = this.document.systemData;
    setPathValue(sd, 'resources.primary', { value: 1, max: 1, label: 'Resource', reset: 'long' });
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: sd });
    await this._reloadDocument();
  }

  async _deleteItem(itemId) {
    if (!itemId) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (item?.type === 'container') {
      const children = getContents(this.document.items, itemId);
      for (const ch of children) {
        const cdata = ch.system || ch.data || {};
        await api.put(`/items/${ch.id}`, { data: { ...cdata, container: '' } });
      }
    }
    await api.delete(`/items/${itemId}`);
    await this._reloadDocument();
  }

  async _moveToContainer(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const currentContainer = (item.system || item.data || {}).container || '';
    const containers = (this.document.items || []).filter((it) => it.type === 'container' && it.id !== itemId && !isDescendant(this.document.items, itemId, it.id));
    const containerEl = document.createElement('div');
    containerEl.className = 'sdrn-move-dialog';
    const optionsHtml = ['<option value=\"\">Inventory (root)</option>'].concat(containers.map((c) => `<option value=\"${c.id}\" ${c.id===currentContainer?'selected':''}>${c.name}</option>`)).join('');
    containerEl.innerHTML = `<label>Move <strong>${item.name}</strong> to:</label><select class=\"sdrn-move-select\">${optionsHtml}</select>`;
    const sel = containerEl.querySelector('.sdrn-move-select');
    const chosen = await LoomDialog.wait({
      window: { title: 'Move to Container' },
      content: containerEl,
      width: 360,
      buttons: [{ action: 'confirm', label: 'Move', variant: 'primary', callback: () => sel?.value ?? '' }],
    });
    if (chosen === null || chosen === undefined) return;
    const newContainer = String(chosen);
    if (newContainer === currentContainer) return;
    // Capacity check (warn but allow)
    if (newContainer) {
      const target = containers.find((c) => c.id === newContainer);
      const tdata = target ? (target.system || target.data || {}) : null;
      if (tdata?.capacity?.value > 0) {
        const load = containerLoad(this.document.items, newContainer);
        const itemWeight = Number((item.system || item.data || {}).weight) || 0;
        const itemQty = Number((item.system || item.data || {}).quantity) || 1;
        const over = tdata.capacity.type === 'weight' ? (load.weight + itemWeight * itemQty > tdata.capacity.value) : (load.count + itemQty > tdata.capacity.value);
        if (over) window.Loom?.showToast?.('Container over capacity!', 'warning');
      }
    }
    const idata = item.system || item.data || {};
    await api.put(`/items/${itemId}`, { data: { ...idata, container: newContainer } });
    await this._reloadDocument();
  }

  async _createItem(type) {
    if (!type || !this.document) return;
    const singular = ITEM_TYPE_SINGULAR[type] || type;
    await api.post('/items', {
      worldId: window.Loom?.world?.id,
      name: `New ${singular}`,
      type,
      data: getDefaultData(type),
      actorId: this.document.id,
    });
    await this._reloadDocument();
  }

  async _deleteEffect(effectId) {
    if (!effectId) return;
    await effects.delete(effectId);
    await this._reloadDocument();
  }

  // Prompts how many Hit Dice (0..max) to spend, capped by what's left.
  async _promptHitDiceToSpend(max) {
    if (max <= 0) return 0;
    const container = document.createElement('div');
    container.className = 'sdrn-rest-dialog';
    container.innerHTML = `
      <label>Hit Dice to spend (0-${max})</label>
      <input type="number" class="sdrn-rest-hd-input" min="0" max="${max}" value="0" />
    `;
    const input = container.querySelector('.sdrn-rest-hd-input');
    const result = await LoomDialog.wait({
      window: { title: 'Short Rest — Spend Hit Dice' },
      content: container,
      width: 320,
      buttons: [
        { action: 'confirm', label: 'Rest', variant: 'primary', callback: () => Math.max(0, Math.min(max, Number(input?.value) || 0)) },
      ],
    });
    return result ?? 0;
  }

  async _promptHitDiePool(pools) {
    if (!pools?.length) return '';
    const select = document.createElement('select');
    select.className = 'sdrn-rest-hd-input';
    for (const pool of pools) {
      const option = document.createElement('option');
      option.value = pool.id;
      option.textContent = `${pool.die} (${pool.value}/${pool.max})`;
      select.append(option);
    }
    const result = await LoomDialog.wait({
      window: { title: 'Choose Hit Die' },
      content: select,
      width: 320,
      buttons: [
        { action: 'cancel', label: 'Cancel', variant: 'ghost', callback: () => null },
        { action: 'confirm', label: 'Spend', variant: 'primary', callback: () => select.value },
      ],
    });
    return result || '';
  }

  static async promptPreparedSpells(actor) {
    const classItems = (actor.items || []).filter((item) => item.type === 'class');
    const container = document.createElement('div');
    const preparedClasses = classItems.map((item) => {
      const data = item.system || item.data || {};
      const subclass = (actor.items || []).find((entry) => entry.type === 'subclass'
        && (entry.system || entry.data || {}).classIdentifier === data.classIdentifier);
      return { item, data: { ...data, subclassName: data.subclassName || subclass?.name || '' } };
    })
      .filter(({ data }) => ['cleric', 'druid', 'paladin', 'ranger', 'wizard'].includes(data.classIdentifier));
    if (!preparedClasses.length) return null;
    let compendium = [];
    if (preparedClasses.some(({ data }) => data.classIdentifier !== 'wizard')) {
      try { compendium = await searchCompendiumEntries('spell', '', true); }
      catch { showToast?.(localizeSheet('SDR5E.Spellcasting.PreparedListLoadFailed'), 'error'); return null; }
    }
    const groups = [];
    for (const { data: classData } of preparedClasses) {
      const classIdentifier = classData.classIdentifier;
      const progression = classSpellcastingAtLevel(classIdentifier, classData.levels);
      if (!progression) continue;
      const wizardSpellbookItems = classIdentifier === 'wizard' ? (actor.items || []).filter((item) => item.type === 'spell'
        && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
        && (item.system || item.data || {}).wizardSpellbook === true
        && Number((item.system || item.data || {}).spellLevel) > 0) : [];
      const owned = (actor.items || []).filter((item) => item.type === 'spell'
        && (item.system || item.data || {}).sourceClassIdentifier === classIdentifier
        && (classIdentifier !== 'wizard' || (item.system || item.data || {}).wizardSpellbook === true)
        && !(item.system || item.data || {}).magicInitiate
        && !(item.system || item.data || {}).alwaysPrepared
        && Number((item.system || item.data || {}).spellLevel) > 0);
      const currentPrepared = owned.filter((item) => (item.system || item.data || {}).prepared);
      const alwaysPreparedNames = new Set((actor.items || []).filter((item) => item.type === 'spell')
        .map((item) => ({ name: item.name, data: item.system || item.data || {} }))
        .filter(({ data }) => data.sourceClassIdentifier === classIdentifier && data.alwaysPrepared)
        .map(({ name }) => String(name).toLocaleLowerCase()));
      const wizardCantrips = classIdentifier === 'wizard' ? (actor.items || []).filter((item) => item.type === 'spell'
        && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
        && Number((item.system || item.data || {}).spellLevel) === 0) : [];
      const wizardState = classIdentifier === 'wizard'
        ? inspectWizardSpellbookState(classData.levels, wizardSpellbookItems, wizardCantrips) : { valid: true };
      if (!wizardState.valid || currentPrepared.length !== progression.prepared
        || owned.some((item) => !(item.system || item.data || {}).classes?.includes(classIdentifier))) {
        showToast?.(localizeSheet('SDR5E.Spellcasting.PreparedListNeedsReview'), 'warning');
        return null;
      }
      const ownedByName = new Map(owned.map((item) => [String(item.name).toLocaleLowerCase(), item]));
      const candidatesByName = new Map();
      const addCandidate = (entry, isActorItem) => {
        const data = isActorItem ? (entry.system || entry.data || {}) : (entry.data || {});
        const normalized = String(entry.name).toLocaleLowerCase();
        candidatesByName.set(normalized, isActorItem
          ? { id: entry.id, name: entry.name, data, actorItem: true }
          : { id: entry.id, name: entry.name, data, actorItem: false });
      };
      if (classIdentifier === 'wizard') {
        for (const item of owned) {
          const data = item.system || item.data || {};
          if (data.classes?.includes('wizard') && Number(data.spellLevel) <= progression.maximumSpellLevel) addCandidate(item, true);
        }
      } else {
        for (const entry of compendium) {
          const data = entry.data || {};
          if (!data.classes?.includes(classIdentifier) || Number(data.spellLevel) < 1
            || Number(data.spellLevel) > progression.maximumSpellLevel) continue;
          if (alwaysPreparedNames.has(String(entry.name).toLocaleLowerCase())) continue;
          const ownedItem = ownedByName.get(String(entry.name).toLocaleLowerCase());
          addCandidate(ownedItem || entry, !!ownedItem);
        }
      }
      for (const item of owned) if (!candidatesByName.has(String(item.name).toLocaleLowerCase())) addCandidate(item, true);
      const candidates = [...candidatesByName.values()].sort((a, b) => a.name.localeCompare(b.name));
      const group = { classIdentifier, candidates, currentPrepared, progression, inputs: [],
        ...(classIdentifier === 'druid' && String(classData.subclassName).toLocaleLowerCase() === 'circle of the land'
          ? { circleLandCandidates: compendium } : {}),
      };
      groups.push(group);
      const section = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = `${classIdentifier} — ${classData.levels}`;
      section.append(legend);
      const hint = document.createElement('p');
      const singleReplacement = ['paladin', 'ranger'].includes(classIdentifier);
      hint.textContent = singleReplacement
        ? localizeSheet('SDR5E.Spellcasting.PreparedSpellReplacementHint')
        : `${localizeSheet(classIdentifier === 'wizard' ? 'SDR5E.Spellcasting.WizardPreparedListHint' : 'SDR5E.Spellcasting.PreparedListHint')} ${progression.prepared}`;
      section.append(hint);
      if (group.circleLandCandidates) {
        const label = document.createElement('label');
        label.textContent = localizeSheet('SDR5E.Spellcasting.CircleLandChoice');
        const select = document.createElement('select');
        select.dataset.circleLandTerrain = 'true';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '—';
        select.append(blank);
        for (const terrain of ['arid', 'polar', 'temperate', 'tropical']) {
          const option = document.createElement('option');
          option.value = terrain;
          option.textContent = localizeSheet(`SDR5E.Spellcasting.CircleLand.${terrain}`);
          option.selected = classData.circleLandTerrain === terrain;
          select.append(option);
        }
        group.circleLandTerrainSelect = select;
        label.append(select);
        section.append(label);
      }
      if (singleReplacement) {
        const makeSelect = (labelText, entries) => {
          const label = document.createElement('label');
          label.textContent = labelText;
          const select = document.createElement('select');
          const blank = document.createElement('option');
          blank.value = '';
          blank.textContent = '—';
          select.append(blank);
          for (const entry of entries) {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = `${entry.name} (${localizeSheet('SDR5E.Spellcasting.SlotLevel')} ${entry.data.spellLevel})`;
            select.append(option);
          }
          label.append(select);
          section.append(label);
          return select;
        };
        group.replacementOut = makeSelect(localizeSheet('SDR5E.Spellcasting.PreparedSpellToReplace'), currentPrepared);
        group.replacementIn = makeSelect(localizeSheet('SDR5E.Spellcasting.ReplacementPreparedSpell'), candidates);
      } else {
        const list = document.createElement('div');
        for (const entry of candidates) {
          const label = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = entry.id;
          input.checked = !!entry.data.prepared;
          const name = document.createElement('span');
          name.textContent = `${entry.name} (${localizeSheet('SDR5E.Spellcasting.SlotLevel')} ${entry.data.spellLevel})`;
          label.append(input, name);
          list.append(label);
          group.inputs.push(input);
        }
        section.append(list);
        const updateAvailability = () => {
          const grantedNames = new Set(group.circleLandTerrainSelect
            ? circleLandAlwaysPreparedSpellNames(group.circleLandTerrainSelect.value, classData.levels)
              .map((grant) => String(grant.name).toLocaleLowerCase())
            : []);
          for (const input of group.inputs) {
            const entry = group.candidates.find((candidate) => candidate.id === input.value);
            const grantedByTerrain = grantedNames.has(String(entry?.name || '').toLocaleLowerCase());
            if (grantedByTerrain) input.checked = false;
          }
          const count = group.inputs.filter((input) => input.checked).length;
          for (const input of group.inputs) {
            const entry = group.candidates.find((candidate) => candidate.id === input.value);
            const grantedByTerrain = grantedNames.has(String(entry?.name || '').toLocaleLowerCase());
            input.disabled = grantedByTerrain || (!input.checked && count >= progression.prepared);
          }
        };
        for (const input of group.inputs) input.addEventListener('change', updateAvailability);
        group.circleLandTerrainSelect?.addEventListener('change', updateAvailability);
        updateAvailability();
      }
      container.append(section);
    }
    if (!groups.length) return null;
    const selectedIds = await LoomDialog.wait({
      window: { title: localizeSheet('SDR5E.Spellcasting.PreparedListTitle') },
      content: container,
      width: 520,
      buttons: [
        { action: 'cancel', label: localizeSheet('SDR5E.Spellcasting.Cancel'), variant: 'ghost', callback: () => null },
        { action: 'confirm', label: localizeSheet('SDR5E.Spellcasting.Confirm'), variant: 'primary', callback: () => groups.map((group) => ({
          classIdentifier: group.classIdentifier,
          candidates: group.candidates,
          ...(group.circleLandTerrainSelect ? {
            circleLandTerrain: group.circleLandTerrainSelect.value,
            circleLandCandidates: group.circleLandCandidates,
          } : {}),
          selectedIds: group.replacementOut
            ? group.currentPrepared.map((item) => item.id)
            : group.inputs.filter((input) => input.checked).map((input) => input.value),
          ...(group.replacementOut ? {
            currentPreparedIds: group.currentPrepared.map((item) => item.id),
            replaceId: group.replacementOut.value,
            replacementId: group.replacementIn.value,
          } : {}),
        })) },
      ],
    });
    if (selectedIds === null || selectedIds === undefined) return null;
    return selectedIds;
  }

  // Rest rules are PROVISIONAL (see the note at the top of schema.mjs — final
  // numbers come from the SRD the user is transposing). Short: spends 0..N
  // Hit Dice (reusing spendHitDie, which rolls+heals+persists each die one at
  // a time) then frees up resources with reset:'short'. Long: full HP, half
  // of total Hit Dice (SRD: "up to half your total number of them, round
  // down, minimum 1"), 'short'+'long' resources, resets the short-rest counter.
  async _promptWeaponMasteryReplacement(actor) {
    const proficiencies = actor.systemData?.proficiencies?.weapons || [];
    const offers = weaponMasteryRestCandidates(actor.items || [], proficiencies);
    if (!offers.length) return null;
    const content = document.createElement('div');
    const intro = document.createElement('p');
    intro.textContent = localizeSheet('SDR5E.ClassFeatures.WeaponMasteryRestHelp');
    content.append(intro);
    const controls = [];
    for (const offer of offers) {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = `${offer.className} — ${localizeSheet('SDR5E.ClassFeatures.WeaponMasteryName')}`;
      fieldset.append(legend);
      const selectControl = (labelText, options) => {
        const label = document.createElement('label');
        label.textContent = labelText;
        const select = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '—';
        select.append(blank);
        for (const weapon of options) {
          const option = document.createElement('option');
          option.value = weapon.identifier;
          option.textContent = `${weapon.name} — ${weapon.mastery}`;
          select.append(option);
        }
        label.append(select);
        fieldset.append(label);
        return select;
      };
      const current = offer.masteredOptions;
      controls.push({ offer, current: selectControl(localizeSheet('SDR5E.ClassFeatures.WeaponMasteryReplaceCurrent'), current),
        replacement: selectControl(localizeSheet('SDR5E.ClassFeatures.WeaponMasteryReplacement'), offer.options) });
      content.append(fieldset);
    }
    const selections = await LoomDialog.wait({
      window: { title: localizeSheet('SDR5E.ClassFeatures.WeaponMasteryRestTitle') },
      content,
      width: 520,
      buttons: [
        { action: 'cancel', label: localizeSheet('SDR5E.ClassFeatures.WeaponMasteryRestCancel'), variant: 'ghost', callback: () => null },
        { action: 'confirm', label: localizeSheet('SDR5E.ClassFeatures.WeaponMasteryRestConfirm'), variant: 'primary', callback: () =>
          controls.filter(({ current, replacement }) => current.value || replacement.value)
            .map(({ offer, current, replacement }) => ({ featureId: offer.featureId,
              replaceIdentifier: current.value, replacementIdentifier: replacement.value })) },
      ],
    });
    if (!Array.isArray(selections)) return null;
    const resolved = [];
    for (const selection of selections) {
      const offer = offers.find((candidate) => candidate.featureId === selection.featureId);
      const result = offer && resolveWeaponMasteryReplacement(offer.classIdentifier, offer.mastered,
        selection.replaceIdentifier, selection.replacementIdentifier, proficiencies);
      if (!result?.valid) {
        showToast?.(localizeSheet('SDR5E.ClassFeatures.WeaponMasteryInvalid'), 'warning');
        return [];
      }
      resolved.push({ ...selection, featureId: offer.featureId, choices: result.choices });
    }
    return resolved;
  }

  async _takeRest(kind) {
    if (!this.document) return;
    await takeRest(this.document, kind, {
      promptHitDice: (n) => this._promptHitDiceToSpend(n),
      promptHitDiePool: (pools) => this._promptHitDiePool(pools),
      promptPreparedSpells: (actor) => Sdr5eCharacterSheet.promptPreparedSpells(actor),
      promptArcaneRecovery: (actor) => this._promptArcaneRecovery(actor),
      promptWizardMemorizeSpell: (actor) => this._promptWizardMemorizeSpell(actor),
      promptWizardSpellMasteryReplacement: (actor) => this._promptWizardSpellMasteryReplacement(actor),
      promptWeaponMasteryReplacement: (actor) => this._promptWeaponMasteryReplacement(actor),
    });
    await this._reloadDocument();
  }
}
