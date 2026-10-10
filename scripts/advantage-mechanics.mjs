import { resolveAdvantageSources } from './class-feature-mechanics.mjs';

/** Target conditions can affect a shared attack roll only when exactly one target is selected. */
export function conditionsForSingleTarget(targets = []) {
  if (!Array.isArray(targets) || targets.length !== 1) return [];
  return Array.isArray(targets[0]?.statusMarkers) ? targets[0].statusMarkers : [];
}

export function composeAbilityCheckConditionModifiers(explicitMode, selfConditions = [], armorPenalty = false, featureAdvantage = false) {
  const disadvantage = (explicitMode === -1 ? 1 : 0)
    + (selfConditions.includes('poisoned') ? 1 : 0)
    + (armorPenalty ? 1 : 0);
  const advantage = (explicitMode === 1 ? 1 : 0) + (featureAdvantage ? 1 : 0);
  // Frightened requires its fear source to be in line of sight; that source
  // is not represented in the actor's condition markers, so it stays manual.
  return resolveAdvantageSources(advantage, disadvantage);
}

/**
 * `situational` carries answers the caller has already resolved:
 * - `grappledAgainstOther`: the attacker is Grappled and the target is not its grappler (Disadvantage).
 * - `targetProneWithin5ft`: true = attacker within 5 ft of a Prone target (Advantage),
 *   false = farther away (Disadvantage), undefined = not asked (no effect).
 * - `attackerInvisibleSeen`: the attacker is Invisible. true = the target can see it
 *   (no Advantage), false = it cannot (Advantage), undefined = not asked (no effect).
 * - `targetInvisibleSeen`: the target is Invisible. true = the attacker can see it
 *   (no Disadvantage), false = it cannot (Disadvantage), undefined = not asked (no effect).
 */
export function composeAttackConditionModifiers(explicitMode, selfConditions = [], isRanged = false, armorPenalty = false, targetConditions = [], extraDisadvantageSources = 0, extraAdvantageSources = 0, situational = {}) {
  const disadvantage = (explicitMode === -1 ? 1 : 0)
    + (selfConditions.includes('poisoned') ? 1 : 0)
    + (selfConditions.includes('restrained') ? 1 : 0)
    + (selfConditions.includes('prone') ? 1 : 0)
    + (selfConditions.includes('blinded') ? 1 : 0)
    + (armorPenalty ? 1 : 0)
    + (situational.grappledAgainstOther === true ? 1 : 0)
    + (situational.targetProneWithin5ft === false ? 1 : 0)
    + (situational.targetInvisibleSeen === false ? 1 : 0)
    + Math.max(0, Math.floor(Number(extraDisadvantageSources) || 0));
  const advantage = (explicitMode === 1 ? 1 : 0)
    + Math.max(0, Math.floor(Number(extraAdvantageSources) || 0))
    + (['paralyzed', 'petrified', 'stunned', 'unconscious', 'restrained'].some((condition) => targetConditions.includes(condition)) ? 1 : 0)
    + (targetConditions.includes('blinded') ? 1 : 0)
    + (situational.targetProneWithin5ft === true ? 1 : 0)
    + (situational.attackerInvisibleSeen === false ? 1 : 0);

  // Frightened needs its fear source's line of sight, which is not represented
  // in the actor's condition markers, so it stays manual. Invisible is resolved
  // through `situational` (the attacking user answers whether each creature can
  // see the other). `isRanged` is kept in the signature for call-site
  // compatibility; range type alone does not decide the Prone rule, which
  // depends on distance (see `situational`).
  void isRanged;
  return resolveAdvantageSources(advantage, disadvantage);
}

/**
 * Frightened: Disadvantage on ability checks and attack rolls while the source of fear
 * is in line of sight. The caller answers `sourceInLineOfSight` per roll; only an
 * explicit `true` applies the condition (undefined or false means no effect).
 */
export function frightenedAppliesToRoll(conditions, sourceInLineOfSight) {
  const list = Array.isArray(conditions) ? conditions : [];
  return list.includes('frightened') && sourceInLineOfSight === true;
}

/**
 * Invisible: an attacker that is Invisible gains Advantage against a target that cannot
 * see it; an Invisible target imposes Disadvantage on an attacker that cannot see it.
 * Only an explicit `false` for a visibility flag counts as "cannot see"; undefined
 * means no effect for that side.
 */
export function invisibleSituationModifiers(attackerConditions, targetConditions, attackerSeesTarget, targetSeesAttacker) {
  const attacker = Array.isArray(attackerConditions) ? attackerConditions : [];
  const target = Array.isArray(targetConditions) ? targetConditions : [];
  const advantage = attacker.includes('invisible') && targetSeesAttacker === false ? 1 : 0;
  const disadvantage = target.includes('invisible') && attackerSeesTarget === false ? 1 : 0;
  return { advantage, disadvantage };
}
