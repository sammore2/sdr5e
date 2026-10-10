/** Selection-only species choices backed by the local SRD 5.2 entries. */
export const SPECIES_VARIANT_PARENTS = Object.freeze({
  elf: ['elf-drow', 'elf-high', 'elf-wood'],
  gnome: ['gnome-forest', 'gnome-rock'],
  tiefling: ['tiefling-abyssal', 'tiefling-chthonic', 'tiefling-infernal'],
});

export const SPECIES_CHOICE_OPTIONS = Object.freeze({
  dragonborn: {
    key: 'draconicAncestry',
    options: ['black', 'blue', 'brass', 'bronze', 'copper', 'gold', 'green', 'red', 'silver', 'white'],
  },
  goliath: {
    key: 'giantAncestry',
    options: ['cloud', 'fire', 'frost', 'hill', 'stone', 'storm'],
  },
  human: {
    key: 'size',
    options: ['med', 'sm'],
  },
  tiefling: {
    key: 'size',
    options: ['med', 'sm'],
  },
});

const SIZE_CHOICE_LABELS = Object.freeze({ med: 'Medium', sm: 'Small' });

/** Tiefling variants are the selectable identifiers; the choice rule lives on the parent. */
export function speciesChoiceRule(identifier) {
  if (!identifier) return null;
  if (SPECIES_CHOICE_OPTIONS[identifier]) return SPECIES_CHOICE_OPTIONS[identifier];
  const parent = Object.keys(SPECIES_VARIANT_PARENTS).find((key) => SPECIES_VARIANT_PARENTS[key].includes(identifier));
  return parent ? SPECIES_CHOICE_OPTIONS[parent] || null : null;
}

export function speciesVariantEntries(entries) {
  const parentIds = new Set(Object.keys(SPECIES_VARIANT_PARENTS));
  return (entries || []).filter((entry) => !parentIds.has(entry?.data?.identifier));
}

export function isHumanSkillValid(skill) {
  return typeof skill === 'string' && ['acrobatics', 'animalHandling', 'arcana', 'athletics', 'performance', 'deception', 'stealth', 'history', 'intimidation', 'insight', 'investigation', 'medicine', 'nature', 'perception', 'persuasion', 'sleightOfHand', 'religion', 'survival'].includes(skill);
}

export function normalizeFeatChoiceName(name) {
  return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLocaleLowerCase();
}

export function isHumanSpeciesChoiceValid(selection, featEntry, trainedSkills = []) {
  return isHumanSkillValid(selection?.skillful)
    && !trainedSkills.includes(selection.skillful)
    && !!featEntry?.data
    && typeof featEntry.name === 'string';
}

export function isSpeciesChoiceValid(identifier, selection) {
  const choice = speciesChoiceRule(identifier);
  if (!choice) return true;
  return choice.options.includes(selection?.[choice.key]);
}

export function recordSpeciesChoice(data, identifier, selection) {
  const choice = speciesChoiceRule(identifier);
  if (!choice) return data;
  const selected = selection?.[choice.key];
  if (!choice.options.includes(selected)) throw new RangeError(`Invalid ${choice.key} species choice.`);
  if (choice.key === 'size') {
    return {
      ...data,
      size: selected,
      description: `${data?.description || ''}\n\nSize: ${SIZE_CHOICE_LABELS[selected]}. Trait effects still need manual application.`,
    };
  }
  const title = choice.key === 'draconicAncestry' ? 'Draconic ancestry' : 'Giant ancestry';
  return {
    ...data,
    description: `${data?.description || ''}\n\n${title}: ${selected[0].toUpperCase()}${selected.slice(1)}. Trait effects still need manual application.`,
  };
}
