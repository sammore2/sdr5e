const EFFECT_EXPIRY = Object.freeze({
  sap: 'source-next-turn-start',
  slow: 'source-next-turn-start',
  vex: 'source-next-turn-end',
});

const EFFECT_TYPES = Object.freeze(Object.keys(EFFECT_EXPIRY));

function asId(value) {
  const id = String(value || '').trim();
  return id && id.length <= 160 ? id : '';
}

function normalizeTurn(value, combatId) {
  const round = Number(value?.round);
  const castId = asId(value?.castId);
  if (!Number.isInteger(round) || round < 1 || !castId) return null;
  return { combatId, round, castId };
}

function turnKey(turn) {
  return `${turn.combatId}:${turn.round}:${turn.castId}`;
}

/** Resolve one actor's exact Cast in combat and capture the active turn identity. */
export function combatEffectContextForActor(combat, casts, actorId) {
  const id = asId(combat?.id);
  const round = Number(combat?.round);
  const index = Number(combat?.currentTurn);
  const combatants = Array.isArray(combat?.combatants) ? combat.combatants : [];
  const actor = asId(actorId);
  if (!id || !Number.isInteger(round) || round < 1 || !Number.isInteger(index)
    || index < 0 || index >= combatants.length || !actor || !Array.isArray(casts)) return null;
  const activeCastId = asId(combatants[index]?.id);
  const castById = new Map(casts.filter((cast) => asId(cast?.id)).map((cast) => [String(cast.id), cast]));
  const matches = combatants.map((combatant) => castById.get(String(combatant?.id || ''))).filter((cast) => cast
    && (String(cast.actorId || '') === actor || (!cast.actorId && String(cast.id) === actor)));
  const active = matches.find((cast) => String(cast.id) === activeCastId);
  const source = active || (matches.length === 1 ? matches[0] : null);
  if (!source) return null;
  return {
    combatId: id,
    sourceCastId: String(source.id),
    appliedTurn: { round, castId: activeCastId },
  };
}

function normalizeRecord(value) {
  const id = asId(value?.id);
  const type = String(value?.type || '').toLowerCase();
  const combatId = asId(value?.combatId);
  const sourceCastId = asId(value?.sourceCastId);
  const targetCastId = asId(value?.targetCastId);
  const appliedTurn = normalizeTurn(value?.appliedTurn, combatId);
  const expiry = EFFECT_EXPIRY[type];
  if (!id || !EFFECT_TYPES.includes(type) || !combatId || !sourceCastId || !targetCastId || !appliedTurn) return null;
  return {
    id, type, combatId, sourceCastId, targetCastId, appliedTurn,
    expiry,
    ...(value.armedTurn && expiry === 'source-next-turn-end'
      ? { armedTurn: normalizeTurn(value.armedTurn, combatId) }
      : {}),
  };
}

/** The state lives on the affected Cast; Vex is kept by its attacker. */
export function combatEffectOwnerCastId(effect) {
  const record = normalizeRecord(effect);
  if (!record) return '';
  return record.type === 'vex' ? record.sourceCastId : record.targetCastId;
}

/** Build one typed effect record from a completed, single-target weapon hit. */
export function createCombatEffectRecord({ id, type, sourceCastId, targetCastId, combatId, appliedTurn } = {}) {
  const record = normalizeRecord({ id, type, sourceCastId, targetCastId, combatId, appliedTurn });
  if (!record || record.appliedTurn.combatId !== record.combatId) return null;
  return record;
}

/** Discard malformed and duplicate sidecar entries without mutating the input. */
export function normalizeCombatEffectRecords(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  const normalized = [];
  for (const value of records) {
    const record = normalizeRecord(value);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    normalized.push(record);
  }
  return normalized;
}

/** Keep only records from the active combat; old combat effects cannot leak into a new encounter. */
export function combatEffectRecordsForActiveCombat(records, combatId) {
  const id = asId(combatId);
  if (!id) return normalizeCombatEffectRecords(records);
  return normalizeCombatEffectRecords(records).filter((record) => record.combatId === id);
}

/** A completed combat leaves no temporary combat effects on any affected Cast. */
export function clearAllCombatEffectRecords() {
  return [];
}

/** Append idempotently by operation ID; repeated completion events cannot duplicate an effect. */
export function appendCombatEffectRecord(records, candidate) {
  const current = normalizeCombatEffectRecords(records);
  const record = normalizeRecord(candidate);
  if (!record) return { valid: false, reason: 'invalid-record', records: current };
  if (current.some((entry) => entry.id === record.id)) return { valid: true, added: false, records: current };
  if (current.length >= 64) return { valid: false, reason: 'capacity', records: current };
  return { valid: true, added: true, records: [...current, record] };
}

/** Apply one native combatTurn transition using Cast identities, never mutable turn indexes. */
export function advanceCombatEffectRecords(records, { combatId, round, currentCastId } = {}) {
  const current = normalizeCombatEffectRecords(records);
  const id = asId(combatId);
  const turn = normalizeTurn({ round, castId: currentCastId }, id);
  if (!id || !turn) return { valid: false, expired: [], records: current };

  const expired = [];
  const next = [];
  for (const record of current) {
    if (record.combatId !== id) {
      next.push(record);
      continue;
    }
    const isNewSourceTurn = turn.castId === record.sourceCastId
      && turnKey(turn) !== turnKey(record.appliedTurn);
    if (record.expiry === 'source-next-turn-start' && isNewSourceTurn) {
      expired.push(record.id);
      continue;
    }
    if (record.expiry === 'source-next-turn-end') {
      if (record.armedTurn && turnKey(turn) !== turnKey(record.armedTurn)) {
        expired.push(record.id);
        continue;
      }
      if (!record.armedTurn && isNewSourceTurn) {
        next.push({ ...record, armedTurn: turn });
        continue;
      }
    }
    next.push(record);
  }
  return { valid: true, expired, records: next };
}

/** Clear only effects belonging to the combat that ended. */
export function clearCombatEffectRecords(records, combatId) {
  const id = asId(combatId);
  if (!id) return normalizeCombatEffectRecords(records);
  return normalizeCombatEffectRecords(records).filter((record) => record.combatId !== id);
}

/** Match only effects applicable to this attack; Vex is target-specific, Sap is not. */
export function combatEffectsForAttack(records, { combatId, sourceCastId, targetCastId } = {}) {
  const combat = asId(combatId);
  const source = asId(sourceCastId);
  const target = asId(targetCastId);
  if (!combat || !source) return [];
  return normalizeCombatEffectRecords(records).filter((record) => record.combatId === combat
    && ((record.type === 'sap' && record.targetCastId === source)
      || (record.type === 'vex' && record.sourceCastId === source && record.targetCastId === target)));
}

/** Multiple Slow hits still cap the affected Cast's speed reduction at 10 feet. */
export function combatSpeedPenaltyFeet(records, combatId, castId) {
  const combat = asId(combatId);
  const target = asId(castId);
  if (!combat || !target) return 0;
  return normalizeCombatEffectRecords(records).some((record) => record.type === 'slow'
    && record.combatId === combat && record.targetCastId === target) ? 10 : 0;
}

/** Consume only after a server-resolved attack event; canceled dialogs never call this. */
export function consumeCombatEffectRecords(records, effectIds) {
  const current = normalizeCombatEffectRecords(records);
  const ids = new Set((Array.isArray(effectIds) ? effectIds : []).map(asId).filter(Boolean));
  if (!ids.size) return current;
  return current.filter((record) => !ids.has(record.id));
}
