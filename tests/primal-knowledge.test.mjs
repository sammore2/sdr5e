import test from 'node:test';
import assert from 'node:assert/strict';
import { primalKnowledgeAbility } from '../scripts/class-feature-mechanics.mjs';

const feature = { type: 'feature', name: 'Primal Knowledge', data: { classIdentifier: 'barbarian', levelGained: 3, identifier: 'primal-knowledge' } };
const rage = { type: 'feature', name: 'Rage', data: { classIdentifier: 'barbarian', levelGained: 1, identifier: 'rage', rageActive: true } };

test('Primal Knowledge uses Strength only for its listed skills while Rage and the feature are active', () => {
  for (const skill of ['acrobatics', 'intimidation', 'perception', 'stealth', 'survival']) {
    assert.equal(primalKnowledgeAbility([feature, rage], skill), 'str');
  }
  for (const skill of ['athletics', 'arcana', 'performance']) {
    assert.equal(primalKnowledgeAbility([feature, rage], skill), null);
  }
  assert.equal(primalKnowledgeAbility([feature], 'stealth'), null, 'inactive Rage does not grant the override');
  assert.equal(primalKnowledgeAbility([rage], 'stealth'), null, 'Rage alone does not grant the level-3 feature');
  assert.equal(primalKnowledgeAbility([{ ...feature, data: { ...feature.data, classIdentifier: 'fighter' } }, rage], 'stealth'), null);
});
