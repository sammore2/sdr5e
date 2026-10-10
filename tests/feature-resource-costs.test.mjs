import test from 'node:test';
import assert from 'node:assert/strict';
import { executeFeatureResourceCosts } from '../scripts/feature-resource-costs.mjs';

test('insufficient class resource rejects a charged feature before either resource is written', async () => {
  const actor = { id: 'actor-1', systemData: { resources: { primary: { label: 'Focus', value: 1 } } } };
  const item = { id: 'feature-1', name: 'Focused Strike', system: { resourceCost: 2, uses: { value: 1, max: 1 } } };
  const before = structuredClone({ actor, item });
  const writes = [];

  const result = await executeFeatureResourceCosts(actor, item, {
    consumeUse: async (...args) => { writes.push(['use', ...args]); return true; },
    spendClassResource: async (...args) => { writes.push(['resource', ...args]); return true; },
  });

  assert.deepEqual(result, { valid: false, reason: 'resource-insufficient', resource: 'Focus' });
  assert.deepEqual(writes, []);
  assert.deepEqual({ actor, item }, before);
});

test('depleted item uses reject the feature before class resource is spent', async () => {
  const actor = { id: 'actor-1', systemData: { resources: { primary: { label: 'Focus', value: 3 } } } };
  const item = { id: 'feature-1', name: 'Focused Strike', system: { resourceCost: 2, uses: { value: 0, max: 1 } } };
  const writes = [];

  const result = await executeFeatureResourceCosts(actor, item, {
    consumeUse: async (...args) => { writes.push(['use', ...args]); return true; },
    spendClassResource: async (...args) => { writes.push(['resource', ...args]); return true; },
  });

  assert.deepEqual(result, { valid: false, reason: 'uses-depleted', itemName: 'Focused Strike' });
  assert.deepEqual(writes, []);
  assert.equal(actor.systemData.resources.primary.value, 3);
});

test('a charged feature cannot bypass its cost when the actor has no primary resource pool', async () => {
  const actor = { id: 'actor-1', systemData: { resources: {} } };
  const item = { id: 'feature-1', name: 'Focused Strike', system: { resourceCost: 1, uses: { value: 1, max: 1 } } };
  const writes = [];

  const result = await executeFeatureResourceCosts(actor, item, {
    consumeUse: async (...args) => { writes.push(['use', ...args]); return true; },
    spendClassResource: async (...args) => { writes.push(['resource', ...args]); return true; },
  });

  assert.deepEqual(result, { valid: false, reason: 'resource-unavailable', resource: 'Resource' });
  assert.deepEqual(writes, []);
  assert.equal(item.system.uses.value, 1);
});

test('valid feature costs consume the item use and named class resource in order', async () => {
  const actor = { id: 'actor-1', systemData: { resources: { primary: { label: 'Focus', value: 3 } } } };
  const item = { id: 'feature-1', name: 'Focused Strike', system: { resourceCost: 2, uses: { value: 1, max: 1 } } };
  const writes = [];

  const result = await executeFeatureResourceCosts(actor, item, {
    consumeUse: async (...args) => { writes.push(['use', ...args]); return true; },
    spendClassResource: async (...args) => { writes.push(['resource', ...args]); return true; },
  });

  assert.deepEqual(result, { valid: true });
  assert.deepEqual(writes, [['use', actor, item], ['resource', actor, 2]]);
});
