export const SRD_STANDARD_LANGUAGES = Object.freeze([
  'Common', 'Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
]);

export const SRD_RARE_LANGUAGES = Object.freeze([
  'Abyssal', 'Celestial', 'Deep Speech', "Thieves' Cant", 'Druidic', 'Undercommon', 'Infernal', 'Primordial', 'Sylvan',
]);

export const ROGUE_SPECIAL_LANGUAGE = "Thieves' Cant";

/** SRD 5.2 character creation: Common plus two distinct Standard Languages. */
export function resolveOriginLanguageChoices(selectedLanguages = []) {
  const selected = Array.isArray(selectedLanguages) ? selectedLanguages.map((value) => String(value || '').trim()) : [];
  const options = SRD_STANDARD_LANGUAGES.filter((language) => language !== 'Common');
  const valid = selected.length === 2 && selected.every((language) => options.includes(language))
    && new Set(selected).size === selected.length;
  return { valid, selected: valid ? selected : [], options, reason: valid ? '' : 'choose-two-distinct-standard-languages' };
}

/** Resolve origin languages and the additional Rogue language granted at level 1. */
export function resolveCharacterLanguages({ originLanguages = [], classIdentifier = '', rogueAdditionalLanguage = '' } = {}) {
  const origin = resolveOriginLanguageChoices(originLanguages);
  if (!origin.valid) return { valid: false, errors: [origin.reason], languages: [], origin, rogue: null };
  const languages = ['Common', ...origin.selected];
  let rogue = null;
  if (classIdentifier === 'rogue') {
    rogue = resolveRogueAdditionalLanguage(rogueAdditionalLanguage, languages);
    if (!rogue.valid) return { valid: false, errors: [rogue.reason], languages, origin, rogue };
    languages.push(ROGUE_SPECIAL_LANGUAGE, rogue.selected);
  } else if (rogueAdditionalLanguage) {
    return { valid: false, errors: ['rogue-language-without-rogue-class'], languages, origin, rogue: null };
  }
  return { valid: true, errors: [], languages: [...new Set(languages)], origin, rogue };
}

/** Persist a validated language result without discarding custom language metadata. */
export function applyCharacterLanguages(systemData = {}, resolution = {}) {
  if (!resolution.valid || !Array.isArray(resolution.languages)) {
    throw new TypeError('A valid character language resolution is required.');
  }
  return {
    ...systemData,
    details: {
      ...(systemData.details || {}),
      languages: { ...(systemData.details?.languages || {}), value: [...resolution.languages] },
    },
  };
}

/** Resolve the one additional language granted by the Rogue's level-1 feature. */
export function resolveRogueAdditionalLanguage(selectedLanguage = '', knownLanguages = []) {
  const known = new Set(['Common', ...(Array.isArray(knownLanguages) ? knownLanguages : [])]
    .map((language) => String(language || '').trim().toLocaleLowerCase()).filter(Boolean));
  const options = [...SRD_STANDARD_LANGUAGES, ...SRD_RARE_LANGUAGES]
    .filter((language) => language !== 'Common' && language !== ROGUE_SPECIAL_LANGUAGE)
    .filter((language) => !known.has(language.toLocaleLowerCase()));
  const selected = String(selectedLanguage || '').trim();
  const valid = options.includes(selected);
  return { valid, selected: valid ? selected : '', options, reason: valid ? '' : 'invalid-additional-language' };
}
