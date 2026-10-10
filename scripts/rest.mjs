import { api } from '/_loom/sdk/index.js';
import { spendHitDie } from './roll-engine.mjs';
import { fetchPreparedActor } from './prepare-data.mjs';
import { restoredFeatureUses } from './rage-mechanics.mjs';
import { fighterClassLevel, syncedFighterFeatureUses } from './class-feature-mechanics.mjs';
import { resolveMulticlassLongRestPreparedSpellChoices } from './class-spellcasting.mjs';
import { resolveArcaneRecovery } from './arcane-recovery.mjs';
import { resetWizardSignatureSpellUses, resolveWizardMemorizeSpellChoice, resolveWizardSpellMasteryReplacement } from './wizard-spell-mechanics.mjs';
import { planSubclassSpellGrantReconciliation, resolveCircleLandAlwaysPreparedSpells } from './subclass-spell-grants.mjs';
import { resolveWeaponMasteryReplacement, weaponMasteryRestCandidates } from './weapon-mastery.mjs';

const LONG_REST_WAIT_MS = 16 * 60 * 60 * 1000;

/**
 * Milliseconds still to wait before another Long Rest may start (SRD 5.2 "Long Rest").
 * The completion time of the last Long Rest is stored as resources.lastLongRestAt (ISO string).
 * No record, or an unparseable one, means no wait. A future timestamp is treated as
 * just completed, so the wait never runs past 16 hours.
 */
function longRestWaitRemainingMs(resources, now = Date.now()) {
  const stored = resources?.lastLongRestAt;
  if (!stored) return 0;
  const last = Date.parse(stored);
  if (!Number.isFinite(last)) return 0;
  const elapsed = Math.max(0, now - last);
  return Math.max(0, LONG_REST_WAIT_MS - elapsed);
}

/**
 * Warns that the 16-hour wait is not over. Resolves true only when a GM chooses Yes (start anyway).
 * Players only get Cancel.
 */
async function confirmLongRestWait(remainingMs) {
  const isGM = window.Loom?.user?.isGM === true;
  const hours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
  const localize = (key) => window.Loom?.i18n?.localize?.(key);
  const content = document.createElement('p');
  content.textContent = (localize('SDR5E.Rest.LongRestWaitNotOver')
        || "The 16-hour wait since this creature's last Long Rest is not over (about {hours} h left).").replace('{hours}', String(hours));
  if (isGM) {
    content.textContent += ' ' + (localize('SDR5E.Rest.LongRestGmOverride')
      || 'As GM, you may start the Long Rest anyway.');
  }
  const buttons = [
    { action: 'cancel', label: localize('SDR5E.Combat.Cancel') || 'Cancel', variant: 'ghost', callback: () => 'cancel' },
  ];
  if (isGM) buttons.push({ action: 'yes', label: localize('SDR5E.Rest.LongRestYes') || 'Yes', variant: 'primary', callback: () => 'yes' });
  const answer = await LoomDialog.wait({
    window: { title: localize('SDR5E.Rest.LongRestTitle') || 'Long Rest' }, content, buttons,
  });
  return isGM && answer === 'yes';
}

export async function takeRest(actor, kind, opts = {}) {
  if (!actor) return null;
  const promptHitDice = opts.promptHitDice || null;
  // Ensure we have fresh data
  let currentActor = actor;
  try {
    const fresh = await fetchPreparedActor(actor.id);
    if (fresh) currentActor = fresh;
  } catch {}

  const initialResources = currentActor.systemData?.resources || {};
  // SRD 5.2 (Rest): both Short and Long Rests require at least 1 Hit Point to start.
  if ((kind === 'long' || kind === 'short') && Number(initialResources.health?.value) <= 0) {
    window.Loom?.showToast?.(`A ${kind === 'long' ? 'Long' : 'Short'} Rest requires at least 1 Hit Point to start.`, 'warning');
    return null;
  }
  if (initialResources.deathState === 'dead') {
    window.Loom?.showToast?.('A dead character cannot gain the benefits of a rest.', 'warning');
    return null;
  }

  // SRD 5.2 (Long Rest): at least 16 hours must pass after a Long Rest before another one starts.
  // Checked against the real clock using resources.lastLongRestAt; a GM may override.
  if (kind === 'long') {
    const remainingMs = longRestWaitRemainingMs(initialResources);
    if (remainingMs > 0 && !(await confirmLongRestWait(remainingMs))) return null;
  }

  if (kind === 'long' && typeof opts.promptPreparedSpells === 'function') {
    const choices = await opts.promptPreparedSpells(currentActor);
    if (choices) {
      const classItems = (currentActor.items || []).filter((item) => item.type === 'class');
      const classRoster = classItems.map((item) => {
        const data = item.system || item.data || {};
        const subclass = (currentActor.items || []).find((entry) => entry.type === 'subclass'
          && (entry.system || entry.data || {}).classIdentifier === data.classIdentifier);
        return { itemId: item.id, classIdentifier: data.classIdentifier, classLevel: data.levels,
          subclassName: data.subclassName || subclass?.name || '', circleLandTerrain: data.circleLandTerrain };
      });
      const resolved = resolveMulticlassLongRestPreparedSpellChoices(classRoster, choices);
      if (!resolved.valid || classItems.length !== classRoster.length) {
        window.Loom?.showToast?.('Prepared spells were not changed: review each class list and prepared count.', 'warning');
        return null;
      }
      const circleLandGrantsByClass = new Map();
      for (const choice of resolved.choices) {
        if (!choice.circleLandTerrain) continue;
        const grants = resolveCircleLandAlwaysPreparedSpells(choice.circleLandTerrain, choice.classLevel, choice.circleLandCandidates);
        if (!grants.valid) {
          window.Loom?.showToast?.('Prepared spells were not changed: a Circle of the Land spell is missing from the spell compendium.', 'warning');
          return null;
        }
        circleLandGrantsByClass.set(choice.classIdentifier, grants.grants);
      }
      // Validate all class choices first; only then begin the item writes.
      for (const { classIdentifier, selected } of resolved.choices) {
        const existing = (currentActor.items || []).filter((item) => item.type === 'spell'
          && (item.system || item.data || {}).sourceClassIdentifier === classIdentifier
          && (classIdentifier !== 'wizard' || (item.system || item.data || {}).wizardSpellbook === true)
          && !(item.system || item.data || {}).magicInitiate
          && !(item.system || item.data || {}).alwaysPrepared
          && Number((item.system || item.data || {}).spellLevel) > 0);
        const selectedExistingIds = new Set(selected.filter((entry) => entry.actorItem).map((entry) => entry.id));
        for (const entry of selected.filter((candidate) => !candidate.actorItem)) {
          await api.post('/items', { worldId: window.Loom?.world?.id, actorId: currentActor.id,
            name: entry.name, type: 'spell', data: { ...entry.data, prepared: true, sourceClassIdentifier: classIdentifier } });
        }
        for (const item of existing) {
          const data = item.system || item.data || {};
          const shouldPrepare = selectedExistingIds.has(item.id);
          if (!!data.prepared === shouldPrepare) continue;
          await api.put(`/items/${item.id}`, { data: { ...data, prepared: shouldPrepare } });
        }
        const circleLandGrants = circleLandGrantsByClass.get(classIdentifier);
        if (circleLandGrants) {
          const writes = planSubclassSpellGrantReconciliation(currentActor.items || [], classIdentifier,
            circleLandGrants, 'circle-land:');
          for (const write of writes) {
            if (write.kind === 'delete') await api.delete(`/items/${write.item.id}`);
            else if (write.kind === 'update') await api.put(`/items/${write.item.id}`, { data: write.data });
            else await api.post('/items', { worldId: window.Loom?.world?.id, actorId: currentActor.id,
              name: write.name, type: write.type, data: write.data });
          }
          const classItem = classItems.find((item) => item.id === resolved.choices.find((entry) => entry.classIdentifier === classIdentifier)?.itemId);
          if (classItem) {
            const data = classItem.system || classItem.data || {};
            if (data.circleLandTerrain !== resolved.choices.find((entry) => entry.classIdentifier === classIdentifier)?.circleLandTerrain) {
              await api.put(`/items/${classItem.id}`, { data: { ...data,
                circleLandTerrain: resolved.choices.find((entry) => entry.classIdentifier === classIdentifier).circleLandTerrain } });
            }
          }
        }
      }
      try {
        const fresh = await fetchPreparedActor(currentActor.id);
        if (fresh) currentActor = fresh;
      } catch {}
    }
  }

  let hitDiceSpent = 0;
  let hitDiceHealed = 0;
  if (kind === 'short' && typeof promptHitDice === 'function') {
    const hitDice = currentActor.systemData?.resources?.hitDice || {};
    const pools = hitDice.pools || {};
    const eligiblePoolList = Object.entries(pools).filter(([, pool]) => !pool.needsReview && (Number(pool.value) || 0) > 0);
    const hdAvailable = eligiblePoolList.length ? eligiblePoolList.reduce((sum, [, pool]) => sum + Number(pool.value || 0), 0) : (hitDice.value ?? 0);
    const toSpend = await promptHitDice(hdAvailable, eligiblePoolList.map(([id, pool]) => ({ id, ...pool })));
    for (let i = 0; i < toSpend; i++) {
      // Re-fetch before each spend to have updated actor
      try {
        const fresh = await fetchPreparedActor(currentActor.id);
        if (fresh) currentActor = fresh;
      } catch {}
      const currentPools = currentActor.systemData?.resources?.hitDice?.pools || {};
      const availablePools = Object.entries(currentPools).filter(([, pool]) => !pool.needsReview && (Number(pool.value) || 0) > 0);
      const selectedPoolId = availablePools.length > 1 && typeof opts.promptHitDiePool === 'function'
        ? await opts.promptHitDiePool(availablePools.map(([id, pool]) => ({ id, ...pool })))
        : availablePools[0]?.[0] || '';
      if (availablePools.length > 1 && !selectedPoolId) break;
      const result = await spendHitDie(currentActor, selectedPoolId);
      if (!result) break;
      hitDiceSpent += 1;
      hitDiceHealed += result.healAmount;
      try {
        const fresh2 = await fetchPreparedActor(currentActor.id);
        if (fresh2) currentActor = fresh2;
      } catch {}
    }
  }

  // Restore uses
  const items = currentActor.items || [];
  const restored = [];
  let featureDataChanged = false;
  const fighterLevel = fighterClassLevel(items);
  for (const it of items) {
    const idata = it.system || it.data || {};
    const signatureSpellUses = kind === 'short' || kind === 'long'
      ? (idata.identifier === 'signature-spells' && idata.classIdentifier === 'wizard'
        ? resetWizardSignatureSpellUses(idata, kind) : null)
      : null;
    const signatureUsesChanged = !!signatureSpellUses
      && Object.values(idata.signatureSpellUses || {}).some((value) => Number(value) !== 0);
    // SRD 5.2 Fighter Action Surge / Indomitable: max scales with Fighter level.
    const fighterUses = syncedFighterFeatureUses(idata, fighterLevel);
    const fighterScaleChanged = !!fighterUses
      && (Number(idata.uses?.max) || 0) !== Number(fighterUses.max)
      && (Number(fighterUses.max) || 0) > 0;
    const uses = fighterUses || idata.uses;
    const max = Number(uses?.max) || 0;
    if ((!uses || max <= 0) && !signatureUsesChanged) continue;
    const value = Number(uses?.value) || 0;
    const nextValue = uses && max > 0 ? restoredFeatureUses(uses, kind) : value;
    const usesChanged = uses && max > 0 && nextValue !== value;
    if (!usesChanged && !signatureUsesChanged && !fighterScaleChanged) continue;
    await api.put(`/items/${it.id}`, { data: { ...idata,
      ...(uses && max > 0 ? { uses: { ...uses, value: nextValue } } : {}),
      ...(signatureUsesChanged ? { signatureSpellUses } : {}),
    } });
    featureDataChanged = true;
    if (usesChanged || signatureUsesChanged) restored.push(it.name);
  }
  if (featureDataChanged) {
    try {
      const fresh = await fetchPreparedActor(currentActor.id);
      if (fresh) currentActor = fresh;
    } catch {}
  }

  const sd = currentActor.systemData;
  const res = sd.resources || {};
  const recovered = [];
  let arcaneRecoveryUsed = false;
  let wizardMemorizeSpellChoice = null;
  let wizardSpellMasteryReplacementChoice = null;
  if (hitDiceSpent > 0) recovered.push(`${hitDiceSpent} Hit Die spent (+${hitDiceHealed} HP)`);
  if (restored.length) recovered.push(`Uses restored: ${restored.join(', ')}`);

  if (res.racial?.reset === 'short' || kind === 'long') {
    if (res.racial && res.racial.value < res.racial.max) recovered.push(`${res.racial.label || 'Racial'} (${res.racial.max - res.racial.value})`);
    if (res.racial) res.racial.value = res.racial.max;
  }

  if (kind === 'short' && typeof opts.promptArcaneRecovery === 'function') {
    const wizard = (currentActor.items || []).find((item) => item.type === 'class'
      && (item.system || item.data || {}).classIdentifier === 'wizard');
    if (wizard && !currentActor.flags?.sdr5e?.arcaneRecoveryUsed) {
      const choice = await opts.promptArcaneRecovery(currentActor);
      if (choice) {
        const wizardLevel = Number((wizard.system || wizard.data || {}).levels) || 0;
        const result = resolveArcaneRecovery({ wizardLevel, spellSlots: res.spellSlots || {}, selected: choice });
        if (result.valid) {
          res.spellSlots = result.spellSlots;
          arcaneRecoveryUsed = true;
          const slotsRecovered = Object.entries(result.recovered).map(([level, count]) => `${count}× level ${level}`).join(', ');
          const message = window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.ArcaneRecoveryRecovered') || 'SDR5E.ClassFeatures.ArcaneRecoveryRecovered';
          recovered.push(message.replace('{slots}', slotsRecovered));
        } else {
          window.Loom?.showToast?.(window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.ArcaneRecoveryInvalid'), 'warning');
        }
      }
    }
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
      res.hitDice.value = res.hitDice.max;
      for (const pool of Object.values(res.hitDice.pools || {})) {
        pool.value = pool.max;
        pool.needsReview = false;
      }
      res.hitDice.needsReview = false;
    }
    if (res.hitDice && res.hitDice.value > hdBefore) recovered.push(`Hit Dice +${res.hitDice.value - hdBefore}`);
    let slotsRestored = 0;
    for (const lvl of Object.keys(res.spellSlots || {})) {
      const slot = res.spellSlots[lvl];
      if (slot && slot.value < slot.max) { slotsRestored += slot.max - slot.value; slot.value = slot.max; }
    }
    if (slotsRestored > 0) recovered.push(`${slotsRestored} spell slot${slotsRestored === 1 ? '' : 's'}`);
    if (res.pactMagic && !res.pactMagic.needsReview && res.pactMagic.value < res.pactMagic.max) {
      const pactRestored = res.pactMagic.max - res.pactMagic.value;
      res.pactMagic.value = res.pactMagic.max;
      recovered.push(`${pactRestored} Pact Magic slot${pactRestored === 1 ? '' : 's'}`);
    }
    if (res.deathSaves) { res.deathSaves.successes = 0; res.deathSaves.failures = 0; }
    const exhaustionBefore = res.exhaustion || 0;
    res.exhaustion = Math.max(0, exhaustionBefore - 1);
    if (exhaustionBefore > 0) recovered.push('Exhaustion -1');
    res.shortRestsDone = 0;
  } else {
    res.shortRestsDone = (res.shortRestsDone || 0) + 1;
    // Backward-compatible short-rest refill only for single-class Warlocks.
    // The shared legacy bucket cannot identify Pact slots on multiclass actors;
    // preserve those values instead of refilling normal slots accidentally.
    const classItems = (currentActor.items || []).filter((item) => item.type === 'class');
    const pactClass = classItems.map((item) => item.system || item.data || {})
      .find((classData) => classData.casterType === 'pact');
    if (pactClass && classItems.length === 1) {
      let pactSlotsRestored = 0;
      for (const slot of Object.values(res.spellSlots || {})) {
        if (slot && slot.value < slot.max) {
          pactSlotsRestored += slot.max - slot.value;
          slot.value = slot.max;
        }
      }
      if (pactSlotsRestored > 0) recovered.push(`${pactSlotsRestored} Pact Magic slot${pactSlotsRestored === 1 ? '' : 's'}`);
    }
    if (res.pactMagic && !res.pactMagic.needsReview && res.pactMagic.value < res.pactMagic.max) {
      const pactRestored = res.pactMagic.max - res.pactMagic.value;
      res.pactMagic.value = res.pactMagic.max;
      recovered.push(`${pactRestored} Pact Magic slot${pactRestored === 1 ? '' : 's'}`);
    }
  }

  if (kind === 'short' && typeof opts.promptWizardMemorizeSpell === 'function') {
    const choice = await opts.promptWizardMemorizeSpell(currentActor);
    if (choice) {
      const wizard = (currentActor.items || []).find((item) => item.type === 'class'
        && (item.system || item.data || {}).classIdentifier === 'wizard');
      const wizardLevel = Number((wizard?.system || wizard?.data || {}).levels) || 0;
      const spellbook = (currentActor.items || []).filter((item) => item.type === 'spell'
        && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
        && (item.system || item.data || {}).wizardSpellbook === true);
      const result = resolveWizardMemorizeSpellChoice(wizardLevel, spellbook, choice.replaceId, choice.replacementId);
      if (result.valid) wizardMemorizeSpellChoice = result;
      else window.Loom?.showToast?.(window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.MemorizeSpellInvalid'), 'warning');
    }
  }

  if (wizardMemorizeSpellChoice) {
    const replaced = (currentActor.items || []).find((item) => item.id === wizardMemorizeSpellChoice.replaceId);
    const replacement = (currentActor.items || []).find((item) => item.id === wizardMemorizeSpellChoice.replacementId);
    for (const [item, prepared] of [[replaced, false], [replacement, true]]) {
      const data = item.system || item.data || {};
      await api.put(`/items/${item.id}`, { data: { ...data, prepared } });
    }
    const message = window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.MemorizeSpellUsed') || 'SDR5E.ClassFeatures.MemorizeSpellUsed';
    recovered.push(message.replace('{spellOut}', replaced.name).replace('{spellIn}', replacement.name));
  }

  if (kind === 'long' && typeof opts.promptWizardSpellMasteryReplacement === 'function') {
    const choice = await opts.promptWizardSpellMasteryReplacement(currentActor);
    if (choice) {
      const wizard = (currentActor.items || []).find((item) => item.type === 'class'
        && (item.system || item.data || {}).classIdentifier === 'wizard');
      const wizardLevel = Number((wizard?.system || wizard?.data || {}).levels) || 0;
      const spellbook = (currentActor.items || []).filter((item) => item.type === 'spell'
        && (item.system || item.data || {}).sourceClassIdentifier === 'wizard'
        && (item.system || item.data || {}).wizardSpellbook === true);
      const result = resolveWizardSpellMasteryReplacement(wizardLevel, spellbook, choice.currentSpellId, choice.replacementSpellId);
      const feature = (currentActor.items || []).find((item) => item.id === choice.featureId && item.type === 'feature'
        && (item.system || item.data || {}).identifier === 'spell-mastery');
      const featureData = feature?.system || feature?.data || {};
      const selectedIds = [featureData.levelOneSpellId, featureData.levelTwoSpellId].map(String);
      if (result.valid && feature?.id && selectedIds.includes(String(choice.currentSpellId))) {
        const current = spellbook.find((item) => String(item.id) === String(choice.currentSpellId));
        const replacement = spellbook.find((item) => String(item.id) === String(choice.replacementSpellId));
        const nextIds = selectedIds.map((id) => id === String(choice.currentSpellId) ? String(choice.replacementSpellId) : id);
        await api.put(`/items/${feature.id}`, { data: { ...featureData,
          levelOneSpellId: nextIds[0], levelTwoSpellId: nextIds[1],
        } });
        for (const [item, prepared, alwaysPrepared] of [[current, false, false], [replacement, true, true]]) {
          const data = item.system || item.data || {};
          if (!!data.prepared !== prepared || !!data.alwaysPrepared !== alwaysPrepared) {
            await api.put(`/items/${item.id}`, { data: { ...data, prepared, alwaysPrepared } });
          }
        }
        wizardSpellMasteryReplacementChoice = { spellOut: current.name, spellIn: replacement.name };
      } else {
        window.Loom?.showToast?.(window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.SpellMasteryReplaceInvalid'), 'warning');
      }
    }
  }

  if (wizardSpellMasteryReplacementChoice) {
    const message = window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.SpellMasteryReplaceDone') || 'Spell Mastery: replaced {spellOut} with {spellIn}.';
    recovered.push(message.replace('{spellOut}', wizardSpellMasteryReplacementChoice.spellOut)
      .replace('{spellIn}', wizardSpellMasteryReplacementChoice.spellIn));
  }

  if (kind === 'long' && typeof opts.promptWeaponMasteryReplacement === 'function') {
    const selections = await opts.promptWeaponMasteryReplacement(currentActor);
    if (Array.isArray(selections) && selections.length) {
      const proficiencies = currentActor.systemData?.proficiencies?.weapons || [];
      const offers = weaponMasteryRestCandidates(currentActor.items || [], proficiencies);
      const writes = [];
      for (const selection of selections) {
        const offer = offers.find((candidate) => candidate.featureId === selection.featureId);
        const resolved = offer && resolveWeaponMasteryReplacement(offer.classIdentifier, offer.mastered,
          selection.replaceIdentifier, selection.replacementIdentifier, proficiencies);
        if (!resolved?.valid) {
          window.Loom?.showToast?.(window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.WeaponMasteryInvalid') || 'Weapon Mastery choices are invalid.', 'warning');
          writes.length = 0;
          break;
        }
        const feature = currentActor.items.find((item) => item.id === offer.featureId);
        writes.push({ feature, data: { ...(feature.system || feature.data || {}), masteredWeaponIdentifiers: resolved.choices } });
      }
      for (const { feature, data } of writes) {
        await api.put(`/items/${feature.id}`, { data });
        feature.system = data;
        feature.data = data;
        recovered.push(`${feature.name}: ${window.Loom?.i18n?.localize?.('SDR5E.ClassFeatures.WeaponMasteryName') || 'Weapon Mastery'}`);
      }
    }
  }

  const resourcePatch = { shortRestsDone: res.shortRestsDone, knockedOut: false };
  if (res.hitDice) {
    resourcePatch.hitDice = { value: res.hitDice.value };
    if (res.hitDice.pools) resourcePatch.hitDice.pools = res.hitDice.pools;
    if (res.hitDice.needsReview !== undefined) resourcePatch.hitDice.needsReview = res.hitDice.needsReview;
  }
  if (res.spellSlots) {
    resourcePatch.spellSlots = Object.fromEntries(Object.entries(res.spellSlots).map(([level, slot]) => [level, { value: slot.value }]));
  }
  if (res.pactMagic) resourcePatch.pactMagic = {
    value: res.pactMagic.value, max: res.pactMagic.max,
    spellLevel: res.pactMagic.spellLevel, needsReview: res.pactMagic.needsReview,
  };
  if (res.deathSaves) resourcePatch.deathSaves = res.deathSaves;
  if (res.exhaustion !== undefined) resourcePatch.exhaustion = res.exhaustion;
  if (res.racial) resourcePatch.racial = { value: res.racial.value };
  if (res.primary) resourcePatch.primary = { value: res.primary.value };
  if (kind === 'long' && res.health) resourcePatch.health = { value: res.health.value, temp: res.health.temp };
  // Completion time of this Long Rest; starts the 16-hour wait for the next one.
  if (kind === 'long') resourcePatch.lastLongRestAt = new Date().toISOString();
  await api.put(`/actors/${currentActor.id}`, {
    systemData: { resources: resourcePatch },
    ...((kind === 'long' || arcaneRecoveryUsed) ? { flags: { ...(currentActor.flags || {}), sdr5e: { ...(currentActor.flags?.sdr5e || {}), arcaneRecoveryUsed: kind === 'long' ? false : true } } } : {}),
  });
  const summary = recovered.length ? recovered.join(' &middot; ') : 'Nothing to recover.';
  const label = kind === 'long' ? 'Long Rest' : 'Short Rest';
  await window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor: currentActor }),
    content: `${label} complete`,
    flags: { srd5e: { name: `${currentActor.name} — ${label}`, isRest: true, description: `<div>${summary}</div>` } },
  });
  return { recovered, label };
}
