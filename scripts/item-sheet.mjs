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

import { LoomHandlebarsMixin, LoomItemSheet, api } from '/_loom/sdk/index.js';
import { ITEM_TYPE_ICON } from './config.mjs';
import { setPathValue } from './utils.mjs';
import { ITEM_SHEET_SCHEMAS } from './sheet-schemas.mjs';

export class Sdr5eItemSheet extends LoomHandlebarsMixin(LoomItemSheet) {
  static DEFAULT_OPTIONS = { position: { width: 380, height: 460 } };
  _formSaveTimer;

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

  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/item-native.hbs' } };

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
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  /**
   * `imgUrl` is a native top-level field on every Loom item (confirmed in
   * `server/applications/schemas/items.schema.ts`) — this ruleset just
   * never wired a picker to it, so every item fell back to a generic
   * type icon (🗡️/🛡️/etc) with no way to assign real artwork per item.
   * `FilePicker` itself is real Loom code; it's only reachable through
   * `Loom.applications.apps.FilePicker.implementation` — a path shaped for
   * converted Foundry systems, but the class behind it isn't an emulation
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

  async _flushPendingFields() {
    if (!this.document || this._pendingFields.size === 0) return;
    const pending = this._pendingFields;
    this._pendingFields = new Map();

    const data = this.document.data || {};
    let name;
    for (const [key, value] of pending) {
      if (key === 'name') name = value;
      else setPathValue(data, key.slice(3), value);
    }
    const submitData = { data };
    if (name !== undefined) submitData.name = name;

    await api.put(`${this.apiRoute}/${this.document.id}`, submitData);
    await this._reloadDocument();
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const type = this.document?.type;
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
        label: f.label,
        type: f.type,
        isTextarea: f.type === 'textarea',
        isBoolean: f.type === 'boolean',
        isNumber: f.type === 'number',
        isSelect: f.type === 'select',
        options: f.options?.map((o) => ({ ...o, selected: o.value === getVal(f.key) })),
        value: getVal(f.key),
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
    };
  }
}
