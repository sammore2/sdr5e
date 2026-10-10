import { creatureSizeEligibleByOneStep, normalizeCreatureSize } from './creature-size-mechanics.mjs';

export function normalizeGrappleSize(value) {
  return normalizeCreatureSize(value);
}

export function grappleSizeEligible(grapplerSize, targetSize) {
  return creatureSizeEligibleByOneStep(grapplerSize, targetSize);
}

export function resolveGrapplePrerequisites({ grapplerSize, targetSize, sizeConfirmed, freeHandConfirmed, withinRangeConfirmed }) {
  const sizeEligible = grappleSizeEligible(grapplerSize, targetSize);
  if (sizeEligible === false) return { valid: false, reason: 'target-too-large' };
  if (sizeEligible === null && sizeConfirmed !== true) return { valid: false, reason: 'confirm-size' };
  if (freeHandConfirmed !== true) return { valid: false, reason: 'free-hand-required' };
  if (withinRangeConfirmed !== true) return { valid: false, reason: 'range-required' };
  return { valid: true, sizeEligible };
}

export function canUseGrappleHand(activeGrapples, hand, targetCastId) {
  const rows = Array.isArray(activeGrapples) ? activeGrapples : [];
  return !rows.some((entry) => entry?.hand === hand && String(entry?.targetCastId || '') !== String(targetCastId || ''));
}

export function recordGrapple(activeGrapples, grapple) {
  const rows = Array.isArray(activeGrapples) ? activeGrapples : [];
  const targetCastId = String(grapple?.targetCastId || '');
  if (!targetCastId || !['left', 'right'].includes(grapple?.hand) || !Number.isFinite(Number(grapple?.escapeDC))) return null;
  return [...rows.filter((entry) => String(entry?.targetCastId || '') !== targetCastId), {
    targetCastId,
    hand: grapple.hand,
    escapeDC: Number(grapple.escapeDC),
  }];
}

export function removeGrapple(activeGrapples, targetCastId) {
  return (Array.isArray(activeGrapples) ? activeGrapples : []).filter((entry) => String(entry?.targetCastId || '') !== String(targetCastId || ''));
}
