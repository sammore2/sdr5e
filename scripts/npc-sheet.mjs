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
import { ABILITY_KEYS, ABILITY_LABELS, SKILL_LABELS, ITEM_TYPE_ICON } from './config.mjs';
import { fmtMod, setPathValue, currentAdvantageMode } from './utils.mjs';
import { sdr5eRoll, applyHeal, applyDamage, getActorConditions, applyPoisonedDisadvantage, getSaveConditionOutcome } from './roll-engine.mjs';
import { getDefaultData } from './schema.mjs';
import { Sdr5eItemSheet } from './item-sheet.mjs';

export class Sdr5eNpcSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 460, height: 620 } };

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
    });
  }

  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/npc-native.hbs' } };

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : 'SDR5E';
  }

  get documentName() { return 'actor'; }
  get apiRoute() { return '/actors'; }
  get dataKey() { return 'systemData'; }

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

    const _abilities = ABILITY_KEYS.map((k) => ({
      key: k, abbr: k.toUpperCase(), label: ABILITY_LABELS[k],
      score: abilities[k]?.value ?? 10, mod: fmtMod(abilities[k]?.modifier ?? 0),
    }));

    // Real monster stat blocks only list saves the creature is actually
    // proficient in — a flat row of all 6 (mostly +0) is just noise.
    const _saves = ABILITY_KEYS
      .map((k) => ({ key: k, label: ABILITY_LABELS[k].slice(0, 3).toUpperCase(), total: fmtMod(saves[k]?.total ?? 0), proficient: !!saves[k]?.proficient }))
      .filter((s) => s.proficient);

    const _skills = Object.keys(SKILL_LABELS)
      .map((k) => ({ key: k, label: SKILL_LABELS[k], total: fmtMod(skills[k]?.total ?? 0), proficient: !!skills[k]?.proficient }))
      .filter((s) => s.proficient)
      .sort((a, b) => a.label.localeCompare(b.label));

    const items = this.document?.items || [];
    const _actions = items.filter((i) => i.type === 'feature').map((i) => ({ ...i, icon: ITEM_TYPE_ICON.feature || '⭐' }));

    const healthMax = res.health?.max ?? 10;
    const healthPct = healthMax > 0 ? Math.max(0, Math.min(100, Math.round(((res.health?.value ?? 0) / healthMax) * 100))) : 0;

    const _traits = details.traits || { di: [], dr: [], dv: [], ci: [] };

    return {
      ...context,
      ...this.document,
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      systemData: sd,
      _abilities,
      _saves,
      _skills,
      _actions,
      _prof: fmtMod(attrs.prof?.value ?? 2),
      _ac: attrs.da?.value ?? 10,
      _acBase: attrs.da?.base ?? 10,
      _initiative: fmtMod(attrs.initiative?.total ?? 0),
      _speed: attrs.speed?.value ?? '9m',
      _health: { value: res.health?.value ?? 0, max: healthMax, pct: healthPct, temp: res.health?.temp ?? 0 },
      _cr: details.cr ?? 0,
      _xpLabel: details.xp?.label || `${details.xp?.value ?? 0} XP`,
      _size: details.size || 'med',
      _alignment: details.alignment || '',
      _senses: details.senses?.value || [],
      _sensesCustom: details.senses?.custom || '',
      _languages: details.languages?.value || [],
      _languagesCustom: details.languages?.custom || '',
      _traits,
      _legendaryActions: details.legendaryActions || 0,
      _legendaryResistances: details.legendaryResistances || 0,
      _biography: details.biography || '',
    };
  }

  onAction(action, id, target) {
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
    if (action === 'hp-delta') {
      const delta = Number(target.dataset.delta) || 0;
      void this._applyHpDelta(delta);
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
      void this._createItem(target.dataset.itemType);
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _rollAbility(key, mode) {
    if (!key || !this.document) return;
    const sd = this.document.systemData;
    if (mode === 'save') {
      const conditions = await getActorConditions(this.document.id);
      const { autoFail, disadvantage } = getSaveConditionOutcome(key, conditions);
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
      const advantage = (kb === 1 && disadvantage) ? 0 : disadvantage ? -1 : kb;
      await sdr5eRoll({ label: `Save: ${ABILITY_LABELS[key]}`, bonus: save?.total ?? 0, actor: this.document, advantage });
    } else {
      const conditions = await getActorConditions(this.document.id);
      const advantage = applyPoisonedDisadvantage(currentAdvantageMode(), conditions);
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
    const skill = this.document.systemData?.skills?.[key];
    const conditions = await getActorConditions(this.document.id);
    const advantage = applyPoisonedDisadvantage(currentAdvantageMode(), conditions);
    await sdr5eRoll({ label: `Skill Check: ${SKILL_LABELS[key] || key}`, bonus: skill?.total ?? 0, actor: this.document, advantage });
  }

  async _applyHpDelta(delta) {
    if (!this.document || !delta) return;
    if (delta > 0) await applyHeal(this.document, delta);
    else await applyDamage(this.document, -delta, 'untyped');
    await this._reloadDocument();
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

  async _createItem(type) {
    if (!type || !this.document) return;
    await api.post('/items', {
      worldId: window.Loom?.world?.id,
      name: 'New Action',
      type,
      data: getDefaultData(type),
      actorId: this.document.id,
    });
    await this._reloadDocument();
  }
}
