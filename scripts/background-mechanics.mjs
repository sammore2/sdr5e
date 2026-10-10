/** Typed, verified SRD 5.2 background fields. Equipment and feat effects remain separate handlers. */
export const BACKGROUND_MECHANICS_BY_IDENTIFIER = Object.freeze({
  acolyte: { version: 1, abilities: ['int', 'wis', 'cha'], skills: ['insight', 'religion'], tools: ["Calligrapher's Supplies"], feat: 'Magic Initiate (Cleric)' },
  criminal: { version: 1, abilities: ['dex', 'con', 'int'], skills: ['sleightOfHand', 'stealth'], tools: ["Thieves' Tools"], feat: 'Alert' },
  sage: { version: 1, abilities: ['con', 'int', 'wis'], skills: ['arcana', 'history'], tools: ["Calligrapher's Supplies"], feat: 'Magic Initiate (Wizard)' },
  soldier: { version: 1, abilities: ['str', 'dex', 'con'], skills: ['athletics', 'intimidation'], tools: [], toolOptions: ['Gaming Set: Dice', 'Gaming Set: Dragonchess', 'Gaming Set: Playing Cards', 'Gaming Set: Three-Dragon Ante'], feat: 'Savage Attacker' },
});

const ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);

export function backgroundMechanicsFor(data) {
  return data?.mechanics || BACKGROUND_MECHANICS_BY_IDENTIFIER[data?.identifier] || null;
}

export function resolveBackgroundChoices(mechanics, selection = {}) {
  if (!mechanics || mechanics.version !== 1 || !Array.isArray(mechanics.abilities)
    || !Array.isArray(mechanics.skills) || !Array.isArray(mechanics.tools)) {
    return { valid: false, errors: ['unsupported-background-data'], bumps: {}, skills: [], tools: [] };
  }
  if (mechanics.abilities.length !== 3 || mechanics.abilities.some((key) => !ABILITIES.has(key))) {
    return { valid: false, errors: ['invalid-background-abilities'], bumps: {}, skills: [], tools: [] };
  }
  const skillSet = new Set(['acrobatics', 'animalHandling', 'arcana', 'athletics', 'performance', 'deception', 'stealth', 'history', 'intimidation', 'insight', 'investigation', 'medicine', 'nature', 'perception', 'persuasion', 'sleightOfHand', 'religion', 'survival']);
  if (mechanics.skills.some((key) => !skillSet.has(key))
    || mechanics.tools.some((tool) => typeof tool !== 'string' || !tool)
    || (mechanics.toolOptions !== undefined && (!Array.isArray(mechanics.toolOptions)
      || !mechanics.toolOptions.length || mechanics.toolOptions.some((tool) => typeof tool !== 'string' || !tool)))) {
    return { valid: false, errors: ['invalid-background-proficiencies'], bumps: {}, skills: [], tools: [] };
  }
  const { first, second, spread = false } = selection;
  const tools = [...mechanics.tools];
  if (mechanics.toolOptions) {
    if (!mechanics.toolOptions.includes(selection.tool)) {
      return { valid: false, errors: ['background-tool-choice-required'], bumps: {}, skills: [...mechanics.skills], tools };
    }
    tools.push(selection.tool);
  }
  if (spread) {
    return { valid: true, errors: [], bumps: Object.fromEntries(mechanics.abilities.map((key) => [key, 1])), skills: [...mechanics.skills], tools };
  }
  if (!mechanics.abilities.includes(first) || !mechanics.abilities.includes(second) || first === second) {
    return { valid: false, errors: ['background-ability-choice-required'], bumps: {}, skills: [...mechanics.skills], tools };
  }
  return { valid: true, errors: [], bumps: { [first]: 2, [second]: 1 }, skills: [...mechanics.skills], tools };
}
