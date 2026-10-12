// ══════════════════════════════════════════════════════════════════════════
// SDR5E — client entry point (LoomVTT native ruleset)
// Ruleset Version: 0.1.0 — keep aligned with package.json and ruleset.json
// ══════════════════════════════════════════════════════════════════════════
//
// This file registers the Loom-native ruleset and wires implementations from
// scripts/*.mjs. Rules and content coverage are tracked in .dev/ and are not
// implied by successful registration.

import { SystemRegistry, defineSystem, sheets, statusEffects, api, LoomHooks } from '/_loom/sdk/index.js';
import { prepareActorRow } from './scripts/prepare-data.mjs';
import { getSheetSchema, getItemSheetSchema } from './scripts/sheet-schemas.mjs';
import { getDefaultData } from './scripts/schema.mjs';
import { applyDamageToTargets, applyWeaponSap, applyWeaponSlow, applyWeaponVex, consumeCombatEffectsAfterRoll, processCombatEffectsTurn, clearCombatEffectsOnEnd, rollWeaponAttack, rollWeaponNick, rollWeaponDamage, rollWeaponGraze, rollWeaponPush, rollWeaponTopple, rollWeaponCleave, resolveConcentrationSaveMessage, rollSpellAttack, rollSpellDamage, rollSpellTriggeredDamage, rollWishStress, splitSpellDamageComponents, rollUnarmedDamage, castSpell, activateFeature, postItemToChat, useConsumable, rollToolCheck, endRageForHeavyArmor, endRageForIncapacitatedCast, endConcentrationForIncapacitatedCast, processRageCombatTurn, clearRageCombatTrackingOnEnd } from './scripts/roll-engine.mjs';
import { syncEquippedEffect, syncPermanentBonusEffect, removeItemEffects } from './scripts/effects.mjs';
import { Sdr5eCharacterSheet } from './scripts/character-sheet.mjs';
import { Sdr5eNpcSheet } from './scripts/npc-sheet.mjs';
import { Sdr5eGroupSheet } from './scripts/group-sheet.mjs';
import { Sdr5eVehicleSheet } from './scripts/vehicle-sheet.mjs';
import { Sdr5eEncounterSheet } from './scripts/encounter-sheet.mjs';
import { Sdr5eItemSheet } from './scripts/item-sheet.mjs';
import { SDR5EApi } from './scripts/api.mjs';
import { registerSettings } from './scripts/settings.mjs';
import { registerCombatInitiative } from './scripts/combat-initiative.mjs';
import { CONDITIONS } from './scripts/config.mjs';
import { attackRollIsCritical } from './scripts/critical-mechanics.mjs';
import { attackDamageBinding, resolveAttackAgainstTarget } from './scripts/attack-target-mechanics.mjs';
import { clearHeroicInspirationReroll, getHeroicInspirationReroll, inspectHeroicInspirationReroll, registerHeroicInspirationReroll, resolveHeroicInspirationReroll } from './scripts/inspiration-mechanics.mjs';
import { clearPendingHitDie, getPendingHitDie, hitDieCommitPatch, hitDieHealing } from './scripts/hit-die-mechanics.mjs';
import { hasIndomitableMight, indomitableMightReplacement } from './scripts/class-feature-mechanics.mjs';
import { weaponMasteryGrazeAction, weaponMasteryPushAction, weaponMasterySapAction, weaponMasterySlowAction, weaponMasterySlowDamageRequest, weaponMasteryToppleAction, weaponMasteryVexAction, weaponMasteryCleaveAction, weaponMasteryNickAction } from './scripts/weapon-mastery.mjs';
import { pendingConcentrationSaveAttempts, replaceConcentrationSaveAttempt, resolveConcentrationSaveRoll, restoreConcentrationSaveAttempt as restoreConcentrationAttempt } from './scripts/concentration-mechanics.mjs';

const localizeCard = (key) => window.Loom?.i18n?.localize?.(key) || key;
// SRD 5.2 "Half Damage": spell damage cards get a "Target succeeded on save" toggle.
// Its state is written to the Apply button as data-half-on-save (read by the click handler).
const localizeCardOr = (key, fallback) => {
  const text = window.Loom?.i18n?.localize?.(key);
  return text && text !== key ? text : fallback;
};
// Multi-type spell damage (SRD 5.2, e.g. Flame Strike fire + radiant): the card label lists each component's type.
const damageComponentsTypeLabel = (components) => components.map((c) => c.type).filter(Boolean).join(' + ');
const isSpellDamageMeta = (meta) => !!meta?.srd5eDamage
  && (meta.isSpell === true || String(meta.label || meta.originalLabel || "").startsWith("Spell Damage:"));
const halfOnSaveToggleHtml = (meta) => isSpellDamageMeta(meta)
  ? `<label class="sdr5e-half-on-save"><input type="checkbox" data-srd5e-action="half-on-save-toggle"> ${escapeCardHtml(localizeCardOr("SDR5E.Combat.TargetSucceededSave", "Target succeeded on save"))}</label>`
  : "";
const escapeCardHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// SRD 5.2 "Knocking Out a Creature": melee damage cards get an opt-in toggle (unchecked by default).
// Its state is written to the Apply button as data-knock-out (read by the click handler).
const knockOutToggleHtml = (meta) => meta?.srd5eDamage?.melee === true
  ? `<label class="sdr5e-knock-out"><input type="checkbox" data-srd5e-action="knock-out-toggle"> ${escapeCardHtml(localizeCardOr("SDR5E.Combat.KnockOut", "Knock out instead of 0 HP"))}</label>`
  : "";

function weaponMasteryToppleButton(meta, target, hit) {
  const action = weaponMasteryToppleAction(meta, target, hit);
  if (!action) return '';
  return `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-topple">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.ToppleButton'))}</button></div>`;
}

function weaponMasteryCleaveButton(meta, target, hit) {
  const action = weaponMasteryCleaveAction(meta, target, hit);
  if (!action || meta?.srd5eCleaveAttack) return '';
  return `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-cleave">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.CleaveButton'))}</button></div>`;
}

function weaponMasteryNickButtons(meta) {
  const action = weaponMasteryNickAction(meta);
  if (!action) return '';
  return action.candidates.map((candidate) => `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-nick" data-item-id="${escapeCardHtml(candidate.id)}">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.NickButton').replace('{weapon}', candidate.name))}</button></div>`).join('');
}

function weaponMasteryGrazeButton(meta, target, hit) {
  const action = weaponMasteryGrazeAction(meta, target, hit);
  if (!action) return '';
  const damageKey = `SDR5E.Damage.${action.damageType[0].toUpperCase()}${action.damageType.slice(1)}`;
  const localizedDamageType = localizeCard(damageKey);
  const damageType = localizedDamageType === damageKey ? action.damageType : localizedDamageType;
  const label = localizeCard('SDR5E.WeaponMastery.GrazeButton')
    .replaceAll('{amount}', String(action.abilityModifier))
    .replaceAll('{type}', damageType);
  return `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-graze">${escapeCardHtml(label)}</button></div>`;
}

function weaponMasteryPushButton(meta, target, hit) {
  const action = weaponMasteryPushAction(meta, target, hit);
  if (!action) return '';
  return `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-push">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.PushButton'))}</button></div>`;
}

function weaponMasterySapButton(meta, target, hit, roll) {
  const action = weaponMasterySapAction(meta, target, hit);
  if (!action || !roll) return '';
  const request = {
    ...action,
    attack: {
      total: Number(roll.total),
      targetAC: Number(target.ac),
      terms: (roll.terms || []).filter((term) => term.kind === 'dice').map((term) => ({
        kind: 'dice', faces: Number(term.faces), rolls: Array.isArray(term.rolls) ? term.rolls.map(Number) : [],
        dropped: Array.isArray(term.dropped) ? term.dropped.map(Boolean) : [],
      })),
    },
  };
  const payload = encodeURIComponent(JSON.stringify(request));
  return `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-sap" data-actor-id="${escapeCardHtml(action.actorId)}" data-item-id="${escapeCardHtml(action.itemId)}" data-sap-request="${escapeCardHtml(payload)}">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.SapButton'))}</button></div>`;
}

function weaponMasteryVexPayload(meta, target, hit, roll) {
  const request = weaponMasteryVexAction(meta, target, hit, roll);
  return request ? encodeURIComponent(JSON.stringify(request)) : '';
}

function weaponMasterySlowNotice(meta, target, hit, roll) {
  const action = weaponMasterySlowAction(meta, target, hit, roll);
  if (!action) return '';
  return `<div class="target-vs-row hit">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.SlowPending'))}</div>`;
}

function weaponMasterySlowPayload(meta, target, hit, roll) {
  const action = weaponMasterySlowAction(meta, target, hit, roll);
  if (!action) return '';
  return encodeURIComponent(JSON.stringify({ ...action, attack: {
    total: Number(roll.total), targetAC: Number(target.ac),
    terms: (roll.terms || []).filter((term) => term.kind === 'dice').map((term) => ({
      kind: 'dice', faces: Number(term.faces), rolls: Array.isArray(term.rolls) ? term.rolls.map(Number) : [],
      dropped: Array.isArray(term.dropped) ? term.dropped.map(Boolean) : [],
    })),
  } }));
}

// ── System registration ──────────────────────────────────────────────────

// `prepareData` is the SDK's first-class declarative hook (LoomSystem.prepareData,
// checked BEFORE anything else in `_runPrepareData`/document-sheet.ts) and the
// ONLY path that runs derived-data prep — the ruleset used to also register a
// `CONFIG.Actor.documentClass` subclass with its own `prepareDerivedData()`
// (a VTT legado `documentClass` pattern) as a defensive fallback, but confirmed
// dead: nothing in the sheets calls `this.document.rollAbilityTest(...)` or
// any of its other methods (every roll goes through the module-level
// `sdr5eRoll()` functions directly), and that path only ever runs if
// `prepareData` is missing as an own property — never true here. Removed
// per the project rule against VTT legado compatibility/emulation surface.
function prepareData(row) {
  return prepareActorRow(row);
}

registerSettings();
registerCombatInitiative();

/**
 * `LoomSystem.useItem` — the generic entry point a ruleset-agnostic caller
 * (the macro hotbar's `use-item` macro, macro-runner.ts) invokes without
 * knowing SDR5E exists by name. Dispatches by item type to whatever
 * "using" that item already means on the sheet (same functions the sheet's
 * own `data-action` buttons call) — weapon attacks, casts a spell,
 * activates a feature (spends its resource/use), otherwise just posts the
 * item's card to chat (armor/race/class/etc aren't really "usable").
 * Fetches fresh actor/item by id, same reasoning as the card-attack chat
 * button listener below: whoever triggers this isn't necessarily the one
 * with the sheet open.
 */
async function useItem(actorId, itemId) {
  const actor = await window.Loom.api.get(`/actors/${actorId}?populate=true`);
  if (!actor) return;
  const item = await window.Loom.api.get(`/items/${itemId}`);
  if (!item) return;
  switch (item.type) {
    case 'weapon':
      await rollWeaponAttack(actor, item);
      break;
    case 'spell':
      await castSpell(actor, item);
      break;
    case 'feature':
      await activateFeature(actor, item);
      break;
    case 'consumable':
      await useConsumable(actor, item);
      break;
    case 'tool':
      await rollToolCheck(actor, item);
      break;
    default:
      await postItemToChat(actor, item);
  }
}

SystemRegistry.register(defineSystem({
  id: 'srd5e',
  title: 'SDR5E (Modern SRD)',
  version: '0.1.0',
  actorTypes: ['character', 'npc', 'group', 'vehicle', 'encounter'],
  itemTypes: ['weapon', 'armor', 'feature', 'item', 'language', 'race', 'class', 'subclass', 'background', 'feat', 'spell', 'consumable', 'tool', 'loot', 'container'],
  getDefaultData,
  getSheetSchema,
  getItemSheetSchema,
  prepareData,
  useItem,
}));

for (const cond of CONDITIONS) {
  if (!statusEffects.get?.(cond.id)) statusEffects.register(cond);
}

// Public system API — a real centralized facade (equivalent to the original
// `CodexApi` static-method class, `game.codex.api` in the old VTT legado
// system), kept in its own module (scripts/api.mjs) instead of built inline
// here so this entry point stays focused on system registration/wiring, not
// the API surface itself.
window.SDR5E = SDR5EApi;

document.addEventListener("change", (event) => {
  const toggle = event.target instanceof Element ? event.target.closest("[data-srd5e-action=\"half-on-save-toggle\"]") : null;
  if (!toggle) return;
  const apply = toggle.closest(".damage-button-section")?.querySelector("[data-srd5e-action=\"apply-damage\"]");
  if (apply) apply.dataset.halfOnSave = toggle.checked ? "true" : "false";
});

document.addEventListener("change", (event) => {
  const toggle = event.target instanceof Element ? event.target.closest("[data-srd5e-action=\"knock-out-toggle\"]") : null;
  if (!toggle) return;
  const apply = toggle.closest(".damage-button-section")?.querySelector("[data-srd5e-action=\"apply-damage\"]");
  if (apply) apply.dataset.knockOut = toggle.checked ? "true" : "false";
});

// Click handler for the "Apply Damage" button rendered into roll cards (see
// the `renderRollCard` wrapper below) — a ruleset-owned delegated listener,
// NOT a case added to the core sidebar's
// click switch (client/screens/game-hud/sidebar.ts is a closed if/else chain
// with no fallback for unrecognized actions; extending it would mean editing
// shared core code for one ruleset). `data-srd5e-action` is a deliberately
// separate attribute from the core's own `data-action`, so this listener
// only ever reacts to buttons SDR5E itself renders into chat HTML.
document.addEventListener('click', async (event) => {
  const btn = event.target instanceof Element ? event.target.closest('[data-srd5e-action="apply-damage"]') : null;
  if (!btn) return;
  const amount = Number(btn.dataset.amount) || 0;
  const type = btn.dataset.type || '';
  const targetIds = btn.hasAttribute('data-target-id') ? [btn.dataset.targetId] : undefined;
  const critical = btn.dataset.critical === 'true';
  const halfOnSave = btn.dataset.halfOnSave === 'true';
  const melee = btn.dataset.melee === 'true';
  const knockOut = melee && btn.dataset.knockOut === 'true';
  let vexRequest = null;
  let slowRequest = null;
  let components = null;
  try { vexRequest = btn.dataset.vexRequest ? JSON.parse(decodeURIComponent(btn.dataset.vexRequest)) : null; } catch {}
  try { slowRequest = btn.dataset.slowRequest ? JSON.parse(decodeURIComponent(btn.dataset.slowRequest)) : null; } catch {}
  try { components = btn.dataset.components ? JSON.parse(btn.dataset.components) : null; } catch {}
  btn.disabled = true;
  try {
    const results = await applyDamageToTargets(amount, type, targetIds, { critical, halfOnSave, knockOut, melee, components: Array.isArray(components) && components.length ? components : null });
    const confirmedDamage = vexRequest && results.some((result) => String(result.castId) === String(vexRequest.targetCastId)
      && Number(result.finalAmount) > 0);
    if (confirmedDamage) {
      const payload = encodeURIComponent(JSON.stringify(vexRequest));
      const action = `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-vex" data-actor-id="${escapeCardHtml(vexRequest.actorId)}" data-item-id="${escapeCardHtml(vexRequest.itemId)}" data-vex-request="${escapeCardHtml(payload)}">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.VexButton'))}</button></div>`;
      await window.Loom.ChatMessage.create({
        content: action,
        flags: { srd5e: { name: localizeCard('SDR5E.WeaponMastery.VexTitle'), description: action } },
      });
    }
    const request = weaponMasterySlowDamageRequest(slowRequest, results);
    if (request) {
      const payload = encodeURIComponent(JSON.stringify(request));
      const action = `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-weapon-slow" data-actor-id="${escapeCardHtml(request.actorId)}" data-item-id="${escapeCardHtml(request.itemId)}" data-slow-request="${escapeCardHtml(payload)}">${escapeCardHtml(localizeCard('SDR5E.WeaponMastery.SlowApplyButton'))}</button></div>`;
      await window.Loom.ChatMessage.create({
        content: action,
        flags: { srd5e: { name: localizeCard('SDR5E.WeaponMastery.SlowTitle'), description: action } },
      });
    }
  } catch (error) {
    console.error('[srd5e] Damage application did not complete:', error);
  } finally { btn.disabled = false; }
});

document.addEventListener('click', async (event) => {
  const btn = event.target instanceof Element ? event.target.closest('[data-srd5e-action="indomitable-might"]') : null;
  if (!btn) return;
  btn.disabled = true;
  try {
    const actor = await api.get(`/actors/${btn.dataset.actorId}?populate=true`);
    if (actor?.type !== 'character' || !hasIndomitableMight(actor.items)) throw new Error('Feature unavailable.');
    const score = Number(actor.systemData?.abilities?.str?.value);
    const total = Number(btn.dataset.total);
    const replacement = indomitableMightReplacement('str', total, score, true);
    if (replacement === null) throw new Error('This result is not eligible.');
    const escapedName = String(actor.name || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const text = localizeCard('SDR5E.ClassFeatures.IndomitableMightUsed')
      .replaceAll('{original}', String(total)).replaceAll('{score}', String(replacement));
    await window.Loom.ChatMessage.create({
      speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
      content: `<div class="codex-roll-card-v13"><div class="card-header">${escapedName} — ${localizeCard('SDR5E.ClassFeatures.IndomitableMight')}</div><div class="dice-total">${replacement}</div><div>${text}</div></div>`,
      flags: { srd5e: { name: localizeCard('SDR5E.ClassFeatures.IndomitableMight'), description: text } },
    });
    btn.disabled = true;
    btn.textContent = localizeCard('SDR5E.ClassFeatures.IndomitableMightUsedButton');
  } catch {
    btn.disabled = false;
    window.Loom?.showToast?.(localizeCard('SDR5E.ClassFeatures.IndomitableMightUnavailable'), 'warning');
  }
});

// Handout 40 — botões Attack/Damage embutidos no card de ativação
// (Passo 3). Busca actor/item frescos via API porque quem clica pode ser
// QUALQUER cliente vendo a mensagem no chat, não só quem tem a ficha aberta.
document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-srd5e-action="resolve-concentration-save"], [data-srd5e-action="card-attack"], [data-srd5e-action="card-damage"], [data-srd5e-action="card-cleave-damage"], [data-srd5e-action="card-spell-attack"], [data-srd5e-action="card-spell-damage"], [data-srd5e-action="card-unarmed-damage"], [data-srd5e-action="card-weapon-topple"], [data-srd5e-action="card-weapon-graze"], [data-srd5e-action="card-weapon-push"], [data-srd5e-action="card-weapon-cleave"], [data-srd5e-action="card-weapon-nick"], [data-srd5e-action="card-weapon-sap"], [data-srd5e-action="card-weapon-vex"], [data-srd5e-action="card-weapon-slow"], [data-srd5e-action="card-wish-stress"]');
  if (!btn) return;
  const action = btn.dataset.srd5eAction;
  if (action === 'resolve-concentration-save') {
    const messageId = btn.closest('[data-message-id]')?.dataset.messageId;
    if (!messageId) return;
    btn.disabled = true;
    let resolved = false;
    try {
      const result = await resolveConcentrationSaveMessage(messageId);
      resolved = result?.resolved === true;
      if (!resolved) window.Loom?.showToast?.(localizeCard('SDR5E.ConcentrationSave.NoLongerActive'), 'warning');
    } catch (error) {
      console.error('[sdr5e] failed to resolve Concentration save:', error);
      window.Loom?.showToast?.(localizeCard('SDR5E.ConcentrationSave.ResolveFailed'), 'warning');
    } finally {
      btn.disabled = resolved;
    }
    return;
  }
  if (action === 'card-weapon-nick') {
    const messageId = btn.closest('[data-message-id]')?.dataset.messageId;
    if (!messageId) return;
    btn.disabled = true;
    try {
      const result = await rollWeaponNick(messageId, btn.dataset.itemId);
      if (result?.rolled) btn.textContent = localizeCard(result.trackingFailed
        ? 'SDR5E.WeaponMastery.NickTrackingFailed' : 'SDR5E.WeaponMastery.NickUsed');
      else window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.NickFailed'), 'warning');
      btn.disabled = result?.rolled === true;
    } catch (error) {
      console.error('[sdr5e] Nick attack could not be completed:', error);
      btn.disabled = false;
      window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.NickFailed'), 'warning');
    }
    return;
  }
  if (['card-weapon-topple', 'card-weapon-graze', 'card-weapon-push', 'card-weapon-cleave'].includes(action)) {
    const messageId = btn.closest('[data-message-id]')?.dataset.messageId;
    if (!messageId) {
      window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.FlowFailed'), 'warning');
      return;
    }
    btn.disabled = true;
    let consume = false;
    try {
      if (action === 'card-weapon-cleave') {
        const result = await rollWeaponCleave(messageId);
        consume = result?.rolled === true;
      } else if (action === 'card-weapon-topple') {
        const result = await rollWeaponTopple(messageId);
        consume = !!result?.outcome;
      } else if (action === 'card-weapon-graze') {
        const result = await rollWeaponGraze(messageId);
        consume = Array.isArray(result) && result.length > 0;
      } else {
        const result = await rollWeaponPush(messageId);
        consume = result?.manual === true;
        if (consume) btn.textContent = localizeCard('SDR5E.WeaponMastery.PushOffered');
      }
      if (!consume) window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.FlowFailed'), 'warning');
    } catch (error) {
      console.error('[sdr5e] Weapon mastery action could not be completed:', error);
      window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.FlowFailed'), 'warning');
    } finally {
      btn.disabled = consume;
    }
    return;
  }
  const actorId = btn.dataset.actorId;
  const itemId = btn.dataset.itemId;
  if (!actorId) return;
  btn.disabled = true;
  let consumeButton = false;
  try {
    const actor = await window.Loom.api.get(`/actors/${actorId}?populate=true`);
    if (!actor) return;
    const damageOptions = {
      ...(btn.hasAttribute('data-critical') ? { critical: btn.dataset.critical === 'true' } : {}),
      ...(btn.dataset.attackTargetBound === 'true' ? {
        targetBound: true,
        ...(btn.dataset.targetId ? { targetId: btn.dataset.targetId } : {}),
      } : {}),
      ...(btn.dataset.rageEligible === 'true' ? {
        rageEligible: true, attackAbility: btn.dataset.attackAbility, targetCount: Number(btn.dataset.targetCount),
      } : {}),
      ...(btn.dataset.vexRequest ? { vexRequest: JSON.parse(decodeURIComponent(btn.dataset.vexRequest)) } : {}),
      ...(btn.dataset.slowRequest ? { slowRequest: JSON.parse(decodeURIComponent(btn.dataset.slowRequest)) } : {}),
      ...(btn.dataset.cleaveAttack === 'true' ? { cleaveAttack: true } : {}),
    };
    if (action === 'card-unarmed-damage') {
      await rollUnarmedDamage(actor, damageOptions);
      return;
    }
    if (!itemId) return;
    const item = await window.Loom.api.get(`/items/${itemId}`);
    if (!item) return;
    if (action === 'card-attack') await rollWeaponAttack(actor, item, { attackAction: true });
    else if (action === 'card-cleave-damage') await rollWeaponDamage(actor, item, {
      ...damageOptions, cleaveAttack: true, critical: btn.dataset.critical === 'true',
    });
    else if (action === 'card-damage') await rollWeaponDamage(actor, item, damageOptions);
    else if (action === 'card-weapon-sap') {
      try {
        const request = JSON.parse(decodeURIComponent(btn.dataset.sapRequest || ''));
        const result = await applyWeaponSap(actor, item, request);
        if (result?.applied) {
          consumeButton = true;
          btn.textContent = localizeCard(result.duplicate ? 'SDR5E.WeaponMastery.SapAlreadyApplied' : 'SDR5E.WeaponMastery.SapApplied');
        } else {
          const message = result?.reason === 'gm-required' ? 'SapNeedsGM'
            : result?.reason === 'turn-changed' ? 'SapExpired' : 'SapFailed';
          window.Loom?.showToast?.(localizeCard(`SDR5E.WeaponMastery.${message}`), 'warning');
        }
      } catch (error) {
        console.error('[srd5e] Sap could not be applied:', error);
        window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.SapFailed'), 'warning');
      }
    }
    else if (action === 'card-weapon-vex') {
      try {
        const request = JSON.parse(decodeURIComponent(btn.dataset.vexRequest || ''));
        const result = await applyWeaponVex(actor, item, request);
        if (result?.applied) {
          consumeButton = true;
          btn.textContent = localizeCard(result.duplicate ? 'SDR5E.WeaponMastery.VexAlreadyApplied' : 'SDR5E.WeaponMastery.VexApplied');
        } else {
          const message = result?.reason === 'gm-required' ? 'VexNeedsGM'
            : result?.reason === 'turn-changed' ? 'VexExpired' : 'VexFailed';
          window.Loom?.showToast?.(localizeCard(`SDR5E.WeaponMastery.${message}`), 'warning');
        }
      } catch (error) {
        console.error('[srd5e] Vex could not be applied:', error);
        window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.VexFailed'), 'warning');
      }
    }
    else if (action === 'card-weapon-slow') {
      try {
        const request = JSON.parse(decodeURIComponent(btn.dataset.slowRequest || ''));
        const result = await applyWeaponSlow(actor, item, request);
        if (result?.applied) {
          consumeButton = true;
          btn.textContent = localizeCard(result.duplicate ? 'SDR5E.WeaponMastery.SlowAlreadyApplied' : 'SDR5E.WeaponMastery.SlowApplied');
        } else {
          const message = result?.reason === 'gm-required' ? 'SlowNeedsGM'
            : result?.reason === 'turn-changed' ? 'SlowExpired' : 'SlowFailed';
          window.Loom?.showToast?.(localizeCard(`SDR5E.WeaponMastery.${message}`), 'warning');
        }
      } catch (error) {
        console.error('[srd5e] Slow could not be applied:', error);
        window.Loom?.showToast?.(localizeCard('SDR5E.WeaponMastery.SlowFailed'), 'warning');
      }
    }
    else if (action === 'card-spell-attack') await rollSpellAttack(actor, item);
    else if (action === 'card-spell-damage') await rollSpellDamage(actor, item, {
      ...damageOptions,
      ...(btn.hasAttribute('data-cast-at-level') ? { castAtLevel: Number(btn.dataset.castAtLevel) } : {}),
      ...(btn.dataset.fromCard === 'true' ? { fromCard: true } : {}),
    });
    else if (action === 'card-spell-triggered') await rollSpellTriggeredDamage(actor, item, Number(btn.dataset.triggerIndex), {
      ...damageOptions,
      ...(btn.hasAttribute('data-cast-at-level') ? { castAtLevel: Number(btn.dataset.castAtLevel) } : {}),
      ...(btn.dataset.fromCard === 'true' ? { fromCard: true } : {}),
    });
    else if (action === 'card-wish-stress') {
      // Optional, one roll per card: the button is disabled after it is used.
      consumeButton = true;
      await rollWishStress(actor, item, {
        ...(btn.hasAttribute('data-cast-at-level') ? { castAtLevel: Number(btn.dataset.castAtLevel) } : {}),
        ...(btn.dataset.fromCard === 'true' ? { fromCard: true } : {}),
      });
    }
  } finally {
    btn.disabled = consumeButton;
  }
});

const inspirationRerollTimeouts = new Map();
const finalizingInspirationRerolls = new Set();
const inspirationRerollOriginCards = new Map();

function restoreInspirationRerollCard(requestId) {
  const card = inspirationRerollOriginCards.get(requestId);
  card?.querySelectorAll('button').forEach((control) => { control.disabled = false; });
  inspirationRerollOriginCards.delete(requestId);
}

async function restoreConcentrationSaveAttempt(snapshot) {
  const meta = snapshot?.meta;
  if (!meta?.srd5eConcentrationSave || !meta.srd5eConcentrationPreviousAttemptId) return;
  try {
    const actor = await api.get(`/actors/${encodeURIComponent(meta.actorId)}`);
    const resources = actor?.systemData?.resources || {};
    if (resources.concentrating !== true
      || String(resources.concentrationId || '') !== String(meta.srd5eConcentrationId)
      || String(resources.concentratingOn || '') !== String(meta.srd5eConcentrationOriginId)
      || !pendingConcentrationSaveAttempts(resources).includes(String(meta.srd5eConcentrationSaveAttemptId))) return;
    const rollback = restoreConcentrationAttempt(resources, meta.srd5eConcentrationSaveAttemptId,
      meta.srd5eConcentrationPreviousAttemptId, meta.srd5eConcentrationPreviousAttemptIds || [],
      meta.srd5eConcentrationPreviousLatestAttemptId);
    if (!rollback) return;
    await api.put(`/actors/${encodeURIComponent(meta.actorId)}`, {
      systemData: { resources: rollback },
    });
  } catch (error) {
    console.error('[sdr5e] could not restore the pending Concentration save after an unused reroll:', error);
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-srd5e-action="reroll-inspiration"]');
  if (!btn) return;
  btn.disabled = true;
  let requestId = '';
  try {
    let snapshot = JSON.parse(btn.dataset.rollSnapshot || 'null');
    if (!snapshot || snapshot.actorId !== btn.dataset.actorId) throw new Error('Unsupported Heroic Inspiration roll context.');
    const actor = await api.get(`/actors/${snapshot.actorId}`);
    if (actor?.type !== 'character' || !actor.systemData?.resources?.inspiration) {
      window.Loom?.showToast?.(localizeCard('SDR5E.HeroicInspiration.NoResource'), 'warning');
      return;
    }
    if (snapshot.meta?.srd5eConcentrationSave === true) {
      const resources = actor.systemData?.resources || {};
      if (resources.concentrating !== true
        || String(resources.concentrationId || '') !== String(snapshot.meta.srd5eConcentrationId)
        || String(resources.concentratingOn || '') !== String(snapshot.meta.srd5eConcentrationOriginId)
        || !pendingConcentrationSaveAttempts(resources).includes(String(snapshot.meta.srd5eConcentrationSaveAttemptId))) {
        throw new Error('This Concentration save is no longer current.');
      }
      const nextAttemptId = crypto.randomUUID();
      const previousAttemptId = String(snapshot.meta.srd5eConcentrationSaveAttemptId);
      const previousLatestAttemptId = String(resources.concentrationSaveAttemptId || '');
      const replacement = replaceConcentrationSaveAttempt(resources, previousAttemptId, nextAttemptId);
      if (!replacement) throw new Error('This Concentration save is no longer pending.');
      snapshot = { ...snapshot, meta: {
        ...snapshot.meta,
        srd5eConcentrationPreviousAttemptId: previousAttemptId,
        srd5eConcentrationPreviousAttemptIds: pendingConcentrationSaveAttempts(resources),
        srd5eConcentrationPreviousLatestAttemptId: previousLatestAttemptId,
        srd5eConcentrationSaveAttemptId: nextAttemptId,
      } };
    }
    requestId = crypto.randomUUID();
    if (!registerHeroicInspirationReroll(requestId, snapshot)) {
      window.Loom?.showToast?.(localizeCard('SDR5E.HeroicInspiration.Pending'), 'warning');
      return;
    }
    if (snapshot.meta?.srd5eConcentrationSave === true) {
      await api.put(`/actors/${encodeURIComponent(snapshot.actorId)}`, {
        systemData: { resources: replacement },
      });
    }
    btn.closest('.sdr-roll-card')?.querySelectorAll('[data-srd5e-action^="card-"]').forEach((control) => { control.disabled = true; });
    const timeout = setTimeout(() => {
      if (clearHeroicInspirationReroll(requestId)) {
        void restoreConcentrationSaveAttempt(snapshot);
        window.Loom?.showToast?.(localizeCard('SDR5E.HeroicInspiration.Unsupported'), 'warning');
      }
      inspirationRerollOriginCards.delete(requestId);
      inspirationRerollTimeouts.delete(requestId);
    }, 60000);
    inspirationRerollTimeouts.set(requestId, timeout);
    const originCard = btn.closest('.sdr-roll-card');
    if (originCard) {
      inspirationRerollOriginCards.set(requestId, originCard);
      originCard.querySelectorAll('button').forEach((control) => { control.disabled = true; });
    }
    window.Loom.dispatchRoll({
      formula: `1d${snapshot.faces}`,
      actorId: snapshot.actorId,
      mode: snapshot.mode,
      meta: {
        label: localizeCard('SDR5E.HeroicInspiration.RerollCard'),
        actorId: snapshot.actorId,
        ...snapshot.meta,
        srd5eHeroicInspirationReroll: { requestId, snapshot },
      },
    });
  } catch (error) {
    if (requestId) {
      const timeout = inspirationRerollTimeouts.get(requestId);
      if (timeout) clearTimeout(timeout);
      inspirationRerollTimeouts.delete(requestId);
      await restoreConcentrationSaveAttempt(snapshot);
      restoreInspirationRerollCard(requestId);
      clearHeroicInspirationReroll(requestId);
    }
    window.Loom?.showToast?.(localizeCard('SDR5E.HeroicInspiration.Unsupported'), 'warning');
  } finally {
    if (!requestId || !getHeroicInspirationReroll(requestId)) btn.disabled = false;
  }
});

async function settleHeroicInspirationReroll(requestId, snapshot, resolution) {
  const finalTotal = snapshot.meta.srd5eDamage ? Math.max(0, resolution.total) : resolution.total;
  const timeout = inspirationRerollTimeouts.get(requestId);
  if (timeout) clearTimeout(timeout);
  inspirationRerollTimeouts.delete(requestId);
  let actor;
  try {
    actor = await api.get(`/actors/${snapshot.actorId}`);
    if (actor?.type !== 'character' || !actor.systemData?.resources?.inspiration) {
      throw new Error('Heroic Inspiration is no longer available.');
    }
    if (snapshot.meta.srd5eConcentrationSave === true) {
      const resources = actor.systemData.resources || {};
      if (resources.concentrating !== true
        || String(resources.concentrationId || '') !== String(snapshot.meta.srd5eConcentrationId)
        || String(resources.concentratingOn || '') !== String(snapshot.meta.srd5eConcentrationOriginId)
        || !pendingConcentrationSaveAttempts(resources).includes(String(snapshot.meta.srd5eConcentrationSaveAttemptId))) {
        throw new Error('Concentration changed before the reroll completed.');
      }
    }
    if (snapshot.meta.srd5eHitDieRequestId) {
      const pending = getPendingHitDie(snapshot.meta.srd5eHitDieRequestId);
      if (!pending || pending.actorId !== String(snapshot.actorId)) throw new Error('Hit Die choice is no longer pending.');
      const fresh = await api.get(`/actors/${snapshot.actorId}`);
      const patch = hitDieCommitPatch(fresh.systemData, hitDieHealing(finalTotal), { spendInspiration: true, poolId: pending.poolId });
      await api.put(`/actors/${snapshot.actorId}`, { systemData: Object.fromEntries(Object.entries(patch).reduce((result, [path, value]) => {
        const keys = path.replace(/^system\./, '').split('.'); let cursor = result;
        keys.slice(0, -1).forEach((key) => { cursor[key] ||= {}; cursor = cursor[key]; }); cursor[keys.at(-1)] = value; return result;
      }, {})) });
      clearPendingHitDie(snapshot.meta.srd5eHitDieRequestId);
      pending.resolve({ healAmount: hitDieHealing(finalTotal), newValue: patch['system.resources.health.value'] });
    } else {
      await api.put(`/actors/${snapshot.actorId}`, { systemData: { resources: { inspiration: false } } });
    }
  } catch {
    await restoreConcentrationSaveAttempt(snapshot);
    const content = localizeCard('SDR5E.HeroicInspiration.NotAccepted').replaceAll('{original}', String(snapshot.total));
    try {
      await window.Loom.ChatMessage.create({
        content: `<div class="sdr5e-inspiration-result">${content}</div>`,
        flags: { srd5e: { name: localizeCard('SDR5E.HeroicInspiration.RerollCard'), isInspirationReroll: true, description: content } },
      });
    } catch {}
    restoreInspirationRerollCard(requestId);
    clearHeroicInspirationReroll(requestId);
    return;
  }
  try {
    const format = (key, values) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), localizeCard(key));
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const content = format('SDR5E.HeroicInspiration.Spent', { total: finalTotal, original: snapshot.total });
    const targetRows = (snapshot.meta.targets || []).map((target) => {
      const { hit } = resolveAttackAgainstTarget({ meta: snapshot.meta, total: finalTotal, terms: resolution.terms }, target.ac);
      return `<div class="target-vs-row ${hit ? 'hit' : 'miss'}">${escapeHtml(target.name)} (${escapeHtml(localizeCard('SDR5E.HeroicInspiration.ArmorClass'))} ${target.ac}) — ${escapeHtml(localizeCard(hit ? 'SDR5E.HeroicInspiration.Hit' : 'SDR5E.HeroicInspiration.Miss'))}</div>`;
    }).join('');
    const critical = attackRollIsCritical({ meta: snapshot.meta, terms: resolution.terms });
    const capturedTargets = snapshot.meta.targets || [];
    const singleTargetHit = capturedTargets.length === 1
      && resolveAttackAgainstTarget({ meta: snapshot.meta, total: finalTotal, terms: resolution.terms }, capturedTargets[0].ac).hit;
    const attackBinding = attackDamageBinding(capturedTargets, singleTargetHit);
    const rageContext = singleTargetHit && snapshot.meta.srd5eAttackAbility === 'str'
      ? ` data-rage-eligible="true" data-attack-ability="str" data-target-count="1"` : '';
    const cleaveContext = snapshot.meta.srd5eCleaveAttack ? ' data-cleave-attack="true"' : '';
    const vexPayload = capturedTargets.length === 1
      ? weaponMasteryVexPayload(snapshot.meta, capturedTargets[0], singleTargetHit, { total: finalTotal, terms: resolution.terms }) : '';
    const vexContext = vexPayload ? ` data-vex-request="${escapeHtml(vexPayload)}"` : '';
    const slowPayload = capturedTargets.length === 1
      ? weaponMasterySlowPayload(snapshot.meta, capturedTargets[0], singleTargetHit, { total: finalTotal, terms: resolution.terms }) : '';
    const slowContext = slowPayload ? ` data-slow-request="${escapeHtml(slowPayload)}"` : '';
    const boundAttackAttributes = ` data-attack-target-bound="true"${attackBinding.targetId ? ` data-target-id="${escapeHtml(attackBinding.targetId)}"` : ''}`;
    const canRollAttackDamage = attackBinding.canRollDamage;
    const damageButton = canRollAttackDamage && snapshot.meta.itemId
      ? snapshot.meta.srd5eCleaveAttack
        ? `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-cleave-damage" data-actor-id="${escapeHtml(snapshot.actorId)}" data-item-id="${escapeHtml(snapshot.meta.itemId)}" data-critical="${critical}" data-cleave-attack="true"${boundAttackAttributes}>${escapeHtml(localizeCard('SDR5E.WeaponMastery.CleaveDamageButton'))}</button></div>`
        : `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="${snapshot.meta.isSpell ? 'card-spell-damage' : 'card-damage'}" data-actor-id="${escapeHtml(snapshot.actorId)}" data-item-id="${escapeHtml(snapshot.meta.itemId)}" data-critical="${critical}"${boundAttackAttributes}${rageContext}${vexContext}${slowContext}${cleaveContext}>${escapeHtml(localizeCard('SDR5E.HeroicInspiration.RollDamage'))}${critical ? ` (${escapeHtml(localizeCard('SDR5E.HeroicInspiration.Critical'))})` : ''}</button></div>`
      : canRollAttackDamage && snapshot.meta.isUnarmed
        ? `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-unarmed-damage" data-actor-id="${escapeHtml(snapshot.actorId)}" data-critical="${critical}"${boundAttackAttributes}${rageContext}>${escapeHtml(localizeCard('SDR5E.HeroicInspiration.RollDamage'))}${critical ? ` (${escapeHtml(localizeCard('SDR5E.HeroicInspiration.Critical'))})` : ''}</button></div>`
        : '';
    const concentrationSave = resolveConcentrationSaveRoll({ total: finalTotal, terms: resolution.terms, meta: snapshot.meta });
    const concentrationSaveAction = concentrationSave && !concentrationSave.success && window.Loom?.user?.isGM
      ? `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="resolve-concentration-save">${escapeHtml(localizeCard('SDR5E.ConcentrationSave.EndOnFailure'))}</button></div>`
      : '';
    const toppleButton = capturedTargets.length === 1
      ? weaponMasteryToppleButton(snapshot.meta, capturedTargets[0], singleTargetHit) : '';
    const grazeButton = capturedTargets.length === 1
      ? weaponMasteryGrazeButton(snapshot.meta, capturedTargets[0], !singleTargetHit) : '';
    const pushButton = capturedTargets.length === 1
      ? weaponMasteryPushButton(snapshot.meta, capturedTargets[0], singleTargetHit) : '';
    const cleaveButton = capturedTargets.length === 1
      ? weaponMasteryCleaveButton(snapshot.meta, capturedTargets[0], singleTargetHit) : '';
    const sapButton = capturedTargets.length === 1
      ? weaponMasterySapButton(snapshot.meta, capturedTargets[0], singleTargetHit, { total: finalTotal, terms: resolution.terms }) : '';
    const slowButton = capturedTargets.length === 1
      ? weaponMasterySlowNotice(snapshot.meta, capturedTargets[0], singleTargetHit, { total: finalTotal, terms: resolution.terms }) : '';
    const damageBound = snapshot.meta.srd5eDamage?.targetBound === true;
    const applyTargetId = damageBound ? snapshot.meta.srd5eDamage.targetId : '';
    const selectedTargetCount = window.Loom?.user?.targets?.length || 0;
    const canApplyDamage = damageBound ? !!applyTargetId : selectedTargetCount > 0;
    const rerollComponents = snapshot.meta.srd5eDamage?.components;
    const rerollComponentAmounts = rerollComponents?.length ? splitSpellDamageComponents(rerollComponents, resolution.terms, finalTotal) : null;
    const applyDamageButton = snapshot.meta.srd5eDamage && canApplyDamage && (!rerollComponents?.length || rerollComponentAmounts)
      ? `<div class="damage-button-section">${halfOnSaveToggleHtml(snapshot.meta)}${knockOutToggleHtml(snapshot.meta)}<button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="apply-damage" data-half-on-save="false" data-knock-out="false" data-melee="${snapshot.meta.srd5eDamage.melee === true}" data-amount="${finalTotal}" data-type="${escapeHtml(snapshot.meta.srd5eDamage.type)}"${rerollComponentAmounts ? ` data-components="${escapeHtml(JSON.stringify(rerollComponentAmounts))}"` : ''} data-critical="${snapshot.meta.srd5eDamage.critical === true}"${damageBound ? ` data-target-id="${escapeHtml(applyTargetId)}"` : ''}${snapshot.meta.srd5eDamage.vexRequest ? ` data-vex-request="${escapeHtml(encodeURIComponent(JSON.stringify(snapshot.meta.srd5eDamage.vexRequest)))}"` : ''}>${escapeHtml(localizeCard('SDR5E.HeroicInspiration.ApplyDamage').replace('{amount}', String(finalTotal)))}</button></div>`
      : '';
    await window.Loom.ChatMessage.create({
      speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
      content: `<div class="sdr-roll-card codex-roll-card-v13 sdr5e-inspiration-result"><div class="card-header">${escapeHtml(localizeCard('SDR5E.HeroicInspiration.RerollCard'))}</div><div class="dice-total">${finalTotal}</div><div>${content}</div>${targetRows}${toppleButton}${grazeButton}${pushButton}${cleaveButton}${sapButton}${slowButton}${concentrationSaveAction}${damageButton}${applyDamageButton}</div>`,
      flags: { srd5e: {
        name: localizeCard('SDR5E.HeroicInspiration.RerollCard'), isInspirationReroll: true, description: content,
        weaponMasteryAttackRoll: { total: finalTotal, terms: resolution.terms, meta: snapshot.meta },
        ...(concentrationSave ? { concentrationSaveRoll: { total: finalTotal, terms: resolution.terms, meta: snapshot.meta } } : {}),
      } },
    });
  } catch {
    window.Loom?.showToast?.(localizeCard('SDR5E.HeroicInspiration.Spent').replace('{total}', String(resolution.total)).replace('{original}', String(snapshot.total)), 'warning');
  } finally {
    clearHeroicInspirationReroll(requestId);
    inspirationRerollOriginCards.delete(requestId);
  }
}

async function confirmHitDieRoll(requestId, total, spendInspiration = false) {
  const pending = getPendingHitDie(requestId);
  if (!pending) return;
  try {
    const actor = await api.get(`/actors/${pending.actorId}`);
    if (!actor || actor.type !== 'character') throw new Error('Character unavailable.');
    const healAmount = hitDieHealing(total);
    const patch = hitDieCommitPatch(actor.systemData, healAmount, { spendInspiration, poolId: pending.poolId });
    const resources = {};
    for (const [path, value] of Object.entries(patch)) {
      const keys = path.replace(/^system\./, '').split('.'); let cursor = resources;
      keys.slice(0, -1).forEach((key) => { cursor[key] ||= {}; cursor = cursor[key]; }); cursor[keys.at(-1)] = value;
    }
    await api.put(`/actors/${pending.actorId}`, { systemData: { resources } });
    clearPendingHitDie(requestId);
    pending.resolve({ healAmount, newValue: patch['system.resources.health.value'] });
  } catch {
    window.Loom?.showToast?.('Hit Die result could not be committed; no resources were spent.', 'warning');
  }
}

document.addEventListener('click', (event) => {
  const btn = event.target instanceof Element ? event.target.closest('[data-srd5e-action="confirm-hit-die"]') : null;
  if (!btn) return;
  btn.disabled = true;
  void confirmHitDieRoll(btn.dataset.requestId, Number(btn.dataset.total), false).then(() => { if (getPendingHitDie(btn.dataset.requestId)) btn.disabled = false; });
});

// Injects the Apply Damage button directly INTO the roll card itself
// (Loom.wraps.renderRollCard — the system-hook hosting core's own generic
// reroll/apply mechanisms already use, per chat-message-card.ts's own
// comments) instead of a separate companion message. Core already has a
// built-in `data-action="apply-roll"` + `meta.applyTo` mechanism for this,
// but it's a flat subtraction (sidebar.ts:2202, calls apply-to-targets.ts
// directly) with no idea about damage-type resistance/immunity/vulnerability
// — using it as-is would have silently dropped the trait math already
// fixed earlier. `data-srd5e-action="apply-damage"` reuses the exact
// listener above; only rolls that set `meta.srd5eDamage` (weapon/spell
// damage) get the button — every other roll card (ability checks, saves,
// initiative) is untouched, falling straight through to the original
// renderer.
window.Loom.wraps.renderRollCard.addWrapper((wrapped, roll, esc) => {
  // Card completo estilo dnd5e (papiro/pergaminho, header escuro,
  // total grande, detalhe expansível ao clicar) — reaproveita o CSS
  // `.codex-roll-card-v13` já existente em styles/srd5e.css (sobra do
  // ChatManager.mjs do VTT legado original, nunca conectado na versão nativa).
  // Substitui o card genérico do core inteiro em vez de só adicionar um
  // botão em cima dele — `wrapped` não é mais chamado aqui.
  const inspirationRequest = roll.meta?.srd5eHeroicInspirationReroll;
  if (!inspirationRequest) void consumeCombatEffectsAfterRoll(roll);
  const inspirationSnapshot = inspirationRequest?.snapshot || null;
  const inspirationResolution = inspirationSnapshot ? resolveHeroicInspirationReroll(inspirationSnapshot, roll) : null;
  const displayRoll = inspirationResolution ? {
    ...roll,
    formula: inspirationSnapshot.formula,
    total: inspirationSnapshot.meta.srd5eDamage ? Math.max(0, inspirationResolution.total) : inspirationResolution.total,
    terms: inspirationResolution.terms,
    meta: {
      ...roll.meta, ...inspirationSnapshot.meta,
      ...(inspirationSnapshot.meta.srd5eDamage ? { srd5eDamage: { ...inspirationSnapshot.meta.srd5eDamage, amount: Math.max(0, inspirationResolution.total) } } : {}),
      label: inspirationSnapshot.meta.originalLabel || roll.meta?.label,
    },
  } : roll;
  if (inspirationRequest?.requestId && inspirationResolution && getHeroicInspirationReroll(inspirationRequest.requestId)
      && !finalizingInspirationRerolls.has(inspirationRequest.requestId)) {
    finalizingInspirationRerolls.add(inspirationRequest.requestId);
    void settleHeroicInspirationReroll(inspirationRequest.requestId, inspirationSnapshot, inspirationResolution)
      .finally(() => finalizingInspirationRerolls.delete(inspirationRequest.requestId));
  } else if (inspirationRequest?.requestId && getHeroicInspirationReroll(inspirationRequest.requestId) && !inspirationResolution) {
    const timeout = inspirationRerollTimeouts.get(inspirationRequest.requestId);
    if (timeout) clearTimeout(timeout);
    inspirationRerollTimeouts.delete(inspirationRequest.requestId);
    void restoreConcentrationSaveAttempt(inspirationSnapshot);
    restoreInspirationRerollCard(inspirationRequest.requestId);
    clearHeroicInspirationReroll(inspirationRequest.requestId);
  }

  const dmg = displayRoll.meta?.srd5eDamage;
  const damageAmount = dmg && Number.isFinite(Number(dmg.amount)) ? Number(dmg.amount) : Number(displayRoll.total) || 0;
  const label = esc(String(displayRoll.meta?.label || displayRoll.flavor || 'Roll'));
  const modeTag = displayRoll.mode !== 'public' ? `<span class="status-badge">${esc(displayRoll.mode)}</span>` : '';

  // Handout 31: nat 20 / nat 1 em d20 (ataque, save, ability check,
  // iniciativa) — nunca em dano (dano chega como total já resolvido, sem
  // termo de dado, ver roll-engine.mjs `dispatchRoll({formula: String(total)})`).
  // Dado descartado por vantagem/desvantagem não conta.
  let natClass = '';
  const diceBreakdown = (displayRoll.terms || [])
    .flatMap((term, termIndex) => term.kind === 'dice' ? (term.rolls || []).map((value, dieIndex) => {
      const dropped = !!term.dropped?.[dieIndex];
      const isD20 = term.faces === 20;
      const nat = isD20 && !dropped ? (value === 20 ? ' nat20' : value === 1 ? ' nat1' : '') : '';
      if (nat && !dropped) natClass = nat;
      const reroll = displayRoll.meta?.actorId && !displayRoll.meta?.srd5eHeroicInspirationReroll
        ? inspectHeroicInspirationReroll(displayRoll, termIndex, dieIndex) : null;
      const action = reroll
        ? `<button type="button" class="sdrn-add-btn" data-srd5e-action="reroll-inspiration" data-actor-id="${esc(reroll.actorId)}" data-roll-snapshot="${esc(JSON.stringify(reroll))}" aria-label="${esc(localizeCard('SDR5E.HeroicInspiration.RerollDie'))}" title="${esc(localizeCard('SDR5E.HeroicInspiration.RerollDie'))}">↻</button>`
        : '';
      return `<span class="dice-roll-pip${dropped ? ' dropped' : ''}${nat}">${value}</span>${action}`;
    }) : [])
    .join('');
  const modifierTerms = (displayRoll.terms || [])
    .filter((t) => t.kind === 'modifier')
    .map((t) => `<span class="dice-roll-pip dice-roll-mod">${t.value > 0 ? '+' : ''}${t.value}</span>`)
    .join('');

  // Handout 36 — Acertou/Errou por alvo, comparando o total já resolvido
  // (roll.total, disponível aqui no momento do render) contra a CA
  // capturada em meta.targets ANTES do dado ser rolado (Passo 1).
  const targetsList = inspirationRequest ? [] : (displayRoll.meta?.targets || []);
  const criticalAttack = attackRollIsCritical(displayRoll);
  const targetOutcomes = targetsList.map((target) => ({ target, ...resolveAttackAgainstTarget(displayRoll, target.ac) }));
  const anyHit = targetOutcomes.some(({ hit }) => hit);
  const targetsSection = targetsList.map((t) => {
    const hit = resolveAttackAgainstTarget(displayRoll, t.ac).hit;
    return `<div class="target-vs-row ${hit ? 'hit' : 'miss'}">vs ${esc(t.name)} (AC ${t.ac}) — ${hit ? 'HIT' : 'MISS'}</div>`;
  }).join('');
  const concentrationSave = resolveConcentrationSaveRoll(displayRoll);
  const concentrationSaveAction = concentrationSave && !concentrationSave.success && window.Loom?.user?.isGM
    ? `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="resolve-concentration-save">${esc(localizeCard('SDR5E.ConcentrationSave.EndOnFailure'))}</button></div>`
    : '';
  const toppleButton = !inspirationRequest && targetOutcomes.length === 1
    ? weaponMasteryToppleButton(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit) : '';
  const nickButtons = !inspirationRequest ? weaponMasteryNickButtons(displayRoll.meta) : '';
  const grazeButton = !inspirationRequest && targetOutcomes.length === 1
    ? weaponMasteryGrazeButton(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit) : '';
  const pushButton = !inspirationRequest && targetOutcomes.length === 1
    ? weaponMasteryPushButton(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit) : '';
  const cleaveButton = !inspirationRequest && targetOutcomes.length === 1
    ? weaponMasteryCleaveButton(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit) : '';
  const sapButton = !inspirationRequest && targetOutcomes.length === 1
    ? weaponMasterySapButton(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit, displayRoll) : '';
  const slowButton = !inspirationRequest && targetOutcomes.length === 1
    ? weaponMasterySlowNotice(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit, displayRoll) : '';
  const slowPayload = !inspirationRequest && targetOutcomes.length === 1
    ? weaponMasterySlowPayload(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit, displayRoll) : '';
  const slowContext = slowPayload ? ` data-slow-request="${esc(slowPayload)}"` : '';
  const cleaveContext = displayRoll.meta?.srd5eCleaveAttack ? ' data-cleave-attack="true"' : '';
  const vexPayload = targetOutcomes.length === 1
    ? weaponMasteryVexPayload(displayRoll.meta, targetOutcomes[0].target, targetOutcomes[0].hit, displayRoll) : '';
  const vexContext = vexPayload ? ` data-vex-request="${esc(vexPayload)}"` : '';

  let inlineDamageBtn = '';
  const attackBinding = attackDamageBinding(targetsList, targetsList.length === 1 && anyHit);
  const boundAttackAttributes = ` data-attack-target-bound="true"${attackBinding.targetId ? ` data-target-id="${esc(attackBinding.targetId)}"` : ''}`;
  const canRollAttackDamage = attackBinding.canRollDamage;
  if (!inspirationRequest && canRollAttackDamage && displayRoll.meta?.actorId && displayRoll.meta?.itemId) {
    const isSpell = !!displayRoll.meta.isSpell;
    const rageContext = targetsList.length === 1 && anyHit && displayRoll.meta.srd5eAttackAbility === 'str'
      ? ` data-rage-eligible="true" data-attack-ability="str" data-target-count="1"` : '';
    inlineDamageBtn = displayRoll.meta?.srd5eCleaveAttack
      ? `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-cleave-damage" data-actor-id="${esc(displayRoll.meta.actorId)}" data-item-id="${esc(displayRoll.meta.itemId)}" data-critical="${criticalAttack}" data-cleave-attack="true"${boundAttackAttributes}><i class="fas fa-burst"></i> ${esc(localizeCard('SDR5E.WeaponMastery.CleaveDamageButton'))}</button></div>`
      : `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="${isSpell ? 'card-spell-damage' : 'card-damage'}" data-actor-id="${esc(displayRoll.meta.actorId)}" data-item-id="${esc(displayRoll.meta.itemId)}" data-critical="${criticalAttack}"${boundAttackAttributes}${rageContext}${vexContext}${slowContext}${cleaveContext}><i class="fas fa-burst"></i> Roll Damage${criticalAttack ? ' (Critical)' : ''}</button></div>`;
  } else if (!inspirationRequest && canRollAttackDamage && displayRoll.meta?.isUnarmed && displayRoll.meta?.actorId) {
    const rageContext = targetsList.length === 1 && anyHit && displayRoll.meta.srd5eAttackAbility === 'str'
      ? ` data-rage-eligible="true" data-attack-ability="str" data-target-count="1"` : '';
    inlineDamageBtn = `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-unarmed-damage" data-actor-id="${esc(displayRoll.meta.actorId)}" data-critical="${criticalAttack}"${boundAttackAttributes}${rageContext}><i class="fas fa-burst"></i> Roll Damage${criticalAttack ? ' (Critical)' : ''}</button></div>`;
  }

  const dmgComponentAmounts = dmg?.components?.length
    ? splitSpellDamageComponents(dmg.components, displayRoll.terms, damageAmount) : null;
  const dmgTypeText = dmg?.components?.length ? damageComponentsTypeLabel(dmg.components) : (dmg?.type || '');
  const damageSection = dmg
    ? `<div class="damage-section">${esc(dmgTypeText ? `${dmgTypeText} damage` : 'Damage')}</div>`
    : '';

  const hitDieRequestId = displayRoll.meta?.srd5eHitDieRequestId;
  const hitDieChoiceSection = hitDieRequestId && getPendingHitDie(hitDieRequestId)
    ? `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="confirm-hit-die" data-request-id="${esc(hitDieRequestId)}" data-total="${Number(displayRoll.total) || 0}">${esc(localizeCard('SDR5E.HeroicInspiration.ConfirmHitDie').replace('{amount}', String(Math.max(0, Number(displayRoll.total) || 0))))}</button></div>`
    : '';
  const indomitableTotal = displayRoll.mode === 'public' && displayRoll.meta?.actorId && displayRoll.meta?.srd5eAbilityKey === 'str'
    ? indomitableMightReplacement('str', displayRoll.total, displayRoll.meta.srd5eIndomitableMightScore, !!displayRoll.meta.srd5eIndomitableMightScore)
    : null;
  const indomitableMightSection = indomitableTotal !== null
    ? `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="indomitable-might" data-actor-id="${esc(displayRoll.meta.actorId)}" data-total="${Number(displayRoll.total)}">${esc(localizeCard('SDR5E.ClassFeatures.IndomitableMightUse').replace('{score}', String(indomitableTotal)))}</button></div>`
    : '';

  const targetCount = window.Loom?.user?.targets?.length || 0;
  const damageBound = dmg?.targetBound === true;
  const applyTargetId = damageBound ? dmg.targetId : '';
  const canApplyDamage = damageBound ? !!applyTargetId : targetCount > 0;
  // A multi-type spell whose rolled dice cannot be split per component gets no Apply button rather than a guessed split.
  const applyBtnSection = (dmg && canApplyDamage && !inspirationRequest && (!dmg.components?.length || dmgComponentAmounts))
    ? `<div class="damage-button-section">${halfOnSaveToggleHtml(displayRoll.meta)}${knockOutToggleHtml(displayRoll.meta)}<button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="apply-damage" data-half-on-save="false" data-knock-out="false" data-melee="${dmg.melee === true}" data-amount="${damageAmount}" data-type="${dmg.type || ''}"${dmgComponentAmounts ? ` data-components="${esc(JSON.stringify(dmgComponentAmounts))}"` : ''} data-critical="${dmg.critical === true}"${damageBound ? ` data-target-id="${esc(applyTargetId)}"` : ''}${dmg.vexRequest ? ` data-vex-request="${esc(encodeURIComponent(JSON.stringify(dmg.vexRequest)))}"` : ''}${dmg.slowRequest ? ` data-slow-request="${esc(encodeURIComponent(JSON.stringify(dmg.slowRequest)))}"` : ''}>Apply ${damageAmount} damage to ${damageBound ? 'target' : `${targetCount} target${targetCount === 1 ? '' : 's'}`}</button></div>`
    : '';

  const inspirationNotice = inspirationResolution
    ? `<div class="damage-section">${esc(localizeCard('SDR5E.HeroicInspiration.Resolving').replace('{replacement}', String(inspirationResolution.replacement)).replace('{total}', String(inspirationResolution.total)))}</div>`
    : '';

  return `<div class="sdr-roll-card codex-roll-card-v13" data-action="toggle-roll-details">
    <div class="card-header">
      <span>${label}</span>
      ${modeTag}
    </div>
    <div class="roll-main">
      <div class="dice-total${natClass}">${displayRoll.total}</div>
      <div class="roll-details">
        <span class="formula">${esc(displayRoll.formula)}</span>
        ${displayRoll.flavor && displayRoll.flavor !== label ? `<span class="vs">${esc(displayRoll.flavor)}</span>` : ''}
        <span class="click-to-see">Click to see breakdown</span>
      </div>
    </div>
    <div class="roll-details-expanded hidden">
      <div class="dice-breakdown">${diceBreakdown}${modifierTerms}</div>
    </div>
    ${targetsSection}
    ${concentrationSaveAction}
    ${toppleButton}
    ${nickButtons}
    ${grazeButton}
    ${pushButton}
    ${cleaveButton}
    ${sapButton}
    ${slowButton}
    ${inlineDamageBtn}
    ${inspirationNotice}
    ${hitDieChoiceSection}
    ${indomitableMightSection}
    ${damageSection}
    ${applyBtnSection}
  </div>`;
});

// Clique no card (fora do botão de aplicar dano) alterna o detalhe da
// rolagem — mesmo padrão do `click-to-see` do CSS original.
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-srd5e-action]')) return;
  // The half-on-save checkbox lives inside the card; clicking it must not expand the details.
  if (event.target.closest('.damage-button-section')) return;
  const card = event.target.closest('[data-action="toggle-roll-details"]');
  if (!card) return;
  const expanded = card.querySelector('.roll-details-expanded');
  expanded?.classList.toggle('hidden');
});

// Card de info estilo dnd5e pras mensagens que não são rolagem
// (descanso, cura, dano aplicado) — mesma família visual do card de rolagem
// da Parte A, com ícone/cor por tipo (isRest/isHeal/isDamage, flags que
// `_takeRest`/`applyHeal`/`applyDamage`/`applyDamageToTargets` já mandam).
window.Loom.wraps.renderMessage.addWrapper((wrapped, msg, ctx) => {
  const outer = wrapped(msg, ctx);
  const flags = msg.flags?.srd5e;
  if (!flags || msg.isRoll) return outer;
  const esc = ctx.esc;

  let cardHtml = '';
  // Handout 40 — card de ativação com botões embutidos (Attack/Damage),
  // referência real do dnd5e (Rod of Lordly Might / Acid Splash).
  if (flags.isWeaponCard) {
    cardHtml = `<div class="codex-roll-card-v13 codex-info-card-v13">
      <div class="card-header"><span><i class="fas fa-sword"></i> ${esc(flags.name || '')}</span></div>
      ${flags.description ? `<div class="damage-section">${flags.description}</div>` : ''}
      <div class="activation-card-buttons">
        <button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-attack" data-actor-id="${esc(flags.actorId)}" data-item-id="${esc(flags.itemId)}">Attack</button>
        <button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-damage" data-actor-id="${esc(flags.actorId)}" data-item-id="${esc(flags.itemId)}">Damage</button>
      </div>
    </div>`;
  } else if (flags.isSpellCast) {
    cardHtml = `<div class="codex-roll-card-v13 codex-info-card-v13">
      <div class="card-header"><span><i class="fas fa-wand-sparkles"></i> ${esc(flags.name || '')}</span></div>
      ${flags.description ? `<div class="damage-section">${flags.description}</div>` : ''}
      <div class="activation-card-buttons">
        <button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-spell-attack" data-actor-id="${esc(flags.actorId)}" data-item-id="${esc(flags.itemId)}"><i class="fas fa-sword"></i> Attack</button>
        <button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-spell-damage" data-from-card="true" data-actor-id="${esc(flags.actorId)}" data-item-id="${esc(flags.itemId)}"${flags.castSlotLevel != null && Number.isFinite(Number(flags.castSlotLevel)) ?` data-cast-at-level="${esc(String(Number(flags.castSlotLevel)))}"` : ''}><i class="fas fa-burst"></i> Damage</button>
        ${flags.hasWishStress === true ? `<button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-wish-stress" data-from-card="true" data-actor-id="${esc(flags.actorId)}" data-item-id="${esc(flags.itemId)}"${flags.castSlotLevel != null && Number.isFinite(Number(flags.castSlotLevel)) ?` data-cast-at-level="${esc(String(Number(flags.castSlotLevel)))}"` : ''}><i class="fas fa-skull"></i> ${esc(localizeCardOr('SDR5E.Spell.WishStressButton', 'Roll stress (1d10 Necrotic per spell level)'))}</button>` : ''}
        ${(Array.isArray(flags.triggeredDamage) ? flags.triggeredDamage : []).map((label, index) => `<button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-spell-triggered" data-from-card="true" data-trigger-index="${index}" data-actor-id="${esc(flags.actorId)}" data-item-id="${esc(flags.itemId)}"${flags.castSlotLevel != null && Number.isFinite(Number(flags.castSlotLevel)) ?` data-cast-at-level="${esc(String(Number(flags.castSlotLevel)))}"` : ''}><i class="fas fa-burst"></i> ${esc(localizeCardOr('SDR5E.Spell.TriggeredDamageButton', 'Roll {label}').replace('{label}', String(label)))}</button>`).join('')}
      </div>
    </div>`;
  } else {
    const kind = flags.isRest ? 'rest' : flags.isHeal ? 'heal' : (flags.isDamage || flags.name === 'Damage Applied') ? 'damage' : null;
    if (kind) {
      const icon = { rest: 'fa-campground', heal: 'fa-heart', damage: 'fa-burst' }[kind];
      cardHtml = `<div class="codex-roll-card-v13 codex-info-card-v13 codex-info-card-${kind}">
        <div class="card-header"><span><i class="fas ${icon}"></i> ${esc(flags.name || '')}</span></div>
        ${flags.description ? `<div class="damage-section">${flags.description}</div>` : ''}
      </div>`;
    }
  }

  if (cardHtml) {
    return outer.replace(/<div class="sidebar-message-body">[\s\S]*?<\/div>\s*<\/div>$/, `<div class="sidebar-message-body">${cardHtml}</div></div>`);
  }
  return outer;
});

window.Loom.socket.on('item.updated', (item) => {
  void syncEquippedEffect(item);
  void endRageForHeavyArmor(item);
});
window.Loom.socket.on('cast.updated', (cast) => {
  void endRageForIncapacitatedCast(cast);
  void endConcentrationForIncapacitatedCast(cast);
});
LoomHooks.on('combatTurn', (combat) => {
  void processRageCombatTurn(combat);
  void processCombatEffectsTurn(combat);
});
LoomHooks.on('combatEnd', (event) => {
  void clearRageCombatTrackingOnEnd(event);
  void clearCombatEffectsOnEnd(event);
});
// Feature/Background/Raça/Classe/Subclasse/Feat não têm toggle "Equipado"
// — o bônus deles é permanente assim que o item existe no personagem, por
// isso o gatilho é ganhar/perder o item, não atualizar ele. Ver Handout 11.
window.Loom.socket.on('item.created', (item) => { void syncPermanentBonusEffect(item); });
window.Loom.socket.on('item.deleted', (item) => { void removeItemEffects(item); });

// ── Native sheets ─────────────────────────────────────────────────────────

sheets.catalog('actor', 'character', Sdr5eCharacterSheet);
sheets.catalog('actor', 'npc', Sdr5eNpcSheet);
sheets.catalog('actor', 'group', Sdr5eGroupSheet);
sheets.catalog('actor', 'vehicle', Sdr5eVehicleSheet);
sheets.catalog('actor', 'encounter', Sdr5eEncounterSheet);
sheets.catalog('item', '*', Sdr5eItemSheet);
