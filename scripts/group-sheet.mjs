import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, showToast, LoomDialog } from '/_loom/sdk/index.js';
import { getSetting, setSetting } from './settings.mjs';
import { takeRest } from './rest.mjs';
import { attachFormSaver, readDropPayload } from './utils.mjs';
import { fetchPreparedActor } from './prepare-data.mjs';

export class Sdr5eGroupSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 600, height: 500 } };
  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/group-sheet.hbs' } };

  constructor(props) {
    super({
      ...props,
      id: props?.id || `group-sheet-${props?.actorId}`,
      documentId: props.actorId,
      title: props.title || 'Group',
      showFooter: false,
      resizable: true,
      classes: ['sdrn-sheet', 'sdrn-group-sheet'],
    });
  }

  _hasDropListener = false;

  async mount() {
    await super.mount();
    attachFormSaver(this);
    this.element?.addEventListener('input', (e) => this._onChangeForm(e));
    this.element?.addEventListener('change', (e) => this._onChangeForm(e));
    this._attachDropListener();
  }
  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._attachDropListener();
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
    if (!data || data.type !== 'Actor') return;
    const actorId = data.id || (data.uuid || '').replace('Actor.','');
    if (!actorId) return;
    if (actorId === this.document.id) { showToast?.('Cannot add group to itself','warning'); return; }
    const sd = this.document.systemData || {};
    const members = sd.members || [];
    if (members.includes(actorId)) { showToast?.('Already a member','warning'); return; }
    try {
      const actor = await api.get(`/actors/${actorId}`);
      if (!actor || !['character','npc'].includes(actor.type)) { showToast?.('Only characters and NPCs can be members','warning'); return; }
    } catch { showToast?.('Actor not found','error'); return; }
    const newMembers = [...members, actorId];
    await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, members: newMembers } });
    await this._reloadDocument();
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const sd = this.document?.systemData || {};
    const members = sd.members || [];
    const currency = sd.currency || { pp:0,gp:0,ep:0,sp:0,cp:0 };
    const primaryParty = getSetting('primaryParty','');
    const isPrimary = primaryParty === this.document.id;
    // Fetch members in parallel
    const memberInfos = await Promise.all(members.map(async (id) => {
      try {
        const actor = await fetchPreparedActor(id);
        if (!actor) return { id, missing:true };
        const isChar = actor.type === 'character';
        const level = isChar ? (actor.systemData?.details?.level ?? 1) : (actor.systemData?.details?.cr ?? 0);
        const hp = isChar ? actor.systemData?.resources?.health : actor.systemData?.resources?.health;
        const ac = actor.systemData?.attributes?.da?.value ?? 10;
        const perception = 10 + (actor.systemData?.skills?.perception?.total ?? 0);
        return { id, name: actor.name, type: actor.type, level, hp: hp ? `${hp.value ?? 0}/${hp.max ?? 0}` : '', ac, perception, img: actor.imgUrl || actor.img || '' };
      } catch {
        return { id, missing:true };
      }
    }));
    return {
      ...context,
      ...this.document,
      name: this.document?.name || '',
      systemData: sd,
      _members: memberInfos,
      _currency: currency,
      _description: sd.description || '',
      _isPrimary: isPrimary,
    };
  }

  onAction(action, id, target) {
    if (action === 'remove-member') { void this._removeMember(id); return; }
    if (action === 'open-member') {
      api.get(`/actors/${id}`).then((a)=>{
        const Sheet = a?.type==='character' ? Sdr5eCharacterSheet : a?.type==='npc' ? Sdr5eNpcSheet : null;
        if(Sheet) windowManager.open(`actor-sheet-${id}`, Sheet, { actorId: id });
        else windowManager.open(`actor-sheet-${id}`, null, { actorId: id });
      });
      return;
    }
    if (action === 'short-rest-all') { void this._restAll('short'); return; }
    if (action === 'long-rest-all') { void this._restAll('long'); return; }
    if (action === 'award') { void this._award(); return; }
    if (action === 'set-primary-party') { void this._setPrimary(); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _removeMember(memberId) {
    const sd = this.document.systemData || {};
    const members = (sd.members || []).filter((m)=>m!==memberId);
    await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, members } });
    await this._reloadDocument();
  }

  async _restAll(kind) {
    const sd = this.document.systemData || {};
    const members = sd.members || [];
    let count=0;
    for(const mid of members){
      try{
        const actor = await api.get(`/actors/${mid}`);
        if(!actor || actor.type!=='character') continue;
        const fresh = await api.get(`/actors/${mid}`);
        await takeRest(fresh, kind, {});
        count++;
      }catch(e){ console.warn('rest failed',e); }
    }
    await window.Loom.ChatMessage.create({ content: `${kind} rest for ${count} members`, flags:{ srd5e:{ name:`${this.document.name} — ${kind} rest`, description:`<div>Rest for ${count} characters</div>` } } });
    await this._reloadDocument();
  }

  async _award() {
    const sd = this.document.systemData || {};
    const members = sd.members || [];
    const charIds = [];
    for(const mid of members){
      try{ const a=await api.get(`/actors/${mid}`); if(a?.type==='character') charIds.push(mid); }catch{}
    }
    if(!charIds.length){ showToast?.('No characters in group','warning'); return; }
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="display:grid;gap:8px;">
        <label>XP <input type="number" class="award-xp" value="0" /></label>
        <label>PP <input type="number" class="award-pp" value="0" /></label>
        <label>GP <input type="number" class="award-gp" value="0" /></label>
        <label>EP <input type="number" class="award-ep" value="0" /></label>
        <label>SP <input type="number" class="award-sp" value="0" /></label>
        <label>CP <input type="number" class="award-cp" value="0" /></label>
        <label><input type="checkbox" class="award-from-vault" /> Deduct from vault</label>
      </div>`;
    const xpInput = container.querySelector('.award-xp');
    const ppInput = container.querySelector('.award-pp');
    const gpInput = container.querySelector('.award-gp');
    const epInput = container.querySelector('.award-ep');
    const spInput = container.querySelector('.award-sp');
    const cpInput = container.querySelector('.award-cp');
    const fromVault = container.querySelector('.award-from-vault');
    const result = await LoomDialog.wait({
      window:{ title:'Award XP & Treasure' },
      content: container,
      width: 360,
      buttons:[{ action:'confirm', label:'Award', variant:'primary', callback:()=>({
        xp: Number(xpInput?.value)||0,
        pp: Number(ppInput?.value)||0,
        gp: Number(gpInput?.value)||0,
        ep: Number(epInput?.value)||0,
        sp: Number(spInput?.value)||0,
        cp: Number(cpInput?.value)||0,
        fromVault: !!fromVault?.checked,
      }) }],
    });
    if(!result) return;
    const n = charIds.length;
    const perXp = Math.floor(result.xp / n);
    const perPp = Math.floor(result.pp / n);
    const perGp = Math.floor(result.gp / n);
    const perEp = Math.floor(result.ep / n);
    const perSp = Math.floor(result.sp / n);
    const perCp = Math.floor(result.cp / n);
    const remXp = result.xp % n;
    const remPp = result.pp % n;
    const remGp = result.gp % n;
    const remEp = result.ep % n;
    const remSp = result.sp % n;
    const remCp = result.cp % n;
    if(result.fromVault){
      const vaultCheck = sd.currency || { pp:0,gp:0,ep:0,sp:0,cp:0 };
      if((vaultCheck.pp||0) < result.pp || (vaultCheck.gp||0) < result.gp || (vaultCheck.ep||0) < result.ep || (vaultCheck.sp||0) < result.sp || (vaultCheck.cp||0) < result.cp){
        showToast?.('Vault has insufficient funds','warning');
        return;
      }
    }
    for(const mid of charIds){
      const actor = await api.get(`/actors/${mid}`);
      const asd = actor.systemData || {};
      const details = asd.details || {};
      const xpVal = Number(details.xp?.value)||0;
      const ppVal = Number(details.pp?.value)||0;
      const gpVal = Number(details.gp?.value)||0;
      const epVal = Number(details.ep?.value)||0;
      const spVal = Number(details.sp?.value)||0;
      const cpVal = Number(details.cp?.value)||0;
      await api.put(`/actors/${mid}`, { systemData: {
        ...asd,
        details: { ...details, xp: { ...(details.xp||{}), value: xpVal + perXp }, pp:{value:ppVal+perPp}, gp:{value:gpVal+perGp}, ep:{value:epVal+perEp}, sp:{value:spVal+perSp}, cp:{value:cpVal+perCp} }
      } });
    }
    // remainder stays in vault
    let vault = { ...(sd.currency || { pp:0,gp:0,ep:0,sp:0,cp:0 }) };
    if(result.fromVault){
      vault.pp = (vault.pp||0) - result.pp;
      vault.gp = (vault.gp||0) - result.gp;
      vault.ep = (vault.ep||0) - result.ep;
      vault.sp = (vault.sp||0) - result.sp;
      vault.cp = (vault.cp||0) - result.cp;
      vault.pp += remPp; vault.gp += remGp; vault.ep += remEp; vault.sp += remSp; vault.cp += remCp;
    } else {
      vault.pp = (vault.pp||0) + remPp;
      vault.gp = (vault.gp||0) + remGp;
      vault.ep = (vault.ep||0) + remEp;
      vault.sp = (vault.sp||0) + remSp;
      vault.cp = (vault.cp||0) + remCp;
    }
    await api.put(`/actors/${this.document.id}`, { systemData: { ...sd, currency: vault } });
    const xpRemainder = remXp ? ` ${remXp} XP not distributed.` : '';
    const coinDetails = `PP ${perPp}, GP ${perGp}, EP ${perEp}, SP ${perSp}, CP ${perCp} each${xpRemainder}`;
    await window.Loom.ChatMessage.create({ content:`Award: ${perXp} XP each`, flags:{ srd5e:{ name:`${this.document.name} — Award`, description:`<div>Each of ${n} characters gains ${perXp} XP and ${coinDetails}. Remainder in vault.</div>` } } });
    await this._reloadDocument();
  }

  async _setPrimary(){
    await setSetting('primaryParty', this.document.id);
    showToast?.('Primary party set','success');
    await this._reloadDocument();
  }

  get title(){ return this.document?.name || 'Group'; }
  get documentName(){ return 'actor'; }
  get apiRoute(){ return '/actors'; }
  get dataKey(){ return 'systemData'; }
}
