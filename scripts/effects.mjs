// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/effects.mjs
// Component Version: 0.1.0
//
// Equivalent to the original ActiveEffectHelper/EffectAutomation, but built on
// the real Loom engine (server/applications/lib/effects.ts): buffs with
// `changes: [{key, mode, value}]` applied to systemData on the server before
// the sheet renders — there's no `ActiveEffect` document or VTT legado config UI,
// so `onRenderActiveEffectConfig`/`_showKeysList` (VTT legado-only UI) and the
// per-combat-round cleanup (`cleanupCombatEffects`, depends on a combat
// tracker — out of scope) were cut. `key` here is relative to `systemData`,
// no `system.` prefix (confirmed in effects.ts:45 — `change.key.split('.')`
// applied directly onto the systemData clone).
// ══════════════════════════════════════════════════════════════════════════

import { effects } from '/_loom/sdk/index.js';
import { planEquippedEffectSync } from './effect-sync-mechanics.mjs';

/** Safe accessor for the runtime Loom effects API facade. */
export function getEffectsApi() {
  return globalThis.Loom?.effects || effects;
}

/** Flattens the `bonuses` schema (weapon/armor/feature/item, see defaultBonuses)
 * into a list of `add`-mode `changes`, skipping zero/empty values. */
export function bonusesToChanges(bonuses) {
  if (!bonuses) return [];
  const changes = [];
  const push = (key, value) => {
    if (typeof value === 'number' && value !== 0) changes.push({ key, mode: 'add', value });
  };
  for (const [abl, v] of Object.entries(bonuses.abilities || {})) push(`abilities.${abl}.value`, v);
  for (const [abl, v] of Object.entries(bonuses.saves || {})) {
    if (abl === 'all') continue;
    push(`saves.${abl}.misc`, v);
  }
  push('attributes.da.bonus', bonuses.da);
  push('attributes.prof.bonus', bonuses.prof);
  push('attributes.initiative.bonus', bonuses.initiative);
  push('attributes.meleeBonus', bonuses.attack?.melee);
  push('attributes.rangedBonus', bonuses.attack?.ranged);
  push('resources.health.bonus', bonuses.hp);
  return changes;
}

/** Creates (or gets) the template on the item and applies it onto the actor. */
export async function applyItemEffect(actor, item) {
  const bonuses = item?.system?.bonuses ?? item?.data?.bonuses;
  const changes = bonusesToChanges(bonuses);
  if (!actor?.id || !changes.length) return null;
  const fx = getEffectsApi();

  let template = null;
  try {
    const existing = await fx.forItem(item.id);
    template = (existing || []).find((b) => !b.actorId && !b.castId);
    if (!template) {
      template = await fx.create({
        itemId: item.id,
        name: item.name,
        icon: item.imgUrl || '',
        description: item.system?.description || item.data?.description || '',
        durationUnit: 'permanent',
        duration: -1,
        changes,
        tags: ['equipment'],
      });
    }
  } catch (err) {
    console.warn(`[srd5e] Failed to ensure template for item ${item.id}:`, err);
  }

  if (template?.id && typeof fx.apply === 'function') {
    try {
      const res = await fx.apply({
        templateId: template.id,
        targetActorId: actor.id,
      });
      if (res.status === 'applied') return res.effect;
      if (res.status === 'blocked') return null;
    } catch (err) {
      console.warn(`[srd5e] Failed to apply template ${template.id} on actor ${actor.id}:`, err);
    }
  }

  // Fallback to direct buff creation if apply is unavailable or refused
  return fx.create({
    actorId: actor.id,
    itemId: item.id,
    name: item.name,
    origin: item.id,
    durationUnit: 'permanent',
    duration: -1,
    changes,
  });
}

/** Removes applied buffs originated from an item (e.g. on unequip or delete). */
export async function removeItemEffects(item, actorId = null) {
  if (!item?.id) return;
  const fx = getEffectsApi();
  const targetId = actorId || item.actorId;

  // 1. Try native Loom.effects.clear
  if (targetId && typeof fx.clear === 'function') {
    try {
      const cleared = await fx.clear({
        targetActorId: targetId,
        filter: { sourceId: item.id },
      });
      if (cleared?.ok && cleared.removed?.length) return;
    } catch {
      // Fall through to fallback
    }
  }

  // 2. Fallback: inspect forItem and delete applied copies
  try {
    const buffs = await fx.forItem(item.id);
    for (const buff of buffs || []) {
      // Only delete applied copies (those having actorId or matching target), keep template unless item has no owner
      if (buff.actorId || !targetId) {
        await fx.delete(buff.id);
      }
    }
  } catch (err) {
    console.warn(`[srd5e] Failed to remove item effects for item ${item.id}:`, err);
  }
}

/** Idempotently syncs an item's buff with its current `equipped` state. */
export async function syncEquippedEffect(item) {
  const type = item?.type;
  if (type !== 'weapon' && type !== 'armor' && type !== 'equipment') return;
  const sd = item.system ?? item.data;
  if (!sd || !item.actorId) return;

  const fx = getEffectsApi();
  let existing = [];
  try {
    const all = await fx.forItem(item.id);
    existing = (all || []).filter((b) => b.actorId === item.actorId);
  } catch {
    existing = [];
  }

  const isEquipped = !!sd.equipped;
  const changes = bonusesToChanges(sd.bonuses);
  const plan = planEquippedEffectSync({ itemId: item.id, itemName: item.name, equipped: isEquipped, changes }, existing);
  if (plan.kind === 'create') await applyItemEffect({ id: item.actorId }, item);
  else if (plan.kind === 'remove') await removeItemEffects(item, item.actorId);
  else if (plan.kind === 'update') {
    for (const update of plan.updates) await fx.update(update.id, { name: update.name, changes: update.changes });
  }
}

/** Tipos sem toggle "Equipado" — o bônus é permanente assim que o
 * personagem possui o item, então o gatilho certo é `item.created`/
 * `item.deleted`, não `item.updated`. */
const PERMANENT_BONUS_TYPES = ['feature', 'background', 'race', 'class', 'subclass', 'feat'];

/**
 * Applies a temporary, duration-based effect.
 */
export async function applyTemporaryEffect(actor, { changes, duration, origin = '', label = 'Effect' }) {
  if (!actor?.id || !changes?.length) return null;
  const fx = getEffectsApi();
  const numDuration = Number(duration) > 0 ? Number(duration) : 1;
  return fx.create({
    actorId: actor.id,
    itemId: origin,
    name: label,
    origin,
    durationUnit: 'rounds',
    duration: numDuration,
    changes,
  });
}

/** Cria o efeito de um item permanente (feature/background/raça/classe/subclasse/feat). */
export async function syncPermanentBonusEffect(item) {
  const type = item?.type;
  if (!PERMANENT_BONUS_TYPES.includes(type)) return;
  if (!item?.actorId) return;

  const fx = getEffectsApi();
  let existing = [];
  try {
    const all = await fx.forItem(item.id);
    existing = (all || []).filter((b) => b.actorId === item.actorId);
  } catch {
    existing = [];
  }
  if (existing && existing.length > 0) return;

  await applyItemEffect({ id: item.actorId }, item);
}

/** Sincroniza os templates declarados em `item.data.effects` criando os buffs de modelo (sem actorId). */
export async function syncItemEffectTemplates(item) {
  if (!item?.id) return [];
  const idata = item.system || item.data || {};
  const effectDefs = Array.isArray(idata.effects) ? idata.effects : [];
  if (!effectDefs.length) return [];

  const fx = getEffectsApi();
  let existing = [];
  try {
    existing = await fx.forItem(item.id);
  } catch {
    existing = [];
  }

  const createdOrExisting = [];
  for (const def of effectDefs) {
    const found = (existing || []).find((b) => !b.actorId && !b.castId && (b.name === def.name || (def.conditionId && b.conditionId === def.conditionId)));
    if (found) {
      createdOrExisting.push(found);
    } else {
      try {
        const buff = await fx.create({
          itemId: item.id,
          name: def.name,
          icon: def.icon || item.imgUrl || '',
          description: def.description || '',
          durationUnit: def.durationUnit || 'permanent',
          duration: typeof def.duration === 'number' ? def.duration : -1,
          expireOn: def.expireOn || 'turn-end',
          conditionId: def.conditionId || '',
          tags: Array.isArray(def.tags) ? def.tags : [],
          removeOnCombatEnd: !!def.removeOnCombatEnd,
          transfer: !!def.transfer,
          changes: Array.isArray(def.changes) ? def.changes : [],
          visual: def.visual || {},
        });
        createdOrExisting.push(buff);
      } catch (err) {
        console.warn(`[srd5e] Failed to create effect template "${def.name}" for item ${item.id}:`, err);
      }
    }
  }
  return createdOrExisting;
}

/** Aplica os templates de efeito de uma magia ou item nos alvos designados ou no conjurador. */
export async function applySpellOrItemEffects(actor, item, { targetCastId, targetActorId } = {}) {
  if (!item?.id) return [];
  const templates = await syncItemEffectTemplates(item);
  if (!templates.length) return [];

  const fx = getEffectsApi();
  const results = [];
  const targetPayload = {};
  if (targetCastId) targetPayload.targetCastId = targetCastId;
  else if (targetActorId) targetPayload.targetActorId = targetActorId;
  else if (actor?.id) targetPayload.targetActorId = actor.id;

  for (const template of templates) {
    if (template.disabled) continue;
    try {
      if (typeof fx.apply === 'function') {
        const res = await fx.apply({
          templateId: template.id,
          ...targetPayload,
        });
        results.push({ template, res });

        if (res.status === 'applied') {
          globalThis.Loom?.showToast?.(`Efeito "${template.name}" aplicado!`, 'success');
        } else if (res.status === 'pending') {
          globalThis.Loom?.showToast?.(`Efeito "${template.name}" aguardando aprovação do Mestre.`, 'info');
        } else if (res.status === 'blocked') {
          globalThis.Loom?.showToast?.(`Efeito "${template.name}" já está ativo no alvo.`, 'warning');
        } else if (res.status === 'error') {
          console.warn(`[srd5e] Error applying effect "${template.name}":`, res.error);
        }
      } else {
        const copy = await fx.create({
          actorId: targetPayload.targetActorId || actor?.id,
          itemId: item.id,
          name: template.name,
          icon: template.icon,
          origin: template.name,
          duration: template.duration,
          durationUnit: template.durationUnit,
          expireOn: template.expireOn,
          conditionId: template.conditionId,
          tags: template.tags,
          removeOnCombatEnd: template.removeOnCombatEnd,
          changes: template.changes,
          visual: template.visual,
        });
        results.push({ template, res: { status: 'applied', effect: copy } });
      }
    } catch (err) {
      console.warn(`[srd5e] Exception applying effect "${template.name}":`, err);
    }
  }
  return results;
}


