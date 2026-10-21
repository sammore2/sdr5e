// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/roll-engine.mjs
// Component Version: 0.1.0
//
// Real contract confirmed at wod5e/system/scripts/system-rolls.js:132
// (converted-system reference, not wod6e which is native from scratch):
//   Loom.dispatchRoll({ formula, actorId, mode, meta })
//
// Damage/heal/save equivalents to the original CodexApi.rollDamage/
// applyDamage/applyHeal/rollSave (codex-api.mjs:172 / CodexRoll.mjs:957 /
// codex-api.mjs:79). Cut from scope: checkDamageMastery (feat/class bypass),
// triggerOnKill (feature-specific), canvas scrolling text (visual — Gemini's
// territory). Operates directly on the actor (not a token targetId — that
// comes with an "apply" button on the sheet).
// ══════════════════════════════════════════════════════════════════════════

import { currentAdvantageMode, isCriticalHeld } from './utils.mjs';
import { exhaustionD20Penalty } from './progression.mjs';
import { getSetting } from './settings.mjs';
import { bonusesToChanges, applyTemporaryEffect, removeItemEffects, applySpellOrItemEffects } from './effects.mjs';
import { ITEM_TYPE_SINGULAR } from './config.mjs';
import { spellcastingStats } from './magic-initiate.mjs';
import { canUseWizardSignatureSpell } from './wizard-spell-mechanics.mjs';
import { addConcentrationSaveAttempt, concentrationSaveDc, pendingConcentrationSaveAttempts, resolveConcentrationAfterConditionUpdate, resolveConcentrationAfterDamage, resolveConcentrationEnd, resolveConcentrationSaveRoll } from './concentration-mechanics.mjs';
import { applyDamageThreshold, applyDamageTraits, resolveDamageConsequences } from './damage-mechanics.mjs';
import { canCastSpellsDuringRage, canEnterRage, createRageCombatState, heavyArmorRageEndTriggered, incapacitatedRageEndTriggered, rageDamageBonusForAttack, rageResistanceTypes, rageStrengthAdvantage, resolveRageCombatTurn, resolveRageExtension } from './rage-mechanics.mjs';
import { damageRollFormula } from './damage-formula.mjs';
import { expirePendingHitDie, registerPendingHitDie } from './hit-die-mechanics.mjs';
import { weaponProficiencyMatches } from './class-proficiencies.mjs';
import { resolveWeaponMasteryAttack, weaponMasteryForAttack, weaponMasteryDefinitionForItem, weaponMasteryNickAction, weaponMasteryPushTargetSizeEligible, weaponMasterySaveDC, weaponMasteryCleaveTurnAvailable, weaponMasteryNickTurnAvailable, weaponMasteryDamageAbilityModifier } from './weapon-mastery.mjs';
import { dangerSenseApplies, fighterClassLevel, fighterFeatureOncePerTurn, resolveAdvantageSources, syncedFighterFeatureUses } from './class-feature-mechanics.mjs';
import { composeAbilityCheckConditionModifiers, composeAttackConditionModifiers, conditionsForSingleTarget, frightenedAppliesToRoll, invisibleSituationModifiers } from './advantage-mechanics.mjs';
import { LoomDialog } from '/_loom/sdk/index.js';
import { resolveSuperiorInspirationRecovery } from './bardic-inspiration.mjs';
import { ITEM_ACTION_COST_LABEL_KEYS, normalizeItemActionCost, itemActionCostNoticeKey, itemActionReminderKey } from './item-action-costs.mjs';
import { resolveHealersKitUse, HEALERS_KIT_USES } from './healers-kit-mechanics.mjs';
import { rollPotionOfHealing, cappedHealingResult } from './potion-mechanics.mjs';
import { charmerTargetBlocked, isSingleAttackTargetCount, resolveAttackAgainstTarget } from './attack-target-mechanics.mjs';
import { reconcileUnconsciousMarkers } from './unconscious-condition-mechanics.mjs';
import { resolveMonsterZeroHp } from './monster-death-mechanics.mjs';
import { canUseGrappleHand, recordGrapple, removeGrapple, resolveGrapplePrerequisites } from './grapple-mechanics.mjs';
import { resolveShovePrerequisites, resolveShoveOutcome, addProneMarker } from './shove-mechanics.mjs';
import { COVER_DEGREES, chooseDexteritySaveCoverBonus, resolveCoverForAttack, strongestMarkedCover } from './cover-mechanics.mjs';
import { wizardSpellCastOptions } from './wizard-spell-mechanics.mjs';
import { activeSpellSlotTurn, sameSpellSlotTurn, spellSlotTurnSpendRecord } from './spell-slot-turn.mjs';
import { advanceCombatEffectRecords, appendCombatEffectRecord, clearAllCombatEffectRecords, combatEffectContextForActor, combatEffectRecordsForActiveCombat, combatEffectsForAttack, consumeCombatEffectRecords, createCombatEffectRecord, normalizeCombatEffectRecords } from './combat-effects.mjs';
import { executeFeatureResourceCosts } from './feature-resource-costs.mjs';
import { SPELL_HEALING_PRESETS, resolveSpellHealingFormula, isSpellAttackItem, isSpellHealingItem, getSpellSaveInfo } from './spell-action-mechanics.mjs';
export { SPELL_HEALING_PRESETS, resolveSpellHealingFormula, isSpellAttackItem, isSpellHealingItem, getSpellSaveInfo };

function localizeSpell(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.Spellcasting.${key}`);
}

function localizeClassFeature(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.ClassFeatures.${key}`) || key;
}

function localizeCombat(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.Combat.${key}`) || key;
}

function coverText(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.Cover.${key}`) || key;
}

function canRollAtMostOneAttackTarget() {
  const count = window.Loom?.user?.targets?.length || 0;
  if (isSingleAttackTargetCount(count)) return true;
  window.Loom?.showToast?.(localizeCombat('SelectOneAttackTarget'), 'warning');
  return false;
}

async function chooseSpellSlot(actor, item, spellLevel) {
  const resources = actor.systemData?.resources || {};
  const normal = resources.spellSlots || {};
  const candidates = [];
  for (let level = spellLevel; level <= 9; level++) {
    if ((Number(normal[level]?.value) || 0) > 0) candidates.push({ pool: 'spell', level });
  }
  const pact = resources.pactMagic;
  if (pact && !pact.needsReview && pact.spellLevel >= spellLevel && (Number(pact.value) || 0) > 0) {
    candidates.push({ pool: 'pact', level: Number(pact.spellLevel) });
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const select = document.createElement('select');
  select.className = 'sdrn-spell-slot-select';
  for (const candidate of candidates) {
    const option = document.createElement('option');
    option.value = `${candidate.pool}:${candidate.level}`;
    option.textContent = `${candidate.pool === 'pact' ? localizeSpell('PactMagic') : localizeSpell('Spellcasting')} — ${localizeSpell('SlotLevel')} ${candidate.level} (${candidate.pool === 'pact' ? pact.value : normal[candidate.level].value} ${localizeSpell('Remaining')})`;
    select.append(option);
  }
  const result = await LoomDialog.wait({
    window: { title: `${localizeSpell('ChooseSlot')} — ${item.name}` },
    content: select,
    buttons: [
      { action: 'cancel', label: localizeSpell('Cancel'), variant: 'ghost', callback: () => null },
      { action: 'cast', label: localizeSpell('Cast'), variant: 'primary', callback: () => select.value },
    ],
  });
  if (!result) return null;
  const [pool, level] = result.split(':');
  return { pool, level: Number(level) };
}

async function chooseFeatureSpellCastMode(item, freeCastLabelKey = 'MagicInitiateFreeCast') {
  const select = document.createElement('select');
  select.className = 'sdrn-spell-slot-select';
  for (const [value, key] of [['free', freeCastLabelKey], ['slot', 'MagicInitiateUseSlot']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = localizeSpell(key) || key;
    select.append(option);
  }
  const result = await LoomDialog.wait({
    window: { title: `${localizeSpell('ChooseCastMode') || 'Choose casting method'} — ${item.name}` },
    content: select,
    buttons: [
      { action: 'cancel', label: localizeSpell('Cancel'), variant: 'ghost', callback: () => null },
      { action: 'cast', label: localizeSpell('Cast'), variant: 'primary', callback: () => select.value },
    ],
  });
  return result || null;
}

/**
 * Conditions live on Cast (token) records, not the Actor (`statusMarkers:
 * string[]`, confirmed in client/screens/game-hud/token-hud.ts — the GM
 * already has a real UI to toggle these per-token). An actor with no token
 * placed anywhere, or any lookup failure, resolves to `[]` — this must
 * never be able to block a roll; on any error it silently behaves exactly
 * as it did before this existed. Unioned across every token of this actor
 * if there's more than one on the board.
 */
export async function getActorConditions(actorId) {
  if (!actorId) return [];
  try {
    const worldId = window.Loom?.world?.id;
    if (!worldId) {
      const actor = await normalizeNpcDeathAtZero(actorId, await window.Loom.api.get(`/actors/${actorId}`));
      const hp = getHealthPool(actor?.systemData || {}, actor?.type);
      if (actor?.systemData?.resources?.knockedOut === true) return ['unconscious'];
      const characterStyle = actor?.type === 'character' || actor?.type === 'npc' && actor.systemData?.details?.useCharacterDeathSaves === true;
      return characterStyle && (Number(hp?.value) || 0) <= 0 && actor?.systemData?.resources?.deathState !== 'dead' ? ['unconscious'] : [];
    }
    const cast = await window.Loom.api.get(`/cast?worldId=${worldId}`);
    const list = Array.isArray(cast) ? cast : [];
    let actor = null;
    try {
      actor = await window.Loom.api.get(`/actors/${actorId}`);
    } catch (e) {
      console.error('[srd5e] actor HP lookup for Unconscious condition failed:', e);
    }
    if (actor) actor = await normalizeNpcDeathAtZero(actorId, actor);
    const actorHealth = getHealthPool(actor?.systemData || {}, actor?.type);
    if (actor?.systemData) {
      const systemData = await syncUnconsciousConditionMarkers(actorId, actor.systemData, list, null, actor.type);
      const owned = systemData.resources?.unconsciousConditionTokenIds || [];
      if (JSON.stringify(owned) !== JSON.stringify(actor.systemData.resources?.unconsciousConditionTokenIds || [])) {
        try {
          await window.Loom.api.put(`/actors/${actorId}`, { systemData: { resources: { unconsciousConditionTokenIds: owned } } });
        } catch (e) {
          console.error('[srd5e] failed to persist Unconscious marker ownership during condition read:', e);
        }
      }
    }
    const set = new Set();
    for (const c of list) {
      if (c.actorId !== actorId) continue;
      for (const m of (c.statusMarkers || [])) set.add(m);
    }
    for (const cond of (actor?.systemData?.conditions || [])) set.add(cond);
    const characterStyle = actor?.type === 'character' || actor?.type === 'npc' && actor.systemData?.details?.useCharacterDeathSaves === true;
    if (characterStyle && (Number(actorHealth?.value) || 0) <= 0 && actor?.systemData?.resources?.deathState !== 'dead') set.add('unconscious');
    if (actor?.systemData?.resources?.knockedOut === true) set.add('unconscious');
    return Array.from(set);
  } catch (e) {
    console.error('[srd5e] getActorConditions failed (roll proceeds unaffected):', e);
    return [];
  }
}

async function normalizeNpcDeathAtZero(actorId, actor) {
  if (actor?.type !== 'npc' || actor.systemData?.details?.useCharacterDeathSaves === true) return actor;
  const hp = getHealthPool(actor.systemData || {}, actor.type);
  const result = resolveMonsterZeroHp({
    actorType: actor.type,
    useCharacterDeathSaves: false,
    hpAfter: hp?.value,
    deathState: actor.systemData?.resources?.deathState,
  });
  if (!result.diedNow) return actor;
  const systemData = {
    ...actor.systemData,
    resources: { ...(actor.systemData?.resources || {}), deathState: 'dead', deathSaves: { successes: 0, failures: 0 } },
  };
  const syncedSystemData = await syncUnconsciousConditionMarkers(actorId, systemData, null, null, actor.type);
  try {
    await window.Loom.api.put(`/actors/${actorId}`, {
      systemData: {
        resources: {
          deathState: 'dead',
          deathSaves: { successes: 0, failures: 0 },
          unconsciousConditionTokenIds: syncedSystemData.resources?.unconsciousConditionTokenIds || [],
        },
      },
    });
  } catch (e) {
    console.error('[srd5e] failed to apply the NPC-at-zero death rule:', e);
  }
  return { ...actor, systemData: syncedSystemData };
}

/** Keep automatic Unconscious markers on existing tokens while preserving GM-owned markers. */
async function syncUnconsciousConditionMarkers(actorId, systemData, castList = null, standaloneCast = null, actorType = 'character') {
  const resources = { ...(systemData?.resources || {}) };
  const health = getHealthPool(systemData || {}, 'character');
  const characterStyle = actorType === 'character' || actorType === 'npc' && systemData?.details?.useCharacterDeathSaves === true;
  const shouldBeUnconscious = resources.knockedOut === true || (characterStyle
    && (Number(health?.value) || 0) <= 0 && resources.deathState !== 'dead');
  const worldId = window.Loom?.world?.id;
  if (!worldId) return { ...systemData, resources };

  let list = Array.isArray(castList) ? castList : null;
  if (!list) {
    try {
      const response = await window.Loom.api.get(`/cast?worldId=${worldId}`);
      list = Array.isArray(response) ? response : [];
    } catch (e) {
      console.error('[srd5e] unconscious condition token lookup failed:', e);
      return { ...systemData, resources };
    }
  }
  const casts = standaloneCast
    ? [standaloneCast]
    : list.filter((token) => token.actorId === actorId);
  const ownedBefore = Array.isArray(resources.unconsciousConditionTokenIds) ? resources.unconsciousConditionTokenIds : [];
  const result = reconcileUnconsciousMarkers(casts, ownedBefore, shouldBeUnconscious);
  const owned = new Set(ownedBefore.map(String));
  for (const update of result.updates) {
    try {
      await window.Loom.api.put(`/cast/${update.id}`, { statusMarkers: update.statusMarkers });
      if (shouldBeUnconscious) owned.add(update.id);
      else owned.delete(update.id);
    } catch (e) {
      console.error(`[srd5e] unconscious condition update failed for cast ${update.id}:`, e);
    }
  }
  if (!shouldBeUnconscious) {
    for (const token of casts) {
      if (owned.has(String(token.id)) && !result.updates.some((entry) => entry.id === String(token.id))) {
        const markers = Array.isArray(token.statusMarkers) ? token.statusMarkers : [];
        if (!markers.includes('unconscious')) owned.delete(String(token.id));
      }
    }
  }
  resources.unconsciousConditionTokenIds = [...owned].sort();
  return { ...systemData, resources };
}

/**
 * Currently-targeted tokens' own conditions (`window.Loom.user.targets`
 * already returns full cast objects with `statusMarkers` inline — no extra
 * fetch needed, unlike `getActorConditions` which has to search the whole
 * cast collection by actorId). Used for "attacks against a
 * paralyzed/stunned/unconscious/restrained/prone creature have advantage" —
 * a rule about the TARGET's condition, not the roller's own.
 */
function getTargetConditions() {
  const targets = window.Loom?.user?.targets || [];
  return conditionsForSingleTarget(targets);
}

/**
 * CA fresca de cada alvo (não confia no `da.value` que já estiver no
 * objeto cast — pode nunca ter sido derivado, ver nota do Handout 36).
 * Mesmo fetch Cast-vs-Actor de `applyDamageToTargets`, mas só lendo CA,
 * sem tocar em HP.
 */
async function getTargetAcInfo() {
  const targets = window.Loom?.user?.targets || [];
  if (!targets.length) return [];
  const { prepCharacter, prepNpc } = await import('./prepare-data.mjs');

  const out = [];
  for (const t of targets) {
    const castId = typeof t === 'string' ? t : t?.id;
    if (!castId) continue;
    try {
      const cast = await window.Loom.api.get(`/cast/${castId}`);
      if (!cast) continue;
      const isLinked = cast.isLinked === true;
      const record = isLinked && cast.actorId ? await window.Loom.api.get(`/actors/${cast.actorId}`) : cast;
      if (!record) continue;
      const sd = record.systemData || {};
      if (!sd.abilities) continue;
      if (record.type === 'npc') prepNpc(sd);
      else prepCharacter(sd, record.items || []);
      const ac = Number(sd.attributes?.da?.value ?? sd.attributes?.ac?.value ?? sd.attributes?.ac ?? 10);
      if (!Number.isFinite(ac)) continue;
      const markerConditions = new Set([...(cast.statusMarkers || []), ...(isLinked && cast.actorId ? await getActorConditions(cast.actorId) : [])]);
      const markedCover = strongestMarkedCover([...markerConditions]);
      const cover = await grappleSelect(coverText('AttackTitle'), [
        [COVER_DEGREES.NONE, coverText('None')],
        [COVER_DEGREES.HALF, coverText('Half')],
        [COVER_DEGREES.THREE_QUARTERS, coverText('ThreeQuarters')],
        [COVER_DEGREES.TOTAL, coverText('Total')],
      ], coverText('Confirm'), 'Cover', markedCover);
      if (!cover) return null;
      const outcome = resolveCoverForAttack(cover, ac);
      if (!outcome.valid) return null;
      if (!outcome.directlyTargetable) {
        window.Loom?.showToast?.(coverText('TotalBlocksTarget'), 'warning');
        return null;
      }
      // Per-target Invisible answer stored on the target cast (SRD "Invisible"); absent unless boolean.
      const seesInvisible = typeof cast.systemData?.srd5eSeesInvisible === 'boolean' ? cast.systemData.srd5eSeesInvisible : undefined;
      out.push({
        castId: String(castId), actorId: isLinked && cast.actorId ? String(cast.actorId) : '',
        name: cast.name || record.name || 'Target', ac: outcome.armorClass, conditions: [...markerConditions],
        ...(seesInvisible !== undefined ? { seesInvisible } : {}),
      });
    } catch (e) {
      console.error(`[srd5e] getTargetAcInfo failed for cast ${castId}:`, e);
    }
  }
  return out;
}

const AUTOMATIC_CRITICAL_CONDITIONS = ['paralyzed', 'unconscious'];

function attackRuleText(key, fallback) {
  return window.Loom?.i18n?.localize?.(`SDR5E.Combat.${key}`) || fallback;
}

/**
 * Asks the attacking user a distance question the system cannot measure
 * (SRD "Prone" and "Paralyzed"/"Unconscious" both use 5 feet). Returns
 * true (within 5 ft), false (farther), or null (cancelled).
 */
async function askAttackerWithinFiveFeet(title, message) {
  const content = document.createElement('p');
  content.textContent = message;
  const answer = await LoomDialog.wait({
    window: { title }, content,
    buttons: [
      { action: 'cancel', label: attackRuleText('Cancel', 'Cancel'), variant: 'ghost', callback: () => 'cancel' },
      { action: 'far', label: attackRuleText('MoreThan5Feet', 'More than 5 feet'), variant: 'ghost', callback: () => 'far' },
      { action: 'near', label: attackRuleText('Within5Feet', 'Within 5 feet'), variant: 'primary', callback: () => 'near' },
    ],
  });
  if (answer === 'near') return true;
  if (answer === 'far') return false;
  return null;
}

/**
 * Asks the attacking user a Yes/No question the system cannot evaluate on its
 * own (SRD "Invisible": whether a creature can see the invisible creature).
 * Returns true (Yes), false (No), or null (cancelled).
 */
async function askAttackerYesNo(title, message) {
  const content = document.createElement('p');
  content.textContent = message;
  const answer = await LoomDialog.wait({
    window: { title }, content,
    buttons: [
      { action: 'cancel', label: attackRuleText('Cancel', 'Cancel'), variant: 'ghost', callback: () => 'cancel' },
      { action: 'no', label: 'No', variant: 'ghost', callback: () => 'no' },
      { action: 'yes', label: 'Yes', variant: 'primary', callback: () => 'yes' },
    ],
  });
  if (answer === 'yes') return true;
  if (answer === 'no') return false;
  return null;
}

/** Grappler identity recorded on the grappled creature's cast by persistGrapple; null when absent. */
async function getGrappledRecord(actorId) {
  const worldId = window.Loom?.world?.id;
  if (!actorId || !worldId) return null;
  const list = await window.Loom.api.get(`/cast?worldId=${worldId}`);
  const cast = (Array.isArray(list) ? list : []).find((entry) => entry.actorId === actorId && entry.systemData?.srd5eGrapple);
  const grapple = cast?.systemData?.srd5eGrapple;
  if (!grapple) return null;
  return { grapplerActorId: String(grapple.grapplerActorId || ''), grapplerCastId: String(grapple.grapplerCastId || '') };
}

/**
 * Attack rules that depend on the single captured target's identity or the
 * attacker's distance (SRD "Grappled", "Prone") or on whether the creatures
 * can see an Invisible creature (SRD "Invisible"). Each question is asked only
 * when its condition is present. Returns the `situational` object for
 * composeAttackConditionModifiers, or null when a required answer was cancelled.
 */
async function resolveAttackSituation(actor, selfConditions, targets) {
  const situational = {};
  if (!Array.isArray(targets) || targets.length === 0) return situational;
  if (targets.length > 1) {
    // Invisible answers are per target and cannot ride on one shared roll; the
    // attack must be split. The attack paths already gate on one target, so this
    // refuses loudly rather than silently dropping the Invisible clause.
    window.Loom?.showToast?.(localizeCombat('SelectOneAttackTarget'), 'warning');
    return null;
  }
  const [target] = targets;
  if (selfConditions.includes('grappled')) {
    const grapple = await getGrappledRecord(actor.id);
    if (grapple) {
      const isGrappler = (!!grapple.grapplerActorId && grapple.grapplerActorId === target.actorId)
        || (!!grapple.grapplerCastId && grapple.grapplerCastId === String(target.castId));
      situational.grappledAgainstOther = !isGrappler;
    } else {
      console.warn('[srd5e] Grappled attacker has no recorded grappler; Disadvantage against non-grappler targets was not applied.');
    }
  }
  if ((target.conditions || []).includes('prone')) {
    const within = await askAttackerWithinFiveFeet(
      attackRuleText('ProneTitle', 'Prone target'),
      attackRuleText('ProneWithin5Ft', 'Is the attacker within 5 feet of the Prone target? Yes: Advantage. No: Disadvantage.'),
    );
    if (within === null) return null;
    situational.targetProneWithin5ft = within;
  }
  // Two Invisible answers are stored separately so each one is reused only for its own question:
  // - srd5eSeesInvisible on the target cast: can the attacker see the invisible target (targetInvisible).
  // - srd5eInvisibleAttackerSeen on the attacker's cast: can the target see the invisible attacker (selfInvisible).
  // Answers are turned into Advantage/Disadvantage by applyWeaponAttackConditionModifiers (invisibleSituationModifiers).
  const selfInvisible = selfConditions.includes('invisible');
  const targetInvisible = (target.conditions || []).includes('invisible');
  const attackerCast = selfInvisible ? await getAttackerCast(actor.id) : null;
  const attackerCastId = attackerCast?.id != null ? String(attackerCast.id) : '';
  const storedTargetSees = attackerCast?.systemData?.srd5eInvisibleAttackerSeen;
  const attackerSeenFlagged = typeof storedTargetSees === 'boolean';
  const targetSeenFlagged = typeof target.seesInvisible === 'boolean';
  const answersToSave = {};
  if (selfInvisible) {
    const targetSees = attackerSeenFlagged ? storedTargetSees : await askAttackerYesNo(
      'Invisible',
      attackRuleText('InvisibleAttackerSeen', 'Can the target see you?'),
    );
    if (targetSees === null) return null;
    situational.targetSeesAttacker = targetSees;
    if (!attackerSeenFlagged) answersToSave.attackerCast = targetSees;
  }
  if (targetInvisible) {
    const attackerSees = targetSeenFlagged ? target.seesInvisible : await askAttackerYesNo(
      'Invisible',
      attackRuleText('InvisibleTargetSeen', 'Can you see the invisible target?'),
    );
    if (attackerSees === null) return null;
    situational.attackerSeesTarget = attackerSees;
    if (!targetSeenFlagged) answersToSave.targetCast = attackerSees;
  }
  if (answersToSave.targetCast !== undefined) await persistCastFlag(target.castId, 'srd5eSeesInvisible', answersToSave.targetCast);
  if (answersToSave.attackerCast !== undefined && attackerCastId) {
    await persistCastFlag(attackerCastId, 'srd5eInvisibleAttackerSeen', answersToSave.attackerCast);
  }
  return situational;
}

/** The attacker's cast: matched by actorId (linked) or by cast id (unlinked); null when not found. */
async function getAttackerCast(actorId) {
  const worldId = window.Loom?.world?.id;
  if (!actorId || !worldId) return null;
  const list = await window.Loom.api.get(`/cast?worldId=${worldId}`);
  const entries = Array.isArray(list) ? list : [];
  return entries.find((entry) => String(entry.id) === String(actorId))
    || entries.find((entry) => entry.actorId === actorId)
    || null;
}

/** Saves one boolean Invisible answer on a cast's systemData so later attacks do not ask again (SRD "Invisible"). */
async function persistCastFlag(castId, field, value) {
  if (!castId) return;
  try {
    const cast = await window.Loom.api.get(`/cast/${encodeURIComponent(castId)}`);
    if (!cast) return;
    await window.Loom.api.put(`/cast/${encodeURIComponent(castId)}`, {
      systemData: { ...(cast.systemData || {}), [field]: value === true },
    });
  } catch (e) {
    console.error(`[srd5e] could not save the Invisible answer ${field} on cast ${castId}:`, e);
  }
}

/**
 * SRD "Paralyzed" / "Unconscious": a hit on the bound target is a Critical
 * Hit when the attacker is within 5 feet. Applied only after the attacking
 * user confirms the distance; otherwise the incoming `critical` is kept.
 */
async function resolveAutomaticCritical(options, critical) {
  if (critical || options.targetBound !== true || !options.targetId) return critical;
  let conditions = [];
  try {
    const cast = await window.Loom.api.get(`/cast/${options.targetId}`);
    if (!cast) return critical;
    const actorConditions = cast.isLinked === true && cast.actorId ? await getActorConditions(cast.actorId) : [];
    conditions = [...new Set([...(cast.statusMarkers || []), ...actorConditions])];
  } catch (e) {
    console.error('[srd5e] automatic critical target lookup failed:', e);
    return critical;
  }
  if (!AUTOMATIC_CRITICAL_CONDITIONS.some((condition) => conditions.includes(condition))) return critical;
  const within = await askAttackerWithinFiveFeet(
    attackRuleText('AutoCriticalTitle', 'Automatic Critical Hit'),
    attackRuleText('AutoCriticalWithin5Ft', 'Is the attacker within 5 feet of the Paralyzed or Unconscious target? Yes: the hit is a Critical Hit.'),
  );
  return within === true ? true : critical;
}

/**
 * Poisoned imposes disadvantage on ability checks. SRD 5.2 Exhaustion is a
 * numeric penalty to D20 Tests and is applied by the shared roll path; it is
 * not translated into disadvantage here.
 */
export function applyAbilityCheckConditionModifiers(explicitMode, selfConditions, exhaustionLevel = 0, armorPenalty = false, strengthAdvantage = false) {
  return composeAbilityCheckConditionModifiers(explicitMode, selfConditions || [], armorPenalty, strengthAdvantage);
}

/**
 * Attack rolls. Attacker-side disadvantage: poisoned, restrained, prone, or
 * blinded (a prone creature's own attacks have Disadvantage). Target-side,
 * checked via `window.Loom.user.targets` since this is the attacker's roll
 * reacting to the TARGET's state: paralyzed/petrified/stunned/unconscious/
 * restrained/blinded targets grant advantage. A Prone target depends on the
 * attacker's distance (SRD "Prone": Advantage within 5 ft, otherwise
 * Disadvantage), so it is passed in `situational.targetProneWithin5ft` after
 * the attacking user answers; `isRanged` does not decide it.
 */
export function applyWeaponAttackConditionModifiers(explicitMode, selfConditions, isRanged = false, exhaustionLevel = 0, armorPenalty = false, extraDisadvantageSources = 0, extraAdvantageSources = 0, situational = {}) {
  const targetConditions = getTargetConditions();
  // Invisible (attacker or target) is counted here from the per-target visibility answers in `situational`.
  const invisible = invisibleSituationModifiers(selfConditions || [], targetConditions, situational.attackerSeesTarget, situational.targetSeesAttacker);
  return composeAttackConditionModifiers(explicitMode, selfConditions || [], isRanged, armorPenalty, targetConditions,
    extraDisadvantageSources + invisible.disadvantage, extraAdvantageSources + invisible.advantage, situational);
}

// Backwards-compatible name used at existing ability/skill-check call sites.
export function applyPoisonedDisadvantage(explicitMode, conditions) {
  return applyAbilityCheckConditionModifiers(explicitMode, conditions);
}

/**
 * Saving throws: restrained imposes disadvantage on Dexterity saves
 * specifically; paralyzed/stunned/unconscious force an AUTOMATIC FAILURE on
 * Strength and Dexterity saves (SRD 5.1) — the roll never happens at all in
 * that case, matching real dnd5e's behavior of skipping straight to
 * "fails" rather than rolling a d20 that can't matter.
 */
export function getSaveConditionOutcome(abilityKey, conditions, exhaustionLevel = 0, armorPenalty = false, featureState = {}) {
  const isStrOrDex = abilityKey === 'str' || abilityKey === 'dex';
  const autoFail = isStrOrDex && ['paralyzed', 'petrified', 'stunned', 'unconscious'].some((c) => conditions?.includes(c));
  // SRD 5.2 Exhaustion is applied as a numeric D20 Test penalty elsewhere.
  // SRD (Equipment/Armor.md): armadura sem proficiência dá desvantagem em
  // saves de Força/Destreza especificamente — por isso reaproveita `isStrOrDex`.
  const disadvantage = (abilityKey === 'dex' && conditions?.includes('restrained'))
    || (isStrOrDex && armorPenalty);
  const advantage = dangerSenseApplies(abilityKey, conditions, featureState.dangerSense)
    || rageStrengthAdvantage(featureState.items || [], abilityKey);
  return { autoFail, advantage, disadvantage, bonus: 0 };
}

export async function getSaveCoverBonus(abilityKey, conditions) {
  return chooseDexteritySaveCoverBonus(abilityKey, conditions, ({ defaultDegree }) => grappleSelect(coverText('SaveTitle'), [
    [COVER_DEGREES.NONE, coverText('SaveNone')],
    [COVER_DEGREES.HALF, coverText('SaveHalf')],
    [COVER_DEGREES.THREE_QUARTERS, coverText('SaveThreeQuarters')],
  ], coverText('Confirm'), 'Cover', defaultDegree));
}

/**
 * Perícias: Deafened força AUTO-FALHA em Perception especificamente (SRD:
 * "automatically fails any ability check that requires hearing" — a única
 * perícia do SRD inequivocamente ligada a audição). Outras perícias não são
 * afetadas — não tem granularidade de "requer audição" no schema pra
 * generalizar sem chutar.
 */
/** Skills whose checks require hearing (explicit per-skill flag; Perception is the only one flagged in SRD 5.2 text). */
export const HEARING_SKILLS = Object.freeze(['perception']);

export function getSkillConditionOutcome(skillKey, conditions) {
  const autoFail = HEARING_SKILLS.includes(skillKey) && !!conditions?.includes('deafened');
  return { autoFail };
}

export function isToolProficient(sd, item) {
  const profs = sd.proficiencies?.tools || [];
  if (!profs.length) return false;
  const idata = item?.system || item?.data || {};
  const identifier = String(idata.identifier || '').trim().toLowerCase();
  const name = String(item?.name || '').trim().toLowerCase();
  return profs.some((p) => {
    const v = String(p).trim().toLowerCase();
    return v === identifier || v === name;
  });
}

export async function rollToolCheck(actor, item) {
  if (!actor || !item) return null;
  const sd = actor.systemData;
  const idata = item.system || item.data || {};
  const abilityKey = (idata.ability || 'dex').toLowerCase();
  const abilityMod = sd.abilities?.[abilityKey]?.modifier ?? 0;
  const prof = sd.attributes?.prof?.value ?? 0;
  const proficient = isToolProficient(sd, item);
  const bonus = Number(idata.bonus) || 0;
  const parts = [
    { label: abilityKey.toUpperCase(), value: abilityMod },
    { label: 'Proficiency', value: proficient ? prof : 0 },
    { label: 'Tool', value: bonus },
  ];
  const conditions = await getActorConditions(actor.id);
  const advantage = applyAbilityCheckConditionModifiers(currentAdvantageMode(), conditions, sd.resources?.exhaustion ?? 0, !!sd.attributes?.armor?.penalty && (abilityKey === 'str' || abilityKey === 'dex'));
  return sdr5eRoll({ label: `Tool Check: ${item.name}`, parts, actor, advantage });
}

/**
 * Rolls 1d20 + parts/bonus, with advantage/disadvantage dialog and optional DC.
 * Handout 36 (extraMeta / targets) & Handout 37 (roll dialog + situational bonus).
 */
const FRIGHTENED_CHECK_LABEL = /^(Ability Check|Skill Check|Tool Check):/;

/**
 * SRD "Frightened": Disadvantage on ability checks and attack rolls while the source of fear is in
 * line of sight. Asked per roll, and only when the rolling actor has the Frightened condition.
 * Returns the adjusted advantage mode, or null when the question was cancelled.
 */
async function applyFrightenedToRoll(actor, label, extraMeta, advantage) {
  const isCheckOrAttack = extraMeta?.isAttack === true || extraMeta?.srd5eGrappleEscape === true
    || FRIGHTENED_CHECK_LABEL.test(String(label || ''));
  if (!isCheckOrAttack || !actor?.id) return advantage;
  const conditions = await getActorConditions(actor.id);
  if (!conditions.includes('frightened')) return advantage;
  const inLineOfSight = await askAttackerYesNo(
    attackRuleText('FrightenedTitle', 'Frightened'),
    attackRuleText('FrightenedSourceInSight', 'Is the source of fear in line of sight? Yes: Disadvantage on this check or attack.'),
  );
  if (inLineOfSight === null) return null;
  if (!frightenedAppliesToRoll(conditions, inLineOfSight)) return advantage;
  return resolveAdvantageSources(advantage === 1 ? 1 : 0, (advantage === -1 ? 1 : 0) + 1);
}

/**
 * Charmer ids recorded on the actor's cast (`systemData.srd5eCharmerIds`); empty when none are recorded.
 * The cast is matched by actorId (linked) or by cast id (unlinked, where the actor id is the cast id).
 */
async function getCharmerIds(actorId) {
  const worldId = window.Loom?.world?.id;
  if (!actorId || !worldId) return [];
  const list = await window.Loom.api.get(`/cast?worldId=${worldId}`);
  const cast = (Array.isArray(list) ? list : []).find((entry) => (entry.actorId === actorId || String(entry.id) === String(actorId))
    && Array.isArray(entry.systemData?.srd5eCharmerIds));
  return (cast?.systemData?.srd5eCharmerIds || []).map(String).filter(Boolean);
}

/** Charmed casts already prompted for a charmer this session; cleared when the Charmed marker ends. */
const charmerPromptedCastIds = new Set();

/**
 * Charmed has no source on the marker itself, so the GM picks the charmer from the scene's tokens.
 * Returns the chosen token/cast id, or null when cancelled or no other token is on the scene.
 */
async function pickCharmerFromScene(charmedCastId) {
  const options = [];
  for (const [id, data] of (window.Loom?.canvas?.active?.tokenData?.entries?.() || [])) {
    if (String(id) === String(charmedCastId)) continue;
    options.push([String(id), data?.name || data?.actorId || String(id)]);
  }
  if (options.length === 0) {
    window.Loom?.showToast?.(attackRuleText('CharmerNoScene', 'No other tokens on this scene to pick as the charmer.'), 'warning');
    return null;
  }
  return grappleSelect(
    attackRuleText('CharmerPickTitle', 'Who charmed this creature?'),
    options,
    attackRuleText('CharmerPickConfirm', 'Set charmer'),
    'Combat',
  );
}

/**
 * cast.updated handler (GM client only, since the socket relays to every client). When a cast gains
 * Charmed and no charmer is recorded yet, asks the GM for the charmer and stores it in srd5eCharmerIds.
 */
async function promptCharmerForCast(castPayload) {
  const cast = castPayload?.data || castPayload;
  const castId = cast?.id != null ? String(cast.id) : '';
  if (!castId || !window.Loom?.user?.isGM) return false;
  const markers = Array.isArray(cast.statusMarkers) ? cast.statusMarkers : [];
  if (!markers.includes('charmed')) {
    charmerPromptedCastIds.delete(castId);
    return false;
  }
  if (charmerPromptedCastIds.has(castId)) return false;
  if (Array.isArray(cast.systemData?.srd5eCharmerIds) && cast.systemData.srd5eCharmerIds.length > 0) return false;
  charmerPromptedCastIds.add(castId);
  try {
    const charmerId = await pickCharmerFromScene(castId);
    if (!charmerId) return false;
    // Store the chosen token's cast id and, when it has one, its actorId, so either identity matches.
    const charmerCast = await window.Loom.api.get(`/cast/${encodeURIComponent(charmerId)}`).catch(() => null);
    const charmerIds = [...new Set([String(charmerId), String(charmerCast?.actorId || '')].filter(Boolean))];
    const fresh = await window.Loom.api.get(`/cast/${castId}`);
    if (!fresh) return false;
    await window.Loom.api.put(`/cast/${castId}`, {
      systemData: { ...(fresh.systemData || {}), srd5eCharmerIds: charmerIds },
    });
    return true;
  } catch (e) {
    console.error('[srd5e] could not record the Charmed charmer:', e);
    return false;
  }
}

// Registered once the socket exists, so the Charmed prompt runs without touching srd5e.mjs.
// If Loom.socket is not ready at module load, poll until it appears, then register exactly once.
let charmerSocketRegistered = false;
function registerCharmerSocketListener() {
  if (charmerSocketRegistered) return true;
  const socket = window.Loom?.socket;
  if (typeof socket?.on !== 'function') return false;
  socket.on('cast.updated', (cast) => { void promptCharmerForCast(cast); });
  charmerSocketRegistered = true;
  return true;
}
if (!registerCharmerSocketListener()) {
  const charmerSocketTimer = setInterval(() => {
    if (registerCharmerSocketListener()) clearInterval(charmerSocketTimer);
  }, 250);
}

/**
 * SRD "Charmed": a Charmed creature can't attack its charmer. True means the attack must stop. The GM
 * may proceed (charmerTargetBlocked gmOverride); a player is stopped with a warning toast.
 */
async function charmerBlocksAttack(actor, conditions, targets) {
  if (!conditions.includes('charmed') || !Array.isArray(targets) || targets.length === 0) return false;
  const gmOverride = window.Loom?.user?.isGM === true;
  const charmerIds = await getCharmerIds(actor.id);
  const blocked = targets.some((target) => charmerTargetBlocked(conditions, charmerIds, target.actorId, gmOverride)
    || charmerTargetBlocked(conditions, charmerIds, target.castId, gmOverride));
  if (!blocked) return false;
  window.Loom?.showToast?.(localizeCombat('CharmerTargetBlocked'), 'warning');
  return true;
}

export async function sdr5eRoll({ label, parts = [], bonus = 0, actor, advantage: baseAdvantage = 0, initiative = false, dc = null, forcePublic = false, extraMeta = {} }) {
  const advantage = await applyFrightenedToRoll(actor, label, extraMeta, baseAdvantage);
  if (advantage === null) return null; // Frightened question cancelled
  const effectiveParts = parts.length > 0 ? parts.map((part) => ({ ...part })) : (bonus !== 0 ? [{ label: 'Modifier', value: Number(bonus) || 0 }] : []);
  const exhaustion = Math.max(0, Math.min(6, Number(actor?.systemData?.resources?.exhaustion) || 0));
  if (exhaustion > 0) effectiveParts.push({ label: 'Exhaustion', value: exhaustionD20Penalty(exhaustion) });
  const { showRollDialog } = await import('./roll-dialog.mjs');
  const choice = await showRollDialog({ title: label, parts: effectiveParts, advantage, initiative });
  if (!choice) return null; // cancelado

  if (initiative) await restoreSuperiorInspiration(actor);

  const baseBonus = effectiveParts.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  const totalBonus = baseBonus + choice.situational;
  const die = choice.advantage === 1 ? '2d20kh1' : choice.advantage === -1 ? '2d20kl1' : '1d20';
  const formula = totalBonus !== 0 ? `${die} + ${totalBonus}` : die;

  const meta = { label, ...(actor?.id ? { actorId: actor.id } : {}), ...(actor?.name ? { attackerName: actor.name } : {}), ...extraMeta };
  if (dc !== null && dc !== undefined) meta.dc = dc;
  if (choice.situational) meta.situational = choice.situational;
  if (choice.surprised) meta.surprised = true;

  const finalFormula = formula;
  window.Loom.dispatchRoll({
    formula: finalFormula,
    actorId: actor?.id,
    mode: forcePublic ? 'public' : choice.rollMode || 'public',
    meta,
  });
  return true;
}

async function restoreSuperiorInspiration(actor) {
  if (!actor?.id) return false;
  try {
    const freshActor = await window.Loom.api.get(`/actors/${actor.id}?populate=true`);
    const bard = freshActor?.items?.find((item) => item.type === 'class'
      && (item.system || item.data || {}).classIdentifier === 'bard');
    const bardLevel = Number((bard?.system || bard?.data || {}).levels) || 0;
    const feature = freshActor?.items?.find((item) => item.type === 'feature'
      && (item.system || item.data || {}).classIdentifier === 'bard'
      && (item.system || item.data || {}).identifier === 'superior-inspiration'
      && Number((item.system || item.data || {}).levelGained) === 18);
    const inspiration = freshActor?.items?.find((item) => item.type === 'feature'
      && (item.system || item.data || {}).classIdentifier === 'bard'
      && (item.system || item.data || {}).identifier === 'bardic-inspiration');
    if (freshActor?.type !== 'character' || bardLevel < 18 || !feature || !inspiration) return false;
    const data = inspiration.system || inspiration.data || {};
    const recovery = resolveSuperiorInspirationRecovery({ bardLevel, hasFeature: true, currentUses: data.uses?.value });
    if (!recovery.eligible || !recovery.restored) return false;
    await window.Loom.api.put(`/items/${inspiration.id}`, { data: { ...data, uses: { ...data.uses, value: recovery.uses } } });
    window.Loom?.showToast?.(localizeClassFeature('SuperiorInspirationRecovered'), 'success');
    return true;
  } catch (error) {
    console.warn('[sdr5e] Superior Inspiration could not be reconciled before Initiative:', error);
    window.Loom?.showToast?.(localizeClassFeature('SuperiorInspirationUnavailable'), 'warning');
    return false;
  }
}

export function getHealthPool(sd, actorType) {
  // character: resources.health · npc: resources.health (same shape, already unified)
  return sd.resources?.health || null;
}

/**
 * Rolls a simple additive dice formula ("1d6 + 5", "2d8", "1d4") LOCALLY and
 * returns the resolved total synchronously. `window.Loom.dispatchRoll` never
 * gives the total back to the caller (server-resolved, broadcast later) —
 * fine for a roll that's just displayed, useless when the number is needed
 * immediately (Apply Damage button). `window.Loom.Roll` looked like the
 * obvious fit but turned out to be WOD5E's dice-pool engine (comment in its
 * own source says so) — it silently drops any bare flat modifier term
 * (`new Roll('5').evaluate()` → total 0, confirmed live), which would have
 * quietly produced wrong damage numbers. Hand-rolled instead, scoped to the
 * additive `NdM (+/-) K` shape every SDR5E damage formula actually uses.
 */
export function evaluateDamageFormula(formula, critical = false) {
  const terms = String(formula || '0').replace(/\s+/g, '').match(/[+-]?\d*d?\d+/gi) || [];
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    const dieMatch = body.match(/^(\d*)d(\d+)$/i);
    if (dieMatch) {
      // SRD (Combat.md, "Critical Hits"): "Roll all of the attack's damage
      // dice twice" — dobra a CONTAGEM de dados, nunca o modificador fixo
      // (Handout 30). Só o ramo com `d` (dado) é afetado.
      let count = Number(dieMatch[1]) || 1;
      const faces = Number(dieMatch[2]) || 1;
      if (critical) {
        count *= 2;
        for (let i = 0; i < count; i++) total += sign * (Math.floor(Math.random() * faces) + 1);
      } else {
        for (let i = 0; i < count; i++) total += sign * (Math.floor(Math.random() * faces) + 1);
      }
    } else {
      total += sign * (Number(body) || 0);
    }
  }
  return Math.max(0, total);
}

/**
 * Finds the token/cast ID for an actor on the active canvas scene.
 */
export function findTokenIdForActor(actorId) {
  if (!actorId) return null;
  const targets = window.Loom?.user?.targets || [];
  for (const t of targets) {
    if (t?.actorId === actorId) return t.id;
  }
  const cm = window.Loom?.canvas?.active;
  if (cm?.tokenData) {
    for (const [id, data] of cm.tokenData.entries()) {
      if (data?.actorId === actorId) return id;
    }
  }
  return null;
}

/**
 * Displays floating text (damage in red, healing in green) on a token with broadcast.
 */
export function showFloatingDamageOrHeal(targetId, amount, isHeal = false) {
  if (!window.Loom?.canvas?.showFloatingText || !targetId || amount === 0) return;
  const sign = isHeal ? `+${amount}` : `-${amount}`;
  const color = isHeal ? '#2ecc71' : '#e74c3c';
  try {
    window.Loom.canvas.showFloatingText(targetId, sign, color, { broadcast: true });
  } catch (err) {
    console.warn('[srd5e] Failed to display floating text:', err);
  }
}

/**
 * Damage-to-targets, driven by `window.Loom.user.targets` (real, live
 * targeting concept — confirmed via `client/core/apply-to-targets.ts`,
 * which already resolves Cast vs Actor persistence). Not reused directly:
 * that helper does a flat subtraction at a fixed path with no idea about
 * SDR5E's damage-type resistance/immunity/vulnerability — wiring the Apply
 * Damage button straight to it would have silently skipped the exact trait
 * math fixed earlier this session. This duplicates the minimal trait/HP
 * logic from `applyDamage` against a fetched cast/actor record instead of a
 * live sheet's `actor` object, and keeps the same Cast-vs-Actor branch
 * `apply-to-targets.ts` and CLAUDE.md's Rule 6 both require.
 */
/**
 * Owned items for trait lookup in `applyDamageToTargets`. Linked actors
 * keep items on the actor record (`GET /actors/:id/items`); unlinked cast
 * snapshots own none, so they resolve to `[]`. Best-effort: any failure
 * means damage falls back to actor-level traits only, never blocks.
 */
async function getRecordItems(isLinked, cast) {
  if (!isLinked || !cast?.actorId) return [];
  try {
    const items = await window.Loom.api.get(`/actors/${cast.actorId}/items`);
    return Array.isArray(items) ? items : [];
  } catch (e) {
    console.error('[srd5e] getRecordItems failed (actor traits only):', e);
    return [];
  }
}

/**
 * SRD 5.2 "Knocking Out a Creature": a melee attack that would reduce a creature
 * to 0 HP may instead reduce it to 1 HP and give it the Unconscious condition.
 * Only applies when the attacker opted in (`knockOut` + `melee`, set by the
 * unchecked card toggle), the creature was above 0 HP, the damage would have
 * brought it to 0, and the target has a health pool (not a vehicle). Returns the
 * replacement damage result, or null when the normal consequences apply.
 */
function resolveKnockOutDamage({ damageResult, hpBefore, options = {}, actorType }) {
  if (options.knockOut !== true || options.melee !== true) return null;
  if (actorType === 'vehicle') return null;
  if (!(Number(hpBefore) > 0) || damageResult.hpAfter !== 0) return null;
  return {
    ...damageResult,
    health: { ...damageResult.health, value: 1 },
    hpAfter: 1,
    deathState: 'alive',
    deathSaves: { successes: 0, failures: 0 },
  };
}

export async function applyDamageToTargets(amount, type, targetIds, options = {}) {
  const worldId = window.Loom?.world?.id;
  const targets = Array.isArray(targetIds)
    ? targetIds.map((id) => ({ id: String(id) }))
    : window.Loom?.user?.targets || [];
  if (!worldId || !targets.length || amount <= 0) return [];

  const results = [];
  for (const t of targets) {
    // `user.targets` (main.ts:166) returns full cast OBJECTS filtered from
    // the live `gameContext.cast` collection, not bare id strings — confirmed
    // live while testing (a plain-string assumption would have called
    // `/cast/[object Object]`). Re-fetched anyway for a fresh HP value
    // instead of trusting the collection's possibly-stale snapshot.
    const castId = typeof t === 'string' ? t : t?.id;
    if (!castId) continue;
    try {
      const cast = await window.Loom.api.get(`/cast/${castId}`);
      if (!cast) continue;
      const isLinked = cast.isLinked === true;
      const record = isLinked && cast.actorId ? await window.Loom.api.get(`/actors/${cast.actorId}`) : cast;
      if (!record) continue;

      const sd = record.systemData || {};
      const actorType = record.type === 'npc' ? 'npc' : 'character';
      const hp = getHealthPool(sd, actorType);
      if (!hp) continue;

      const traits = getTraits(sd, actorType, await getRecordItems(isLinked, cast)) || {};
      // Multi-type spell: each component is its own damage instance (own type, threshold, traits).
      const componentOutcome = resolveComponentDamageOutcome(options.components, traits, sd.attributes?.damageThreshold, options.halfOnSave === true);
      let traitLabel;
      let finalAmount;
      if (componentOutcome) {
        finalAmount = componentOutcome.amount;
        traitLabel = componentOutcome.label;
      } else {
        // SRD 5.2 "Half Damage": a target that succeeds on the save takes half the damage (round down).
        // It is an adjustment, so it applies before the threshold and Resistance/Vulnerability.
        const dealtAmount = options.halfOnSave === true ? Math.floor(Number(amount) / 2) : amount;
        // SRD 5.2: the damage threshold is checked on the incoming instance, before Resistance/Vulnerability.
        const thresholdResult = applyDamageThreshold(dealtAmount, sd.attributes?.damageThreshold);
        const traitResult = thresholdResult.blocked ? { amount: 0, label: '' } : applyDamageTraits(thresholdResult.amount, traits, type);
        traitLabel = thresholdResult.blocked ? `below damage threshold (${thresholdResult.threshold})` : traitResult.label;
        finalAmount = traitResult.amount;
      }
      // Mesma regra da Parte A (SRD Combat.md, "Temporary Hit Points") — essa
      // função duplica o cálculo de `applyDamage`, então duplica o fix também.
      const normalDamageResult = resolveDamageConsequences({
        health: hp,
        finalDamage: finalAmount,
        deathState: sd.resources?.deathState,
        deathSaves: sd.resources?.deathSaves,
        critical: options.critical === true,
      });
      const knockOutResult = resolveKnockOutDamage({ damageResult: normalDamageResult, hpBefore: hp.value, options, actorType: record.type });
      const damageResult = knockOutResult || normalDamageResult;
      const monsterDeath = resolveMonsterZeroHp({
        actorType: record.type,
        useCharacterDeathSaves: sd.details?.useCharacterDeathSaves === true,
        hpAfter: damageResult.hpAfter,
        deathState: damageResult.deathState,
      });
      const deathSaves = monsterDeath.diedNow ? { successes: 0, failures: 0 } : damageResult.deathSaves;
      const newValue = damageResult.hpAfter;
      const concentration = resolveConcentrationAfterDamage({
        finalDamage: finalAmount,
        hpAfter: newValue,
        resources: sd.resources,
      });
      const nextResources = {
        ...sd.resources,
        health: damageResult.health,
        deathSaves,
        deathState: monsterDeath.deathState,
        ...(knockOutResult ? { knockedOut: true } : {}),
      };
      if (concentration.clear) {
        nextResources.concentrating = false;
        nextResources.concentratingOn = '';
        nextResources.concentrationId = '';
        nextResources.concentrationSaveAttemptId = '';
        nextResources.concentrationSaveAttemptIds = [];
      }
      let nextSystemData = { ...sd, resources: nextResources };
      const savePath = isLinked && cast.actorId ? `/actors/${cast.actorId}` : `/cast/${castId}`;
      await window.Loom.api.put(savePath, { systemData: nextSystemData });
      nextSystemData = await syncUnconsciousConditionMarkers(
        isLinked && cast.actorId ? cast.actorId : castId,
        nextSystemData,
        null,
        isLinked ? null : cast,
        record.type,
      );
      const ownedTokenIds = nextSystemData.resources?.unconsciousConditionTokenIds || [];
      if (JSON.stringify(ownedTokenIds) !== JSON.stringify(sd.resources?.unconsciousConditionTokenIds || [])) {
        try {
          await window.Loom.api.put(savePath, { systemData: { resources: { unconsciousConditionTokenIds: ownedTokenIds } } });
        } catch (e) {
          console.error('[srd5e] failed to persist Unconscious marker ownership:', e);
        }
      }

      if (concentration.originToRemove) await removeItemEffects({ id: concentration.originToRemove });
      if (concentration.saveDamage !== null) {
        const concentrationActor = {
          id: cast.actorId || castId,
          concentrationRecordType: isLinked && cast.actorId ? 'actor' : 'cast',
          systemData: nextSystemData,
          update: async (update) => {
            const resources = { ...(concentrationActor.systemData.resources || {}) };
            for (const [path, value] of Object.entries(update || {})) {
              const key = path.startsWith('system.resources.') ? path.slice('system.resources.'.length) : path;
              resources[key] = value;
            }
            concentrationActor.systemData = { ...concentrationActor.systemData, resources };
            return window.Loom.api.put(
              isLinked && cast.actorId ? `/actors/${cast.actorId}` : `/cast/${castId}`,
              { systemData: concentrationActor.systemData },
            );
          },
        };
        await rollConcentrationSave(concentrationActor, concentration.saveDamage);
      }

      if (finalAmount > 0) {
        showFloatingDamageOrHeal(castId, finalAmount, false);
      }

      results.push({ castId: String(castId), name: record.name, finalAmount, traitLabel });
    } catch (e) {
      console.error(`[srd5e] applyDamageToTargets failed for cast ${castId}:`, e);
    }
  }

  if (results.length) {
    const lines = results.map((r) => `${r.name}${r.traitLabel ? ` (${r.traitLabel})` : ''}: -${r.finalAmount} HP`).join('<br>');
    await window.Loom.ChatMessage.create({
      content: 'Damage applied',
      flags: { srd5e: { name: 'Damage Applied', description: `<div>${lines}</div>` } },
    });
  }
  return results;
}

export function getTraits(sd, actorType, items = []) {
  // character: traits.{di,dr,dv} · npc: details.traits.{di,dr,dv}
  const base = actorType === 'npc' ? sd.details?.traits : sd.traits;
  const itemTraits = getItemTraits(items);
  const rageResistances = rageResistanceTypes(items);
  if (!itemTraits && !rageResistances.length) return base;
  // Union actor-level traits with item-granted ones (resistance rings,
  // racial traits, class features...). Engine buffs are numeric-only
  // (effects.ts `add` does base + Number), so arrays can't ride a buff —
  // they resolve here, at damage time, instead.
  const out = {};
  for (const cat of ['di', 'dr', 'dv', 'ci']) {
    const merged = [...(base?.[cat] || []), ...(itemTraits?.[cat] || []), ...(cat === 'dr' ? rageResistances : [])];
    if (merged.length) out[cat] = [...new Set(merged.map((v) => String(v)))];
  }
  return out;
}

/** Toggles Barbarian Rage; its turn-based end conditions remain player-managed. */
export async function toggleRage(actor, item) {
  if (!actor || !item?.id) return false;
  const data = item.system || item.data || {};
  if (item.type !== 'feature' || data.classIdentifier !== 'barbarian' || data.identifier !== 'rage') return false;
  if (data.rageActive) {
    await window.Loom.api.put(`/items/${item.id}`, { data: { ...data, rageActive: false, rageTurnState: null } });
    await postItemToChat(actor, item);
    return true;
  }
  if (!canEnterRage(actor.items)) {
    window.Loom?.showToast?.(localizeClassFeature('RageCannotActivateHeavyArmor'), 'warning');
    return false;
  }
  const uses = data.uses || {};
  const value = Number(uses.value) || 0;
  if (value <= 0) {
    window.Loom?.showToast?.(localizeClassFeature('NoRageUsesRemaining'), 'warning');
    return false;
  }
  const rageTurnState = await createRageCombatStateForActor(actor);
  await window.Loom.api.put(`/items/${item.id}`, { data: { ...data, uses: { ...uses, value: value - 1 }, rageActive: true, rageTurnState } });
  const concentration = resolveConcentrationEnd(actor.systemData?.resources || {});
  if (concentration.ended) {
    if (concentration.originToRemove) await removeItemEffects({ id: concentration.originToRemove });
    await actor.update({
      'system.resources.concentrating': concentration.patch.concentrating,
      'system.resources.concentratingOn': concentration.patch.concentratingOn,
        'system.resources.concentrationId': concentration.patch.concentrationId,
        'system.resources.concentrationSaveAttemptId': concentration.patch.concentrationSaveAttemptId,
        'system.resources.concentrationSaveAttemptIds': concentration.patch.concentrationSaveAttemptIds,
    });
  }
  await postItemToChat(actor, { ...item, system: { ...data, uses: { ...uses, value: value - 1 }, rageActive: true, rageTurnState } });
  return true;
}

async function createRageCombatStateForActor(actor) {
  const combat = window.Loom?.combat;
  const combatant = combat?.combatants?.[Number(combat?.currentTurn)];
  if (!actor?.id || !combatant?.id) return null;
  try {
    const cast = await window.Loom.api.get(`/cast/${encodeURIComponent(combatant.id)}`);
    if (cast?.actorId !== actor.id) return null;
    const barbarianLevel = Math.max(0, ...(actor.items || []).filter((entry) => entry.type === 'class'
      && (entry.system || entry.data || {}).classIdentifier === 'barbarian')
      .map((entry) => Number((entry.system || entry.data || {}).levels) || 0));
    return createRageCombatState(combat, combatant.id, barbarianLevel >= 15);
  } catch {
    return null;
  }
}

/** End an active Rage after an equipped Heavy armor update (SRD early-end condition). */
export async function endRageForHeavyArmor(item) {
  if (!heavyArmorRageEndTriggered(item) || !item.actorId) return false;
  return endActiveRage(item.actorId);
}

/** End active Rage when any token for its actor receives an incapacitating condition. */
export async function endRageForIncapacitatedCast(castPayload) {
  const cast = castPayload?.data || castPayload;
  if (!cast?.actorId || !incapacitatedRageEndTriggered(cast)) return false;
  try {
    const actor = await window.Loom.api.get(`/actors/${encodeURIComponent(cast.actorId)}?populate=true`);
    const barbarianLevel = Math.max(0, ...(actor?.items || []).filter((entry) => entry.type === 'class'
      && (entry.system || entry.data || {}).classIdentifier === 'barbarian')
      .map((entry) => Number((entry.system || entry.data || {}).levels) || 0));
    if (!incapacitatedRageEndTriggered(cast, barbarianLevel >= 15)) return false;
    return endActiveRage(cast.actorId);
  } catch (error) {
    console.error('[srd5e] Could not check Rage after an incapacitating condition update:', error);
    return false;
  }
}

/** End Concentration when an updated linked token gains an incapacitating condition. */
export async function endConcentrationForIncapacitatedCast(castPayload) {
  const cast = castPayload?.data || castPayload;
  // cast.updated is relayed to several world clients. Restrict writes to the
  // GM client so the same transition cannot race through multiple owners.
  if (!window.Loom?.user?.isGM || !cast?.actorId) return false;
  try {
    const actor = await window.Loom.api.get(`/actors/${encodeURIComponent(cast.actorId)}?populate=true`);
    if (!actor?.id || String(actor.id) !== String(cast.actorId)) return false;
    const concentration = resolveConcentrationAfterConditionUpdate(actor.systemData?.resources || {}, cast);
    if (!concentration.triggered || !concentration.ended) return false;
    if (concentration.originToRemove) await removeItemEffects({ id: concentration.originToRemove });
    const systemData = actor.systemData || {};
    await window.Loom.api.put(`/actors/${encodeURIComponent(actor.id)}`, {
      systemData: { ...systemData, resources: {
        ...(systemData.resources || {}),
        concentrating: concentration.patch.concentrating,
        concentratingOn: concentration.patch.concentratingOn,
        concentrationId: concentration.patch.concentrationId,
        concentrationSaveAttemptId: concentration.patch.concentrationSaveAttemptId,
        concentrationSaveAttemptIds: concentration.patch.concentrationSaveAttemptIds,
      } },
    });
    return true;
  } catch (error) {
    console.error('[srd5e] Could not end Concentration after an incapacitating condition update:', error);
    return false;
  }
}

async function endActiveRage(actorId) {
  try {
    const actor = await window.Loom.api.get(`/actors/${encodeURIComponent(actorId)}?populate=true`);
    const rage = (actor?.items || []).find((entry) => {
      const data = entry.system || entry.data || {};
      return entry.type === 'feature' && data.classIdentifier === 'barbarian'
        && data.identifier === 'rage' && data.rageActive === true;
    });
    if (!rage) return false;
    const data = rage.system || rage.data || {};
    await window.Loom.api.put(`/items/${encodeURIComponent(rage.id)}`, { data: { ...data, rageActive: false, rageTurnState: null } });
    return true;
  } catch (error) {
    console.error('[srd5e] Could not end active Rage after a required early-end condition:', error);
    return false;
  }
}

/** Apply turn-bound Rage expiration from the SDK's authoritative combatTurn event. */
export async function processRageCombatTurn(combat) {
  if (!window.Loom?.user?.isGM || !combat?.id || !Array.isArray(combat.combatants) || !combat.combatants.length) return;
  const currentIndex = Number(combat.currentTurn);
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= combat.combatants.length) return;
  const previousIndex = (currentIndex - 1 + combat.combatants.length) % combat.combatants.length;
  const castIds = [...new Set([combat.combatants[currentIndex]?.id, combat.combatants[previousIndex]?.id].filter(Boolean).map(String))];
  const actorIds = new Set();
  for (const castId of castIds) {
    try {
      const cast = await window.Loom.api.get(`/cast/${encodeURIComponent(castId)}`);
      if (cast?.actorId) actorIds.add(String(cast.actorId));
    } catch (error) {
      console.error('[srd5e] Could not resolve combatant while updating Rage duration:', error);
    }
  }
  for (const actorId of actorIds) {
    try {
      const actor = await window.Loom.api.get(`/actors/${encodeURIComponent(actorId)}?populate=true`);
      const rage = (actor?.items || []).find((entry) => {
        const data = entry.system || entry.data || {};
        return entry.type === 'feature' && data.classIdentifier === 'barbarian'
          && data.identifier === 'rage' && data.rageActive === true
          && data.rageTurnState?.combatId === String(combat.id);
      });
      if (!rage) continue;
      const data = rage.system || rage.data || {};
      const transition = resolveRageCombatTurn(data.rageTurnState, combat);
      if (transition.action === 'ignore') continue;
      await window.Loom.api.put(`/items/${encodeURIComponent(rage.id)}`, {
        data: { ...data, rageActive: transition.action !== 'end', rageTurnState: transition.state },
      });
    } catch (error) {
      console.error('[srd5e] Could not update Rage duration for combat turn:', error);
    }
  }
}

/** Stop using turn tracking when combat ends; Rage itself may continue outside combat. */
export async function clearRageCombatTrackingOnEnd(event) {
  const worldId = event?.worldId;
  if (!window.Loom?.user?.isGM || !worldId) return;
  try {
    const actors = await window.Loom.api.get(`/actors?worldId=${encodeURIComponent(worldId)}&populate=true`);
    for (const actor of actors || []) {
      for (const rage of actor.items || []) {
        const data = rage.system || rage.data || {};
        if (rage.type !== 'feature' || data.classIdentifier !== 'barbarian' || data.identifier !== 'rage'
          || data.rageActive !== true || !data.rageTurnState) continue;
        await window.Loom.api.put(`/items/${encodeURIComponent(rage.id)}`, { data: { ...data, rageTurnState: null } });
      }
    }
  } catch (error) {
    console.error('[srd5e] Could not clear Rage turn tracking after combat ended:', error);
  }
}

/** Confirm a qualifying attack, forced save, or Bonus Action maintained Rage this turn. */
export async function extendRage(actor, item) {
  if (!actor?.id || !item?.id) return false;
  try {
    const current = await window.Loom.api.get(`/items/${encodeURIComponent(item.id)}`);
    const data = current?.system || current?.data || {};
    const result = resolveRageExtension(data.rageTurnState, window.Loom?.combat);
    if (!data.rageActive || !result.valid) {
      window.Loom?.showToast?.(localizeClassFeature('RageExtensionUnavailable'), 'warning');
      return false;
    }
    await window.Loom.api.put(`/items/${encodeURIComponent(item.id)}`, { data: { ...data, rageTurnState: result.state } });
    window.Loom?.showToast?.(localizeClassFeature('RageExtended'), 'info');
    return true;
  } catch (error) {
    console.error('[srd5e] Could not extend Rage:', error);
    window.Loom?.showToast?.(localizeClassFeature('RageExtensionUnavailable'), 'warning');
    return false;
  }
}

/**
 * Item-granted damage/condition traits (`bonuses.traits` on the item schema).
 * Only counts when the item is actually "active" on the actor: equipped
 * gear (weapon/armor with `equipped`), or permanent types whose bonus
 * applies from ownership alone (feature/race/class/subclass/background/
 * feat — same set `syncPermanentBonusEffect` listens to in effects.mjs).
 */
export function getItemTraits(items = []) {
  const out = { di: [], dr: [], dv: [], ci: [] };
  let found = false;
  for (const item of items || []) {
    const idata = item?.system ?? item?.data ?? {};
    const active =
      ((item?.type === 'weapon' || item?.type === 'armor') && !!idata.equipped) ||
      ['feature', 'race', 'class', 'subclass', 'background', 'feat'].includes(item?.type);
    if (!active) continue;
    for (const cat of ['di', 'dr', 'dv', 'ci']) {
      for (const v of idata?.bonuses?.traits?.[cat] || []) {
        out[cat].push(String(v));
        found = true;
      }
    }
  }
  return found ? out : null;
}

export async function applyHeal(actor, amount, options = {}) {
  if (!actor || amount <= 0) return null;
  const sd = actor.systemData;
  const currentHp = getHealthPool(sd, actor.type);
  if (actor.type === 'npc' && (Number(currentHp?.value) || 0) <= 0 && sd.details?.useCharacterDeathSaves !== true) {
    await normalizeNpcDeathAtZero(actor.id, actor);
    return null;
  }
  if (sd.resources?.deathState === 'dead') return null;
  const hp = getHealthPool(sd, actor.type);
  if (!hp) return null;

  const healing = cappedHealingResult(hp.value, hp.effectiveMax ?? hp.max, amount);
  const { newValue, actualHealing } = healing;
  const healUpdate = { 'system.resources.health.value': newValue, 'system.resources.knockedOut': false };
  let nextResources = { ...(sd.resources || {}), health: { ...hp, value: newValue }, knockedOut: false };
  if (newValue > 0 && (Number(hp.value) || 0) <= 0) {
    healUpdate['system.resources.deathState'] = 'alive';
    healUpdate['system.resources.deathSaves.successes'] = 0;
    healUpdate['system.resources.deathSaves.failures'] = 0;
    nextResources = { ...nextResources, deathState: 'alive', deathSaves: { successes: 0, failures: 0 } };
  }
  await actor.update(healUpdate);
  const nextSystemData = await syncUnconsciousConditionMarkers(actor.id, { ...sd, resources: nextResources }, null, null, actor.type);
  const ownedTokenIds = nextSystemData.resources?.unconsciousConditionTokenIds || [];
  if (JSON.stringify(ownedTokenIds) !== JSON.stringify(sd.resources?.unconsciousConditionTokenIds || [])) {
    try {
      await actor.update({ 'system.resources.unconsciousConditionTokenIds': ownedTokenIds });
    } catch (e) {
      console.error('[srd5e] failed to persist Unconscious marker ownership after healing:', e);
    }
  }

  const tokenId = findTokenIdForActor(actor.id);
  if (tokenId && actualHealing > 0) {
    showFloatingDamageOrHeal(tokenId, actualHealing, true);
  }

  // `flags.<system>.{name,description}` is the shape the chat card actually
  // knows how to render as HTML (`chat-message-card.ts:infoFlags`) — `content`
  // with raw HTML is always escaped for safety (the literal `<div>` tag showed
  // up as text in chat before this was found while testing the sheet).
  const label = options.label || 'Heal';
  return window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
    content: `${label}: +${actualHealing}`,
    flags: { srd5e: { name: `${actor.name} — ${label}`, isHeal: true, amount: actualHealing, description: `<span style="color:#10b981">+${actualHealing} HP</span>` } },
  });
}

/**
 * SRD "Temporary Hit Points": when you already have Temporary Hit Points and
 * receive more, you decide whether to keep the ones you have or gain the new
 * ones. Returns 'keep', 'gain', or null (cancelled, grant aborted).
 */
export async function applyHealToTargets(amount, targetIds, options = {}) {
  const targets = Array.isArray(targetIds) && targetIds.length
    ? targetIds.map((id) => ({ id: String(id) }))
    : (window.Loom?.user?.targets?.length ? window.Loom.user.targets : (options.actor ? [{ id: options.actor.id, isActor: true }] : []));
  if (!targets.length || amount <= 0) return [];
  const results = [];
  for (const t of targets) {
    const castId = typeof t === 'string' ? t : t?.id;
    if (!castId) continue;
    try {
      let isLinked = false;
      let record = null;
      let cast = null;
      if (t.isActor) {
        record = await window.Loom.api.get(`/actors/${castId}`);
      } else {
        cast = await window.Loom.api.get(`/cast/${castId}`);
        if (!cast) continue;
        isLinked = cast.isLinked === true;
        record = isLinked && cast.actorId ? await window.Loom.api.get(`/actors/${cast.actorId}`) : cast;
      }
      if (!record) continue;
      const sd = record.systemData || {};
      const hp = getHealthPool(sd, record.type || 'character');
      if (!hp) continue;
      const { newValue, actualHealing } = cappedHealingResult(hp.value, hp.effectiveMax ?? hp.max, amount);
      const healUpdate = { 'system.resources.health.value': newValue, 'system.resources.knockedOut': false };
      let nextResources = { ...(sd.resources || {}), health: { ...hp, value: newValue }, knockedOut: false };
      if (newValue > 0 && (Number(hp.value) || 0) <= 0) {
        healUpdate['system.resources.deathState'] = 'alive';
        healUpdate['system.resources.deathSaves.successes'] = 0;
        healUpdate['system.resources.deathSaves.failures'] = 0;
        nextResources = { ...nextResources, deathState: 'alive', deathSaves: { successes: 0, failures: 0 } };
      }
      const savePath = (isLinked && cast?.actorId) || t.isActor ? `/actors/${cast?.actorId || castId}` : `/cast/${castId}`;
      await window.Loom.api.put(savePath, { systemData: { ...sd, resources: nextResources } });
      await syncUnconsciousConditionMarkers(
        (isLinked && cast?.actorId) || castId,
        { ...sd, resources: nextResources },
        null,
        isLinked || t.isActor ? null : cast,
        record.type,
      );
      if (actualHealing > 0) {
        showFloatingDamageOrHeal(castId, actualHealing, true);
      }
      results.push({ castId, actualHealing, newValue });
    } catch (e) {
      console.error(`[srd5e] applyHealToTargets failed for ${castId}:`, e);
    }
  }
  return results;
}

async function askTempHpChoice(current, incoming) {
  const content = document.createElement('p');
  content.textContent = attackRuleText('TempHpChoose', 'You already have {current} Temporary Hit Points. Keep them or gain the new {incoming}?')
    .replace('{current}', String(current)).replace('{incoming}', String(incoming));
  const answer = await LoomDialog.wait({
    window: { title: attackRuleText('TempHpTitle', 'Temporary Hit Points') }, content,
    buttons: [
      { action: 'cancel', label: attackRuleText('Cancel', 'Cancel'), variant: 'ghost', callback: () => 'cancel' },
      { action: 'gain', label: attackRuleText('TempHpGainNew', 'Gain new ({m})').replace('{m}', String(incoming)), variant: 'ghost', callback: () => 'gain' },
      { action: 'keep', label: attackRuleText('TempHpKeepCurrent', 'Keep current ({n})').replace('{n}', String(current)), variant: 'primary', callback: () => 'keep' },
    ],
  });
  if (answer === 'keep') return 'keep';
  if (answer === 'gain') return 'gain';
  return null;
}

/**
 * Grants temporary hit points. With no current Temporary HP the new amount is
 * applied directly. When the actor already has Temporary HP, the player picks
 * which value to keep (see askTempHpChoice); Cancel aborts the grant.
 */
export async function applyTempHp(actor, amount) {
  if (!actor || amount <= 0) return null;
  const sd = actor.systemData;
  const hp = getHealthPool(sd, actor.type);
  if (!hp) return null;

  const current = hp.temp || 0;
  if (current > 0) {
    const choice = await askTempHpChoice(current, amount);
    if (choice === null) return null;
    if (choice === 'keep') {
      return window.Loom.ChatMessage.create({
        speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
        content: `Temporary HP kept: ${current}`,
        flags: { srd5e: { name: `${actor.name} — Temporary HP`, description: `<span>Kept ${current} temp HP — new ${amount} temp HP not gained</span>` } },
      });
    }
  }

  await actor.update({ 'system.resources.health.temp': amount });

  return window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
    content: `Temporary HP: ${amount}`,
    flags: { srd5e: { name: `${actor.name} — Temporary HP`, amount, description: `<span style="color:#10b981">${amount} Temporary HP</span>` } },
  });
}

export async function applyDamage(actor, amount, type = '', options = {}) {
  if (!actor) return null;
  const sd = actor.systemData;
  const hp = getHealthPool(sd, actor.type);
  if (!hp) return null;

  const traits = getTraits(sd, actor.type, actor.items) || {};
  const t = (type || '').toLowerCase();
  // traits.{di,dr,dv} is a flat array on the schema (schema.mjs's
  // getDefaultData, and both sheets' `_traits` context read it the same
  // way) — reading `.value` here (an assumed {value:[...]} shape that
  // nothing else ever used) always fell through to `[]`, so resistance/
  // immunity/vulnerability never applied no matter what a GM set. Found
  // while wiring up the character sheet's trait editor.
  // SRD 5.2: the damage threshold is checked on the incoming instance, before Resistance/Vulnerability.
  const thresholdResult = applyDamageThreshold(amount, sd.attributes?.damageThreshold);
  const traitResult = thresholdResult.blocked ? { amount: 0, label: '' } : applyDamageTraits(thresholdResult.amount, traits, t);
  let traitLabel = thresholdResult.blocked ? `below damage threshold (${thresholdResult.threshold})` : traitResult.label;
  const finalAmount = traitResult.amount;
  // SRD (Combat.md, "Temporary Hit Points"): "the temporary hit points are
  // lost first, and any leftover damage carries over to your normal hit
  // points" — desconta de `temp` até zerar, só o excedente vai pro `value`.
  const normalDamageResult = resolveDamageConsequences({
    health: hp,
    finalDamage: finalAmount,
    deathState: sd.resources?.deathState,
    deathSaves: sd.resources?.deathSaves,
    critical: options.critical === true,
  });
  const knockOutResult = resolveKnockOutDamage({ damageResult: normalDamageResult, hpBefore: hp.value, options, actorType: actor.type });
  const damageResult = knockOutResult || normalDamageResult;
  const monsterDeath = resolveMonsterZeroHp({
    actorType: actor.type,
    useCharacterDeathSaves: sd.details?.useCharacterDeathSaves === true,
    hpAfter: damageResult.hpAfter,
    deathState: damageResult.deathState,
  });
  const deathSaves = monsterDeath.diedNow ? { successes: 0, failures: 0 } : damageResult.deathSaves;
  const newValue = damageResult.hpAfter;
  const nextResources = {
    ...(sd.resources || {}),
    health: damageResult.health,
    deathSaves,
    deathState: monsterDeath.deathState,
    ...(knockOutResult ? { knockedOut: true } : {}),
  };
  const knockedOutUpdate = knockOutResult ? { 'system.resources.knockedOut': true } : {};
  const update = {
    'system.resources.health.value': newValue,
    'system.resources.health.temp': damageResult.health.temp,
    'system.resources.deathSaves.successes': deathSaves.successes,
    'system.resources.deathSaves.failures': deathSaves.failures,
    'system.resources.deathState': monsterDeath.deathState,
    ...knockedOutUpdate,
  };
  const concentration = resolveConcentrationAfterDamage({
    finalDamage: finalAmount,
    hpAfter: newValue,
    resources: sd.resources,
  });
  if (concentration.clear) {
    update['system.resources.concentrating'] = false;
    update['system.resources.concentratingOn'] = '';
    update['system.resources.concentrationId'] = '';
    update['system.resources.concentrationSaveAttemptId'] = '';
    update['system.resources.concentrationSaveAttemptIds'] = [];
    if (concentration.originToRemove) await removeItemEffects({ id: concentration.originToRemove });
  }
  await actor.update(update);
  const nextSystemData = await syncUnconsciousConditionMarkers(actor.id, { ...sd, resources: nextResources }, null, null, actor.type);
  const ownedTokenIds = nextSystemData.resources?.unconsciousConditionTokenIds || [];
  if (JSON.stringify(ownedTokenIds) !== JSON.stringify(sd.resources?.unconsciousConditionTokenIds || [])) {
    try {
      await actor.update({ 'system.resources.unconsciousConditionTokenIds': ownedTokenIds });
    } catch (e) {
      console.error('[srd5e] failed to persist Unconscious marker ownership after damage:', e);
    }
  }

  const tokenId = findTokenIdForActor(actor.id);
  if (tokenId && finalAmount > 0) {
    showFloatingDamageOrHeal(tokenId, finalAmount, false);
  }

  const suffix = traitLabel ? ` (${traitLabel})` : '';
  const message = await window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
    content: `Damage${suffix}: -${finalAmount}`,
    flags: { srd5e: { name: `${actor.name} — Damage${suffix}`, isDamage: true, amount: finalAmount, type, description: `<span style="color:#ef4444">-${finalAmount} HP</span>` } },
  });

  // Same automation as real dnd5e: taking damage while concentrating prompts
  // a CON save (DC = greater of 10 / half the damage) — no manual step needed.
  if (concentration.saveDamage !== null) {
    await rollConcentrationSave(actor, concentration.saveDamage);
  }

  return message;
}

/** Roll the Concentration save on the Loom server; a failed result is resolved from its posted chat card. */
export async function rollConcentrationSave(actor, damage) {
  if (!actor?.id) return null;
  const dc = concentrationSaveDc(damage);
  const resources = actor.systemData?.resources || {};
  const originId = String(resources.concentratingOn || '');
  let concentrationId = String(resources.concentrationId || '');
  const save = actor.systemData?.saves?.con;
  if (dc === null || resources.concentrating !== true || !originId || !save) return null;
  if (!concentrationId) {
    concentrationId = createCombatEffectOperationId('concentration');
  }
  const attemptId = createCombatEffectOperationId('concentration-save');
  const priorAttemptIds = pendingConcentrationSaveAttempts(resources);
  const attemptPatch = addConcentrationSaveAttempt(resources, attemptId);
  const exhaustion = Math.max(0, Math.min(6, Number(actor.systemData?.resources?.exhaustion) || 0));
  const conditions = await getActorConditions(actor.id);
  const saveState = getSaveConditionOutcome('con', conditions, exhaustion, false, { items: actor.items || [] });
  const advantage = combineAdvantageSources(currentAdvantageMode(), saveState.advantage, saveState.disadvantage);
  try {
    await actor.update({
      'system.resources.concentrationId': concentrationId,
      'system.resources.concentrationSaveAttemptId': attemptId,
      'system.resources.concentrationSaveAttemptIds': attemptPatch.concentrationSaveAttemptIds,
    });
    actor.systemData.resources = {
      ...resources, concentrationId, ...attemptPatch,
    };
  } catch (error) {
    console.error('[srd5e] Could not register pending Concentration save:', error);
    return null;
  }
  const saveRoll = await sdr5eRoll({
    label: `${window.Loom?.i18n?.localize?.('SDR5E.ConcentrationSave.Title') || 'Concentration save'} (DC ${dc})`,
    parts: [{ label: window.Loom?.i18n?.localize?.('SDR5E.ConcentrationSave.Constitution') || 'Constitution', value: Number(save.total) || 0 }],
    actor, advantage, dc, forcePublic: true,
    extraMeta: {
      srd5eAbilityKey: 'con', srd5eConcentrationSave: true,
      srd5eConcentrationRecordType: actor.concentrationRecordType === 'cast' ? 'cast' : 'actor',
      srd5eConcentrationOriginId: originId, srd5eConcentrationId: concentrationId,
      srd5eConcentrationSaveAttemptId: attemptId,
      srd5eConcentrationDamage: Number(damage),
    },
  });
  if (saveRoll === null) {
    const path = actor.concentrationRecordType === 'cast' ? `/cast/${encodeURIComponent(actor.id)}` : `/actors/${encodeURIComponent(actor.id)}`;
    try {
      const latest = await window.Loom.api.get(path);
      const latestResources = latest?.systemData?.resources || {};
      if (String(latestResources.concentrationId || '') === concentrationId
        && String(latestResources.concentrationSaveAttemptId || '') === attemptId) {
        const remaining = pendingConcentrationSaveAttempts(latestResources).filter((id) => id !== attemptId);
        await window.Loom.api.put(path, { systemData: { resources: {
          concentrationSaveAttemptId: remaining.at(-1) || '', concentrationSaveAttemptIds: remaining,
        } } });
      }
    } catch (error) {
      console.error('[srd5e] Could not clear canceled Concentration save:', error);
    }
    return null;
  }
  return saveRoll === null ? null : { pending: true, dc, originId, concentrationId };
}

/** Clear the exact concentration only after a GM resolves the posted server roll. */
export async function resolveConcentrationSaveMessage(messageId) {
  if (!window.Loom?.user?.isGM) return { resolved: false, reason: 'gm-required' };
  const message = window.Loom?.messages?.get?.(String(messageId || ''));
  const result = resolveConcentrationSaveRoll(message?.roll || message?.getFlag?.('srd5e', 'concentrationSaveRoll'));
  if (!result || result.success) return { resolved: false, reason: 'not-failed-save' };
  const path = result.recordType === 'cast'
    ? `/cast/${encodeURIComponent(result.actorId)}`
    : `/actors/${encodeURIComponent(result.actorId)}?populate=true`;
  const actor = await window.Loom.api.get(path);
  const resources = actor?.systemData?.resources || {};
  if (resources.concentrating !== true
    || String(resources.concentratingOn || '') !== result.originId
    || String(resources.concentrationId || '') !== result.concentrationId
    || !pendingConcentrationSaveAttempts(resources).includes(result.attemptId)) {
    return { resolved: false, reason: 'concentration-changed' };
  }
  await removeItemEffects({ id: result.originId });
  const latest = await window.Loom.api.get(result.recordType === 'cast'
    ? `/cast/${encodeURIComponent(result.actorId)}`
    : `/actors/${encodeURIComponent(result.actorId)}`);
  const latestResources = latest?.systemData?.resources || {};
  if (latestResources.concentrating !== true
    || String(latestResources.concentratingOn || '') !== result.originId
    || String(latestResources.concentrationId || '') !== result.concentrationId
    || !pendingConcentrationSaveAttempts(latestResources).includes(result.attemptId)) {
    return { resolved: false, reason: 'concentration-changed' };
  }
  await window.Loom.api.put(result.recordType === 'cast' ? path : `/actors/${encodeURIComponent(result.actorId)}`, {
    systemData: { resources: { concentrating: false, concentratingOn: '', concentrationId: '', concentrationSaveAttemptId: '', concentrationSaveAttemptIds: [] } },
  });
  return { resolved: true, actorId: result.actorId, originId: result.originId, dc: result.dc, total: result.total };
}

/**
 * Death saving throw (SRD: 1d20 vs DC 10, no bonuses). `dispatchRoll` is
 * fire-and-forget over the websocket — the die is rolled server-side and the
 * client never gets the total back, so it can't drive `deathSaves` counters
 * off it. Rolling locally and dispatching the result as a literal-number
 * formula (a dice engine evaluates a bare integer to itself, no randomness
 * involved) keeps the chat display and the mechanical outcome the same
 * number, without needing a round-trip to the server.
 */
const DEATH_SAVE_DC = 10;

export async function rollDeathSave(actor) {
  if (!actor) return null;
  const sd = actor.systemData;
  if (actor.type === 'npc' && sd.details?.useCharacterDeathSaves !== true) {
    if ((Number(sd.resources?.health?.value) || 0) <= 0) await normalizeNpcDeathAtZero(actor.id, actor);
    return null;
  }
  if (sd.resources?.deathState === 'dead' || sd.resources?.deathState === 'stable') return null;
  const ds = sd.resources?.deathSaves || { successes: 0, failures: 0 };
  const roll = 1 + Math.floor(Math.random() * 20);
  // SRD 5.2 (Death Saving Throws): a 10 or higher succeeds. Exhaustion reduces
  // D20 Tests (ability checks, attacks, saves), and a Death Saving Throw is not one of them.
  const total = roll;

  let successes = ds.successes || 0;
  let failures = ds.failures || 0;
  let outcome = '';

  if (roll === 20) {
    // Critical success: back to 1 HP, conscious, saves reset.
    successes = 0; failures = 0;
    await actor.update({
      'system.resources.health.value': 1,
      'system.resources.deathSaves.successes': 0,
      'system.resources.deathSaves.failures': 0,
      'system.resources.deathState': 'alive',
    });
    outcome = 'Critical Success — regains 1 HP';
  } else {
    if (roll === 1) failures += 2;
    else if (total >= DEATH_SAVE_DC) successes += 1;
    else failures += 1;
    successes = Math.min(3, successes);
    failures = Math.min(3, failures);
    await actor.update({
      'system.resources.deathSaves.successes': successes,
      'system.resources.deathSaves.failures': failures,
      ...(failures >= 3 ? { 'system.resources.deathState': 'dead' } : successes >= 3 ? { 'system.resources.deathState': 'stable' } : {}),
    });
    if (failures >= 3) outcome = 'Dead';
    else if (successes >= 3) outcome = 'Stabilized';
    else outcome = roll === 1 ? 'Critical Failure (2 failures)' : total >= DEATH_SAVE_DC ? 'Success' : 'Failure';
  }

  const deathState = roll === 20 ? 'alive' : failures >= 3 ? 'dead' : successes >= 3 ? 'stable' : (sd.resources?.deathState || 'alive');
  const nextResources = {
    ...(sd.resources || {}),
    health: { ...(sd.resources?.health || {}), value: roll === 20 ? 1 : Number(sd.resources?.health?.value) || 0 },
    deathSaves: { successes, failures },
    deathState,
  };
  const nextSystemData = await syncUnconsciousConditionMarkers(actor.id, { ...sd, resources: nextResources }, null, null, actor.type);
  const ownedTokenIds = nextSystemData.resources?.unconsciousConditionTokenIds || [];
  if (JSON.stringify(ownedTokenIds) !== JSON.stringify(sd.resources?.unconsciousConditionTokenIds || [])) {
    try {
      await actor.update({ 'system.resources.unconsciousConditionTokenIds': ownedTokenIds });
    } catch (e) {
      console.error('[srd5e] failed to persist Unconscious marker ownership after death save:', e);
    }
  }

  window.Loom.dispatchRoll({
    formula: String(total),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Death Saving Throw — ${outcome}`, naturalRoll: roll },
  });
  return { roll, total, successes, failures, outcome };
}

/**
 * Which ability drives a weapon's attack/damage roll — melee uses STR, ranged
 * uses DEX, finesse weapons use whichever modifier is higher (SRD rule).
 */
function weaponAbilityKey(sd, idata) {
  const abilities = sd.abilities || {};
  const isRanged = idata.rangeType === 'ranged';
  const isFinesse = (idata.properties || []).some((p) => String(p).toLowerCase().includes('finesse'));
  if (isFinesse) {
    return (abilities.dex?.modifier ?? 0) > (abilities.str?.modifier ?? 0) ? 'dex' : 'str';
  }
  return isRanged ? 'dex' : 'str';
}

/**
 * `proficiencies.weapons` holds two kinds of entries: an exact SRD category
 * code (see WEAPON_CATEGORY_CODES in config.mjs — 'simpleM'/'simpleR'/
 * 'martialM'/'martialR', matched against the weapon item's own `weaponType`
 * field) for "proficient with all simple/martial weapons", and plain weapon
 * names (e.g. "Longsword") for named exceptions on top of that. Category
 * match is exact, not substring — a prior heuristic here treated any
 * substring overlap as a match, which silently proficiency-matched unrelated
 * weapons that happened to share a few letters.
 */
function isWeaponProficient(sd, item, idata) {
  const profs = sd.proficiencies?.weapons || [];
  if (!profs.length) return false;
    return profs.some((entry) => weaponProficiencyMatches(entry, idata, item.name));
}

const combatEffectWriteQueues = new Map();

async function withCombatEffectCastQueue(castId, operation) {
  const id = String(castId || '');
  if (!id || typeof operation !== 'function') return null;
  const previous = combatEffectWriteQueues.get(id) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  combatEffectWriteQueues.set(id, current);
  try {
    return await current;
  } finally {
    if (combatEffectWriteQueues.get(id) === current) combatEffectWriteQueues.delete(id);
  }
}

async function combatEffectContextForCurrentActor(actorId) {
  const combat = window.Loom?.combat;
  const combatants = Array.isArray(combat?.combatants) ? combat.combatants : [];
  if (!actorId || !combat?.id || !combatants.length) return null;
  const ids = [...new Set(combatants.map((entry) => String(entry?.id || '')).filter(Boolean))];
  const casts = [];
  const activeIndex = Number(combat.currentTurn);
  const activeId = Number.isInteger(activeIndex) && activeIndex >= 0 ? String(combatants[activeIndex]?.id || '') : '';
  const isActorCast = (cast) => cast && (String(cast.actorId || '') === String(actorId)
    || (!cast.actorId && String(cast.id) === String(actorId)));
  if (activeId) {
    try {
      const active = await window.Loom.api.get(`/cast/${encodeURIComponent(activeId)}`);
      if (active) casts.push(active);
      if (!isActorCast(active)) {
        for (const id of ids) {
          if (id === activeId) continue;
          try {
            const cast = await window.Loom.api.get(`/cast/${encodeURIComponent(id)}`);
            if (cast) casts.push(cast);
          } catch (error) {
            console.error(`[srd5e] Could not resolve combat Cast ${id} for temporary effects:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[srd5e] Could not resolve active combat Cast for temporary effects:', error);
      return null;
    }
  } else {
    return null;
  }
  const context = combatEffectContextForActor(combat, casts, actorId);
  if (!context) return null;
  const cast = casts.find((entry) => String(entry.id) === context.sourceCastId);
  return cast ? { combat, cast, context } : null;
}

async function combatAttackEffectState(actorId, targetCastId = '') {
  const source = await combatEffectContextForCurrentActor(actorId);
  if (!source) return { source: null, effects: [] };
  const effects = combatEffectsForAttack(source.cast.systemData?.srd5eCombatEffects, {
    combatId: source.context.combatId,
    sourceCastId: source.context.sourceCastId,
    targetCastId,
  });
  return { source, effects };
}

function combatEffectConsumptionMeta(source, effects) {
  const oneShot = (effects || []).filter((effect) => ['sap', 'vex'].includes(effect.type));
  if (!source || !oneShot.length) return {};
  return { srd5eCombatEffectConsumption: {
    combatId: source.context.combatId,
    castId: source.context.sourceCastId,
    effectIds: oneShot.map((effect) => effect.id),
  } };
}

/** Apply Vex only after the exact target received weapon damage and the GM confirms. */
export async function applyWeaponVex(actor, item, request) {
  if (!window.Loom?.user?.isGM) return { applied: false, reason: 'gm-required' };
  const context = request?.context;
  const targetCastId = String(request?.targetCastId || '');
  const operationId = String(request?.operationId || '');
  if (!actor?.id || !item?.id || String(request?.actorId || '') !== String(actor.id)
    || String(request?.itemId || '') !== String(item.id) || !targetCastId || !operationId || !context?.combatId
    || !context?.sourceCastId || !Number.isInteger(Number(context?.appliedTurn?.round))
    || Number(context.appliedTurn.round) < 1 || !context?.appliedTurn?.castId) {
    return { applied: false, reason: 'invalid-request' };
  }
  const diceTerms = Array.isArray(request.attack?.terms) ? request.attack.terms.filter((term) => term?.kind === 'dice') : [];
  const d20 = diceTerms[0];
  const rolls = Array.isArray(d20?.rolls) ? d20.rolls : [];
  const dropped = Array.isArray(d20?.dropped) ? d20.dropped : [];
  if (typeof request.attack?.total !== 'number' || !Number.isFinite(request.attack.total)
    || typeof request.attack?.targetAC !== 'number' || !Number.isFinite(request.attack.targetAC)
    || diceTerms.length !== 1 || Number(d20.faces) !== 20 || !rolls.length
    || rolls.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 20)
    || (dropped.length > 0 && dropped.length !== rolls.length)
    || (dropped.length > 0 && dropped.every(Boolean))) return { applied: false, reason: 'invalid-request' };
  const outcome = resolveAttackAgainstTarget({ meta: { isAttack: true }, total: request.attack.total, terms: request.attack.terms }, request.attack.targetAC);
  if (!outcome.resolved || !outcome.hit) return { applied: false, reason: 'not-a-hit' };

  const freshActor = await window.Loom.api.get(`/actors/${encodeURIComponent(actor.id)}?populate=true`);
  const freshItem = await window.Loom.api.get(`/items/${encodeURIComponent(item.id)}`);
  const ownsWeapon = (freshActor?.items || []).some((entry) => String(entry.id) === String(freshItem?.id));
  const mastery = ownsWeapon
    ? weaponMasteryForAttack(freshActor.items || [], freshItem, freshActor.systemData?.proficiencies?.weapons || []) : null;
  if (mastery?.property !== 'vex') return { applied: false, reason: 'mastery-changed' };

  const current = await combatEffectContextForCurrentActor(freshActor.id);
  if (!current || current.context.combatId !== String(context.combatId)
    || current.context.sourceCastId !== String(context.sourceCastId)
    || !sameCombatTurn(current.combat, context.combatId, context.appliedTurn)) return { applied: false, reason: 'turn-changed' };
  const combatants = new Set((current.combat.combatants || []).map((entry) => String(entry?.id || '')));
  if (!combatants.has(targetCastId) || !combatants.has(String(context.sourceCastId))) return { applied: false, reason: 'combatant-missing' };
  const sourceCastId = String(context.sourceCastId);
  const sourceCast = await window.Loom.api.get(`/cast/${encodeURIComponent(sourceCastId)}`);
  const sourceMatchesActor = sourceCast && (String(sourceCast.actorId || '') === String(freshActor.id)
    || (!sourceCast.actorId && String(sourceCast.id) === String(freshActor.id)));
  if (!sourceMatchesActor) return { applied: false, reason: 'cast-changed' };
  const record = createCombatEffectRecord({
    id: operationId, type: 'vex', sourceCastId, targetCastId,
    combatId: context.combatId, appliedTurn: context.appliedTurn,
  });
  if (!record) return { applied: false, reason: 'invalid-effect' };
  return withCombatEffectCastQueue(sourceCastId, async () => {
    const latest = await window.Loom.api.get(`/cast/${encodeURIComponent(sourceCastId)}`);
    if (!latest?.id) return { applied: false, reason: 'source-missing' };
    const update = appendCombatEffectRecord(latest.systemData?.srd5eCombatEffects, record);
    if (!update.valid) return { applied: false, reason: update.reason };
    if (!update.added) return { applied: true, duplicate: true };
    await writeCombatEffectRecords(sourceCastId, update.records);
    return { applied: true, duplicate: false };
  });
}

/** Apply optional Slow after positive damage and an explicit GM action. */
export async function applyWeaponSlow(actor, item, request) {
  if (!window.Loom?.user?.isGM) return { applied: false, reason: 'gm-required' };
  const context = request?.context;
  const targetCastId = String(request?.targetCastId || '');
  const operationId = String(request?.operationId || '');
  const appliedDamage = Number(request?.appliedDamage);
  if (!actor?.id || !item?.id || String(request?.actorId || '') !== String(actor.id)
    || String(request?.itemId || '') !== String(item.id) || !targetCastId || !operationId || !context?.combatId
    || !context?.sourceCastId || !Number.isInteger(Number(context?.appliedTurn?.round))
    || Number(context.appliedTurn.round) < 1 || !context?.appliedTurn?.castId
    || !Number.isFinite(appliedDamage) || appliedDamage <= 0) return { applied: false, reason: 'invalid-request' };
  const diceTerms = Array.isArray(request.attack?.terms) ? request.attack.terms.filter((term) => term?.kind === 'dice') : [];
  const d20 = diceTerms[0];
  const rolls = Array.isArray(d20?.rolls) ? d20.rolls : [];
  const dropped = Array.isArray(d20?.dropped) ? d20.dropped : [];
  if (typeof request.attack?.total !== 'number' || !Number.isFinite(request.attack.total)
    || typeof request.attack?.targetAC !== 'number' || !Number.isFinite(request.attack.targetAC)
    || diceTerms.length !== 1 || Number(d20.faces) !== 20 || !rolls.length
    || rolls.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 20)
    || (dropped.length > 0 && dropped.length !== rolls.length)
    || (dropped.length > 0 && dropped.every(Boolean))) return { applied: false, reason: 'invalid-request' };
  const outcome = resolveAttackAgainstTarget({ meta: { isAttack: true }, total: request.attack.total, terms: request.attack.terms }, request.attack.targetAC);
  if (!outcome.resolved || !outcome.hit) return { applied: false, reason: 'not-a-hit' };

  const freshActor = await window.Loom.api.get(`/actors/${encodeURIComponent(actor.id)}?populate=true`);
  const freshItem = await window.Loom.api.get(`/items/${encodeURIComponent(item.id)}`);
  if (!(freshActor?.items || []).some((entry) => String(entry.id) === String(freshItem?.id))) return { applied: false, reason: 'weapon-not-owned' };
  const mastery = weaponMasteryForAttack(freshActor.items || [], freshItem, freshActor.systemData?.proficiencies?.weapons || []);
  if (mastery?.property !== 'slow') return { applied: false, reason: 'mastery-changed' };
  const current = await combatEffectContextForCurrentActor(freshActor.id);
  if (!current || current.context.combatId !== String(context.combatId)
    || current.context.sourceCastId !== String(context.sourceCastId)
    || !sameCombatTurn(current.combat, context.combatId, context.appliedTurn)) return { applied: false, reason: 'turn-changed' };
  const combatants = new Set((current.combat.combatants || []).map((entry) => String(entry?.id || '')));
  if (!combatants.has(targetCastId) || !combatants.has(String(context.sourceCastId))) return { applied: false, reason: 'combatant-missing' };
  const [sourceCast, targetCast] = await Promise.all([
    window.Loom.api.get(`/cast/${encodeURIComponent(context.sourceCastId)}`),
    window.Loom.api.get(`/cast/${encodeURIComponent(targetCastId)}`),
  ]);
  const sourceMatchesActor = sourceCast && (String(sourceCast.actorId || '') === String(freshActor.id)
    || (!sourceCast.actorId && String(sourceCast.id) === String(freshActor.id)));
  if (!sourceMatchesActor || !targetCast?.id) return { applied: false, reason: 'cast-changed' };
  const record = createCombatEffectRecord({ id: operationId, type: 'slow', sourceCastId: context.sourceCastId,
    targetCastId, combatId: context.combatId, appliedTurn: context.appliedTurn });
  if (!record) return { applied: false, reason: 'invalid-effect' };
  return withCombatEffectCastQueue(targetCastId, async () => {
    const latest = await window.Loom.api.get(`/cast/${encodeURIComponent(targetCastId)}`);
    if (!latest?.id) return { applied: false, reason: 'target-missing' };
    const update = appendCombatEffectRecord(latest.systemData?.srd5eCombatEffects, record);
    if (!update.valid) return { applied: false, reason: update.reason };
    if (!update.added) return { applied: true, duplicate: true };
    await writeCombatEffectRecords(targetCastId, update.records);
    return { applied: true, duplicate: false };
  });
}

function createCombatEffectOperationId(prefix = 'srd5e-effect') {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${randomId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function sameCombatTurn(leftCombat, combatId, turn) {
  const combat = leftCombat;
  const index = Number(combat?.currentTurn);
  const currentCastId = Number.isInteger(index) && index >= 0 ? String(combat?.combatants?.[index]?.id || '') : '';
  return String(combat?.id || '') === String(combatId || '')
    && Number(combat?.round) === Number(turn?.round)
    && currentCastId === String(turn?.castId || '');
}

async function writeCombatEffectRecords(castId, records) {
  await window.Loom.api.put(`/cast/${encodeURIComponent(castId)}`, {
    systemData: { srd5eCombatEffects: records },
  });
}

/** Consume only the exact one-shot effect IDs after a completed attack roll. */
export async function consumeCombatEffectsAfterRoll(roll) {
  const request = roll?.meta?.srd5eCombatEffectConsumption;
  if (!window.Loom?.user?.isGM || !request?.combatId || !request?.castId || !Array.isArray(request.effectIds)) return false;
  return withCombatEffectCastQueue(request.castId, async () => {
    try {
      const cast = await window.Loom.api.get(`/cast/${encodeURIComponent(request.castId)}`);
      if (!cast?.id) return false;
      const before = normalizeCombatEffectRecords(cast.systemData?.srd5eCombatEffects);
      const eligibleIds = before.filter((effect) => effect.combatId === String(request.combatId)
        && request.effectIds.map(String).includes(effect.id)).map((effect) => effect.id);
      if (!eligibleIds.length) return false;
      const next = consumeCombatEffectRecords(before, eligibleIds);
      if (JSON.stringify(before) === JSON.stringify(next)) return false;
      await writeCombatEffectRecords(request.castId, next);
      return true;
    } catch (error) {
      console.error('[srd5e] Could not consume temporary combat effects after the attack roll:', error);
      window.Loom?.showToast?.(weaponMasteryText('CombatEffectTrackingFailed'), 'warning');
      return false;
    }
  });
}

/** Apply a finalized, single-target Sap hit after the GM confirms the card result. */
export async function applyWeaponSap(actor, item, request) {
  if (!window.Loom?.user?.isGM) return { applied: false, reason: 'gm-required' };
  const context = request?.context;
  const targetCastId = String(request?.targetCastId || '');
  const operationId = String(request?.operationId || '');
  if (!actor?.id || !item?.id || String(request?.actorId || '') !== String(actor.id)
    || String(request?.itemId || '') !== String(item.id) || !targetCastId || !operationId || !context?.combatId
    || !context?.sourceCastId || !Number.isInteger(Number(context?.appliedTurn?.round))
    || Number(context.appliedTurn.round) < 1 || !context?.appliedTurn?.castId) {
    return { applied: false, reason: 'invalid-request' };
  }
  const diceTerms = Array.isArray(request.attack?.terms) ? request.attack.terms.filter((term) => term?.kind === 'dice') : [];
  const d20 = diceTerms[0];
  const rolls = Array.isArray(d20?.rolls) ? d20.rolls : [];
  const dropped = Array.isArray(d20?.dropped) ? d20.dropped : [];
  if (typeof request.attack?.total !== 'number' || !Number.isFinite(request.attack.total)
    || typeof request.attack?.targetAC !== 'number' || !Number.isFinite(request.attack.targetAC)
    || diceTerms.length !== 1 || Number(d20.faces) !== 20 || !rolls.length
    || rolls.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 20)
    || (dropped.length > 0 && dropped.length !== rolls.length)
    || (dropped.length > 0 && dropped.every(Boolean))) return { applied: false, reason: 'invalid-request' };
  const roll = { meta: { isAttack: true }, total: Number(request.attack?.total), terms: request.attack?.terms };
  const attackOutcome = resolveAttackAgainstTarget(roll, request.attack?.targetAC);
  if (!attackOutcome.resolved || !attackOutcome.hit) return { applied: false, reason: 'not-a-hit' };

  const freshActor = await window.Loom.api.get(`/actors/${encodeURIComponent(actor.id)}?populate=true`);
  const freshItem = await window.Loom.api.get(`/items/${encodeURIComponent(item.id)}`);
  const ownsWeapon = (freshActor?.items || []).some((entry) => String(entry.id) === String(freshItem?.id));
  const mastery = ownsWeapon
    ? weaponMasteryForAttack(freshActor.items || [], freshItem, freshActor.systemData?.proficiencies?.weapons || []) : null;
  if (mastery?.property !== 'sap') return { applied: false, reason: 'mastery-changed' };

  const current = await combatEffectContextForCurrentActor(freshActor.id);
  if (!current || current.context.combatId !== String(context.combatId)
    || current.context.sourceCastId !== String(context.sourceCastId)
    || !sameCombatTurn(current.combat, context.combatId, context.appliedTurn)) {
    return { applied: false, reason: 'turn-changed' };
  }
  const combatantIds = new Set((current.combat.combatants || []).map((combatant) => String(combatant?.id || '')));
  if (!combatantIds.has(targetCastId) || !combatantIds.has(String(context.sourceCastId))) {
    return { applied: false, reason: 'combatant-missing' };
  }
  const [sourceCast, targetCast] = await Promise.all([
    window.Loom.api.get(`/cast/${encodeURIComponent(context.sourceCastId)}`),
    window.Loom.api.get(`/cast/${encodeURIComponent(targetCastId)}`),
  ]);
  const sourceMatchesActor = sourceCast && (String(sourceCast.actorId || '') === String(freshActor.id)
    || (!sourceCast.actorId && String(sourceCast.id) === String(freshActor.id)));
  if (!sourceMatchesActor || !targetCast?.id) return { applied: false, reason: 'cast-changed' };
  const record = createCombatEffectRecord({
    id: operationId, type: 'sap', sourceCastId: context.sourceCastId, targetCastId,
    combatId: context.combatId, appliedTurn: context.appliedTurn,
  });
  if (!record) return { applied: false, reason: 'invalid-effect' };

  return withCombatEffectCastQueue(targetCastId, async () => {
    const latest = await window.Loom.api.get(`/cast/${encodeURIComponent(targetCastId)}`);
    if (!latest?.id) return { applied: false, reason: 'target-missing' };
    const update = appendCombatEffectRecord(latest.systemData?.srd5eCombatEffects, record);
    if (!update.valid) return { applied: false, reason: update.reason };
    if (!update.added) return { applied: true, duplicate: true };
    await writeCombatEffectRecords(targetCastId, update.records);
    return { applied: true, duplicate: false };
  });
}

/** Expire effects on the GM client from the native combatTurn event. */
export async function processCombatEffectsTurn(combat) {
  if (!window.Loom?.user?.isGM || !combat?.id || !Array.isArray(combat.combatants) || !combat.combatants.length) return false;
  const index = Number(combat.currentTurn);
  const currentCastId = Number.isInteger(index) && index >= 0 ? String(combat.combatants[index]?.id || '') : '';
  if (!currentCastId || !Number.isInteger(Number(combat.round)) || Number(combat.round) < 1) return false;
  let changed = false;
  for (const castId of [...new Set(combat.combatants.map((entry) => String(entry?.id || '')).filter(Boolean))]) {
    const didUpdate = await withCombatEffectCastQueue(castId, async () => {
      try {
        const cast = await window.Loom.api.get(`/cast/${encodeURIComponent(castId)}`);
        if (!cast?.id) return false;
        const storedRecords = normalizeCombatEffectRecords(cast.systemData?.srd5eCombatEffects);
        const currentRecords = combatEffectRecordsForActiveCombat(storedRecords, combat.id);
        const transition = advanceCombatEffectRecords(currentRecords, {
          combatId: combat.id, round: Number(combat.round), currentCastId,
        });
        if (!transition.valid || JSON.stringify(storedRecords) === JSON.stringify(transition.records)) return false;
        await writeCombatEffectRecords(castId, transition.records);
        return true;
      } catch (error) {
        console.error(`[srd5e] Could not advance temporary combat effects for Cast ${castId}:`, error);
        window.Loom?.showToast?.(weaponMasteryText('CombatEffectTrackingFailed'), 'warning');
        return false;
      }
    });
    changed = changed || didUpdate === true;
  }
  return changed;
}

/** Remove all combat-duration records from Casts when native combat ends. */
export async function clearCombatEffectsOnEnd(event) {
  const worldId = event?.worldId;
  if (!window.Loom?.user?.isGM || !worldId) return false;
  try {
    const casts = await window.Loom.api.get(`/cast?worldId=${encodeURIComponent(worldId)}`);
    for (const cast of casts || []) {
      if (!cast?.id || !Array.isArray(cast.systemData?.srd5eCombatEffects) || !cast.systemData.srd5eCombatEffects.length) continue;
      await withCombatEffectCastQueue(cast.id, async () => {
        const latest = await window.Loom.api.get(`/cast/${encodeURIComponent(cast.id)}`);
        if (!latest?.systemData?.srd5eCombatEffects?.length) return false;
        await writeCombatEffectRecords(cast.id, clearAllCombatEffectRecords());
        return true;
      });
    }
    return true;
  } catch (error) {
    console.error('[srd5e] Could not clear temporary combat effects after combat ended:', error);
    window.Loom?.showToast?.(weaponMasteryText('CombatEffectTrackingFailed'), 'warning');
    return false;
  }
}

export async function rollWeaponAttack(actor, item, options = {}) {
  if (!actor || !item) return null;
  if (!canRollAtMostOneAttackTarget()) return null;
  const sd = actor.systemData;
  const idata = item.system || item.data || {};
  const abilityKey = weaponAbilityKey(sd, idata);
  const abilityMod = sd.abilities?.[abilityKey]?.modifier ?? 0;
  const prof = sd.attributes?.prof?.value ?? 0;
  const proficient = isWeaponProficient(sd, item, idata);
  const isRanged = idata.rangeType === 'ranged';
  const attackTypeBonus = Number((isRanged ? sd.attributes?.rangedBonus : sd.attributes?.meleeBonus)) || 0;
  const parts = [
    { label: abilityKey.toUpperCase(), value: abilityMod },
    { label: 'Proficiency', value: proficient ? prof : 0 },
    { label: 'Item', value: Number(idata.attackBonus) || 0 },
    { label: isRanged ? 'Ranged' : 'Melee', value: attackTypeBonus },
  ];
  const conditions = await getActorConditions(actor.id);
  const armorPenalty = (abilityKey === 'str' || abilityKey === 'dex') && !!sd.attributes?.armor?.penalty;
  const targets = await getTargetAcInfo();
  if (targets === null) return null;
  if (await charmerBlocksAttack(actor, conditions, targets)) return null;
  if (options.targetCastId && (targets.length !== 1 || String(targets[0]?.castId) !== String(options.targetCastId))) {
    window.Loom?.showToast?.(weaponMasteryText('SelectCleaveTarget'), 'warning');
    return null;
  }
  if (options.cleaveAttack?.turn && !sameSpellSlotTurn(activeSpellSlotTurn(window.Loom?.combat), options.cleaveAttack.turn)) {
    window.Loom?.showToast?.(weaponMasteryText('CleaveExpired'), 'warning');
    return null;
  }
  const effectState = await combatAttackEffectState(actor.id, targets[0]?.castId || '');
  const sapCount = effectState.effects.filter((effect) => effect.type === 'sap').length;
  const vexCount = effectState.effects.filter((effect) => effect.type === 'vex').length;
  const situation = await resolveAttackSituation(actor, conditions, targets);
  if (situation === null) return null;
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, isRanged,
    sd.resources?.exhaustion ?? 0, armorPenalty, sapCount, vexCount, situation);
  const mastery = weaponMasteryForAttack(actor.items || [], item, sd.proficiencies?.weapons || []);
  const nickTurn = activeSpellSlotTurn(window.Loom?.combat);
  const weaponDefinition = weaponMasteryDefinitionForItem(item);
  const nickCandidates = options.attackAction === true && !options.nickAttack && idata.equipped === true
    && weaponDefinition?.properties.includes('light') && nickTurn?.combatId && nickTurn?.castId
    ? (actor.items || []).filter((entry) => {
      const data = entry.system || entry.data || {};
      return entry.type === 'weapon' && String(entry.id) !== String(item.id)
        && data.equipped === true && data.primarySlot === 'offHand'
        && weaponMasteryDefinitionForItem(entry)?.properties.includes('light')
        && weaponMasteryForAttack(actor.items || [], entry, sd.proficiencies?.weapons || [])?.property === 'nick';
    }).map((entry) => ({ id: String(entry.id), name: String(entry.name || '') })).filter((entry) => entry.name)
    : [];
  if (options.cleaveAttack && mastery?.property !== 'cleave') {
    window.Loom?.showToast?.(weaponMasteryText('Unavailable'), 'warning');
    return null;
  }
  if (options.nickAttack?.turn && !sameSpellSlotTurn(activeSpellSlotTurn(window.Loom?.combat), options.nickAttack.turn)) {
    window.Loom?.showToast?.(weaponMasteryText('NickExpired'), 'warning');
    return null;
  }
  const masteryDc = mastery?.property === 'topple' ? weaponMasterySaveDC(abilityMod, prof) : null;
  return sdr5eRoll({ label: `Attack: ${item.name}`, parts, actor, advantage, extraMeta: {
    isAttack: true, isRanged, srd5eAttackAction: options.attackAction === true, srd5eAttackAbility: abilityKey,
    srd5eWeaponProperties: weaponDefinition?.properties || [],
    ...combatEffectConsumptionMeta(effectState.source, effectState.effects),
    ...(mastery?.property === 'sap' && effectState.source ? {
      srd5eSapContext: effectState.source.context,
      srd5eSapOperationId: createCombatEffectOperationId(),
    } : {}),
    ...(mastery?.property === 'vex' && effectState.source ? {
      srd5eVexContext: effectState.source.context,
      srd5eVexOperationId: createCombatEffectOperationId('vex'),
    } : {}),
    ...(mastery?.property === 'slow' && effectState.source ? {
      srd5eSlowContext: effectState.source.context,
      srd5eSlowOperationId: createCombatEffectOperationId('slow'),
    } : {}),
    ...(mastery ? { srd5eWeaponMastery: {
      ...mastery, abilityKey, abilityModifier: Number(abilityMod),
      proficiencyBonus: Number(prof),
      damageType: String(idata.damage?.type || idata.damageType || '').toLowerCase(),
      ...(masteryDc !== null ? { saveDC: masteryDc } : {}),
    } } : {}),
    ...(mastery?.property === 'cleave' ? { srd5eCleaveTurn: activeSpellSlotTurn(window.Loom?.combat) } : {}),
    ...(nickCandidates.length ? { srd5eNickAction: { turn: nickTurn, sourceItemId: String(item.id), candidates: nickCandidates } } : {}),
    ...(options.nickAttack ? { srd5eNickAttack: {
      sourceMessageId: String(options.nickAttack.sourceMessageId || ''),
      turn: options.nickAttack.turn,
    } } : {}),
    ...(options.cleaveAttack ? { srd5eCleaveAttack: {
      sourceMessageId: String(options.cleaveAttack.sourceMessageId || ''),
      turn: options.cleaveAttack.turn,
      originalTargetId: String(options.cleaveAttack.originalTargetId || ''),
      damageType: String(idata.damage?.type || idata.damageType || '').toLowerCase(),
    } } : {}),
    ...(targets.length ? { targets } : {}), actorId: actor.id, itemId: item.id,
  } });
}

function weaponMasteryActionFromMessage(messageId, property, expectedHit) {
  const message = window.Loom?.messages?.get?.(String(messageId || ''));
  const roll = message?.roll || message?.getFlag?.('srd5e', 'weaponMasteryAttackRoll');
  return resolveWeaponMasteryAttack(roll, property, expectedHit);
}

async function freshWeaponMasteryAction(messageId, property, expectedHit) {
  const action = weaponMasteryActionFromMessage(messageId, property, expectedHit);
  if (!action) return null;
  const [actor, item] = await Promise.all([
    window.Loom.api.get(`/actors/${encodeURIComponent(action.actorId)}?populate=true`),
    window.Loom.api.get(`/items/${encodeURIComponent(action.itemId)}`),
  ]);
  if (!actor?.id || !item?.id || !(actor.items || []).some((entry) => String(entry.id) === String(item.id))) return null;
  const mastery = weaponMasteryForAttack(actor.items || [], item, actor.systemData?.proficiencies?.weapons || []);
  if (mastery?.property !== property) return null;
  const target = await window.Loom.api.get(`/cast/${encodeURIComponent(action.targetCastId)}`);
  if (!target?.id) return null;
  return { action, actor, item, target };
}

/** Roll the off-hand Nick attack as part of the captured Attack action, once per active turn. */
export async function rollWeaponNick(messageId, nickItemId) {
  const source = window.Loom?.messages?.get?.(String(messageId || ''));
  const roll = source?.roll || source?.getFlag?.('srd5e', 'weaponMasteryAttackRoll');
  const action = weaponMasteryNickAction(roll?.meta);
  const candidate = action?.candidates.find((entry) => String(entry.id) === String(nickItemId || ''));
  if (!action || !candidate) {
    window.Loom?.showToast?.(weaponMasteryText('NickUnavailable'), 'warning');
    return null;
  }
  const turn = activeSpellSlotTurn(window.Loom?.combat);
  if (!sameSpellSlotTurn(turn, action.turn)) {
    window.Loom?.showToast?.(weaponMasteryText('NickExpired'), 'warning');
    return null;
  }
  const targets = await getTargetAcInfo();
  if (!targets || targets.length !== 1) {
    window.Loom?.showToast?.(weaponMasteryText('SelectCleaveTarget'), 'warning');
    return null;
  }
  const actor = await window.Loom.api.get(`/actors/${encodeURIComponent(action.actorId)}?populate=true`);
  const sourceItem = actor?.items?.find((entry) => String(entry.id) === action.sourceItemId);
  const nickItem = actor?.items?.find((entry) => String(entry.id) === String(candidate.id));
  const sourceData = sourceItem?.system || sourceItem?.data || {};
  const nickData = nickItem?.system || nickItem?.data || {};
  const proficiencies = actor?.systemData?.proficiencies?.weapons || [];
  if (!actor?.id || !sourceItem || !nickItem || sourceData.equipped !== true
    || nickData.equipped !== true || nickData.primarySlot !== 'offHand'
    || !weaponMasteryDefinitionForItem(sourceItem)?.properties.includes('light')
    || !weaponMasteryDefinitionForItem(nickItem)?.properties.includes('light')
    || weaponMasteryForAttack(actor.items || [], nickItem, proficiencies)?.property !== 'nick'
    || String(sourceItem.id) === String(nickItem.id)) {
    window.Loom?.showToast?.(weaponMasteryText('NickUnavailable'), 'warning');
    return null;
  }

  const operationId = createCombatEffectOperationId('nick');
  const reservation = await withCombatEffectCastQueue(actor.id, async () => {
    const freshActor = await window.Loom.api.get(`/actors/${encodeURIComponent(actor.id)}?populate=true`);
    const resources = freshActor?.systemData?.resources || {};
    if (!weaponMasteryNickTurnAvailable(resources.weaponMasteryNickTurn, turn)) return null;
    const previous = resources.weaponMasteryNickTurn || null;
    await window.Loom.api.put(`/actors/${encodeURIComponent(actor.id)}`, { systemData: { resources: {
      weaponMasteryNickTurn: { ...turn, operationId, state: 'pending' },
    } } });
    return { previous, operationId };
  });
  if (!reservation) {
    window.Loom?.showToast?.(weaponMasteryText('NickAlreadyUsed'), 'warning');
    return null;
  }

  let dispatched = false;
  try {
    const result = await rollWeaponAttack(actor, nickItem, {
      targetCastId: String(targets[0].castId),
      nickAttack: { sourceMessageId: String(messageId), turn },
    });
    if (result !== null) {
      dispatched = true;
      await window.Loom.api.put(`/actors/${encodeURIComponent(actor.id)}`, { systemData: { resources: {
        weaponMasteryNickTurn: { ...turn, operationId, state: 'used' },
      } } });
      return { rolled: true, targetCastId: String(targets[0].castId) };
    }
  } catch (error) {
    console.error('[sdr5e] Nick attack could not be rolled:', error);
  }
  if (dispatched) {
    window.Loom?.showToast?.(weaponMasteryText('NickTrackingFailed'), 'warning');
    return { rolled: true, trackingFailed: true, targetCastId: String(targets[0].castId) };
  }
  await withCombatEffectCastQueue(actor.id, async () => {
    const latest = await window.Loom.api.get(`/actors/${encodeURIComponent(actor.id)}`);
    if (latest?.systemData?.resources?.weaponMasteryNickTurn?.operationId !== reservation.operationId) return false;
    await window.Loom.api.put(`/actors/${encodeURIComponent(actor.id)}`, { systemData: { resources: {
      weaponMasteryNickTurn: reservation.previous,
    } } });
    return true;
  });
  return null;
}

/** Make the optional once-per-turn Cleave attack against a confirmed second target. */
export async function rollWeaponCleave(messageId) {
  const resolved = await freshWeaponMasteryAction(messageId, 'cleave', true);
  if (!resolved) {
    window.Loom?.showToast?.(weaponMasteryText('Unavailable'), 'warning');
    return null;
  }
  const { action, actor, item } = resolved;
  const turn = activeSpellSlotTurn(window.Loom?.combat);
  if (!sameSpellSlotTurn(turn, action.cleaveTurn)) {
    window.Loom?.showToast?.(weaponMasteryText('CleaveExpired'), 'warning');
    return null;
  }
  const combatantIds = new Set((window.Loom?.combat?.combatants || []).map((entry) => String(entry?.id || '')));
  if (!combatantIds.has(action.targetCastId) || !combatantIds.has(turn.castId)) return null;
  const selected = window.Loom?.user?.targets || [];
  if (selected.length !== 1) {
    window.Loom?.showToast?.(weaponMasteryText('SelectCleaveTarget'), 'warning');
    return null;
  }
  const target = (await getTargetAcInfo())?.[0];
  if (!target?.castId || String(target.castId) === action.targetCastId || !combatantIds.has(String(target.castId))) {
    window.Loom?.showToast?.(weaponMasteryText('SelectCleaveTarget'), 'warning');
    return null;
  }
  const inReach = await grappleConfirm(weaponMasteryText('CleaveRangeTitle'), weaponMasteryText('CleaveRangeConfirm'),
    weaponMasteryText('CleaveRangeAccept'), 'WeaponMastery');
  if (!inReach) return null;

  const operationId = createCombatEffectOperationId('cleave');
  const reservation = await withCombatEffectCastQueue(actor.id, async () => {
    const freshActor = await window.Loom.api.get(`/actors/${encodeURIComponent(actor.id)}?populate=true`);
    const resources = freshActor?.systemData?.resources || {};
    if (!weaponMasteryCleaveTurnAvailable(resources.weaponMasteryCleaveTurn, turn)) return null;
    const previous = resources.weaponMasteryCleaveTurn || null;
    await window.Loom.api.put(`/actors/${encodeURIComponent(actor.id)}`, { systemData: { resources: {
      weaponMasteryCleaveTurn: { ...turn, operationId, state: 'pending' },
    } } });
    return { previous, operationId };
  });
  if (!reservation) {
    window.Loom?.showToast?.(weaponMasteryText('CleaveAlreadyUsed'), 'warning');
    return null;
  }
  let dispatched = false;
  try {
    const result = await rollWeaponAttack(actor, item, {
      targetCastId: String(target.castId),
      cleaveAttack: { sourceMessageId: String(messageId), turn, originalTargetId: action.targetCastId },
    });
    if (result !== null) {
      dispatched = true;
      await window.Loom.api.put(`/actors/${encodeURIComponent(actor.id)}`, { systemData: { resources: {
        weaponMasteryCleaveTurn: { ...turn, operationId, state: 'used' },
      } } });
      return { rolled: true, targetCastId: String(target.castId) };
    }
  } catch (error) {
    console.error('[srd5e] Cleave attack could not be rolled:', error);
  }
  if (dispatched) {
    window.Loom?.showToast?.(weaponMasteryText('CleaveTrackingFailed'), 'warning');
    return { rolled: true, trackingFailed: true, targetCastId: String(target.castId) };
  }
  await withCombatEffectCastQueue(actor.id, async () => {
    const latest = await window.Loom.api.get(`/actors/${encodeURIComponent(actor.id)}`);
    if (latest?.systemData?.resources?.weaponMasteryCleaveTurn?.operationId !== reservation.operationId) return false;
    await window.Loom.api.put(`/actors/${encodeURIComponent(actor.id)}`, { systemData: { resources: {
      weaponMasteryCleaveTurn: reservation.previous,
    } } });
    return true;
  });
  return null;
}

/** Resolve an already-hit Topple target; the save result is explicitly adjudicated by the table. */
export async function rollWeaponTopple(messageId) {
  const resolved = await freshWeaponMasteryAction(messageId, 'topple', true);
  if (!resolved) {
    window.Loom?.showToast?.(weaponMasteryText('Unavailable'), 'warning');
    return null;
  }
  const { action, target: targetCast } = resolved;
  const dc = Number(action.saveDC);
  if (!Number.isInteger(dc) || dc < 1 || dc > 40) return null;

  const targetRecord = targetCast.isLinked === true && targetCast.actorId
    ? await window.Loom.api.get(`/actors/${targetCast.actorId}?populate=true`) : targetCast;
  if (!targetRecord?.systemData) return null;
  const { prepCharacter, prepNpc } = await import('./prepare-data.mjs');
  if (targetRecord.type === 'npc') prepNpc(targetRecord.systemData);
  else prepCharacter(targetRecord.systemData, targetRecord.items || []);
  const save = targetRecord.systemData.saves?.con;
  if (!save) {
    window.Loom?.showToast?.(weaponMasteryText('SaveUnavailable'), 'warning');
    return null;
  }

  const targetActorId = targetCast.isLinked === true ? targetCast.actorId : '';
  const conditions = new Set([...(targetCast.statusMarkers || []), ...(targetActorId ? await getActorConditions(targetActorId) : [])]);
  const targetData = targetRecord.systemData;
  const saveState = getSaveConditionOutcome('con', [...conditions], targetData.resources?.exhaustion || 0,
    !!targetData.attributes?.armor?.penalty, { items: targetRecord.items || [] });
  const coverBonus = await getSaveCoverBonus('con', conditions);
  if (coverBonus === null) return null;
  const saveRoll = await sdr5eRoll({
    label: `${weaponMasteryText('SaveTitle')} (CON, DC ${dc})`,
    parts: [{ label: weaponMasteryText('ConstitutionSave'), value: (Number(save.total) || 0) + coverBonus }],
    actor: targetRecord,
    advantage: combineAdvantageSources(currentAdvantageMode(), saveState.advantage, saveState.disadvantage),
    dc,
    extraMeta: { srd5eWeaponMasterySave: true, srd5eAbilityKey: 'con' },
  });
  if (saveRoll === null) return null;
  const outcome = await grappleSelect(weaponMasteryText('AdjudicateSave'), [
    ['success', weaponMasteryText('SaveSucceeded')], ['failure', weaponMasteryText('SaveFailed')],
  ], weaponMasteryText('ApplyOutcome'), 'WeaponMastery');
  if (!outcome) return null;
  if (outcome !== 'failure') return { outcome, applied: false, targetCastId: String(targetCastId) };

  const latestCast = await window.Loom.api.get(`/cast/${action.targetCastId}`);
  if (!latestCast) return null;
  const statusMarkers = addProneMarker(latestCast.statusMarkers, { valid: true, applyProne: true });
  await window.Loom.api.put(`/cast/${targetCastId}`, { statusMarkers });
  window.Loom?.showToast?.(weaponMasteryText('ProneApplied'), 'success');
  return { outcome, applied: true, targetCastId: action.targetCastId };
}

/** Apply SRD Graze damage to the exact token captured by the missed attack. */
export async function rollWeaponGraze(messageId) {
  const resolved = await freshWeaponMasteryAction(messageId, 'graze', false);
  if (!resolved) {
    window.Loom?.showToast?.(weaponMasteryText('Unavailable'), 'warning');
    return null;
  }
  const { action } = resolved;
  return applyDamageToTargets(action.abilityModifier, action.damageType, [action.targetCastId]);
}

/** Resolve SRD Push after a hit; token movement remains an explicit manual table action. */
export async function rollWeaponPush(messageId) {
  const resolved = await freshWeaponMasteryAction(messageId, 'push', true);
  if (!resolved) {
    window.Loom?.showToast?.(weaponMasteryText('Unavailable'), 'warning');
    return null;
  }
  const { action, target: targetCast } = resolved;
  const targetRecord = targetCast.isLinked === true && targetCast.actorId
    ? await window.Loom.api.get(`/actors/${targetCast.actorId}?populate=true`) : targetCast;
  if (!targetRecord?.systemData) return null;
  const eligible = weaponMasteryPushTargetSizeEligible(actorSize(targetRecord));
  if (eligible === false) {
    window.Loom?.showToast?.(weaponMasteryText('PushTargetTooLarge'), 'warning');
    return { manual: false, reason: 'target-too-large' };
  }
  if (eligible === null && !await grappleConfirm(
    weaponMasteryText('PushConfirmSizeTitle'), weaponMasteryText('PushConfirmSize'),
    weaponMasteryText('PushConfirmed'), 'WeaponMastery',
  )) return null;
  const message = weaponMasteryText('PushManual')
    .replaceAll('{target}', String(targetRecord.name || targetCast.name || weaponMasteryText('Target')));
  window.Loom?.showToast?.(message, 'info');
  return { manual: true, targetCastId: action.targetCastId, distanceFeet: 10, movementApplied: false };
}

function weaponMasteryText(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.WeaponMastery.${key}`) || key;
}

export async function rollWeaponDamage(actor, item, options = {}) {
  if (!actor || !item) return null;
  const sd = actor.systemData;
  const idata = item.system || item.data || {};
  const abilityKey = weaponAbilityKey(sd, idata);
  const abilityMod = sd.abilities?.[abilityKey]?.modifier ?? 0;

  // SRD (Combat, "Two-Weapon Fighting"): ataque da mão secundária (bônus de
  // ação) só soma modificador de habilidade no dano se for negativo — a não
  // ser que o personagem tenha o estilo de luta Two-Weapon Fighting
  // (feature com flags.isTWF), que remove essa restrição.
  const isOffHand = idata.primarySlot === 'offHand';
  const hasTWFStyle = (actor.items || []).some((i) => {
    const fdata = i.system || i.data || {};
    return i.type === 'feature' && fdata.flags?.isTWF;
  });
  const effectiveMod = weaponMasteryDamageAbilityModifier(abilityMod, {
    cleaveAttack: options.cleaveAttack === true, offHand: isOffHand, twoWeaponFightingStyle: hasTWFStyle,
  });

  const formula = idata.damage?.formula || '1d4';
  const rageBonus = rageDamageBonusForAttack(actor.items, options.attackAbility, options.rageEligible, options.targetCount);
  const flatBonus = effectiveMod + rageBonus;
  const rollFormula = flatBonus !== 0 ? `${formula} ${flatBonus > 0 ? '+' : '-'} ${Math.abs(flatBonus)}` : formula;
  const type = idata.damage?.type || '';
  const typeSuffix = type ? ` (${type})` : '';
  // Handout 30: Alt segurado na hora do clique = crítico (dados em dobro,
  // SRD Combat.md "Critical Hits"). Sem estado compartilhado com o attack
  // roll — o jogador sinaliza manualmente, motivo completo no handout.
  const critical = await resolveAutomaticCritical(options, typeof options.critical === 'boolean' ? options.critical : isCriticalHeld());
  // Keep the actual dice in the server roll so the resolved card can be
  // rerolled with Heroic Inspiration and the same result can drive Apply
  // Damage. The ruleset's local damage formulas support only additive terms.
  const finalFormula = damageRollFormula(rollFormula, critical);
  window.Loom.dispatchRoll({
    formula: finalFormula,
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Damage: ${item.name}${rageBonus ? ` (${localizeClassFeature('RageDamageBonus').replace('{amount}', String(rageBonus))})` : ''}${critical ? ' (Critical!)' : ''}${typeSuffix}`, ...(rageBonus ? { rageDamageBonus: rageBonus } : {}), srd5eDamage: {
      type, critical,
      melee: idata.rangeType !== 'ranged',
      ...(options.targetBound === true && options.targetId ? { targetBound: true, targetId: String(options.targetId) } : {}),
      ...(options.vexRequest && typeof options.vexRequest === 'object' ? { vexRequest: options.vexRequest } : {}),
      ...(options.slowRequest && typeof options.slowRequest === 'object' ? { slowRequest: options.slowRequest } : {}),
    } },
  });
  return { pending: true, formula: finalFormula };
}

/**
 * Unarmed strike (SRD Combat.md:293) — "1 + your Strength modifier"
 * bludgeoning, sempre proficiente, sem item nenhum envolvido. Mais simples
 * que rollWeaponAttack: sem lookup de proficiência por nome/categoria, sem
 * finesse (unarmed é sempre Força), sem bônus de item (Handout 32).
 */
export async function rollUnarmedStrike(actor) {
  if (!actor) return null;
  if (!canRollAtMostOneAttackTarget()) return null;
  const sd = actor.systemData;
  const strMod = sd.abilities?.str?.modifier ?? 0;
  const prof = sd.attributes?.prof?.value ?? 0;
  const parts = [
    { label: 'STR', value: strMod },
    { label: 'Proficiency', value: prof },
    { label: 'Melee', value: Number(sd.attributes?.meleeBonus) || 0 },
  ];
  const conditions = await getActorConditions(actor.id);
  const armorPenalty = !!sd.attributes?.armor?.penalty;
  const targets = await getTargetAcInfo();
  if (targets === null) return null;
  if (await charmerBlocksAttack(actor, conditions, targets)) return null;
  const effectState = await combatAttackEffectState(actor.id, targets[0]?.castId || '');
  const sapCount = effectState.effects.filter((effect) => effect.type === 'sap').length;
  const vexCount = effectState.effects.filter((effect) => effect.type === 'vex').length;
  const situation = await resolveAttackSituation(actor, conditions, targets);
  if (situation === null) return null;
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, false,
    sd.resources?.exhaustion ?? 0, armorPenalty, sapCount, vexCount, situation);
  return sdr5eRoll({ label: 'Attack: Unarmed Strike', parts, actor, advantage, extraMeta: {
    isAttack: true, isUnarmed: true, srd5eAttackAbility: 'str', actorId: actor.id,
    ...combatEffectConsumptionMeta(effectState.source, effectState.effects),
    ...(targets.length ? { targets } : {}),
  } });
}

function grappleText(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.Grapple.${key}`) || key;
}

function shoveText(key) {
  return window.Loom?.i18n?.localize?.(`SDR5E.Shove.${key}`) || key;
}

function actorSize(actor) {
  const sd = actor?.systemData || {};
  return sd.details?.size || sd.attributes?.size?.value || sd.traits?.size
    || actor?.items?.find((item) => item.type === 'race')?.system?.size || '';
}

async function grappleConfirm(title, message, confirmLabel, namespace = 'Grapple') {
  const content = document.createElement('p');
  content.textContent = message;
  const text = (key) => window.Loom?.i18n?.localize?.(`SDR5E.${namespace}.${key}`) || key;
  return await LoomDialog.wait({
    window: { title }, content,
    buttons: [
      { action: 'cancel', label: text('Cancel'), variant: 'ghost', callback: () => false },
      { action: 'confirm', label: confirmLabel, variant: 'primary', callback: () => true },
    ],
  }) === true;
}

async function grappleSelect(title, options, confirmLabel, namespace = 'Grapple', defaultValue = null) {
  const select = document.createElement('select');
  select.className = 'sdrn-spell-slot-select';
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  if (defaultValue && options.some(([value]) => value === defaultValue)) select.value = defaultValue;
  const text = (key) => window.Loom?.i18n?.localize?.(`SDR5E.${namespace}.${key}`) || key;
  return LoomDialog.wait({
    window: { title }, content: select,
    buttons: [
      { action: 'cancel', label: text('Cancel'), variant: 'ghost', callback: () => null },
      { action: 'confirm', label: confirmLabel, variant: 'primary', callback: () => select.value },
    ],
  });
}

async function persistGrapple(targetCast, targetRecord, grappler, hand, escapeDC) {
  const grapplerCastId = findTokenIdForActor(grappler.id);
  const targetData = {
    ...(targetCast.systemData || {}),
    srd5eGrapple: { grapplerActorId: grappler.id, grapplerCastId, escapeDC, hand },
  };
  const existingMarkers = Array.isArray(targetCast.statusMarkers) ? targetCast.statusMarkers : [];
  await window.Loom.api.put(`/cast/${targetCast.id}`, {
    statusMarkers: [...new Set([...existingMarkers, 'grappled'])],
    systemData: targetData,
  });

  const resources = grappler.systemData?.resources || {};
  const active = recordGrapple(resources.srd5eGrapples, { targetCastId: targetCast.id, hand, escapeDC });
  if (!active) throw new Error('invalid-grapple-record');
  await window.Loom.api.put(`/actors/${grappler.id}`, {
    systemData: { ...grappler.systemData, resources: { ...resources, srd5eGrapples: active } },
  });
}

async function endGrapple(targetCast, targetRecord) {
  const data = { ...(targetCast.systemData || {}) };
  delete data.srd5eGrapple;
  const markers = (targetCast.statusMarkers || []).filter((marker) => marker !== 'grappled');
  await window.Loom.api.put(`/cast/${targetCast.id}`, { statusMarkers: markers, systemData: data });
  const grapplerId = targetCast.systemData?.srd5eGrapple?.grapplerActorId;
  if (grapplerId) {
    const grappler = await window.Loom.api.get(`/actors/${grapplerId}`);
    const resources = grappler?.systemData?.resources || {};
    await window.Loom.api.put(`/actors/${grapplerId}`, {
      systemData: { ...grappler.systemData, resources: { ...resources, srd5eGrapples: removeGrapple(resources.srd5eGrapples, targetCast.id) } },
    });
  }
}

function combineAdvantageSources(explicitMode, advantage, disadvantage) {
  const advantageCount = (explicitMode === 1 ? 1 : 0) + (advantage ? 1 : 0);
  const disadvantageCount = (explicitMode === -1 ? 1 : 0) + (disadvantage ? 1 : 0);
  return advantageCount === disadvantageCount ? 0 : advantageCount > disadvantageCount ? 1 : -1;
}

/** SRD Unarmed Strike: Grapple; server roll is dispatched, outcome remains an explicit table adjudication. */
export async function rollUnarmedGrapple(actor) {
  if (!actor || !canRollAtMostOneAttackTarget()) return null;
  const selected = window.Loom?.user?.targets?.[0];
  if (!selected?.id) {
    window.Loom?.showToast?.(grappleText('SelectOneTarget'), 'warning');
    return null;
  }
  const targetCast = await window.Loom.api.get(`/cast/${selected.id}`);
  if (!targetCast) return null;
  const targetRecord = targetCast.isLinked === true && targetCast.actorId
    ? await window.Loom.api.get(`/actors/${targetCast.actorId}`) : targetCast;
  if (!targetRecord?.systemData) return null;

  const existingGrapple = targetCast.systemData?.srd5eGrapple;
  if (existingGrapple && (targetCast.statusMarkers || []).includes('grappled')) {
    const isGrappler = existingGrapple.grapplerActorId === actor.id;
    const action = await grappleSelect(grappleText('ActiveTitle'), [
      ['escape', grappleText('EscapeAction')],
      ...(isGrappler ? [['release', grappleText('ReleaseAction')]] : []),
    ], grappleText('Continue'));
    if (!action) return null;
    if (action === 'release') {
      await endGrapple(targetCast, targetRecord);
      return { ended: true, reason: 'released' };
    }
    const ability = await grappleSelect(grappleText('EscapeTitle'), [
      ['athletics', grappleText('AthleticsCheck')], ['acrobatics', grappleText('AcrobaticsCheck')],
    ], grappleText('Roll'));
    if (!ability) return null;
    const skill = targetRecord.systemData.skills?.[ability];
    const targetActorId = targetCast.isLinked === true ? targetCast.actorId : '';
    const escapeConditions = new Set([...(targetCast.statusMarkers || []), ...(targetActorId ? await getActorConditions(targetActorId) : [])]);
    const escapeAbility = ability === 'athletics' ? 'str' : 'dex';
    const armorPenalty = !!targetRecord.systemData.attributes?.armor?.penalty;
    const advantage = applyAbilityCheckConditionModifiers(
      currentAdvantageMode(), [...escapeConditions], targetRecord.systemData.resources?.exhaustion || 0,
      armorPenalty && (escapeAbility === 'str' || escapeAbility === 'dex'),
    );
    const escapeRoll = await sdr5eRoll({
      label: `${grappleText('EscapeTitle')} (DC ${existingGrapple.escapeDC})`,
      parts: [{ label: grappleText(ability === 'athletics' ? 'Athletics' : 'Acrobatics'), value: Number(skill?.total) || 0 }],
      actor: targetRecord, advantage, dc: existingGrapple.escapeDC,
      extraMeta: { srd5eGrappleEscape: true, srd5eAbilityKey: ability === 'athletics' ? 'str' : 'dex' },
    });
    if (escapeRoll === null) return null;
    const outcome = await grappleSelect(grappleText('AdjudicateEscape'), [
      ['success', grappleText('EscapeSucceeded')], ['failure', grappleText('EscapeFailed')],
    ], grappleText('ApplyOutcome'));
    if (outcome === 'success') await endGrapple(targetCast, targetRecord);
    return { ended: outcome === 'success', outcome };
  }

  const grapplerSize = actorSize(actor);
  const targetSize = actorSize(targetRecord);
  if (grapplerSize && targetSize) {
    const preflight = resolveGrapplePrerequisites({ grapplerSize, targetSize, sizeConfirmed: true, freeHandConfirmed: true, withinRangeConfirmed: true });
    if (!preflight.valid) {
      window.Loom?.showToast?.(grappleText('TargetTooLarge'), 'warning');
      return null;
    }
  } else if (!await grappleConfirm(grappleText('ConfirmSizeTitle'), grappleText('ConfirmSize'), grappleText('Confirmed'))) return null;

  if (!await grappleConfirm(grappleText('ConfirmRangeTitle'), grappleText('ConfirmRange'), grappleText('WithinRange'))) return null;
  const hand = await grappleSelect(grappleText('ChooseHand'), [['left', grappleText('LeftHand')], ['right', grappleText('RightHand')]], grappleText('Grapple'));
  if (!hand) return null;
  const activeGrapples = actor.systemData?.resources?.srd5eGrapples || [];
  if (!canUseGrappleHand(activeGrapples, hand, targetCast.id)) {
    window.Loom?.showToast?.(grappleText('HandOccupied'), 'warning');
    return null;
  }
  const valid = resolveGrapplePrerequisites({ grapplerSize, targetSize, sizeConfirmed: true, freeHandConfirmed: true, withinRangeConfirmed: true });
  if (!valid.valid) return null;
  const ability = await grappleSelect(grappleText('TargetSave'), [['str', grappleText('StrengthSave')], ['dex', grappleText('DexteritySave')]], grappleText('Roll'));
  if (!ability) return null;
  const save = targetRecord.systemData.saves?.[ability];
  if (!save) {
    window.Loom?.showToast?.(grappleText('TargetSaveUnavailable'), 'warning');
    return null;
  }
  const escapeDC = 8 + (Number(actor.systemData?.abilities?.str?.modifier) || 0) + (Number(actor.systemData?.attributes?.prof?.value) || 0);
  const targetActorId = targetCast.isLinked === true ? targetCast.actorId : '';
  const conditions = new Set([...(targetCast.statusMarkers || []), ...(targetActorId ? await getActorConditions(targetActorId) : [])]);
  const targetData = targetRecord.systemData;
  const saveOutcome = getSaveConditionOutcome(
    ability,
    [...conditions],
    targetData.resources?.exhaustion || 0,
    !!targetData.attributes?.armor?.penalty,
  );
  const coverBonus = await getSaveCoverBonus(ability, conditions);
  if (coverBonus === null) return null;
  let outcome;
  if (saveOutcome.autoFail) {
    outcome = 'failure';
  } else {
    const advantage = combineAdvantageSources(currentAdvantageMode(), saveOutcome.advantage, saveOutcome.disadvantage);
      const saveRoll = await sdr5eRoll({
      label: `${grappleText('TargetSave')} (${ability.toUpperCase()})`,
      parts: [{ label: ability.toUpperCase(), value: (Number(save.total) || 0) + coverBonus }],
      actor: targetRecord, advantage, dc: escapeDC,
      extraMeta: { srd5eGrappleSave: true, srd5eAbilityKey: ability },
    });
      if (saveRoll === null) return null;
    outcome = await grappleSelect(grappleText('AdjudicateSave'), [
      ['success', grappleText('SaveSucceeded')], ['failure', grappleText('SaveFailed')],
    ], grappleText('ApplyOutcome'));
  }
  if (outcome === 'failure') await persistGrapple(targetCast, targetRecord, actor, hand, escapeDC);
  return { outcome, escapeDC, applied: outcome === 'failure' };
}

/** SRD Unarmed Strike: Shove; server roll is dispatched, with explicit GM adjudication. */
export async function rollUnarmedShove(actor) {
  if (!actor || !canRollAtMostOneAttackTarget()) return null;
  const selected = window.Loom?.user?.targets?.[0];
  if (!selected?.id) {
    window.Loom?.showToast?.(shoveText('SelectOneTarget'), 'warning');
    return null;
  }
  const targetCast = await window.Loom.api.get(`/cast/${selected.id}`);
  if (!targetCast) return null;
  const targetRecord = targetCast.isLinked === true && targetCast.actorId
    ? await window.Loom.api.get(`/actors/${targetCast.actorId}`) : targetCast;
  if (!targetRecord?.systemData) return null;

  const attackerSize = actorSize(actor);
  const targetSize = actorSize(targetRecord);
  const preflight = resolveShovePrerequisites({ attackerSize, targetSize });
  if (!preflight.valid && preflight.reason === 'target-too-large') {
    window.Loom?.showToast?.(shoveText('TargetTooLarge'), 'warning');
    return null;
  }
  if (preflight.reason === 'confirm-size' && !await grappleConfirm(
    shoveText('ConfirmSizeTitle'), shoveText('ConfirmSize'), shoveText('Confirmed'), 'Shove',
  )) return null;
  if (!await grappleConfirm(
    shoveText('ConfirmRangeTitle'), shoveText('ConfirmRange'), shoveText('WithinRange'), 'Shove',
  )) return null;

  const ability = await grappleSelect(shoveText('TargetSave'), [
    ['str', shoveText('StrengthSave')], ['dex', shoveText('DexteritySave')],
  ], shoveText('Roll'), 'Shove');
  if (!ability) return null;
  const save = targetRecord.systemData.saves?.[ability];
  if (!save) {
    window.Loom?.showToast?.(shoveText('TargetSaveUnavailable'), 'warning');
    return null;
  }

  const dc = 8 + (Number(actor.systemData?.abilities?.str?.modifier) || 0)
    + (Number(actor.systemData?.attributes?.prof?.value) || 0);
  const targetActorId = targetCast.isLinked === true ? targetCast.actorId : '';
  const conditions = new Set([...(targetCast.statusMarkers || []), ...(targetActorId ? await getActorConditions(targetActorId) : [])]);
  const targetData = targetRecord.systemData;
  const saveOutcome = getSaveConditionOutcome(
    ability, [...conditions], targetData.resources?.exhaustion || 0,
    !!targetData.attributes?.armor?.penalty,
  );
  const coverBonus = await getSaveCoverBonus(ability, conditions);
  if (coverBonus === null) return null;
  let outcome;
  if (saveOutcome.autoFail) {
    outcome = 'failure';
  } else {
    const advantage = combineAdvantageSources(currentAdvantageMode(), saveOutcome.advantage, saveOutcome.disadvantage);
    const saveRoll = await sdr5eRoll({
      label: `${shoveText('TargetSave')} (${ability.toUpperCase()})`,
      parts: [{ label: ability.toUpperCase(), value: (Number(save.total) || 0) + coverBonus }],
      actor: targetRecord, advantage, dc,
      extraMeta: { srd5eShoveSave: true, srd5eAbilityKey: ability },
    });
    if (saveRoll === null) return null;
    outcome = await grappleSelect(shoveText('AdjudicateSave'), [
      ['success', shoveText('SaveSucceeded')], ['failure', shoveText('SaveFailed')],
    ], shoveText('ApplyOutcome'), 'Shove');
  }

  if (outcome !== 'failure') return { outcome: outcome || 'cancelled', dc, applied: false };
  const effect = await grappleSelect(shoveText('ChooseEffectTitle'), [
    ['prone', shoveText('ProneEffect')], ['push_5ft', shoveText('PushEffect')],
  ], shoveText('ApplyOutcome'), 'Shove');
  if (!effect) return { outcome, dc, applied: false, effect: null };

  if (effect === 'prone') {
    const statusMarkers = addProneMarker(targetCast.statusMarkers, resolveShoveOutcome(outcome, effect));
    await window.Loom.api.put(`/cast/${targetCast.id}`, { statusMarkers });
    return { outcome, dc, effect, applied: true, manualMovement: false };
  }

  const shoveResult = resolveShoveOutcome(outcome, effect);
  if (!shoveResult.valid) return { outcome, dc, effect, applied: false };
  window.Loom?.showToast?.(shoveText('PushManual'), 'info');
  return { outcome, dc, effect, applied: false, manualMovement: true };
}

export async function rollUnarmedDamage(actor, options = {}) {
  if (!actor) return null;
  const sd = actor.systemData;
  const strMod = sd.abilities?.str?.modifier ?? 0;
  const rageBonus = rageDamageBonusForAttack(actor.items, options.attackAbility, options.rageEligible, options.targetCount);
  const total = Math.max(0, 1 + strMod + rageBonus);
  window.Loom.dispatchRoll({
    formula: String(total),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Damage: Unarmed Strike${rageBonus ? ` (${localizeClassFeature('RageDamageBonus').replace('{amount}', String(rageBonus))})` : ''}${options.critical ? ' (Critical!)' : ''} (bludgeoning)`, ...(rageBonus ? { rageDamageBonus: rageBonus } : {}), srd5eDamage: {
      amount: total, type: 'bludgeoning', melee: true,
      ...(options.targetBound === true && options.targetId ? { targetBound: true, targetId: String(options.targetId) } : {}),
    } },
  });
  return total;
}

/**
 * Spend one Hit Die during a short rest: roll the die + CON modifier, heal
 * that much (capped at max HP), decrement the pool. The die itself (e.g.
 * "d8") comes from `resources.hitDice.die` — set from the class item's own
 * `hitDie` field when the class is attached (see prepare-data.mjs), not
 * hardcoded here.
 */
export async function spendHitDie(actor, poolId = '') {
  if (!actor) return null;
  const sd = actor.systemData;
  const hd = sd.resources?.hitDice;
  if (!hd || (hd.value ?? 0) <= 0) {
    globalThis.Loom?.showToast?.('No Hit Dice remaining.', 'warning');
    return null;
  }
  const pools = hd.pools || {};
  const eligiblePools = Object.entries(pools).filter(([, pool]) => !pool.needsReview && (Number(pool.value) || 0) > 0);
  let selectedPool = null;
  let selectedPoolId = '';
  if (eligiblePools.length) {
    const match = poolId ? eligiblePools.find(([id]) => id === poolId) : eligiblePools.length === 1 ? eligiblePools[0] : null;
    if (!match) {
      globalThis.Loom?.showToast?.(eligiblePools.length > 1 ? 'Choose which Hit Die pool to spend.' : 'This Hit Die pool needs GM review.');
      return { needsSelection: eligiblePools.length > 1 };
    }
    [selectedPoolId, selectedPool] = match;
  } else if (Object.keys(pools).length) {
    globalThis.Loom?.showToast?.('Hit Die pools need GM review before they can be spent.', 'warning');
    return null;
  }
  const die = selectedPool?.die || hd.die || 'd8';
  const conMod = sd.abilities?.con?.modifier ?? 0;
  const formula = conMod !== 0 ? `1${die} + ${conMod}` : `1${die}`;
  const requestId = globalThis.crypto?.randomUUID?.() || `hd-${Date.now()}-${Math.random()}`;
  const resultPromise = new Promise((resolve) => {
    const timeout = setTimeout(() => expirePendingHitDie(requestId), 120000);
    registerPendingHitDie(requestId, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, actorId: String(actor.id), poolId: selectedPoolId });
  });
  window.Loom.dispatchRoll({
    formula,
    actorId: actor.id,
    mode: 'public',
    meta: { label: 'Spend Hit Die', actorId: String(actor.id), srd5eHitDieRequestId: requestId },
  });
  const settled = await resultPromise;
  if (!settled) return null;
  const { healAmount, newValue } = settled;

  const tokenId = findTokenIdForActor(actor.id);
  if (tokenId && healAmount > 0) {
    showFloatingDamageOrHeal(tokenId, healAmount, true);
  }

  return { healAmount, newValue };
}

export async function rollSpellAttack(actor, item, options = {}) {
  if (!actor || !item) return null;
  if (!canRollAtMostOneAttackTarget()) return null;
  const idata = item.system || item.data || {};
  const spellStats = spellcastingStats(actor.systemData, idata, actor.items || []);
  const parts = [{ label: 'Spellcasting', value: spellStats.attackBonus }];
  const conditions = await getActorConditions(actor.id);
  const targets = await getTargetAcInfo();
  if (targets === null) return null;
  if (await charmerBlocksAttack(actor, conditions, targets)) return null;
  const effectState = await combatAttackEffectState(actor.id, targets[0]?.castId || '');
  const sapCount = effectState.effects.filter((effect) => effect.type === 'sap').length;
  const vexCount = effectState.effects.filter((effect) => effect.type === 'vex').length;
  const situation = await resolveAttackSituation(actor, conditions, targets);
  if (situation === null) return null;
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, false,
    actor.systemData?.resources?.exhaustion ?? 0, false, sapCount, vexCount, situation);
  const castSlotLevel = options.castAtLevel ?? options.slotLevel;
  return sdr5eRoll({ label: `Spell Attack: ${item.name}`, parts, actor, advantage, extraMeta: {
    isAttack: true, ...(targets.length ? { targets } : {}), actorId: actor.id, itemId: item.id, isSpell: true,
    ...(castSlotLevel != null ? { castSlotLevel: Number(castSlotLevel) } : {}),
    ...combatEffectConsumptionMeta(effectState.source, effectState.effects),
  } });
}

/**
 * SRD 5.2 spells whose damage type the caster chooses (spells.md). Keyed by
 * spell name. Conjure Elemental is intentionally absent: its type follows the
 * element chosen (air Lightning, earth Thunder, fire Fire, water Cold), so no
 * type prompt is shown for it.
 */
export const SPELL_DAMAGE_TYPE_CHOICES = Object.freeze({
  'Chromatic Orb': Object.freeze(['Acid', 'Cold', 'Fire', 'Lightning', 'Poison', 'Thunder']),
  'Sorcerous Burst': Object.freeze(['Acid', 'Cold', 'Fire', 'Lightning', 'Poison', 'Psychic', 'Thunder']),
  'Glyph of Warding': Object.freeze(['Acid', 'Cold', 'Fire', 'Lightning', 'Thunder']),
  'Conjure Minor Elementals': Object.freeze(['Acid', 'Cold', 'Fire', 'Lightning']),
  "Dragon's Breath": Object.freeze(['Acid', 'Cold', 'Fire', 'Lightning', 'Poison']),
  Forbiddance: Object.freeze(['Radiant', 'Necrotic']),
});

/** Caster picks the damage type for a choice-based spell; resolves null on cancel. */
async function chooseSpellDamageType(item) {
  const allowed = SPELL_DAMAGE_TYPE_CHOICES[item.name] || [];
  const select = document.createElement('select');
  select.className = 'sdrn-spell-slot-select';
  for (const type of allowed) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.append(option);
  }
  const result = await LoomDialog.wait({
    window: { title: `${window.Loom?.i18n?.localize?.('SDR5E.Spell.DamageTypeChoose') || 'Choose damage type'} — ${item.name}` },
    content: select,
    buttons: [
      { action: 'cancel', label: localizeSpell('Cancel'), variant: 'ghost', callback: () => null },
      { action: 'roll', label: localizeSpell('Cast'), variant: 'primary', callback: () => select.value },
    ],
  });
  return result || null;
}

// Fallback only: slot level of the latest cast per actor+spell in this client. The primary source
// is the cast card's persisted `castSlotLevel` flag (passed as options.castAtLevel by the damage button).
const lastSpellCastSlotLevel = new Map();

function localizeSpellDamage(key, fallback) {
  const text = window.Loom?.i18n?.localize?.(`SDR5E.Spell.${key}`);
  return text && text !== `SDR5E.Spell.${key}` ? text : fallback;
}

/**
 * Slot level a spell's damage or stress roll uses. The card's persisted castSlotLevel wins. A card
 * without one (a legacy card, options.fromCard) uses the spell's base level and warns that upcast
 * damage cannot be recovered for it. Non-card calls keep the in-session cast level as before.
 */
function resolveSpellSlotLevel(actor, item, options = {}) {
  const idata = item.system || item.data || {};
  const persistedLevel = options.castAtLevel === undefined || options.castAtLevel === null || options.castAtLevel === ''
    ? NaN : Number(options.castAtLevel);
  if (Number.isFinite(persistedLevel) && persistedLevel >= 0) return persistedLevel;
  const baseLevel = Number(idata.spellLevel) || 0;
  if (options.fromCard === true) {
    window.Loom?.showToast?.(localizeSpellDamage('LegacyCardNoUpcast',
      'This card has no stored cast level: the spell base level is used and upcast damage cannot be recovered for it.'), 'warning');
    return baseLevel;
  }
  return lastSpellCastSlotLevel.get(`${actor.id}:${item.id}`) ?? baseLevel;
}

function scaleSpellDamageTerm(term, steps) {
  if (!term || steps <= 0) return '';
  const dice = term.match(/^(\d*)d(\d+)$/i);
  if (dice) return `${(Number(dice[1]) || 1) * steps}d${dice[2]}`;
  if (/^\d+$/.test(term)) return String(Number(term) * steps);
  return '';
}

/**
 * Damage formula for a cast. Cantrips: the highest scalingByCharacterLevel tier at or below
 * characterLevel replaces the base formula. Spells: scaling.perLevel is added once per
 * atSlotLevel step above scaling.fromLevel (SRD "Using a Higher-Level Spell Slot").
 */
function scaleSpellDamageFormula(formula, scaling, slotLevel) {
  const fromLevel = Number(scaling?.fromLevel);
  const step = Math.max(1, Number(scaling?.atSlotLevel) || 1);
  if (!scaling?.perLevel || !Number.isFinite(fromLevel) || !(slotLevel > fromLevel)) return formula;
  const extra = scaleSpellDamageTerm(String(scaling.perLevel).replace(/\s+/g, ''), Math.floor((slotLevel - fromLevel) / step));
  return extra ? `${formula}+${extra}` : formula;
}

export function resolveSpellDamageFormula(idata, { characterLevel = 1, slotLevel = 0 } = {}) {
  const damage = idata?.damage || {};
  // Multi-component spells (e.g. Ice Knife piercing + cold): each component carries its own SRD
  // increment; the cast total is the sum of the scaled components.
  const components = (Array.isArray(damage.components) ? damage.components : []).filter((c) => c?.formula);
  if (components.length) {
    return components.map((c) => scaleSpellDamageFormula(String(c.formula), c.scaling, slotLevel)).join('+');
  }
  let formula = String(damage.formula || '');
  if (!formula) return '';
  const tier = (Array.isArray(damage.scalingByCharacterLevel) ? damage.scalingByCharacterLevel : [])
    .filter((entry) => entry?.formula && Number(entry.level) <= characterLevel)
    .sort((a, b) => Number(a.level) - Number(b.level))
    .pop();
  if (tier) formula = String(tier.formula);
  const scaling = damage.scaling;
  const fromLevel = Number(scaling?.fromLevel);
  const step = Math.max(1, Number(scaling?.atSlotLevel) || 1);
  if (scaling?.perLevel && Number.isFinite(fromLevel) && slotLevel > fromLevel) {
    const extra = scaleSpellDamageTerm(String(scaling.perLevel).replace(/\s+/g, ''), Math.floor((slotLevel - fromLevel) / step));
    if (extra) formula = `${formula}+${extra}`;
  }
  return formula;
}

function hasSpellDamageComponents(idata) {
  return (Array.isArray(idata?.damage?.components) ? idata.damage.components : []).some((c) => c?.formula);
}

/**
 * Per-component damage for a multi-type spell (SRD 5.2, e.g. Flame Strike fire + radiant, Ice Knife
 * piercing + cold). Each component keeps its own type and its scaled, critical-adjusted formula.
 */
function resolveSpellDamageComponents(idata, { slotLevel = 0, critical = false } = {}) {
  return idata.damage.components.filter((c) => c?.formula).map((c) => ({
    type: String(c.type || ''),
    formula: damageRollFormula(scaleSpellDamageFormula(String(c.formula), c.scaling, slotLevel), critical),
  }));
}

/**
 * Splits a rolled multi-type spell total into one amount per component. Dice terms are consumed in
 * formula order; each component's flat modifiers come from its own formula. Returns null when the rolled
 * terms do not match the component formulas or do not add up to the total, so no guessed split is applied.
 */
export function splitSpellDamageComponents(components, terms, total) {
  if (!Array.isArray(components) || !components.length) return null;
  const diceTerms = (Array.isArray(terms) ? terms : []).filter((term) => term?.kind === 'dice');
  let diceIndex = 0;
  let rawSum = 0;
  const amounts = [];
  for (const component of components) {
    const compact = String(component?.formula || '').replace(/\s+/g, '');
    const tokens = [...compact.matchAll(/[+-]?(?:\d*d\d+|\d+)/gi)].map((match) => match[0]);
    if (!tokens.length || tokens.join('') !== compact) return null;
    let amount = 0;
    for (const token of tokens) {
      const sign = token.startsWith('-') ? -1 : 1;
      const body = token.replace(/^[+-]/, '');
      const die = body.match(/^(\d*)d(\d+)$/i);
      if (!die) { amount += sign * Number(body); continue; }
      const term = diceTerms[diceIndex++];
      if (!term || Number(term.faces) !== Number(die[2])) return null;
      const rolls = Array.isArray(term.rolls) ? term.rolls.map(Number) : [];
      const dropped = Array.isArray(term.dropped) ? term.dropped : [];
      amount += sign * rolls.reduce((sum, value, index) => (dropped[index] ? sum : sum + value), 0);
    }
    rawSum += amount;
    amounts.push({ type: String(component.type || ''), amount: Math.max(0, amount) });
  }
  if (diceIndex !== diceTerms.length || rawSum !== Number(total)) return null;
  return amounts;
}

/**
 * Applies a multi-type spell's components one by one through the same Resistance/Vulnerability/Immunity
 * and damage-threshold pipeline. Half on save is applied to each component (SRD: "half as much damage").
 * Returns the summed HP loss and a per-type label, or null for single-type spells (legacy path).
 */
function resolveComponentDamageOutcome(components, traits, threshold, halfOnSave) {
  if (!Array.isArray(components) || !components.length) return null;
  let amount = 0;
  const parts = [];
  for (const component of components) {
    const type = String(component?.type || '');
    const raw = Math.max(0, Math.floor(Number(component?.amount) || 0));
    const dealt = halfOnSave ? Math.floor(raw / 2) : raw;
    const thresholdResult = applyDamageThreshold(dealt, threshold);
    const traitResult = thresholdResult.blocked ? { amount: 0, label: '' } : applyDamageTraits(thresholdResult.amount, traits, type);
    const label = thresholdResult.blocked ? `below damage threshold (${thresholdResult.threshold})` : traitResult.label;
    amount += traitResult.amount;
    parts.push(`${type || 'untyped'} ${traitResult.amount}${label ? ` ${label}` : ''}`);
  }
  return { amount, label: parts.join(' / ') };
}

export async function rollSpellDamage(actor, item, options = {}) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const characterLevel = Number(actor.systemData?.details?.level) || 1;
  const slotLevel = resolveSpellSlotLevel(actor, item, options);
  const formula = resolveSpellDamageFormula(idata, { characterLevel, slotLevel });
  if (!formula) {
    globalThis.Loom?.showToast?.(`No damage formula configured for ${item.name || 'this spell'}.`, 'info');
    return null;
  }
  // Multi-type spells carry one type per component (Flame Strike: fire + radiant); the single
  // top-level damage.type is only the first component and is not used for them.
  const multiType = hasSpellDamageComponents(idata);
  let type = multiType ? '' : (idata.damage?.type || '');
  if (!multiType && !type && SPELL_DAMAGE_TYPE_CHOICES[item.name]) {
    type = await chooseSpellDamageType(item);
    if (!type) return null;
  }
  const critical = await resolveAutomaticCritical(options, typeof options.critical === 'boolean' ? options.critical : isCriticalHeld());
  const components = multiType ? resolveSpellDamageComponents(idata, { slotLevel, critical }) : null;
  const finalFormula = components ? components.map((c) => c.formula).join('+') : damageRollFormula(formula, critical);
  const typeSuffix = components
    ? ` (${components.map((c) => c.type).filter(Boolean).join(' + ')})`
    : (type ? ` (${type})` : '');
  window.Loom.dispatchRoll({
    formula: finalFormula,
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Spell Damage: ${item.name}${critical ? ' (Critical!)' : ''}${typeSuffix}`, srd5eDamage: {
      type, critical,
      ...(components ? { components } : {}),
      ...(options.targetBound === true && options.targetId ? { targetBound: true, targetId: String(options.targetId) } : {}),
    } },
  });
  return { pending: true, formula: finalFormula };
}

/**
 * Rolls one of a spell's triggered damage entries (damage.triggered[index]) as its own roll, separate
 * from the cast and from the main damage button (e.g. Wall of Ice passage damage). The slot level scales
 * the entry like the main damage (scaling.perLevel per atSlotLevel above fromLevel). An entry with
 * addSpellcastingModifier adds the caster's spellcasting ability modifier at roll time (SRD Grasping Hand);
 * that is a flag on the entry, never part of its stored formula.
 */
export async function rollSpellTriggeredDamage(actor, item, index, options = {}) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const entries = Array.isArray(idata.damage?.triggered) ? idata.damage.triggered : [];
  const entry = entries[Number(index)];
  if (!entry?.formula) {
    globalThis.Loom?.showToast?.(`No triggered damage configured for ${item.name || 'this spell'}.`, 'info');
    return null;
  }
  const slotLevel = resolveSpellSlotLevel(actor, item, options);
  let formula = scaleSpellDamageFormula(String(entry.formula), entry.scaling, slotLevel);
  let modifierNote = '';
  if (entry.addSpellcastingModifier === true) {
    const sd = actor.systemData || {};
    const { ability } = spellcastingStats(sd, idata, actor.items || []);
    const abilityData = sd.abilities?.[ability] || {};
    const modifier = Number.isFinite(Number(abilityData.modifier))
      ? Number(abilityData.modifier) : Math.floor(((Number(abilityData.value) || 10) - 10) / 2);
    if (modifier) formula = `${formula}${modifier > 0 ? '+' : ''}${modifier}`;
    modifierNote = ' + spellcasting modifier';
  }
  const type = String(entry.type || '');
  const finalFormula = damageRollFormula(formula, false);
  window.Loom.dispatchRoll({
    formula: finalFormula,
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Triggered Damage: ${item.name} — ${entry.label || 'effect'}${modifierNote}${type ? ` (${type})` : ''}`, srd5eDamage: {
      type, critical: false,
      ...(options.targetBound === true && options.targetId ? { targetBound: true, targetId: String(options.targetId) } : {}),
    } },
  });
  return { pending: true, formula: finalFormula };
}

/**
 * Optional Wish stress roll from the Wish chat card (damage.stress on the spell). The stress formula is
 * multiplied per spell level (1d10 Necrotic per level of the cast). It is never run automatically: the
 * card draws the button only, and this roll happens only when the button is clicked.
 */
export async function rollWishStress(actor, item, options = {}) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const stress = idata.damage?.stress;
  if (!stress?.formula) {
    globalThis.Loom?.showToast?.(`No stress configured for ${item.name || 'this spell'}.`, 'info');
    return null;
  }
  const slotLevel = resolveSpellSlotLevel(actor, item, options);
  const formula = scaleSpellDamageTerm(String(stress.formula).replace(/\s+/g, ''), slotLevel);
  if (!formula) {
    globalThis.Loom?.showToast?.(`No stress to roll at level ${slotLevel}.`, 'info');
    return null;
  }
  const type = String(stress.type || '');
  window.Loom.dispatchRoll({
    formula: damageRollFormula(formula, false),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Wish Stress: ${item.name} (level ${slotLevel})${type ? ` (${type})` : ''}`, srd5eDamage: {
      type, critical: false,
    } },
  });
  return { pending: true, formula };
}

/**
 * Casts a spell: consumes a slot at its level (cantrips are free/unlimited —
 * SRD rule), posts a chat card with the spell's stat block (DC/attack/
 * concentration), and rolls the save DC as informational text (the target
 * makes the actual save, not the caster — no auto-apply). Level-up slots
 * ("cast at a higher level") aren't modeled yet — always consumes at the
 * spell's own level.
 */
export const SPELL_HEALING_PRESETS = Object.freeze({
  'Cure Wounds': { formula: '2d8', scaling: { perLevel: '2d8', fromLevel: 1 }, addAbility: true },
  'Healing Word': { formula: '2d4', scaling: { perLevel: '2d4', fromLevel: 1 }, addAbility: true },
  'Mass Cure Wounds': { formula: '5d8', scaling: { perLevel: '1d8', fromLevel: 5 }, addAbility: true },
  'Mass Healing Word': { formula: '2d4', scaling: { perLevel: '1d4', fromLevel: 3 }, addAbility: true },
  'Prayer of Healing': { formula: '2d8', scaling: { perLevel: '1d8', fromLevel: 2 }, addAbility: true },
  'Heal': { fixed: 70, scalingFixed: 10, fromLevel: 6 },
  'Power Word Heal': { fixed: 700 },
});

export function resolveSpellHealingFormula(idata = {}, { slotLevel = 1, abilityMod = 0 } = {}) {
  const name = idata.name || '';
  const preset = SPELL_HEALING_PRESETS[name] || (idata.identifier ? SPELL_HEALING_PRESETS[idata.identifier] : null);
  if (idata.healing?.formula) {
    let f = idata.healing.formula;
    if (idata.healing.scaling && slotLevel > (idata.healing.scaling.fromLevel ?? 1)) {
      const extra = slotLevel - (idata.healing.scaling.fromLevel ?? 1);
      f = `${f} + ${extra} * (${idata.healing.scaling.perLevel})`;
    }
    return f;
  }
  if (!preset) return null;
  if (preset.fixed) {
    const extra = preset.scalingFixed ? Math.max(0, slotLevel - preset.fromLevel) * preset.scalingFixed : 0;
    return String(preset.fixed + extra);
  }
  let formula = preset.formula;
  if (preset.scaling && slotLevel > preset.scaling.fromLevel) {
    const extraLevels = slotLevel - preset.scaling.fromLevel;
    const extraMatch = preset.scaling.perLevel.match(/^(\d+)d(\d+)$/);
    const baseMatch = formula.match(/^(\d+)d(\d+)$/);
    if (extraMatch && baseMatch && extraMatch[2] === baseMatch[2]) {
      const totalDice = Number(baseMatch[1]) + (Number(extraMatch[1]) * extraLevels);
      formula = `${totalDice}d${baseMatch[2]}`;
    } else {
      formula = `${formula} + ${extraLevels} * (${preset.scaling.perLevel})`;
    }
  }
  if (preset.addAbility && abilityMod) {
    formula = `${formula} ${abilityMod > 0 ? '+' : '-'} ${Math.abs(abilityMod)}`;
  }
  return formula;
}

export function isSpellAttackItem(idata = {}) {
  const at = String(idata.actionType || '').toLowerCase();
  if (at === 'rsak' || at === 'msak') return true;
  return /spell attack/i.test(idata.description || '');
}

export function isSpellHealingItem(idata = {}, name = '') {
  if (idata.healing?.formula) return true;
  if (name && SPELL_HEALING_PRESETS[name]) return true;
  if (idata.identifier && SPELL_HEALING_PRESETS[idata.identifier]) return true;
  return /regains?\s+(?:a number of\s+)?hit points/i.test(idata.description || '');
}

export function getSpellSaveInfo(idata = {}, spellStats = {}) {
  const dc = spellStats?.dc ?? 10;
  let ability = (idata.save?.type && idata.save.type !== 'none') ? idata.save.type.toLowerCase() : null;
  if (!ability && idata.saveAbility) {
    ability = String(idata.saveAbility).toLowerCase();
  }
  if (!ability && idata.description) {
    const m = idata.description.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
    if (m) {
      const map = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
      ability = map[m[1].toLowerCase()] || null;
    }
  }
  if (!ability) return null;
  const isHalfOnSave = /half as much damage on a successful/i.test(idata.description || '')
    || idata.save?.effect === 'half';
  return { dc, ability, isHalfOnSave };
}

export async function rollSpellHealing(actor, item, options = {}) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const slotLevel = resolveSpellSlotLevel(actor, item, options);
  const sd = actor.systemData || {};
  const spellStats = spellcastingStats(sd, idata, actor.items || []);
  const abilityData = sd.abilities?.[spellStats.ability] || {};
  const abilityMod = Number.isFinite(Number(abilityData.modifier))
    ? Number(abilityData.modifier)
    : Math.floor(((Number(abilityData.value) || 10) - 10) / 2);
  const formula = resolveSpellHealingFormula({ ...idata, name: item.name }, { slotLevel, abilityMod });
  if (!formula) {
    globalThis.Loom?.showToast?.(`No healing formula configured for ${item.name || 'this spell'}.`, 'info');
    return null;
  }
  const targets = window.Loom?.user?.targets || [];
  const boundTargetId = options.targetId || (targets.length === 1 ? (targets[0].castId || targets[0].id) : '');
  window.Loom.dispatchRoll({
    formula,
    actorId: actor.id,
    mode: 'public',
    meta: {
      label: `Healing: ${item.name}`,
      srd5eHeal: {
        targetBound: !!boundTargetId,
        ...(boundTargetId ? { targetId: String(boundTargetId) } : {}),
      },
    },
  });
  return { pending: true, formula };
}

export async function rollActorSave(record, ability, dc, targetName = '') {
  const sd = record.systemData || {};
  const save = sd.saves?.[ability];
  const mod = Number(save?.total ?? sd.abilities?.[ability]?.modifier ?? 0);
  const name = targetName || record.name || 'Target';
  const ablLabel = ABILITY_LABELS[ability] || ability.toUpperCase();
  const formula = mod !== 0 ? `1d20 ${mod > 0 ? '+' : '-'} ${Math.abs(mod)}` : '1d20';
  return window.Loom.dispatchRoll({
    formula,
    actorId: record.id,
    mode: 'public',
    meta: {
      label: `${name} \u2014 Save: ${ablLabel}`,
      srd5eSave: { ability, dc },
      dc,
    },
  });
}

export async function rollSpellSave(ability, dc) {
  const targets = window.Loom?.user?.targets || [];
  if (!targets.length) {
    const char = window.Loom?.user?.character;
    if (char) {
      return rollActorSave(char, ability, dc);
    }
    window.Loom?.showToast?.('Select target tokens to roll saving throw.', 'info');
    return null;
  }
  for (const t of targets) {
    const castId = typeof t === 'string' ? t : t?.id;
    if (!castId) continue;
    try {
      const cast = await window.Loom.api.get(`/cast/${castId}`);
      if (!cast) continue;
      const isLinked = cast.isLinked === true;
      const record = isLinked && cast.actorId ? await window.Loom.api.get(`/actors/${cast.actorId}`) : cast;
      if (!record) continue;
      await rollActorSave(record, ability, dc, cast.name || record.name);
    } catch (e) {
      console.error('[srd5e] rollSpellSave failed for cast:', e);
    }
  }
}

export async function castSpell(actor, item, options = {}) {
  if (!actor || !item) return null;
  const sd = actor.systemData;
  const idata = item.system || item.data || {};
  if (!canCastSpellsDuringRage(actor.items || [])) {
    globalThis.Loom?.showToast?.(localizeClassFeature('RageCannotCastSpells'), 'warning');
    return null;
  }
  const level = idata.spellLevel ?? 0;
  const wizardLevel = Math.max(0, ...(actor.items || []).filter((entry) => entry.type === 'class'
    && (entry.system || entry.data || {}).classIdentifier === 'wizard')
    .map((entry) => Number((entry.system || entry.data || {}).levels) || 0));
  const spellMasteryFeature = wizardLevel >= 18 ? (actor.items || []).find((entry) => entry.type === 'feature'
    && (entry.system || entry.data || {}).classIdentifier === 'wizard'
    && (entry.system || entry.data || {}).identifier === 'spell-mastery') : null;
  const spellMasteryData = spellMasteryFeature?.system || spellMasteryFeature?.data || {};
  const spellMasteryIds = [spellMasteryData.levelOneSpellId, spellMasteryData.levelTwoSpellId].filter(Boolean).map(String);
  const isSpellMasterySpell = spellMasteryIds.includes(String(item.id)) && Number(level) > 0;
  const signatureFeature = wizardLevel >= 20 ? (actor.items || []).find((entry) => entry.type === 'feature'
    && (entry.system || entry.data || {}).classIdentifier === 'wizard'
    && (entry.system || entry.data || {}).identifier === 'signature-spells') : null;
  const signatureData = signatureFeature?.system || signatureFeature?.data || {};
  const isSignatureSpell = Number(level) === 3 && canUseWizardSignatureSpell(signatureData, item.id);
  const castModes = wizardSpellCastOptions({ ...idata, ...((isSpellMasterySpell || isSignatureSpell) ? { prepared: true } : {}) }, wizardLevel);
  if (options.ritual === true && !castModes.canCastAsRitual) {
    globalThis.Loom?.showToast?.(localizeSpell('WizardRitualUnavailable'), 'warning');
    return null;
  }
  if (options.ritual !== true && !castModes.canCastNormally) {
    globalThis.Loom?.showToast?.(localizeSpell('WizardSpellNotPrepared'), 'warning');
    return null;
  }
  const isMysticArcanum = Number(idata.mysticArcanumCircle) > 0
    && Number(idata.mysticArcanumCircle) === Number(level)
    && idata.sourceClassIdentifier === 'warlock';
  const spellStats = spellcastingStats(sd, idata, actor.items || []);

  if (sd.attributes?.armor?.canCastSpells === false) {
    globalThis.Loom?.showToast?.('Wearing armor you are not proficient with — you can\'t cast spells.', 'warning');
    return null;
  }

  // SRD (Spellcasting, "Rituals"): magia ritual preparada não gasta slot
  // (leva 10min a mais, não rastreado aqui — narrativo). Simplificação
  // assumida: usa a regra geral (precisa `prepared: true`), não replica a
  // exceção do Wizard (ritual direto do grimório sem preparar).
  const isFreeRitual = options.ritual === true && castModes.canCastAsRitual;
  const isFreeScroll = !!options.free;
  if (Number(idata.mysticArcanumCircle) > 0 && !isMysticArcanum) {
    globalThis.Loom?.showToast?.(localizeSpell('MysticArcanumInvalid'), 'warning');
    return null;
  }
  if (isMysticArcanum && (Number(idata.uses?.value) || 0) <= 0) {
    globalThis.Loom?.showToast?.(localizeSpell('NoEligibleSlots'), 'warning');
    return null;
  }
  let featureFreeCast = false;
  let featureFreeCastSource = item;
  let signatureFreeCast = false;
  let wizardSpellMasteryFreeCast = false;
  let selectedSlot = null;
  let spellSlotTurn = null;
  let spellSlotTurnOverride = false;

  const hasAvailableSlot = Object.entries(sd.resources?.spellSlots || {}).some(([slotLevel, slot]) => Number(slotLevel) >= level && (Number(slot?.value) || 0) > 0)
    || (sd.resources?.pactMagic && !sd.resources.pactMagic.needsReview
      && Number(sd.resources.pactMagic.spellLevel) >= level && (Number(sd.resources.pactMagic.value) || 0) > 0);
  const isRangerFavoredEnemySpell = String(item.name || '').trim().toLocaleLowerCase() === "hunter's mark"
    && Array.isArray(idata.classes) && idata.classes.includes('ranger');
  const rangerFeature = isRangerFavoredEnemySpell
    ? (actor.items || []).find((entry) => entry.type === 'feature'
      && (entry.system || entry.data || {}).classIdentifier === 'ranger'
      && (entry.system || entry.data || {}).identifier === 'favored-enemy')
    : null;
  const rangerFeatureUses = rangerFeature?.system?.uses || rangerFeature?.data?.uses;
  const hasRangerFavoredEnemyUses = Number(rangerFeatureUses?.max) > 0 && Number(rangerFeatureUses?.value) > 0;
  const hasMagicInitiateUses = !!idata.magicInitiate?.freeCast && (Number(idata.uses?.value) || 0) > 0;
  if (level > 0 && (hasMagicInitiateUses || hasRangerFavoredEnemyUses) && !isFreeScroll && !isFreeRitual) {
    const freeLabel = hasRangerFavoredEnemyUses ? 'RangerFavoredEnemyFreeCast' : 'MagicInitiateFreeCast';
    if (hasRangerFavoredEnemyUses) featureFreeCastSource = rangerFeature;
    if (!hasAvailableSlot) featureFreeCast = true;
    else {
      const castMode = await chooseFeatureSpellCastMode(item, freeLabel);
      if (!castMode) return null;
      featureFreeCast = castMode === 'free';
    }
  }

  if (level > 0 && !isFreeScroll && !isFreeRitual && !featureFreeCast
    && !options.castAtLevel && (isSpellMasterySpell || isSignatureSpell)) {
    const canUseSlot = hasAvailableSlot;
    if (!canUseSlot) {
      featureFreeCast = true;
      signatureFreeCast = isSignatureSpell;
      wizardSpellMasteryFreeCast = isSpellMasterySpell;
    } else {
      const mode = await chooseFeatureSpellCastMode(item, isSpellMasterySpell ? 'WizardSpellMasteryCastFree' : 'WizardSignatureSpellCastFree');
      if (!mode) return null;
      if (mode === 'free') {
        featureFreeCast = true;
        signatureFreeCast = isSignatureSpell;
        wizardSpellMasteryFreeCast = isSpellMasterySpell;
      }
    }
  }

  if (level > 0 && !isMysticArcanum && !isFreeRitual && !isFreeScroll && !featureFreeCast) {
    selectedSlot = options.slotPool && options.castAtLevel
      ? { pool: options.slotPool, level: Number(options.castAtLevel) }
      : await chooseSpellSlot(actor, item, level);
    if (!selectedSlot) return null;
    const available = selectedSlot.pool === 'pact'
      ? sd.resources?.pactMagic?.value
      : sd.resources?.spellSlots?.[selectedSlot.level]?.value;
    if (selectedSlot.level < level || (Number(available) || 0) <= 0) {
      globalThis.Loom?.showToast?.(localizeSpell('NoEligibleSlots'), 'warning');
      return null;
    }
    spellSlotTurn = activeSpellSlotTurn(window.Loom?.combat);
    if (spellSlotTurn && sameSpellSlotTurn(sd.resources?.spellSlotTurnSpent, spellSlotTurn)) {
      if (!window.Loom?.user?.isGM) {
        globalThis.Loom?.showToast?.(localizeSpell('OneSpellSlotPerTurnBlocked'), 'warning');
        return null;
      }
      const message = document.createElement('p');
      message.textContent = localizeSpell('OneSpellSlotPerTurnOverridePrompt');
      const confirmed = await LoomDialog.wait({
        window: { title: localizeSpell('OneSpellSlotPerTurnTitle') },
        content: message,
        buttons: [
          { action: 'cancel', label: localizeSpell('Cancel'), variant: 'ghost', callback: () => false },
          { action: 'override', label: localizeSpell('OneSpellSlotPerTurnOverride'), variant: 'primary', callback: () => true },
        ],
      });
      if (confirmed !== true) return null;
      spellSlotTurnOverride = true;
    }
  }

  // Validate the complete cast before spending any use or slot.
  if (isFreeScroll || (featureFreeCast && !signatureFreeCast && !wizardSpellMasteryFreeCast) || isMysticArcanum) {
    const usable = await consumeUse(actor, featureFreeCast ? featureFreeCastSource : item);
    if (!usable) return null;
  }
  if (signatureFreeCast && signatureFeature?.id) {
    const latestUses = signatureData.signatureSpellUses || {};
    if (!canUseWizardSignatureSpell({ ...signatureData, signatureSpellUses: latestUses }, item.id)) {
      globalThis.Loom?.showToast?.(localizeSpell('NoEligibleSlots'), 'warning');
      return null;
    }
    await window.Loom.api.put(`/items/${signatureFeature.id}`, { data: {
      ...signatureData,
      signatureSpellUses: { ...latestUses, [String(item.id)]: 1 },
    } });
  }
  if (selectedSlot) {
    const path = selectedSlot.pool === 'pact'
      ? 'system.resources.pactMagic.value'
      : `system.resources.spellSlots.${selectedSlot.level}.value`;
    const current = selectedSlot.pool === 'pact'
      ? Number(sd.resources.pactMagic.value) || 0
      : Number(sd.resources.spellSlots?.[selectedSlot.level]?.value) || 0;
    const turnRecord = spellSlotTurn ? spellSlotTurnSpendRecord(spellSlotTurn, {
      spellId: item.id, overridden: spellSlotTurnOverride, userId: window.Loom?.user?.id,
    }) : null;
    await actor.update({
      [path]: current - 1,
      ...(turnRecord ? { 'system.resources.spellSlotTurnSpent': turnRecord } : {}),
    });
  }

  // Concentration + a mechanical effect (Passo 4 — see schema.mjs's note on
  // `durationRounds`/`bonuses` on the spell item): applies the effect for
  // `durationRounds` rounds and remembers which spell it came from so a
  // failed concentration save (rollConcentrationSave) can find and remove
  // it. Every other spell (durationRounds === 0, i.e. every spell until a
  // GM fills those fields in) is unaffected — same as before this existed.
  if (idata.concentration) {
    const previousOrigin = sd.resources?.concentratingOn;
    if (previousOrigin) await removeItemEffects({ id: previousOrigin });
    const changes = bonusesToChanges(idata.bonuses);
    if (changes.length && Number(idata.durationRounds) > 0) {
      await applyTemporaryEffect(actor, { changes, duration: Number(idata.durationRounds), origin: item.id, label: `${item.name} (Concentration)` });
    }
    await actor.update({
      'system.resources.concentrating': true,
      'system.resources.concentratingOn': item.id,
      'system.resources.concentrationId': createCombatEffectOperationId('concentration'),
      'system.resources.concentrationSaveAttemptId': '',
      'system.resources.concentrationSaveAttemptIds': [],
    });
  }

  // Apply Active Effects declared on the spell (Loom.effects.apply native architecture)
  if (Array.isArray(idata.effects) && idata.effects.length) {
    const targetCastId = options.targetCastId || window.Loom?.canvas?.activeTarget?.id || null;
    const targetActorId = targetCastId ? null : (options.targetActorId || (String(idata.range || '').toLowerCase() === 'self' ? actor.id : null));
    await applySpellOrItemEffects(actor, item, { targetCastId, targetActorId });
  }

  const castKey = `${actor.id}:${item.id}`;
  if (selectedSlot) lastSpellCastSlotLevel.set(castKey, Number(selectedSlot.level));
  else lastSpellCastSlotLevel.delete(castKey);

  const dc = spellStats.dc;
  const attack = spellStats.attackBonus;
  const parts = [`Level ${level === 0 ? 'Cantrip' : level}`];
  if (selectedSlot) parts.push(`${selectedSlot.pool === 'pact' ? localizeSpell('PactMagic') : localizeSpell('Spellcasting')} slot level ${selectedSlot.level}`);
  if (idata.concentration) parts.push('Concentration');
  if (isFreeRitual) parts.push(localizeSpell('RitualCastNotice'));
  parts.push(`Save DC ${dc}`, `Attack ${attack >= 0 ? '+' : ''}${attack}`);

  return window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
    content: `Casts ${item.name}`,
    flags: {
      srd5e: {
        name: `${actor.name} — Casts ${item.name}`,
        isSpellCast: true,
        actorId: actor.id,
        itemId: item.id,
        // Slot level spent by this cast, persisted on the card so the damage roll survives a reload
        // or a roll from another client. Free casts store the spell's own level (no upcast).
        castSlotLevel: selectedSlot ? Number(selectedSlot.level) : Number(level) || 0,

        saveDC: saveInfo?.dc ?? dc,

        saveAbility: saveInfo?.ability ?? '',

        isHalfOnSave: saveInfo?.isHalfOnSave ?? false,

        hasAttack: isSpellAttackItem(idata),

        hasDamage: !!(idata.damage?.formula || (Array.isArray(idata.damage?.parts) && idata.damage.parts.length)),

        hasHealing: isSpellHealingItem(idata, item.name),
        ...(spellSlotTurnOverride ? { spellSlotTurnOverride: {
          combatId: spellSlotTurn.combatId, round: spellSlotTurn.round, castId: spellSlotTurn.castId,
          userId: String(window.Loom?.user?.id || ''), spellId: String(item.id),
        } } : {}),
        hasDamage: !!idata.damage?.formula,
        // Optional stress button (Wish): the card draws it only when the spell defines damage.stress.
        hasWishStress: !!idata.damage?.stress?.formula,
        // Labels of the spell's triggered damage entries; the card draws one button per index.
        triggeredDamage: (Array.isArray(idata.damage?.triggered) ? idata.damage.triggered : []).map((entry) => String(entry?.label || '')),
        description: `<div>${parts.join(' &middot; ')}</div>${idata.description ? `<div style="margin-top:4px;font-style:italic">${idata.description}</div>` : ''}`,
      },
    },
  });
}

export async function toggleInspiration(actor) {
  if (!actor) return null;
  const current = !!actor.systemData?.resources?.inspiration;
  return actor.update({ 'system.resources.inspiration': !current });
}

export async function setExhaustion(actor, level) {
  if (!actor) return null;
  const clamped = Math.max(0, Math.min(6, Number(level) || 0));
  const current = actor.systemData?.resources?.exhaustion ?? 0;
  // Clicking the already-active top level clears it back to 0 (same toggle
  // pattern as the death-save pips / real dnd5e's exhaustion track).
  const next = Math.max(0, clamped === current ? clamped - 1 : clamped);
  const result = await actor.update({
    'system.resources.exhaustion': next,
    ...(next === 6 ? { 'system.resources.deathState': 'dead' } : {}),
  });
  // SRD (Conditions.md, Exhaustion nível 6): "Death". Só mensagem de chat —
  // este sistema não tem estado "morto" persistente em lugar nenhum
  // (rollDeathSave também só posta "Dead" no chat, nunca seta uma flag),
  // então nível 6 segue a MESMA convenção em vez de inventar uma nova
  // (Handout 27).
  if (next === 6 && current !== 6) {
    await window.Loom.ChatMessage.create({
      speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
      content: `${actor.name} reaches Exhaustion level 6 — Death`,
      flags: { srd5e: { name: `${actor.name} — Exhaustion`, description: '<span style="color:#ef4444">Exhaustion level 6 — the character dies (SRD)</span>' } },
    });
  }
  return result;
}

/**
 * Posts an item's description as a chat card — real dnd5e has this
 * on every item (click the icon in the inventory list; the card shows name,
 * type, description and attunement/equipped/proficiency pills, e.g. "Belt
 * of Frost Giant Strength"). Nothing in SDR5E did this before — items were
 * only viewable by opening their sheet. Pure chat/UI automation, no dice.
 */
export async function postItemToChat(actor, item) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const pills = [];
  if (idata.attunement === 'required' || idata.attunement === 'attuned') {
    pills.push(idata.attunement === 'attuned' ? 'Attuned' : 'Attunement Required');
  }
  if (item.type === 'weapon' || item.type === 'armor') {
    pills.push(idata.equipped ? 'Equipped' : 'Not Equipped');
  }
  if (item.type === 'weapon') {
    pills.push(isWeaponProficient(actor.systemData, item, idata) ? 'Proficient' : 'Not Proficient');
  }
  const subtitleParts = [ITEM_TYPE_SINGULAR[item.type] || 'Item'];
  if (idata.rarity && idata.rarity !== 'common') subtitleParts.push(idata.rarity);
  // The generic chat renderer (chat-message-card.ts:136-154) only reads
  // `flags.<x>.{name,img,description}` off an info card — no `subtitle`
  // field exists, so it has to fold into `description` instead or it's
  // silently dropped (found by reading the actual renderer, not assumed).
  const subtitleHtml = `<div class="sdr5e-item-chat-subtitle">${subtitleParts.join(' — ')}</div>`;
  const description = idata.description ? `<div class="sdr5e-item-chat-desc">${idata.description}</div>` : '';
  const pillsHtml = pills.length
    ? `<div class="sdr5e-item-chat-pills">${pills.map((p) => `<span>${p}</span>`).join('')}</div>` : '';

  return window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
    content: item.name,
    flags: {
      srd5e: {
        name: item.name,
        isItemCard: true,
        description: `${subtitleHtml}${description}${pillsHtml}`,
        ...(item.type === 'weapon' ? { isWeaponCard: true, actorId: actor.id, itemId: item.id } : {}),
        ...(item.type === 'spell' ? { isSpellCast: true, actorId: actor.id, itemId: item.id, hasDamage: true } : {}),
      },
    },
  });
}

/**
 * Generic class-resource pool (Rage/Ki/Sorcery Points/Lay on Hands/Channel
 * Divinity — whatever the sheet's `resources.primary` slot is currently
 * labeled). Ported from the original system's proven, working consumption
 * logic ("Route D: Flow Modifiers (Agnostic Pools)", codex-api.mjs:651) —
 * check balance, decrement, warn if insufficient. One shared pool rather
 * than a separate named field per class: this ruleset has no class content
 * to key a per-class field off of, and in practice a character only draws
 * from one such resource at a time anyway.
 */
export async function spendClassResource(actor, cost) {
  if (!actor || !cost) return true;
  const pool = actor.systemData?.resources?.primary;
  if (!pool) return true;
  if ((pool.value ?? 0) < cost) {
    window.Loom?.showToast?.(`Not enough ${pool.label || 'Resource'}`, 'warning');
    return false;
  }
  await window.Loom.api.put(`/actors/${actor.id}`, {
    systemData: { resources: { primary: { value: Math.max(0, pool.value - cost) } } },
  });
  return true;
}

/**
 * Checks and spends one limited use off `item.uses` (shared shape on both
 * `feature` and `item` types — see schema.mjs). Items with no `uses.max`
 * (or `max` <= 0) are unlimited and always pass through. Shared by
 * `activateFeature` and `castSpell` so the "out of uses" check and the
 * decrement only exist in one place.
 */
/**
 * Fighter Action Surge / Indomitable: re-sync max uses to the actor's current
 * Fighter level before any use check, so a level-17 Fighter sees 2 Action
 * Surge uses even if the stored row was written at level 2. Other items are
 * returned unchanged.
 */
function itemWithFighterUsesSynced(actor, item) {
  const idata = item?.system || item?.data || {};
  const synced = syncedFighterFeatureUses(idata, fighterClassLevel(actor?.items || []));
  if (!synced) return item;
  const next = { ...idata, uses: synced };
  return { ...item, system: next, data: next };
}

export async function consumeUse(actor, rawItem) {
  if (!rawItem) return true;
  const item = itemWithFighterUsesSynced(actor, rawItem);
  const idata = item.system || item.data || {};
  const uses = idata.uses;
  const max = Number(uses?.max) || 0;
  if (!uses || max <= 0) return true;

  const value = Number(uses.value) || 0;
  if (value <= 0) {
    window.Loom?.showToast?.(`${item.name}: no uses remaining.`, 'warning');
    return false;
  }

  // SRD 5.2 Action Surge (Fighter 17+): one use per turn. Same turn identity
  // as the spell-slot per-turn rule; no active combat turn means no turn limit.
  const turn = idata.classIdentifier === 'fighter'
    && fighterFeatureOncePerTurn(idata.identifier, fighterClassLevel(actor?.items || []))
    ? activeSpellSlotTurn(window.Loom?.combat)
    : null;
  if (turn && sameSpellSlotTurn(uses.turnSpent, turn)) {
    window.Loom?.showToast?.(`${item.name}: already used this turn.`, 'warning');
    return false;
  }

  const turnSpent = turn ? { combatId: turn.combatId, round: turn.round, castId: turn.castId } : null;
  await window.Loom.api.put(`/items/${item.id}`, { data: { ...idata, uses: { ...uses, value: value - 1, ...(turnSpent ? { turnSpent } : {}) } } });
  return true;
}

/**
 * Start-of-turn recharge roll (monster "Recharge 5-6" abilities): 1d6, item
 * refills to `uses.max` on a roll >= `uses.recharge`. No-op for items with
 * `recharge` 0 (not a rechargeable ability) or already at full uses.
 */
export async function rollRecharge(actor, item) {
  if (!item) return null;
  const idata = item.system || item.data || {};
  const uses = idata.uses;
  const threshold = Number(uses?.recharge) || 0;
  const max = Number(uses?.max) || 0;
  if (!uses || threshold <= 0 || max <= 0) return null;
  if ((Number(uses.value) || 0) >= max) return null;

  const roll = 1 + Math.floor(Math.random() * 6);
  const success = roll >= threshold;
  if (success) {
    await window.Loom.api.put(`/items/${item.id}`, { data: { ...idata, uses: { ...uses, value: max } } });
  }

  await window.Loom.ChatMessage.create({
    speaker: actor ? window.Loom.ChatMessage.getSpeaker({ actor }) : undefined,
    content: `${item.name} Recharge: ${roll} (needs ${threshold}+)`,
    flags: { srd5e: { name: `${item.name} — Recharge`, description: `<span>${roll} vs ${threshold}+ — ${success ? 'Recharged' : 'No recharge'}</span>` } },
  });
  return { roll, success };
}

/**
 * Activates a feature that costs class-resource points (Rage, Channel
 * Divinity, etc.) — spends the cost (if any) and a limited use (if any),
 * then posts the same kind of item chat card `postItemToChat` already
 * builds for a plain "post to chat" click, so an activated feature shows
 * up the same way in the log.
 */
export async function activateFeature(actor, item) {
  if (!actor || !item) return false;
  const idata = item.system || item.data || {};
  if (item.type === 'feature' && idata.classIdentifier === 'barbarian' && idata.identifier === 'rage') {
    return toggleRage(actor, item);
  }

  const costResult = await executeFeatureResourceCosts(actor, itemWithFighterUsesSynced(actor, item), { consumeUse, spendClassResource });
  if (!costResult.valid) {
    const message = costResult.reason === 'uses-depleted'
      ? `${item.name}: no uses remaining.`
      : costResult.reason === 'resource-unavailable'
        ? `${item.name}: ${costResult.resource} pool is not configured.`
        : `Not enough ${costResult.resource}.`;
    window.Loom?.showToast?.(message, 'warning');
    return false;
  }

  // Generic "heal yourself with a class die" mechanic (Second Wind is the
  // SRD's only Fighter example, but the shape isn't Fighter-specific — any
  // future feature with the same `selfHeal: {die, addLevel}` data gets the
  // same automation for free). Same average-roll convention as spendHitDie
  // (die/2 rounded up) — dispatchRoll is fire-and-forget, see that
  // function's comment for why the mechanical amount doesn't wait on it.
  if (idata.selfHeal?.die) {
    const level = Number(actor.systemData?.details?.level) || 1;
    const bonus = idata.selfHeal.addLevel ? level : 0;
    const formula = bonus !== 0 ? `1${idata.selfHeal.die} + ${bonus}` : `1${idata.selfHeal.die}`;
    const amount = evaluateDamageFormula(formula);
    window.Loom?.dispatchRoll?.({ formula: String(amount), actorId: actor.id, mode: 'public', meta: { label: `${item.name}: ${amount}` } });
    await applyHeal(actor, amount, { label: item.name });
  }

  if (Array.isArray(idata.effects) && idata.effects.length) {
    await applySpellOrItemEffects(actor, item, { targetActorId: actor.id });
  }

  await postItemToChat(actor, item);
  return true;
}

export async function useConsumable(actor, item) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const actionCost = normalizeItemActionCost(idata.actionCost);
  const localizeItemUse = (key) => window.Loom?.i18n?.localize?.(`SDR5E.ItemUse.${key}`) || key;
  const dialogContent = document.createElement('p');
  const costLabel = localizeItemUse(ITEM_ACTION_COST_LABEL_KEYS[actionCost]);
  const dialogTitle = localizeItemUse('UseItemTitle').replace('{item}', item.name);
  dialogContent.textContent = itemActionCostNoticeKey(actionCost) === 'UnknownCostWarning'
    ? localizeItemUse('UnknownCostWarning').replace('{item}', item.name)
    : localizeItemUse('KnownCostConfirmation').replace('{item}', item.name).replace('{cost}', costLabel);
  const reminderKey = itemActionReminderKey(actionCost);
  if (reminderKey) dialogContent.textContent += ` ${localizeItemUse(reminderKey)}`;
  const confirmed = await LoomDialog.wait({
    window: { title: dialogTitle },
    content: dialogContent,
    width: 420,
    buttons: [
      { action: 'cancel', label: localizeItemUse('Cancel'), variant: 'ghost', callback: () => null },
      { action: 'confirm', label: localizeItemUse('Continue'), variant: 'primary', callback: () => true },
    ],
  });
  if (confirmed !== true) return null;
  // 1) uses
  const uses = idata.uses;
  const max = Number(uses?.max) || 0;
  if (max > 0) {
    const ok = await consumeUse(actor, item);
    if (!ok) return null;
  }
  // 2) healing
  if (idata.healing?.formula) {
    const total = idata.identifier === 'potion-of-healing'
      ? rollPotionOfHealing()
      : evaluateDamageFormula(idata.healing.formula);
    await applyHeal(actor, total);
    window.Loom.dispatchRoll({ formula: String(total), actorId: actor.id, mode: 'public', meta: { label: `Healing: ${item.name}` } });
  }
  // 3) damage
  if (idata.damage?.formula) {
    const type = idata.damage?.type || '';
    const total = evaluateDamageFormula(idata.damage.formula);
    window.Loom.dispatchRoll({ formula: String(total), actorId: actor.id, mode: 'public', meta: { label: `Damage: ${item.name}${type ? ` (${type})` : ''}`, srd5eDamage: { amount: total, type } } });
  }
  // 4) spell (scroll)
  if (idata.spell?.name) {
    const spellName = String(idata.spell.name).trim().toLowerCase();
    const spellItem = (actor.items || []).find((i) => i.type === 'spell' && String(i.name || '').toLowerCase() === spellName);
    if (spellItem) {
      await castSpell(actor, spellItem, { free: true });
    }
  }

  // Active Effects declared on consumable (potions, scrolls, wondrous items)
  if (Array.isArray(idata.effects) && idata.effects.length) {
    await applySpellOrItemEffects(actor, item, { targetActorId: actor.id });
  }

  // 5-6) quantity / destroy and post card (post before delete so card has data)
  await postItemToChat(actor, item);
  // Determine if empty: uses reached 0 or no uses at all (always consumes quantity)
  const wasMax = Number(idata.uses?.max) || 0;
  const wasValue = Number(idata.uses?.value) || 0;
  const nowValue = wasMax > 0 ? wasValue - 1 : 0;
  const isEmpty = wasMax > 0 ? nowValue <= 0 : true;
  if (isEmpty) {
    const qty = Number(idata.quantity) || 1;
    const destroyOnEmpty = !!idata.destroyOnEmpty;
    if (qty > 1) {
      const newQty = qty - 1;
      const resetUses = wasMax > 0 ? { ...idata.uses, value: wasMax } : idata.uses;
      const newData = { ...idata, quantity: newQty, ...(wasMax > 0 ? { uses: resetUses } : {}) };
      await window.Loom.api.put(`/items/${item.id}`, { data: newData });
    } else if (destroyOnEmpty) {
      await window.Loom.api.delete(`/items/${item.id}`);
    } else if (wasMax > 0) {
      // refill uses without destroying (e.g. wand with destroyOnEmpty false)
      const newData = { ...idata, uses: { ...idata.uses, value: wasMax } };
      await window.Loom.api.put(`/items/${item.id}`, { data: newData });
    }
  }
  return true;
}

const pendingHealersKitUses = new Set();

/** Record a Healer's Kit use after the GM manually confirms the SRD target requirements. */
export async function useHealersKit(actor, item) {
  if (!actor || !item) return null;
  const useKey = `${actor.id}:${item.id}`;
  if (pendingHealersKitUses.has(useKey)) return null;
  pendingHealersKitUses.add(useKey);
  try {
  const idata = item.system || item.data || {};
  const localizeItemUse = (key) => window.Loom?.i18n?.localize?.(`SDR5E.ItemUse.${key}`) || key;
  const storedMax = Number(idata.uses?.max) || 0;
  const hasStoredCount = idata.uses?.value !== null && idata.uses?.value !== undefined && Number.isInteger(Number(idata.uses.value));
  const asksForRemainingUses = storedMax !== HEALERS_KIT_USES || !hasStoredCount;
  const form = document.createElement('div');
  const targetLabel = document.createElement('label');
  targetLabel.textContent = localizeItemUse('HealersKitTarget');
  const targetInput = document.createElement('input');
  targetInput.type = 'text';
  targetInput.maxLength = 120;
  targetInput.autocomplete = 'off';
  targetLabel.append(targetInput);
  form.append(targetLabel);

  let usesInput;
  if (asksForRemainingUses) {
    const usesLabel = document.createElement('label');
    usesLabel.textContent = localizeItemUse('HealersKitRemainingUses').replace('{max}', String(HEALERS_KIT_USES));
    usesInput = document.createElement('input');
    usesInput.type = 'number';
    usesInput.min = '0';
    usesInput.max = String(HEALERS_KIT_USES);
    usesInput.step = '1';
    usesLabel.append(usesInput);
    form.append(usesLabel);
  }

  const confirmLabel = document.createElement('label');
  const prerequisiteCheckbox = document.createElement('input');
  prerequisiteCheckbox.type = 'checkbox';
  confirmLabel.append(prerequisiteCheckbox, document.createTextNode(` ${localizeItemUse('HealersKitConfirmTarget')}`));
  form.append(confirmLabel);
  const note = document.createElement('p');
  note.textContent = localizeItemUse('HealersKitManualNote');
  form.append(note);

  const confirmation = await LoomDialog.wait({
    window: { title: `${localizeItemUse('HealersKitTitle')} — ${item.name}` },
    content: form,
    width: 440,
    buttons: [
      { action: 'cancel', label: localizeItemUse('Cancel'), variant: 'ghost', callback: () => null },
      {
        action: 'confirm', label: localizeItemUse('Continue'), variant: 'primary',
        callback: () => ({
          targetName: targetInput.value.trim(),
          confirmedUnconsciousAtZeroHp: prerequisiteCheckbox.checked,
          remainingUses: usesInput?.value,
        }),
      },
    ],
  });
  if (!confirmation) return null;

  const plan = resolveHealersKitUse(idata, confirmation);
  if (!plan.valid) {
    const errorKey = {
      'wrong-item': 'HealersKitWrongItem',
      'action-cost-unverified': 'HealersKitCostUnverified',
      'target-required': 'HealersKitTargetRequired',
      'target-prerequisite-unconfirmed': 'HealersKitConfirmRequired',
      'remaining-uses-invalid': 'HealersKitUsesInvalid',
    }[plan.error] || 'HealersKitUsesInvalid';
    window.Loom?.showToast?.(localizeItemUse(errorKey), 'warning');
    return null;
  }

  await window.Loom.api.put(`/items/${item.id}`, { data: { ...idata, uses: plan.uses, actionCost: plan.actionCost } });
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const target = escapeHtml(plan.targetName);
  try {
    await window.Loom.ChatMessage.create({
      speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
      content: item.name,
      flags: {
        srd5e: {
          name: localizeItemUse('HealersKitTitle'),
          description: `<p>${localizeItemUse('HealersKitUseRecord').replace('{target}', target).replace('{remaining}', String(plan.remainingUses))}</p>`,
        },
      },
    });
  } catch {
    window.Loom?.showToast?.(localizeItemUse('HealersKitRecordFailed'), 'warning');
  }
  return plan;
  } finally {
    pendingHealersKitUses.delete(useKey);
  }
}
