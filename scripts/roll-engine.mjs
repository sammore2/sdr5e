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
import { getSetting } from './settings.mjs';
import { bonusesToChanges, applyTemporaryEffect, removeItemEffects } from './effects.mjs';

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
    if (!worldId) return [];
    const cast = await window.Loom.api.get(`/cast?worldId=${worldId}`);
    const list = Array.isArray(cast) ? cast : [];
    const set = new Set();
    for (const c of list) {
      if (c.actorId !== actorId) continue;
      for (const m of (c.statusMarkers || [])) set.add(m);
    }
    return Array.from(set);
  } catch (e) {
    console.error('[srd5e] getActorConditions failed (roll proceeds unaffected):', e);
    return [];
  }
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
  const set = new Set();
  for (const t of targets) for (const m of (t?.statusMarkers || [])) set.add(m);
  return Array.from(set);
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
      const ac = Number(sd.attributes?.da?.value);
      if (!Number.isFinite(ac)) continue;
      out.push({ name: cast.name || record.name || 'Target', ac });
    } catch (e) {
      console.error(`[srd5e] getTargetAcInfo failed for cast ${castId}:`, e);
    }
  }
  return out;
}

/**
 * SRD 5.1: any number of advantage/disadvantage sources collapse to a
 * single yes/no each — if both end up present, roll normal. Counting
 * sources (rather than the "combine one at a time" approach the first draft
 * of this used, which produced a genuinely unreadable one-liner) makes this
 * correct by construction regardless of how many sources exist.
 */
function resolveAdvantage(advantageSources, disadvantageSources) {
  if (advantageSources > 0 && disadvantageSources > 0) return 0;
  if (advantageSources > 0) return 1;
  if (disadvantageSources > 0) return -1;
  return 0;
}

/**
 * Poisoned OR exhaustion level 1+ (classic 6-level SRD exhaustion table,
 * matching `resources.exhaustion` on the sheet — level 1 = "disadvantage on
 * ability checks"): disadvantage on ability checks (skill checks included)
 * — not attacks, not saves (those are separate below).
 */
export function applyAbilityCheckConditionModifiers(explicitMode, selfConditions, exhaustionLevel = 0, armorPenalty = false) {
  const disadvantageSources = (explicitMode === -1 ? 1 : 0)
    + (selfConditions?.includes('poisoned') ? 1 : 0)
    // SRD (Conditions.md, "Frightened"): desvantagem em ability checks
    // enquanto o marcador estiver ativo — sem checar linha de visão/fonte
    // do medo, mesma simplificação já usada em poisoned/blinded (Handout 29).
    + (selfConditions?.includes('frightened') ? 1 : 0)
    + (exhaustionLevel >= 1 ? 1 : 0)
    // SRD (Equipment/Armor.md): armadura sem proficiência dá desvantagem em
    // checks de Força/Destreza — quem chama já filtrou que a habilidade
    // deste check específico é str/dex antes de passar `true` aqui.
    + (armorPenalty ? 1 : 0);
  const advantageSources = explicitMode === 1 ? 1 : 0;
  return resolveAdvantage(advantageSources, disadvantageSources);
}

/**
 * Attack rolls. Attacker-side disadvantage: poisoned, restrained, OR prone
 * (SRD: a prone creature's own attacks have disadvantage too, not just
 * attacks against it). Target-side, checked via `window.Loom.user.targets`
 * since this is the attacker's roll reacting to the TARGET's state:
 * paralyzed/stunned/unconscious/restrained always grant advantage; prone is
 * range-dependent (melee within striking distance = advantage, ranged =
 * disadvantage instead) — `isRanged` distinguishes the two, defaulting to
 * melee (advantage) when a weapon's range type is unknown rather than
 * silently applying the wrong one.
 */
export function applyWeaponAttackConditionModifiers(explicitMode, selfConditions, isRanged = false, exhaustionLevel = 0, armorPenalty = false) {
  const targetConditions = getTargetConditions();
  const targetHasIncapacitating = ['paralyzed', 'stunned', 'unconscious', 'restrained'].some((c) => targetConditions.includes(c));
  const targetProne = targetConditions.includes('prone');
  // SRD (Conditions.md, "Blinded"/"Invisible") — o par espelhado que faltava:
  // atacante cego = desvantagem no próprio ataque, alvo cego = vantagem pra
  // quem ataca ele. Atacante invisível = vantagem no próprio ataque, alvo
  // invisível = desvantagem pra quem ataca ele.
  const selfBlinded = selfConditions?.includes('blinded');
  const selfInvisible = selfConditions?.includes('invisible');
  const targetBlinded = targetConditions.includes('blinded');
  const targetInvisible = targetConditions.includes('invisible');

  const disadvantageSources = (explicitMode === -1 ? 1 : 0)
    + (selfConditions?.includes('poisoned') ? 1 : 0)
    // SRD (Conditions.md, "Frightened"): desvantagem em attack rolls
    // enquanto o marcador estiver ativo — mesma simplificação do Passo 1
    // (Handout 29).
    + (selfConditions?.includes('frightened') ? 1 : 0)
    + (selfConditions?.includes('restrained') ? 1 : 0)
    + (selfConditions?.includes('prone') ? 1 : 0)
    + (targetProne && isRanged ? 1 : 0)
    + (selfBlinded ? 1 : 0)
    + (targetInvisible ? 1 : 0)
    // Exhaustion level 3 (classic 6-level table): disadvantage on attack rolls and saving throws.
    + (exhaustionLevel >= 3 ? 1 : 0)
    // SRD (Equipment/Armor.md): armadura sem proficiência dá desvantagem em
    // ataques de Força/Destreza — só `rollWeaponAttack` passa `true` aqui
    // (ataque de magia usa a habilidade de conjuração, nunca str/dex).
    + (armorPenalty ? 1 : 0);
  const advantageSources = (explicitMode === 1 ? 1 : 0)
    + (targetHasIncapacitating ? 1 : 0)
    + (targetProne && !isRanged ? 1 : 0)
    + (targetBlinded ? 1 : 0)
    + (selfInvisible ? 1 : 0);
  return resolveAdvantage(advantageSources, disadvantageSources);
}

// Backwards-compatible name used at existing ability/skill-check call sites.
export function applyPoisonedDisadvantage(explicitMode, conditions) {
  return applyAbilityCheckConditionModifiers(explicitMode, conditions);
}

/**
 * Saving throws: restrained imposes disadvantage on Dexterity saves
 * specifically; paralyzed/stunned/unconscious force an AUTOMATIC FAILURE on
 * Strength and Dexterity saves (SRD 5.1) — the roll never happens at all in
 * that case, matching real dnd5e-Foundry's behavior of skipping straight to
 * "fails" rather than rolling a d20 that can't matter.
 */
export function getSaveConditionOutcome(abilityKey, conditions, exhaustionLevel = 0, armorPenalty = false) {
  const isStrOrDex = abilityKey === 'str' || abilityKey === 'dex';
  const autoFail = isStrOrDex && ['paralyzed', 'stunned', 'unconscious'].some((c) => conditions?.includes(c));
  // Exhaustion level 3: disadvantage on ALL saves (unlike restrained, which is DEX-only).
  // SRD (Equipment/Armor.md): armadura sem proficiência dá desvantagem em
  // saves de Força/Destreza especificamente — por isso reaproveita `isStrOrDex`.
  const disadvantage = (abilityKey === 'dex' && conditions?.includes('restrained')) || exhaustionLevel >= 3
    || (isStrOrDex && armorPenalty);
  // SRD (Combat.md, "Cover"): +2/+5 em saves de DESTREZA especificamente —
  // três graus não se somam, só o mais protetor conta (Handout 28).
  let bonus = 0;
  if (abilityKey === 'dex') {
    if (conditions?.includes('cover-3q')) bonus = 5;
    else if (conditions?.includes('cover-half')) bonus = 2;
  }
  return { autoFail, disadvantage, bonus };
}

/**
 * Perícias: Deafened força AUTO-FALHA em Perception especificamente (SRD:
 * "automatically fails any ability check that requires hearing" — a única
 * perícia do SRD inequivocamente ligada a audição). Outras perícias não são
 * afetadas — não tem granularidade de "requer audição" no schema pra
 * generalizar sem chutar.
 */
export function getSkillConditionOutcome(skillKey, conditions) {
  const autoFail = skillKey === 'perception' && !!conditions?.includes('deafened');
  return { autoFail };
}

/**
 * Rolls 1d20 + parts/bonus, with advantage/disadvantage dialog and optional DC.
 * Handout 36 (extraMeta / targets) & Handout 37 (roll dialog + situational bonus).
 */
export async function sdr5eRoll({ label, parts = [], bonus = 0, actor, advantage = 0, dc = null, extraMeta = {} }) {
  const effectiveParts = parts.length > 0 ? parts : (bonus !== 0 ? [{ label: 'Modifier', value: Number(bonus) || 0 }] : []);
  const { showRollDialog } = await import('./roll-dialog.mjs');
  const choice = await showRollDialog({ title: label, parts: effectiveParts });
  if (!choice) return null; // cancelado

  const baseBonus = effectiveParts.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  const totalBonus = baseBonus + choice.situational;
  const die = choice.advantage === 1 ? '2d20kh1' : choice.advantage === -1 ? '2d20kl1' : '1d20';
  const formula = totalBonus !== 0 ? `${die} + ${totalBonus}` : die;

  const meta = { label, ...extraMeta };
  if (dc !== null && dc !== undefined) meta.dc = dc;
  if (choice.situational) meta.situational = choice.situational;

  window.Loom.dispatchRoll({
    formula,
    actorId: actor?.id,
    mode: choice.rollMode || 'public',
    meta,
  });
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
        const critRule = getSetting('criticalHitRule', 'doubleDice');
        if (critRule === 'maxDice') {
          for (let i = 0; i < count; i++) total += sign * ((Math.floor(Math.random() * faces) + 1) + faces);
        } else if (critRule === 'flatMax') {
          for (let i = 0; i < count; i++) total += sign * (faces * 2);
        } else {
          count *= 2;
          for (let i = 0; i < count; i++) total += sign * (Math.floor(Math.random() * faces) + 1);
        }
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
export async function applyDamageToTargets(amount, type) {
  const worldId = window.Loom?.world?.id;
  const targets = window.Loom?.user?.targets || [];
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

      const traits = getTraits(sd, actorType) || {};
      const t = (type || '').toLowerCase();
      const has = (cat) => (traits[cat] || []).map((v) => String(v).toLowerCase()).includes(t);
      let multiplier = 1;
      let traitLabel = '';
      if (t && has('di')) { multiplier = 0; traitLabel = 'Immune'; }
      else if (t && has('dr')) { multiplier = 0.5; traitLabel = 'Resistant'; }
      else if (t && has('dv')) { multiplier = 2; traitLabel = 'Vulnerable'; }

      const finalAmount = Math.floor(amount * multiplier);
      // Mesma regra da Parte A (SRD Combat.md, "Temporary Hit Points") — essa
      // função duplica o cálculo de `applyDamage`, então duplica o fix também.
      const tempBefore = hp.temp || 0;
      const tempAfter = Math.max(0, tempBefore - finalAmount);
      const leftoverDamage = Math.max(0, finalAmount - tempBefore);
      const newValue = Math.max(0, (hp.value || 0) - leftoverDamage);
      const patch = { systemData: { ...sd, resources: { ...sd.resources, health: { ...hp, value: newValue, temp: tempAfter } } } };
      if (newValue === 0) patch.systemData.resources.concentrating = false;

      if (isLinked && cast.actorId) await window.Loom.api.put(`/actors/${cast.actorId}`, patch);
      else await window.Loom.api.put(`/cast/${castId}`, patch);

      if (finalAmount > 0) {
        showFloatingDamageOrHeal(castId, finalAmount, false);
      }

      results.push({ name: record.name, finalAmount, traitLabel });
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

export function getTraits(sd, actorType) {
  // character: traits.{di,dr,dv} · npc: details.traits.{di,dr,dv}
  return actorType === 'npc' ? sd.details?.traits : sd.traits;
}

export async function applyHeal(actor, amount, options = {}) {
  if (!actor || amount <= 0) return null;
  const sd = actor.systemData;
  const hp = getHealthPool(sd, actor.type);
  if (!hp) return null;

  // Exhaustion 4 (Handout 26): curar não pode passar do teto EFETIVO, só do
  // `max` bruto — senão cura "esconde" HP acima do teto até a exaustão
  // baixar, o que não é a regra (o excedente é perdido, não guardado).
  const cap = hp.effectiveMax ?? hp.max ?? hp.value + amount;
  const newValue = Math.min(cap, (hp.value || 0) + amount);
  await actor.update({ 'system.resources.health.value': newValue });

  const tokenId = findTokenIdForActor(actor.id);
  if (tokenId && amount > 0) {
    showFloatingDamageOrHeal(tokenId, amount, true);
  }

  // `flags.<system>.{name,description}` is the shape the chat card actually
  // knows how to render as HTML (`chat-message-card.ts:infoFlags`) — `content`
  // with raw HTML is always escaped for safety (the literal `<div>` tag showed
  // up as text in chat before this was found while testing the sheet).
  const label = options.label || 'Heal';
  return window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
    content: `${label}: +${amount}`,
    flags: { srd5e: { name: `${actor.name} — ${label}`, isHeal: true, amount, description: `<span style="color:#10b981">+${amount} HP</span>` } },
  });
}

/**
 * Grants temporary hit points. SRD (Combat.md, "Temporary Hit Points"):
 * "if you have temporary hit points and receive more, you decide whether to
 * keep the ones you have or to gain the new ones" — modeled as "keep the
 * higher value" (the common table ruling and what dnd5e itself defaults to),
 * warning in chat when the new grant is ignored because it's lower.
 */
export async function applyTempHp(actor, amount) {
  if (!actor || amount <= 0) return null;
  const sd = actor.systemData;
  const hp = getHealthPool(sd, actor.type);
  if (!hp) return null;

  const current = hp.temp || 0;
  if (amount <= current) {
    return window.Loom.ChatMessage.create({
      speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
      content: `Temporary HP ignored (${amount} ≤ current ${current})`,
      flags: { srd5e: { name: `${actor.name} — Temporary HP`, description: `<span>New ${amount} temp HP ignored — already has ${current}</span>` } },
    });
  }

  await actor.update({ 'system.resources.health.temp': amount });

  return window.Loom.ChatMessage.create({
    speaker: window.Loom.ChatMessage.getSpeaker({ actor }),
    content: `Temporary HP: ${amount}`,
    flags: { srd5e: { name: `${actor.name} — Temporary HP`, amount, description: `<span style="color:#10b981">${amount} Temporary HP</span>` } },
  });
}

export async function applyDamage(actor, amount, type = '') {
  if (!actor) return null;
  const sd = actor.systemData;
  const hp = getHealthPool(sd, actor.type);
  if (!hp) return null;

  const traits = getTraits(sd, actor.type) || {};
  const t = (type || '').toLowerCase();
  // traits.{di,dr,dv} is a flat array on the schema (schema.mjs's
  // getDefaultData, and both sheets' `_traits` context read it the same
  // way) — reading `.value` here (an assumed {value:[...]} shape that
  // nothing else ever used) always fell through to `[]`, so resistance/
  // immunity/vulnerability never applied no matter what a GM set. Found
  // while wiring up the character sheet's trait editor.
  const has = (cat) => (traits[cat] || []).map((v) => String(v).toLowerCase()).includes(t);

  let multiplier = 1;
  let traitLabel = '';
  if (t && has('di')) { multiplier = 0; traitLabel = 'Immune'; }
  else if (t && has('dr')) { multiplier = 0.5; traitLabel = 'Resistant'; }
  else if (t && has('dv')) { multiplier = 2; traitLabel = 'Vulnerable'; }

  const finalAmount = Math.floor(amount * multiplier);
  // SRD (Combat.md, "Temporary Hit Points"): "the temporary hit points are
  // lost first, and any leftover damage carries over to your normal hit
  // points" — desconta de `temp` até zerar, só o excedente vai pro `value`.
  const tempBefore = hp.temp || 0;
  const tempAfter = Math.max(0, tempBefore - finalAmount);
  const leftoverDamage = Math.max(0, finalAmount - tempBefore);
  const newValue = Math.max(0, (hp.value || 0) - leftoverDamage);
  const update = {
    'system.resources.health.value': newValue,
    'system.resources.health.temp': tempAfter,
  };
  if (newValue === 0) update['system.resources.concentrating'] = false; // dropping to 0 HP always breaks concentration
  await actor.update(update);

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
  if (finalAmount > 0 && newValue > 0 && sd.resources?.concentrating) {
    await rollConcentrationSave(actor, finalAmount);
  }

  return message;
}

/**
 * Concentration save — DC is the greater of 10 and half the damage taken.
 * Built directly off `systemData.saves.con`, not `actor.rollAbilitySave` —
 * `actor` here is the sheet's `this.document`, a plain object that only
 * borrows the `prepareData` prototype method (see the architecture note at
 * the top of actor-sheet.mjs), so the legacy per-instance roll methods on
 * `SDR5EActor` are never actually reachable from here.
 *
 * Rolled LOCALLY (not via `sdr5eRoll`/`dispatchRoll`, both fire-and-forget —
 * see the note on `rollDeathSave`) because the outcome has to be known
 * synchronously: a failed save immediately drops whatever effect
 * `resources.concentratingOn` points at (Handout — SRD5E automação básica,
 * Passo 4). Trades away the advantage/situational-bonus dialog other saves
 * get; every other save in this file keeps using `sdr5eRoll`.
 */
export async function rollConcentrationSave(actor, damage) {
  if (!actor) return null;
  const dc = Math.max(10, Math.floor(damage / 2));
  const conTotal = actor.systemData?.saves?.con?.total ?? 0;
  const roll = 1 + Math.floor(Math.random() * 20);
  const total = roll + conTotal;
  const success = total >= dc;

  window.Loom.dispatchRoll({
    formula: String(total),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Concentration Save (DC ${dc}) — ${success ? 'Success' : 'Failed'}` },
  });

  if (!success) {
    const origin = actor.systemData?.resources?.concentratingOn;
    if (origin) await removeItemEffects({ id: origin });
    await actor.update({
      'system.resources.concentrating': false,
      'system.resources.concentratingOn': '',
    });
  }

  return { roll, total, dc, success };
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
export async function rollDeathSave(actor) {
  if (!actor) return null;
  const sd = actor.systemData;
  const ds = sd.resources?.deathSaves || { successes: 0, failures: 0 };
  const roll = 1 + Math.floor(Math.random() * 20);

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
    });
    outcome = 'Critical Success — regains 1 HP';
  } else {
    const deathDC = Number(getSetting('deathSaveDC', 10)) || 10;
    if (roll === 1) failures += 2;
    else if (roll >= deathDC) successes += 1;
    else failures += 1;
    successes = Math.min(3, successes);
    failures = Math.min(3, failures);
    await actor.update({
      'system.resources.deathSaves.successes': successes,
      'system.resources.deathSaves.failures': failures,
    });
    if (failures >= 3) outcome = 'Dead';
    else if (successes >= 3) outcome = 'Stabilized';
    else outcome = roll === 1 ? 'Critical Failure (2 failures)' : roll >= (Number(getSetting('deathSaveDC', 10)) || 10) ? 'Success' : 'Failure';
  }

  window.Loom.dispatchRoll({
    formula: String(roll),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Death Saving Throw — ${outcome}` },
  });
  return { roll, successes, failures, outcome };
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
  const category = String(idata.weaponType || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  return profs.some((w) => {
    const entry = String(w).toLowerCase();
    return entry === category || entry === name;
  });
}

export async function rollWeaponAttack(actor, item) {
  if (!actor || !item) return null;
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
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, isRanged, sd.resources?.exhaustion ?? 0, armorPenalty);
  const targets = await getTargetAcInfo();
  return sdr5eRoll({ label: `Attack: ${item.name}`, parts, actor, advantage, extraMeta: { isAttack: true, ...(targets.length ? { targets } : {}), actorId: actor.id, itemId: item.id } });
}

export async function rollWeaponDamage(actor, item) {
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
  const effectiveMod = (isOffHand && abilityMod > 0 && !hasTWFStyle) ? 0 : abilityMod;

  const formula = idata.damage?.formula || '1d4';
  const rollFormula = effectiveMod !== 0 ? `${formula} + ${effectiveMod}` : formula;
  const type = idata.damage?.type || '';
  const typeSuffix = type ? ` (${type})` : '';
  // Handout 30: Alt segurado na hora do clique = crítico (dados em dobro,
  // SRD Combat.md "Critical Hits"). Sem estado compartilhado com o attack
  // roll — o jogador sinaliza manualmente, motivo completo no handout.
  const critical = isCriticalHeld();
  // Rolled locally (not just dispatched) so the total is known synchronously
  // for the Apply Damage button — dispatchRoll alone never returns it (the
  // server resolves and broadcasts separately). Dispatching the RESOLVED
  // total as a literal formula string keeps the chat animation showing the
  // same number as what actually gets applied — same trick `rollDeathSave`
  // already uses for the identical problem. `meta.srd5eDamage` is read by
  // the `renderRollCard` wrapper in srd5e.mjs to inject the Apply Damage
  // button directly into THIS card (mirrors real dnd5e-Foundry — no
  // separate companion message).
  const total = evaluateDamageFormula(rollFormula, critical);
  window.Loom.dispatchRoll({
    formula: String(total),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Damage: ${item.name}${critical ? ' (Critical!)' : ''}${typeSuffix}`, srd5eDamage: { amount: total, type } },
  });
  return total;
}

/**
 * Unarmed strike (SRD Combat.md:293) — "1 + your Strength modifier"
 * bludgeoning, sempre proficiente, sem item nenhum envolvido. Mais simples
 * que rollWeaponAttack: sem lookup de proficiência por nome/categoria, sem
 * finesse (unarmed é sempre Força), sem bônus de item (Handout 32).
 */
export async function rollUnarmedStrike(actor) {
  if (!actor) return null;
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
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, false, sd.resources?.exhaustion ?? 0, armorPenalty);
  const targets = await getTargetAcInfo();
  return sdr5eRoll({ label: 'Attack: Unarmed Strike', parts, actor, advantage, extraMeta: { isAttack: true, isUnarmed: true, actorId: actor.id, ...(targets.length ? { targets } : {}) } });
}

export async function rollUnarmedDamage(actor) {
  if (!actor) return null;
  const sd = actor.systemData;
  const strMod = sd.abilities?.str?.modifier ?? 0;
  const total = Math.max(0, 1 + strMod);
  window.Loom.dispatchRoll({
    formula: String(total),
    actorId: actor.id,
    mode: 'public',
    meta: { label: 'Damage: Unarmed Strike (bludgeoning)', srd5eDamage: { amount: total, type: 'bludgeoning' } },
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
export async function spendHitDie(actor) {
  if (!actor) return null;
  const sd = actor.systemData;
  const hd = sd.resources?.hitDice;
  if (!hd || (hd.value ?? 0) <= 0) {
    globalThis.Loom?.showToast?.('No Hit Dice remaining.', 'warning');
    return null;
  }
  const die = hd.die || 'd8';
  const conMod = sd.abilities?.con?.modifier ?? 0;
  const formula = conMod !== 0 ? `1${die} + ${conMod}` : `1${die}`;
  const hp = getHealthPool(sd, actor.type);
  const before = hp?.value ?? 0;
  const max = hp?.max ?? before;

  window.Loom.dispatchRoll({
    formula,
    actorId: actor.id,
    mode: 'public',
    meta: { label: 'Spend Hit Die' },
  });

  // The roll result isn't returned synchronously (see sdr5eRoll's note on
  // dispatchRoll being fire-and-forget) — healing uses the average roll
  // (die/2 rounded up, same convention 5e itself offers as a non-random
  // alternative) rather than trying to correlate the dispatched chat roll.
  const dieMax = Number(die.replace(/\D/g, '')) || 8;
  const avgRoll = Math.ceil((dieMax + 1) / 2);
  const healAmount = Math.max(1, avgRoll + conMod);
  const newValue = Math.min(max, before + healAmount);

  await actor.update({
    'system.resources.hitDice.value': hd.value - 1,
    'system.resources.health.value': newValue,
  });

  const tokenId = findTokenIdForActor(actor.id);
  if (tokenId && healAmount > 0) {
    showFloatingDamageOrHeal(tokenId, healAmount, true);
  }

  return { healAmount, newValue };
}

export async function rollSpellAttack(actor, item) {
  if (!actor || !item) return null;
  const parts = [{ label: 'Spellcasting', value: actor.systemData?.attributes?.spellcasting?.attackBonus ?? 0 }];
  const conditions = await getActorConditions(actor.id);
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, false, actor.systemData?.resources?.exhaustion ?? 0);
  const targets = await getTargetAcInfo();
  return sdr5eRoll({ label: `Spell Attack: ${item.name}`, parts, actor, advantage, extraMeta: { isAttack: true, ...(targets.length ? { targets } : {}), actorId: actor.id, itemId: item.id, isSpell: true } });
}

export async function rollSpellDamage(actor, item) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const formula = idata.damage?.formula;
  if (!formula) {
    globalThis.Loom?.showToast?.(`No damage formula configured for ${item.name || 'this spell'}.`, 'info');
    return null;
  }
  const type = idata.damage?.type || '';
  const typeSuffix = type ? ` (${type})` : '';
  const total = evaluateDamageFormula(formula);
  window.Loom.dispatchRoll({
    formula: String(total),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Spell Damage: ${item.name}${typeSuffix}`, srd5eDamage: { amount: total, type } },
  });
  return total;
}

/**
 * Casts a spell: consumes a slot at its level (cantrips are free/unlimited —
 * SRD rule), posts a chat card with the spell's stat block (DC/attack/
 * concentration), and rolls the save DC as informational text (the target
 * makes the actual save, not the caster — no auto-apply). Level-up slots
 * ("cast at a higher level") aren't modeled yet — always consumes at the
 * spell's own level.
 */
export async function castSpell(actor, item) {
  if (!actor || !item) return null;
  const sd = actor.systemData;
  const idata = item.system || item.data || {};
  const level = idata.spellLevel ?? 0;

  if (sd.attributes?.armor?.canCastSpells === false) {
    globalThis.Loom?.showToast?.('Wearing armor you are not proficient with — you can\'t cast spells.', 'warning');
    return null;
  }

  // No-op today (spell items don't carry a `uses` field in the schema), but
  // wired the same way as activateFeature so a future limited-use spell item
  // (e.g. a spell scroll) is gated for free.
  const usable = await consumeUse(actor, item);
  if (!usable) return null;

  // SRD (Spellcasting, "Rituals"): magia ritual preparada não gasta slot
  // (leva 10min a mais, não rastreado aqui — narrativo). Simplificação
  // assumida: usa a regra geral (precisa `prepared: true`), não replica a
  // exceção do Wizard (ritual direto do grimório sem preparar).
  const isFreeRitual = idata.ritual && idata.prepared;

  if (level > 0 && !isFreeRitual) {
    const slot = sd.resources?.spellSlots?.[level];
    if (!slot || (slot.value ?? 0) <= 0) {
      globalThis.Loom?.showToast?.(`No level ${level} spell slots remaining.`, 'warning');
      return null;
    }
    await actor.update({ [`system.resources.spellSlots.${level}.value`]: slot.value - 1 });
  }

  // Concentration + a mechanical effect (Passo 4 — see schema.mjs's note on
  // `durationRounds`/`bonuses` on the spell item): applies the effect for
  // `durationRounds` rounds and remembers which spell it came from so a
  // failed concentration save (rollConcentrationSave) can find and remove
  // it. Every other spell (durationRounds === 0, i.e. every spell until a
  // GM fills those fields in) is unaffected — same as before this existed.
  if (idata.concentration && Number(idata.durationRounds) > 0) {
    const changes = bonusesToChanges(idata.bonuses);
    if (changes.length) {
      await applyTemporaryEffect(actor, { changes, duration: Number(idata.durationRounds), origin: item.id, label: `${item.name} (Concentration)` });
      await actor.update({
        'system.resources.concentrating': true,
        'system.resources.concentratingOn': item.id,
      });
    }
  }

  const dc = sd.attributes?.spellcasting?.dc ?? 0;
  const attack = sd.attributes?.spellcasting?.attackBonus ?? 0;
  const parts = [`Level ${level === 0 ? 'Cantrip' : level}`];
  if (idata.concentration) parts.push('Concentration');
  if (idata.ritual) parts.push('Ritual');
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
        hasDamage: !!idata.damage?.formula,
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
  const result = await actor.update({ 'system.resources.exhaustion': next });
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
 * Posts an item's description as a chat card — real dnd5e-Foundry has this
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
  const subtitleParts = [ITEM_TYPE_SINGULAR_LABEL(item.type)];
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

function ITEM_TYPE_SINGULAR_LABEL(type) {
  return type ? type[0].toUpperCase() + type.slice(1) : 'Item';
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
export async function consumeUse(actor, item) {
  if (!item) return true;
  const idata = item.system || item.data || {};
  const uses = idata.uses;
  const max = Number(uses?.max) || 0;
  if (!uses || max <= 0) return true;

  const value = Number(uses.value) || 0;
  if (value <= 0) {
    window.Loom?.showToast?.(`${item.name}: no uses remaining.`, 'warning');
    return false;
  }

  await window.Loom.api.put(`/items/${item.id}`, { data: { ...idata, uses: { ...uses, value: value - 1 } } });
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

  const usable = await consumeUse(actor, item);
  if (!usable) return false;

  const cost = Number(idata.resourceCost) || 0;
  if (cost > 0) {
    const ok = await spendClassResource(actor, cost);
    if (!ok) return false;
  }
  await postItemToChat(actor, item);
  return true;
}
