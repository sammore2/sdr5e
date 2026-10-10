/** Typed SRD tool proficiency identifiers used by Skilled. */
export const TOOL_PROFICIENCY_OPTIONS = Object.freeze([
  "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools",
  'Disguise Kit', 'Forgery Kit', 'Gaming Set: Dice', 'Gaming Set: Dragonchess', 'Gaming Set: Playing Cards', 'Gaming Set: Three-Dragon Ante', 'Herbalism Kit', 'Musical Instrument: Bagpipes', 'Musical Instrument: Drum', 'Musical Instrument: Dulcimer', 'Musical Instrument: Flute', 'Musical Instrument: Horn', 'Musical Instrument: Lute', 'Musical Instrument: Lyre', 'Musical Instrument: Pan Flute', 'Musical Instrument: Shawm', 'Musical Instrument: Viol', "Navigator's Tools", "Poisoner's Kit", "Thieves' Tools",
]);

/** Declarative feat records keyed by the stable compendium identifier. */
export const FEAT_MECHANICS_BY_IDENTIFIER = Object.freeze({
  'ability-score-improvement': {
    version: 1,
    support: 'automatic',
    effects: [{
      id: 'ability-score-increase',
      type: 'ability-score-increase',
      parameters: {
        choiceId: 'ability-score-increase-choice',
        totalIncrease: 2,
        maxScore: 20,
      },
    }],
    choices: [{
      id: 'ability-score-increase-choice',
      type: 'ability',
      count: 2,
      options: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      parameters: {
        allocation: 'one-plus-two-or-two-plus-one',
        required: 1,
        maxScore: 20,
      },
    }],
  },
  skilled: {
    version: 1,
    support: 'automatic',
    effects: [{
      id: 'proficiency-grant',
      type: 'proficiency',
      parameters: { choiceId: 'skilled-proficiencies', count: 3, preventDuplicates: true },
    }],
    choices: [{
      id: 'skilled-proficiencies',
      type: 'skill-or-tool',
      count: 3,
      options: [
        ...['acrobatics', 'animalHandling', 'arcana', 'athletics', 'performance', 'deception', 'stealth', 'history', 'intimidation', 'insight', 'investigation', 'medicine', 'nature', 'perception', 'persuasion', 'sleightOfHand', 'religion', 'survival'].map((key) => `skill:${key}`),
        ...TOOL_PROFICIENCY_OPTIONS.map((tool) => `tool:${tool}`),
      ],
    }],
  },
});
