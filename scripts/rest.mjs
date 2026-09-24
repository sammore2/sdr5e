import { api } from '/_loom/sdk/index.js';
import { spendHitDie } from './roll-engine.mjs';
import { fetchPreparedActor } from './prepare-data.mjs';

export async function takeRest(actor, kind, opts = {}) {
  if (!actor) return null;
  const promptHitDice = opts.promptHitDice || null;
  // Ensure we have fresh data
  let currentActor = actor;
  try {
    const fresh = await window.Loom?.api?.get(`/actors/${actor.id}?populate=true`);
    if (fresh) currentActor = fresh;
  } catch {}

  let hitDiceSpent = 0;
  let hitDiceHealed = 0;
  if (kind === 'short' && typeof promptHitDice === 'function') {
    const hdAvailable = currentActor.systemData?.resources?.hitDice?.value ?? 0;
    const toSpend = await promptHitDice(hdAvailable);
    for (let i = 0; i < toSpend; i++) {
      // Re-fetch before each spend to have updated actor
      try {
        const fresh = await window.Loom.api.get(`/actors/${currentActor.id}?populate=true`);
        if (fresh) currentActor = fresh;
      } catch {}
      const result = await spendHitDie(currentActor);
      if (!result) break;
      hitDiceSpent += 1;
      hitDiceHealed += result.healAmount;
      try {
        const fresh2 = await window.Loom.api.get(`/actors/${currentActor.id}?populate=true`);
        if (fresh2) currentActor = fresh2;
      } catch {}
    }
  }

  // Restore uses
  const items = currentActor.items || [];
  const restored = [];
  for (const it of items) {
    const idata = it.system || it.data || {};
    const uses = idata.uses;
    const max = Number(uses?.max) || 0;
    if (!uses || max <= 0) continue;
    const matches = uses.recovery === 'lr' ? kind === 'long' : uses.recovery === 'sr';
    if (!matches) continue;
    const value = Number(uses.value) || 0;
    if (value >= max) continue;
    await api.put(`/items/${it.id}`, { data: { ...idata, uses: { ...uses, value: max } } });
    restored.push(it.name);
  }
  if (restored.length) {
    try {
      const fresh = await window.Loom.api.get(`/actors/${currentActor.id}?populate=true`);
      if (fresh) currentActor = fresh;
    } catch {}
  }

  const sd = currentActor.systemData;
  const res = sd.resources || {};
  const recovered = [];
  if (hitDiceSpent > 0) recovered.push(`${hitDiceSpent} Hit Die spent (+${hitDiceHealed} HP)`);
  if (restored.length) recovered.push(`Uses restored: ${restored.join(', ')}`);

  if (res.racial?.reset === 'short' || kind === 'long') {
    if (res.racial && res.racial.value < res.racial.max) recovered.push(`${res.racial.label || 'Racial'} (${res.racial.max - res.racial.value})`);
    if (res.racial) res.racial.value = res.racial.max;
  }
  if (res.primary?.reset === 'short' || kind === 'long') {
    if (res.primary && res.primary.value < res.primary.max) recovered.push(`${res.primary.label || 'Resource'} (${res.primary.max - res.primary.value})`);
    if (res.primary) res.primary.value = res.primary.max;
  }

  if (kind === 'long') {
    const hpBefore = res.health?.value ?? 0;
    let longRestCap = res.health?.max ?? 0;
    try {
      const prepared = await fetchPreparedActor(currentActor.id);
      longRestCap = prepared?.systemData?.resources?.health?.effectiveMax ?? prepared?.systemData?.resources?.health?.max ?? longRestCap;
    } catch {}
    if (res.health) { res.health.value = longRestCap; res.health.temp = 0; }
    if (res.health && longRestCap > hpBefore) recovered.unshift(`HP +${longRestCap - hpBefore}`);
    const hdBefore = res.hitDice?.value ?? 0;
    if (res.hitDice) {
      const hdRecoverAmount = Math.max(1, Math.floor((res.hitDice.max || 0) / 2));
      res.hitDice.value = Math.min(res.hitDice.max, hdBefore + hdRecoverAmount);
    }
    if (res.hitDice && res.hitDice.value > hdBefore) recovered.push(`Hit Dice +${res.hitDice.value - hdBefore}`);
    let slotsRestored = 0;
    for (const lvl of Object.keys(res.spellSlots || {})) {
      const slot = res.spellSlots[lvl];
      if (slot && slot.value < slot.max) { slotsRestored += slot.max - slot.value; slot.value = slot.max; }
    }
    if (slotsRestored > 0) recovered.push(`${slotsRestored} spell slot${slotsRestored === 1 ? '' : 's'}`);
    if (res.deathSaves) { res.deathSaves.successes = 0; res.deathSaves.failures = 0; }
    const exhaustionBefore = res.exhaustion || 0;
    res.exhaustion = Math.max(0, exhaustionBefore - 1);
    if (exhaustionBefore > 0) recovered.push('Exhaustion -1');
    res.shortRestsDone = 0;
  } else {
    res.shortRestsDone = (res.shortRestsDone || 0) + 1;
    const classItem = (currentActor.items || []).find((i) => i.type === 'class');
    const cdata = classItem ? (classItem.system || classItem.data || {}) : null;
    if (cdata?.casterType === 'pact') {
      let pactSlotsRestored = 0;
      for (const lvl of Object.keys(res.spellSlots || {})) {
        const slot = res.spellSlots[lvl];
        if (slot && slot.value < slot.max) { pactSlotsRestored += slot.max - slot.value; slot.value = slot.max; }
      }
      if (pactSlotsRestored > 0) recovered.push(`${pactSlotsRestored} Pact Magic slot${pactSlotsRestored === 1 ? '' : 's'}`);
    }
  }

  await api.put(`/actors/${currentActor.id}`, { systemData: sd });
  const summary = recovered.length ? recovered.join(' &middot; ') : 'Nothing to recover.';
  const label = kind === 'long' ? 'Long Rest' : 'Short Rest';
  await window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor: currentActor }),
    content: `${label} complete`,
    flags: { srd5e: { name: `${currentActor.name} — ${label}`, isRest: true, description: `<div>${summary}</div>` } },
  });
  return { recovered, label };
}
