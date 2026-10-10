import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { POST_LEVEL_20_BONUS_FEAT_BASE_XP, POST_LEVEL_20_BONUS_FEAT_INTERVAL, resolveLevelUpEligibility, resolvePostLevel20FeatProgress, resolveXpProgress, startingExperiencePoints, SRD_XP_LEVEL_THRESHOLDS } from '../scripts/xp-progression.mjs';

test('XP thresholds match all twenty rows in the local SRD advancement table', async () => {
  const source = await readFile(new URL('../.dev/srd5.2_markdown/character-creation.md', import.meta.url), 'utf8');
  const section = source.match(/## Level Advancement([\s\S]*?)(?=\n## |$)/)?.[1] || '';
  const rows = [...section.matchAll(/<tr>\s*<td>(\d+)<\/td>\s*<td>([\d,]+)<\/td>/g)]
    .map(([, level, xp]) => [Number(level), Number(xp.replaceAll(',', ''))]);

  assert.equal(rows.length, 20);
  assert.deepEqual(rows.map(([, xp]) => xp), SRD_XP_LEVEL_THRESHOLDS);
});

test('XP progress uses the character current level span and detects earned levels', () => {
  assert.deepEqual(resolveXpProgress(299, 1), {
    xp: 299, currentLevel: 1, earnedLevel: 1, nextLevel: 2,
    currentThreshold: 0, nextThreshold: 300, xpWithinLevel: 299,
    xpToNextLevel: 1, progressPercent: 99, eligible: false, eligibleLevelCount: 0,
  });
  assert.equal(resolveXpProgress(300, 1).eligible, true);
  assert.equal(resolveXpProgress(900, 2).eligibleLevelCount, 1);
  assert.equal(resolveXpProgress(2_700, 1).eligibleLevelCount, 3);
  assert.equal(resolveXpProgress(354_999, 19).progressPercent, 99);
  assert.equal(resolveXpProgress(355_000, 19).eligible, true);
  assert.equal(resolveXpProgress(500_000, 20).nextLevel, null);
  assert.equal(resolveXpProgress(500_000, 20).progressPercent, 100);
});

test('XP progress rejects invalid XP totals and character levels', () => {
  for (const xp of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => resolveXpProgress(xp, 1), RangeError);
  }
  for (const level of [0, 1.5, 21, Number.NaN]) {
    assert.throws(() => resolveXpProgress(0, level), RangeError);
  }
});

test('high-level characters start at the minimum SRD XP total for their chosen level', () => {
  assert.equal(startingExperiencePoints(1), 0);
  assert.equal(startingExperiencePoints(2), 300);
  assert.equal(startingExperiencePoints(10), 64_000);
  assert.equal(startingExperiencePoints(20), 355_000);
  assert.throws(() => startingExperiencePoints(0), RangeError);
  assert.throws(() => startingExperiencePoints(21), RangeError);
});

test('level-up eligibility follows the world milestone setting and XP threshold', () => {
  assert.equal(resolveLevelUpEligibility(0, 1, true).reason, 'milestone-mode');
  assert.equal(resolveLevelUpEligibility(299, 1, false).allowed, false);
  assert.equal(resolveLevelUpEligibility(300, 1, false).reason, 'xp-earned');
  assert.equal(resolveLevelUpEligibility(355_000, 20, true).reason, 'level-cap');
});

test('optional level-20 bonus-feat milestones match the SRD rule and remain claimable once each', async () => {
  const source = await readFile(new URL('../.dev/srd5.2_markdown/character-creation.md', import.meta.url), 'utf8');
  const rule = source.match(/\*\*Bonus Feats at Level 20\*\*([\s\S]*?)(?=\n### |$)/)?.[1] || '';
  assert.match(rule, /30,000 XP.*above 355,000 XP/s);
  assert.equal(POST_LEVEL_20_BONUS_FEAT_BASE_XP, 355_000);
  assert.equal(POST_LEVEL_20_BONUS_FEAT_INTERVAL, 30_000);
  assert.deepEqual(resolvePostLevel20FeatProgress(355_000).unclaimedThresholds, []);
  assert.equal(resolvePostLevel20FeatProgress(384_999).xpToNext, 1);
  assert.deepEqual(resolvePostLevel20FeatProgress(385_000).unclaimedThresholds, [385_000]);
  assert.deepEqual(resolvePostLevel20FeatProgress(415_000).earnedThresholds, [385_000, 415_000]);
  assert.deepEqual(resolvePostLevel20FeatProgress(415_000, [385_000]).unclaimedThresholds, [415_000]);
  assert.deepEqual(resolvePostLevel20FeatProgress(445_000).unclaimedThresholds, [385_000, 415_000, 445_000]);
  assert.throws(() => resolvePostLevel20FeatProgress(415_000, [385_000, 385_000]), RangeError);
  assert.throws(() => resolvePostLevel20FeatProgress(415_000, [400_000]), RangeError);
  assert.throws(() => resolvePostLevel20FeatProgress(415_000, [445_000]), RangeError);
  assert.throws(() => resolvePostLevel20FeatProgress(-1), RangeError);
  assert.throws(() => resolvePostLevel20FeatProgress(355_000, null), TypeError);
});
