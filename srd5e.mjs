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
import { getDefaultData } from './scripts/schema.mjs';
import { mergeDefaults } from './scripts/utils.mjs';
import { prepCharacter, prepNpc } from './scripts/prepare-data.mjs';
import { getSheetSchema, getItemSheetSchema } from './scripts/sheet-schemas.mjs';
import { applyDamageToTargets } from './scripts/roll-engine.mjs';
import { syncEquippedEffect } from './scripts/effects.mjs';
import { Sdr5eCharacterSheet } from './scripts/actor-sheet.mjs';
import { Sdr5eNpcSheet } from './scripts/npc-sheet.mjs';
import { Sdr5eItemSheet } from './scripts/item-sheet.mjs';
import { SDR5EApi } from './scripts/api.mjs';

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
  const sd = row?.systemData;
  if (!sd) return row;
  // Backfills any schema field added after this actor was first created —
  // including a COMPLETELY empty systemData (e.g. an actor whose create
  // request never sent one) — never overwrites data that's actually there.
  // Runs before the `abilities` check below: bailing out first would leave
  // an empty actor permanently blank instead of self-healing on the next
  // render, which is the whole point of mergeDefaults (see its doc comment).
  mergeDefaults(sd, getDefaultData(row.type));
  if (!sd.abilities) return row;
  if (row.type === 'npc') prepNpc(sd);
  else prepCharacter(sd, row.items || []);
  return row;
}

SystemRegistry.register(defineSystem({
  id: 'srd5e',
  title: 'SDR5E (Modern SRD)',
  version: '0.6.0',
  actorTypes: ['character', 'npc'],
  itemTypes: ['weapon', 'armor', 'feature', 'item', 'language', 'race', 'class', 'subclass', 'background', 'feat', 'spell'],
  getDefaultData,
  getSheetSchema,
  getItemSheetSchema,
  prepareData,
}));

// Core already ships 5 generic token status markers (blinded/poisoned/
// stunned/prone/invisible) — the full SRD 5.1 condition list has 14. The
// other 9 were simply never registered by anyone; `register()` is additive
// (confirmed via `statusEffects.getAll()` before adding these — no
// duplicate/overwrite risk). This only adds the marker (id/label/color) a
// GM can drop on a token from the core's own status UI — the mechanical
// side (poisoned -> disadvantage, restrained/paralyzed/stunned/unconscious/
// exhaustion rules) is wired separately in roll-engine.mjs's condition
// modifier functions, checked from every attack/ability-check/save roll.
const SRD_CONDITIONS = [
  { id: 'charmed', label: 'Charmed', color: 0xe91e8c },
  { id: 'deafened', label: 'Deafened', color: 0x8a8a8a },
  { id: 'frightened', label: 'Frightened', color: 0x9b59b6 },
  { id: 'grappled', label: 'Grappled', color: 0x795548 },
  { id: 'incapacitated', label: 'Incapacitated', color: 0x607d8b },
  { id: 'paralyzed', label: 'Paralyzed', color: 0xffc107 },
  { id: 'petrified', label: 'Petrified', color: 0x9e9e9e },
  { id: 'restrained', label: 'Restrained', color: 0x8b4513 },
  { id: 'unconscious', label: 'Unconscious', color: 0x1a1614 },
];
for (const cond of SRD_CONDITIONS) {
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
  const dmg = roll.meta?.srd5eDamage;
  if (!dmg) return wrapped(roll, esc);
  // The base renderer shows every `meta` key it doesn't recognize as a
  // "key: value" badge (roll-card.ts's `hiddenMetaKeys`) — `srd5eDamage`
  // isn't in that hardcoded list, so passing it straight through rendered
  // a literal "srd5eDamage: [object Object]" badge on the card (found
  // live). Render off a meta-stripped copy instead; nothing else needs to
  // change since `wrapped` is a pure function of its arguments.
  const { srd5eDamage, ...restMeta } = roll.meta;
  const base = wrapped({ ...roll, meta: restMeta }, esc);
  const targetCount = window.Loom?.user?.targets?.length || 0;
  if (targetCount <= 0) return base;
  const btn = `<button type="button" class="sdr5e-apply-dmg-btn" data-srd5e-action="apply-damage" data-amount="${dmg.amount}" data-type="${dmg.type || ''}">Apply ${dmg.amount} damage to ${targetCount} target${targetCount === 1 ? '' : 's'}</button>`;
  // `.replace('</div>', ...)` would hit the FIRST closing tag in the string
  // (the header's, not the outer `.roll-card` wrapper's) and misplace the
  // button inside the card header — insert before the LAST `</div>` instead.
  const idx = base.lastIndexOf('</div>');
  if (idx === -1) return base + btn;
  return base.slice(0, idx) + btn + base.slice(idx);
});

window.Loom.socket.on('item.updated', (item) => { void syncEquippedEffect(item); });

// ── Native sheets ─────────────────────────────────────────────────────────

sheets.catalog('actor', 'character', Sdr5eCharacterSheet);
sheets.catalog('actor', 'npc', Sdr5eNpcSheet);
sheets.catalog('item', '*', Sdr5eItemSheet);
