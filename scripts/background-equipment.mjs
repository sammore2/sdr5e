/** Versioned, source-checked starter equipment used by SRD 5.2 backgrounds. */
export const STARTING_EQUIPMENT_VERSION = 1;

const item = (identifier, name, weight, price, quantity = 1, description = '') => ({
  identifier, name, type: 'item', quantity, weight, price, description,
  source: 'SRD 5.2 (CC-BY-4.0)', category: 'gear', equipped: false,
});
const tool = (identifier, name, weight, price, toolType = 'artisan', ability = 'int') => ({
  identifier, name, type: 'tool', quantity: 1, weight, price,
  source: 'SRD 5.2 (CC-BY-4.0)', description: '', toolType, ability,
});
const weapon = (identifier, name, damage, damageType, weight, price, properties, mastery, extra = {}) => ({
  identifier, name, type: 'weapon', quantity: 1, weight, price,
  source: 'SRD 5.2 (CC-BY-4.0)', description: '', weaponType: extra.weaponType || 'simpleM',
  rangeType: extra.rangeType || 'melee', weaponGroup: extra.weaponGroup || 'other',
  handlingType: extra.handlingType || 'oneHanded', attackBonus: 0,
  damage: { formula: damage, type: damageType }, properties, mastery,
  ...(extra.ammunitionType ? { ammunitionType: extra.ammunitionType } : {}),
});

export const STARTING_EQUIPMENT_CATALOG = Object.freeze({
  'calligrapher-supplies': tool('calligraphers-supplies', "Calligrapher's Supplies", 5, { gp: 10, sp: 0, cp: 0 }),
  'thieves-tools': tool('thieves-tools', "Thieves' Tools", 1, { gp: 25, sp: 0, cp: 0 }, 'kit', 'dex'),
  'gaming-set-dice': tool('gaming-set-dice', 'Gaming Set: Dice', 0, { gp: 0, sp: 1, cp: 0 }, 'gaming', 'wis'),
  'gaming-set-dragonchess': tool('gaming-set-dragonchess', 'Gaming Set: Dragonchess', 0, { gp: 1, sp: 0, cp: 0 }, 'gaming', 'wis'),
  'gaming-set-playing-cards': tool('gaming-set-playing-cards', 'Gaming Set: Playing Cards', 0, { gp: 0, sp: 5, cp: 0 }, 'gaming', 'wis'),
  'gaming-set-three-dragon-ante': tool('gaming-set-three-dragon-ante', 'Gaming Set: Three-Dragon Ante', 0, { gp: 1, sp: 0, cp: 0 }, 'gaming', 'wis'),
  dagger: weapon('dagger', 'Dagger', '1d4', 'piercing', 1, { gp: 2, sp: 0, cp: 0 }, ['Finesse', 'Light', 'Thrown (Range 20/60)'], 'Nick'),
  'shortbow': weapon('shortbow', 'Shortbow', '1d6', 'piercing', 2, { gp: 25, sp: 0, cp: 0 }, ['Ammunition (Range 80/320; Arrow)', 'Two-Handed'], 'Vex', { weaponType: 'simpleR', rangeType: 'ranged', weaponGroup: 'bows', handlingType: 'twoHanded', ammunitionType: 'arrows' }),
  'quarterstaff': weapon('quarterstaff', 'Quarterstaff', '1d6', 'bludgeoning', 4, { gp: 0, sp: 2, cp: 0 }, ['Versatile (1d8)'], 'Topple', { weaponGroup: 'staffs', handlingType: 'versatile' }),
  spear: weapon('spear', 'Spear', '1d6', 'piercing', 3, { gp: 1, sp: 0, cp: 0 }, ['Thrown (Range 20/60)', 'Versatile (1d8)'], 'Sap', { weaponGroup: 'spears', handlingType: 'versatile' }),
  'book-prayers': item('book-prayers', 'Book (prayers)', 5, { gp: 25, sp: 0, cp: 0 }, 1, 'Prayer text.'),
  'book-history': item('book-history', 'Book (history)', 5, { gp: 25, sp: 0, cp: 0 }, 1, 'History text.'),
  'holy-symbol-amulet': item('holy-symbol-amulet', 'Holy Symbol (Amulet)', 1, { gp: 5, sp: 0, cp: 0 }),
  'holy-symbol-emblem': item('holy-symbol-emblem', 'Holy Symbol (Emblem)', 0, { gp: 5, sp: 0, cp: 0 }),
  'holy-symbol-reliquary': item('holy-symbol-reliquary', 'Holy Symbol (Reliquary)', 2, { gp: 5, sp: 0, cp: 0 }),
  parchment: item('parchment', 'Parchment', 0, { gp: 0, sp: 1, cp: 0 }),
  robe: item('robe', 'Robe', 4, { gp: 1, sp: 0, cp: 0 }),
  crowbar: item('crowbar', 'Crowbar', 5, { gp: 2, sp: 0, cp: 0 }, 1, 'Gives Advantage on Strength checks where its leverage applies.'),
  pouch: item('pouch', 'Pouch', 1, { gp: 0, sp: 5, cp: 0 }),
  'travelers-clothes': item('travelers-clothes', "Clothes, Traveler's", 4, { gp: 2, sp: 0, cp: 0 }),
  arrows: item('arrows', 'Arrows', 1, { gp: 1, sp: 0, cp: 0 }, 20),
  'healers-kit': {
    ...item('healers-kit', "Healer's Kit", 3, { gp: 5, sp: 0, cp: 0 }, 1, 'Contains ten uses. Target eligibility and stabilization remain manually adjudicated.'),
    actionCost: 'utilize',
    uses: { value: 10, max: 10, recovery: 'none', recharge: 0 },
  },
  quiver: item('quiver', 'Quiver', 1, { gp: 1, sp: 0, cp: 0 }, 1, 'Holds up to 20 arrows.'),
});

const PACKAGES = Object.freeze({
  acolyte: { A: { gp: 8, items: ['calligrapher-supplies', 'book-prayers', 'holy-symbol-choice', 'parchment-10', 'robe'] }, B: { gp: 50, items: [] } },
  criminal: { A: { gp: 16, items: ['daggers-2', 'thieves-tools', 'crowbar', 'pouches-2', 'travelers-clothes'] }, B: { gp: 50, items: [] } },
  sage: { A: { gp: 8, items: ['quarterstaff', 'calligrapher-supplies', 'book-history', 'parchment-8', 'robe'] }, B: { gp: 50, items: [] } },
  soldier: { A: { gp: 14, items: ['spear', 'shortbow', 'arrows', 'gaming-set-choice', 'healers-kit', 'quiver', 'travelers-clothes'] }, B: { gp: 50, items: [] } },
});

const OVERRIDES = Object.freeze({
  'daggers-2': ['dagger', 2], 'pouches-2': ['pouch', 2], 'parchment-10': ['parchment', 10], 'parchment-8': ['parchment', 8],
});

export function backgroundEquipmentPackageOptions(identifier) {
  return PACKAGES[identifier] ? ['A', 'B'] : [];
}

/** Resolve a selected A/B package before any actor or item write. */
export function resolveBackgroundEquipment(identifier, selection = {}) {
  const packages = PACKAGES[identifier];
  if (!packages || !packages[selection.package]) return { valid: false, errors: ['invalid-equipment-package'], gp: 0, items: [] };
  const bundle = packages[selection.package];
  const items = [];
  for (const entry of bundle.items) {
    let id = entry;
    let quantity = null;
    if (OVERRIDES[entry]) [id, quantity] = OVERRIDES[entry];
    else if (entry === 'holy-symbol-choice') {
      const forms = { amulet: 'holy-symbol-amulet', emblem: 'holy-symbol-emblem', reliquary: 'holy-symbol-reliquary' };
      id = forms[selection.holySymbol];
      if (!id) return { valid: false, errors: ['holy-symbol-form-required'], gp: 0, items: [] };
    } else if (entry === 'gaming-set-choice') {
      const gameSets = {
        'Gaming Set: Dice': 'gaming-set-dice',
        'Gaming Set: Dragonchess': 'gaming-set-dragonchess',
        'Gaming Set: Playing Cards': 'gaming-set-playing-cards',
        'Gaming Set: Three-Dragon Ante': 'gaming-set-three-dragon-ante',
      };
      id = gameSets[selection.tool];
      if (!id) return { valid: false, errors: ['gaming-set-choice-required'], gp: 0, items: [] };
    }
    const record = STARTING_EQUIPMENT_CATALOG[id];
    if (!record) return { valid: false, errors: ['equipment-catalog-entry-missing'], gp: 0, items: [] };
    items.push({ name: record.name, type: record.type, data: { ...record, price: { ...record.price }, quantity: quantity ?? record.quantity ?? 1 } });
  }
  return { valid: true, errors: [], gp: bundle.gp, items };
}
