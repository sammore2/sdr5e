const PENDING_REROLLS = new Map();
const LOCKED_ACTORS = new Set();

function parseSupportedFormula(formula) {
  const match = String(formula || '').replace(/\s+/g, '').match(/^(\d+)d(\d+)(?:(kh|kl)(\d+))?((?:[+-]\d+)*)$/i);
  if (!match) return null;
  const count = Number(match[1]);
  const faces = Number(match[2]);
  const keepMode = match[3]?.toLowerCase() || '';
  const keepCount = match[4] ? Number(match[4]) : count;
  const modifierText = match[5] || '';
  const modifiers = [...modifierText.matchAll(/([+-])(\d+)/g)]
    .reduce((sum, [, sign, amount]) => sum + (sign === '-' ? -1 : 1) * Number(amount), 0);
  if (count < 1 || faces < 2 || keepCount < 1 || keepCount > count) return null;
  if (keepMode && keepCount >= count) return null;
  return { count, faces, keepMode, keepCount, modifiers };
}

function keptIndices(values, mode, count) {
  if (!mode || count >= values.length) return new Set(values.map((_, index) => index));
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => {
    const byValue = mode === 'kh' ? b.value - a.value : a.value - b.value;
    return byValue || a.index - b.index;
  });
  return new Set(ordered.slice(0, count).map(({ index }) => index));
}

export function inspectHeroicInspirationReroll(roll, termIndex, dieIndex) {
  if (!roll?.meta?.actorId || roll.meta.srd5eHeroicInspirationReroll) return null;
  // The current companion result message has a verified public-chat path only.
  // Do not expose blind/private/self rolls through a new result message.
  if (roll.mode !== 'public') return null;
  const parsed = parseSupportedFormula(roll.formula);
  const diceTerms = (roll.terms || []).filter((term) => term.kind === 'dice');
  const otherTerms = (roll.terms || []).filter((term) => term.kind !== 'dice' && term.kind !== 'modifier');
  if (!parsed || diceTerms.length !== 1 || otherTerms.length) return null;
  const term = diceTerms[0];
  const actualTermIndex = (roll.terms || []).indexOf(term);
  if (actualTermIndex !== Number(termIndex) || Number(term.faces) !== parsed.faces) return null;
  const values = (term.rolls || []).map(Number);
  if (values.length !== parsed.count || values.some((value) => !Number.isInteger(value) || value < 1 || value > parsed.faces)) return null;
  const kept = keptIndices(values, parsed.keepMode, parsed.keepCount);
  const dropped = term.dropped || [];
  if (values.some((_, index) => !!dropped[index] === kept.has(index))) return null;
  if (!Number.isInteger(Number(dieIndex)) || Number(dieIndex) < 0 || Number(dieIndex) >= values.length) return null;
  const expectedTotal = [...kept].reduce((sum, index) => sum + values[index], parsed.modifiers);
  if (Number(roll.total) !== expectedTotal) return null;
  return Object.freeze({
    actorId: String(roll.meta.actorId), formula: roll.formula, total: Number(roll.total),
    faces: parsed.faces, keepMode: parsed.keepMode, keepCount: parsed.keepCount,
    modifiers: parsed.modifiers, values: Object.freeze(values), dropped: Object.freeze(values.map((_, index) => !!dropped[index])),
    dieIndex: Number(dieIndex), mode: roll.mode || 'public',
    modifierTerms: Object.freeze((roll.terms || []).filter((item) => item.kind === 'modifier')
      .map((item) => Object.freeze({ kind: 'modifier', value: Number(item.value) || 0 }))),
    meta: Object.freeze({
      actorId: String(roll.meta.actorId),
      ...(Number.isFinite(Number(roll.meta.dc)) ? { dc: Number(roll.meta.dc) } : {}),
      ...(Array.isArray(roll.meta.targets) ? { targets: roll.meta.targets.map(({ castId, name, ac }) => ({
        ...(castId ? { castId: String(castId) } : {}), name: String(name || ''), ac: Number(ac),
      })) } : {}),
      ...(roll.meta.isAttack ? { isAttack: true } : {}),
      ...(roll.meta.isSpell ? { isSpell: true } : {}),
      ...(roll.meta.isUnarmed ? { isUnarmed: true } : {}),
      ...(roll.meta.srd5eAttackAbility ? { srd5eAttackAbility: String(roll.meta.srd5eAttackAbility) } : {}),
      ...(roll.meta.srd5eWeaponMastery && typeof roll.meta.srd5eWeaponMastery === 'object' ? { srd5eWeaponMastery: {
        classIdentifier: String(roll.meta.srd5eWeaponMastery.classIdentifier || ''),
        weaponIdentifier: String(roll.meta.srd5eWeaponMastery.weaponIdentifier || ''),
        property: String(roll.meta.srd5eWeaponMastery.property || ''),
        ...(roll.meta.srd5eWeaponMastery.abilityKey ? { abilityKey: String(roll.meta.srd5eWeaponMastery.abilityKey) } : {}),
        ...(Number.isFinite(Number(roll.meta.srd5eWeaponMastery.abilityModifier)) ? { abilityModifier: Number(roll.meta.srd5eWeaponMastery.abilityModifier) } : {}),
        ...(Number.isFinite(Number(roll.meta.srd5eWeaponMastery.proficiencyBonus)) ? { proficiencyBonus: Number(roll.meta.srd5eWeaponMastery.proficiencyBonus) } : {}),
        ...(roll.meta.srd5eWeaponMastery.damageType ? { damageType: String(roll.meta.srd5eWeaponMastery.damageType) } : {}),
        ...(Number.isFinite(Number(roll.meta.srd5eWeaponMastery.saveDC)) ? { saveDC: Number(roll.meta.srd5eWeaponMastery.saveDC) } : {}),
      } } : {}),
      ...(roll.meta.srd5eConcentrationSave === true ? {
        srd5eConcentrationSave: true,
        srd5eConcentrationRecordType: roll.meta.srd5eConcentrationRecordType === 'cast' ? 'cast' : 'actor',
        srd5eAbilityKey: 'con',
        srd5eConcentrationOriginId: String(roll.meta.srd5eConcentrationOriginId || ''),
        srd5eConcentrationId: String(roll.meta.srd5eConcentrationId || ''),
        srd5eConcentrationSaveAttemptId: String(roll.meta.srd5eConcentrationSaveAttemptId || ''),
        srd5eConcentrationDamage: Number(roll.meta.srd5eConcentrationDamage),
      } : {}),
      ...(roll.meta.srd5eSapContext && typeof roll.meta.srd5eSapContext === 'object' ? { srd5eSapContext: {
        combatId: String(roll.meta.srd5eSapContext.combatId || ''),
        sourceCastId: String(roll.meta.srd5eSapContext.sourceCastId || ''),
        ...(Number.isInteger(Number(roll.meta.srd5eSapContext.appliedTurn?.round)) ? { appliedTurn: {
          round: Number(roll.meta.srd5eSapContext.appliedTurn.round),
          castId: String(roll.meta.srd5eSapContext.appliedTurn.castId || ''),
        } } : {}),
      } } : {}),
      ...(roll.meta.srd5eSapOperationId ? { srd5eSapOperationId: String(roll.meta.srd5eSapOperationId) } : {}),
      ...(roll.meta.srd5eVexContext && typeof roll.meta.srd5eVexContext === 'object' ? { srd5eVexContext: {
        combatId: String(roll.meta.srd5eVexContext.combatId || ''),
        sourceCastId: String(roll.meta.srd5eVexContext.sourceCastId || ''),
        ...(Number.isInteger(Number(roll.meta.srd5eVexContext.appliedTurn?.round)) ? { appliedTurn: {
          round: Number(roll.meta.srd5eVexContext.appliedTurn.round),
          castId: String(roll.meta.srd5eVexContext.appliedTurn.castId || ''),
        } } : {}),
      } } : {}),
      ...(roll.meta.srd5eVexOperationId ? { srd5eVexOperationId: String(roll.meta.srd5eVexOperationId) } : {}),
      ...(roll.meta.srd5eSlowContext && typeof roll.meta.srd5eSlowContext === 'object' ? { srd5eSlowContext: {
        combatId: String(roll.meta.srd5eSlowContext.combatId || ''),
        sourceCastId: String(roll.meta.srd5eSlowContext.sourceCastId || ''),
        ...(Number.isInteger(Number(roll.meta.srd5eSlowContext.appliedTurn?.round)) ? { appliedTurn: {
          round: Number(roll.meta.srd5eSlowContext.appliedTurn.round),
          castId: String(roll.meta.srd5eSlowContext.appliedTurn.castId || ''),
        } } : {}),
      } } : {}),
      ...(roll.meta.srd5eSlowOperationId ? { srd5eSlowOperationId: String(roll.meta.srd5eSlowOperationId) } : {}),
      ...(roll.meta.srd5eAbilityKey ? { srd5eAbilityKey: String(roll.meta.srd5eAbilityKey) } : {}),
      ...(Number.isFinite(Number(roll.meta.srd5eIndomitableMightScore)) ? { srd5eIndomitableMightScore: Number(roll.meta.srd5eIndomitableMightScore) } : {}),
      ...(roll.meta.itemId ? { itemId: String(roll.meta.itemId) } : {}),
      ...(roll.meta.srd5eDamage ? { srd5eDamage: {
        type: String(roll.meta.srd5eDamage.type || ''),
        ...(Array.isArray(roll.meta.srd5eDamage.components) ? { components: roll.meta.srd5eDamage.components.map((c) => ({
          type: String(c?.type || ''), formula: String(c?.formula || ''),
        })) } : {}),
        critical: !!roll.meta.srd5eDamage.critical,
        ...(roll.meta.srd5eDamage.targetBound === true ? { targetBound: true, targetId: String(roll.meta.srd5eDamage.targetId || '') } : {}),
        ...(roll.meta.srd5eDamage.vexRequest && typeof roll.meta.srd5eDamage.vexRequest === 'object'
          ? { vexRequest: roll.meta.srd5eDamage.vexRequest } : {}),
      } } : {}),
      ...(roll.meta.srd5eHitDieRequestId ? { srd5eHitDieRequestId: String(roll.meta.srd5eHitDieRequestId) } : {}),
      ...(roll.meta.label ? { originalLabel: String(roll.meta.label) } : {}),
    }),
  });
}

export function resolveHeroicInspirationReroll(snapshot, replacementRoll) {
  if (!snapshot || !replacementRoll?.terms) return null;
  const terms = replacementRoll.terms.filter((term) => term.kind === 'dice');
  if (terms.length !== 1 || Number(terms[0].faces) !== snapshot.faces) return null;
  const replacement = (terms[0].rolls || []).map(Number);
  if (replacement.length !== 1 || !Number.isInteger(replacement[0]) || replacement[0] < 1 || replacement[0] > snapshot.faces) return null;
  const values = [...snapshot.values];
  values[snapshot.dieIndex] = replacement[0];
  const kept = keptIndices(values, snapshot.keepMode, snapshot.keepCount);
  const total = [...kept].reduce((sum, index) => sum + values[index], snapshot.modifiers);
  return {
    total, replacement: replacement[0], originalDie: snapshot.values[snapshot.dieIndex], values,
    keptIndices: [...kept],
    terms: [
      { kind: 'dice', faces: snapshot.faces, rolls: values, dropped: values.map((_, index) => !kept.has(index)) },
      ...snapshot.modifierTerms.map((term) => ({ ...term })),
    ],
  };
}

export function registerHeroicInspirationReroll(requestId, snapshot) {
  if (!requestId || !snapshot || LOCKED_ACTORS.has(snapshot.actorId)) return false;
  LOCKED_ACTORS.add(snapshot.actorId);
  PENDING_REROLLS.set(String(requestId), snapshot);
  return true;
}

export function getHeroicInspirationReroll(requestId) {
  return PENDING_REROLLS.get(String(requestId)) || null;
}

export function clearHeroicInspirationReroll(requestId) {
  const id = String(requestId);
  const snapshot = PENDING_REROLLS.get(id);
  if (!snapshot) return false;
  PENDING_REROLLS.delete(id);
  LOCKED_ACTORS.delete(snapshot.actorId);
  return true;
}
