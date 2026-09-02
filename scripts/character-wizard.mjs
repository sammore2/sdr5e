// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/character-wizard.mjs
// Component Version: 0.1.0
//
// Guided character creation, matching the real dnd5e-Foundry flow's shape
// (identity -> race -> class -> abilities -> review -> create) without any
// Foundry code — a plain LoomHandlebarsMixin(BaseWindow), same pattern as
// the sheets, just not bound to an existing document. Race/class content
// isn't compendium-backed yet (deferred, per the conversion scope), so this
// wizard creates freeform race/class items alongside the new actor instead
// of picking from a list — still real automation (creates 3 linked
// documents, seeds abilities), not a stub.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, BaseWindow, api, windowManager, showToast } from '/_loom/sdk/index.js';
import { ABILITY_KEYS, ABILITY_LABELS, SIZE_LABELS } from './config.mjs';
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
    race: { name: '', size: 'med', speed: '9m', creatureType: 'humanoid' },
    klass: { name: '', hitDie: 'd8' },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
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
      _sizes: Object.entries(SIZE_LABELS).map(([value, label]) => ({ value, label, selected: value === this._data.race.size })),
      _hitDice: ['d6', 'd8', 'd10', 'd12'].map((v) => ({ value: v, selected: v === this._data.klass.hitDie })),
      _abilities: ABILITY_KEYS.map((k) => ({ key: k, label: ABILITY_LABELS[k], value: this._data.abilities[k] })),
      _reviewAbilities: ABILITY_KEYS.map((k) => `${ABILITY_LABELS[k].slice(0, 3)} ${this._data.abilities[k]}`).join(' · '),
    };
  }

  _onChangeForm(event) {
    const target = event.target;
    if (!target?.name?.startsWith('w:')) return;
    const path = target.name.slice(2);
    const value = target.type === 'number' ? Number(target.value) : target.value;
    const keys = path.split('.');
    let obj = this._data;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
  }

  onAction(action, id, target) {
    if (action === 'wizard-next') { this._goStep(this._step + 1); return; }
    if (action === 'wizard-back') { this._goStep(this._step - 1); return; }
    if (action === 'wizard-standard-array') { void this._fillStandardArray(); return; }
    if (action === 'wizard-create') { void this._create(); return; }
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
  }

  async _fillStandardArray() {
    ABILITY_KEYS.forEach((k, i) => { this._data.abilities[k] = STANDARD_ARRAY[i] ?? 10; });
    await this.render();
  }

  async _create() {
    const worldId = window.Loom?.world?.id;
    if (!worldId) return;

    const charData = getDefaultData('character');
    for (const k of ABILITY_KEYS) charData.abilities[k].value = this._data.abilities[k] || 10;
    charData.details.level = this._data.level || 1;
    charData.attributes.prof.value = Math.floor(((this._data.level || 1) - 1) / 4) + 2;
    charData.resources.hitDice.max = this._data.level || 1;
    charData.resources.hitDice.value = this._data.level || 1;
    charData.resources.hitDice.die = this._data.klass.hitDie || 'd8';

    const actorRes = await api.post('/actors', {
      worldId, name: this._data.name.trim() || 'New Character', type: 'character', systemData: charData,
    });
    const actorId = actorRes?.data?.id || actorRes?.id;
    if (!actorId) { showToast?.('Failed to create character.', 'error'); return; }

    if (this._data.race.name.trim()) {
      const raceData = getDefaultData('race');
      raceData.size = this._data.race.size;
      raceData.speed = this._data.race.speed;
      raceData.creatureType = this._data.race.creatureType;
      await api.post('/items', { worldId, name: this._data.race.name.trim(), type: 'race', data: raceData, actorId });
    }
    if (this._data.klass.name.trim()) {
      const classData = getDefaultData('class');
      classData.hitDie = this._data.klass.hitDie;
      classData.levels = this._data.level || 1;
      await api.post('/items', { worldId, name: this._data.klass.name.trim(), type: 'class', data: classData, actorId });
    }

    const { Sdr5eCharacterSheet } = await import('./actor-sheet.mjs');
    windowManager.open(`actor-sheet-${actorId}`, Sdr5eCharacterSheet, { actorId });
    // `windowManager.close(id)`, not `this.close()` — BaseWindow instances
    // don't expose their own close(); the manager owns lifecycle.
    windowManager.close(this.options.id);
  }
}
