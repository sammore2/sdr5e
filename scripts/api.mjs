// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/api.mjs
// Component Version: 0.1.0
//
// The public system API — a real centralized facade (equivalent to the
// original `CodexApi` static-method class / `game.codex.api` in the old
// Foundry system), not a scatter of loose exports. Sheets and macros alike
// call `window.SDR5E.rollWeaponAttack(actor, item)`, never reach into
// roll-engine.mjs/effects.mjs directly, so the actual mechanic — which file
// it lives in, how it's implemented — stays free to move without breaking
// callers. Split out of srd5e.mjs (the entry point) so the entry point stays
// focused on system registration/wiring, not the API surface itself.
//
// Grouped to mirror the sections CodexApi itself used (roll/damage/heal,
// resources, conditions, effects, wizard).
// ══════════════════════════════════════════════════════════════════════════

import { windowManager } from '/_loom/sdk/index.js';
import {
  sdr5eRoll, applyHeal, applyDamage, applyTempHp, rollConcentrationSave, applyDamageToTargets,
  rollWeaponAttack, rollWeaponDamage, rollSpellAttack, rollSpellDamage, castSpell,
  rollDeathSave, spendHitDie, spendClassResource, activateFeature, consumeUse, rollRecharge,
  toggleInspiration, setExhaustion, getActorConditions, getSaveConditionOutcome,
  applyAbilityCheckConditionModifiers, applyWeaponAttackConditionModifiers,
  postItemToChat,
} from './roll-engine.mjs';
import { applyItemEffect, removeItemEffects, applyTemporaryEffect } from './effects.mjs';
import { Sdr5eCharacterWizard } from './character-wizard.mjs';

export const SDR5EApi = {
  // Rolls
  roll: sdr5eRoll,
  rollWeaponAttack, rollWeaponDamage, rollSpellAttack, rollSpellDamage, castSpell,
  rollDeathSave, rollConcentrationSave,
  // Damage / healing
  applyHeal, applyDamage, applyTempHp, applyDamageToTargets,
  // Resources (Hit Dice, the generic class-resource pool ported from the
  // original's "Route D: Flow Modifiers (Agnostic Pools)" — codex-api.mjs:651)
  spendHitDie, spendClassResource, activateFeature, consumeUse, rollRecharge,
  // Toggles
  toggleInspiration, setExhaustion,
  // Conditions (poisoned/restrained/paralyzed/etc — SRD 5.1 advantage/
  // disadvantage rules, not Foundry's condition system)
  getActorConditions, getSaveConditionOutcome,
  applyAbilityCheckConditionModifiers, applyWeaponAttackConditionModifiers,
  // Active Effects (equip/unequip buffs — ported from EffectAutomation.mjs,
  // scoped down to what doesn't need a combat tracker)
  applyItemEffect, removeItemEffects, applyTemporaryEffect,
  // Chat
  postItemToChat,
  // Character creation
  openCharacterWizard: () => {
    const wid = `sdr5e-wizard-${Math.random().toString(36).slice(2, 9)}`;
    windowManager.open(wid, Sdr5eCharacterWizard, { id: wid });
  },
};
