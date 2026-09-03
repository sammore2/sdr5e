// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/actor-sheet.mjs
// Component Version: 0.1.0
//
// Native character sheet — dnd5e-inspired layout, own tab bar floating
// outside the window edge (same pattern as wod6e), grimdark/gold palette.
// `this.document` here is NEVER an instance of the actor document class —
// LoomDocumentSheet only borrows the `prepareData` prototype to run
// prepareDerivedData on a plain object (see document-sheet.ts:_runPrepareData).
// That's why rolls call sdr5eRoll()/applyHeal()/applyDamage() directly
// (module functions), never `this.document.rollAbilityTest(...)`.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, LoomActorSheet, effects, api, windowManager } from '/_loom/sdk/index.js';
import { ABILITY_KEYS, ABILITY_LABELS, SKILL_LABELS, ITEM_TYPE_ICON, ITEM_TYPE_LABEL, ITEM_TYPE_SINGULAR, SIZE_LABELS, SIZE_CARRY_MULTIPLIER, WEAPON_CATEGORY_CODES, WEAPON_CATEGORY_LABELS, DAMAGE_TYPES, DAMAGE_TYPE_LABELS, KNOWN_SPELLS_TABLE, KNOWN_CANTRIPS_TABLE } from './config.mjs';
import { fmtMod, setPathValue, currentAdvantageMode } from './utils.mjs';
import { sdr5eRoll, rollDeathSave, toggleInspiration, setExhaustion, rollWeaponAttack, rollWeaponDamage, castSpell, rollSpellAttack, rollSpellDamage, spendHitDie, postItemToChat, getActorConditions, applyAbilityCheckConditionModifiers, getSaveConditionOutcome, activateFeature } from './roll-engine.mjs';
import { getDefaultData } from './schema.mjs';
import { Sdr5eItemSheet } from './item-sheet.mjs';

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
  static DEFAULT_OPTIONS = { position: { width: 640, height: 760 } };

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

  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/character-native.hbs' } };

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
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, resources: { ...sd.resources, concentrating: next } } });
    await this._reloadDocument();
  }

  async _castSpell(itemId) {
    if (!itemId || !this.document) return;
    const item = (this.document.items || []).find((i) => i.id === itemId);
    if (!item) return;
    await castSpell(this.document, item);
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
    if (kind === 'attack') await rollWeaponAttack(this.document, item);
    else await rollWeaponDamage(this.document, item);
  }

  /** SRD: modificador de habilidade de conjuração + nível do personagem,
   * mínimo 1. Ver Handout 04 (.planning/handouts/) pra nota sobre classes
   * "conhecidas" vs "preparadas" — simplificação assumida de propósito. */
  _maxPreparedSpells() {
    const sd = this.document?.systemData;
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
    const willPrepare = !idata.prepared;
    const isCantrip = (idata.spellLevel ?? 0) === 0;

    // Cantrips não contam pro limite (SRD: são "always prepared", sem custo).
    if (willPrepare && !isCantrip) {
      const max = this._maxPreparedSpells();
      const currentPrepared = (this.document.items || []).filter((i) => {
        if (i.type !== 'spell' || i.id === itemId) return false;
        const d = i.system || i.data || {};
        return !!d.prepared && (d.spellLevel ?? 0) > 0;
      }).length;
      if (currentPrepared >= max) {
        window.Loom?.showToast?.(`You can only prepare ${max} spell${max === 1 ? '' : 's'} (ability modifier + level).`, 'warning');
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
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveTab();
    // Every re-render (a field save, `_reloadDocument`, etc.) re-runs the
    // Handlebars template and creates a FRESH `.sdrn-side-tabs` inside
    // `this.element` — redo the detach each time or the old floating copy
    // goes stale while a second, un-detached one silently reappears hidden
    // behind the game canvas inside the window.
    this._detachSideTabs();
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
    // `_postRender` can fire more than once per mount (base class's own
    // render pipeline, then this override) — if there's no FRESH nav
    // sitting inside `this.element` this pass, the one from the previous
    // pass is already correctly floating outside; cleaning it up here
    // would destroy it and find nothing to put back (real bug found live:
    // the tab bar vanished completely, `document.querySelector` came back
    // null both inside the window AND in `#windows`, meaning the second
    // pass's cleanup ran with no replacement to append).
    const nav = this.element?.querySelector('.sdrn-side-tabs');
    if (!nav) return;
    this._cleanupSideTabs();
    const container = this.element?.parentElement;
    if (!container) return;
    container.appendChild(nav);
    nav.style.position = 'fixed';
    nav.addEventListener('click', (event) => {
      const btn = event.target instanceof Element ? event.target.closest('[data-action]') : null;
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id || btn.closest('[data-id]')?.dataset.id || null;
      if (typeof this.onAction === 'function') this.onAction(action, id, btn);
    });
    this._sideTabsEl = nav;
    const sync = () => {
      if (!this._sideTabsEl?.isConnected || !this.element?.isConnected) return;
      const r = this.element.getBoundingClientRect();
      // Flush against the window edge, no gap (matches wod6e's `.cp-side-tabs`
      // look, which touches at exactly `left:-52px` — 0px reveal). `-1px`
      // instead of `0` to guarantee the seam is covered even with subpixel
      // rounding on the window's own border.
      this._sideTabsEl.style.left = `${r.right - 1}px`;
      this._sideTabsEl.style.top = `${r.top + 40}px`;
      this._sideTabsRaf = requestAnimationFrame(sync);
    };
    sync();
  }

  _cleanupSideTabs() {
    if (this._sideTabsRaf) cancelAnimationFrame(this._sideTabsRaf);
    this._sideTabsRaf = null;
    this._sideTabsEl?.remove();
    this._sideTabsEl = null;
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
    const sd = this.document?.systemData || {};
    const abilities = sd.abilities || {};
    const saves = sd.saves || {};
    const skills = sd.skills || {};
    const attrs = sd.attributes || {};
    const res = sd.resources || {};
    const details = sd.details || {};

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

    const _skills = Object.keys(SKILL_LABELS).map((k) => ({
      key: k,
      label: SKILL_LABELS[k],
      ability: (skills[k]?.ability || '').toUpperCase(),
      proficient: !!skills[k]?.proficient,
      total: fmtMod(skills[k]?.total ?? 0),
      passive: 10 + (skills[k]?.total ?? 0),
    })).sort((a, b) => a.label.localeCompare(b.label));

    const items = this.document?.items || [];
    const byType = (type) => items.filter((i) => i.type === type).map((i) => {
      const idata = i.system || i.data || {};
      return {
        ...i,
        icon: ITEM_TYPE_ICON[type] || '📦',
        equipped: !!idata.equipped,
        hasQuantity: type === 'item' || type === 'weapon' || type === 'armor',
        quantity: idata.quantity ?? 1,
        attunementRequired: idata.attunement === 'required' || idata.attunement === 'attuned',
        attuned: idata.attunement === 'attuned',
        isWeapon: type === 'weapon',
      };
    });
    const _inventory = ['weapon', 'armor', 'item', 'language']
      .map((type) => ({ type, label: ITEM_TYPE_LABEL[type], icon: ITEM_TYPE_ICON[type], items: byType(type) }))
      .filter((g) => g.items.length > 0 || ['weapon', 'armor', 'item'].includes(g.type));
    const _features = byType('feature');
    // Grouped by `source` to match the real dnd5e-Foundry Features tab
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
        usesLabel: idata.uses?.max ? `${idata.uses?.value ?? idata.uses.max} / ${idata.uses.max}` : '—',
        recoveryLabel: { sr: 'SR', lr: 'LR' }[idata.uses?.recovery] || '—',
        resourceCost: Number(idata.resourceCost) || 0,
      });
    }
    const _featureGroups = Array.from(_featureGroupMap, ([source, list]) => ({ source, items: list }));

    const spellItems = byType('spell').map((s) => {
      const sdata = s.system || s.data || {};
      return {
        ...s,
        isCantrip: (sdata.spellLevel ?? 0) === 0,
        prepared: !!sdata.prepared,
        hasDamage: !!sdata.damage?.formula,
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
      prepared: preparableSpells.filter((s) => s.prepared).length,
      preparedMax: this._maxPreparedSpells(),
      // Só faz sentido quando `knownClassItem` existe — 0/0 pra quem prepara
      // magia em vez de "conhecer" (Cleric/Druid/Paladin/Wizard).
      known: knownClassItem ? preparableSpells.length : 0,
      knownMax,
      cantripsKnown: knownClassItem ? spellItems.filter((s) => s.isCantrip).length : 0,
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
    const _identity = {
      // `id` added so the card can open the item's own sheet — it used to
      // render as a bare non-interactive div once set, with no way back in
      // to edit or swap it (found from direct feedback: "não tem como
      // mudar a class" / "ou adicionar a class").
      // `imgUrl` added so o ícone customizado do item (definido na própria
      // ficha do item) aparece aqui em vez do ícone fixo (Handout 19).
      race: raceItem ? { id: raceItem.id, name: raceItem.name, imgUrl: raceItem.imgUrl || '', subtitle: raceItem.system?.creatureType || raceItem.data?.creatureType || '' } : null,
      class: classItem ? {
        id: classItem.id, name: classItem.name, imgUrl: classItem.imgUrl || '',
        subtitle: `Level ${classItem.system?.levels ?? classItem.data?.levels ?? 1}`,
        level: classItem.system?.levels ?? classItem.data?.levels ?? 1,
        // Separate from `subtitle` above — the main-tab identity card shows
        // level there, but the Features-tab class card (matching real
        // dnd5e-Foundry) shows the subclass name instead, with level as its
        // own badge on the right.
        subclassName: subclassItem?.name || '',
        subclassId: subclassItem?.id || null,
      } : null,
      background: backgroundItem ? { id: backgroundItem.id, name: backgroundItem.name, imgUrl: backgroundItem.imgUrl || '' } : null,
    };
    const _classLabel = classItem ? classItem.name : '';

    const raceSize = raceItem?.system?.size || raceItem?.data?.size || 'med';
    const strScore = abilities.str?.value ?? 10;
    const carriedWeight = items
      .filter((i) => ['weapon', 'armor', 'item'].includes(i.type))
      .reduce((sum, i) => {
        const idata = i.system || i.data || {};
        return sum + (Number(idata.weight) || 0) * (Number(idata.quantity) || 1);
      }, 0);
    const sizeMultiplier = SIZE_CARRY_MULTIPLIER[raceSize] ?? 1;
    const _carrying = {
      weight: Math.round(carriedWeight * 10) / 10,
      capacity: Math.round(strScore * 15 * sizeMultiplier),
      str: strScore,
      sizeLabel: SIZE_LABELS[raceSize] || 'Md',
      multiplier: sizeMultiplier,
    };

    const rawEffects = this.document?.id ? await effects.forActor(this.document.id).catch(() => []) : [];
    const _effects = (rawEffects || []).map((e) => ({
      ...e,
      durationLabel: e.duration < 0 ? 'Permanent' : `${e.duration} round${e.duration === 1 ? '' : 's'}`,
    }));

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
    const healthPct = healthMax > 0 ? Math.max(0, Math.min(100, Math.round(((res.health?.value ?? 0) / healthMax) * 100))) : 0;

    const hitDice = res.hitDice ?? { value: 1, max: 1, die: 'd8' };
    const hitDicePct = hitDice.max > 0 ? Math.max(0, Math.min(100, Math.round((hitDice.value / hitDice.max) * 100))) : 0;

    const exhaustion = res.exhaustion ?? 0;
    const _exhaustionLevels = Array.from({ length: 6 }, (_, i) => ({ level: i + 1, filled: exhaustion >= i + 1 }));
    // Real dnd5e-Foundry flanks the AC shield with the exhaustion track
    // split 3-and-3 either side, not a standalone boxed row — confirmed
    // live against the reference sheet.
    const _exhaustionLeft = _exhaustionLevels.slice(0, 3);
    const _exhaustionRight = _exhaustionLevels.slice(3, 6);

    const deathSaves = res.deathSaves ?? { successes: 0, failures: 0 };
    const _deathSaves = {
      successPips: Array.from({ length: 3 }, (_, i) => ({ filled: (deathSaves.successes || 0) > i })),
      failurePips: Array.from({ length: 3 }, (_, i) => ({ filled: (deathSaves.failures || 0) > i })),
    };

    return {
      ...context,
      ...this.document,
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      systemData: sd,
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
      _spellcasting,
      _effects,
      _prof: fmtMod(attrs.prof?.value ?? 2),
      _profValue: attrs.prof?.value ?? 2,
      _ac: attrs.da?.value ?? 10,
      _acBase: attrs.da?.base ?? 10,
      _initiative: fmtMod(attrs.initiative?.total ?? 0),
      _speed: attrs.speed?.value ?? '9m',
      _health: { value: res.health?.value ?? 0, max: healthMax, pct: healthPct, temp: res.health?.temp ?? 0 },
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
      _level: details.level ?? 1,
      _classLabel: _classLabel,
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
      _senses: details.senses?.value || [],
      _identity,
      _multiclassQualifies: multiclassQualifies,
    };
  }

  onAction(action, id, target) {
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

    if (action === 'open-item') {
      void this._openItem(id);
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

    if (action === 'add-class-resource') {
      void this._addClassResource();
      return;
    }

    if (action === 'delete-item') {
      void this._deleteItem(id);
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

    if (action === 'new-character-wizard') {
      void this._openWizard();
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
      const { autoFail, disadvantage } = getSaveConditionOutcome(key, conditions, exhaustionLevel, armorPenalty);
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
      const advantage = (kb === 1 && disadvantage) ? 0 : disadvantage ? -1 : kb;
      await sdr5eRoll({ label: `Save: ${ABILITY_LABELS[key]}`, bonus: save?.total ?? 0, actor: this.document, advantage });
    } else {
      const conditions = await getActorConditions(this.document.id);
      const armorPenalty = (key === 'str' || key === 'dex') && !!sd.attributes?.armor?.penalty;
      const advantage = applyAbilityCheckConditionModifiers(currentAdvantageMode(), conditions, sd.resources?.exhaustion ?? 0, armorPenalty);
      const abl = sd.abilities?.[key];
      await sdr5eRoll({ label: `Ability Check: ${ABILITY_LABELS[key]}`, bonus: abl?.modifier ?? 0, actor: this.document, advantage });
    }
  }

  async _rollInitiative() {
    if (!this.document) return;
    const bonus = this.document.systemData?.attributes?.initiative?.total ?? 0;
    await sdr5eRoll({ label: `${this.document.name} rolls Initiative!`, bonus, actor: this.document });
  }

  async _rollSkill(key) {
    if (!key || !this.document) return;
    const sd = this.document.systemData;
    const skill = sd?.skills?.[key];
    const conditions = await getActorConditions(this.document.id);
    const armorPenalty = (skill?.ability === 'str' || skill?.ability === 'dex') && !!sd?.attributes?.armor?.penalty;
    const advantage = applyAbilityCheckConditionModifiers(currentAdvantageMode(), conditions, sd?.resources?.exhaustion ?? 0, armorPenalty);
    await sdr5eRoll({ label: `Skill Check: ${SKILL_LABELS[key] || key}`, bonus: skill?.total ?? 0, actor: this.document, advantage });
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

  async _openWizard() {
    const { Sdr5eCharacterWizard } = await import('./character-wizard.mjs');
    const id = `sdr5e-wizard-${Math.random().toString(36).slice(2, 9)}`;
    windowManager.open(id, Sdr5eCharacterWizard, { id });
  }

  async _openItem(itemId) {
    if (!itemId) return;
    windowManager.open(`item-sheet-${itemId}`, Sdr5eItemSheet, { itemId });
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
    await activateFeature(this.document, item);
    await this._reloadDocument();
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
    await api.delete(`/items/${itemId}`);
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

  // Rest rules are PROVISIONAL (see the note at the top of schema.mjs — final
  // numbers come from the SRD the user is transposing). Short: only frees up
  // resources with reset:'short'. Long: full HP, full hit dice, 'short'+'long'
  // resources, resets the short-rest counter.
  async _takeRest(kind) {
    if (!this.document) return;
    const sd = this.document.systemData;
    const res = sd.resources || {};
    const recovered = [];

    if (res.racial?.reset === 'short' || kind === 'long') {
      if (res.racial && res.racial.value < res.racial.max) recovered.push(`${res.racial.label || 'Racial'} (${res.racial.max - res.racial.value})`);
      if (res.racial) res.racial.value = res.racial.max;
    }
    if (res.primary?.reset === 'short' || kind === 'long') {
      if (res.primary && res.primary.value < res.primary.max) recovered.push(`${res.primary.label || 'Resource'} (${res.primary.max - res.primary.value})`);
      if (res.primary) res.primary.value = res.primary.max;
    }

    if (kind === 'long') {
      const hpBefore = res.health?.value ?? 0;
      if (res.health) { res.health.value = res.health.max; res.health.temp = 0; }
      if (res.health && res.health.max > hpBefore) recovered.unshift(`HP +${res.health.max - hpBefore}`);

      const hdBefore = res.hitDice?.value ?? 0;
      if (res.hitDice) res.hitDice.value = res.hitDice.max;
      if (res.hitDice && res.hitDice.max > hdBefore) recovered.push(`Hit Dice +${res.hitDice.max - hdBefore}`);

      let slotsRestored = 0;
      for (const lvl of Object.keys(res.spellSlots || {})) {
        const slot = res.spellSlots[lvl];
        if (slot && slot.value < slot.max) { slotsRestored += slot.max - slot.value; slot.value = slot.max; }
      }
      if (slotsRestored > 0) recovered.push(`${slotsRestored} spell slot${slotsRestored === 1 ? '' : 's'}`);

      if (res.deathSaves) { res.deathSaves.successes = 0; res.deathSaves.failures = 0; }
      const exhaustionBefore = res.exhaustion || 0;
      res.exhaustion = Math.max(0, exhaustionBefore - 1);
      if (exhaustionBefore > 0) recovered.push('Exhaustion -1');
      res.shortRestsDone = 0;
    } else {
      res.shortRestsDone = (res.shortRestsDone || 0) + 1;

      // SRD (Classes/Warlock.md, "Pact Magic"): "you regain all expended
      // spell slots when you finish a short or long rest" — exceção real,
      // só o Warlock recupera magia em descanso CURTO. Multiclasse com
      // Warlock + outra classe conjuradora fica fora (mesma limitação do
      // Handout 08 — um bucket de slot só, não dois grupos separados).
      const classItem = (this.document.items || []).find((i) => i.type === 'class');
      const cdata = classItem ? (classItem.system || classItem.data || {}) : null;
      if (cdata?.casterType === 'pact') {
        let pactSlotsRestored = 0;
        for (const lvl of Object.keys(res.spellSlots || {})) {
          const slot = res.spellSlots[lvl];
          if (slot && slot.value < slot.max) { pactSlotsRestored += slot.max - slot.value; slot.value = slot.max; }
        }
        if (pactSlotsRestored > 0) recovered.push(`${pactSlotsRestored} Pact Magic slot${pactSlotsRestored === 1 ? '' : 's'}`);
      }
    }

    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: sd });
    await this._reloadDocument();

    const label = kind === 'long' ? 'Long Rest' : 'Short Rest';
    const summary = recovered.length ? recovered.join(' &middot; ') : 'Nothing to recover.';
    await window.Loom.ChatMessage.create({
      speaker: window.Loom.ChatMessage.getSpeaker({ actor: this.document }),
      content: `${label} complete`,
      flags: { srd5e: { name: `${this.document.name} — ${label}`, isRest: true, description: `<div>${summary}</div>` } },
    });
  }
}
