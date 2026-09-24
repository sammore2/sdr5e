// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/sheet-schemas.mjs
// Component Version: 0.1.0
//
// Generic engine sheet schema (getSheetSchema/getItemSheetSchema) — not the
// .hbs/custom-class sheet. The core already resolves save (`name="sd:key"`),
// roll (`rollable` + `formula`, via resolveFormula with @path against
// systemData) and widgets (dots/select/etc). See client/components/sheet-schema.ts.
// HARD RULE: never point a field `key` at a DERIVED value (.modifier/.total/
// computed .value) — that becomes an editable `<input name="sd:key">` and
// submitting it would overwrite the derived value, freezing the recalculation.
// `key` always targets a real BASE field; `formula` (roll-only, never saved)
// can reference any derived path via @.
// ══════════════════════════════════════════════════════════════════════════

import { ABILITY_KEYS, ABILITY_LABELS, SKILL_ABILITIES, WEAPON_CATEGORY_CODES, WEAPON_CATEGORY_LABELS, SIZE_LABELS, CLASS_IDENTIFIER_LABELS, DAMAGE_TYPES } from './config.mjs';

export function characterSheetSchema() {
  return {
    tabs: [
      {
        id: 'abilities', label: 'Abilities',
        fields: ABILITY_KEYS.map((k) => ({
          key: `abilities.${k}.value`, label: ABILITY_LABELS[k], type: 'number',
          rollable: true, formula: `1d20 + @abilities.${k}.modifier`,
        })),
      },
      {
        id: 'saves', label: 'Saves',
        fields: ABILITY_KEYS.flatMap((k) => [
          { key: `saves.${k}.proficient`, label: `${ABILITY_LABELS[k]} Save (proficient)`, type: 'boolean' },
          { key: `saves.${k}.misc`, label: `${ABILITY_LABELS[k]} Save`, type: 'number', rollable: true, formula: `1d20 + @saves.${k}.total` },
        ]),
      },
      {
        id: 'skills', label: 'Skills',
        fields: Object.keys(SKILL_ABILITIES).flatMap((k) => [
          { key: `skills.${k}.proficient`, label: `${k} (proficient)`, type: 'boolean' },
          { key: `skills.${k}.bonus`, label: k, type: 'number', rollable: true, formula: `1d20 + @skills.${k}.total` },
        ]),
      },
      {
        id: 'resources', label: 'Resources',
        fields: [
          { key: 'resources.health.value', label: 'HP', type: 'number' },
          { key: 'resources.health.max', label: 'HP Max', type: 'number' },
          { key: 'attributes.da.base', label: 'Defense (base)', type: 'number' },
          { key: 'attributes.initiative.value', label: 'Initiative (misc)', type: 'number', rollable: true, formula: '1d20 + @attributes.initiative.total' },
        ],
      },
      {
        id: 'details', label: 'Details',
        fields: [
          { key: 'details.level', label: 'Level', type: 'number' },
          { key: 'details.background', label: 'Background', type: 'text' },
          { key: 'details.biography', label: 'Biography', type: 'textarea' },
        ],
      },
    ],
  };
}

export function npcSheetSchema() {
  return {
    tabs: [
      {
        id: 'abilities', label: 'Abilities',
        fields: ABILITY_KEYS.map((k) => ({
          key: `abilities.${k}.value`, label: ABILITY_LABELS[k], type: 'number',
          rollable: true, formula: `1d20 + @abilities.${k}.modifier`,
        })),
      },
      {
        id: 'resources', label: 'Resources',
        fields: [
          { key: 'resources.health.value', label: 'HP', type: 'number' },
          { key: 'resources.health.max', label: 'HP Max', type: 'number' },
          { key: 'details.cr', label: 'Challenge Rating', type: 'number' },
        ],
      },
      {
        id: 'details', label: 'Details',
        fields: [
          { key: 'details.alignment', label: 'Alignment', type: 'text' },
          { key: 'details.size', label: 'Size', type: 'text' },
          { key: 'details.biography', label: 'Biography', type: 'textarea' },
        ],
      },
    ],
  };
}

export const ITEM_SHEET_SCHEMAS = {
  weapon: { tabs: [{ id: 'main', label: 'Weapon', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'weaponType', label: 'Weapon Type', type: 'select', options: WEAPON_CATEGORY_CODES.map((c) => ({ value: c, label: WEAPON_CATEGORY_LABELS[c] })) },
    { key: 'damage.formula', label: 'Damage Formula', type: 'text' },
    { key: 'damage.type', label: 'Damage Type', type: 'text' },
    { key: 'attackBonus', label: 'Attack Bonus', type: 'number' },
    { key: 'equipped', label: 'Equipped', type: 'boolean' },
    { key: 'weight', label: 'Weight', type: 'number' },
  ] }] },
  armor: { tabs: [{ id: 'main', label: 'Armor', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    // Free text broke the same way race.size did: prepArmorAndDA compares
    // this against exact codes (light/medium/heavy/shield) to pick the DA
    // formula and which category wins when multiple armor pieces are
    // equipped — a typo/case mismatch silently excluded the piece from AC.
    { key: 'armorType', label: 'Armor Type', type: 'select', options: [
      { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' },
      { value: 'heavy', label: 'Heavy' }, { value: 'shield', label: 'Shield' },
    ] },
    { key: 'acValue', label: 'AC Value', type: 'number' },
    { key: 'equipped', label: 'Equipped', type: 'boolean' },
    { key: 'weight', label: 'Weight', type: 'number' },
  ] }] },
  feature: { tabs: [{ id: 'main', label: 'Feature', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'source', label: 'Source (groups the Features tab, e.g. "Wizard")', type: 'text' },
    { key: 'featureType', label: 'Feature Type', type: 'text' },
    { key: 'tier', label: 'Tier', type: 'number' },
    { key: 'uses.value', label: 'Uses (current)', type: 'number' },
    { key: 'uses.max', label: 'Uses (max)', type: 'text' },
    { key: 'uses.recovery', label: 'Recovery', type: 'select', options: [
      { value: 'none', label: 'None' }, { value: 'sr', label: 'Short Rest' }, { value: 'lr', label: 'Long Rest' },
    ] },
    { key: 'uses.recharge', label: 'Recharge (0 = none, e.g. 5 = "Recharge 5-6")', type: 'number' },
    { key: 'resourceCost', label: 'Class Resource Cost (0 = free)', type: 'number' },
  ] }] },
  item: { tabs: [{ id: 'main', label: 'Item', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'weight', label: 'Weight', type: 'number' },
    { key: 'price.gp', label: 'Price (gp)', type: 'number' },
    { key: 'uses.value', label: 'Uses (current)', type: 'number' },
    { key: 'uses.max', label: 'Uses (max, 0 = unlimited)', type: 'number' },
    { key: 'uses.recovery', label: 'Recovery', type: 'select', options: [
      { value: 'none', label: 'None' }, { value: 'sr', label: 'Short Rest' }, { value: 'lr', label: 'Long Rest' },
    ] },
    { key: 'uses.recharge', label: 'Recharge (0 = none, e.g. 5 = "Recharge 5-6")', type: 'number' },
  ] }] },
  language: { tabs: [{ id: 'main', label: 'Language', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'script', label: 'Script', type: 'text' },
  ] }] },
  consumable: { tabs: [{ id: 'main', label: 'Consumable', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'consumableType', label: 'Consumable Type', type: 'select', options: [
      { value: 'potion', label: 'Potion' }, { value: 'scroll', label: 'Scroll' }, { value: 'ammo', label: 'Ammunition' },
      { value: 'poison', label: 'Poison' }, { value: 'food', label: 'Food' }, { value: 'other', label: 'Other' },
    ] },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'weight', label: 'Weight', type: 'number' },
    { key: 'rarity', label: 'Rarity', type: 'text' },
    { key: 'uses.value', label: 'Uses (current)', type: 'number' },
    { key: 'uses.max', label: 'Uses (max)', type: 'number' },
    { key: 'destroyOnEmpty', label: 'Destroy when empty', type: 'boolean' },
    { key: 'healing.formula', label: 'Healing Formula', type: 'text' },
    { key: 'damage.formula', label: 'Damage Formula', type: 'text' },
    { key: 'damage.type', label: 'Damage Type', type: 'select', options: DAMAGE_TYPES.map((t) => ({ value: t, label: t })) },
    { key: 'spell.name', label: 'Spell Name (for scrolls)', type: 'text' },
    { key: 'spell.level', label: 'Spell Level', type: 'number' },
  ] }] },
  tool: { tabs: [{ id: 'main', label: 'Tool', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'toolType', label: 'Tool Type', type: 'select', options: [
      { value: 'artisan', label: 'Artisan' }, { value: 'gaming', label: 'Gaming' }, { value: 'musical', label: 'Musical' }, { value: 'kit', label: 'Kit' }, { value: 'other', label: 'Other' },
    ] },
    { key: 'ability', label: 'Ability', type: 'select', options: ABILITY_KEYS.map((k) => ({ value: k, label: ABILITY_LABELS[k] })) },
    { key: 'bonus', label: 'Bonus', type: 'number' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'weight', label: 'Weight', type: 'number' },
    { key: 'price.gp', label: 'Price (gp)', type: 'number' },
  ] }] },
  loot: { tabs: [{ id: 'main', label: 'Loot', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'lootType', label: 'Loot Type', type: 'select', options: [
      { value: 'gem', label: 'Gem' }, { value: 'art', label: 'Art' }, { value: 'tradegood', label: 'Trade Good' }, { value: 'junk', label: 'Junk' }, { value: 'other', label: 'Other' },
    ] },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'weight', label: 'Weight', type: 'number' },
    { key: 'price.gp', label: 'Price (gp)', type: 'number' },
    { key: 'price.sp', label: 'Price (sp)', type: 'number' },
    { key: 'price.cp', label: 'Price (cp)', type: 'number' },
    { key: 'rarity', label: 'Rarity', type: 'text' },
  ] }] },
  container: { tabs: [{ id: 'main', label: 'Container', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'capacity.type', label: 'Capacity Type', type: 'select', options: [{ value: 'weight', label: 'Weight' }, { value: 'items', label: 'Items' }] },
    { key: 'capacity.value', label: 'Capacity Value (0 = unlimited)', type: 'number' },
    { key: 'weightlessContents', label: 'Extradimensional (contents weightless)', type: 'boolean' },
    { key: 'weight', label: 'Weight', type: 'number' },
    { key: 'price.gp', label: 'Price (gp)', type: 'number' },
    { key: 'rarity', label: 'Rarity', type: 'text' },
  ] }] },
  race: { tabs: [{ id: 'main', label: 'Race', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'creatureType', label: 'Creature Type', type: 'text' },
    // Free text here used to silently break carrying-capacity math: the
    // actor sheet looks up SIZE_CARRY_MULTIPLIER by exact code (tiny/sm/
    // med/lg/huge/garg), so typing "Medium" fell back to a 1x multiplier
    // with no error. Locking it to the same codes fixes that at the source.
    { key: 'size', label: 'Size', type: 'select', options: Object.keys(SIZE_LABELS).map((v) => ({ value: v, label: SIZE_LABELS[v] })) },
    { key: 'movement.walk', label: 'Walk Speed (m)', type: 'number' },
    { key: 'movement.fly', label: 'Fly Speed (m)', type: 'number' },
    { key: 'movement.swim', label: 'Swim Speed (m)', type: 'number' },
    { key: 'movement.climb', label: 'Climb Speed (m)', type: 'number' },
    { key: 'movement.burrow', label: 'Burrow Speed (m)', type: 'number' },
    { key: 'movement.hover', label: 'Hover', type: 'boolean' },
    { key: 'senses.darkvision', label: 'Darkvision (m)', type: 'number' },
  ] }] },
  class: { tabs: [{ id: 'main', label: 'Class', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'hitDie', label: 'Hit Die', type: 'text' },
    { key: 'levels', label: 'Levels', type: 'number' },
    { key: 'subclassName', label: 'Subclass', type: 'text' },
    { key: 'casterType', label: 'Caster Type', type: 'select', options: [
      { value: 'none', label: 'Not a caster' },
      { value: 'full', label: 'Full caster (Bard/Cleric/Druid/Sorcerer/Wizard)' },
      { value: 'half', label: 'Half caster (Paladin/Ranger)' },
      { value: 'pact', label: 'Pact Magic (Warlock) — not auto-calculated yet' },
    ] },
    { key: 'knownCasterType', label: 'Known Spells Table', type: 'select', options: [
      { value: 'none', label: 'N/A — prepares spells instead' },
      { value: 'bard', label: 'Bard' },
      { value: 'sorcerer', label: 'Sorcerer' },
      { value: 'warlock', label: 'Warlock' },
      { value: 'ranger', label: 'Ranger' },
    ] },
    { key: 'classIdentifier', label: 'SRD Class (for multiclass prerequisites)', type: 'select', options: Object.entries(CLASS_IDENTIFIER_LABELS).map(([value, label]) => ({ value, label })) },
  ] }] },
  subclass: { tabs: [{ id: 'main', label: 'Subclass', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'classIdentifier', label: 'Class', type: 'text' },
  ] }] },
  background: { tabs: [{ id: 'main', label: 'Background', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
  ] }] },
  feat: { tabs: [{ id: 'main', label: 'Feat', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'requiresLevel', label: 'Requires Level', type: 'number' },
  ] }] },
  spell: { tabs: [{ id: 'main', label: 'Spell', fields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'spellLevel', label: 'Spell Level', type: 'number' },
    { key: 'school', label: 'School', type: 'text' },
    { key: 'castingTime', label: 'Casting Time', type: 'text' },
    { key: 'range', label: 'Range', type: 'text' },
    { key: 'duration', label: 'Duration', type: 'text' },
    { key: 'concentration', label: 'Concentration', type: 'boolean' },
    { key: 'ritual', label: 'Ritual', type: 'boolean' },
    { key: 'classes', label: 'Classes (comma-separated identifiers, e.g. "wizard, sorcerer")', type: 'csv' },
    { key: 'damage.formula', label: 'Damage Formula', type: 'text' },
    { key: 'damage.type', label: 'Damage Type', type: 'text' },
    { key: 'durationRounds', label: 'Effect Duration (rounds, 0 = none)', type: 'number' },
    { key: 'bonuses.da', label: 'Effect: AC Bonus', type: 'number' },
    { key: 'bonuses.attack.melee', label: 'Effect: Melee Attack Bonus', type: 'number' },
    { key: 'bonuses.attack.ranged', label: 'Effect: Ranged Attack Bonus', type: 'number' },
    { key: 'bonuses.hp', label: 'Effect: HP Bonus', type: 'number' },
  ] }] },
};

export function getSheetSchema() {
  // Both 'character' and 'npc' now use native sheets (Sdr5eCharacterSheet /
  // Sdr5eNpcSheet, registered via sheets.catalog) — npcSheetSchema() is kept
  // above only as inert reference for the fields it used to expose, never
  // returned anymore.
  return null;
}

export function getItemSheetSchema(itemType) {
  return ITEM_SHEET_SCHEMAS[itemType] || { tabs: [{ id: 'main', label: 'Item', fields: [{ key: 'description', label: 'Description', type: 'textarea' }] }] };
}
