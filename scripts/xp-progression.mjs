/** Character advancement thresholds from the local SRD 5.2.1 table. */
export const SRD_XP_LEVEL_THRESHOLDS = Object.freeze([
  0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000,
  85_000, 100_000, 120_000, 140_000, 165_000, 195_000, 225_000,
  265_000, 305_000, 355_000,
]);

export const POST_LEVEL_20_BONUS_FEAT_BASE_XP = 355_000;
export const POST_LEVEL_20_BONUS_FEAT_INTERVAL = 30_000;

/** SRD starting XP is the minimum threshold for the chosen starting level. */
export function startingExperiencePoints(level) {
  const startingLevel = Number(level);
  if (!Number.isSafeInteger(startingLevel) || startingLevel < 1 || startingLevel > SRD_XP_LEVEL_THRESHOLDS.length) {
    throw new RangeError('Starting character level must be an integer from 1 to 20.');
  }
  return SRD_XP_LEVEL_THRESHOLDS[startingLevel - 1];
}

/** Resolve earned character level and progress to the next XP threshold. */
export function resolveXpProgress(experiencePoints, currentLevel) {
  const xp = Number(experiencePoints);
  const level = Number(currentLevel);
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError('XP must be a non-negative safe integer.');
  if (!Number.isSafeInteger(level) || level < 1 || level > SRD_XP_LEVEL_THRESHOLDS.length) {
    throw new RangeError('Character level must be an integer from 1 to 20.');
  }

  let earnedLevel = 1;
  for (let index = 1; index < SRD_XP_LEVEL_THRESHOLDS.length; index++) {
    if (xp < SRD_XP_LEVEL_THRESHOLDS[index]) break;
    earnedLevel = index + 1;
  }

  const nextLevel = level < SRD_XP_LEVEL_THRESHOLDS.length ? level + 1 : null;
  const currentThreshold = SRD_XP_LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = nextLevel ? SRD_XP_LEVEL_THRESHOLDS[nextLevel - 1] : null;
  const xpWithinLevel = Math.max(0, xp - currentThreshold);
  const xpToNextLevel = nextThreshold === null ? 0 : Math.max(0, nextThreshold - xp);
  const levelSpan = nextThreshold === null ? 0 : nextThreshold - currentThreshold;

  return {
    xp,
    currentLevel: level,
    earnedLevel,
    nextLevel,
    currentThreshold,
    nextThreshold,
    xpWithinLevel,
    xpToNextLevel,
    progressPercent: levelSpan > 0
      ? Math.max(0, Math.min(100, Math.floor((xpWithinLevel / levelSpan) * 100)))
      : 100,
    eligible: earnedLevel > level,
    eligibleLevelCount: Math.max(0, earnedLevel - level),
  };
}

/** XP progression is enforced only when the world has not enabled milestones. */
export function resolveLevelUpEligibility(experiencePoints, currentLevel, learningMilestones = true) {
  const level = Number(currentLevel);
  if (!Number.isSafeInteger(level) || level < 1 || level > SRD_XP_LEVEL_THRESHOLDS.length) {
    throw new RangeError('Character level must be an integer from 1 to 20.');
  }
  if (level === SRD_XP_LEVEL_THRESHOLDS.length) {
    return { allowed: false, reason: 'level-cap', progress: resolveXpProgress(experiencePoints, level) };
  }
  const progress = resolveXpProgress(experiencePoints, level);
  if (learningMilestones === true) return { allowed: true, reason: 'milestone-mode', progress };
  return {
    allowed: progress.eligible,
    reason: progress.eligible ? 'xp-earned' : 'xp-required',
    progress,
  };
}

/** Resolve the optional SRD bonus-feat thresholds for a level-20 character. */
export function resolvePostLevel20FeatProgress(experiencePoints, claimedThresholds = []) {
  const xp = Number(experiencePoints);
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError('XP must be a non-negative safe integer.');
  if (!Array.isArray(claimedThresholds)) throw new TypeError('Claimed bonus-feat thresholds must be an array.');
  const claimed = claimedThresholds.map(Number);
  if (claimed.some((threshold) => !Number.isSafeInteger(threshold)
    || threshold <= POST_LEVEL_20_BONUS_FEAT_BASE_XP
    || (threshold - POST_LEVEL_20_BONUS_FEAT_BASE_XP) % POST_LEVEL_20_BONUS_FEAT_INTERVAL !== 0)
    || new Set(claimed).size !== claimed.length) {
    throw new RangeError('Claimed bonus-feat thresholds must be unique valid SRD milestones above 355,000 XP.');
  }

  const earnedCount = Math.max(0, Math.floor((xp - POST_LEVEL_20_BONUS_FEAT_BASE_XP) / POST_LEVEL_20_BONUS_FEAT_INTERVAL));
  const earnedThresholds = Array.from({ length: earnedCount }, (_, index) =>
    POST_LEVEL_20_BONUS_FEAT_BASE_XP + POST_LEVEL_20_BONUS_FEAT_INTERVAL * (index + 1));
  if (claimed.some((threshold) => !earnedThresholds.includes(threshold))) {
    throw new RangeError('A bonus feat cannot be claimed before its XP milestone is earned.');
  }
  const unclaimedThresholds = earnedThresholds.filter((threshold) => !claimed.includes(threshold));
  const nextThreshold = POST_LEVEL_20_BONUS_FEAT_BASE_XP
    + POST_LEVEL_20_BONUS_FEAT_INTERVAL * (earnedCount + 1);
  return {
    xp,
    earnedCount,
    earnedThresholds,
    claimedThresholds: claimed,
    unclaimedThresholds,
    nextThreshold,
    xpToNext: Math.max(0, nextThreshold - xp),
  };
}
