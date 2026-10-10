/** Resolve concentration handling after damage has been fully mitigated. */
export function resolveConcentrationAfterDamage({ finalDamage, hpAfter, resources = {} }) {
  const origin = resources.concentratingOn || '';
  if (hpAfter <= 0) {
    return { saveDamage: null, clear: true, originToRemove: origin };
  }
  if (finalDamage > 0 && resources.concentrating) {
    return { saveDamage: finalDamage, clear: false, originToRemove: '' };
  }
  return { saveDamage: null, clear: false, originToRemove: '' };
}

/** SRD Constitution save DC after damage: at least 10 and never above 30. */
export function concentrationSaveDc(damage) {
  const amount = Number(damage);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.min(30, Math.max(10, Math.floor(amount / 2)));
}

/** Keep separate damage checks resolvable until their Concentration ends. */
export function pendingConcentrationSaveAttempts(resources = {}) {
  const attempts = Array.isArray(resources.concentrationSaveAttemptIds)
    ? resources.concentrationSaveAttemptIds.map(String).filter(Boolean)
    : [];
  const latest = String(resources.concentrationSaveAttemptId || '');
  if (!attempts.length && latest) attempts.push(latest);
  return [...new Set(attempts)];
}

export function addConcentrationSaveAttempt(resources = {}, attemptId) {
  const id = String(attemptId || '');
  if (!id) return null;
  const attempts = pendingConcentrationSaveAttempts(resources);
  return { concentrationSaveAttemptId: id, concentrationSaveAttemptIds: [...attempts.filter((entry) => entry !== id), id] };
}

export function replaceConcentrationSaveAttempt(resources = {}, previousId, nextId) {
  const previous = String(previousId || '');
  const next = String(nextId || '');
  if (!previous || !next) return null;
  const attempts = pendingConcentrationSaveAttempts(resources);
  if (!attempts.includes(previous)) return null;
  return {
    concentrationSaveAttemptId: next,
    concentrationSaveAttemptIds: [...new Set(attempts.map((entry) => entry === previous ? next : entry))],
  };
}

export function restoreConcentrationSaveAttempt(resources = {}, currentId, previousId, previousAttempts = [], previousLatestId = '') {
  const current = String(currentId || '');
  const previous = String(previousId || '');
  if (!current || !previous || !pendingConcentrationSaveAttempts(resources).includes(current)) return null;
  const attempts = previousAttempts.map(String).filter(Boolean);
  const restored = [...new Set([...attempts.filter((id) => id !== current), previous])];
  const latest = String(resources.concentrationSaveAttemptId || '') === current
    ? (restored.includes(String(previousLatestId)) ? String(previousLatestId) : previous)
    : String(resources.concentrationSaveAttemptId || '');
  return { concentrationSaveAttemptId: latest, concentrationSaveAttemptIds: restored };
}

/** Read a server-posted concentration save card and derive its outcome. */
export function resolveConcentrationSaveRoll(roll) {
  const meta = roll?.meta;
  const d20Terms = Array.isArray(roll?.terms)
    ? roll.terms.filter((term) => term?.kind === 'dice' && Number(term.faces) === 20)
    : [];
  const dc = Number(meta?.dc);
  const damage = Number(meta?.srd5eConcentrationDamage);
  const total = Number(roll?.total);
  if (meta?.srd5eConcentrationSave !== true || !meta.actorId || !meta.srd5eConcentrationOriginId
    || !meta.srd5eConcentrationId || !meta.srd5eConcentrationSaveAttemptId
    || meta.srd5eAbilityKey !== 'con' || !Number.isFinite(damage) || damage <= 0
    || !Number.isInteger(dc) || dc !== concentrationSaveDc(damage)
    || !Number.isFinite(total) || d20Terms.length !== 1
    || !Array.isArray(d20Terms[0].rolls) || !d20Terms[0].rolls.length
    || d20Terms[0].rolls.length > 2
    || d20Terms[0].rolls.some((value) => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 20)
    || (Array.isArray(d20Terms[0].dropped) && d20Terms[0].dropped.some((value) => typeof value !== 'boolean'))
    || (Array.isArray(d20Terms[0].dropped) && d20Terms[0].dropped.length > 0
      && d20Terms[0].dropped.length !== d20Terms[0].rolls.length)
    || (Array.isArray(d20Terms[0].dropped) && d20Terms[0].dropped.length > 0
      && d20Terms[0].dropped.every(Boolean))) return null;
  return {
    actorId: String(meta.actorId),
    recordType: meta.srd5eConcentrationRecordType === 'cast' ? 'cast' : 'actor',
    originId: String(meta.srd5eConcentrationOriginId),
    concentrationId: String(meta.srd5eConcentrationId),
    attemptId: String(meta.srd5eConcentrationSaveAttemptId),
    dc,
    total,
    success: total >= dc,
  };
}

/** Build the state change for any rule that ends a caster's Concentration. */
export function resolveConcentrationEnd(resources = {}) {
  if (resources.concentrating !== true) return { ended: false, originToRemove: '', patch: null };
  return {
    ended: true,
    originToRemove: String(resources.concentratingOn || ''),
    patch: { concentrating: false, concentratingOn: '', concentrationId: '', concentrationSaveAttemptId: '', concentrationSaveAttemptIds: [] },
  };
}

const CONCENTRATION_ENDING_CONDITIONS = new Set(['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']);

/** Resolve the SRD ending trigger from condition markers on any token for the caster. */
export function resolveConcentrationAfterConditionUpdate(resources = {}, cast = {}) {
  const data = cast?.data || cast;
  const statusMarkers = Array.isArray(data?.statusMarkers) ? data.statusMarkers : [];
  const condition = statusMarkers.find((marker) => CONCENTRATION_ENDING_CONDITIONS.has(String(marker).toLocaleLowerCase())) || '';
  if (!condition) return { ...resolveConcentrationEnd({}), triggered: false, condition: '' };
  return { ...resolveConcentrationEnd(resources), triggered: true, condition: String(condition).toLocaleLowerCase() };
}
