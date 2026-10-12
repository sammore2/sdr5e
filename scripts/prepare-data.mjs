// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/prepare-data.mjs
// Component Version: 0.1.0
//
// Simplified version of the original VTT legado actor-data.mjs/npc-data.mjs
// engine: keeps the math that doesn't depend on class items (fighter/adept
// checks, arcane ward, spellcasting DC table, XP table) — that comes back
// once class content exists. Writes directly onto `systemData` (never
// include these fields in an `api.put` payload — that's the sheet's job).
// ══════════════════════════════════════════════════════════════════════════

import { ABILITY_KEYS, SPELL_SLOT_TABLE, pactMagicAtLevel, SIZE_CARRY_MULTIPLIER, MOVEMENT_TYPES, SENSE_TYPES, feetToMeters } from './config.mjs';
import { getSetting } from './settings.mjs';
import { getDefaultData } from './schema.mjs';
import { mergeDefaults, setItemSystemData } from './utils.mjs';
import { BARBARIAN_FAST_MOVEMENT_BONUS, hasBarbarianFastMovement } from './movement-mechanics.mjs';
import { initiativeTieBreakBonus } from './initiative-mechanics.mjs';
import { clericDivineOrderSkillBonus } from './divine-order.mjs';
import { fighterClassLevel, jackOfAllTradesSkillBonus, syncedFighterFeatureUses, syncedRangerWisdomUses, unarmoredDefenseBaseAC } from './class-feature-mechanics.mjs';

export function parseDistance(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return 0;
  const m = raw.match(/^([\d.]+)\s*(ft\.?|feet|m)?\.?\s*$/i);
  if (!m) {
    const num = Number(raw.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(num)) return 0;
    if (raw.includes('ft') || raw.includes('feet')) return feetToMeters(num);
    return Math.round(num);
  }
  const num = Number(m[1]) || 0;
  const unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('ft') || unit === 'feet') return feetToMeters(num);
  if (unit === 'm') return Math.round(num);
  return Math.round(num);
}

export function migrateLegacyMovement(target, actorType) {
  if (!target || target.movement) return;
  const sp = target.speed;
  let walk = 0; let fly = 0; let swim = 0; let climb = 0; let burrow = 0; let hover = false;
  const isCharacter = actorType === 'character';
  if (typeof sp === 'string') {
    walk = parseDistance(sp);
    if (isCharacter && walk === 9 && sp.trim().toLowerCase() === '9m' && !fly && !swim && !climb && !burrow) {
      walk = 0;
    }
  } else if (sp && typeof sp === 'object') {
    walk = parseDistance(sp.value ?? sp.walk ?? '');
    fly = parseDistance(sp.fly ?? 0);
    swim = parseDistance(sp.swim ?? 0);
    climb = parseDistance(sp.climb ?? 0);
    burrow = parseDistance(sp.burrow ?? 0);
    hover = !!sp.hover;
    if (isCharacter && walk === 9 && String(sp.value||'').trim().toLowerCase() === '9m' && !fly && !swim && !climb && !burrow) {
      walk = 0;
    }
  }
  if (!walk && !fly && !swim && !climb && !burrow && !sp) {
    walk = isCharacter ? 0 : 9;
  }
  target.movement = { walk, fly, swim, climb, burrow, hover };
}

export function migrateLegacySenses(attributes, details) {
  if (!attributes || attributes.senses) return;
  const out = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 };
  const sources = [];
  if (details?.senses?.custom) sources.push(String(details.senses.custom));
  if (Array.isArray(details?.senses?.value)) sources.push(...details.senses.value.map(String));
  const re = /(darkvision|blindsight|tremorsense|truesight)\s+(\d+)\s*(ft\.?|feet|m)?/gi;
  for (const src of sources) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      const key = m[1].toLowerCase();
      const num = Number(m[2]) || 0;
      const unit = (m[3] || '').toLowerCase();
      let meters = 0;
      if (unit.startsWith('ft') || unit === 'feet') meters = feetToMeters(num);
      else if (unit === 'm') meters = Math.round(num);
      else {
        if (num >= 10 && num % 5 === 0) meters = feetToMeters(num);
        else meters = Math.round(num);
      }
      if (SENSE_TYPES.includes(key)) out[key] = Math.max(out[key], meters);
    }
  }
  attributes.senses = out;
}

export function prepAbilities(sd) {
  for (const k of ABILITY_KEYS) {
    const abl = sd.abilities[k];
    abl.total = Number(abl.value ?? 10);
    abl.modifier = Math.floor((abl.total - 10) / 2);
  }
}

/**
 * `proficiencies.armor` guarda o mesmo formato de `proficiencies.weapons`
 * (ver `isWeaponProficient`, mesmo arquivo — só que em `roll-engine.mjs`):
 * código de categoria SRD ('light'/'medium'/'heavy'/'shield', comparado
 * contra `armorType` do item) OU nome exato de uma peça específica.
 */
function isArmorProficient(sd, idata) {
  const profs = sd.proficiencies?.armor || [];
  if (!profs.length) return false;
  const category = String(idata.armorType || '').toLowerCase();
  return profs.some((p) => String(p).toLowerCase() === category);
}

export function prepArmorAndDA(sd, items) {
  let shieldBonus = 0;
  let bodyArmorAC = 0;
  let category = 'none';
  let penalty = false;
  let stealthDisadvantage = false;
  let speedPenalty = false;
  let bodyArmorWorn = false;
  let shieldWielded = false;
  const priorities = { none: 0, light: 1, medium: 2, heavy: 3 };
  const str = sd.abilities.str.total || 10;

  for (const item of items) {
    // `equipmentSlots` (paper-doll) is defined on the schema but nothing in
    // the native sheet writes to it — only `VTT legado-legacy-reference/` (inert,
    // never loaded) used it. The live "Equipped" checkbox on the item sheet
    // writes `item.data.equipped`, the same field `syncEquippedEffect`
    // listens to — reading anything else here means toggling Equipped
    // silently does nothing to AC. Found live-testing armor equip/AC.
    const idata = item.system || item.data || {};
    if (item.type !== 'armor' || !idata.equipped) continue;
    const acVal = Number(idata.acValue) || 0;
    const type = idata.armorType;
    if (type === 'shield') {
      shieldWielded = true;
      shieldBonus += acVal;
    } else {
      bodyArmorWorn = true;
      if (['light', 'medium', 'heavy'].includes(type)) {
        bodyArmorAC += acVal;
        if (priorities[type] > priorities[category]) category = type;
      }
    }
    if (!isArmorProficient(sd, idata)) penalty = true;
    if (idata.stealthDisadvantage) stealthDisadvantage = true;
    const strReq = Number(idata.strengthReq) || 0;
    if (strReq > 0 && str < strReq) speedPenalty = true;
  }

  sd.attributes.armor.category = category;
  sd.attributes.armor.penalty = penalty;
  sd.attributes.armor.stealthDisadvantage = stealthDisadvantage;
  sd.attributes.armor.speedPenalty = speedPenalty;
  // SRD (Equipment/Armor.md): usar armadura sem proficiência impede conjurar.
  sd.attributes.armor.canCastSpells = !penalty;

  const dexMod = sd.abilities.dex.modifier || 0;
  const unarmoredBase = unarmoredDefenseBaseAC(items, {
    dexterityModifier: dexMod,
    constitutionModifier: sd.abilities.con.modifier,
    wisdomModifier: sd.abilities.wis.modifier,
    bodyArmorWorn,
    shieldWielded,
    selectedClass: sd.srd5eUnarmoredDefenseClass,
  });
  let appliedDex = unarmoredBase === null ? dexMod : 0;
  if (category === 'heavy') appliedDex = 0;
  else if (category === 'medium') appliedDex = Math.min(dexMod, 2);

  const configuredBase = Math.max(Number(sd.attributes.da.base) || 10, 10);
  const base = unarmoredBase === null ? configuredBase
    : configuredBase > 10 ? Math.max(configuredBase, unarmoredBase) : unarmoredBase;
  const magic = Number(sd.attributes.da.magic) || 0;
  const bonus = Number(sd.attributes.da.bonus) || 0;
  sd.attributes.da.value = base + bodyArmorAC + shieldBonus + appliedDex + magic + bonus;
}

export function prepSkills(sd, prof, items = []) {
  const divineOrder = items.find((item) => item.type === 'feature'
    && (item.system || item.data || {}).classIdentifier === 'cleric'
    && (item.system || item.data || {}).identifier === 'divine-order');
  const order = (divineOrder?.system || divineOrder?.data || {}).selectedOrder;
  for (const [key, skill] of Object.entries(sd.skills)) {
    const ablKey = (skill.ability || '').toLowerCase();
    const mod = sd.abilities[ablKey]?.modifier || 0;
    // multiplier:0 é o valor padrão de toda perícia — não pode ser tratado como
    // "não definido" (?? só cai pro fallback em null/undefined, nunca em 0).
    // proficient decide 0 vs proficiente; multiplier só entra quando maior que 1
    // (Expertise, ×2), caso algo defina isso no futuro.
    const multiplier = skill.proficient ? (skill.multiplier > 1 ? skill.multiplier : 1) : 0;
    const profValue = Math.floor(prof * multiplier);
    skill.total = mod + profValue + jackOfAllTradesSkillBonus(items, prof, !!skill.proficient) + (Number(skill.bonus) || 0)
      + clericDivineOrderSkillBonus(order, key, sd.abilities.wis?.modifier);
  }
}

export function prepSaves(sd, prof) {
  for (const k of ABILITY_KEYS) {
    const save = sd.saves[k];
    const mod = sd.abilities[k]?.modifier || 0;
    save.modifier = mod;
    const profBonus = save.proficient ? prof : 0;
    const misc = (Number(save.misc) || 0) + (Number(save.temp) || 0);
    save.total = mod + profBonus + misc;
  }
}

export function prepInitiative(sd) {
  const dexMod = sd.abilities.dex.modifier || 0;
  const tiebreaker = initiativeTieBreakBonus(getSetting('initiativeTiebreaker', false), sd.abilities.dex.total ?? sd.abilities.dex.value);
  sd.attributes.initiative.total = dexMod
    + (Number(sd.attributes.initiative.value) || 0)
    + (Number(sd.attributes.initiative.bonus) || 0)
    + tiebreaker;
}

// Tipos de item que contam peso físico de verdade — feature/spell/race/
// class/etc também herdam `weight` do schema base, mas não são objetos
// carregados; incluir eles inflaria o peso à toa.
const PHYSICAL_ITEM_TYPES = ['weapon', 'armor', 'item', 'consumable', 'tool', 'loot', 'container'];

// Total carried weight of physical items. Items anywhere inside an extradimensional
// container (weightlessContents: true, e.g. Bag of Holding) don't count; the
// container's own weight does. Shared by prepEncumbrance and the sheet's carrying display.
export function computeCarriedWeight(items) {
  const map = new Map((items || []).map((it) => [it.id, it]));
  function isInsideWeightless(item) {
    let cid = (item.system || item.data || {}).container;
    const seen = new Set();
    while (cid && !seen.has(cid)) {
      seen.add(cid);
      const cont = map.get(cid);
      if (!cont) break;
      const cdata = cont.system || cont.data || {};
      if (cdata.weightlessContents) return true;
      cid = cdata.container;
    }
    return false;
  }
  return (items || [])
    .filter((i) => PHYSICAL_ITEM_TYPES.includes(i.type))
    .filter((i) => !isInsideWeightless(i))
    .reduce((sum, i) => {
      const idata = i.system || i.data || {};
      const w = Number(idata.weight) || 0;
      const qty = Number(idata.quantity) || 1;
      return sum + w * qty;
    }, 0);
}

/**
 * Calcula `sd.attributes.encumbrance` (peso carregado, capacidade, e o
 * estado: 'none' | 'encumbered' | 'heavy') a partir da Força e do tamanho do
 * personagem — regra opcional do SRD ("Variant: Encumbrance",
 * srd5.2_markdown/Gameplay/Abilities.md). Só roda de verdade se
 * `sd.attributes.encumbrance.enabled` for `true`; senão zera os números e
 * sai (não força a regra em quem não ligou ela).
 */
export function prepEncumbrance(sd, items) {
  const enc = sd.attributes?.encumbrance;
  if (!enc) return;

  const isEnabled = enc.enabled ?? getSetting('encumbranceTracking', false);
  if (!isEnabled) {
    enc.weight = 0;
    enc.capacity = 0;
    enc.tier = 'none';
    enc.overCapacity = false;
    return;
  }

  const weight = computeCarriedWeight(items);

  const str = sd.abilities.str.total || 10;
  // Tamanho fica no item 'race' (não existe campo de tamanho solto no
  // personagem) — sem raça definida, assume Medium ('med'), igual ao NPC.
  const raceItem = (items || []).find((i) => i.type === 'race');
  const raceData = raceItem ? (raceItem.system || raceItem.data || {}) : null;
  const size = raceData?.size || 'med';
  const sizeMult = SIZE_CARRY_MULTIPLIER[size] ?? 1;

  const capacity = str * 15 * sizeMult;
  const heavyThreshold = str * 10 * sizeMult;
  const lightThreshold = str * 5 * sizeMult;

  let tier = 'none';
  if (weight > heavyThreshold) tier = 'heavy';
  else if (weight > lightThreshold) tier = 'encumbered';

  enc.weight = weight;
  enc.capacity = capacity;
  enc.tier = tier;
  // SRD: "heavily encumbered... up to your maximum carrying capacity" —
  // acima da capacidade máxima é outro estado (nem consegue carregar, só
  // arrastar), não é só "mais heavy ainda". Flag informativa separada.
  enc.overCapacity = weight > capacity;
}

// Calcula `resources.spellSlots[1..9].max` a partir do(s) item(ns) 'class'
// do personagem — casterType + levels. Sem classe conjuradora, ou
// casterType 'none'/'pact', não mexe em nada (Pact Magic fica pra outra
// tarefa — ver Handout 01, "Fora do escopo").
//
// IMPORTANTE: nunca reseta `.value` pro `.max` novo — isso reencheria slots
// já gastos toda vez que a ficha renderizasse. Só ajusta `.value` pra baixo
// se ele ficar maior que o `.max` novo (ex.: personagem perdeu nível). A
// recuperação real de slots (voltar tudo pro máximo) é o descanso longo
// (`_takeRest` em actor-sheet.mjs), que não muda com esta tarefa.
// Pact Magic (Warlock): [quantidade de slots, nível do slot], index 0 =
// nível de personagem 1. Estruturalmente diferente da tabela 'full'/'half'
// (todos os slots são do MESMO nível, em vez de um valor por nível 1-9) —
// por isso é uma tabela e uma função de aplicação separadas.
function applySingleClassSlots(slots, idata) {
  const casterType = idata?.casterType;

  if (casterType === 'pact') {
    for (let lvl = 1; lvl <= 9; lvl++) slots[lvl].max = 0;
    return;
  }

  const table = casterType === 'full' || casterType === 'half' ? SPELL_SLOT_TABLE[casterType] : null;

  if (!table) {
    for (let lvl = 1; lvl <= 9; lvl++) {
      slots[lvl].max = 0;
    }
    return;
  }

  const classLevel = Math.max(1, Math.min(20, Number(idata.levels) || 1));
  const row = table[classLevel - 1] || [];

  for (let lvl = 1; lvl <= 9; lvl++) {
    const max = row[lvl - 1] || 0;
    slots[lvl].max = max;
    if ((slots[lvl].value ?? 0) > max) slots[lvl].value = max;
  }
}

/**
 * SRD (Characterizations/Multiclassing.md, "Spell Slots"): soma todos os
 * níveis em classes 'full' + metade (arredondado pra baixo) dos níveis em
 * classes 'half', e usa esse total pra consultar a tabela "Multiclass
 * Spellcaster" — que é, número por número, IDÊNTICA à SPELL_SLOT_TABLE.full
 * já usada pra conjurador único (conferido linha a linha contra o SRD).
 *
 * Limitação conhecida, documentada, não resolvida por esta tarefa: se o
 * personagem também tiver nível de Warlock (Pact Magic), essa reserva
 * separada do SRD não é aplicada aqui — `resources.spellSlots` só tem um
 * bucket por nível, sem espaço pra guardar os dois grupos de slot ao mesmo
 * tempo. Ver Handout 08, seção "Fora do escopo".
 */
function applyMulticlassSlots(slots, classItems) {
  let fullLevels = 0;
  let halfLevels = 0;

  for (const item of classItems) {
    const idata = item.system || item.data || {};
    const levels = Number(idata.levels) || 0;
    if (idata.casterType === 'full') fullLevels += levels;
    else if (idata.casterType === 'half') halfLevels += levels;
  }

  // SRD 5.2 (Multiclass Spellcaster): "Half your levels (round up) in the
  // Paladin and Ranger classes" is one combined total, not a rounding per class.
  const effectiveLevel = Math.max(0, Math.min(20, fullLevels + Math.ceil(halfLevels / 2)));

  if (effectiveLevel === 0) {
    for (let lvl = 1; lvl <= 9; lvl++) slots[lvl].max = 0;
    return;
  }

  const row = SPELL_SLOT_TABLE.full[effectiveLevel - 1] || [];
  for (let lvl = 1; lvl <= 9; lvl++) {
    const max = row[lvl - 1] || 0;
    slots[lvl].max = max;
    if ((slots[lvl].value ?? 0) > max) slots[lvl].value = max;
  }
}

export function prepSpellSlots(sd, items) {
  const slots = sd.resources?.spellSlots;
  if (!slots) return;

  const classItems = (items || []).filter((i) => i.type === 'class');
  const pactClass = classItems.map((item) => item.system || item.data || {}).find((data) => data.casterType === 'pact');
  const pact = sd.resources.pactMagic || (sd.resources.pactMagic = { value: 0, max: 0, spellLevel: 0, needsReview: false });
  if (pactClass) {
    const progression = pactMagicAtLevel(pactClass.levels);
    pact.max = progression.max;
    pact.spellLevel = progression.spellLevel;
    pact.value = Math.min(Number(pact.value) || 0, pact.max);
  } else {
    pact.max = 0;
    pact.spellLevel = 0;
    pact.value = 0;
  }

  if (classItems.length > 1) {
    applyMulticlassSlots(slots, classItems);
    return;
  }

  const classItem = classItems[0];
  const idata = classItem ? (classItem.system || classItem.data || {}) : null;
  if (!idata) {
    for (let lvl = 1; lvl <= 9; lvl++) slots[lvl].max = 0;
    return;
  }
  applySingleClassSlots(slots, idata);
}

export function prepMovement(sd, items) {
  if (!sd.attributes) return;
  if (!sd.attributes.movement) sd.attributes.movement = { walk: 9, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false };
  if (!sd.attributes.senses) sd.attributes.senses = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 };
  const mv = sd.attributes.movement;
  const se = sd.attributes.senses;
  let raceMv = null; let raceSe = null;
  if (items) {
    const raceItem = items.find((i) => i.type === 'race');
    if (raceItem) {
      const rdata = raceItem.system || raceItem.data || {};
      migrateLegacyMovement(rdata);
      if (rdata.movement) raceMv = rdata.movement;
      if (rdata.senses) raceSe = rdata.senses;
    }
  }
  const effective = {};
  const sensesEffective = {};
  const exhaustion = Number(sd.resources?.exhaustion) || 0;
  const hasSpeedPenalty = !!sd.attributes.armor?.speedPenalty;
  const barbarianFastMovement = hasBarbarianFastMovement(items || []);
  for (const mode of MOVEMENT_TYPES) {
    let base = Number(mv[mode]) || 0;
    if (base === 0 && raceMv) base = Number(raceMv[mode]) || 0;
    if (mode === 'walk' && base === 0) base = 9;
    let val = base;
    // SRD 5.2 Fast Movement increases walking speed by 10 ft (3 m); derive
    // from base each pass so preparation never stacks the feature repeatedly.
    if (mode === 'walk' && barbarianFastMovement) val += BARBARIAN_FAST_MOVEMENT_BONUS;
    if (hasSpeedPenalty && val > 0) val = Math.max(0, val - 3);
    if (exhaustion > 0) val = Math.max(0, val - exhaustion * 1.5);
    effective[mode] = val;
  }
  effective.hover = !!mv.hover || !!(raceMv?.hover);
  for (const s of SENSE_TYPES) {
    let base = Number(se[s]) || 0;
    if (base === 0 && raceSe) base = Number(raceSe[s]) || 0;
    sensesEffective[s] = base;
  }
  mv.effective = effective;
  se.effective = sensesEffective;
}

export function prepCharacter(sd, items) {
  prepAbilities(sd);
  const level = Number(sd.details?.level) || 1;
  const baseProf = Math.floor((level - 1) / 4) + 2;
  const prof = baseProf + (Number(sd.attributes.prof.bonus) || 0);
  sd.attributes.prof.value = prof;
  sd.details.proficiencyBonus = prof;

  // SRD 5.2 exhaustion affects D20 Tests and Speed, not Hit Point maximum.
  const rawMax = Number(sd.resources?.health?.max) || 0;
  const exhaustionLevel = Number(sd.resources?.exhaustion) || 0;
  if (sd.resources?.health) {
    sd.resources.health.effectiveMax = rawMax;
    // Nunca deixa o HP atual acima do teto efetivo (mesmo comportamento do
    // SRD: HP atual em excesso é descartado, não fica "guardado" esperando
    // a exaustão baixar).
    // Alias for Loom's canvas token bars and vital resource monitoring (attributes.hp)
    if (!sd.attributes) sd.attributes = {};
    sd.attributes.hp = sd.resources.health;
  }

  if (sd.attributes.armor) prepArmorAndDA(sd, items);
  prepSkills(sd, prof, items);
  prepSaves(sd, prof);
  prepInitiative(sd);
  prepSpellSlots(sd, items);
  prepEncumbrance(sd, items);
  prepMovement(sd, items);

  const sc = sd.attributes.spellcasting;
  if (sc) {
    const mod = sd.abilities[sc.ability]?.modifier || 0;
    sc.dc = 8 + prof + mod;
    sc.attackBonus = prof + mod;
  }
}

export function prepNpc(sd, items = []) {
  prepAbilities(sd);
  const cr = Number(sd.details?.cr) || 0;
  const prof = Math.floor((Math.max(cr, 1) - 1) / 4) + 2;
  if (!sd.attributes) sd.attributes = {};
  sd.attributes.prof.value = prof;

  // Alias for Loom's canvas token bars and vital resource monitoring (attributes.hp)
  if (sd.resources?.health) {
    sd.attributes.hp = sd.resources.health;
  }

  const dexMod = sd.abilities.dex.modifier || 0;
  const base = Number(sd.attributes.da.base) || 10;
  sd.attributes.da.value = base + (Number(sd.attributes.da.bonus) || 0) + (Number(sd.attributes.da.magic) || 0) + dexMod;
  sd.attributes.initiative.total = dexMod + (Number(sd.attributes.initiative.value) || 0) + (Number(sd.attributes.initiative.bonus) || 0);

  prepSkills(sd, prof, items);
  // Same save math as the character path (prepSaves): ability mod + proficiency
  // if proficient + misc/temp bonuses. Keeps the NPC's listed misc bonus.
  prepSaves(sd, prof);
  prepMovement(sd, null);
}
// Full derived-data pass for one actor row (the ruleset's prepareData hook).
// Legacy migration must run BEFORE mergeDefaults creates defaults, otherwise the
// existence check (target.movement) would see the default and never migrate.
export function prepareActorRow(row) {
  const sd = row?.systemData;
  if (!sd) return row;
  if (sd.attributes) {
    migrateLegacyMovement(sd.attributes, row.type);
    migrateLegacySenses(sd.attributes, sd.details);
  }
  // Preserve an unambiguous legacy single-Warlock pool before new defaults
  // are merged. Multiclass actors had no separate Pact pool in old saves, so
  // their previous current count is unknowable and needs manual review.
  if (sd.resources && !sd.resources.pactMagic) {
    const classes = (row.items || []).filter((item) => item.type === 'class').map((item) => item.system || item.data || {});
    const pactClass = classes.find((data) => data.casterType === 'pact');
    if (pactClass) {
      const progression = pactMagicAtLevel(pactClass.levels);
      const legacy = sd.resources.spellSlots?.[progression.spellLevel];
      const safelyMigrated = classes.length === 1 && Number(legacy?.max) > 0;
      sd.resources.pactMagic = {
        value: safelyMigrated ? Math.min(Number(legacy.value) || 0, progression.max) : 0,
        max: progression.max,
        spellLevel: progression.spellLevel,
        needsReview: !safelyMigrated,
      };
    }
  }
  if (sd.resources?.hitDice && !sd.resources.hitDice.pools) {
    const classes = (row.items || []).filter((item) => item.type === 'class').map((item) => item.system || item.data || {});
    const hitDice = sd.resources.hitDice;
    if (classes.length === 1) {
      const classData = classes[0];
      const classId = classData.classIdentifier || 'unclassified';
      hitDice.pools = {
        [classId]: {
          value: Math.min(Number(hitDice.value) || 0, Number(hitDice.max) || Number(classData.levels) || 1),
          max: Number(hitDice.max) || Number(classData.levels) || 1,
          die: classData.hitDie || hitDice.die || 'd8',
          needsReview: false,
        },
      };
      hitDice.needsReview = false;
    } else if (classes.length > 1) {
      const byDie = {};
      for (const classData of classes) {
        const die = classData.hitDie || 'd8';
        byDie[die] = (byDie[die] || 0) + (Number(classData.levels) || 0);
      }
      const dice = Object.keys(byDie);
      if (dice.length === 1) {
        const die = dice[0];
        hitDice.pools = { [die]: { value: Math.min(Number(hitDice.value) || 0, byDie[die]), max: byDie[die], die, needsReview: false } };
        hitDice.needsReview = false;
      } else {
        hitDice.pools = Object.fromEntries(dice.map((die) => [die, { value: 0, max: byDie[die], die, needsReview: true }]));
        hitDice.needsReview = true;
      }
    }
  }
  mergeDefaults(sd, getDefaultData(row.type));
  if (row.type === 'vehicle') {
    sd.attributes.da = { value: sd.attributes?.ac ?? 10, base: sd.attributes?.ac ?? 10, magic: 0, bonus: 0 };
    sd.attributes.hp = sd.resources?.health;
    return row;
  }
  if (!sd.abilities) return row;
  if (row.type === 'npc') prepNpc(sd, row.items || []);
  else {
    prepCharacter(sd, row.items || []);
    syncPreparedFighterUses(row.items || []);
    syncPreparedRangerUses(row.items || [], sd.abilities?.wis?.modifier);
  }
  return row;
}

// SRD 5.2 Ranger Tireless / Nature's Veil: max uses equal the Wisdom modifier
// (minimum 1) as soon as the actor is prepared, mirroring Bardic Inspiration's
// Charisma sync. Spent uses carry over inside syncedRangerWisdomUses.
function syncPreparedRangerUses(items, wisdomModifier) {
  for (const item of items) {
    const idata = item?.systemData || item?.system || item?.data || {};
    const synced = syncedRangerWisdomUses(idata, wisdomModifier);
    if (synced) setItemSystemData(item, { uses: synced });
  }
}

// SRD 5.2 Fighter Action Surge / Indomitable: max uses follow the Fighter class
// level as soon as the actor is prepared (level-up), not only at the next rest
// or activation. Spent uses carry over inside syncedFighterFeatureUses.
function syncPreparedFighterUses(items) {
  const fighterLevel = fighterClassLevel(items);
  for (const item of items) {
    const idata = item?.systemData || item?.system || item?.data || {};
    const synced = syncedFighterFeatureUses(idata, fighterLevel);
    if (synced) setItemSystemData(item, { uses: synced });
  }
}

// Fetches an actor WITH its embedded items (the API only includes them with
// ?populate=true) and runs the derived-data pass on a clone.
export async function fetchPreparedActor(id) {
  const { api } = await import('/_loom/sdk/index.js');
  const raw = await api.get(`/actors/${id}?populate=true`);
  if (!raw) return null;
  const row = JSON.parse(JSON.stringify(raw));
  row.items = raw.items || [];
  return prepareActorRow(row);
}

