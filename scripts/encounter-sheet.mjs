import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, showToast } from '/_loom/sdk/index.js';
import { ENCOUNTER_XP_BUDGET } from './config.mjs';
import { fetchPreparedActor } from './prepare-data.mjs';
import { getSetting } from './settings.mjs';
import { evaluateDamageFormula } from './roll-engine.mjs';
import { attachFormSaver, readDropPayload } from './utils.mjs';

export class Sdr5eEncounterSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 600, height: 500 } };
  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/encounter-sheet.hbs' } };

  constructor(props) {
    super({
      ...props,
      id: props?.id || `encounter-sheet-${props?.actorId}`,
      documentId: props.actorId,
      title: props.title || 'Encounter',
      showFooter: false,
      resizable: true,
      classes: ['sdrn-sheet', 'sdrn-encounter-sheet'],
    });
  }

  _activeTab = 'members';
  _hasDropListener = false;
  async mount() {
    await super.mount();
    attachFormSaver(this);
    this.element?.addEventListener('input', (e) => this._onChangeForm(e));
    this.element?.addEventListener('change', (e) => this._onChangeForm(e));
    this._attachDropListener();
    this._applyActiveTab();
  }
  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._attachDropListener();
    this._applyActiveTab();
  }

  _applyActiveTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeTab || 'members';
    root.querySelectorAll('.sdrn-encounter-tab-btn').forEach((btn) => {
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
    console.log('[encounter] drop payload', data);
    // Sidebar actor: { type:'Actor', id, uuid }
    // Compendium: may be { type:'Actor', compendiumId, ... } or similar
    if (data.type === 'Actor') {
      const actorId = data.id || (data.uuid || '').replace('Actor.','');
      if (!actorId) {
        // Maybe compendium payload without world id
        showToast?.('Import the NPC to the world before adding to encounter','warning');
        return;
      }
      try {
        const actor = await api.get(`/actors/${actorId}`);
        if (!actor) {
          showToast?.('Import the NPC to the world before adding to encounter','warning');
          return;
        }
        if (actor.type !== 'npc') { showToast?.('Only NPCs can be members of an encounter','warning'); return; }
        const sd = this.document.systemData || {};
        const members = sd.members || [];
        const existing = members.find((m) => m.actorId === actorId);
        if (existing) {
          existing.quantity.value = (Number(existing.quantity.value)||1) + 1;
          await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, members } });
        } else {
          const newMembers = [...members, { actorId, quantity: { value:1, formula:'' } }];
          await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, members: newMembers } });
        }
        await this._reloadDocument();
      } catch (e) {
        console.warn(e);
        showToast?.('Import the NPC to the world before adding','warning');
      }
      return;
    }
    // Compendium payload may be different (e.g., { type:'Compendium', ...})
    if (data.compendiumId || data.sourceId) {
      showToast?.('Import the NPC to the world before adding to encounter','warning');
      return;
    }
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const sd = this.document?.systemData || {};
    const members = sd.members || [];
    let totalXp = 0;
    const memberInfos = [];
    for (const m of members) {
      try {
        const actor = await api.get(`/actors/${m.actorId}`);
        if (!actor) {
          memberInfos.push({ ...m, missing:true, name:'Member removed', xp:0, cr:'', totalXp:0 });
          continue;
        }
        const xp = Number(actor.systemData?.details?.xp?.value) || 0;
        const cr = actor.systemData?.details?.cr ?? '';
        const qty = Number(m.quantity?.value) || 1;
        const lineXp = xp * qty;
        totalXp += lineXp;
        memberInfos.push({ ...m, name: actor.name, cr, xp, totalXp: lineXp, img: actor.imgUrl || actor.img || '' });
      } catch {
        memberInfos.push({ ...m, missing:true, name:'Member removed', xp:0, totalXp:0 });
      }
    }
    // Difficulty vs primary party
    let difficulty = null;
    let budget = null;
    const primaryId = getSetting('primaryParty','');
    if (!primaryId) {
      difficulty = 'Defina um Grupo Principal pra ver a dificuldade';
    } else {
      try {
        const party = await fetchPreparedActor(primaryId);
        const pMembers = party?.systemData?.members || [];
        let sumLevel=0; let count=0;
        for(const mid of pMembers){
          try{
            const a=await fetchPreparedActor(mid);
            if(a?.type==='character'){ sumLevel+= Number(a.systemData?.details?.level)||1; count++; }
          }catch{}
        }
        const avgLevel = count? Math.floor(sumLevel/count) : 1;
        const table = ENCOUNTER_XP_BUDGET[avgLevel] || ENCOUNTER_XP_BUDGET[1];
        const low = table.low * count;
        const moderate = table.moderate * count;
        const high = table.high * count;
        budget = { low, moderate, high };
        if (totalXp <= low) difficulty='Low';
        else if (totalXp <= moderate) difficulty='Moderate';
        else if (totalXp <= high) difficulty='High';
        else difficulty='Beyond High';
      } catch {
        difficulty='Defina um Grupo Principal pra ver a dificuldade';
      }
    }
    return {
      ...context,
      ...this.document,
      name: this.document?.name || '',
      systemData: sd,
      _members: memberInfos,
      _totalXp: totalXp,
      _difficulty: difficulty,
      _budget: budget,
      _description: sd.description || '',
      _currency: sd.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      _activeTab: this._activeTab || 'members',
      _isGM: !!window.Loom?.user?.isGM,
    };
  }

  onAction(action, id, target) {
    if (action === 'tab') {
      this._activeTab = id || target?.dataset?.tab || 'members';
      this._applyActiveTab();
      return;
    }
    if (action === 'remove-member') { void this._removeMember(id); return; }
    if (action === 'roll-quantities') { void this._rollQuantities(); return; }
    if (action === 'place-on-stage') { void this._placeOnStage(); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _removeMember(actorId) {
    const sd = this.document.systemData || {};
    const members = (sd.members || []).filter((m)=>m.actorId!==actorId);
    await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, members } });
    await this._reloadDocument();
  }

  async _rollQuantities() {
    const sd = this.document.systemData || {};
    const members = sd.members || [];
    let changed=false;
    const lines=[];
    for(const m of members){
      const formula = String(m.quantity?.formula||'').trim();
      if(!formula) continue;
      const rolled = evaluateDamageFormula(formula);
      const val = Math.max(1, rolled);
      lines.push(`${m.actorId}: ${formula} => ${val}`);
      m.quantity.value = val;
      changed=true;
    }
    if(changed){
      await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, members } });
      for(const line of lines){
        const m=line.match(/^(.*): .* => (\d+)$/);
        const name = m ? m[1] : line;
        const val = m ? Number(m[2]) : 0;
        window.Loom.dispatchRoll({ formula: String(val), mode: 'gmroll', meta:{ label: `${name} quantity: ${val}` } });
      }
      await this._reloadDocument();
    }
  }

  async _placeOnStage() {
    const isGM = !!window.Loom?.user?.isGM;
    if (!isGM) { showToast?.('Only GM can place tokens','warning'); return; }
    const sd = this.document.systemData || {};
    const members = sd.members || [];
    if(!members.length){ showToast?.('No members','warning'); return; }
    // Find active stage
    let stageId = null;
    let gridSize = 50;
    let stageWidth = 1000, stageHeight = 1000, padding = 0;
    try{
      const activeStage = await api.get('/stages/active');
      if(activeStage){ stageId = activeStage.id; gridSize = activeStage.gridSize || 50; stageWidth = activeStage.width || 1000; stageHeight = activeStage.height || 1000; padding = activeStage.padding || 0; }
    }catch(e){ console.warn(e); }
    if(!stageId){
      try{
        const worldId = window.Loom?.world?.id;
        const stages = await api.get(`/stages?worldId=${worldId}`);
        const list = Array.isArray(stages) ? stages : stages?.entries || [];
        const active = list.find((s)=>s.isActive) || list[0];
        stageId = active?.id;
        if(active){ gridSize = active.gridSize || gridSize; stageWidth = active.width || stageWidth; stageHeight = active.height || stageHeight; padding = active.padding || 0; }
      }catch(e){ console.warn(e); }
    }
    if(!stageId){ showToast?.('No active stage found — open a stage first','warning'); return; }
    let placed=0;
    let col=0, row=0;
    const perRow=5;
    for(const m of members){
      const qty = Number(m.quantity?.value)||1;
      let actor;
      try{ actor = await api.get(`/actors/${m.actorId}`); }catch{ continue; }
      if(!actor) continue;
      for(let i=0;i<qty;i++){
        const name = qty>1 ? `${actor.name} ${i+1}` : actor.name;
        const centerX = Math.round((stageWidth/2 + padding)/gridSize)*gridSize;
      const centerY = Math.round((stageHeight/2 + padding)/gridSize)*gridSize;
      const offsetX = (col - Math.floor(perRow/2))*gridSize;
      const offsetY = row*gridSize;
      const x = centerX + offsetX;
      const y = centerY + offsetY;
        try{
          await api.post('/cast', { actorId: m.actorId, isLinked:false, stageId, x, y, name });
          placed++;
        }catch(e){ console.warn('cast failed',e); }
        col++;
        if(col>=perRow){ col=0; row++; }
      }
    }
    showToast?.(`${placed} creatures placed`,'success');
  }

  get title(){ return this.document?.name || 'Encounter'; }
  get documentName(){ return 'actor'; }
  get apiRoute(){ return '/actors'; }
  get dataKey(){ return 'systemData'; }
}
