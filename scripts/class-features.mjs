// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/class-features.mjs
//
// Grants the class-feature items a character unlocks between two class
// levels (character creation starting above level 1, or a Level Up wizard
// step). Pulls from the compendium the same way every other picker in this
// ruleset does — GET /compendium/browse/entries?entryType=feature, fanned
// out across every loaded source, filtered client-side by `classIdentifier`
// and `levelGained` (needs `includeData: true`, see compendium-source.ts's
// querySourceEntries doc comment). No hardcoded feature table in JS: a
// third-party class pack that ships its own `feature` entries with the
// right `classIdentifier`/`levelGained` fields works without touching this
// file.
//
// Currently only the SRD's own Fighter entries exist (packs/features.json)
// — this is the proof of concept before the other 11 classes get the same
// treatment. Every other class's `grantClassFeatures` call below is just a
// no-op today (the fan-out search returns nothing for their identifier).
// ══════════════════════════════════════════════════════════════════════════

import { api } from '/_loom/sdk/index.js';

/**
 * `fromLevel` exclusive, `toLevel` inclusive — same convention as the level-
 * up wizard's own currentClassLevel/nextClassLevel pair. A brand-new
 * character created straight at level 5 passes fromLevel=0 so every feature
 * up to 5 is granted at once, not just the last one.
 */
export async function grantClassFeatures(worldId, actorId, classIdentifier, fromLevel, toLevel, existingItems = []) {
  if (!classIdentifier || toLevel <= fromLevel) return;

  let entries;
  try {
    const params = new URLSearchParams({ entryType: 'feature', includeData: 'true' });
    const res = await api.get(`/compendium/browse/entries?${params}`);
    entries = res?.entries ?? [];
  } catch (err) {
    console.warn('[srd5e] grantClassFeatures: compendium search failed:', err);
    return;
  }

  const unlocked = entries
    .filter((e) => (e.data?.classIdentifier || '') === classIdentifier)
    .filter((e) => {
      const lvl = Number(e.data?.levelGained) || 0;
      return lvl > fromLevel && lvl <= toLevel;
    })
    .sort((a, b) => (Number(a.data?.levelGained) || 0) - (Number(b.data?.levelGained) || 0));

  for (const entry of unlocked) {
    // Scaling tiers (Action Surge's 2nd use, Extra Attack's 3rd/4th attack,
    // etc.) replace the earlier item's data instead of adding a duplicate —
    // matched by name since that's the only stable link between compendium
    // tiers (no parent/child item relationship exists in this engine yet).
    const supersedes = entry.data?.supersedesName;
    const existing = supersedes ? existingItems.find((i) => i.name === supersedes) : null;
    if (existing) {
      await api.put(`/items/${existing.id}`, { name: entry.name, data: entry.data });
      existing.name = entry.name; // keep local list consistent for any later tier in this same batch
    } else {
      const created = await api.post('/items', { worldId, name: entry.name, type: 'feature', data: entry.data, actorId });
      const createdId = created?.data?.id || created?.id;
      if (createdId) existingItems.push({ id: createdId, name: entry.name });
    }
  }
}
