import { selectClassFeaturesToGrant } from './class-feature-grants.mjs';
import { syncRageUses } from './rage-mechanics.mjs';
import { bardicInspirationDieAtLevel, syncBardicInspiration } from './bardic-inspiration.mjs';
import { rangerFavoredEnemyUsesAtLevel, syncRangerFavoredEnemyUses } from './ranger-favored-enemy.mjs';
import { monkFocusPointsAtLevel, syncMonkFocusUses } from './monk-focus.mjs';
import { setItemSystemData } from './utils.mjs';

const dataOf = (item) => item?.system || item?.data || {};
const keyPart = (value) => String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Build every class-feature write for a one-level Level Up without mutating the actor snapshot. */
export function buildClassFeatureGrantPlan({
  classIdentifier,
  fromLevel,
  toLevel,
  featureEntries = [],
  existingItems = [],
  charismaScore,
  bardExpertiseSelections = {},
} = {}) {
  if (!classIdentifier || !Number.isInteger(Number(fromLevel)) || !Number.isInteger(Number(toLevel))
    || Number(toLevel) <= Number(fromLevel) || !Array.isArray(featureEntries) || !Array.isArray(existingItems)) {
    throw new TypeError('Class feature planning needs a valid class, level range, and item snapshots.');
  }
  if (classIdentifier === 'bard' && !Number.isFinite(Number(charismaScore))) {
    throw new Error('Could not verify Charisma for Bardic Inspiration progression.');
  }

  const items = structuredClone(existingItems);
  const { selected, skippedSourceCount } = selectClassFeaturesToGrant(featureEntries, classIdentifier,
    Number(fromLevel), Number(toLevel), items);
  const operations = [];
  const pendingCreates = new Map();
  const pendingUpdates = new Map();
  const queueUpdate = (item, key, data, name) => {
    const nextData = structuredClone(data);
    const planned = pendingCreates.get(item.id);
    if (planned) {
      planned.payload.data = nextData;
      if (name) planned.payload.name = name;
      item.name = planned.payload.name;
      setItemSystemData(item, nextData);
      return;
    }
    const existing = pendingUpdates.get(item.id);
    if (existing) {
      existing.payload.data = { ...existing.payload.data, ...nextData };
      if (name) existing.payload.name = name;
      item.name = existing.payload.name;
      setItemSystemData(item, existing.payload.data);
      return;
    }
    const operation = { kind: 'update-item', key, payload: { id: item.id, data: nextData, ...(name ? { name } : {}) } };
    pendingUpdates.set(item.id, operation);
    operations.push(operation);
    item.name = name || item.name;
    setItemSystemData(item, nextData);
  };
  const queueCreate = (key, name, data) => {
    const id = `planned:${key}`;
    const operation = { kind: 'create-item', key, payload: { name, type: 'feature', data: structuredClone(data) } };
    pendingCreates.set(id, operation);
    operations.push(operation);
    items.push({ id, name, type: 'feature', data: structuredClone(data), system: structuredClone(data) });
  };

  for (const entry of selected) {
    const data = structuredClone(entry.data || {});
    if (classIdentifier === 'bard' && data.identifier === 'bardic-inspiration') {
      data.uses = syncBardicInspiration(data.uses, charismaScore);
      data.bardicInspirationDie = bardicInspirationDieAtLevel(toLevel);
      data.mechanicsSupport = { ...(data.mechanicsSupport || {}), manualNoticeKey: 'SDR5E.ClassFeatures.BardicInspirationManual' };
    }
    if (classIdentifier === 'bard' && data.identifier === 'bard-expertise') {
      const picks = bardExpertiseSelections[Number(data.levelGained)] || [];
      if (!Array.isArray(picks) || picks.length !== 2 || new Set(picks).size !== 2) {
        throw new Error(`Bard Expertise at level ${data.levelGained} requires two recorded skill choices.`);
      }
      data.selectedExpertiseSkills = [...picks];
    }
    if (data.identifier === 'rage') data.uses = syncRageUses(data.uses, toLevel);
    if (classIdentifier === 'ranger' && data.identifier === 'favored-enemy') {
      data.uses = syncRangerFavoredEnemyUses(data.uses, toLevel);
    }
    if (classIdentifier === 'monk' && data.identifier === 'monks-focus') {
      data.uses = syncMonkFocusUses(data.uses, toLevel);
    }

    const existing = data.supersedesName && items.find((item) => item.name === data.supersedesName
      && dataOf(item).classIdentifier === classIdentifier);
    if (existing) queueUpdate(existing, `feature-${keyPart(entry.name)}`, data, entry.name);
    else queueCreate(`feature-${Number(data.levelGained)}-${keyPart(entry.name)}`, entry.name, data);
  }

  const rage = classIdentifier === 'barbarian'
    ? items.find((item) => dataOf(item).identifier === 'rage' && dataOf(item).classIdentifier === 'barbarian')
    : null;
  if (rage) {
    const data = dataOf(rage);
    const uses = syncRageUses(data.uses, toLevel);
    if (JSON.stringify(uses) !== JSON.stringify(data.uses)) queueUpdate(rage, 'sync-rage-uses', { ...data, uses });
  }
  if (classIdentifier === 'bard') {
    const inspiration = items.find((item) => dataOf(item).identifier === 'bardic-inspiration' && dataOf(item).classIdentifier === 'bard');
    if (!inspiration) throw new Error('Bardic Inspiration was not granted; Bard progression remains incomplete.');
    const data = dataOf(inspiration);
    const next = { ...data, uses: syncBardicInspiration(data.uses, charismaScore),
      bardicInspirationDie: bardicInspirationDieAtLevel(toLevel),
      mechanicsSupport: { ...(data.mechanicsSupport || {}), manualNoticeKey: 'SDR5E.ClassFeatures.BardicInspirationManual' } };
    if (JSON.stringify(next) !== JSON.stringify(data)) queueUpdate(inspiration, 'sync-bardic-inspiration', next);
  }
  if (classIdentifier === 'ranger' && toLevel >= 1) {
    const favoredEnemy = items.find((item) => item.type === 'feature' && dataOf(item).classIdentifier === 'ranger'
      && dataOf(item).identifier === 'favored-enemy');
    if (!favoredEnemy || !rangerFavoredEnemyUsesAtLevel(toLevel)) {
      throw new Error('Favored Enemy was not granted; Ranger progression remains incomplete.');
    }
    const data = dataOf(favoredEnemy);
    const uses = syncRangerFavoredEnemyUses(data.uses, toLevel);
    if (JSON.stringify(uses) !== JSON.stringify(data.uses)) queueUpdate(favoredEnemy, 'sync-ranger-favored-enemy', { ...data, uses });
  }
  if (classIdentifier === 'monk' && toLevel >= 2) {
    const focus = items.find((item) => dataOf(item).classIdentifier === 'monk' && dataOf(item).identifier === 'monks-focus');
    if (!focus || !monkFocusPointsAtLevel(toLevel)) throw new Error("Monk's Focus was not granted; Monk progression remains incomplete.");
    const data = dataOf(focus);
    const uses = syncMonkFocusUses(data.uses, toLevel);
    if (JSON.stringify(uses) !== JSON.stringify(data.uses)) queueUpdate(focus, 'sync-monk-focus', { ...data, uses });
  }

  return { operations, skippedSourceCount };
}
