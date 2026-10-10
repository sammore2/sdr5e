import { CLASS_STARTING_EQUIPMENT_CATALOG, classStartingEquipmentChoices } from './class-equipment.mjs';
import { SKILL_LABELS } from './config.mjs';

const SIMPLE_WEAPONS = Object.freeze(['simpleM', 'simpleR']);
const MARTIAL_WEAPONS = Object.freeze(['martialM', 'martialR']);
const ALL_WEAPONS = Object.freeze([...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS]);
const ALL_SKILLS = Object.freeze(Object.keys(SKILL_LABELS));

/** SRD 5.2 grants for a character's first level in an additional class. */
export const MULTICLASS_PROFICIENCIES = Object.freeze({
  barbarian: { skillCount: 0, skills: [], weapons: MARTIAL_WEAPONS, armor: ['shield'], tools: [], toolChoiceCount: 0 },
  bard: { skillCount: 1, skills: null, weapons: [], armor: ['light'], tools: [], toolChoiceCount: 1, toolChoiceKind: 'instrument' },
  cleric: { skillCount: 0, skills: [], weapons: [], armor: ['light', 'medium', 'shield'], tools: [], toolChoiceCount: 0 },
  druid: { skillCount: 0, skills: [], weapons: [], armor: ['light', 'shield'], tools: [], toolChoiceCount: 0 },
  fighter: { skillCount: 0, skills: [], weapons: MARTIAL_WEAPONS, armor: ['light', 'medium', 'shield'], tools: [], toolChoiceCount: 0 },
  monk: { skillCount: 0, skills: [], weapons: [], armor: [], tools: [], toolChoiceCount: 0 },
  paladin: { skillCount: 0, skills: [], weapons: MARTIAL_WEAPONS, armor: ['light', 'medium', 'shield'], tools: [], toolChoiceCount: 0 },
  ranger: { skillCount: 1, skills: null, weapons: MARTIAL_WEAPONS, armor: ['light', 'medium', 'shield'], tools: [], toolChoiceCount: 0 },
  rogue: { skillCount: 1, skills: null, weapons: [], armor: ['light'], tools: ["Thieves' Tools"], toolChoiceCount: 0 },
  sorcerer: { skillCount: 0, skills: [], weapons: [], armor: [], tools: [], toolChoiceCount: 0 },
  warlock: { skillCount: 0, skills: [], weapons: [], armor: ['light'], tools: [], toolChoiceCount: 0 },
  wizard: { skillCount: 0, skills: [], weapons: [], armor: [], tools: [], toolChoiceCount: 0 },
});

/** SRD 5.2 Core Class Traits, checked against the local classes.md tables. */
export const CLASS_PROFICIENCIES = Object.freeze({
  barbarian: { saves: ['str', 'con'], skillCount: 2, skills: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'], weapons: ALL_WEAPONS, armor: ['light', 'medium', 'shield'], tools: [], toolChoiceCount: 0 },
  bard: { saves: ['dex', 'cha'], skillCount: 3, skills: ALL_SKILLS, weapons: SIMPLE_WEAPONS, armor: ['light'], tools: [], toolChoiceCount: 3, toolChoiceKind: 'instrument' },
  cleric: { saves: ['wis', 'cha'], skillCount: 2, skills: ['history', 'insight', 'medicine', 'persuasion', 'religion'], weapons: SIMPLE_WEAPONS, armor: ['light', 'medium', 'shield'], tools: [], toolChoiceCount: 0 },
  druid: { saves: ['int', 'wis'], skillCount: 2, skills: ['animalHandling', 'arcana', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'], weapons: SIMPLE_WEAPONS, armor: ['light', 'shield'], tools: ['Herbalism Kit'], toolChoiceCount: 0 },
  fighter: { saves: ['str', 'con'], skillCount: 2, skills: ['acrobatics', 'animalHandling', 'athletics', 'history', 'insight', 'intimidation', 'persuasion', 'perception', 'survival'], weapons: ALL_WEAPONS, armor: ['light', 'medium', 'heavy', 'shield'], tools: [], toolChoiceCount: 0 },
  monk: { saves: ['str', 'dex'], skillCount: 2, skills: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'], weapons: [...SIMPLE_WEAPONS, 'martial:light'], armor: [], tools: [], toolChoiceCount: 1, toolChoiceKind: 'artisan-or-instrument' },
  paladin: { saves: ['wis', 'cha'], skillCount: 2, skills: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'], weapons: ALL_WEAPONS, armor: ['light', 'medium', 'heavy', 'shield'], tools: [], toolChoiceCount: 0 },
  ranger: { saves: ['str', 'dex'], skillCount: 3, skills: ['animalHandling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'], weapons: ALL_WEAPONS, armor: ['light', 'medium', 'shield'], tools: [], toolChoiceCount: 0 },
  rogue: { saves: ['dex', 'int'], skillCount: 4, skills: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'persuasion', 'sleightOfHand', 'stealth'], weapons: [...SIMPLE_WEAPONS, 'martial:finesse-or-light'], armor: ['light'], tools: ["Thieves' Tools"], toolChoiceCount: 0 },
  sorcerer: { saves: ['con', 'cha'], skillCount: 2, skills: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'], weapons: SIMPLE_WEAPONS, armor: [], tools: [], toolChoiceCount: 0 },
  warlock: { saves: ['wis', 'cha'], skillCount: 2, skills: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'], weapons: SIMPLE_WEAPONS, armor: ['light'], tools: [], toolChoiceCount: 0 },
  wizard: { saves: ['int', 'wis'], skillCount: 2, skills: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'], weapons: SIMPLE_WEAPONS, armor: [], tools: [], toolChoiceCount: 0 },
});

function proficiencyChoiceOptions(classIdentifier) {
  const choice = classStartingEquipmentChoices(classIdentifier)[0];
  if (!choice) return [];
  return choice.options.map(([value, label]) => {
    const catalogKey = classIdentifier === 'bard'
      ? `instrument-${value}`
      : value.startsWith('instrument:')
      ? `instrument-${value.slice('instrument:'.length)}`
        : value;
    const proficiency = CLASS_STARTING_EQUIPMENT_CATALOG[catalogKey]?.name;
    return { value, label, proficiency };
  }).filter((option) => option.proficiency);
}

/** Resolve only the proficiencies granted when entering a class via multiclassing. */
export function multiclassProficiencyChoiceContext(classIdentifier, selection = {}, {
  alreadyProficientSkills = [], alreadyProficientTools = [],
} = {}) {
  const contract = MULTICLASS_PROFICIENCIES[classIdentifier];
  if (!contract) return { valid: false, missing: false, errors: ['unsupported-class'], skills: [], tools: [], armor: [], weapons: [], skillOptions: [], toolOptions: [], skillCount: 0, toolChoiceCount: 0 };
  const classContract = CLASS_PROFICIENCIES[classIdentifier];
  const baseSkillOptions = contract.skills ?? classContract?.skills ?? [];
  const excludedSkills = new Set(alreadyProficientSkills);
  const excludedTools = new Set(alreadyProficientTools);
  const skillOptions = baseSkillOptions.filter((key) => !excludedSkills.has(key));
  const toolOptions = contract.toolChoiceKind === 'instrument'
    ? proficiencyChoiceOptions(classIdentifier).filter(({ proficiency }) => !excludedTools.has(proficiency))
    : [];
  const selectedSkills = Array.isArray(selection.skills) ? selection.skills : [];
  const selectedToolValues = Array.isArray(selection.tools) ? selection.tools : [];
  const selectedTools = selectedToolValues.map((value) => toolOptions.find((option) => option.value === value)?.proficiency).filter(Boolean);
  const valid = selectedSkills.length === contract.skillCount
    && new Set(selectedSkills).size === contract.skillCount
    && selectedSkills.every((key) => skillOptions.includes(key))
    && selectedToolValues.length === contract.toolChoiceCount
    && new Set(selectedToolValues).size === contract.toolChoiceCount
    && selectedToolValues.every((value) => toolOptions.some((option) => option.value === value));
  return {
    valid,
    missing: selectedSkills.length < contract.skillCount || selectedToolValues.length < contract.toolChoiceCount,
    errors: valid || selectedSkills.length < contract.skillCount || selectedToolValues.length < contract.toolChoiceCount
      ? [] : ['invalid-multiclass-proficiency-choices'],
    skills: [...selectedSkills],
    tools: [...new Set([...contract.tools, ...selectedTools])],
    armor: [...contract.armor],
    weapons: [...contract.weapons],
    skillOptions,
    toolOptions,
    skillCount: contract.skillCount,
    toolChoiceCount: contract.toolChoiceCount,
  };
}

export function classProficiencyChoiceContext(classIdentifier, selection = {}, alreadyProficientSkills = [], alreadyProficientTools = []) {
  const contract = CLASS_PROFICIENCIES[classIdentifier];
  if (!contract) return { valid: false, errors: ['unsupported-class'], skills: [], tools: [], skillOptions: [], toolOptions: [], skillCount: 0, toolChoiceCount: 0 };
  const excludedSkills = new Set(alreadyProficientSkills);
  const excludedTools = new Set(alreadyProficientTools);
  const skillOptions = contract.skills.filter((key) => !excludedSkills.has(key));
  const toolOptions = proficiencyChoiceOptions(classIdentifier).filter(({ proficiency }) => !excludedTools.has(proficiency));
  const selectedSkills = Array.isArray(selection.skills) ? selection.skills : [];
  const selectedToolValues = Array.isArray(selection.tools) ? selection.tools : [];
  const selectedTools = selectedToolValues.map((value) => toolOptions.find((option) => option.value === value)?.proficiency).filter(Boolean);
  const valid = selectedSkills.length === contract.skillCount
    && new Set(selectedSkills).size === contract.skillCount
    && selectedSkills.every((key) => skillOptions.includes(key))
    && selectedToolValues.length === contract.toolChoiceCount
    && new Set(selectedToolValues).size === contract.toolChoiceCount
    && selectedToolValues.every((value) => toolOptions.some((option) => option.value === value));
  return {
    valid,
    errors: valid ? [] : ['invalid-class-proficiency-choices'],
    saves: [...contract.saves],
    skills: [...selectedSkills],
    tools: [...new Set([...contract.tools, ...selectedTools])],
    skillOptions,
    toolOptions,
    skillCount: contract.skillCount,
    toolChoiceCount: contract.toolChoiceCount,
    weapons: [...contract.weapons],
    armor: [...contract.armor],
  };
}

export function weaponProficiencyMatches(proficiency, itemData = {}, itemName = '') {
  const entry = String(proficiency || '').toLocaleLowerCase();
  const category = String(itemData.weaponType || '').toLocaleLowerCase();
  const properties = (itemData.properties || []).map((property) => String(property).toLocaleLowerCase());
  if (entry === 'martial:light') return category.startsWith('martial') && properties.includes('light');
  if (entry === 'martial:finesse-or-light') return category.startsWith('martial')
    && (properties.includes('finesse') || properties.includes('light'));
  return entry === category || entry === String(itemName).toLocaleLowerCase();
}
