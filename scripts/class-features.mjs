// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/class-features.mjs
//
// Grants the class-feature items a character unlocks between two class
// levels (character creation starting above level 1, or a Level Up wizard
// step). Pulls from the compendium the same way every other picker in this
// ruleset does — GET /compendium/browse/entries?entryType=feature, fanned
// out across every loaded source, filtered client-side by `classIdentifier`
// and `levelGained` (needs `includeData: true`, see compendium-source.ts's
// querySourceEntries doc comment). Current-SRD records also pass a generated
// class/level/name source contract; explicitly sourced non-SRD content remains
// eligible for custom campaigns.
//
// ══════════════════════════════════════════════════════════════════════════

import { api } from '/_loom/sdk/index.js';
import { selectClassFeaturesToGrant } from './class-feature-grants.mjs';
import { syncRageUses } from './rage-mechanics.mjs';
import { bardicInspirationDieAtLevel, syncBardicInspiration } from './bardic-inspiration.mjs';
import { rangerFavoredEnemyUsesAtLevel, syncRangerFavoredEnemyUses } from './ranger-favored-enemy.mjs';
import { monkFocusPointsAtLevel, syncMonkFocusUses } from './monk-focus.mjs';
import { resolveWeaponMasteryFeatureData } from './weapon-mastery.mjs';

/**
 * `fromLevel` exclusive, `toLevel` inclusive — same convention as the level-
 * up wizard's own currentClassLevel/nextClassLevel pair. A brand-new
 * character created straight at level 5 passes fromLevel=0 so every feature
 * up to 5 is granted at once, not just the last one.
 */
export async function grantClassFeatures(worldId, actorId, classIdentifier, fromLevel, toLevel, existingItems = [], {
  charismaScore, bardExpertiseSelections = {}, weaponMasterySelections = null, weaponMasteryProficiencies = [],
} = {}) {
  if (!classIdentifier || toLevel <= fromLevel) return;
  if (classIdentifier === 'bard' && !Number.isFinite(Number(charismaScore))) {
    throw new Error('Could not verify Charisma for Bardic Inspiration progression.');
  }

  let entries;
  try {
    const params = new URLSearchParams({ entryType: 'feature', includeData: 'true' });
    const res = await api.get(`/compendium/browse/entries?${params}`);
    entries = res?.entries ?? [];
  } catch (err) {
    console.error('[srd5e] grantClassFeatures: compendium search failed:', err);
    throw new Error('Could not load class features; progression was not completed.', { cause: err });
  }

  const { selected: unlocked, skippedSourceCount } = selectClassFeaturesToGrant(
    entries, classIdentifier, fromLevel, toLevel, existingItems,
  );
  if (classIdentifier === 'bard') {
    for (const entry of unlocked.filter((feature) => feature.data?.identifier === 'bard-expertise')) {
      const picks = bardExpertiseSelections[Number(entry.data.levelGained)] || [];
      if (!Array.isArray(picks) || picks.length !== 2 || new Set(picks).size !== 2) {
        throw new Error(`Bard Expertise at level ${entry.data.levelGained} requires two recorded skill choices.`);
      }
    }
  }
  if (skippedSourceCount > 0) {
    const message = window.Loom?.i18n?.localize?.('SDR5E.Progression.UnverifiedClassFeaturesSkipped');
    if (message) window.Loom?.showToast?.(`${message} (${skippedSourceCount})`, 'warning');
  }

  for (const entry of unlocked) {
    const weaponMastery = entry.data?.identifier === 'weapon-mastery' && weaponMasterySelections
      ? resolveWeaponMasteryFeatureData(classIdentifier, toLevel, entry.data, weaponMasterySelections,
        weaponMasteryProficiencies) : null;
    if (weaponMastery && !weaponMastery.valid) {
      throw new Error(`Weapon Mastery at class level ${toLevel} requires ${weaponMastery.required} valid, distinct weapon choices.`);
    }
    const inspirationUses = classIdentifier === 'bard' && entry.data?.identifier === 'bardic-inspiration'
      ? syncBardicInspiration(entry.data.uses, charismaScore) : null;
    const entryData = entry.data?.identifier === 'rage'
      ? { ...entry.data, uses: syncRageUses(entry.data.uses, toLevel) }
      : classIdentifier === 'bard' && entry.data?.identifier === 'bardic-inspiration'
      ? { ...entry.data,
        uses: inspirationUses,
        bardicInspirationDie: bardicInspirationDieAtLevel(toLevel),
        mechanicsSupport: { ...(entry.data.mechanicsSupport || {}), manualNoticeKey: 'SDR5E.ClassFeatures.BardicInspirationManual' },
      }
      : classIdentifier === 'bard' && entry.data?.identifier === 'bard-expertise'
      ? { ...entry.data, selectedExpertiseSkills: bardExpertiseSelections[Number(entry.data.levelGained)] }
      : classIdentifier === 'ranger' && entry.data?.identifier === 'favored-enemy'
      ? { ...entry.data, uses: syncRangerFavoredEnemyUses(entry.data.uses, toLevel) }
      : classIdentifier === 'monk' && entry.data?.identifier === 'monks-focus'
      ? { ...entry.data, uses: syncMonkFocusUses(entry.data.uses, toLevel) }
      : weaponMastery
      ? weaponMastery.data
      : entry.data;
    // Scaling tiers (Action Surge's 2nd use, Extra Attack's 3rd/4th attack,
    // etc.) replace the earlier item's data instead of adding a duplicate —
    // matched by name since that's the only stable link between compendium
    // tiers (no parent/child item relationship exists in this engine yet).
    const supersedes = entry.data?.supersedesName;
    const existing = supersedes ? existingItems.find((i) => {
      const data = i.system || i.data || {};
      return i.name === supersedes && data.classIdentifier === classIdentifier;
    }) : null;
    if (existing) {
      await api.put(`/items/${existing.id}`, { name: entry.name, data: entryData });
      existing.name = entry.name; // keep local list consistent for any later tier in this same batch
      existing.system = entryData;
      existing.data = entryData;
    } else {
      // A failed attempt can be retried after some features were already
      // created. Their class/level/name tuple is stable in the content pack,
      // so skip those rows rather than minting duplicates.
      const created = await api.post('/items', { worldId, name: entry.name, type: 'feature', data: entryData, actorId });
      const createdId = created?.data?.id || created?.id;
      if (!createdId) throw new Error(`Could not add class feature: ${entry.name}.`);
      existingItems.push({ id: createdId, name: entry.name, data: entryData });
    }
  }

  if (classIdentifier === 'barbarian') {
    const rage = existingItems.find((item) => (item.system || item.data || {}).identifier === 'rage');
    const rageData = rage && (rage.system || rage.data || {});
    if (rage && rageData) {
      const nextData = { ...rageData, uses: syncRageUses(rageData.uses, toLevel) };
      if (JSON.stringify(nextData.uses) !== JSON.stringify(rageData.uses)) {
        await api.put(`/items/${rage.id}`, { data: nextData });
        rage.system = nextData;
        rage.data = nextData;
      }
    }
  }

  if (classIdentifier === 'bard') {
    const inspiration = existingItems.find((item) => {
      const data = item.system || item.data || {};
      return data.classIdentifier === 'bard' && data.identifier === 'bardic-inspiration';
    });
    if (!inspiration) throw new Error('Bardic Inspiration was not granted; Bard progression remains incomplete.');
    const inspirationData = inspiration.system || inspiration.data || {};
    const nextUses = syncBardicInspiration(inspirationData.uses, charismaScore);
    const nextData = { ...inspirationData, uses: nextUses, bardicInspirationDie: bardicInspirationDieAtLevel(toLevel),
      mechanicsSupport: { ...(inspirationData.mechanicsSupport || {}), manualNoticeKey: 'SDR5E.ClassFeatures.BardicInspirationManual' } };
    if (JSON.stringify(nextData) !== JSON.stringify(inspirationData)) {
      await api.put(`/items/${inspiration.id}`, { data: nextData });
      inspiration.system = nextData;
      inspiration.data = nextData;
    }
  }

  if (classIdentifier === 'ranger' && toLevel >= 1) {
    const favoredEnemy = existingItems.find((item) => {
      const data = item.system || item.data || {};
      return item.type === 'feature' && data.classIdentifier === 'ranger' && data.identifier === 'favored-enemy';
    });
    if (!favoredEnemy) throw new Error('Favored Enemy was not granted; Ranger progression remains incomplete.');
    const data = favoredEnemy.system || favoredEnemy.data || {};
    if (!rangerFavoredEnemyUsesAtLevel(toLevel)) throw new Error('Ranger Favored Enemy level is invalid.');
    const nextData = { ...data, uses: syncRangerFavoredEnemyUses(data.uses, toLevel) };
    if (JSON.stringify(nextData.uses) !== JSON.stringify(data.uses)) {
      await api.put(`/items/${favoredEnemy.id}`, { data: nextData });
      favoredEnemy.system = nextData;
      favoredEnemy.data = nextData;
    }
  }

  if (classIdentifier === 'monk' && toLevel >= 2) {
    const focus = existingItems.find((item) => {
      const data = item.system || item.data || {};
      return data.classIdentifier === 'monk' && data.identifier === 'monks-focus';
    });
    if (!focus) throw new Error("Monk's Focus was not granted; Monk progression remains incomplete.");
    const data = focus.system || focus.data || {};
    if (!monkFocusPointsAtLevel(toLevel)) throw new Error('Monk Focus level is invalid.');
    const nextData = { ...data, uses: syncMonkFocusUses(data.uses, toLevel) };
    if (JSON.stringify(nextData.uses) !== JSON.stringify(data.uses)) {
      await api.put(`/items/${focus.id}`, { data: nextData });
      focus.system = nextData;
      focus.data = nextData;
    }
  }
}
