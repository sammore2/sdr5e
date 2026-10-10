/** Client-local checkpointing for the ruleset's multi-request character creation. */
export const CREATION_JOURNAL_VERSION = 1;
const PREFIX = 'sdr5e.character-creation.';

function storageOrDefault(storage) {
  return storage ?? globalThis.localStorage;
}

export function creationJournalKey(worldId) {
  return `${PREFIX}${encodeURIComponent(worldId)}`;
}

export function readCreationJournal(worldId, storage) {
  if (!worldId) return null;
  try {
    const raw = storageOrDefault(storage)?.getItem(creationJournalKey(worldId));
    if (!raw) return null;
    const journal = JSON.parse(raw);
    if (journal.version !== CREATION_JOURNAL_VERSION || journal.worldId !== worldId || !Array.isArray(journal.operations)) {
      return { version: CREATION_JOURNAL_VERSION, worldId, actorName: '(invalid checkpoint)', status: 'needs-review', actor: { status: 'unknown', id: null }, operations: [] };
    }
    return journal;
  } catch {
    try {
      if (storageOrDefault(storage)?.getItem(creationJournalKey(worldId))) {
        return { version: CREATION_JOURNAL_VERSION, worldId, actorName: '(unreadable checkpoint)', status: 'needs-review', actor: { status: 'unknown', id: null }, operations: [] };
      }
    } catch { /* storage failure is reported when a write is attempted */ }
    return null;
  }
}

export function writeCreationJournal(journal, storage) {
  const target = storageOrDefault(storage);
  if (!target) throw new Error('Character creation recovery storage is unavailable.');
  target.setItem(creationJournalKey(journal.worldId), JSON.stringify(journal));
  return journal;
}

export function clearCreationJournal(worldId, storage) {
  storageOrDefault(storage)?.removeItem(creationJournalKey(worldId));
}

export function createCreationJournal({ worldId, actorName, actorData, actorId = null, operations }) {
  if (!worldId || !actorName || !actorData || !Array.isArray(operations)) throw new TypeError('Invalid character creation journal input.');
  const operationByKey = new Map();
  for (const operation of operations) {
    if (operation.key) {
      if (operationByKey.has(operation.key)) throw new TypeError(`Duplicate creation operation key: ${operation.key}`);
      operationByKey.set(operation.key, operation);
    }
    if (!operation.containerOperationKey) continue;
    const parent = operationByKey.get(operation.containerOperationKey);
    if (!parent || parent.kind !== 'item' || parent.payload?.type !== 'container') {
      throw new TypeError(`Creation step ${operation.label} references a missing or invalid parent container.`);
    }
  }
  return {
    version: CREATION_JOURNAL_VERSION,
    id: globalThis.crypto?.randomUUID?.() || `creation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    worldId,
    actorName,
    status: 'pending',
    actor: actorId
      ? { status: 'complete', id: actorId, existing: true }
      : { status: 'pending', id: null, existing: false },
    actorData,
    operations: operations.map((operation) => ({ ...operation, status: 'pending', id: null })),
    updatedAt: new Date().toISOString(),
  };
}

function checkpoint(journal, storage) {
  journal.updatedAt = new Date().toISOString();
  writeCreationJournal(journal, storage);
}

function responseId(response) {
  return response?.data?.id || response?.id || null;
}

/**
 * Executes pending operations sequentially. An in-flight request left behind by
 * a crash is deliberately treated as unknown and is never retried automatically.
 */
export async function runCreationJournal(journal, { createActor, createItem, createClassFeatures, updateActor, storage } = {}) {
  if (!journal || journal.version !== CREATION_JOURNAL_VERSION) throw new TypeError('Unsupported character creation journal.');
  if (journal.status === 'complete') return journal;
  if (journal.actor.status === 'in-flight' || journal.actor.status === 'unknown'
    || journal.operations.some(({ status }) => status === 'in-flight' || status === 'unknown')) {
    journal.status = 'needs-review';
    checkpoint(journal, storage);
    throw new Error('A previous character creation request has an unknown outcome and requires review.');
  }

  if (journal.actor.status === 'pending') {
    journal.actor.status = 'in-flight';
    journal.status = 'in-progress';
    try { checkpoint(journal, storage); } catch (error) {
      journal.actor.status = 'pending';
      journal.status = 'pending';
      throw error;
    }
    try {
      const response = await createActor({ name: journal.actorName, type: 'character', worldId: journal.worldId, systemData: journal.actorData });
      journal.actor.id = responseId(response);
      if (!journal.actor.id) throw new Error('Actor creation returned no identifier.');
      journal.actor.status = 'complete';
      checkpoint(journal, storage);
    } catch (error) {
      journal.actor.status = 'unknown';
      journal.status = 'needs-review';
      checkpoint(journal, storage);
      throw error;
    }
  }

  if (journal.actor.status !== 'complete' || !journal.actor.id) throw new Error('Character actor is not confirmed; recovery is blocked.');

  for (const operation of journal.operations) {
    if (operation.status === 'complete') continue;
    if (operation.status !== 'pending') {
      journal.status = 'needs-review';
      checkpoint(journal, storage);
      throw new Error(`Creation step ${operation.label} is not safe to retry.`);
    }
    operation.status = 'in-flight';
    journal.status = 'in-progress';
    try { checkpoint(journal, storage); } catch (error) {
      operation.status = 'pending';
      journal.status = 'in-progress';
      throw error;
    }
    try {
      let payload = operation.payload;
      if (operation.containerOperationKey) {
        const parent = journal.operations.find(({ key }) => key === operation.containerOperationKey);
        if (parent?.status !== 'complete' || !parent.id) throw new Error(`Parent container for ${operation.label} is not confirmed.`);
        payload = { ...payload, data: { ...payload.data, container: parent.id } };
      }
      let response;
      if (operation.kind === 'class-features') {
        if (typeof createClassFeatures !== 'function') throw new Error('Class feature grant handler is unavailable.');
        response = await createClassFeatures(journal.actor.id, operation.payload);
      } else if (operation.kind === 'actor-update') {
        if (typeof updateActor !== 'function') throw new Error('Existing actor update handler is unavailable.');
        response = await updateActor(journal.actor.id, operation.payload);
      } else response = await createItem?.({ ...payload, worldId: journal.worldId, actorId: journal.actor.id });
      operation.id = operation.kind === 'class-features' || operation.kind === 'actor-update' ? 'confirmed' : responseId(response);
      if (!operation.id) throw new Error(`Creation step ${operation.label} returned no identifier.`);
      operation.status = 'complete';
      checkpoint(journal, storage);
    } catch (error) {
      operation.status = 'unknown';
      journal.status = 'needs-review';
      checkpoint(journal, storage);
      throw error;
    }
  }

  journal.status = 'complete';
  checkpoint(journal, storage);
  return journal;
}

export function creationJournalCanResume(journal) {
  return !!journal && journal.actor.status === 'complete' && !!journal.actor.id
    && journal.status !== 'complete'
    && !journal.operations.some(({ status }) => status === 'in-flight' || status === 'unknown')
    && journal.operations.some(({ status }) => status === 'pending');
}

export function actorSetupWizardRequired(actorId, hasClass, journal) {
  if (!actorId) return false;
  const recoveryPending = journal?.actor?.id === actorId && journal.status !== 'complete';
  return !hasClass || recoveryPending;
}
