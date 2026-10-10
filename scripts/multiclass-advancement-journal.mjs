export const MULTICLASS_ADVANCEMENT_JOURNAL_VERSION = 1;

const ITEM_OPERATION_KINDS = new Set(['create-item', 'update-item', 'delete-item']);
const OPERATION_KINDS = new Set([...ITEM_OPERATION_KINDS, 'update-actor']);
const PREFIX = 'sdr5e.multiclass-advancement.';

export function multiclassAdvancementJournalKey(worldId, actorId) {
  if (!worldId || !actorId) throw new TypeError('World and actor identifiers are required.');
  return `${PREFIX}${encodeURIComponent(worldId)}.${encodeURIComponent(actorId)}`;
}

export function readMulticlassAdvancementJournal(worldId, actorId, storage = globalThis.localStorage) {
  if (!worldId || !actorId || !storage) return null;
  try {
    const raw = storage.getItem(multiclassAdvancementJournalKey(worldId, actorId));
    if (!raw) return null;
    const journal = JSON.parse(raw);
    if (journal.version !== MULTICLASS_ADVANCEMENT_JOURNAL_VERSION
      || journal.worldId !== worldId || journal.actorId !== actorId
      || !Array.isArray(journal.operations)) {
      return { version: MULTICLASS_ADVANCEMENT_JOURNAL_VERSION, worldId, actorId,
        transactionId: '', status: 'needs-review', invalidCheckpoint: true,
        unresolvedOperationKeys: [], operations: [] };
    }
    return journal;
  } catch {
    try {
      if (storage.getItem(multiclassAdvancementJournalKey(worldId, actorId))) {
        return { version: MULTICLASS_ADVANCEMENT_JOURNAL_VERSION, worldId, actorId,
          transactionId: '', status: 'needs-review', invalidCheckpoint: true,
          unresolvedOperationKeys: [], operations: [] };
      }
    } catch { /* storage access is reported when a checkpoint write is attempted */ }
    return null;
  }
}

/** Bind the journal executor to the supported actor/item HTTP routes. */
export function multiclassAdvancementApiAdapter({ api, worldId, actorId }) {
  if (!api || !worldId || !actorId) throw new TypeError('API, world, and actor identifiers are required.');
  return {
    readSnapshot: async () => {
      const actor = await api.get(`/actors/${actorId}?populate=true`);
      if (!actor?.id || actor.id !== actorId) throw new Error('Could not verify the target actor before resuming progression.');
      return { actor, items: actor.items || [] };
    },
    applyOperation: async (operation) => {
      if (operation.kind === 'create-item') {
        return api.post(`/actors/${actorId}/items`, { worldId, ...operation.payload });
      }
      if (operation.kind === 'update-item') {
        return api.put(`/actors/${actorId}/items/${operation.payload.id}`, operation.payload);
      }
      if (operation.kind === 'delete-item') {
        return api.delete(`/items/${operation.payload.id}`);
      }
      if (operation.kind === 'update-actor') {
        return api.put(`/actors/${actorId}`, operation.payload);
      }
      throw new TypeError(`Unsupported multiclass operation: ${operation.kind}`);
    },
  };
}

function checkpoint(journal, storage) {
  if (!storage) throw new Error('Multiclass advancement recovery storage is unavailable.');
  storage.setItem(multiclassAdvancementJournalKey(journal.worldId, journal.actorId), JSON.stringify(journal));
}

function responseId(response) {
  return response?.data?.id || response?.id || null;
}

/**
 * Creates a local write-ahead record for a multiclass advancement. Item writes
 * carry a marker in item data; actor writes carry one in document flags.
 */
export function createMulticlassAdvancementJournal({
  worldId,
  actorId,
  transactionId,
  operations = [],
} = {}) {
  if (!worldId || !actorId || !transactionId || !Array.isArray(operations) || !operations.length) {
    throw new TypeError('Invalid multiclass advancement journal input.');
  }

  const keys = new Set();
  const prepared = operations.map((operation) => {
    if (!operation?.key || keys.has(operation.key)) throw new TypeError('Advancement operation keys must be unique and non-empty.');
    keys.add(operation.key);
    const isDelete = operation.kind === 'delete-item' && !!operation.payload?.id;
    const isItemWrite = ['create-item', 'update-item'].includes(operation.kind)
      && operation.payload?.data && typeof operation.payload.data === 'object';
    const isActorWrite = operation.kind === 'update-actor'
      && operation.payload?.systemData && typeof operation.payload.systemData === 'object';
    if (!OPERATION_KINDS.has(operation.kind) || (!isItemWrite && !isActorWrite && !isDelete)) {
      throw new TypeError(`Unsupported or invalid multiclass operation: ${operation.key}.`);
    }
    const operationId = `${transactionId}:${operation.key}`;
    const payload = structuredClone(operation.payload);
    if (operation.kind === 'update-actor') {
      payload.flags = {
        ...(payload.flags || {}),
        sdr5e: { ...(payload.flags?.sdr5e || {}), multiclassProgressionOperationId: operationId },
      };
    } else if (!isDelete) {
      payload.data = { ...payload.data, sdr5eProgressionOperationId: operationId };
    }
    return {
      ...structuredClone(operation),
      operationId,
      payload,
      status: 'pending',
      remoteId: null,
    };
  });

  return {
    version: MULTICLASS_ADVANCEMENT_JOURNAL_VERSION,
    transactionId,
    worldId,
    actorId,
    status: 'pending',
    unresolvedOperationKeys: [],
    operations: prepared,
  };
}

/**
 * Reconcile only exact markers on the targeted actor or a unique item match.
 * Missing or duplicate item markers are ambiguous and must never auto-retry.
 */
export function reconcileMulticlassAdvancementJournal(journal, { actor, items = [] } = {}) {
  if (!journal || journal.version !== MULTICLASS_ADVANCEMENT_JOURNAL_VERSION
    || !actor || actor.id !== journal.actorId || !Array.isArray(items)) {
    throw new TypeError('Invalid multiclass advancement reconciliation snapshot.');
  }
  if (journal.invalidCheckpoint) throw new Error('The saved progression checkpoint is invalid and requires manual review.');

  const next = structuredClone(journal);
  const unresolved = [];
  for (const operation of next.operations) {
    if (operation.status !== 'in-flight' && operation.status !== 'unknown') continue;
    if (operation.kind === 'update-actor') {
      const marker = actor.flags?.sdr5e?.multiclassProgressionOperationId;
      if (marker === operation.operationId) {
        operation.status = 'complete';
        operation.remoteId = actor.id;
      } else {
        operation.status = 'unknown';
        unresolved.push(operation.key);
      }
      continue;
    }
    if (operation.kind === 'delete-item') {
      if (!items.some((item) => item.id === operation.payload.id)) {
        operation.status = 'complete';
        operation.remoteId = operation.payload.id;
      } else {
        operation.status = 'unknown';
        unresolved.push(operation.key);
      }
      continue;
    }
    const matches = items.filter((item) => (item.system || item.data || {}).sdr5eProgressionOperationId === operation.operationId);
    if (matches.length === 1) {
      operation.status = 'complete';
      operation.remoteId = matches[0].id || null;
    } else {
      operation.status = 'unknown';
      unresolved.push(operation.key);
    }
  }
  next.unresolvedOperationKeys = unresolved;
  next.status = unresolved.length ? 'needs-review'
    : next.operations.every(({ status }) => status === 'complete') ? 'complete' : 'in-progress';
  return next;
}

/** Executes only checkpointed item writes; uncertain writes must reconcile first. */
export async function runMulticlassAdvancementJournal(journal, { storage, readSnapshot, applyOperation } = {}) {
  if (!journal || journal.version !== MULTICLASS_ADVANCEMENT_JOURNAL_VERSION
    || typeof readSnapshot !== 'function' || typeof applyOperation !== 'function') {
    throw new TypeError('Invalid multiclass advancement runner input.');
  }
  if (journal.status === 'complete') return journal;
  if (journal.invalidCheckpoint) throw new Error('The saved progression checkpoint is invalid and requires manual review.');
  if (!storage) throw new Error('Multiclass advancement recovery storage is unavailable.');

  const uncertain = journal.operations.some(({ status }) => status === 'in-flight' || status === 'unknown');
  if (uncertain) {
    const snapshot = await readSnapshot(journal);
    Object.assign(journal, reconcileMulticlassAdvancementJournal(journal, snapshot));
    checkpoint(journal, storage);
    if (journal.status === 'needs-review') throw new Error('An earlier progression write has an unknown outcome; review is required before continuing.');
  }

  for (const operation of journal.operations) {
    if (operation.status === 'complete') continue;
    if (operation.status !== 'pending') throw new Error(`Progression operation ${operation.key} is not safe to retry.`);
    operation.status = 'in-flight';
    journal.status = 'in-progress';
    try { checkpoint(journal, storage); } catch (error) {
      operation.status = 'pending';
      journal.status = 'pending';
      throw error;
    }
    try {
      const result = await applyOperation(operation, journal);
      operation.remoteId = responseId(result)
        || (operation.kind === 'update-item' ? operation.payload.id || null : null)
        || (operation.kind === 'delete-item' ? operation.payload.id || null : null)
        || (operation.kind === 'update-actor' ? journal.actorId : null);
      if (!operation.remoteId) throw new Error(`Progression operation ${operation.key} returned no identifier.`);
      operation.status = 'complete';
      checkpoint(journal, storage);
    } catch (error) {
      operation.status = 'unknown';
      journal.status = 'needs-review';
      checkpoint(journal, storage);
      try {
        const snapshot = await readSnapshot(journal);
        Object.assign(journal, reconcileMulticlassAdvancementJournal(journal, snapshot));
        checkpoint(journal, storage);
      } catch { /* preserve the durable unknown state for explicit recovery */ }
      if (journal.status === 'needs-review') throw error;
      // The exact marker confirmed this write; continue with the next operation.
    }
  }

  journal.status = journal.operations.every(({ status }) => status === 'complete') ? 'complete' : 'in-progress';
  checkpoint(journal, storage);
  return journal;
}
