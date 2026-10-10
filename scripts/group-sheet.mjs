import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, showToast, LoomDialog } from '/_loom/sdk/index.js';
import { getSetting, setSetting } from './settings.mjs';
import { takeRest } from './rest.mjs';
import { attachFormSaver, readDropPayload } from './utils.mjs';
import { fetchPreparedActor } from './prepare-data.mjs';
import { Sdr5eCharacterSheet } from './character-sheet.mjs';
import { groupXpAwardPreview, resolveGroupXpRecipients } from './group-xp.mjs';

function groupXpText(key, values = {}) {
  const source = window.Loom?.i18n?.localize?.(`SDR5E.GroupXP.${key}`) || `SDR5E.GroupXP.${key}`;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), source);
}

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
      _canAwardXP: window.Loom?.user?.isGM === true,
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
    if (action === 'award-xp') { void this._awardXP(); return; }
    if (action === 'award') { void this._awardTreasure(); return; }
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
        const rested = await takeRest(fresh, kind, {
          promptPreparedSpells: kind === 'long'
            ? (restingActor) => Sdr5eCharacterSheet.promptPreparedSpells(restingActor)
            : undefined,
        });
        if (rested) count++;
      }catch(e){ console.warn('rest failed',e); }
    }
    await window.Loom.ChatMessage.create({ content: `${kind} rest for ${count} members`, flags:{ srd5e:{ name:`${this.document.name} — ${kind} rest`, description:`<div>Rest for ${count} characters</div>` } } });
    await this._reloadDocument();
  }

  async _characterMemberActors(memberIds) {
    const ids = Array.isArray(memberIds) ? memberIds : [];
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const actor = await api.get(`/actors/${id}`);
        return actor?.type === 'character' ? { id, name: actor.name || groupXpText('UnnamedCharacter') } : null;
      } catch {
        return null;
      }
    }));
    return results.filter(Boolean);
  }

  async _awardXP() {
    if (window.Loom?.user?.isGM !== true) {
      showToast?.(groupXpText('GMOnly'), 'warning');
      return;
    }

    const memberActors = await this._characterMemberActors(this.document?.systemData?.members);
    if (!memberActors.length) {
      showToast?.(groupXpText('NoCharacters'), 'warning');
      return;
    }

    const form = document.createElement('div');
    form.className = 'sdrn-group-xp-form';
    const label = document.createElement('label');
    label.className = 'sdrn-group-xp-amount-label';
    label.append(document.createTextNode(groupXpText('PerCharacterLabel')));
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.value = '0';
    input.inputMode = 'numeric';
    label.append(input);
    const summary = document.createElement('p');
    summary.className = 'sdrn-group-xp-preview';
    const chooseSpecific = document.createElement('input');
    chooseSpecific.type = 'checkbox';
    const modeLabel = document.createElement('label');
    modeLabel.className = 'sdrn-group-xp-mode';
    modeLabel.append(chooseSpecific, document.createTextNode(groupXpText('ChooseRecipients')));
    const recipientList = document.createElement('div');
    recipientList.className = 'sdrn-group-xp-recipients';
    recipientList.hidden = true;
    for (const member of memberActors) {
      const row = document.createElement('label');
      row.className = 'sdrn-group-xp-recipient';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = member.id;
      checkbox.checked = true;
      const name = document.createElement('span');
      name.textContent = member.name;
      row.append(checkbox, name);
      recipientList.append(row);
    }
    form.append(label, modeLabel, recipientList, summary);

    const selectedMemberIds = () => resolveGroupXpRecipients(
      memberActors.map(({ id }) => id),
      [...recipientList.querySelectorAll('input:checked')].map((checkbox) => checkbox.value),
      chooseSpecific.checked,
    );

    const updatePreview = () => {
      try {
        const selectedIds = selectedMemberIds();
        if (!selectedIds.length) {
          summary.textContent = groupXpText('NoRecipientSelected');
          return;
        }
        const preview = groupXpAwardPreview(input.value, selectedIds.length);
        summary.textContent = groupXpText('Preview', {
          each: preview.xpPerCharacter,
          count: preview.recipientCount,
          total: preview.totalXp,
          recipients: groupXpText(chooseSpecific.checked ? 'SelectedRecipients' : 'AllRecipients', { count: preview.recipientCount }),
        });
      } catch {
        summary.textContent = groupXpText('EnterPositiveXP');
      }
    };
    input.addEventListener('input', updatePreview);
    chooseSpecific.addEventListener('change', () => {
      recipientList.hidden = !chooseSpecific.checked;
      updatePreview();
    });
    recipientList.addEventListener('change', updatePreview);
    updatePreview();

    const result = await LoomDialog.wait({
      window: { title: groupXpText('DialogTitle') },
      content: form,
      width: 360,
      buttons: [{
        action: 'confirm',
        label: groupXpText('Confirm'),
        variant: 'primary',
        callback: () => ({ xpPerCharacter: Number(input.value), memberIds: selectedMemberIds() }),
      }],
    });
    if (!result) return;
    if (!result.memberIds.length) {
      showToast?.(groupXpText('NoRecipientSelected'), 'warning');
      return;
    }

    let preview;
    try {
      preview = groupXpAwardPreview(result.xpPerCharacter, result.memberIds.length);
    } catch {
      showToast?.(groupXpText('EnterPositiveXP'), 'warning');
      return;
    }

    let currentGroup;
    try {
      currentGroup = await api.get(`/actors/${this.document.id}`);
    } catch {
      showToast?.(groupXpText('AwardFailed'), 'error');
      return;
    }
    const currentMemberActors = await this._characterMemberActors(currentGroup?.systemData?.members);
    const currentMemberIds = currentMemberActors.map(({ id }) => id);
    const originalMemberIds = memberActors.map(({ id }) => id);
    if (currentGroup?.type !== 'group' || JSON.stringify([...currentMemberIds].sort()) !== JSON.stringify([...originalMemberIds].sort())
      || result.memberIds.some((id) => !currentMemberIds.includes(id))) {
      showToast?.(groupXpText('GroupChanged'), 'warning');
      return;
    }

    let actors;
    try {
      actors = await Promise.all(result.memberIds.map((id) => api.get(`/actors/${id}`)));
    } catch {
      showToast?.(groupXpText('AwardFailed'), 'error');
      return;
    }
    if (actors.some((actor) => actor?.type !== 'character')) {
      showToast?.(groupXpText('GroupChanged'), 'warning');
      return;
    }

    const snapshots = actors.map((actor) => {
      const systemData = actor.systemData || {};
      const details = systemData.details || {};
      const xp = details.xp || {};
      const current = Number(xp.value) || 0;
      return { actor, systemData, details, xp, current, next: current + preview.xpPerCharacter };
    });
    if (snapshots.some(({ current, next }) => !Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(next))) {
      showToast?.(groupXpText('InvalidStoredXP'), 'warning');
      return;
    }
    const completed = [];
    try {
      for (const snapshot of snapshots) {
        await api.put(`/actors/${snapshot.actor.id}`, {
          systemData: {
            ...snapshot.systemData,
            details: { ...snapshot.details, xp: { ...snapshot.xp, value: snapshot.next } },
          },
        });
        completed.push(snapshot);
      }
    } catch (error) {
      let rollbackFailed = false;
      for (const snapshot of snapshots.slice().reverse()) {
        try {
          const latest = await api.get(`/actors/${snapshot.actor.id}`);
          const latestSystemData = latest?.systemData || {};
          const latestDetails = latestSystemData.details || {};
          const latestXp = latestDetails.xp || {};
          const latestValue = Number(latestXp.value) || 0;
          if (latestValue === snapshot.current) continue;
          if (latestValue !== snapshot.next) {
            rollbackFailed = true;
            continue;
          }
          await api.put(`/actors/${snapshot.actor.id}`, {
            systemData: {
              ...latestSystemData,
              details: { ...latestDetails, xp: { ...latestXp, value: snapshot.current } },
            },
          });
        } catch {
          rollbackFailed = true;
        }
      }
      console.error('[SDR5E] Group XP award failed', error);
      showToast?.(groupXpText(rollbackFailed ? 'AwardPartialFailure' : 'AwardRolledBack', {
        completed: completed.length,
        count: snapshots.length,
      }), 'error');
      return;
    }

    await window.Loom.ChatMessage.create({
      content: groupXpText('AwardChat', { each: preview.xpPerCharacter, count: preview.recipientCount, total: preview.totalXp }),
      flags: { srd5e: { name: `${this.document.name} — ${groupXpText('ChatTitle')}`, description: groupXpText('AwardChat', { each: preview.xpPerCharacter, count: preview.recipientCount, total: preview.totalXp }) } },
    });
    await this._reloadDocument();
  }

  async _awardTreasure() {
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
        <label>PP <input type="number" class="award-pp" value="0" /></label>
        <label>GP <input type="number" class="award-gp" value="0" /></label>
        <label>EP <input type="number" class="award-ep" value="0" /></label>
        <label>SP <input type="number" class="award-sp" value="0" /></label>
        <label>CP <input type="number" class="award-cp" value="0" /></label>
        <label><input type="checkbox" class="award-from-vault" /> Deduct from vault</label>
      </div>`;
    const ppInput = container.querySelector('.award-pp');
    const gpInput = container.querySelector('.award-gp');
    const epInput = container.querySelector('.award-ep');
    const spInput = container.querySelector('.award-sp');
    const cpInput = container.querySelector('.award-cp');
    const fromVault = container.querySelector('.award-from-vault');
    const result = await LoomDialog.wait({
      window:{ title:'Award Treasure' },
      content: container,
      width: 360,
      buttons:[{ action:'confirm', label:'Award', variant:'primary', callback:()=>({
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
    const perPp = Math.floor(result.pp / n);
    const perGp = Math.floor(result.gp / n);
    const perEp = Math.floor(result.ep / n);
    const perSp = Math.floor(result.sp / n);
    const perCp = Math.floor(result.cp / n);
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
      const ppVal = Number(details.pp?.value)||0;
      const gpVal = Number(details.gp?.value)||0;
      const epVal = Number(details.ep?.value)||0;
      const spVal = Number(details.sp?.value)||0;
      const cpVal = Number(details.cp?.value)||0;
      await api.put(`/actors/${mid}`, { systemData: {
        ...asd,
        details: { ...details, pp:{value:ppVal+perPp}, gp:{value:gpVal+perGp}, ep:{value:epVal+perEp}, sp:{value:spVal+perSp}, cp:{value:cpVal+perCp} }
      } });
    }
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
    const coinDetails = `PP ${perPp}, GP ${perGp}, EP ${perEp}, SP ${perSp}, CP ${perCp} each`;
    await window.Loom.ChatMessage.create({ content:`Award treasure: ${coinDetails}`, flags:{ srd5e:{ name:`${this.document.name} — Award treasure`, description:`<div>Each of ${n} characters receives ${coinDetails}. Coin remainder in vault.</div>` } } });
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
