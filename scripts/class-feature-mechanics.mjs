export function hasGrantedClassFeature(items = [], classIdentifier, level, identifier, name) {
  return (Array.isArray(items) ? items : []).some((item) => {
    if (item?.type !== 'feature') return false;
    const data = item.system || item.data || {};
    return data.classIdentifier === classIdentifier
      && Number(data.levelGained) === level
      && (data.identifier === identifier || String(item.name || '').trim().toLowerCase() === String(name).toLowerCase());
  });
}

/** True only for a granted SRD Barbarian Danger Sense feature. */
export function hasDangerSense(items = []) {
  return hasGrantedClassFeature(items, 'barbarian', 2, 'danger-sense', 'Danger Sense');
}

/** True only when the Bard has gained the level-2 Jack of All Trades feature. */
export function hasJackOfAllTrades(items = []) {
  return hasGrantedClassFeature(items, 'bard', 2, 'jack-of-all-trades', 'Jack of All Trades');
}

/** Half proficiency applies only to an ability check using an unproficient skill. */
export function jackOfAllTradesSkillBonus(items = [], proficiencyBonus = 0, skillProficient = false) {
  if (skillProficient || !hasJackOfAllTrades(items)) return 0;
  return Math.floor(Math.max(0, Number(proficiencyBonus) || 0) / 2);
}

const PRIMAL_KNOWLEDGE_SKILLS = new Set(['acrobatics', 'intimidation', 'perception', 'stealth', 'survival']);

/** Resolve the Strength-based skill check granted by Primal Knowledge during Rage. */
export function primalKnowledgeAbility(items = [], skillKey) {
  if (!PRIMAL_KNOWLEDGE_SKILLS.has(String(skillKey || '').toLowerCase())) return null;
  const hasFeature = hasGrantedClassFeature(items, 'barbarian', 3, 'primal-knowledge', 'Primal Knowledge');
  const raging = (Array.isArray(items) ? items : []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'feature' && data.classIdentifier === 'barbarian'
      && data.identifier === 'rage' && data.rageActive === true;
  });
  return hasFeature && raging ? 'str' : null;
}

/** Druid Magician adds at least +1 Wisdom to Intelligence (Arcana or Nature) checks. */
export function druidMagicianCheckBonus(items = [], skillKey, wisdomModifier) {
  if (!['arcana', 'nature'].includes(String(skillKey || '').toLowerCase())) return 0;
  const feature = (Array.isArray(items) ? items : []).some((item) => {
    const data = item?.system || item?.data || {};
    return item?.type === 'feature' && data.classIdentifier === 'druid'
      && Number(data.levelGained) === 1 && data.identifier === 'primal-order'
      && data.selectedOrder === 'magician';
  });
  return feature ? Math.max(1, Number.isFinite(Number(wisdomModifier)) ? Number(wisdomModifier) : 0) : 0;
}

export function hasFeralInstinct(items = []) {
  return hasGrantedClassFeature(items, 'barbarian', 7, 'feral-instinct', 'Feral Instinct');
}

export function hasIndomitableMight(items = []) {
  return hasGrantedClassFeature(items, 'barbarian', 18, 'indomitable-might', 'Indomitable Might');
}

export function indomitableMightReplacement(abilityKey, total, strengthScore, featureGranted) {
  const score = Number(strengthScore);
  const value = Number(total);
  if (abilityKey !== 'str' || !featureGranted || !Number.isFinite(score) || !Number.isFinite(value) || value >= score) return null;
  return score;
}

export function applyPrimalChampion(scores, classIdentifier, classLevel) {
  const next = { ...scores };
  if (classIdentifier !== 'barbarian' || Number(classLevel) < 20) return next;
  for (const key of ['str', 'con']) next[key] = Math.min(25, (Number(next[key]) || 0) + 4);
  return next;
}

/** List eligible class-specific Unarmored Defense base-AC formulas. */
export function unarmoredDefenseOptions(items = [], { dexterityModifier = 0, constitutionModifier = 0,
  wisdomModifier = 0, bodyArmorWorn = false, shieldWielded = false } = {}) {
  if (bodyArmorWorn) return [];
  const dex = Number(dexterityModifier) || 0;
  const formulas = [];
  if (hasGrantedClassFeature(items, 'barbarian', 1, 'unarmored-defense', 'Unarmored Defense')) {
    formulas.push({ classIdentifier: 'barbarian', baseAC: 10 + dex + (Number(constitutionModifier) || 0) });
  }
  if (!shieldWielded && hasGrantedClassFeature(items, 'monk', 1, 'unarmored-defense', 'Unarmored Defense')) {
    formulas.push({ classIdentifier: 'monk', baseAC: 10 + dex + (Number(wisdomModifier) || 0) });
  }
  return formulas;
}

/** Resolve one eligible base formula; a multiclass actor must explicitly select between alternatives. */
export function unarmoredDefenseBaseAC(items = [], options = {}) {
  const formulas = unarmoredDefenseOptions(items, options);
  if (formulas.length === 1) return formulas[0].baseAC;
  return formulas.find((formula) => formula.classIdentifier === options.selectedClass)?.baseAC ?? null;
}

export function dangerSenseApplies(abilityKey, conditions, featureGranted) {
  return abilityKey === 'dex' && !!featureGranted && !conditions?.includes('incapacitated');
}

export function resolveAdvantageSources(advantageSources, disadvantageSources) {
  if (advantageSources > 0 && disadvantageSources > 0) return 0;
  if (advantageSources > 0) return 1;
  if (disadvantageSources > 0) return -1;
  return 0;
}

/**
 * SRD 5.2 Fighter use counts that scale with Fighter level.
 * Action Surge (Fighter, "Action Surge"): one use from level 2, two from level 17.
 * Indomitable (Fighter, "Indomitable"): one use from level 9, two from level 13, three from level 17.
 */
const FIGHTER_USE_PROGRESSION = Object.freeze({
  'action-surge': (level) => (level >= 17 ? 2 : level >= 2 ? 1 : 0),
  indomitable: (level) => (level >= 17 ? 3 : level >= 13 ? 2 : level >= 9 ? 1 : 0),
});

/** Fighter class level from the actor's class items (multiclass uses the Fighter class level only). */
export function fighterClassLevel(items = []) {
  const fighter = (Array.isArray(items) ? items : []).find((item) => item?.type === 'class'
    && (item.system || item.data || {}).classIdentifier === 'fighter');
  return Math.max(0, Math.min(20, Math.trunc(Number((fighter?.system || fighter?.data || {}).levels)) || 0));
}

/** Maximum uses of a Fighter progression feature at the given Fighter level (0 when not yet available). */
export function fighterFeatureUsesAtLevel(identifier, fighterLevel) {
  const progression = FIGHTER_USE_PROGRESSION[identifier];
  return progression ? progression(Math.max(0, Math.min(20, Math.trunc(Number(fighterLevel)) || 0))) : 0;
}

/**
 * SRD 5.2 Action Surge: "you can use it twice before a rest but only once on a
 * turn" (the second use starts at Fighter level 17). Below 17 the feature has a
 * single use per rest, so no per-turn limit applies.
 */
export function fighterFeatureOncePerTurn(identifier, fighterLevel) {
  return identifier === 'action-surge' && (Math.trunc(Number(fighterLevel)) || 0) >= 17;
}

/**
 * Returns the item's uses re-synced to the actor's current Fighter level, or
 * null when the item is not a Fighter progression feature. Spent uses carry
 * over, so a level-up adds the new uses without refilling the spent ones.
 */
export function syncedFighterFeatureUses(itemData = {}, fighterLevel = 0) {
  if (itemData.classIdentifier !== 'fighter' || !FIGHTER_USE_PROGRESSION[itemData.identifier]) return null;
  const uses = itemData.uses || {};
  const max = fighterFeatureUsesAtLevel(itemData.identifier, fighterLevel);
  if (max <= 0) return uses;
  const previousMax = Math.max(0, Number(uses.max) || 0);
  const previousValue = Math.max(0, Math.min(previousMax, Number(uses.value) || 0));
  const value = !previousMax || previousValue >= previousMax
    ? max
    : Math.max(0, max - (previousMax - previousValue));
  return { ...uses, max, value };
}

/**
 * SRD 5.2 Ranger uses that equal the Wisdom modifier (minimum 1):
 * Tireless (level 10, Temporary Hit Points action) and Nature's Veil (level 14, Bonus Action Invisibility).
 * Both regain all expended uses on a Long Rest.
 */
const RANGER_WISDOM_USE_FEATURES = Object.freeze(new Set(['tireless', 'natures-veil']));

/**
 * Returns the item's uses re-synced to the actor's Wisdom modifier, or null when
 * the item is not a Ranger Wisdom-use feature. Spent uses carry over (same rule as
 * syncBardicInspiration), so a Wisdom change never refills spent uses.
 */
export function syncedRangerWisdomUses(itemData = {}, wisdomModifier = 0) {
  if (itemData.classIdentifier !== 'ranger' || !RANGER_WISDOM_USE_FEATURES.has(itemData.identifier)) return null;
  const uses = itemData.uses || {};
  const modifier = Number.isFinite(Number(wisdomModifier)) ? Math.trunc(Number(wisdomModifier)) : 0;
  const max = Math.max(1, modifier);
  const previousMax = Math.max(0, Number(uses.max) || 0);
  const previousValue = Math.max(0, Math.min(previousMax, Number(uses.value) || 0));
  const value = !previousMax || previousValue >= previousMax
    ? max
    : Math.min(previousValue, max);
  return { ...uses, max, value, recovery: 'lr' };
}
