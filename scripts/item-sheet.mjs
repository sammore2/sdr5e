// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/item-sheet.mjs
// Component Version: 0.1.0
//
// Item sheet — header (icon/name/rarity/weight/price), Description/Details
// tabs, tags footer. Mirrors the real dnd5e pattern (Belt of Frost Giant
// Strength / Arcane Recovery / Acid Splash cards), without any Wizards art.
// Before this, there was no way to edit an item from the native sheet at
// all — only a "edit via sidebar" toast (deliberate scope cut earlier, that
// turned into a real usability complaint).
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, LoomItemSheet, api, effects } from '/_loom/sdk/index.js';
import { ITEM_TYPE_ICON } from './config.mjs';
import { setPathValue, getItemType } from './utils.mjs';
import { ITEM_SHEET_SCHEMAS } from './sheet-schemas.mjs';

export class Sdr5eItemSheet extends LoomHandlebarsMixin(LoomItemSheet) {
  static DEFAULT_OPTIONS = { position: { width: 380, height: 460 } };
  _formSaveTimer;

  get itemType() {
    return getItemType(this.document);
  }

  constructor(props) {
    super({
      ...props,
      id: props.id || `item-sheet-${props.itemId}`,
      documentId: props.itemId,
      title: (props.title && props.title !== 'undefined') ? props.title : 'Item',
      showFooter: false,
      resizable: true,
      classes: ['sdrn-sheet', 'sdrn-item-sheet'],
    });
  }

  get dataKey() { return 'data'; }

  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/item-sheet.hbs' } };

  _activeItemTab = 'description';
  // Keyed by field name — every pending edit gets flushed together on the
  // same timer instead of a single shared timeout that only remembered the
  // LAST field touched. Editing two fields within the 300ms debounce window
  // (e.g. tabbing spellLevel -> damage.formula -> damage.type) used to save
  // only the third one and silently drop the first two — no error, values
  // just reverted on reload. Found while testing spell damage fields.
  _pendingFields = new Map();

  async mount() {
    await super.mount();
    this._applyActiveItemTab();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveItemTab();
  }

  _applyActiveItemTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeItemTab || 'description';
    root.querySelectorAll('.sdrn-item-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    root.querySelectorAll('[data-item-tab-content]').forEach((panel) => {
      panel.style.display = panel.dataset.itemTabContent === tab ? '' : 'none';
    });
  }

  onAction(action, id, target) {
    if (action === 'item-tab') {
      const tab = target.dataset.tab;
      if (!tab) return;
      this._activeItemTab = tab;
      this._applyActiveItemTab();
      return;
    }
    if (action === 'pick-icon') {
      void this._pickIcon();
      return;
    }
    if (action === 'open-effect-config') {
      void this._onOpenEffectConfig(target);
      return;
    }
    if (action === 'create-effect') {
      void this._onCreateEffect();
      return;
    }
    if (action === 'delete-effect') {
      void this._onDeleteEffect(target);
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _onOpenEffectConfig(target) {
    let buffId = target.dataset.id;
    const index = Number(target.dataset.index);
    if (!buffId && this.document?.id && Array.isArray(this.document.data?.effects) && this.document.data.effects[index]) {
      const effectDef = this.document.data.effects[index];
      if (typeof effects?.create === 'function') {
        try {
          const created = await effects.create({
            itemId: this.document.id,
            name: effectDef.name || 'New Effect',
            icon: effectDef.icon || this.document.imgUrl || '',
            description: effectDef.description || '',
            durationUnit: effectDef.durationUnit || 'rounds',
            duration: effectDef.duration ?? 1,
            conditionId: effectDef.conditionId,
            removeOnCombatEnd: effectDef.removeOnCombatEnd ?? false,
            changes: effectDef.changes || [],
            visual: effectDef.visual,
          });
          if (created?.id) {
            buffId = created.id;
            effectDef.id = buffId;
            await api.put(`${this.apiRoute}/${this.document.id}`, { data: this.document.data });
          }
        } catch (err) {
          console.warn('[srd5e] Failed to create buff template on demand:', err);
        }
      }
    }
    if (buffId && typeof effects?.openConfig === 'function') {
      void effects.openConfig(buffId);
    }
  }

  async _onCreateEffect() {
    if (!this.document) return;
    const effectDef = {
      name: `${this.document.name || 'Item'} Effect`,
      icon: this.document.imgUrl || '',
      description: 'Active Effect description.',
      durationUnit: 'rounds',
      duration: 1,
      changes: [],
    };
    if (this.document.id && typeof effects?.create === 'function') {
      try {
        const created = await effects.create({
          itemId: this.document.id,
          ...effectDef,
        });
        if (created?.id) {
          effectDef.id = created.id;
          if (typeof effects?.openConfig === 'function') {
            void effects.openConfig(created.id);
          }
        }
      } catch (err) {
        console.warn('[srd5e] Failed to create buff via Loom effects API:', err);
      }
    }
    const data = this.document.data || {};
    data.effects = Array.isArray(data.effects) ? [...data.effects, effectDef] : [effectDef];
    await api.put(`${this.apiRoute}/${this.document.id}`, { data });
    await this._reloadDocument();
  }

  async _onDeleteEffect(target) {
    if (!this.document) return;
    const buffId = target.dataset.id;
    const index = Number(target.dataset.index);
    if (buffId && typeof effects?.delete === 'function') {
      try {
        await effects.delete(buffId);
      } catch (err) {
        console.warn('[srd5e] Failed to delete buff:', err);
      }
    }
    const data = this.document.data || {};
    if (Array.isArray(data.effects) && !Number.isNaN(index) && index >= 0) {
      data.effects.splice(index, 1);
      await api.put(`${this.apiRoute}/${this.document.id}`, { data });
      await this._reloadDocument();
    }
  }

  /**
   * `imgUrl` is a native top-level field on every Loom item (confirmed in
   * `server/applications/schemas/items.schema.ts`) — this ruleset just
   * never wired a picker to it, so every item fell back to a generic
   * type icon (🗡️/🛡️/etc) with no way to assign real artwork per item.
   * `FilePicker` itself is real Loom code; it's only reachable through
   * `Loom.applications.apps.FilePicker.implementation` — a path shaped for
   * converted VTT legado systems, but the class behind it isn't an emulation
   * of anything, so this isn't a compatibility shortcut, just its only
   * exposed entry point.
   */
  async _pickIcon() {
    if (!this.document) return;
    const FilePicker = window.Loom?.applications?.apps?.FilePicker?.implementation;
    if (!FilePicker) return;
    const path = await new FilePicker({ type: 'image', current: this.document.imgUrl || '' }).browse();
    if (!path) return;
    await api.put(`${this.apiRoute}/${this.document.id}`, { imgUrl: path });
    await this._reloadDocument();
  }

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

  /** Fields declared `type: 'csv'` in ITEM_SHEET_SCHEMAS (e.g. spell.classes)
   * render as a plain comma-separated text input, but store an array —
   * `_prepareContext` joins the array for display, this parses it back on
   * save. Kept out of `_onChangeForm`/setPathValue's generic path, which
   * only knows plain scalars, so an array-shaped field doesn't need its own
   * DOM input `type` to round-trip correctly. */
  _csvFieldKeys() {
    const schema = ITEM_SHEET_SCHEMAS[this.itemType];
    const fields = schema?.tabs?.[0]?.fields || [];
    return new Set(fields.filter((f) => f.type === 'csv').map((f) => f.key));
  }

  async _flushPendingFields() {
    if (!this.document || this._pendingFields.size === 0) return;
    const pending = this._pendingFields;
    this._pendingFields = new Map();

    const data = this.document.data || {};
    const csvKeys = this._csvFieldKeys();
    let name;
    for (const [key, value] of pending) {
      if (key === 'name') { name = value; continue; }
      const path = key.slice(3);
      const parsed = csvKeys.has(path) ? String(value).split(',').map((s) => s.trim()).filter(Boolean) : value;
      setPathValue(data, path, parsed);
    }
    const submitData = { data };
    if (name !== undefined) submitData.name = name;

    await api.put(`${this.apiRoute}/${this.document.id}`, submitData);
    await this._reloadDocument();
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const type = this.itemType;
    const schema = ITEM_SHEET_SCHEMAS[type] || { tabs: [{ fields: [] }] };
    const values = this.document?.data || {};
    const getVal = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), values);

    // description/weight already show in their own field (header/Description
    // section), don't duplicate them on the Details tab.
    const skipInDetails = new Set(['description', 'weight']);
    const fields = (schema.tabs?.[0]?.fields || [])
      .filter((f) => !skipInDetails.has(f.key))
      .map((f) => ({
        key: f.key,
        label: f.labelKey ? (window.Loom?.i18n?.localize?.(`SDR5E.ItemUse.${f.labelKey}`) || f.labelKey) : f.label,
        type: f.type,
        isTextarea: f.type === 'textarea',
        isBoolean: f.type === 'boolean',
        isNumber: f.type === 'number',
        isSelect: f.type === 'select',
        options: f.options?.map((o) => ({
          ...o,
          label: o.labelKey ? (window.Loom?.i18n?.localize?.(`SDR5E.ItemUse.${o.labelKey}`) || o.labelKey) : o.label,
          selected: o.value === getVal(f.key),
        })),
        value: f.type === 'csv' ? (getVal(f.key) || []).join(', ') : getVal(f.key),
      }));

    const tags = [];
    if (values.equipped) tags.push('Equipped');
    if (values.magical) tags.push('Magical');
    if (values.identified === false) tags.push('Unidentified');
    if (type === 'weapon' && values.weaponType) tags.push(values.weaponType);
    if (type === 'armor' && values.armorType) tags.push(values.armorType);
    if (type === 'spell') {
      if (values.concentration) tags.push('Concentration');
      if (values.ritual) tags.push('Ritual');
      if (values.school) tags.push(values.school);
    }

    let rawEffects = [];
    if (this.document?.id && typeof effects?.forItem === 'function') {
      try {
        rawEffects = await effects.forItem(this.document.id);
      } catch {
        // Unpersisted item or preview
      }
    }
    if ((!rawEffects || !rawEffects.length) && Array.isArray(values.effects)) {
      rawEffects = values.effects;
    }

    const itemEffects = (rawEffects || []).map((e) => {
      let durationLabel = 'Permanent';
      if (e.durationUnit && e.durationUnit !== 'permanent') {
        durationLabel = `${e.duration} ${e.durationUnit}`;
      } else if (typeof e.duration === 'number' && e.duration > 0) {
        durationLabel = `${e.duration} round${e.duration === 1 ? '' : 's'}`;
      }
      const changesSummary = Array.isArray(e.changes) ? e.changes.map((c) => `${c.key}: ${c.mode} ${c.value}`).join(' • ') : '';
      return {
        ...e,
        durationLabel,
        changesSummary,
      };
    });

    return {
      ...context,
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      icon: ITEM_TYPE_ICON[type] || '📦',
      imgUrl: this.document?.imgUrl || '',
      rarity: values.rarity || 'common',
      weight: values.weight ?? 0,
      priceGp: values.price?.gp ?? 0,
      hasQuantity: type === 'item',
      quantity: values.quantity ?? 1,
      description: values.description || '',
      tags,
      fields,
      effects: itemEffects,
      effectsCount: itemEffects.length,
    };
  }
}
