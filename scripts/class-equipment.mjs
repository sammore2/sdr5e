/** Versioned class starting equipment; source-checked against local SRD 5.2. */
export const CLASS_STARTING_EQUIPMENT_VERSION = 1;

const gear = (identifier, name, weight, price, quantity = 1, description = '') => ({
  identifier, name, type: 'item', quantity, weight, price, description,
  source: 'SRD 5.2 (CC-BY-4.0)', category: 'gear', equipped: false,
});
const weapon = (identifier, name, formula, damageType, weight, price, properties, mastery, extra = {}) => ({
  identifier, name, type: 'weapon', quantity: 1, weight, price,
  source: 'SRD 5.2 (CC-BY-4.0)', description: '', weaponType: extra.weaponType || 'simpleM',
  rangeType: extra.rangeType || 'melee', weaponGroup: extra.weaponGroup || 'other',
  handlingType: extra.handlingType || 'oneHanded', attackBonus: 0,
  damage: { formula, type: damageType }, properties, mastery,
});
const tool = (identifier, name, weight, price, toolType = 'musical', ability = 'cha') => ({
  identifier, name, type: 'tool', quantity: 1, weight, price,
  source: 'SRD 5.2 (CC-BY-4.0)', description: '', toolType, ability,
});
const armor = (identifier, name, weight, price, armorType, acValue, stealthDisadvantage = false) => ({
  identifier, name, type: 'armor', quantity: 1, weight, price, source: 'SRD 5.2 (CC-BY-4.0)',
  armorType, acValue, dexMax: armorType === 'light' ? null : 2, strengthReq: 0,
  stealthDisadvantage, isMetal: false, equipped: false, primarySlot: 'torso',
});
const container = (identifier, name, price) => ({
  identifier, name, type: 'container', quantity: 1, weight: 0, price,
  source: 'SRD 5.2 (CC-BY-4.0)', description: '', capacity: { type: 'weight', value: 0 },
  weightlessContents: false,
});

export const CLASS_STARTING_EQUIPMENT_CATALOG = Object.freeze({
  'leather-armor': armor('leather-armor', 'Leather Armor', 10, { gp: 10, sp: 0, cp: 0 }, 'light', 11),
  dagger: weapon('dagger', 'Dagger', '1d4', 'piercing', 1, { gp: 2, sp: 0, cp: 0 }, ['Finesse', 'Light', 'Thrown (Range 20/60)'], 'Nick'),
  'instrument-bagpipes': tool('bagpipes', 'Musical Instrument: Bagpipes', 6, { gp: 30, sp: 0, cp: 0 }),
  'instrument-drum': tool('drum', 'Musical Instrument: Drum', 3, { gp: 6, sp: 0, cp: 0 }),
  'instrument-dulcimer': tool('dulcimer', 'Musical Instrument: Dulcimer', 10, { gp: 25, sp: 0, cp: 0 }),
  'instrument-flute': tool('flute', 'Musical Instrument: Flute', 1, { gp: 2, sp: 0, cp: 0 }),
  'instrument-horn': tool('horn', 'Musical Instrument: Horn', 2, { gp: 3, sp: 0, cp: 0 }),
  'instrument-lute': tool('lute', 'Musical Instrument: Lute', 2, { gp: 35, sp: 0, cp: 0 }),
  'instrument-lyre': tool('lyre', 'Musical Instrument: Lyre', 2, { gp: 30, sp: 0, cp: 0 }),
  'instrument-pan-flute': tool('pan-flute', 'Musical Instrument: Pan Flute', 2, { gp: 12, sp: 0, cp: 0 }),
  'instrument-shawm': tool('shawm', 'Musical Instrument: Shawm', 1, { gp: 2, sp: 0, cp: 0 }),
  'instrument-viol': tool('viol', 'Musical Instrument: Viol', 1, { gp: 30, sp: 0, cp: 0 }),
  backpack: gear('backpack', 'Backpack', 5, { gp: 2, sp: 0, cp: 0 }),
  bedroll: gear('bedroll', 'Bedroll', 7, { gp: 1, sp: 0, cp: 0 }),
  bell: gear('bell', 'Bell', 0, { gp: 1, sp: 0, cp: 0 }),
  'bullseye-lantern': gear('lantern-bullseye', 'Lantern, Bullseye', 2, { gp: 10, sp: 0, cp: 0 }),
  costume: gear('costume', 'Costume', 4, { gp: 5, sp: 0, cp: 0 }),
  mirror: gear('mirror', 'Mirror', 0.5, { gp: 5, sp: 0, cp: 0 }),
  oil: gear('oil', 'Oil', 1, { gp: 0, sp: 1, cp: 0 }),
  rations: gear('rations', 'Rations', 2, { gp: 0, sp: 5, cp: 0 }),
  rope: gear('rope', 'Rope', 5, { gp: 1, sp: 0, cp: 0 }),
  tinderbox: gear('tinderbox', 'Tinderbox', 1, { gp: 0, sp: 5, cp: 0 }),
  waterskin: gear('waterskin', 'Waterskin', 5, { gp: 0, sp: 2, cp: 0 }),
  arrows: gear('arrows', 'Arrows', 0.05, { gp: 0, sp: 0, cp: 5 }),
  parchment: gear('parchment', 'Parchment', 0, { gp: 0, sp: 0, cp: 1 }),
  crowbar: gear('crowbar', 'Crowbar', 5, { gp: 2, sp: 0, cp: 0 }, 1, "Using a Crowbar gives Advantage on applicable Strength checks."),
  quiver: gear('quiver', 'Quiver', 1, { gp: 1, sp: 0, cp: 0 }),
  shortbow: weapon('shortbow', 'Shortbow', '1d6', 'piercing', 2, { gp: 25, sp: 0, cp: 0 }, ['Ammunition (Range 80/320; Arrow)', 'Two-Handed'], 'Vex', { rangeType: 'ranged', weaponGroup: 'bows', handlingType: 'twoHanded', ammunitionType: 'arrows' }),
  'entertainers-pack': container('entertainers-pack', "Entertainer's Pack", { gp: 40, sp: 0, cp: 0 }),
  'explorers-pack': container('explorers-pack', "Explorer's Pack", { gp: 10, sp: 0, cp: 0 }),
  'dungeoneers-pack': container('dungeoneers-pack', "Dungeoneer's Pack", { gp: 12, sp: 0, cp: 0 }),
  'priests-pack': container('priests-pack', "Priest's Pack", { gp: 33, sp: 0, cp: 0 }),
  'scholars-pack': container('scholars-pack', "Scholar's Pack", { gp: 40, sp: 0, cp: 0 }),
  'burglars-pack': container('burglars-pack', "Burglar's Pack", { gp: 16, sp: 0, cp: 0 }),
  'greataxe': weapon('greataxe', 'Greataxe', '1d12', 'slashing', 7, { gp: 30, sp: 0, cp: 0 }, ['Heavy', 'Two-Handed'], 'Cleave', { weaponType: 'martialM', handlingType: 'twoHanded', weaponGroup: 'axes' }),
  handaxe: weapon('handaxe', 'Handaxe', '1d6', 'slashing', 2, { gp: 5, sp: 0, cp: 0 }, ['Light', 'Thrown (Range 20/60)'], 'Vex', { handlingType: 'oneHanded', weaponGroup: 'axes' }),
  'chain-shirt': armor('chain-shirt', 'Chain Shirt', 20, { gp: 50, sp: 0, cp: 0 }, 'medium', 13),
  shield: { identifier: 'shield', name: 'Shield', type: 'armor', quantity: 1, weight: 6, price: { gp: 10, sp: 0, cp: 0 }, source: 'SRD 5.2 (CC-BY-4.0)', armorType: 'shield', acValue: 2, dexMax: null, strengthReq: 0, stealthDisadvantage: false, isMetal: true, equipped: false, primarySlot: 'shield' },
  mace: weapon('mace', 'Mace', '1d6', 'bludgeoning', 4, { gp: 5, sp: 0, cp: 0 }, [], 'Sap'),
  spear: weapon('spear', 'Spear', '1d6', 'piercing', 3, { gp: 1, sp: 0, cp: 0 }, ['Thrown (Range 20/60)', 'Versatile (1d8)'], 'Sap', { weaponGroup: 'spears', handlingType: 'versatile' }),
  sickle: weapon('sickle', 'Sickle', '1d4', 'slashing', 2, { gp: 1, sp: 0, cp: 0 }, ['Light'], 'Nick'),
  'chain-mail': armor('chain-mail', 'Chain Mail', 55, { gp: 75, sp: 0, cp: 0 }, 'heavy', 16, true),
  greatsword: weapon('greatsword', 'Greatsword', '2d6', 'slashing', 6, { gp: 50, sp: 0, cp: 0 }, ['Heavy', 'Two-Handed'], 'Graze', { weaponType: 'martialM', handlingType: 'twoHanded', weaponGroup: 'swords' }),
  flail: weapon('flail', 'Flail', '1d8', 'bludgeoning', 2, { gp: 10, sp: 0, cp: 0 }, [], 'Sap', { weaponType: 'martialM' }),
  javelin: weapon('javelin', 'Javelin', '1d6', 'piercing', 2, { gp: 0, sp: 5, cp: 0 }, ['Thrown (Range 30/120)'], 'Slow'),
  'studded-leather': armor('studded-leather', 'Studded Leather Armor', 13, { gp: 45, sp: 0, cp: 0 }, 'light', 12),
  scimitar: weapon('scimitar', 'Scimitar', '1d6', 'slashing', 3, { gp: 25, sp: 0, cp: 0 }, ['Finesse', 'Light'], 'Nick', { weaponType: 'martialM', weaponGroup: 'swords' }),
  shortsword: weapon('shortsword', 'Shortsword', '1d6', 'piercing', 2, { gp: 10, sp: 0, cp: 0 }, ['Finesse', 'Light'], 'Vex', { weaponType: 'martialM', weaponGroup: 'swords' }),
  longbow: weapon('longbow', 'Longbow', '1d8', 'piercing', 2, { gp: 50, sp: 0, cp: 0 }, ['Ammunition (Range 150/600; Arrow)', 'Heavy', 'Two-Handed'], 'Slow', { weaponType: 'martialR', rangeType: 'ranged', weaponGroup: 'bows', handlingType: 'twoHanded', ammunitionType: 'arrows' }),
  longsword: weapon('longsword', 'Longsword', '1d8', 'slashing', 3, { gp: 15, sp: 0, cp: 0 }, ['Versatile (1d10)'], 'Sap', { weaponType: 'martialM', handlingType: 'versatile', weaponGroup: 'swords' }),
  'crossbow-light': weapon('crossbow-light', 'Crossbow, Light', '1d8', 'piercing', 5, { gp: 25, sp: 0, cp: 0 }, ['Ammunition (Range 80/320; Bolt)', 'Loading', 'Two-Handed'], 'Slow', { rangeType: 'ranged', weaponGroup: 'crossbows', handlingType: 'twoHanded', ammunitionType: 'bolts' }),
  'bolts': gear('crossbow-bolts', 'Bolts', 0.05, { gp: 1, sp: 0, cp: 0 }, 20),
  'ball-bearings': gear('ball-bearings', 'Ball Bearings', 2, { gp: 1, sp: 0, cp: 0 }),
  blanket: gear('blanket', 'Blanket', 3, { gp: 0, sp: 5, cp: 0 }),
  robe: gear('robe', 'Robe', 4, { gp: 1, sp: 0, cp: 0 }),
  caltrops: gear('caltrops', 'Caltrops', 2, { gp: 1, sp: 0, cp: 0 }),
  candle: gear('candle', 'Candle', 0, { gp: 0, sp: 0, cp: 1 }),
  'hooded-lantern': gear('lantern-hooded', 'Lantern, Hooded', 2, { gp: 5, sp: 0, cp: 0 }),
  'fine-clothes': gear('clothes-fine', 'Clothes, Fine', 6, { gp: 15, sp: 0, cp: 0 }),
  'holy-water': gear('holy-water', 'Holy Water', 1, { gp: 25, sp: 0, cp: 0 }),
  lamp: gear('lamp', 'Lamp', 1, { gp: 0, sp: 5, cp: 0 }),
  book: gear('book', 'Book', 5, { gp: 25, sp: 0, cp: 0 }),
  ink: gear('ink', 'Ink', 0, { gp: 10, sp: 0, cp: 0 }),
  'ink-pen': gear('ink-pen', 'Ink Pen', 0, { gp: 0, sp: 0, cp: 2 }),
  paper: gear('paper', 'Paper', 0, { gp: 0, sp: 2, cp: 0 }),
  perfume: gear('perfume', 'Perfume', 0, { gp: 5, sp: 0, cp: 0 }),
  torch: gear('torch', 'Torch', 1, { gp: 0, sp: 0, cp: 1 }),
  'herbalism-kit': tool('herbalism-kit', 'Herbalism Kit', 3, { gp: 5, sp: 0, cp: 0 }, 'kit', 'int'),
  'alchemists-supplies': tool('alchemists-supplies', "Alchemist's Supplies", 8, { gp: 50, sp: 0, cp: 0 }, 'artisan', 'int'),
  'brewers-supplies': tool('brewers-supplies', "Brewer's Supplies", 9, { gp: 20, sp: 0, cp: 0 }, 'artisan', 'int'),
  'calligraphers-supplies': tool('calligraphers-supplies', "Calligrapher's Supplies", 5, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'carpenters-tools': tool('carpenters-tools', "Carpenter's Tools", 6, { gp: 8, sp: 0, cp: 0 }, 'artisan', 'str'),
  'cartographers-tools': tool('cartographers-tools', "Cartographer's Tools", 6, { gp: 15, sp: 0, cp: 0 }, 'artisan', 'wis'),
  'cobblers-tools': tool('cobblers-tools', "Cobbler's Tools", 5, { gp: 5, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'cooks-utensils': tool('cooks-utensils', "Cook's Utensils", 8, { gp: 1, sp: 0, cp: 0 }, 'artisan', 'wis'),
  'glassblowers-tools': tool('glassblowers-tools', "Glassblower's Tools", 5, { gp: 30, sp: 0, cp: 0 }, 'artisan', 'int'),
  'jewelers-tools': tool('jewelers-tools', "Jeweler's Tools", 2, { gp: 25, sp: 0, cp: 0 }, 'artisan', 'int'),
  'leatherworkers-tools': tool('leatherworkers-tools', "Leatherworker's Tools", 5, { gp: 5, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'masons-tools': tool('masons-tools', "Mason's Tools", 8, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'str'),
  'painters-supplies': tool('painters-supplies', "Painter's Supplies", 5, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'wis'),
  'potters-tools': tool('potters-tools', "Potter's Tools", 3, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'int'),
  'smiths-tools': tool('smiths-tools', "Smith's Tools", 8, { gp: 20, sp: 0, cp: 0 }, 'artisan', 'str'),
  'tinkers-tools': tool('tinkers-tools', "Tinker's Tools", 10, { gp: 50, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'weavers-tools': tool('weavers-tools', "Weaver's Tools", 5, { gp: 1, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'woodcarvers-tools': tool('woodcarvers-tools', "Woodcarver's Tools", 5, { gp: 1, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'arcane-focus-crystal': gear('arcane-focus-crystal', 'Arcane Focus (crystal)', 1, { gp: 10, sp: 0, cp: 0 }, 1, 'Arcane focus.'),
  'arcane-focus-orb': gear('arcane-focus-orb', 'Arcane Focus (orb)', 3, { gp: 20, sp: 0, cp: 0 }, 1, 'Arcane focus.'),
  'arcane-focus-quarterstaff': gear('arcane-focus-quarterstaff', 'Arcane Focus (Quarterstaff)', 4, { gp: 5, sp: 0, cp: 0 }, 1, 'Arcane focus.'),
  'druidic-focus-quarterstaff': gear('druidic-focus-quarterstaff', 'Druidic Focus (Quarterstaff)', 4, { gp: 5, sp: 0, cp: 0 }, 1, 'Druidic focus.'),
  'druidic-focus-mistletoe': gear('druidic-focus-mistletoe', 'Druidic Focus (sprig of mistletoe)', 0, { gp: 1, sp: 0, cp: 0 }, 1, 'Druidic focus.'),
  'spellbook': gear('spellbook', 'Spellbook', 3, { gp: 0, sp: 0, cp: 0 }, 1, 'Wizard spellbook; 100 pages.'),
  'book-occult-lore': gear('book-occult-lore', 'Book (occult lore)', 5, { gp: 25, sp: 0, cp: 0 }),
  'holy-symbol-amulet': gear('holy-symbol-amulet', 'Holy Symbol (Amulet)', 1, { gp: 5, sp: 0, cp: 0 }),
  'holy-symbol-emblem': gear('holy-symbol-emblem', 'Holy Symbol (Emblem)', 0, { gp: 5, sp: 0, cp: 0 }),
  'holy-symbol-reliquary': gear('holy-symbol-reliquary', 'Holy Symbol (Reliquary)', 2, { gp: 5, sp: 0, cp: 0 }),
  'thieves-tools': tool('thieves-tools', "Thieves' Tools", 1, { gp: 25, sp: 0, cp: 0 }, 'kit', 'dex'),
  'artisans-alchemist': tool('alchemists-supplies', "Alchemist's Supplies", 8, { gp: 50, sp: 0, cp: 0 }, 'artisan', 'int'),
  'artisans-brewer': tool('brewers-supplies', "Brewer's Supplies", 9, { gp: 20, sp: 0, cp: 0 }, 'artisan', 'int'),
  'artisans-calligrapher': tool('calligraphers-supplies', "Calligrapher's Supplies", 5, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'artisans-carpenter': tool('carpenters-tools', "Carpenter's Tools", 6, { gp: 8, sp: 0, cp: 0 }, 'artisan', 'str'),
  'artisans-cartographer': tool('cartographers-tools', "Cartographer's Tools", 6, { gp: 15, sp: 0, cp: 0 }, 'artisan', 'wis'),
  'artisans-cobbler': tool('cobblers-tools', "Cobbler's Tools", 5, { gp: 5, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'artisans-cook': tool('cooks-utensils', "Cook's Utensils", 8, { gp: 1, sp: 0, cp: 0 }, 'artisan', 'wis'),
  'artisans-glassblower': tool('glassblowers-tools', "Glassblower's Tools", 5, { gp: 30, sp: 0, cp: 0 }, 'artisan', 'int'),
  'artisans-jeweler': tool('jewelers-tools', "Jeweler's Tools", 2, { gp: 25, sp: 0, cp: 0 }, 'artisan', 'int'),
  'artisans-leatherworker': tool('leatherworkers-tools', "Leatherworker's Tools", 5, { gp: 5, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'artisans-mason': tool('masons-tools', "Mason's Tools", 8, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'str'),
  'artisans-painter': tool('painters-supplies', "Painter's Supplies", 5, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'wis'),
  'artisans-potter': tool('potters-tools', "Potter's Tools", 3, { gp: 10, sp: 0, cp: 0 }, 'artisan', 'int'),
  'artisans-smith': tool('smiths-tools', "Smith's Tools", 8, { gp: 20, sp: 0, cp: 0 }, 'artisan', 'str'),
  'artisans-tinker': tool('tinkers-tools', "Tinker's Tools", 10, { gp: 50, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'artisans-weaver': tool('weavers-tools', "Weaver's Tools", 5, { gp: 1, sp: 0, cp: 0 }, 'artisan', 'dex'),
  'artisans-woodcarver': tool('woodcarvers-tools', "Woodcarver's Tools", 5, { gp: 1, sp: 0, cp: 0 }, 'artisan', 'dex'),
});

const INSTRUMENT_IDS = Object.freeze({
  bagpipes: 'instrument-bagpipes', drum: 'instrument-drum', dulcimer: 'instrument-dulcimer',
  flute: 'instrument-flute', horn: 'instrument-horn', lute: 'instrument-lute',
  lyre: 'instrument-lyre', 'pan-flute': 'instrument-pan-flute', shawm: 'instrument-shawm', viol: 'instrument-viol',
});
const ARTISAN_TOOL_IDS = Object.freeze([
  'artisans-alchemist', 'artisans-brewer', 'artisans-calligrapher', 'artisans-carpenter', 'artisans-cartographer',
  'artisans-cobbler', 'artisans-cook', 'artisans-glassblower', 'artisans-jeweler', 'artisans-leatherworker',
  'artisans-mason', 'artisans-painter', 'artisans-potter', 'artisans-smith', 'artisans-tinker', 'artisans-weaver', 'artisans-woodcarver',
]);
const PACKS = Object.freeze({
  'entertainers-pack': { cost: 40, contents: [['backpack', 1], ['bedroll', 1], ['bell', 1], ['bullseye-lantern', 1], ['costume', 3], ['mirror', 1], ['oil', 8], ['rations', 9], ['tinderbox', 1], ['waterskin', 1]] },
  'explorers-pack': { cost: 10, contents: [['backpack', 1], ['bedroll', 1], ['oil', 2], ['rations', 10], ['rope', 1], ['tinderbox', 1], ['torch', 10], ['waterskin', 1]] },
  'dungeoneers-pack': { cost: 12, contents: [['backpack', 1], ['caltrops', 1], ['crowbar', 1], ['oil', 2], ['rations', 10], ['rope', 1], ['tinderbox', 1], ['torch', 10], ['waterskin', 1]] },
  'priests-pack': { cost: 33, contents: [['backpack', 1], ['blanket', 1], ['holy-water', 1], ['lamp', 1], ['rations', 7], ['robe', 1], ['tinderbox', 1]] },
  'scholars-pack': { cost: 40, contents: [['backpack', 1], ['book', 1], ['ink', 1], ['ink-pen', 1], ['lamp', 1], ['oil', 10], ['parchment', 10], ['tinderbox', 1]] },
  'burglars-pack': { cost: 16, contents: [['backpack', 1], ['ball-bearings', 1], ['bell', 1], ['candle', 10], ['crowbar', 1], ['hooded-lantern', 1], ['oil', 7], ['rations', 5], ['rope', 1], ['tinderbox', 1], ['waterskin', 1]] },
});

const CLASS_PACKAGES = Object.freeze({
  barbarian: { A: { gp: 15, entries: [['greataxe', 1], ['handaxe', 4], ['@explorers-pack', 1]] }, B: { gp: 75, entries: [] } },
  bard: { A: { gp: 19, entries: [['leather-armor', 1], ['dagger', 2], ['@instrument', 1], ['@entertainers-pack', 1]] }, B: { gp: 90, entries: [] } },
  cleric: { A: { gp: 7, entries: [['chain-shirt', 1], ['shield', 1], ['mace', 1], ['@holy-symbol', 1], ['@priests-pack', 1]] }, B: { gp: 110, entries: [] } },
  druid: { A: { gp: 9, entries: [['leather-armor', 1], ['shield', 1], ['sickle', 1], ['druidic-focus-quarterstaff', 1], ['@explorers-pack', 1], ['herbalism-kit', 1]] }, B: { gp: 50, entries: [] } },
  fighter: {
    A: { gp: 4, entries: [['chain-mail', 1], ['greatsword', 1], ['flail', 1], ['javelin', 8], ['@dungeoneers-pack', 1]] },
    B: { gp: 11, entries: [['studded-leather', 1], ['scimitar', 1], ['shortsword', 1], ['longbow', 1], ['arrows', 20], ['quiver', 1], ['@dungeoneers-pack', 1]] },
    C: { gp: 155, entries: [] },
  },
  monk: { A: { gp: 11, entries: [['spear', 1], ['dagger', 5], ['@monk-tool', 1], ['@explorers-pack', 1]] }, B: { gp: 50, entries: [] } },
  paladin: { A: { gp: 9, entries: [['chain-mail', 1], ['shield', 1], ['longsword', 1], ['javelin', 6], ['@holy-symbol', 1], ['@priests-pack', 1]] }, B: { gp: 150, entries: [] } },
  ranger: { A: { gp: 7, entries: [['studded-leather', 1], ['scimitar', 1], ['shortsword', 1], ['longbow', 1], ['arrows', 20], ['quiver', 1], ['druidic-focus-mistletoe', 1], ['@explorers-pack', 1]] }, B: { gp: 150, entries: [] } },
  rogue: { A: { gp: 8, entries: [['leather-armor', 1], ['dagger', 2], ['shortsword', 1], ['shortbow', 1], ['arrows', 20], ['quiver', 1], ['thieves-tools', 1], ['@burglars-pack', 1]] }, B: { gp: 100, entries: [] } },
  sorcerer: { A: { gp: 28, entries: [['spear', 1], ['dagger', 2], ['arcane-focus-crystal', 1], ['@dungeoneers-pack', 1]] }, B: { gp: 50, entries: [] } },
  warlock: { A: { gp: 15, entries: [['leather-armor', 1], ['sickle', 1], ['dagger', 2], ['arcane-focus-orb', 1], ['book-occult-lore', 1], ['@scholars-pack', 1]] }, B: { gp: 100, entries: [] } },
  wizard: { A: { gp: 5, entries: [['dagger', 2], ['arcane-focus-quarterstaff', 1], ['robe', 1], ['spellbook', 1], ['@scholars-pack', 1]] }, B: { gp: 55, entries: [] } },
});

const HOLY_SYMBOL_IDS = Object.freeze({ amulet: 'holy-symbol-amulet', emblem: 'holy-symbol-emblem', reliquary: 'holy-symbol-reliquary' });

export function classStartingEquipmentPackageOptions(classIdentifier) {
  return Object.keys(CLASS_PACKAGES[classIdentifier] || {});
}

export function classStartingInstrumentOptions() {
  return Object.keys(INSTRUMENT_IDS);
}

export function classStartingEquipmentChoices(classIdentifier) {
  if (classIdentifier === 'bard') return [{ field: 'instrument', label: 'MusicalInstrumentChoice', options: Object.keys(INSTRUMENT_IDS).map((value) => [value, `MusicalInstrument.${value}`]) }];
  if (classIdentifier === 'monk') return [{ field: 'tool', label: 'ClassEquipmentToolChoice', options: [...ARTISAN_TOOL_IDS.map((value) => [value, `ClassEquipmentTool.${value}`]), ...Object.keys(INSTRUMENT_IDS).map((value) => [`instrument:${value}`, `MusicalInstrument.${value}`])] }];
  if (['cleric', 'paladin'].includes(classIdentifier)) return [{ field: 'holySymbol', label: 'HolySymbolForm', options: Object.keys(HOLY_SYMBOL_IDS).map((value) => [value, `HolySymbol.${value}`]) }];
  return [];
}

/** Resolve any SRD 5.2 class package into items, nested pack contents, and GP. */
export function resolveClassStartingEquipment(classIdentifier, selection = {}) {
  const bundles = CLASS_PACKAGES[classIdentifier];
  const bundle = bundles?.[selection.package];
  if (!bundle) {
    return { valid: false, errors: ['invalid-class-equipment-package'], gp: 0, items: [] };
  }
  const items = [];
  const toolProficiencies = [];
  for (const [rawId, quantity] of bundle.entries) {
    let id = rawId;
    if (id === '@instrument') id = INSTRUMENT_IDS[selection.instrument];
    else if (id === '@holy-symbol') id = HOLY_SYMBOL_IDS[selection.holySymbol];
    else if (id === '@monk-tool') {
      id = selection.tool?.startsWith('instrument:') ? INSTRUMENT_IDS[selection.tool.slice('instrument:'.length)] : selection.tool;
    } else if (id.startsWith('@')) id = id.slice(1);
    if (!id) return { valid: false, errors: ['required-equipment-choice-missing'], gp: 0, items: [] };
    const record = CLASS_STARTING_EQUIPMENT_CATALOG[id];
    if (!record) return { valid: false, errors: [`equipment-catalog-entry-missing:${id}`], gp: 0, items: [] };
    if (rawId === '@monk-tool') toolProficiencies.push(record.name);
    if (PACKS[id]) {
      const packOperationKey = `${classIdentifier}-${id}`;
      items.push({ key: packOperationKey, name: record.name, type: 'container', data: { ...record, price: { ...record.price }, quantity } });
      for (const [contentId, contentQuantity] of PACKS[id].contents) {
        const content = CLASS_STARTING_EQUIPMENT_CATALOG[contentId];
        if (!content) return { valid: false, errors: [`equipment-catalog-entry-missing:${contentId}`], gp: 0, items: [] };
        items.push({
          containerOperationKey: packOperationKey, name: content.name, type: content.type,
          data: { ...content, price: { ...content.price }, quantity: contentQuantity },
        });
      }
    } else {
      items.push({ name: record.name, type: record.type, data: { ...record, price: { ...record.price }, quantity } });
    }
  }
  return { valid: true, errors: [], gp: bundle.gp, items, toolProficiencies };
}
