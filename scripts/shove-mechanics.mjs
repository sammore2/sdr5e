import { creatureSizeEligibleByOneStep } from './creature-size-mechanics.mjs';

export function resolveShovePrerequisites({ attackerSize, targetSize, sizeConfirmed, withinRangeConfirmed }) {
  const sizeEligible = creatureSizeEligibleByOneStep(attackerSize, targetSize);
  if (sizeEligible === false) return { valid: false, reason: 'target-too-large' };
  if (sizeEligible === null && sizeConfirmed !== true) return { valid: false, reason: 'confirm-size' };
  if (withinRangeConfirmed !== true) return { valid: false, reason: 'range-required' };
  return { valid: true, sizeEligible };
}

export function resolveShoveOutcome(saveOutcome, effect) {
  if (saveOutcome === 'success') return { valid: true, outcome: 'success', effect: null, applyProne: false, manualMovement: false };
  if (saveOutcome !== 'failure') return { valid: false, reason: 'unadjudicated-save' };
  if (effect === 'prone') return { valid: true, outcome: 'failure', effect, applyProne: true, manualMovement: false };
  if (effect === 'push_5ft') return { valid: true, outcome: 'failure', effect, applyProne: false, manualMovement: true };
  return { valid: false, reason: 'invalid-effect' };
}

export function addProneMarker(markers, shoveOutcome) {
  const current = Array.isArray(markers) ? markers : [];
  if (!shoveOutcome?.valid || shoveOutcome.applyProne !== true) return current;
  return [...new Set([...current, 'prone'])];
}
