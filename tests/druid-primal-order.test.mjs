import test from 'node:test';
import assert from 'node:assert/strict';
import { druidMagicianCheckBonus } from '../scripts/class-feature-mechanics.mjs';
import { resolveDruidPrimalOrderChoice } from '../scripts/druid-primal-order.mjs';

const druidCantrip = (id, classes = ['druid'], spellLevel = 0) => ({
  id, name: id, type: 'spell', data: { identifier: id, classes, spellLevel },
});

test('Druid Primal Order validates Magician and Warden and requires a distinct Druid cantrip', () => {
  const entries = [druidCantrip('druid-extra'), druidCantrip('other-extra', ['wizard']), druidCantrip('druid-level-one', ['druid'], 1)];
  assert.equal(resolveDruidPrimalOrderChoice('warden', '', entries).valid, true);
  assert.equal(resolveDruidPrimalOrderChoice('warden', 'druid-extra', entries).reason, 'unexpected-extra-cantrip');
  assert.equal(resolveDruidPrimalOrderChoice('magician', 'druid-extra', entries).valid, true);
  assert.equal(resolveDruidPrimalOrderChoice('magician', 'druid-extra', entries, ['druid-extra']).reason, 'duplicate-extra-cantrip');
  assert.equal(resolveDruidPrimalOrderChoice('magician', 'other-extra', entries).valid, false);
  assert.equal(resolveDruidPrimalOrderChoice('unknown', '', entries).valid, false);
});

test('Druid Magician adds Wisdom to only Arcana and Nature checks with a +1 minimum', () => {
  const item = { type: 'feature', data: { classIdentifier: 'druid', levelGained: 1, identifier: 'primal-order', selectedOrder: 'magician' } };
  assert.equal(druidMagicianCheckBonus([item], 'arcana', 3), 3);
  assert.equal(druidMagicianCheckBonus([item], 'nature', -1), 1);
  assert.equal(druidMagicianCheckBonus([item], 'religion', 4), 0);
  assert.equal(druidMagicianCheckBonus([{ ...item, data: { ...item.data, selectedOrder: 'warden' } }], 'nature', 4), 0);
  assert.equal(druidMagicianCheckBonus([{ ...item, data: { ...item.data, classIdentifier: 'cleric' } }], 'arcana', 4), 0);
});
