// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/character-wizard.mjs
// Component Version: 0.1.0
//
// Guided character creation, matching the real dnd5e-Foundry flow's shape
// (identity -> race -> class -> abilities -> review -> create) without any
// Foundry code — a plain LoomHandlebarsMixin(BaseWindow), same pattern as
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
import { ABILITY_KEYS, ABILITY_LABELS } from './config.mjs';
import { getDefaultData } from './schema.mjs';

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const STEPS = ['identity', 'race', 'class', 'abilities', 'review'];

export class Sdr5eCharacterWizard extends LoomHandlebarsMixin(BaseWindow) {
  static DEFAULT_OPTIONS = { position: { width: 480, height: 560 } };
  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/character-wizard.hbs' } };

  constructor(props) {
    super({
      ...props,
      id: props?.id || `sdr5e-wizard-${Math.random().toString(36).slice(2, 9)}`,
      title: 'New Character',
      showFooter: false,
      resizable: true,
      classes: ['sdrn-sheet', 'sdrn-wizard'],
    });
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
    klass: { sourceId: '', entryId: '', name: '', hitDie: 'd8', compendiumData: null },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  };

  // Transient search UI state — not part of `_data`, never persisted to the
  // actor. One query/results/timer pair per picker (race, klass).
  _search = {
    race: { query: '', results: [], timer: null },
    klass: { query: '', results: [], timer: null },
  };

  async _prepareContext() {
    const context = await super._prepareContext();
    const step = STEPS[this._step];
    return {
      ...context,
      _steps: STEPS.map((s, i) => ({ id: s, active: i === this._step, done: i < this._step })),
      // No `eq` helper exists in this project's Handlebars setup — precompute
      // one boolean per step instead of comparing `_step` in the template.
      _stepIdentity: step === 'identity',
      _stepRace: step === 'race',
      _stepClass: step === 'class',
      _stepAbilities: step === 'abilities',
      _stepReview: step === 'review',
      _isFirst: this._step === 0,
      _isLast: this._step === STEPS.length - 1,
      _data: this._data,
      _abilities: ABILITY_KEYS.map((k) => ({ key: k, label: ABILITY_LABELS[k], value: this._data.abilities[k] })),
      _reviewAbilities: ABILITY_KEYS.map((k) => `${ABILITY_LABELS[k].slice(0, 3)} ${this._data.abilities[k]}`).join(' · '),
      _racePicked: !!this._data.race.entryId,
      _raceQuery: this._search.race.query,
      _raceResults: this._search.race.results,
      _klassPicked: !!this._data.klass.entryId,
      _klassQuery: this._search.klass.query,
      _klassResults: this._search.klass.results,
      _reviewRaceInfo: this._data.race.compendiumData ? `${this._data.race.compendiumData.size || ''}, ${this._data.race.compendiumData.speed || ''}` : '',
      _reviewHitDie: this._data.klass.compendiumData?.hitDie || '',
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
      clearTimeout(bucket.timer);
      bucket.timer = setTimeout(() => void this._runSearch(searchKind), 300);
      return;
    }
    if (!target?.name?.startsWith('w:')) return;
    const path = target.name.slice(2);
    const value = target.type === 'number' ? Number(target.value) : target.value;
    const keys = path.split('.');
    let obj = this._data;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
  }

  /** entryType: 'race' | 'class' — the entry's own `type` field, not the
   * pack's (see the note on GET /compendium/browse/entries, compendium.ts). */
  async _searchEntries(entryType, query) {
    const params = new URLSearchParams({ entryType });
    if (query) params.set('search', query);
    try {
      const res = await api.get(`/compendium/browse/entries?${params}`);
      return res?.entries ?? [];
    } catch (err) {
      console.warn('[srd5e] Compendium search failed:', err);
      return [];
    }
  }

  async _runSearch(kind) {
    const entryType = kind === 'klass' ? 'class' : 'race';
    const queryAtRequest = this._search[kind].query;
    const results = await this._searchEntries(entryType, queryAtRequest);
    // The query may have changed again while this request was in flight — a
    // stale response landing after a newer one would flash the wrong list.
    // Only apply it if the query is still the one that sent it.
    if (this._search[kind].query !== queryAtRequest) return;
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

    const bucket = kind === 'klass' ? this._data.klass : this._data.race;
    bucket.sourceId = sourceId;
    bucket.entryId = entryId;
    bucket.name = entry.name;
    bucket.compendiumData = entry.data || {};
    this._search[kind].results = [];
    this._search[kind].query = entry.name;
    await this.render();
  }

  async _clearPick(kind) {
    const bucket = kind === 'klass' ? this._data.klass : this._data.race;
    bucket.sourceId = '';
    bucket.entryId = '';
    bucket.name = '';
    bucket.compendiumData = null;
    this._search[kind].query = '';
    this._search[kind].results = [];
    await this.render();
  }

  onAction(action, id, target) {
    if (action === 'wizard-next') { this._goStep(this._step + 1); return; }
    if (action === 'wizard-back') { this._goStep(this._step - 1); return; }
    if (action === 'wizard-standard-array') { void this._fillStandardArray(); return; }
    if (action === 'wizard-create') { void this._create(); return; }
    if (action === 'wizard-pick-race') { void this._pickCompendiumEntry('race', target.dataset.sourceId, id); return; }
    if (action === 'wizard-pick-klass') { void this._pickCompendiumEntry('klass', target.dataset.sourceId, id); return; }
    if (action === 'wizard-clear-race') { void this._clearPick('race'); return; }
    if (action === 'wizard-clear-klass') { void this._clearPick('klass'); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  _goStep(next) {
    if (next < 0 || next >= STEPS.length) return;
    if (next > this._step && STEPS[this._step] === 'identity' && !this._data.name.trim()) {
      showToast?.('Give the character a name first.', 'warning');
      return;
    }
    this._step = next;
    void this.render();
    // Race/Class show up as a browsable grid of compendium options, not a
    // type-to-search box — load the full list the moment the step is
    // entered so there's something to click without typing anything first.
    // The search input still narrows this list live; it just isn't required
    // to populate it.
    const stepId = STEPS[next];
    const kind = stepId === 'race' ? 'race' : stepId === 'class' ? 'klass' : null;
    if (kind && !this._data[kind].entryId && !this._search[kind].results.length && !this._search[kind].query) {
      void this._runSearch(kind);
    }
  }

  async _fillStandardArray() {
    ABILITY_KEYS.forEach((k, i) => { this._data.abilities[k] = STANDARD_ARRAY[i] ?? 10; });
    await this.render();
  }

  async _create() {
    const worldId = window.Loom?.world?.id;
    if (!worldId) return;

    // Resolved BEFORE `charData` is built and posted, so the actor is
    // created with the right die the first time instead of needing a second
    // update after the fact.
    const hitDie = this._data.klass.compendiumData?.hitDie || 'd8';

    const charData = getDefaultData('character');
    for (const k of ABILITY_KEYS) charData.abilities[k].value = this._data.abilities[k] || 10;
    charData.details.level = this._data.level || 1;
    charData.attributes.prof.value = Math.floor(((this._data.level || 1) - 1) / 4) + 2;
    charData.resources.hitDice.max = this._data.level || 1;
    charData.resources.hitDice.value = this._data.level || 1;
    charData.resources.hitDice.die = hitDie;

    const actorRes = await api.post('/actors', {
      worldId, name: this._data.name.trim() || 'New Character', type: 'character', systemData: charData,
    });
    const actorId = actorRes?.data?.id || actorRes?.id;
    if (!actorId) { showToast?.('Failed to create character.', 'error'); return; }

    if (this._data.race.entryId && this._data.race.compendiumData) {
      // Compendium entry only — its own `data` already has the mechanical
      // fields (size/speed/creatureType/etc) filled in for real.
      await api.post('/items', { worldId, name: this._data.race.name, type: 'race', data: this._data.race.compendiumData, actorId });
    }
    if (this._data.klass.entryId && this._data.klass.compendiumData) {
      await api.post('/items', { worldId, name: this._data.klass.name, type: 'class', data: this._data.klass.compendiumData, actorId });
    }

    const { Sdr5eCharacterSheet } = await import('./character-sheet.mjs');
    windowManager.open(`actor-sheet-${actorId}`, Sdr5eCharacterSheet, { actorId });
    // `windowManager.close(id)`, not `this.close()` — BaseWindow instances
    // don't expose their own close(); the manager owns lifecycle.
    windowManager.close(this.options.id);
  }
}
