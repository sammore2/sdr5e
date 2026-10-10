import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WARLOCK_LEVEL_ONE_INVOCATIONS, resolveWarlockLevelOneInvocation } from '../scripts/warlock-invocations.mjs';

const source = readFileSync(new URL('../.dev/srd5.2_markdown/classes.md', import.meta.url), 'utf8');

test('Warlock level-one choices are source-backed invocation options without prerequisites', () => {
  assert.equal(WARLOCK_LEVEL_ONE_INVOCATIONS.length, 5);
  for (const option of WARLOCK_LEVEL_ONE_INVOCATIONS) {
    const escapedName = option.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = source.match(new RegExp(`^#### ${escapedName}\\r?\\n([\\s\\S]*?)(?=^#### |^### )`, 'm'))?.[1]?.trim();
    assert.ok(body, `local SRD 5.2 text contains ${option.name}`);
    assert.ok(!body.startsWith('_Prerequisite:'), `${option.name} is available at Warlock level 1`);
    assert.equal(resolveWarlockLevelOneInvocation(option.identifier).valid, true);
  }
  assert.equal(resolveWarlockLevelOneInvocation('agonizing-blast').valid, false, 'level 2+ invocations are not offered at entry');
});
