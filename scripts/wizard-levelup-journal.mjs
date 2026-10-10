import { createMulticlassAdvancementJournal } from './multiclass-advancement-journal.mjs';

function withSystemPatch(systemData, patch) {
  const next = structuredClone(systemData || {});
  for (const [dottedKey, value] of Object.entries(patch || {})) {
    const path = dottedKey.startsWith('system.') ? dottedKey.slice(7) : dottedKey;
    const segments = path.split('.').filter(Boolean);
    if (!segments.length) throw new TypeError('Actor progression patches need a system-data path.');
    let cursor = next;
    for (const segment of segments.slice(0, -1)) {
      if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) cursor[segment] = {};
      cursor = cursor[segment];
    }
    cursor[segments.at(-1)] = structuredClone(value);
  }
  return next;
}

/** Build a recoverable class-level advancement from fully validated choices. */
export function createClassLevelUpJournal({
  worldId,
  actor,
  transactionId,
  classItem,
  classData,
  actorPatch,
  creates = [],
  updates = [],
  deletes = [],
} = {}) {
  const actorId = actor?.id;
  if (!worldId || !actorId || !transactionId || !classItem?.id || !classData || !actorPatch) {
    throw new TypeError('Class advancement needs a world, actor, transaction, class item, and validated data.');
  }
  const operations = [];
  for (const entry of creates) {
    if (!entry?.name || !entry.type || !entry.data) throw new TypeError('Wizard item creation is incomplete.');
    operations.push({ kind: 'create-item', key: entry.key, payload: {
      worldId, name: entry.name, type: entry.type, data: structuredClone(entry.data),
    } });
  }
  for (const entry of updates) {
    if (!entry?.id || !entry.data) throw new TypeError('Wizard item update is incomplete.');
    operations.push({ kind: 'update-item', key: entry.key, payload: {
      id: entry.id, data: structuredClone(entry.data),
      ...(entry.name ? { name: entry.name } : {}),
    } });
  }
  // Keep the old item until its replacement and every other write are
  // confirmed. A failed delete can leave both items temporarily, while a
  // failed create must never leave the character with neither choice.
  for (const entry of deletes) {
    if (!entry?.id) throw new TypeError('Class level-up item deletion is incomplete.');
    operations.push({ kind: 'delete-item', key: entry.key, payload: { id: entry.id } });
  }
  operations.push({ kind: 'update-item', key: 'class-level', payload: {
    id: classItem.id, data: structuredClone(classData),
  } });
  operations.push({ kind: 'update-actor', key: 'character-progression', payload: {
    systemData: withSystemPatch(actor.systemData, actorPatch),
    flags: structuredClone(actor.flags || {}),
  } });
  return createMulticlassAdvancementJournal({ worldId, actorId, transactionId, operations });
}

// Keep the previous export for callers and journals created by existing builds.
export const createWizardLevelUpJournal = createClassLevelUpJournal;
