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
    if (action === 'start-combat') { void this._startCombat(); return; }
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
    const stage = await this._getStageContext();
    if (!stage) { showToast?.('No active stage found — open a stage first','warning'); return; }
    const placed = await this._placeMissingMembers(stage, members);
    showToast?.(placed ? `${placed} creatures placed` : 'Encounter tokens are already on this stage','success');
  }

  async _getStageContext() {
    let stage = null;
    try { stage = await api.get('/stages/active'); } catch (e) { console.warn(e); }
    if (!stage?.id) {
      try {
        const worldId = window.Loom?.world?.id;
        if (!worldId) return null;
        const result = await api.get(`/stages?worldId=${encodeURIComponent(worldId)}`);
        const stages = Array.isArray(result) ? result : result?.entries || [];
        stage = stages.find((entry) => entry.isActive) || stages[0] || null;
      } catch (e) { console.warn(e); }
    }
    if (!stage?.id) return null;
    return {
      ...stage,
      gridSize: Number(stage.gridSize) || 50,
      width: Number(stage.width) || 1000,
      height: Number(stage.height) || 1000,
      padding: Number(stage.padding) || 0,
    };
  }

  async _placeMissingMembers(stage, members) {
    let casts = [];
    try {
      const result = await api.get(`/cast?stageId=${encodeURIComponent(stage.id)}`);
      casts = Array.isArray(result) ? result : result?.entries || [];
    } catch (e) { console.warn(e); }

    const placedByActor = new Map();
    for (const cast of casts) {
      if (!cast.actorId) continue;
      placedByActor.set(cast.actorId, (placedByActor.get(cast.actorId) || 0) + 1);
    }

    let placed = 0;
    let col = casts.length % 5;
    let row = Math.floor(casts.length / 5);
    const perRow = 5;
    for (const member of members) {
      const actorId = member.actorId;
      if (!actorId) continue;
      let actor;
      try { actor = await api.get(`/actors/${actorId}`); } catch { continue; }
      if (!actor || actor.type !== 'npc') continue;

      const quantity = Math.max(1, Math.floor(Number(member.quantity?.value) || 1));
      const alreadyPlaced = placedByActor.get(actorId) || 0;
      for (let index = alreadyPlaced; index < quantity; index++) {
        const centerX = Math.round((stage.width / 2 + stage.padding) / stage.gridSize) * stage.gridSize;
        const centerY = Math.round((stage.height / 2 + stage.padding) / stage.gridSize) * stage.gridSize;
        const x = centerX + (col - Math.floor(perRow / 2)) * stage.gridSize;
        const y = centerY + row * stage.gridSize;
        const name = quantity > 1 ? `${actor.name} ${index + 1}` : actor.name;
        try {
          const created = await api.post('/cast', { actorId, isLinked: false, stageId: stage.id, x, y, name });
          if (created?.id) casts.push(created);
          placed++;
        } catch (e) { console.warn('cast failed', e); }
        col++;
        if (col >= perRow) { col = 0; row++; }
      }
      placedByActor.set(actorId, Math.max(alreadyPlaced, quantity));
    }
    return placed;
  }

  async _startCombat() {
    if (!window.Loom?.user?.isGM) { showToast?.('Only GM can start combat','warning'); return; }
    const worldId = window.Loom?.world?.id;
    if (!worldId) { showToast?.('No active world found','error'); return; }
    const members = this.document?.systemData?.members || [];
    if (!members.length) { showToast?.('Add at least one creature to the encounter','warning'); return; }

    const stage = await this._getStageContext();
    if (!stage) { showToast?.('No active stage found — open a stage first','warning'); return; }
    await this._placeMissingMembers(stage, members);

    let casts;
    try {
      const result = await api.get(`/cast?stageId=${encodeURIComponent(stage.id)}`);
      casts = Array.isArray(result) ? result : result?.entries || [];
    } catch (e) {
      showToast?.(e?.message || 'Could not load tokens from the active stage','error');
      return;
    }

    const encounterActorIds = new Set(members.map((member) => member.actorId).filter(Boolean));
    const eligibleCasts = await Promise.all(casts.map(async (cast) => {
      if (!cast.actorId) return null;
      if (encounterActorIds.has(cast.actorId)) return cast;
      try {
        const actor = await api.get(`/actors/${cast.actorId}`);
        return actor?.type === 'character' ? cast : null;
      } catch { return null; }
    }));
    const castIds = [...new Set(eligibleCasts.filter(Boolean).map((cast) => cast.id))];
    if (!castIds.length) { showToast?.('No party or encounter tokens found on this stage','warning'); return; }

    try {
      const currentCombat = await api.get(`/combat/${encodeURIComponent(worldId)}`);
      if (currentCombat?.isActive && !window.confirm('A combat is already active. Starting this encounter will replace its turn order. Continue?')) return;
      const initiativeFormula = window.Loom?.settings?.get('srd5e', 'initiativeFormula')
        || '1d20 + floor((@abilities.dex.value - 10) / 2) + @attributes.initiative.value + @attributes.initiative.bonus + (@abilities.dex.value / 100)';
      await api.post(`/combat/${encodeURIComponent(worldId)}/dex-initiative`, { castIds, initiativeFormula });
      showToast?.('Combat started with the encounter and party tokens on this stage','success');
    } catch (e) {
      showToast?.(e?.message || 'Could not start combat','error');
    }
  }

  get title(){ return this.document?.name || 'Encounter'; }
  get documentName(){ return 'actor'; }
  get apiRoute(){ return '/actors'; }
  get dataKey(){ return 'systemData'; }
}
