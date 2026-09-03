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

import { currentAdvantageMode } from './utils.mjs';

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

  const disadvantageSources = (explicitMode === -1 ? 1 : 0)
    + (selfConditions?.includes('poisoned') ? 1 : 0)
    + (selfConditions?.includes('restrained') ? 1 : 0)
    + (selfConditions?.includes('prone') ? 1 : 0)
    + (targetProne && isRanged ? 1 : 0)
    // Exhaustion level 3 (classic 6-level table): disadvantage on attack rolls and saving throws.
    + (exhaustionLevel >= 3 ? 1 : 0)
    // SRD (Equipment/Armor.md): armadura sem proficiência dá desvantagem em
    // ataques de Força/Destreza — só `rollWeaponAttack` passa `true` aqui
    // (ataque de magia usa a habilidade de conjuração, nunca str/dex).
    + (armorPenalty ? 1 : 0);
  const advantageSources = (explicitMode === 1 ? 1 : 0)
    + (targetHasIncapacitating ? 1 : 0)
    + (targetProne && !isRanged ? 1 : 0);
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
  return { autoFail, disadvantage };
}

/**
 * Rolls 1d20 + bonus, with advantage/disadvantage and an optional DC.
 * @param {{label:string, bonus:number, actor:any, advantage?:number, dc?:number|null}} opts
 *   advantage: 1 = advantage, -1 = disadvantage, 0 = normal.
 */
export async function sdr5eRoll({ label, bonus = 0, actor, advantage = 0, dc = null }) {
  const b = Number(bonus) || 0;
  const die = advantage === 1 ? '2d20kh1' : advantage === -1 ? '2d20kl1' : '1d20';
  const formula = b !== 0 ? `${die} + ${b}` : die;

  // The core `renderRollCard` shows ANY `meta` key as a "key: value" badge —
  // `srd5e:true` always and `dc:null` on most rolls became visible noise.
  // Only send what's actually worth displaying.
  const meta = { label };
  if (dc !== null && dc !== undefined) meta.dc = dc;

  window.Loom.dispatchRoll({
    formula,
    actorId: actor?.id,
    mode: 'public',
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
export function evaluateDamageFormula(formula) {
  const terms = String(formula || '0').replace(/\s+/g, '').match(/[+-]?\d*d?\d+/gi) || [];
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    const dieMatch = body.match(/^(\d*)d(\d+)$/i);
    if (dieMatch) {
      const count = Number(dieMatch[1]) || 1;
      const faces = Number(dieMatch[2]) || 1;
      for (let i = 0; i < count; i++) total += sign * (Math.floor(Math.random() * faces) + 1);
    } else {
      total += sign * (Number(body) || 0);
    }
  }
  return Math.max(0, total);
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
      const newValue = Math.max(0, (hp.value || 0) - finalAmount);
      const patch = { systemData: { ...sd, resources: { ...sd.resources, health: { ...hp, value: newValue } } } };
      if (newValue === 0) patch.systemData.resources.concentrating = false;

      if (isLinked && cast.actorId) await window.Loom.api.put(`/actors/${cast.actorId}`, patch);
      else await window.Loom.api.put(`/cast/${castId}`, patch);

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

  const newValue = Math.min(hp.max ?? hp.value + amount, (hp.value || 0) + amount);
  await actor.update({ 'system.resources.health.value': newValue });

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
  const newValue = Math.max(0, (hp.value || 0) - finalAmount);
  const update = { 'system.resources.health.value': newValue };
  if (newValue === 0) update['system.resources.concentrating'] = false; // dropping to 0 HP always breaks concentration
  await actor.update(update);

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
 */
export async function rollConcentrationSave(actor, damage) {
  if (!actor) return null;
  const dc = Math.max(10, Math.floor(damage / 2));
  const bonus = actor.systemData?.saves?.con?.total ?? 0;
  return sdr5eRoll({ label: 'Concentration Save', bonus, actor, dc });
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
    if (roll === 1) failures += 2;
    else if (roll >= 10) successes += 1;
    else failures += 1;
    successes = Math.min(3, successes);
    failures = Math.min(3, failures);
    await actor.update({
      'system.resources.deathSaves.successes': successes,
      'system.resources.deathSaves.failures': failures,
    });
    if (failures >= 3) outcome = 'Dead';
    else if (successes >= 3) outcome = 'Stabilized';
    else outcome = roll === 1 ? 'Critical Failure (2 failures)' : roll >= 10 ? 'Success' : 'Failure';
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
  const bonus = abilityMod + (proficient ? prof : 0) + (Number(idata.attackBonus) || 0) + attackTypeBonus;
  const conditions = await getActorConditions(actor.id);
  const armorPenalty = (abilityKey === 'str' || abilityKey === 'dex') && !!sd.attributes?.armor?.penalty;
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, isRanged, sd.resources?.exhaustion ?? 0, armorPenalty);
  return sdr5eRoll({ label: `Attack: ${item.name}`, bonus, actor, advantage });
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
  // Rolled locally (not just dispatched) so the total is known synchronously
  // for the Apply Damage button — dispatchRoll alone never returns it (the
  // server resolves and broadcasts separately). Dispatching the RESOLVED
  // total as a literal formula string keeps the chat animation showing the
  // same number as what actually gets applied — same trick `rollDeathSave`
  // already uses for the identical problem. `meta.srd5eDamage` is read by
  // the `renderRollCard` wrapper in srd5e.mjs to inject the Apply Damage
  // button directly into THIS card (mirrors real dnd5e-Foundry — no
  // separate companion message).
  const total = evaluateDamageFormula(rollFormula);
  window.Loom.dispatchRoll({
    formula: String(total),
    actorId: actor.id,
    mode: 'public',
    meta: { label: `Damage: ${item.name}${typeSuffix}`, srd5eDamage: { amount: total, type } },
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
  return { healAmount, newValue };
}

export async function rollSpellAttack(actor, item) {
  if (!actor || !item) return null;
  const bonus = actor.systemData?.attributes?.spellcasting?.attackBonus ?? 0;
  const conditions = await getActorConditions(actor.id);
  const advantage = applyWeaponAttackConditionModifiers(currentAdvantageMode(), conditions, false, actor.systemData?.resources?.exhaustion ?? 0);
  return sdr5eRoll({ label: `Spell Attack: ${item.name}`, bonus, actor, advantage });
}

export async function rollSpellDamage(actor, item) {
  if (!actor || !item) return null;
  const idata = item.system || item.data || {};
  const formula = idata.damage?.formula;
  if (!formula) return null;
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
  const next = clamped === current ? clamped - 1 : clamped;
  return actor.update({ 'system.resources.exhaustion': Math.max(0, next) });
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
 * Activates a feature that costs class-resource points (Rage, Channel
 * Divinity, etc.) — spends the cost (if any), then posts the same kind of
 * item chat card `postItemToChat` already builds for a plain "post to
 * chat" click, so an activated feature shows up the same way in the log.
 */
export async function activateFeature(actor, item) {
  if (!actor || !item) return false;
  const idata = item.system || item.data || {};
  const cost = Number(idata.resourceCost) || 0;
  if (cost > 0) {
    const ok = await spendClassResource(actor, cost);
    if (!ok) return false;
  }
  await postItemToChat(actor, item);
  return true;
}
