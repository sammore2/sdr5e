import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, showToast } from '/_loom/sdk/index.js';
import { DAMAGE_TYPES, DAMAGE_TYPE_LABELS } from './config.mjs';
import { getDefaultData } from './schema.mjs';
import { postItemToChat } from './roll-engine.mjs';
import { attachFormSaver, readDropPayload } from './utils.mjs';
import { Sdr5eCharacterSheet } from './character-sheet.mjs';
import { Sdr5eNpcSheet } from './npc-sheet.mjs';

export class Sdr5eVehicleSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 600, height: 600 } };
  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/vehicle-sheet.hbs' } };

  constructor(props) {
    super({
      ...props,
      id: props?.id || `vehicle-sheet-${props?.actorId}`,
      documentId: props.actorId,
      title: props.title || 'Vehicle',
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['sdrn-sheet', 'sdrn-vehicle-sheet'],
    });
  }

  _activeTab = 'cargo';
  _hasDropListener = false;
  async mount() {
    await super.mount();
    attachFormSaver(this);
    this.element?.addEventListener('input', (e) => this._onChangeForm(e));
    this.element?.addEventListener('change', (e) => this._onChangeForm(e));
    this._applyActiveTab();
    this._detachSideTabs();
    this._attachDropListener();
  }
  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveTab();
    this._detachSideTabs();
    this._attachDropListener();
  }

  onClose() {
    this._cleanupSideTabs();
  }

  _detachSideTabs() {
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
    const tab = this._activeTab || 'cargo';
    (this._sideTabsEl || root).querySelectorAll('.sdrn-vehicle-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    root.querySelectorAll('[data-tab-content]').forEach((panel) => {
      panel.style.display = panel.dataset.tabContent === tab ? '' : 'none';
    });
  }
  _attachDropListener() {
    if (!this.element || this._hasDropListener) return;
    this._hasDropListener = true;
    this.element.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    this.element.addEventListener('drop', (e) => void this._onDrop(e));
  }

  async _onDrop(event) {
    event.preventDefault();
    const data = readDropPayload(event);
    if (!data) return;
    // Actor drop
    if (data.type === 'Actor') {
      const actorId = data.id || (data.uuid || '').replace('Actor.','');
      const target = event.target instanceof Element ? event.target.closest('[data-drop-target]') : null;
      const dropKind = target?.dataset?.dropTarget || 'crew';
      await this._addMember(actorId, dropKind);
      return;
    }
    // Item drop
    if (data.type === 'Item' || data.itemId) {
      const itemId = data.id || data.itemId;
      let source = data.data;
      if (!source && itemId) {
        try { source = await api.get(`/items/${itemId}`); } catch {}
      }
      if (!source) return;
      const itemType = source.type || 'item';
      if (!['weapon','feature'].includes(itemType)) { showToast?.('Only weapons/features can be added to vehicle','warning'); return; }
      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: source.name,
        type: itemType,
        imgUrl: source.imgUrl || source.img || '',
        data: source.system || source.data || getDefaultData(itemType),
        actorId: this.document.id,
      });
      await this._reloadDocument();
    }
  }

  async _addMember(actorId, kind) {
    if (!actorId) return;
    const sd = this.document.systemData || {};
    const crew = sd.crew || { max:0, members:[] };
    const passengers = sd.passengers || { max:0, members:[] };
    if (crew.members.includes(actorId) || passengers.members.includes(actorId)) { showToast?.('Already in crew or passengers','warning'); return; }
    // Check duplicate across lists
    if (kind === 'crew' && passengers.members.includes(actorId)) { showToast?.('Already a passenger','warning'); return; }
    if (kind === 'passengers' && crew.members.includes(actorId)) { showToast?.('Already crew','warning'); return; }
    try {
      const actor = await api.get(`/actors/${actorId}`);
      if (!actor || !['character','npc'].includes(actor.type)) { showToast?.('Only characters/NPCs can be members','warning'); return; }
    } catch { showToast?.('Actor not found','error'); return; }
    const target = kind === 'passengers' ? passengers : crew;
    const newMembers = [...target.members, actorId];
    const max = Number(target.max) || 0;
    if (max > 0 && newMembers.length > max) showToast?.(`${kind} over capacity!`,'warning');
    const newSd = { ...sd, [kind]: { ...target, members: newMembers } };
    await api.put(`/actors/${this.document.id}`, { systemData: newSd });
    await this._reloadDocument();
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const sd = this.document?.systemData || {};
    const attrs = sd.attributes || {};
    const res = sd.resources || {};
    const crew = sd.crew || { max:0, members:[] };
    const passengers = sd.passengers || { max:0, members:[] };
    const cargo = sd.cargo || { value:0, max:0 };
    const traits = sd.traits || { di:[],dr:[],dv:[],ci:[] };
    const items = this.document?.items || [];
    const weapons = items.filter((i)=>i.type==='weapon' || i.type==='feature');
    // Fetch crew/passengers info
    const fetchMembers = async (ids) => {
      const out=[];
      for(const id of ids){
        try{
          const a=await api.get(`/actors/${id}`);
          if(!a) out.push({id, missing:true});
          else out.push({id, name:a.name, type:a.type, img:a.imgUrl||a.img||''});
        }catch{ out.push({id, missing:true}); }
      }
      return out;
    };
    const crewInfos = await fetchMembers(crew.members);
    const passInfos = await fetchMembers(passengers.members);
    const movement = attrs.movement || { walk:0,fly:0,swim:0,climb:0,burrow:0,hover:false };
    const movementTags = Object.entries(movement).filter(([k,v])=>k!=='hover' && Number(v)>0).map(([k,v])=>({ mode:k, value:`${v} m` }));
    return {
      ...context,
      ...this.document,
      name: this.document?.name || '',
      systemData: sd,
      _vehicleType: sd.vehicleType || 'water',
      _ac: attrs.ac ?? 10,
      _damageThreshold: attrs.damageThreshold ?? 0,
      _travelSpeed: attrs.travelSpeed ?? 0,
      _movementTags: movementTags,
      _hover: !!movement.hover,
      _health: res.health || { value: 10, max: 10 },
      _healthPct: res.health?.max ? Math.min(100, Math.max(0, Math.round((Number(res.health.value) / Number(res.health.max)) * 100))) : 100,
      _currency: sd.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      _size: sd.details?.size || 'Large',
      _travelPace: (attrs.travelSpeed ? (Number(attrs.travelSpeed) * 24).toFixed(0) : '12') + ' mi/day',
      _activeTab: this._activeTab || 'cargo',
      _crew: { max: crew.max || 0, members: crewInfos, count: crewInfos.length },
      _passengers: { max: passengers.max || 0, members: passInfos, count: passInfos.length },
      _cargo: cargo,
      _traits: traits,
      _weapons: weapons,
      _description: sd.description || '',
      _damageTraits: ['di','dr','dv'].map((cat)=>({ cat, label: cat==='di'?'Immune':cat==='dr'?'Resist':'Vuln', types: DAMAGE_TYPES.map((t)=>({ type:t, label:DAMAGE_TYPE_LABELS[t], active:(traits[cat]||[]).includes(t) })) })),
    };
  }

  onAction(action, id, target) {
    if (action === 'tab') {
      this._activeTab = id || target?.dataset?.tab || 'cargo';
      this._applyActiveTab();
      return;
    }
    if (action === 'remove-crew') { void this._removeMember(id, 'crew'); return; }
    if (action === 'remove-passenger') { void this._removeMember(id, 'passengers'); return; }
    if (action === 'open-member') {
      const infos = [...(this.document?.systemData?.crew?.members||[]), ...(this.document?.systemData?.passengers?.members||[])];
      // Find type via cached context? Fetch
      api.get(`/actors/${id}`).then((a)=>{
        const Sheet = a?.type==='character' ? Sdr5eCharacterSheet : Sdr5eNpcSheet;
        windowManager.open(`actor-sheet-${id}`, Sheet, { actorId: id });
      });
      return;
    }
    if (action === 'post-item-chat') { const item=(this.document.items||[]).find((i)=>i.id===id); if(item) void postItemToChat(this.document, item); return; }
    if (action === 'delete-item') { void this._deleteItem(id); return; }
    if (action === 'create-item') { void this._createItem(target?.dataset?.itemType || 'weapon'); return; }
    if (action === 'toggle-damage-trait') { void this._toggleTrait(target.dataset.cat, target.dataset.type); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _removeMember(memberId, kind) {
    const sd = this.document.systemData || {};
    const group = sd[kind] || { max:0, members:[] };
    const newMembers = group.members.filter((m)=>m!==memberId);
    await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, [kind]: { ...group, members: newMembers } } });
    await this._reloadDocument();
  }

  async _toggleTrait(cat, type) {
    const sd = this.document.systemData || {};
    const traits = sd.traits || { di:[],dr:[],dv:[],ci:[] };
    const list = traits[cat] || [];
    const next = list.includes(type) ? list.filter((t)=>t!==type) : [...list, type];
    await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, traits: { ...traits, [cat]: next } } });
    await this._reloadDocument();
  }

  async _deleteItem(itemId){ if(!itemId) return; await api.delete(`/items/${itemId}`); await this._reloadDocument(); }
  async _createItem(type){ await api.post('/items', { worldId: window.Loom?.world?.id || this.document.worldId, name: `New ${type}`, type, data: getDefaultData(type), actorId: this.document.id }); await this._reloadDocument(); }

  get title(){ return this.document?.name || 'Vehicle'; }
  get documentName(){ return 'actor'; }
  get apiRoute(){ return '/actors'; }
  get dataKey(){ return 'systemData'; }
}
