// ══════════════════════════════════════════════════════════════════════════
// SDR5E — client entry point (LoomVTT native ruleset)
// Component Version: 0.6.0 — split into scripts/*.mjs modules
// ══════════════════════════════════════════════════════════════════════════
//
// Rule in effect (see CLAUDE.md): formulas/numbers are PROVISIONAL — the user
// is rewriting the rules from the SRD (.planning/SRD-OGL_V5.1.md /
// srd5.2_markdown/). This entry point only wires the modules together; the
// actual schema/logic/sheets live in scripts/*.mjs, one file per concern
// (flat, no Foundry-style data/documents/sheets folders — the original
// the-codex source this was converted from lives outside this ruleset now,
// at E:\modules\SISTEMAS\the-codex, consulted for reference only, never
// loaded or copied wholesale).
//
// Cut from scope (see conversion plan):
//   - class/race/path content as compendium packs (the item TYPES exist,
//     the ready-made content doesn't yet)
//   - full spellcasting (slots exist on the schema, no auto-calc from class)

import { SystemRegistry, defineSystem, sheets, statusEffects } from '/_loom/sdk/index.js';
import { prepareActorRow } from './scripts/prepare-data.mjs';
import { getSheetSchema, getItemSheetSchema } from './scripts/sheet-schemas.mjs';
import { getDefaultData } from './scripts/schema.mjs';
import { applyDamageToTargets, rollWeaponAttack, rollWeaponDamage, rollSpellAttack, rollSpellDamage, rollUnarmedDamage, castSpell, activateFeature, postItemToChat, useConsumable, rollToolCheck } from './scripts/roll-engine.mjs';
import { syncEquippedEffect, syncPermanentBonusEffect, removeItemEffects } from './scripts/effects.mjs';
import { Sdr5eCharacterSheet } from './scripts/character-sheet.mjs';
import { Sdr5eNpcSheet } from './scripts/npc-sheet.mjs';
import { Sdr5eGroupSheet } from './scripts/group-sheet.mjs';
import { Sdr5eVehicleSheet } from './scripts/vehicle-sheet.mjs';
import { Sdr5eEncounterSheet } from './scripts/encounter-sheet.mjs';
import { Sdr5eItemSheet } from './scripts/item-sheet.mjs';
import { SDR5EApi } from './scripts/api.mjs';
import { registerSettings } from './scripts/settings.mjs';
import { CONDITIONS } from './scripts/config.mjs';

// ── System registration ──────────────────────────────────────────────────

// `prepareData` is the SDK's first-class declarative hook (LoomSystem.prepareData,
// checked BEFORE anything else in `_runPrepareData`/document-sheet.ts) and the
// ONLY path that runs derived-data prep — the ruleset used to also register a
// `CONFIG.Actor.documentClass` subclass with its own `prepareDerivedData()`
// (a Foundry `documentClass` pattern) as a defensive fallback, but confirmed
// dead: nothing in the sheets calls `this.document.rollAbilityTest(...)` or
// any of its other methods (every roll goes through the module-level
// `sdr5eRoll()` functions directly), and that path only ever runs if
// `prepareData` is missing as an own property — never true here. Removed
// per the project rule against Foundry compatibility/emulation surface.
function prepareData(row) {
  return prepareActorRow(row);
}

registerSettings();

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
  version: '0.6.0',
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
// `CodexApi` static-method class, `game.codex.api` in the old Foundry
// system), kept in its own module (scripts/api.mjs) instead of built inline
// here so this entry point stays focused on system registration/wiring, not
// the API surface itself.
window.SDR5E = SDR5EApi;

// Click handler for the "Apply Damage" button rendered into roll cards (see
// the `renderRollCard` wrapper below) — a ruleset-owned delegated listener,
// NOT a case added to the core sidebar's
// click switch (client/screens/game-hud/sidebar.ts is a closed if/else chain
// with no fallback for unrecognized actions; extending it would mean editing
// shared core code for one ruleset). `data-srd5e-action` is a deliberately
// separate attribute from the core's own `data-action`, so this listener
// only ever reacts to buttons SDR5E itself renders into chat HTML.
document.addEventListener('click', (event) => {
  const btn = event.target instanceof Element ? event.target.closest('[data-srd5e-action="apply-damage"]') : null;
  if (!btn) return;
  const amount = Number(btn.dataset.amount) || 0;
  const type = btn.dataset.type || '';
  btn.disabled = true;
  void applyDamageToTargets(amount, type).finally(() => { btn.disabled = false; });
});

// Handout 40 — botões Attack/Damage embutidos no card de ativação
// (Passo 3). Busca actor/item frescos via API porque quem clica pode ser
// QUALQUER cliente vendo a mensagem no chat, não só quem tem a ficha aberta.
document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const btn = target?.closest('[data-srd5e-action="card-attack"], [data-srd5e-action="card-damage"], [data-srd5e-action="card-spell-attack"], [data-srd5e-action="card-spell-damage"], [data-srd5e-action="card-unarmed-damage"]');
  if (!btn) return;
  const actorId = btn.dataset.actorId;
  const itemId = btn.dataset.itemId;
  if (!actorId) return;
  btn.disabled = true;
  try {
    const actor = await window.Loom.api.get(`/actors/${actorId}?populate=true`);
    if (!actor) return;
    const action = btn.dataset.srd5eAction;
    if (action === 'card-unarmed-damage') {
      await rollUnarmedDamage(actor);
      return;
    }
    if (!itemId) return;
    const item = await window.Loom.api.get(`/items/${itemId}`);
    if (!item) return;
    if (action === 'card-attack') await rollWeaponAttack(actor, item);
    else if (action === 'card-damage') await rollWeaponDamage(actor, item);
    else if (action === 'card-spell-attack') await rollSpellAttack(actor, item);
    else if (action === 'card-spell-damage') await rollSpellDamage(actor, item);
  } finally {
    btn.disabled = false;
  }
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
  // Card completo estilo dnd5e-Foundry (papiro/pergaminho, header escuro,
  // total grande, detalhe expansível ao clicar) — reaproveita o CSS
  // `.codex-roll-card-v13` já existente em styles/srd5e.css (sobra do
  // ChatManager.mjs do Foundry original, nunca conectado na versão nativa).
  // Substitui o card genérico do core inteiro em vez de só adicionar um
  // botão em cima dele — `wrapped` não é mais chamado aqui.
  const dmg = roll.meta?.srd5eDamage;
  const label = esc(String(roll.meta?.label || roll.flavor || 'Roll'));
  const modeTag = roll.mode !== 'public' ? `<span class="status-badge">${esc(roll.mode)}</span>` : '';

  // Handout 31: nat 20 / nat 1 em d20 (ataque, save, ability check,
  // iniciativa) — nunca em dano (dano chega como total já resolvido, sem
  // termo de dado, ver roll-engine.mjs `dispatchRoll({formula: String(total)})`).
  // Dado descartado por vantagem/desvantagem não conta.
  let natClass = '';
  const diceBreakdown = (roll.terms || [])
    .filter((t) => t.kind === 'dice')
    .flatMap((t) => (t.rolls || []).map((r, i) => {
      const dropped = !!t.dropped?.[i];
      const isD20 = t.faces === 20;
      const nat = isD20 && !dropped ? (r === 20 ? ' nat20' : r === 1 ? ' nat1' : '') : '';
      if (nat && !dropped) natClass = nat;
      return `<span class="dice-roll-pip${dropped ? ' dropped' : ''}${nat}">${r}</span>`;
    }))
    .join('');
  const modifierTerms = (roll.terms || [])
    .filter((t) => t.kind === 'modifier')
    .map((t) => `<span class="dice-roll-pip dice-roll-mod">${t.value > 0 ? '+' : ''}${t.value}</span>`)
    .join('');

  // Handout 36 — Acertou/Errou por alvo, comparando o total já resolvido
  // (roll.total, disponível aqui no momento do render) contra a CA
  // capturada em meta.targets ANTES do dado ser rolado (Passo 1).
  const targetsList = roll.meta?.targets || [];
  const anyHit = targetsList.some((t) => roll.total >= t.ac);
  const targetsSection = targetsList.map((t) => {
    const hit = roll.total >= t.ac;
    return `<div class="target-vs-row ${hit ? 'hit' : 'miss'}">vs ${esc(t.name)} (AC ${t.ac}) — ${hit ? 'HIT' : 'MISS'}</div>`;
  }).join('');

  let inlineDamageBtn = '';
  if (roll.meta?.actorId && roll.meta?.itemId) {
    const isSpell = !!roll.meta.isSpell;
    inlineDamageBtn = `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="${isSpell ? 'card-spell-damage' : 'card-damage'}" data-actor-id="${esc(roll.meta.actorId)}" data-item-id="${esc(roll.meta.itemId)}"><i class="fas fa-burst"></i> Roll Damage</button></div>`;
  } else if (roll.meta?.isUnarmed && roll.meta?.actorId) {
    inlineDamageBtn = `<div class="activation-card-buttons"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-unarmed-damage" data-actor-id="${esc(roll.meta.actorId)}"><i class="fas fa-burst"></i> Roll Damage</button></div>`;
  }

  const damageSection = dmg
    ? `<div class="damage-section">${esc(dmg.type ? `${dmg.type} damage` : 'Damage')}</div>`
    : '';

  const targetCount = window.Loom?.user?.targets?.length || 0;
  const applyBtnSection = (dmg && targetCount > 0)
    ? `<div class="damage-button-section"><button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="apply-damage" data-amount="${dmg.amount}" data-type="${dmg.type || ''}">Apply ${dmg.amount} damage to ${targetCount} target${targetCount === 1 ? '' : 's'}</button></div>`
    : '';

  return `<div class="sdr-roll-card codex-roll-card-v13" data-action="toggle-roll-details">
    <div class="card-header">
      <span>${label}</span>
      ${modeTag}
    </div>
    <div class="roll-main">
      <div class="dice-total${natClass}">${roll.total}</div>
      <div class="roll-details">
        <span class="formula">${esc(roll.formula)}</span>
        ${roll.flavor && roll.flavor !== label ? `<span class="vs">${esc(roll.flavor)}</span>` : ''}
        <span class="click-to-see">Click to see breakdown</span>
      </div>
    </div>
    <div class="roll-details-expanded hidden">
      <div class="dice-breakdown">${diceBreakdown}${modifierTerms}</div>
    </div>
    ${targetsSection}
    ${inlineDamageBtn}
    ${damageSection}
    ${applyBtnSection}
  </div>`;
});

// Clique no card (fora do botão de aplicar dano) alterna o detalhe da
// rolagem — mesmo padrão do `click-to-see` do CSS original.
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-srd5e-action]')) return;
  const card = event.target.closest('[data-action="toggle-roll-details"]');
  if (!card) return;
  const expanded = card.querySelector('.roll-details-expanded');
  expanded?.classList.toggle('hidden');
});

// Card de info estilo dnd5e-Foundry pras mensagens que não são rolagem
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
  // referência real do dnd5e-Foundry (Rod of Lordly Might / Acid Splash).
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
        <button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="card-spell-damage" data-actor-id="${esc(flags.actorId)}" data-item-id="${esc(flags.itemId)}"><i class="fas fa-burst"></i> Damage</button>
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

window.Loom.socket.on('item.updated', (item) => { void syncEquippedEffect(item); });
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
