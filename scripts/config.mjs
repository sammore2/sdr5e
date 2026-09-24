// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/config.mjs
// Component Version: 0.1.0
// Shared constants: skill/ability tables, labels, item-type maps.
// Pure data, no imports — every other module depends on this one.
// ══════════════════════════════════════════════════════════════════════════

export const SKILL_ABILITIES = {
  acrobatics: 'dex', animalHandling: 'wis', arcana: 'int', athletics: 'str',
  performance: 'cha', deception: 'cha', stealth: 'dex', history: 'int',
  intimidation: 'cha', insight: 'wis', investigation: 'int', medicine: 'wis',
  nature: 'int', perception: 'wis', persuasion: 'cha', sleightOfHand: 'dex',
  religion: 'int', survival: 'wis',
};

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_LABELS = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

export const SKILL_LABELS = {
  acrobatics: 'Acrobatics', animalHandling: 'Animal Handling', arcana: 'Arcana', athletics: 'Athletics',
  performance: 'Performance', deception: 'Deception', stealth: 'Stealth', history: 'History',
  intimidation: 'Intimidation', insight: 'Insight', investigation: 'Investigation', medicine: 'Medicine',
  nature: 'Nature', perception: 'Perception', persuasion: 'Persuasion', sleightOfHand: 'Sleight of Hand',
  religion: 'Religion', survival: 'Survival',
};

// SRD weapon proficiency categories — the exact codes `isWeaponProficient`
// (roll-engine.mjs) matches against `weaponType` and `proficiencies.weapons`.
export const WEAPON_CATEGORY_CODES = ['simpleM', 'simpleR', 'martialM', 'martialR'];
export const WEAPON_CATEGORY_LABELS = {
  simpleM: 'Simple Melee', simpleR: 'Simple Ranged',
  martialM: 'Martial Melee', martialR: 'Martial Ranged',
};

// Carrying capacity = STR score × 15 × size multiplier (SRD encumbrance rule).
export const SIZE_LABELS = { tiny: 'Tiny', sm: 'Small', med: 'Md', lg: 'Large', huge: 'Huge', garg: 'Garg.' };
export const SIZE_CARRY_MULTIPLIER = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 4, garg: 8 };

// Fixed enum (not free text) so it matches exactly what weapon/spell
// `damage.type` fields use — a GM typing "Fogo" for a resistance while the
// weapon says "fire" would silently never match in applyDamage's lookup.
export const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
];
export const DAMAGE_TYPE_LABELS = Object.fromEntries(DAMAGE_TYPES.map((t) => [t, t[0].toUpperCase() + t.slice(1)]));

export const ITEM_TYPE_ICON = {
  weapon: '🗡️', armor: '🛡️', feature: '⭐', item: '🎒', language: '🗣️',
  race: '🧬', class: '📜', subclass: '📜', background: '🏛️', feat: '🎖️', spell: '✨',
  consumable: '🧪', tool: '🔧', loot: '💰', container: '🧰',
};
export const ITEM_TYPE_LABEL = {
  weapon: 'Weapons', armor: 'Armor', feature: 'Features', item: 'Items', language: 'Languages',
  race: 'Races', class: 'Classes', subclass: 'Subclasses', background: 'Backgrounds', feat: 'Feats', spell: 'Spells',
  consumable: 'Consumables', tool: 'Tools', loot: 'Loot', container: 'Containers',
};

// Singular name for "New X" on item creation — needs to be explicit, can't be
// derived from ITEM_TYPE_LABEL with a `.replace(/s$/, '')` regex: "Class" ends
// in "s" but isn't plural, produced "New Clas" (real bug found while testing
// item creation on the sheet).
export const ITEM_TYPE_SINGULAR = {
  weapon: 'Weapon', armor: 'Armor', feature: 'Feature', item: 'Item', language: 'Language',
  race: 'Race', class: 'Class', subclass: 'Subclass', background: 'Background', feat: 'Feat', spell: 'Spell',
  consumable: 'Consumable', tool: 'Tool', loot: 'Loot', container: 'Container',
};

export const ACTOR_TYPE_LABEL = { character: 'Character', npc: 'NPC', group: 'Group', vehicle: 'Vehicle', encounter: 'Encounter' };

// SRD 5.1 spell slot progression — index 0 = nível de classe 1, index 19 =
// nível de classe 20. Cada array tem até 9 posições (slot nível 1 a 9).
// 'full' = Bard/Cleric/Druid/Sorcerer/Wizard. 'half' = Paladin/Ranger
// (começam a conjurar no nível 2 de classe, por isso os dois primeiros
// registros ficam vazios). 'pact' (Warlock) não usa esta tabela — ver
// Handout 01, seção "Fora do escopo".
export const SPELL_SLOT_TABLE = {
  full: [
    [2],
    [3],
    [4, 2],
    [4, 3],
    [4, 3, 2],
    [4, 3, 3],
    [4, 3, 3, 1],
    [4, 3, 3, 2],
    [4, 3, 3, 3, 1],
    [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1],
    [4, 3, 3, 3, 2, 1],
    [4, 3, 3, 3, 2, 1, 1],
    [4, 3, 3, 3, 2, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ],
  half: [
    [],
    [2],
    [3],
    [3],
    [4, 2],
    [4, 2],
    [4, 3],
    [4, 3],
    [4, 3, 2],
    [4, 3, 2],
    [4, 3, 3],
    [4, 3, 3],
    [4, 3, 3, 1],
    [4, 3, 3, 1],
    [4, 3, 3, 2],
    [4, 3, 3, 2],
    [4, 3, 3, 3, 1],
    [4, 3, 3, 3, 1],
    [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2],
  ],
};

// SRD 5.1 — magias/cantrips conhecidos por nível, pras 4 classes "known"
// (sem preparação diária). Index 0 = nível de classe 1. Patrulheiro não tem
// cantrip (confirmado: sem coluna "Cantrips Known" na tabela do Ranger).
export const KNOWN_SPELLS_TABLE = {
  bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  ranger: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
};

export const KNOWN_CANTRIPS_TABLE = {
  bard: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  sorcerer: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  warlock: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
};

// SRD 5.1 — Multiclassing Prerequisites (Characterizations/Multiclassing.md).
// `mode: 'and'` (padrão) exige todos os itens de `abilities`; `mode: 'or'`
// (só o Fighter) exige pelo menos um.
export const MULTICLASS_PREREQS = {
  barbarian: { abilities: ['str'], score: 13 },
  bard: { abilities: ['cha'], score: 13 },
  cleric: { abilities: ['wis'], score: 13 },
  druid: { abilities: ['wis'], score: 13 },
  fighter: { abilities: ['str', 'dex'], score: 13, mode: 'or' },
  monk: { abilities: ['dex', 'wis'], score: 13 },
  paladin: { abilities: ['str', 'cha'], score: 13 },
  ranger: { abilities: ['dex', 'wis'], score: 13 },
  rogue: { abilities: ['dex'], score: 13 },
  sorcerer: { abilities: ['cha'], score: 13 },
  warlock: { abilities: ['cha'], score: 13 },
  wizard: { abilities: ['int'], score: 13 },
};

export const CLASS_IDENTIFIER_LABELS = {
  none: 'Custom / Homebrew',
  barbarian: 'Barbarian', bard: 'Bard', cleric: 'Cleric', druid: 'Druid',
  fighter: 'Fighter', monk: 'Monk', paladin: 'Paladin', ranger: 'Ranger',
  rogue: 'Rogue', sorcerer: 'Sorcerer', warlock: 'Warlock', wizard: 'Wizard',
};

// Handout 24 — níveis em que toda classe do SRD ganha Ability Score
// Improvement (Barbarian.md:95, idêntico nas outras 11 classes: "When you
// reach 4th level, and again at 8th, 12th, 16th, and 19th level").
export const ASI_LEVELS = [4, 8, 12, 16, 19];

// SRD 5.1 class tables: the level at which each class picks its subclass.
// Keyed by `classIdentifier` (see CLASS_IDENTIFIER_LABELS). Classes not listed
// (including 'none'/homebrew) fall back to SUBCLASS_LEVEL_DEFAULT.
export const SUBCLASS_LEVEL_BY_CLASS = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };
export const SUBCLASS_LEVEL_DEFAULT = 3;
export const subclassLevelFor = (classIdentifier) => SUBCLASS_LEVEL_BY_CLASS[classIdentifier] ?? SUBCLASS_LEVEL_DEFAULT;

// Full SRD 5.1 condition list — marker (id/label/color) a GM can drop on a
// token from the core's status UI. Mechanical side (poisoned -> disadvantage,
// restrained/paralyzed/stunned/unconscious/exhaustion rules) is wired in
// roll-engine.mjs. Moved here from srd5e.mjs so other modules can import it.
export const CONDITIONS = [
  { id: 'charmed', label: 'Charmed', color: 0xe91e8c },
  { id: 'deafened', label: 'Deafened', color: 0x8a8a8a },
  { id: 'frightened', label: 'Frightened', color: 0x9b59b6 },
  { id: 'grappled', label: 'Grappled', color: 0x795548 },
  { id: 'incapacitated', label: 'Incapacitated', color: 0x607d8b },
  { id: 'paralyzed', label: 'Paralyzed', color: 0xffc107 },
  { id: 'petrified', label: 'Petrified', color: 0x9e9e9e },
  { id: 'restrained', label: 'Restrained', color: 0x8b4513 },
  { id: 'unconscious', label: 'Unconscious', color: 0x1a1614 },
  { id: 'cover-half', label: 'Half Cover (+2 AC/DEX)', color: 0x4a90d9 },
  { id: 'cover-3q', label: 'Three-Quarters Cover (+5 AC/DEX)', color: 0x2c5f8a },
];

// Movement modes, in display order. Values on actors/races are numbers in meters.
export const MOVEMENT_TYPES = ['walk', 'fly', 'swim', 'climb', 'burrow'];
export const MOVEMENT_LABELS = { walk: 'Walk', fly: 'Fly', swim: 'Swim', climb: 'Climb', burrow: 'Burrow' };

// Special senses with a range, in meters. 0 = does not have the sense.
export const SENSE_TYPES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];
export const SENSE_LABELS = { darkvision: 'Darkvision', blindsight: 'Blindsight', tremorsense: 'Tremorsense', truesight: 'Truesight' };

// The ruleset's distance unit. Conversion used by the compendium build (.dev/build-compendium.mjs
// `feetToLoom`): meters = round(feet * 0.3), so 30 ft -> 9 m, 120 ft -> 36 m.
export const DISTANCE_UNIT = 'm';
export const feetToMeters = (ft) => Math.round((Number(ft) || 0) * 0.3);

// XP Budget per Character (SRD 5.2, CC-BY-4.0) — levels 1-20 × Low/Moderate/High
export const ENCOUNTER_XP_BUDGET = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11700 },
  18: { low: 5000, moderate: 8700, high: 14200 },
  19: { low: 5500, moderate: 10700, high: 17200 },
  20: { low: 6400, moderate: 13200, high: 22000 },
};
