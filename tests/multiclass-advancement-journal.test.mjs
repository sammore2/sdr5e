import test from 'node:test';
import assert from 'node:assert/strict';
import { createMulticlassAdvancementJournal, multiclassAdvancementApiAdapter, multiclassAdvancementJournalKey, readMulticlassAdvancementJournal, reconcileMulticlassAdvancementJournal, runMulticlassAdvancementJournal } from '../scripts/multiclass-advancement-journal.mjs';

test('reconciles an uncertain spell replacement deletion only when the targeted item is absent from the actor snapshot', () => {
  const journal = createMulticlassAdvancementJournal({ worldId: 'world-1', actorId: 'actor-1', transactionId: 'replace-1',
    operations: [{ key: 'delete-old-spell', kind: 'delete-item', payload: { id: 'spell-old' } }] });
  journal.operations[0].status = 'unknown';

  const completed = reconcileMulticlassAdvancementJournal(journal, {
    actor: { id: 'actor-1' }, items: [{ id: 'spell-new', type: 'spell' }],
  });

  assert.equal(completed.status, 'complete');
  assert.equal(completed.operations[0].status, 'complete');
  assert.equal(completed.operations[0].remoteId, 'spell-old');
});

test('does not retry an uncertain spell deletion when the original actor item is still present', () => {
  const journal = createMulticlassAdvancementJournal({ worldId: 'world-1', actorId: 'actor-1', transactionId: 'replace-2',
    operations: [{ key: 'delete-old-spell', kind: 'delete-item', payload: { id: 'spell-old' } }] });
  journal.operations[0].status = 'unknown';

  const unresolved = reconcileMulticlassAdvancementJournal(journal, {
    actor: { id: 'actor-1' }, items: [{ id: 'spell-old', type: 'spell' }],
  });

  assert.equal(unresolved.status, 'needs-review');
  assert.deepEqual(unresolved.unresolvedOperationKeys, ['delete-old-spell']);
});

test('reconciles an uncertain class-item creation only from its exact stable operation marker', () => {
  const journal = createMulticlassAdvancementJournal({
    worldId: 'world-1',
    actorId: 'actor-1',
    transactionId: 'advance-1',
    operations: [{
      key: 'new-class',
      kind: 'create-item',
      payload: { name: 'Fighter', type: 'class', data: { classIdentifier: 'fighter', levels: 1 } },
    }],
  });
  journal.operations[0].status = 'unknown';

  const marker = journal.operations[0].operationId;
  const reconciled = reconcileMulticlassAdvancementJournal(journal, {
    actor: { id: 'actor-1', systemData: { details: { level: 2 } } },
    items: [{ id: 'class-item-1', name: 'Fighter', type: 'class', data: { sdr5eProgressionOperationId: marker } }],
  });

  assert.equal(reconciled.status, 'complete');
  assert.equal(reconciled.operations[0].status, 'complete');
  assert.equal(reconciled.operations[0].remoteId, 'class-item-1');
});

test('blocks recovery when an uncertain class-item write has no unique marker match', () => {
  const makeJournal = () => {
    const journal = createMulticlassAdvancementJournal({
      worldId: 'world-1',
      actorId: 'actor-1',
      transactionId: 'advance-2',
      operations: [{ key: 'new-class', kind: 'create-item', payload: { name: 'Fighter', type: 'class', data: {} } }],
    });
    journal.operations[0].status = 'in-flight';
    return journal;
  };

  const missing = reconcileMulticlassAdvancementJournal(makeJournal(), {
    actor: { id: 'actor-1' }, items: [],
  });
  const duplicate = reconcileMulticlassAdvancementJournal(makeJournal(), {
    actor: { id: 'actor-1' },
    items: [
      { id: 'class-a', data: { sdr5eProgressionOperationId: 'advance-2:new-class' } },
      { id: 'class-b', data: { sdr5eProgressionOperationId: 'advance-2:new-class' } },
    ],
  });

  for (const unresolved of [missing, duplicate]) {
    assert.equal(unresolved.status, 'needs-review');
    assert.deepEqual(unresolved.unresolvedOperationKeys, ['new-class']);
    assert.equal(unresolved.operations[0].status, 'unknown');
  }
});

test('resumes an uncertain item write from the exact persisted marker without repeating it', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const journal = createMulticlassAdvancementJournal({
    worldId: 'world-1', actorId: 'actor-1', transactionId: 'advance-3',
    operations: [{ key: 'class-item', kind: 'create-item', payload: { name: 'Fighter', type: 'class', data: {} } }],
  });
  journal.operations[0].status = 'in-flight';
  storage.setItem(multiclassAdvancementJournalKey('world-1', 'actor-1'), JSON.stringify(journal));
  let createCalls = 0;
  const completed = await runMulticlassAdvancementJournal(journal, {
    storage,
    readSnapshot: async () => ({
      actor: { id: 'actor-1' },
      items: [{ id: 'new-class-id', name: 'Fighter', type: 'class', data: { sdr5eProgressionOperationId: 'advance-3:class-item' } }],
    }),
    applyOperation: async () => { createCalls++; return { id: 'duplicate' }; },
  });

  assert.equal(createCalls, 0);
  assert.equal(completed.operations[0].status, 'complete');
  assert.equal(completed.operations[0].remoteId, 'new-class-id');
});

test('runner blocks uncertain item writes without an exact marker and never retries them', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const journal = createMulticlassAdvancementJournal({
    worldId: 'world-1', actorId: 'actor-1', transactionId: 'advance-4',
    operations: [{ key: 'class-item', kind: 'create-item', payload: { name: 'Fighter', type: 'class', data: {} } }],
  });
  journal.operations[0].status = 'unknown';
  let writeCalls = 0;

  await assert.rejects(runMulticlassAdvancementJournal(journal, {
    storage,
    readSnapshot: async () => ({ actor: { id: 'actor-1' }, items: [] }),
    applyOperation: async () => { writeCalls++; return { id: 'unsafe-retry' }; },
  }), /unknown outcome/);

  assert.equal(writeCalls, 0);
  assert.equal(journal.status, 'needs-review');
  assert.deepEqual(journal.unresolvedOperationKeys, ['class-item']);
});

test('reconciles an uncertain actor update from its exact stable operation marker', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const journal = createMulticlassAdvancementJournal({
    worldId: 'world-1', actorId: 'actor-1', transactionId: 'advance-5',
    operations: [{ key: 'actor-update', kind: 'update-actor', payload: { systemData: { details: { level: 5 } } } }],
  });
  journal.operations[0].status = 'in-flight';
  storage.setItem(multiclassAdvancementJournalKey('world-1', 'actor-1'), JSON.stringify(journal));
  let updateCalls = 0;

  const completed = await runMulticlassAdvancementJournal(journal, {
    storage,
    readSnapshot: async () => ({
      actor: { id: 'actor-1', flags: { sdr5e: { multiclassProgressionOperationId: 'advance-5:actor-update' } } },
      items: [],
    }),
    applyOperation: async () => { updateCalls++; return { id: 'actor-1' }; },
  });

  assert.equal(updateCalls, 0);
  assert.equal(completed.status, 'complete');
  assert.equal(completed.operations[0].remoteId, 'actor-1');
});

test('checkpoints actor updates before applying them and includes the reconciliation marker', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const journal = createMulticlassAdvancementJournal({
    worldId: 'world-1', actorId: 'actor-1', transactionId: 'advance-6',
    operations: [{ key: 'actor-update', kind: 'update-actor', payload: { systemData: { details: { level: 5 } } } }],
  });
  const completed = await runMulticlassAdvancementJournal(journal, {
    storage,
    readSnapshot: async () => ({ actor: { id: 'actor-1' }, items: [] }),
    applyOperation: async (operation) => {
      const saved = JSON.parse(storage.getItem(multiclassAdvancementJournalKey('world-1', 'actor-1')));
      assert.equal(saved.operations[0].status, 'in-flight');
      assert.equal(operation.payload.flags.sdr5e.multiclassProgressionOperationId, 'advance-6:actor-update');
      return { id: 'actor-1' };
    },
  });

  assert.equal(completed.status, 'complete');
  assert.equal(completed.operations[0].remoteId, 'actor-1');
});

test('reads only a valid recovery journal for the requested actor and world', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const journal = createMulticlassAdvancementJournal({ worldId: 'world-1', actorId: 'actor-1', transactionId: 'read-1',
    operations: [{ key: 'actor-update', kind: 'update-actor', payload: { systemData: { details: { level: 3 } } } }] });
  const key = multiclassAdvancementJournalKey('world-1', 'actor-1');
  values.set(key, JSON.stringify(journal));

  assert.equal(readMulticlassAdvancementJournal('world-1', 'actor-1', storage).transactionId, 'read-1');
  assert.equal(readMulticlassAdvancementJournal('world-2', 'actor-1', storage), null);
  values.set(key, '{bad json');
  assert.equal(readMulticlassAdvancementJournal('world-1', 'actor-1', storage).status, 'needs-review');
});

test('multiclass API adapter uses actor-scoped item writes and actor route updates', async () => {
  const calls = [];
  const api = {
    get: async (route) => { calls.push(['get', route]); return { id: 'actor-1', items: [] }; },
    post: async (route, payload) => { calls.push(['post', route, payload]); return { id: 'item-1' }; },
    put: async (route, payload) => { calls.push(['put', route, payload]); return { id: 'actor-1' }; },
  };
  const adapter = multiclassAdvancementApiAdapter({ api, worldId: 'world-1', actorId: 'actor-1' });
  await adapter.readSnapshot();
  await adapter.applyOperation({ kind: 'create-item', payload: { name: 'Wizard', type: 'class', data: { levels: 1 } } });
  await adapter.applyOperation({ kind: 'update-actor', payload: { systemData: { details: { level: 4 } }, flags: {} } });

  assert.deepEqual(calls.map(([method, route]) => [method, route]), [
    ['get', '/actors/actor-1?populate=true'],
    ['post', '/actors/actor-1/items'],
    ['put', '/actors/actor-1'],
  ]);
  assert.equal(calls[1][2].worldId, 'world-1');
});

test('runner never treats an unreadable stored journal as a completed progression', async () => {
  const values = new Map([[multiclassAdvancementJournalKey('world-1', 'actor-1'), '{bad json']]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const journal = readMulticlassAdvancementJournal('world-1', 'actor-1', storage);
  let writes = 0;
  await assert.rejects(runMulticlassAdvancementJournal(journal, {
    storage,
    readSnapshot: async () => ({ actor: { id: 'actor-1' }, items: [] }),
    applyOperation: async () => { writes++; return { id: 'unexpected' }; },
  }), /checkpoint is invalid/);
  assert.equal(writes, 0);
  assert.equal(journal.status, 'needs-review');
});
