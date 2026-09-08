// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/schema.mjs
// Component Version: 0.1.0
//
// Rule in effect (see CLAUDE.md): formulas/numbers here are PROVISIONAL — the
// user is rewriting the rules from the SRD (.planning/SRD-OGL_V5.1.md /
// srd5.2_markdown/). This module only ports the SHAPE of the data
// (systemData shape), not the final values.
// ══════════════════════════════════════════════════════════════════════════

import { SKILL_ABILITIES } from './config.mjs';

// ── Shape helpers (mirror the original Foundry defineSchema() helpers) ─────

function defaultAbility() {
  return { value: 10, modifier: 0, resilience: 0 };
}

function defaultSkill(ability) {
  return { value: 0, bonus: 0, ability, proficient: false, multiplier: 0 };
}

function defaultSave() {
  return { value: 0, modifier: 0, proficient: false, magic: 0, misc: 0, temp: 0, total: 10 };
}

function defaultNpcSave() {
  return { proficient: false, total: 10 };
}

function defaultSkills() {
  const out = {};
  for (const [key, ability] of Object.entries(SKILL_ABILITIES)) out[key] = defaultSkill(ability);
  return out;
}

function defaultAbilities() {
  return { str: defaultAbility(), dex: defaultAbility(), con: defaultAbility(), int: defaultAbility(), wis: defaultAbility(), cha: defaultAbility() };
}

// Spell slots per level (1-9) — values stay at 0 until class data can compute
// them automatically; directly editable for now (see "provisional rules"
// note at the top of this file).
function defaultSpellSlots() {
  const out = {};
  for (let lvl = 1; lvl <= 9; lvl++) out[lvl] = { value: 0, max: 0 };
  return out;
}

// Dynamic bonuses shared by weapon/armor/feature/item (getBonusesSchema in the original Foundry system)
function defaultBonuses() {
  return {
    abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    saves: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, all: 0 },
    da: 0, baseAC: 0, bonusAC: 0, prof: 0, spellDC: 0, rm: 0,
    attack: { melee: 0, ranged: 0 },
    speed: 0, initiative: 0,
    weaponProficiencies: [], armorProficiencies: [],
    hp: 0, hpFormula: '',
    damage: { all: 0, cantrip: 0, weapon: 0, spell: 0, formula: '', globalAttack: '', globalSave: '' },
    skills: [], skillMultipliers: [], trainedSkill: '',
    crit: { modifiesCrit: false, rangeMultiplier: 1, fixedReduction: 0, multiplierBonus: 0 },
    traits: { di: [], dr: [], dv: [], ci: [] },
    fullOffHandDamage: false, isAdeptWeapon: false,
  };
}

// Generic action schema (getActionSchema in the original Foundry system) — shared trigger/mutation
// engine for feature/gear (weapon only uses the damage/heal subset, see the 'weapon' case below).
function defaultAction() {
  return {
    mutationType: 'none',
    activation: { value: 0, units: 'inst' },
    delivery: 'none',
    range: { value: 0, units: 'ft' },
    duration: { value: 0, units: 'inst' },
    save: { type: 'none', dcBonus: 0, effect: 'negate' },
    scaling: { formula: '', limit: 0 },
    damage: { formula: '', type: 'fire', isScaling: false, maxDice: 10, fixed: 0, racialScaling: false },
    healing: { formula: '', isHealing: false, allowOverheal: false },
    auraEffect: { enabled: false, key: 'system.attributes.da.bonus', value: '0', mode: 2, label: '' },
    vision: { mode: 'basic', range: 0 },
    light: { dim: 0, bright: 0, color: '#ffffff', alpha: 0.5, animationType: 'none' },
    activationTrigger: 'none',
    flowMutation: { target: 'none', value: '0', resourceId: '', resourceCost: 0 },
  };
}

// Base shared by every item (BaseItemModel in the original Foundry system)
function defaultBaseItem() {
  return {
    identifier: '',
    description: '',
    weight: 0,
    quantity: 1,
    rarity: 'common',
    isBindOnEquip: false,
    attunement: 'none', // 'none' | 'required' | 'attuned'
    source: '',
    price: { gp: 0, sp: 0, cp: 0 },
  };
}

// ── getDefaultData by type ───────────────────────────────────────────────

export function getDefaultData(type) {
  switch (type) {
    case 'character':
      return {
        abilities: defaultAbilities(),
        resonance: { axis_flux: 0, genesis_abyss: 0 },
        saves: { str: defaultSave(), dex: defaultSave(), con: defaultSave(), int: defaultSave(), wis: defaultSave(), cha: defaultSave() },
        attributes: {
          hp: { value: 10, max: 10, bonus: 0, temp: 0 },
          da: { value: 10, base: 10, magic: 0, bonus: 0 },
          prof: { value: 2, bonus: 0 },
          dominio: { value: 2 },
          armor: { value: 0, stealthDisadvantage: false, penalty: false, category: 'none', categoryLabel: '', canCastSpells: true, speedPenalty: false },
          // Regra opcional do SRD ("Variant: Encumbrance") — desligada por
          // padrão. `weight`/`capacity`/`tier` são calculados sozinhos em
          // prepEncumbrance() (prepare-data.mjs), nunca editados na mão.
          encumbrance: { enabled: false, weight: 0, capacity: 0, tier: 'none', overCapacity: false },
          initiative: { value: 0, total: 0 },
          speed: { value: '9m' },
          meleeBonus: 0, rangedBonus: 0, rm: 0,
          featureDamageBonus: 0, featureDamageFormula: '',
          featureAttackMelee: 0, featureAttackRanged: 0,
          globalAttack: '', globalSave: '',
          strain: 0,
          luck: { value: 0, max: 5 },
          spellcasting: { ability: 'int', dc: 0, attackBonus: 0 },
        },
        bonuses: { damage: { cantrip: '', weapon: '', spell: '', all: '' } },
        resources: {
          shortRestsDone: 0,
          health: { value: 10, max: 10, bonus: 0, temp: 0 },
          hitDice: { value: 1, max: 1, die: 'd8' },
          spellSlots: defaultSpellSlots(),
          racial: { value: 0, max: 0, reset: 'short' },
          primary: { value: 0, max: 0, label: 'Resource', reset: 'long' },
          deathSaves: { successes: 0, failures: 0 },
          exhaustion: 0,
          inspiration: false,
          concentrating: false,
        },
        traits: { di: [], dr: [], dv: [], ci: [] },
        proficiencies: { weapons: [], armor: [], tools: [] },
        skills: defaultSkills(),
        equipmentSlots: {
          head: '', neck: '', torso: '', shoulders: '', cloak: '', arms: '', hands: '', waist: '', feet: '',
          mainHand: '', offHand: '', ring1: '', ring2: '', ring3: '', ring4: '', trinket1: '', trinket2: '',
        },
        details: {
          biography: '',
          inventoryArt: 'icons/svg/mystery-man.svg',
          background: '', player: '',
          level: 1,
          age: '', height: '', weight: '', gender: '', hair: '', eyes: '', skin: '', deity: '',
          alignment: '',
          proficiencyBonus: 2,
          skillPointsRemaining: 0,
          senses: { value: [], custom: '' },
          xp: { value: 0, max: 300 },
          pp: { value: 0 }, gp: { value: 0 }, ep: { value: 0 }, sp: { value: 0 }, cp: { value: 0 },
          // Roleplay hooks (Ideals/Bonds/Flaws/Personality/Appearance) — plain text
          // for now, matching the reference's textarea-per-field pattern.
          personalityTraits: '', ideals: '', bonds: '', flaws: '', appearance: '',
        },
      };

    case 'npc':
      return {
        abilities: defaultAbilities(),
        saves: { str: defaultNpcSave(), dex: defaultNpcSave(), con: defaultNpcSave(), int: defaultNpcSave(), wis: defaultNpcSave(), cha: defaultNpcSave() },
        attributes: {
          hp: { value: 10, max: 10, bonus: 0, temp: 0 },
          da: { value: 10, base: null, magic: 0, bonus: 0 },
          prof: { value: 2 },
          initiative: { value: 0, bonus: 0, total: 0 },
          speed: { value: '9m' },
        },
        resources: { health: { value: 10, max: 10, bonus: 0, temp: 0 } },
        skills: defaultSkills(),
        details: {
          cr: 1,
          xp: { value: 0, label: '0 XP' },
          alignment: '', size: 'med', biography: '',
          legendaryActions: 0, legendaryResistances: 0,
          senses: { value: [], custom: '' },
          traits: { di: [], dr: [], dv: [], ci: [] },
          languages: { value: [], custom: '' },
        },
      };

    case 'weapon':
      return {
        ...defaultBaseItem(),
        weaponType: 'simpleM', rangeType: 'melee', weaponGroup: 'blades', handlingType: 'oneHanded',
        attackBonus: 0,
        damage: { formula: '1d6', type: 'slashing' },
        properties: [],
        equipped: false,
        iterative: [],
        primarySlot: 'mainHand',
        magical: false,
        charges: { value: 0, max: 0 },
        magicDamage: { formula: '', type: 'magic' },
        healing: { formula: '', isHealing: false },
        bonuses: defaultBonuses(),
      };

    case 'armor':
      return {
        ...defaultBaseItem(),
        armorType: 'light',
        acValue: 0,
        dexMax: null,
        strengthReq: 0,
        stealthDisadvantage: false,
        isMetal: false,
        equipped: false,
        primarySlot: 'torso',
        bonuses: defaultBonuses(),
      };

    case 'feature':
      return {
        ...defaultBaseItem(),
        // Real dnd5e-Foundry groups the Features tab into named sections
        // ("Wizard Features", "Background Features") — there's no
        // structural link to class/background here (that would need real
        // class content this ruleset doesn't have yet), so this is a
        // free-text label the GM sets by hand; features left blank land in
        // a generic "Features" group rather than disappearing.
        source: '',
        featureType: 'general',
        featType: 'none',
        requirements: {
          abilityLogic: 'and', class: '', classMapping: [],
          minAbilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
          prerequisiteFeature: '', text: '',
        },
        ...defaultAction(),
        tier: 1,
        grantedSkills: 0,
        bonuses: defaultBonuses(),
        meta: { isMetamagic: false, slotModifier: 0, effectTag: '' },
        actions: { costOverride: '' },
        flags: { isTWF: false, isImprovedTWF: false, isGreaterTWF: false, isFinesse: false },
        uses: { value: 0, max: '0', recovery: 'none', amount: 0, type: 'none' },
        // Generic class-resource cost — ported from the original system's
        // "Route D: Flow Modifiers (Agnostic Pools)" (codex-api.mjs:651),
        // real working code there. Spends from `resources.primary` on the
        // actor (Rage/Ki/Sorcery Points/Lay on Hands — whatever the sheet's
        // one class-resource slot is currently labeled as), instead of a
        // separate named pool per class. 0 = doesn't spend anything.
        resourceCost: 0,
        onKillEffect: {
          enabled: false, healFormula: '', resource: 'hp', perSpellLevel: false,
          perSpellLevelMultiplier: 1, restrictions: '', oncePerTurn: true,
        },
      };

    case 'item':
      return {
        ...defaultBaseItem(),
        category: 'gear',
        primarySlot: '',
        equipped: false,
        ...defaultAction(),
        quantity: 1,
        charges: { value: 0, max: 0 },
        consumable: false,
        magical: false,
        identified: true,
        bonus: 0,
        spellLevel: 0,
        useEffect: '',
        bonuses: defaultBonuses(),
      };

    case 'language':
      return {
        ...defaultBaseItem(),
        primarySlot: '',
        script: '',
      };

    // Race/Class/Background — items embedded on the actor (real dnd5e pattern:
    // see templates/actors/parts/actor-classes.hbs from the abandoned port,
    // which reads `actor.itemTypes.class` instead of a loose field). Ready-made
    // content (packs) comes later — this is only the mechanism to attach one
    // of these to an actor.
    case 'race':
      return {
        ...defaultBaseItem(),
        creatureType: 'humanoid',
        size: 'med',
        speed: '9m',
      };

    case 'class':
      return {
        ...defaultBaseItem(),
        hitDie: 'd8',
        levels: 1,
        subclassName: '',
        // 'none' | 'full' | 'half' | 'pact' — usado por prepSpellSlots()
        // em prepare-data.mjs pra calcular resources.spellSlots automaticamente.
        casterType: 'none',
        // 'none' | 'bard' | 'sorcerer' | 'warlock' | 'ranger' — só pras 4
        // classes SRD que "conhecem" magia (sem preparação diária). Separado
        // de `casterType` porque uma classe 'full'/'half' tanto pode ser
        // "prepara" (Wizard/Paladin) quanto "conhece" (Bard-Sorcerer/Ranger).
        knownCasterType: 'none',
        // 'none' | uma das 12 classes SRD — identidade fixa da classe, usada
        // só pra checar pré-requisito de multiclasse (MULTICLASS_PREREQS em
        // config.mjs). Separado de casterType/knownCasterType de propósito.
        classIdentifier: 'none',
      };

    case 'background':
      return {
        ...defaultBaseItem(),
      };

    case 'subclass':
      return {
        ...defaultBaseItem(),
        classIdentifier: '',
      };

    case 'feat':
      return {
        ...defaultBaseItem(),
        requiresLevel: 1,
      };

    // Only the item exists for now — no spell slots/preparation/casting DC
    // (that's a separate step, spellcasting touches more than the item schema).
    case 'spell':
      return {
        ...defaultBaseItem(),
        spellLevel: 0,
        school: '',
        castingTime: '1 action',
        range: '',
        components: { v: false, s: false, m: false, material: '' },
        duration: 'Instantaneous',
        concentration: false,
        ritual: false,
        prepared: false,
        damage: { formula: '', type: '' },
      };

    default:
      return {};
  }
}
