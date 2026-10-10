/** Reconcile actor-owned Unconscious markers without deleting manual markers. */
export function reconcileUnconsciousMarkers(casts = [], ownedCastIds = [], shouldBeUnconscious = false) {
  const owned = new Set((Array.isArray(ownedCastIds) ? ownedCastIds : []).map(String).filter(Boolean));
  const updates = [];
  const seen = new Set();

  for (const cast of Array.isArray(casts) ? casts : []) {
    const id = String(cast?.id || '');
    if (!id) continue;
    seen.add(id);
    const markers = Array.isArray(cast.statusMarkers) ? [...cast.statusMarkers] : [];
    const hasUnconscious = markers.includes('unconscious');

    if (shouldBeUnconscious && !hasUnconscious) {
      markers.push('unconscious');
      owned.add(id);
      updates.push({ id, statusMarkers: markers });
    } else if (!shouldBeUnconscious && owned.has(id)) {
      const nextMarkers = markers.filter((marker) => marker !== 'unconscious');
      if (nextMarkers.length !== markers.length) updates.push({ id, statusMarkers: nextMarkers });
      owned.delete(id);
    }
  }

  // Keep ownership for temporarily missing tokens so a later sync can remove
  // an automatically applied marker after healing. Manual markers are never
  // added to this set and therefore survive healing.
  const remainingOwned = [...owned].sort();
  return { updates, ownedCastIds: remainingOwned, sawAnyCast: seen.size > 0 };
}
