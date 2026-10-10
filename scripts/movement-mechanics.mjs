import { feetToMeters } from './config.mjs';
import { combatSpeedPenaltyFeet } from './combat-effects.mjs';

export const BARBARIAN_FAST_MOVEMENT_BONUS = feetToMeters(10);

/** Apply combat Slow to a Cast's walking Speed without mutating its Actor data.
 * Crawling and climb/swim movement without a dedicated Speed derive from walk
 * later in the movement ledger, so they inherit the reduced value there.
 */
export function speedsWithCombatEffects(speeds = {}, combatEffects = [], combatId, castId) {
  const next = { ...speeds };
  const penalty = feetToMeters(combatSpeedPenaltyFeet(combatEffects, combatId, castId));
  if (penalty > 0) next.walk = Math.max(0, (Number(speeds.walk) || 0) - penalty);
  return next;
}

/** SRD 5.2 conditions whose "Speed 0" effect sets every movement mode to 0 and prevents increases. */
export const ZERO_SPEED_CONDITIONS = Object.freeze(['grappled', 'paralyzed', 'petrified', 'restrained', 'unconscious']);

/** Zeroes every numeric movement speed while a Speed 0 condition applies (SRD: "Your Speed is 0"). */
export function speedsWithConditions(speeds = {}, conditions = []) {
  const list = Array.isArray(conditions) ? conditions : [];
  if (!list.some((condition) => ZERO_SPEED_CONDITIONS.includes(condition))) return { ...speeds };
  const next = {};
  for (const [mode, value] of Object.entries(speeds)) next[mode] = typeof value === 'number' ? 0 : value;
  return next;
}

export function hasBarbarianFastMovement(items = []) {
  const hasEligibleBarbarian = items.some((item) => {
    if (item.type !== 'class') return false;
    const data = item.system || item.data || {};
    return data.classIdentifier === 'barbarian' && Number(data.levels) >= 5;
  });
  if (!hasEligibleBarbarian) return false;

  return !items.some((item) => {
    if (item.type !== 'armor') return false;
    const data = item.system || item.data || {};
    return data.equipped === true && String(data.armorType || '').toLowerCase() === 'heavy';
  });
}

export const MOVEMENT_LEDGER_MODES = Object.freeze(['walk', 'climb', 'crawl', 'swim', 'fly', 'burrow']);

export function normalizeMovementLedger(value = {}) {
  const segments = Array.isArray(value?.segments) ? value.segments : [];
  return {
    dashBonuses: Array.isArray(value?.dashBonuses) ? value.dashBonuses.flatMap((bonus) => {
      const mode = String(bonus?.mode || '');
      const amount = Number(bonus?.amount);
      if (!['walk', 'climb', 'swim', 'fly', 'burrow'].includes(mode) || !Number.isFinite(amount) || amount <= 0) return [];
      return [{ mode, amount: Math.round(amount * 100) / 100 }];
    }) : [],
    segments: segments.flatMap((segment) => {
      const distance = Number(segment?.distance);
      const mode = String(segment?.mode || '');
      if (!Number.isFinite(distance) || distance <= 0 || !MOVEMENT_LEDGER_MODES.includes(mode)) return [];
      return [{ distance: Math.round(distance * 100) / 100, mode, difficultTerrain: segment?.difficultTerrain === true }];
    }),
  };
}

function selectedMovementSpeed(mode, speeds = {}) {
  const walk = Math.max(0, Number(speeds.walk) || 0);
  if (mode === 'crawl') return { speed: walk, specialModeExtra: true };
  if (mode === 'climb') {
    const climb = Math.max(0, Number(speeds.climb) || 0);
    return climb > 0 ? { speed: climb, specialModeExtra: false } : { speed: walk, specialModeExtra: true };
  }
  if (mode === 'swim') {
    const swim = Math.max(0, Number(speeds.swim) || 0);
    return swim > 0 ? { speed: swim, specialModeExtra: false } : { speed: walk, specialModeExtra: true };
  }
  return { speed: Math.max(0, Number(speeds[mode]) || 0), specialModeExtra: false };
}

export function evaluateMovementLedger(value = {}, speeds = {}) {
  const ledger = normalizeMovementLedger(value);
  const dashBonus = Math.round(ledger.dashBonuses.reduce((sum, bonus) => sum + bonus.amount, 0) * 100) / 100;
  let spent = 0;
  let lastMode = 'walk';
  const segments = ledger.segments.map((segment) => {
    const { speed, specialModeExtra } = selectedMovementSpeed(segment.mode, speeds);
    const multiplier = 1 + (specialModeExtra ? (segment.difficultTerrain ? 2 : 1) : (segment.difficultTerrain ? 1 : 0));
    const cost = Math.round(segment.distance * multiplier * 100) / 100;
    const before = spent;
    const valid = speed > 0 && (before + cost) <= speed + dashBonus + 0.001;
    spent = Math.round((spent + cost) * 100) / 100;
    lastMode = segment.mode;
    return { ...segment, speed, cost, spent, valid };
  });
  const { speed: selectedSpeed } = selectedMovementSpeed(lastMode, speeds);
  return {
    segments,
    dashBonuses: ledger.dashBonuses,
    dashBonus,
    spent,
    speed: selectedSpeed,
    remaining: Math.round((selectedSpeed + dashBonus - spent) * 100) / 100,
    valid: segments.every((segment) => segment.valid),
  };
}

export function addMovementSegment(value, segment, speeds) {
  const ledger = normalizeMovementLedger(value);
  const distance = Number(segment?.distance);
  const mode = String(segment?.mode || '');
  if (!Number.isFinite(distance) || distance <= 0 || !MOVEMENT_LEDGER_MODES.includes(mode)) {
    return { valid: false, reason: 'invalid-segment', ledger };
  }
  if (!evaluateMovementLedger(ledger, speeds).valid) return { valid: false, reason: 'movement-exceeded', ledger };
  const candidate = { ...ledger, segments: [...ledger.segments, { distance, mode, difficultTerrain: segment?.difficultTerrain === true }] };
  const evaluated = evaluateMovementLedger(candidate, speeds);
  const last = evaluated.segments.at(-1);
  if (!last?.valid) return { valid: false, reason: last?.speed > 0 ? 'movement-exceeded' : 'speed-unavailable', ledger };
  return { valid: true, ledger: normalizeMovementLedger(candidate), evaluation: evaluated };
}

export function addDashMovementBonus(value, mode, speeds = {}) {
  const ledger = normalizeMovementLedger(value);
  if (!['walk', 'climb', 'swim', 'fly', 'burrow'].includes(mode)) return { valid: false, reason: 'invalid-speed', ledger };
  const speed = Math.max(0, Number(speeds[mode]) || 0);
  if (speed <= 0) return { valid: false, reason: 'speed-unavailable', ledger };
  const candidate = { ...ledger, dashBonuses: [...ledger.dashBonuses, { mode, amount: speed }] };
  return { valid: true, ledger: normalizeMovementLedger(candidate), evaluation: evaluateMovementLedger(candidate, speeds) };
}

export function removeDashMovementBonus(value, index) {
  const ledger = normalizeMovementLedger(value);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= ledger.dashBonuses.length) return ledger;
  return { ...ledger, dashBonuses: ledger.dashBonuses.filter((_, row) => row !== i) };
}

export function removeMovementSegment(value, index) {
  const ledger = normalizeMovementLedger(value);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= ledger.segments.length) return ledger;
  return { ...ledger, segments: ledger.segments.filter((_, row) => row !== i) };
}

export function resetMovementLedger() {
  return { dashBonuses: [], segments: [] };
}

export function movementLedgerView(value, speeds, localize = (key) => key) {
  const evaluated = evaluateMovementLedger(value, speeds);
  return {
    ...evaluated,
    segments: evaluated.segments.map((segment, index) => ({
      ...segment,
      index,
      modeLabel: localize(`SDR5E.MovementLedger.Mode.${segment.mode}`),
      distanceText: `${segment.distance} m`,
      costText: `${segment.cost} m`,
    })),
    dashBonuses: evaluated.dashBonuses.map((bonus, index) => ({
      ...bonus,
      index,
      modeLabel: localize(`SDR5E.MovementLedger.Mode.${bonus.mode}`),
      amountText: `${bonus.amount} m`,
    })),
    title: localize('SDR5E.MovementLedger.Title'),
    castSelect: localize('SDR5E.MovementLedger.CastSelect'),
    castUnavailable: localize('SDR5E.MovementLedger.CastUnavailable'),
    slowPenalty: localize('SDR5E.MovementLedger.SlowPenalty'),
    note: localize('SDR5E.MovementLedger.Note'),
    distanceLabel: localize('SDR5E.MovementLedger.Distance'),
    modeFieldLabel: localize('SDR5E.MovementLedger.ModeLabel'),
    difficultLabel: localize('SDR5E.MovementLedger.DifficultTerrain'),
    addLabel: localize('SDR5E.MovementLedger.Add'),
    resetLabel: localize('SDR5E.MovementLedger.Reset'),
    spentLabel: localize('SDR5E.MovementLedger.Spent'),
    remainingLabel: localize('SDR5E.MovementLedger.Remaining'),
    removeLabel: localize('SDR5E.MovementLedger.Remove'),
    dashLabel: localize('SDR5E.MovementLedger.Dash'),
    addDashLabel: localize('SDR5E.MovementLedger.AddDash'),
    dashBonusLabel: localize('SDR5E.MovementLedger.DashBonus'),
    dashActionNote: localize('SDR5E.MovementLedger.DashActionNote'),
    removeDashLabel: localize('SDR5E.MovementLedger.RemoveDash'),
    meterUnit: localize('SDR5E.MovementLedger.Meters'),
    exceededMessage: localize('SDR5E.MovementLedger.Exceeded'),
    unavailableMessage: localize('SDR5E.MovementLedger.SpeedUnavailable'),
    modes: MOVEMENT_LEDGER_MODES.map((key) => ({ key, label: localize(`SDR5E.MovementLedger.Mode.${key}`) })),
    dashModes: ['walk', 'climb', 'swim', 'fly', 'burrow'].filter((key) => Number(speeds?.[key]) > 0).map((key) => ({ key, label: localize(`SDR5E.MovementLedger.Mode.${key}`) })),
    empty: evaluated.segments.length === 0,
  };
}
