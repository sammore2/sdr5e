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
import { ABILITY_KEYS, ABILITY_LABELS, SKILL_LABELS, SKILL_ABILITIES, ITEM_TYPE_ICON, ITEM_TYPE_SINGULAR } from './config.mjs';
import { fmtMod, setPathValue, currentAdvantageMode } from './utils.mjs';
import { sdr5eRoll, applyHeal, applyDamage, getActorConditions, applyPoisonedDisadvantage, getSaveConditionOutcome, evaluateDamageFormula, postItemToChat, rollWeaponAttack, rollWeaponDamage } from './roll-engine.mjs';
import { getDefaultData } from './schema.mjs';
import { Sdr5eItemSheet } from './item-sheet.mjs';

const SDR5E_HEADER_BANNER = '/marketplace/rulesets/srd5e/assets/images/banner-character.png';

export class Sdr5eNpcSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 540, height: 740 } };

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
    this._attachListeners();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._attachListeners();
  }

  _hasListeners = false;
  _attachListeners() {
    this._attachDropListener();
    if (!this.element || this._hasListeners) return;
    this._hasListeners = true;
    this.element.addEventListener('change', (e) => {
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

    const _abilities = ABILITY_KEYS.map((k) => ({
      key: k, abbr: k.toUpperCase(), label: ABILITY_LABELS[k],
      score: abilities[k]?.value ?? 10, mod: fmtMod(abilities[k]?.modifier ?? 0),
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
    const _passivePerception = 10 + (skills.perception?.total ?? 0);

    const items = this.document?.items || [];
    const _actions = items.filter((i) => i.type !== 'language').map((i) => {
      const idata = i.system || i.data || {};
      const formula = idata.damage?.formula || '';
      return {
        ...i,
        imgUrl: i.imgUrl || i.img || i.avatarUrl || '',
        icon: ITEM_TYPE_ICON[i.type] || '⭐',
        isWeapon: i.type === 'weapon',
        isSpell: i.type === 'spell',
        isFeature: i.type === 'feature',
        hasDamage: !!formula,
      };
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

    return {
      ...context,
      ...this.document,
      avatarUrl: this.document?.avatarUrl || this.document?.img || '',
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      systemData: sd,
      _abilities,
      _saves,
      _availableSaves,
      _skills,
      _availableSkills,
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
      _passivePerception,
      _languages,
      _languagesCustom: details.languages?.custom || '',
      _traits,
      _hasTraits,
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
      await sdr5eRoll({ label: `Save: ${ABILITY_LABELS[key]}`, parts: [{ label: 'Modifier', value: save?.total ?? 0 }], actor: this.document, advantage });
    } else {
      const conditions = await getActorConditions(this.document.id);
      const advantage = applyPoisonedDisadvantage(currentAdvantageMode(), conditions);
      const abl = sd.abilities?.[key];
      await sdr5eRoll({ label: `Ability Check: ${ABILITY_LABELS[key]}`, parts: [{ label: 'Modifier', value: abl?.modifier ?? 0 }], actor: this.document, advantage });
    }
  }

  async _rollInitiative() {
    if (!this.document) return;
    const bonus = this.document.systemData?.attributes?.initiative?.total ?? 0;
    await sdr5eRoll({ label: `${this.document.name} rolls Initiative!`, parts: [{ label: 'Initiative', value: bonus }], actor: this.document });
  }

  async _rollSkill(key) {
    if (!key || !this.document) return;
    const skill = this.document.systemData?.skills?.[key];
    const conditions = await getActorConditions(this.document.id);
    const advantage = applyPoisonedDisadvantage(currentAdvantageMode(), conditions);
    await sdr5eRoll({ label: `Skill Check: ${SKILL_LABELS[key] || key}`, parts: [{ label: 'Modifier', value: skill?.total ?? 0 }], actor: this.document, advantage });
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
