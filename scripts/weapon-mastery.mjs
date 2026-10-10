import { weaponProficiencyMatches } from './class-proficiencies.mjs';
import { normalizeCreatureSize } from './creature-size-mechanics.mjs';
import { resolveAttackAgainstTarget } from './attack-target-mechanics.mjs';

// Weapon name, category, range, weapon properties used for Rogue proficiency,
// and mastery are transcribed from the local SRD 5.2 Weapons table.
export const SRD_WEAPON_MASTERY_OPTIONS = Object.freeze([
  ['club', 'Club', 'simpleM', 'melee', [], 'slow'],
  ['dagger', 'Dagger', 'simpleM', 'melee', ['finesse', 'light'], 'nick'],
  ['greatclub', 'Greatclub', 'simpleM', 'melee', [], 'push'],
  ['handaxe', 'Handaxe', 'simpleM', 'melee', ['light'], 'vex'],
  ['javelin', 'Javelin', 'simpleM', 'melee', [], 'slow'],
  ['light-hammer', 'Light Hammer', 'simpleM', 'melee', ['light'], 'nick'],
  ['mace', 'Mace', 'simpleM', 'melee', [], 'sap'],
  ['quarterstaff', 'Quarterstaff', 'simpleM', 'melee', [], 'topple'],
  ['sickle', 'Sickle', 'simpleM', 'melee', ['light'], 'nick'],
  ['spear', 'Spear', 'simpleM', 'melee', [], 'sap'],
  ['dart', 'Dart', 'simpleR', 'ranged', ['finesse'], 'vex'],
  ['light-crossbow', 'Light Crossbow', 'simpleR', 'ranged', [], 'slow'],
  ['shortbow', 'Shortbow', 'simpleR', 'ranged', [], 'vex'],
  ['sling', 'Sling', 'simpleR', 'ranged', [], 'slow'],
  ['battleaxe', 'Battleaxe', 'martialM', 'melee', [], 'topple'],
  ['flail', 'Flail', 'martialM', 'melee', [], 'sap'],
  ['glaive', 'Glaive', 'martialM', 'melee', [], 'graze'],
  ['greataxe', 'Greataxe', 'martialM', 'melee', [], 'cleave'],
  ['greatsword', 'Greatsword', 'martialM', 'melee', [], 'graze'],
  ['halberd', 'Halberd', 'martialM', 'melee', [], 'cleave'],
  ['lance', 'Lance', 'martialM', 'melee', [], 'topple'],
  ['longsword', 'Longsword', 'martialM', 'melee', [], 'sap'],
  ['maul', 'Maul', 'martialM', 'melee', [], 'topple'],
  ['morningstar', 'Morningstar', 'martialM', 'melee', [], 'sap'],
  ['pike', 'Pike', 'martialM', 'melee', [], 'push'],
  ['rapier', 'Rapier', 'martialM', 'melee', ['finesse'], 'vex'],
  ['scimitar', 'Scimitar', 'martialM', 'melee', ['finesse', 'light'], 'nick'],
  ['shortsword', 'Shortsword', 'martialM', 'melee', ['finesse', 'light'], 'vex'],
  ['trident', 'Trident', 'martialM', 'melee', [], 'topple'],
  ['warhammer', 'Warhammer', 'martialM', 'melee', [], 'push'],
  ['war-pick', 'War Pick', 'martialM', 'melee', [], 'sap'],
  ['whip', 'Whip', 'martialM', 'melee', ['finesse'], 'slow'],
  ['blowgun', 'Blowgun', 'martialR', 'ranged', [], 'vex'],
  ['hand-crossbow', 'Hand Crossbow', 'martialR', 'ranged', ['light'], 'vex'],
  ['heavy-crossbow', 'Heavy Crossbow', 'martialR', 'ranged', [], 'push'],
  ['longbow', 'Longbow', 'martialR', 'ranged', [], 'slow'],
  ['musket', 'Musket', 'martialR', 'ranged', [], 'slow'],
  ['pistol', 'Pistol', 'martialR', 'ranged', [], 'vex'],
].map(([identifier, name, weaponType, rangeType, properties, mastery]) => Object.freeze({
  identifier, name, weaponType, rangeType, properties: Object.freeze(properties), mastery,
})));

export const WEAPON_MASTERY_LEVEL_ONE_COUNTS = Object.freeze({ barbarian: 2, fighter: 3, paladin: 2, ranger: 2, rogue: 2 });

/** Number of weapon kinds whose mastery properties the class can use at this class level. */
export function weaponMasteryCountAtLevel(classIdentifier, classLevel) {
  const level = Number(classLevel);
  if (!Number.isInteger(level) || level < 1 || level > 20) return 0;
  if (classIdentifier === 'barbarian') return level >= 10 ? 4 : level >= 4 ? 3 : 2;
  if (classIdentifier === 'fighter') return level >= 16 ? 6 : level >= 10 ? 5 : level >= 4 ? 4 : 3;
  return WEAPON_MASTERY_LEVEL_ONE_COUNTS[classIdentifier] || 0;
}

/** Return the saved mastery property only when one unique class feature grants it. */
export function weaponMasteryDefinitionForItem(weaponItem = {}) {
  const weaponData = weaponItem.system || weaponItem.data || {};
  const rawIdentifier = String(weaponData.identifier || weaponItem.identifier || '').trim().toLowerCase();
  const nameIdentifier = String(weaponItem.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return SRD_WEAPON_MASTERY_OPTIONS.find((candidate) => candidate.identifier === rawIdentifier)
    || SRD_WEAPON_MASTERY_OPTIONS.find((candidate) => candidate.identifier === nameIdentifier);
}

export function weaponMasteryForAttack(items = [], weaponItem = {}, proficientWeaponTypes = []) {
  const weapon = weaponMasteryDefinitionForItem(weaponItem);
  if (!weapon || !Array.isArray(items)) return null;
  const features = items.filter((item) => item.type === 'feature'
    && (item.system || item.data || {}).identifier === 'weapon-mastery');
  const matches = [];
  for (const feature of features) {
    const featureData = feature.system || feature.data || {};
    const classIdentifier = String(featureData.classIdentifier || '').toLowerCase();
    const mastered = featureData.masteredWeaponIdentifiers;
    if (!classIdentifier || !Array.isArray(mastered) || !mastered.includes(weapon.identifier)) continue;
    const classItems = items.filter((item) => item.type === 'class'
      && String((item.system || item.data || {}).classIdentifier || '').toLowerCase() === classIdentifier);
    if (classItems.length !== 1) continue;
    const classLevel = Number((classItems[0].system || classItems[0].data || {}).levels);
    const expected = weaponMasteryCountAtLevel(classIdentifier, classLevel);
    const resolved = resolveWeaponMasteryChoices(classIdentifier, mastered, proficientWeaponTypes, expected);
    if (!resolved.valid) continue;
    matches.push({ classIdentifier, weaponIdentifier: weapon.identifier, property: weapon.mastery });
  }
  const grantingClasses = new Set(matches.map(({ classIdentifier }) => classIdentifier));
  return matches.length > 0 && grantingClasses.size === matches.length ? matches[0] : null;
}

/** SRD Weapon Mastery save DC for a mastered weapon's property. */
export function weaponMasterySaveDC(abilityModifier, proficiencyBonus) {
  const ability = Number(abilityModifier);
  const proficiency = Number(proficiencyBonus);
  if (!Number.isFinite(ability) || !Number.isFinite(proficiency) || proficiency < 0) return null;
  return 8 + ability + proficiency;
}

/** Bind Cleave to the exact hit and the active combat turn that produced it. */
export function weaponMasteryCleaveAction(attackMeta, target, hit) {
  const turn = attackMeta?.srd5eCleaveTurn;
  const round = Number(turn?.round);
  if (hit !== true || attackMeta?.isAttack !== true || attackMeta.isSpell === true || attackMeta.isUnarmed === true
    || attackMeta.isRanged === true
    || attackMeta.srd5eWeaponMastery?.property !== 'cleave' || !attackMeta.actorId || !attackMeta.itemId
    || !target?.castId || !turn?.combatId || !Number.isInteger(round) || round < 1 || !turn?.castId) return null;
  return {
    actorId: String(attackMeta.actorId), itemId: String(attackMeta.itemId), targetCastId: String(target.castId),
    cleaveTurn: { combatId: String(turn.combatId), round, castId: String(turn.castId) },
  };
}

export function weaponMasteryCleaveTurnAvailable(lastUse, turn) {
  if (!turn?.combatId || !turn?.castId || !Number.isInteger(Number(turn.round)) || Number(turn.round) < 1) return false;
  return String(lastUse?.combatId || '') !== String(turn.combatId)
    || Number(lastUse?.round) !== Number(turn.round) || String(lastUse?.castId || '') !== String(turn.castId);
}

/** Bind Nick to an Attack-action Light weapon roll and its eligible off-hand choices. */
export function weaponMasteryNickAction(attackMeta) {
  const nick = attackMeta?.srd5eNickAction;
  const turn = nick?.turn;
  const round = Number(turn?.round);
  const candidates = Array.isArray(nick?.candidates) ? nick.candidates : [];
  if (attackMeta?.isAttack !== true || attackMeta.srd5eAttackAction !== true
    || attackMeta.isSpell === true || attackMeta.isUnarmed === true
    || !attackMeta.actorId || !attackMeta.itemId || nick?.sourceItemId !== String(attackMeta.itemId)
    || !attackMeta.srd5eWeaponProperties?.includes('light')
    || !turn?.combatId || !Number.isInteger(round) || round < 1 || !turn.castId
    || !Array.isArray(attackMeta.targets) || attackMeta.targets.length !== 1 || !attackMeta.targets[0]?.castId
    || !candidates.length) return null;
  const unique = new Set();
  const validCandidates = candidates.filter((candidate) => {
    const id = String(candidate?.id || '');
    if (!id || id === String(attackMeta.itemId) || unique.has(id) || !String(candidate?.name || '')) return false;
    unique.add(id);
    return true;
  });
  if (!validCandidates.length) return null;
  return {
    actorId: String(attackMeta.actorId), sourceItemId: String(attackMeta.itemId),
    sourceTargetId: String(attackMeta.targets[0].castId),
    turn: { combatId: String(turn.combatId), round, castId: String(turn.castId) },
    candidates: validCandidates,
  };
}

export function weaponMasteryNickTurnAvailable(lastUse, turn) {
  return weaponMasteryCleaveTurnAvailable(lastUse, turn);
}

/** Resolve the weapon-damage ability modifier exceptions for Cleave and off-hand attacks. */
export function weaponMasteryDamageAbilityModifier(abilityModifier, {
  cleaveAttack = false, offHand = false, twoWeaponFightingStyle = false,
} = {}) {
  const modifier = Number(abilityModifier);
  if (!Number.isFinite(modifier)) return 0;
  if ((cleaveAttack || (offHand && !twoWeaponFightingStyle)) && modifier > 0) return 0;
  return modifier;
}

/** Bind Topple's follow-up to the exact single hit captured by an attack roll. */
export function weaponMasteryToppleAction(attackMeta, target, hit) {
  const mastery = attackMeta?.srd5eWeaponMastery;
  const abilityModifier = Number(mastery?.abilityModifier);
  const proficiencyBonus = Number(mastery?.proficiencyBonus);
  const saveDC = Number(mastery?.saveDC);
  if (hit !== true || !attackMeta?.isAttack || attackMeta.isSpell || attackMeta.isUnarmed
    || mastery?.property !== 'topple' || !attackMeta.actorId || !attackMeta.itemId
    || !target?.castId || !Number.isInteger(abilityModifier) || !Number.isInteger(proficiencyBonus)
    || proficiencyBonus < 0 || !Number.isInteger(saveDC)
    || saveDC !== weaponMasterySaveDC(abilityModifier, proficiencyBonus)) return null;
  return {
    actorId: String(attackMeta.actorId), itemId: String(attackMeta.itemId),
    targetCastId: String(target.castId), saveDC,
  };
}

/** Bind Graze's optional damage to a captured single-target miss. */
export function weaponMasteryGrazeAction(attackMeta, target, hit) {
  const mastery = attackMeta?.srd5eWeaponMastery;
  const abilityModifier = Number(mastery?.abilityModifier);
  const damageType = String(mastery?.damageType || '').trim().toLowerCase();
  if (hit !== false || !attackMeta?.isAttack || attackMeta.isSpell || attackMeta.isUnarmed
    || mastery?.property !== 'graze' || !attackMeta.actorId || !attackMeta.itemId
    || !target?.castId || !['str', 'dex'].includes(mastery.abilityKey)
    || !Number.isInteger(abilityModifier) || abilityModifier <= 0 || !damageType) return null;
  return {
    actorId: String(attackMeta.actorId), itemId: String(attackMeta.itemId),
    targetCastId: String(target.castId), abilityKey: mastery.abilityKey,
    abilityModifier, damageType,
  };
}

/** SRD Push can affect Tiny through Large targets; unknown size needs adjudication. */
export function weaponMasteryPushTargetSizeEligible(targetSize) {
  const size = normalizeCreatureSize(targetSize);
  if (!size) return null;
  return ['tiny', 'sm', 'small', 'med', 'medium', 'lg', 'large'].includes(size);
}

/** Bind the optional post-hit Push action to a single captured target. */
export function weaponMasteryPushAction(attackMeta, target, hit) {
  const mastery = attackMeta?.srd5eWeaponMastery;
  if (hit !== true || !attackMeta?.isAttack || attackMeta.isSpell || attackMeta.isUnarmed
    || mastery?.property !== 'push' || !attackMeta.actorId || !attackMeta.itemId || !target?.castId) return null;
  return { actorId: String(attackMeta.actorId), itemId: String(attackMeta.itemId), targetCastId: String(target.castId) };
}

/**
 * Resolve a mastery follow-up from the original chat roll, never from action
 * button fields. The returned values are snapshots from that roll; callers
 * must still reload the Actor, Item, and Cast before applying any effect.
 */
export function resolveWeaponMasteryAttack(roll, expectedProperty, expectedHit) {
  const meta = roll?.meta;
  const mastery = meta?.srd5eWeaponMastery;
  const targets = meta?.targets;
  if (meta?.isAttack !== true || meta.isSpell === true || meta.isUnarmed === true
    || !['topple', 'graze', 'push', 'cleave'].includes(expectedProperty)
    || mastery?.property !== expectedProperty || !meta.actorId || !meta.itemId
    || !Array.isArray(targets) || targets.length !== 1 || !targets[0]?.castId
    || !Number.isFinite(Number(targets[0].ac))
    || !['str', 'dex'].includes(mastery.abilityKey)
    || meta.srd5eAttackAbility !== mastery.abilityKey) return null;

  const terms = Array.isArray(roll.terms) ? roll.terms : [];
  const d20Terms = terms.filter((term) => term?.kind === 'dice' && Number(term.faces) === 20);
  if (d20Terms.length !== 1 || !Array.isArray(d20Terms[0].rolls) || !d20Terms[0].rolls.length
    || d20Terms[0].rolls.length > 2
    || d20Terms[0].rolls.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 20)
    || (Array.isArray(d20Terms[0].dropped) && d20Terms[0].dropped.some((value) => typeof value !== 'boolean'))
    || (Array.isArray(d20Terms[0].dropped) && d20Terms[0].dropped.length > 0
      && d20Terms[0].dropped.length !== d20Terms[0].rolls.length)
    || (Array.isArray(d20Terms[0].dropped) && d20Terms[0].dropped.length > 0
      && d20Terms[0].dropped.every(Boolean))) return null;
  const outcome = resolveAttackAgainstTarget({ meta, total: Number(roll.total), terms }, Number(targets[0].ac));
  if (!outcome.resolved || outcome.hit !== expectedHit) return null;

  const action = {
    actorId: String(meta.actorId), itemId: String(meta.itemId), targetCastId: String(targets[0].castId),
    property: expectedProperty, hit: outcome.hit,
  };
  if (expectedProperty === 'cleave') {
    const cleave = weaponMasteryCleaveAction(meta, targets[0], outcome.hit);
    if (!cleave) return null;
    action.cleaveTurn = cleave.cleaveTurn;
  }
  if (expectedProperty === 'topple') {
    const abilityModifier = Number(mastery.abilityModifier);
    const proficiencyBonus = Number(mastery.proficiencyBonus);
    const saveDC = Number(mastery.saveDC);
    if (!Number.isInteger(abilityModifier) || !Number.isInteger(proficiencyBonus) || proficiencyBonus < 0
      || !Number.isInteger(saveDC) || saveDC !== weaponMasterySaveDC(abilityModifier, proficiencyBonus)) return null;
    action.saveDC = saveDC;
  }
  if (expectedProperty === 'graze') {
    const abilityModifier = Number(mastery.abilityModifier);
    const damageType = String(mastery.damageType || '').trim().toLowerCase();
    if (!['str', 'dex'].includes(mastery.abilityKey) || !Number.isInteger(abilityModifier) || abilityModifier <= 0 || !damageType) return null;
    action.abilityKey = mastery.abilityKey;
    action.abilityModifier = abilityModifier;
    action.damageType = damageType;
  }
  return action;
}

/** Bind Sap's final-hit confirmation to one mastered weapon and its captured combat turn. */
export function weaponMasterySapAction(attackMeta, target, hit) {
  const context = attackMeta?.srd5eSapContext;
  const round = Number(context?.appliedTurn?.round);
  if (hit !== true || !attackMeta?.isAttack || attackMeta.isSpell || attackMeta.isUnarmed
    || attackMeta.srd5eWeaponMastery?.property !== 'sap'
    || !attackMeta.actorId || !attackMeta.itemId || !target?.castId
    || !context?.combatId || !context?.sourceCastId || !Number.isInteger(round) || round < 1 || !context?.appliedTurn?.castId
    || !attackMeta.srd5eSapOperationId) return null;
  return {
    actorId: String(attackMeta.actorId),
    itemId: String(attackMeta.itemId),
    targetCastId: String(target.castId),
    operationId: String(attackMeta.srd5eSapOperationId),
    context: {
      combatId: String(context.combatId),
      sourceCastId: String(context.sourceCastId),
      appliedTurn: { round, castId: String(context.appliedTurn.castId) },
    },
  };
}

/** Capture the exact qualifying weapon hit for the subsequent damage card. */
export function weaponMasteryVexAction(attackMeta, target, hit, roll) {
  const context = attackMeta?.srd5eVexContext;
  const round = Number(context?.appliedTurn?.round);
  const terms = Array.isArray(roll?.terms) ? roll.terms.filter((term) => term?.kind === 'dice') : [];
  const d20 = terms[0];
  const rolls = Array.isArray(d20?.rolls) ? d20.rolls : [];
  const dropped = Array.isArray(d20?.dropped) ? d20.dropped : [];
  if (hit !== true || !attackMeta?.isAttack || attackMeta.isSpell || attackMeta.isUnarmed
    || attackMeta.srd5eWeaponMastery?.property !== 'vex'
    || !attackMeta.actorId || !attackMeta.itemId || !target?.castId
    || !context?.combatId || !context?.sourceCastId || !Number.isInteger(round) || round < 1 || !context?.appliedTurn?.castId
    || !attackMeta.srd5eVexOperationId || !Number.isFinite(Number(roll?.total)) || !Number.isFinite(Number(target.ac))
    || terms.length !== 1 || Number(d20.faces) !== 20 || !rolls.length
    || rolls.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 20)
    || (dropped.length > 0 && dropped.length !== rolls.length)
    || (dropped.length > 0 && dropped.every(Boolean))) return null;
  return {
    actorId: String(attackMeta.actorId), itemId: String(attackMeta.itemId), targetCastId: String(target.castId),
    operationId: String(attackMeta.srd5eVexOperationId),
    context: {
      combatId: String(context.combatId), sourceCastId: String(context.sourceCastId),
      appliedTurn: { round, castId: String(context.appliedTurn.castId) },
    },
    attack: {
      total: Number(roll.total), targetAC: Number(target.ac),
      terms: terms.map((term) => ({
        kind: 'dice', faces: Number(term.faces), rolls: rolls.map(Number), dropped: dropped.map(Boolean),
      })),
    },
  };
}

/** Capture the exact qualifying Slow weapon hit for its target Cast. */
export function weaponMasterySlowAction(attackMeta, target, hit, roll) {
  const context = attackMeta?.srd5eSlowContext;
  const round = Number(context?.appliedTurn?.round);
  const terms = Array.isArray(roll?.terms) ? roll.terms.filter((term) => term?.kind === 'dice') : [];
  const d20 = terms[0];
  const rolls = Array.isArray(d20?.rolls) ? d20.rolls : [];
  const dropped = Array.isArray(d20?.dropped) ? d20.dropped : [];
  if (hit !== true || !attackMeta?.isAttack || attackMeta.isSpell || attackMeta.isUnarmed
    || attackMeta.srd5eWeaponMastery?.property !== 'slow'
    || !attackMeta.actorId || !attackMeta.itemId || !target?.castId
    || !context?.combatId || !context?.sourceCastId || !Number.isInteger(round) || round < 1 || !context?.appliedTurn?.castId
    || !attackMeta.srd5eSlowOperationId || !Number.isFinite(Number(roll?.total)) || !Number.isFinite(Number(target.ac))
    || terms.length !== 1 || Number(d20.faces) !== 20 || !rolls.length
    || rolls.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 20)
    || (dropped.length > 0 && dropped.length !== rolls.length)
    || (dropped.length > 0 && dropped.every(Boolean))) return null;
  return {
    actorId: String(attackMeta.actorId), itemId: String(attackMeta.itemId), targetCastId: String(target.castId),
    operationId: String(attackMeta.srd5eSlowOperationId),
    context: {
      combatId: String(context.combatId), sourceCastId: String(context.sourceCastId),
      appliedTurn: { round, castId: String(context.appliedTurn.castId) },
    },
    attack: {
      total: Number(roll.total), targetAC: Number(target.ac),
      terms: terms.map((term) => ({
        kind: 'dice', faces: Number(term.faces), rolls: rolls.map(Number), dropped: dropped.map(Boolean),
      })),
    },
  };
}

/** Offer Slow only when the exact attack target received positive applied damage. */
export function weaponMasterySlowDamageRequest(request, damageResults) {
  const targetCastId = String(request?.targetCastId || '');
  if (!targetCastId || !Array.isArray(damageResults)) return null;
  const applied = damageResults.find((result) => String(result?.castId || '') === targetCastId
    && Number.isFinite(Number(result?.finalAmount)) && Number(result.finalAmount) > 0);
  return applied ? { ...request, appliedDamage: Number(applied.finalAmount) } : null;
}

/** Carry Vex from an exact resolved weapon hit into that hit's damage flow. */
/** Resolve the optional change of one known weapon after a Long Rest. */
export function resolveWeaponMasteryReplacement(classIdentifier, masteredIdentifiers, replaceIdentifier, replacementIdentifier,
  proficientWeaponTypes = []) {
  const owned = Array.isArray(masteredIdentifiers) ? masteredIdentifiers : [];
  const options = SRD_WEAPON_MASTERY_OPTIONS.filter((weapon) => {
    if (classIdentifier === 'barbarian') return weapon.rangeType === 'melee';
    if (classIdentifier === 'fighter') return true;
    return proficientWeaponTypes.some((proficiency) => weaponProficiencyMatches(proficiency, weapon));
  });
  // Class level is not part of a replacement; validate the saved feature's own
  // stable count instead of inferring it from character level.
  const expected = owned.length;
  const validSaved = expected > 0 && new Set(owned).size === expected
    && owned.every((identifier) => options.some((weapon) => weapon.identifier === identifier));
  if (!replaceIdentifier && !replacementIdentifier) {
    return { valid: validSaved, skipped: true, reason: validSaved ? '' : 'invalid-saved-choices', choices: owned, options };
  }
  const replacement = options.find((weapon) => weapon.identifier === replacementIdentifier);
  const valid = validSaved && owned.includes(replaceIdentifier)
    && !!replacement && replacementIdentifier !== replaceIdentifier && !owned.includes(replacementIdentifier);
  return {
    valid,
    reason: !validSaved ? 'invalid-saved-choices'
      : !owned.includes(replaceIdentifier) ? 'unknown-current-choice'
      : !replacement || replacementIdentifier === replaceIdentifier || owned.includes(replacementIdentifier)
        ? 'invalid-replacement-choice' : '',
    choices: valid ? owned.map((identifier) => identifier === replaceIdentifier ? replacementIdentifier : identifier) : owned,
    options,
  };
}

/** Build independent, source-validated Long Rest offers for saved class features. */
export function weaponMasteryRestCandidates(items = [], proficientWeaponTypes = []) {
  const classes = (items || []).filter((item) => item.type === 'class');
  return (items || []).filter((item) => item.type === 'feature'
    && (item.system || item.data || {}).identifier === 'weapon-mastery').flatMap((feature) => {
    const data = feature.system || feature.data || {};
    const classIdentifier = String(data.classIdentifier || '').toLowerCase();
    const classItem = classes.find((item) => (item.system || item.data || {}).classIdentifier === classIdentifier);
    const classLevel = Number((classItem?.system || classItem?.data || {}).levels);
    const mastered = data.masteredWeaponIdentifiers;
    const expected = weaponMasteryCountAtLevel(classIdentifier, classLevel);
    const valid = !!feature.id && expected > 0 && Array.isArray(mastered) && mastered.length === expected
      && resolveWeaponMasteryChoices(classIdentifier, mastered, proficientWeaponTypes, expected).valid;
    if (!valid) return [];
    const options = SRD_WEAPON_MASTERY_OPTIONS.filter((weapon) => {
      if (classIdentifier === 'barbarian') return weapon.rangeType === 'melee' && !mastered.includes(weapon.identifier);
      if (classIdentifier === 'fighter') return !mastered.includes(weapon.identifier);
      return !mastered.includes(weapon.identifier)
        && proficientWeaponTypes.some((proficiency) => weaponProficiencyMatches(proficiency, weapon));
    });
    return options.length ? [{ featureId: feature.id, classIdentifier, className: classItem.name || classIdentifier,
      mastered: [...mastered], masteryCount: expected,
      masteredOptions: mastered.map((identifier) => SRD_WEAPON_MASTERY_OPTIONS.find((weapon) => weapon.identifier === identifier)).filter(Boolean),
      options }] : [];
  });
}

/** Resolve first-level mastery choices; unverified or unavailable options fail closed. */
export function resolveWeaponMasteryChoices(classIdentifier, selectedIdentifiers, proficientWeaponTypes = [], requiredCount = undefined) {
  const count = requiredCount ?? WEAPON_MASTERY_LEVEL_ONE_COUNTS[classIdentifier];
  if (!count || !Array.isArray(selectedIdentifiers) || !Array.isArray(proficientWeaponTypes)) {
    return { valid: false, reason: 'unsupported-class-or-selection', choices: [], options: [] };
  }
  const options = SRD_WEAPON_MASTERY_OPTIONS.filter((weapon) => {
    if (classIdentifier === 'barbarian') return weapon.rangeType === 'melee';
    if (classIdentifier === 'fighter') return true;
    return proficientWeaponTypes.some((proficiency) => weaponProficiencyMatches(proficiency, weapon));
  });
  const selected = selectedIdentifiers.map((identifier) => options.find((weapon) => weapon.identifier === identifier)).filter(Boolean);
  const valid = selected.length === count && selected.length === selectedIdentifiers.length
    && new Set(selectedIdentifiers).size === count && options.length >= count;
  return {
    valid,
    reason: valid ? '' : options.length < count ? 'insufficient-proficient-weapons' : 'invalid-choice-count-or-weapon',
    choices: selected.map(({ identifier }) => identifier),
    options,
    required: count,
  };
}

export function resolveWeaponMasteryFeatureData(classIdentifier, classLevel, featureData, selectedIdentifiers, proficientWeaponTypes = []) {
  const masteryCount = weaponMasteryCountAtLevel(classIdentifier, classLevel);
  const resolved = resolveWeaponMasteryChoices(classIdentifier, selectedIdentifiers, proficientWeaponTypes, masteryCount);
  return {
    ...resolved,
    data: resolved.valid ? { ...featureData, masteryCount, masteredWeaponIdentifiers: [...resolved.choices] } : featureData,
  };
}
