import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClassFeatureGrantPlan } from '../scripts/class-feature-grant-plan.mjs';

test('plans Bard Expertise and pool synchronization without writing or mutating actor items', () => {
  const inspiration = { id: 'inspiration-1', name: 'Bardic Inspiration', type: 'feature', data: {
    classIdentifier: 'bard', identifier: 'bardic-inspiration', uses: { value: 1, max: 1, recovery: 'lr' },
    bardicInspirationDie: 'd6', mechanicsSupport: { status: 'assisted' },
  } };
  const result = buildClassFeatureGrantPlan({
    classIdentifier: 'bard', fromLevel: 1, toLevel: 2, featureEntries: [{
      id: 'bard-expertise-pack', name: 'Expertise', type: 'feature', data: {
        classIdentifier: 'bard', levelGained: 2, identifier: 'bard-expertise', source: 'SRD 5.2 (CC-BY-4.0)',
      },
    }],
    existingItems: [inspiration], charismaScore: 16, bardExpertiseSelections: { 2: ['performance', 'persuasion'] },
  });

  assert.deepEqual(result.operations.map(({ kind, key }) => [kind, key]), [
    ['create-item', 'feature-2-expertise'],
    ['update-item', 'sync-bardic-inspiration'],
  ]);
  assert.deepEqual(result.operations[0].payload.data.selectedExpertiseSkills, ['performance', 'persuasion']);
  assert.equal(result.operations[1].payload.data.uses.max, 3);
  assert.equal(result.operations[1].payload.data.uses.value, 3);
  assert.equal(inspiration.data.uses.max, 1, 'planning must not mutate the current actor item');
});

test('a non-Barbarian class level-up never resizes a multiclass Barbarian Rage pool', () => {
  const rage = { id: 'rage-1', name: 'Rage', type: 'feature', data: {
    classIdentifier: 'barbarian', identifier: 'rage', uses: { value: 2, max: 6, recovery: 'lr' },
  } };
  const result = buildClassFeatureGrantPlan({
    classIdentifier: 'wizard', fromLevel: 1, toLevel: 2, featureEntries: [], existingItems: [rage],
  });
  assert.deepEqual(result.operations, []);
  assert.equal(rage.data.uses.max, 6);
});
