// ─────────────────────────────────────────────────────────────────────────────
// SDR5E — scripts/settings.mjs
// Component Version: 0.1.0
// Configurações do sistema SDR5E (Modern SRD) integradas ao settingsRegistry do LoomVTT.
// ─────────────────────────────────────────────────────────────────────────────

export const SDR5E_SETTINGS = [
  {
    key: 'initiativeFormula',
    name: 'Initiative Formula',
    hint: 'Formula used by the combat tracker: Dexterity modifier, initiative adjustments, and decimal tie-breaker.',
    scope: 'world',
    type: String,
    default: '1d20 + floor((@abilities.dex.value - 10) / 2) + @attributes.initiative.value + @attributes.initiative.bonus + (@abilities.dex.value / 100)'
  },
  {
    key: 'initiativeTiebreaker',
    name: 'Initiative Tie-Breaker',
    hint: 'Adds the decimal Dexterity score (DEX / 100) to initiative to break ties automatically.',
    scope: 'world',
    type: Boolean,
    default: true
  },
  {
    key: 'maxHpFirstLevel',
    name: 'Maximum Hit Points at Level 1',
    hint: 'New heroes receive the maximum hit points for their first level.',
    scope: 'world',
    type: Boolean,
    default: true
  },
  {
    key: 'encumbranceTracking',
    name: 'Encumbrance Tracking',
    hint: 'Applies the SRD optional carrying-capacity rule and its penalties for excess weight.',
    scope: 'world',
    type: Boolean,
    default: false
  },
  {
    key: 'collapseItemCards',
    name: 'Compact Chat Cards',
    hint: 'Shows item rolls and activations in a compact format to save chat space.',
    scope: 'client',
    type: Boolean,
    default: false
  },
  {
    key: 'learningMilestones',
    name: 'Milestone Advancement',
    hint: 'Allows level advancement through story milestones instead of accumulated XP.',
    scope: 'world',
    type: Boolean,
    default: true
  },
  {
    key: 'criticalHitRule',
    name: 'Critical Hit Rule',
    hint: 'Method used to calculate damage on critical hits.',
    scope: 'world',
    type: String,
    default: 'doubleDice',
    choices: {
      doubleDice: 'Double Damage Dice (SRD)',
      maxDice: 'Maximum Dice + Roll',
      flatMax: 'Fixed Maximum Damage'
    }
  },
  {
    key: 'deathSaveDC',
    name: 'Death Saving Throw DC',
    hint: 'Difficulty for death saving throws (the standard 5e value is 10).',
    scope: 'world',
    type: Number,
    default: 10
  },
  {
    key: 'diagonalMovement',
    name: 'Diagonal Grid Movement',
    hint: 'Rule used to count diagonal movement on the grid.',
    scope: 'world',
    type: String,
    default: '555',
    choices: {
      '555': '5/5/5 ft (Equal-Distance, Standard)',
      '5105': '5/10/5 ft (DMG Variant)'
    }
  },
  {
    key: 'primaryParty',
    name: 'Primary Party',
    hint: 'Group actor used to calculate encounter difficulty.',
    scope: 'world',
    type: String,
    default: ''
  }
];

function localizeSetting(key, field, fallback) {
  const translationKey = `SDR5E.Settings.${key}.${field}`;
  const translated = window.Loom?.i18n?.localize?.(translationKey);
  return translated && translated !== translationKey ? translated : fallback;
}

export function registerSettings() {
  if (!window.Loom?.settings?.register) return;
  for (const s of SDR5E_SETTINGS) {
    try {
      window.Loom.settings.register('srd5e', s.key, {
        name: localizeSetting(s.key, 'name', s.name),
        hint: localizeSetting(s.key, 'hint', s.hint),
        scope: s.scope,
        config: true,
        type: s.type,
        default: s.default,
        choices: s.choices
          ? Object.fromEntries(Object.entries(s.choices).map(([value, label]) => [
            value,
            localizeSetting(s.key, `choices.${value}`, label),
          ]))
          : undefined
      });
    } catch {
      // Já registrado pelo manifesto ou chamada anterior
    }
  }
}

export function getSetting(key, fallback = undefined) {
  try {
    const val = window.Loom?.settings?.get('srd5e', key);
    return val !== undefined ? val : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key, value) {
  try {
    if (window.Loom?.settings?.set) return await window.Loom.settings.set('srd5e', key, value);
    console.warn('[srd5e] settings.set not available for', key);
  } catch (e) {
    console.warn('[srd5e] setSetting failed', e);
  }
}
