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

export const ITEM_TYPE_ICON = { weapon: '🗡️', armor: '🛡️', feature: '⭐', item: '🎒', language: '🗣️' };
export const ITEM_TYPE_LABEL = { weapon: 'Weapons', armor: 'Armor', feature: 'Features', item: 'Items', language: 'Languages' };

// Singular name for "New X" on item creation — needs to be explicit, can't be
// derived from ITEM_TYPE_LABEL with a `.replace(/s$/, '')` regex: "Class" ends
// in "s" but isn't plural, produced "New Clas" (real bug found while testing
// item creation on the sheet).
export const ITEM_TYPE_SINGULAR = {
  weapon: 'Weapon', armor: 'Armor', feature: 'Feature', item: 'Item', language: 'Language',
  race: 'Race', class: 'Class', subclass: 'Subclass', background: 'Background', feat: 'Feat', spell: 'Spell',
};

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
