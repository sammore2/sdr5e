// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/prepare-data.mjs
// Component Version: 0.1.0
//
// Simplified version of the original Foundry actor-data.mjs/npc-data.mjs
// engine: keeps the math that doesn't depend on class items (fighter/adept
// checks, arcane ward, spellcasting DC table, XP table) — that comes back
// once class content exists. Writes directly onto `systemData` (never
// include these fields in an `api.put` payload — that's the sheet's job).
// ══════════════════════════════════════════════════════════════════════════

import { ABILITY_KEYS, SPELL_SLOT_TABLE, SIZE_CARRY_MULTIPLIER } from './config.mjs';

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
  const priorities = { none: 0, light: 1, medium: 2, heavy: 3 };
  const str = sd.abilities.str.total || 10;

  for (const item of items) {
    // `equipmentSlots` (paper-doll) is defined on the schema but nothing in
    // the native sheet writes to it — only `foundry-legacy-reference/` (inert,
    // never loaded) used it. The live "Equipped" checkbox on the item sheet
    // writes `item.data.equipped`, the same field `syncEquippedEffect`
    // listens to — reading anything else here means toggling Equipped
    // silently does nothing to AC. Found live-testing armor equip/AC.
    const idata = item.system || item.data || {};
    if (item.type !== 'armor' || !idata.equipped) continue;
    const acVal = Number(idata.acValue) || 0;
    const type = idata.armorType;
    if (type === 'shield') shieldBonus += acVal;
    else if (['light', 'medium', 'heavy'].includes(type)) {
      bodyArmorAC += acVal;
      if (priorities[type] > priorities[category]) category = type;
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
  let appliedDex = dexMod;
  if (category === 'heavy') appliedDex = 0;
  else if (category === 'medium') appliedDex = Math.min(dexMod, 2);

  const base = Math.max(sd.attributes.da.base || 10, 10);
  const magic = Number(sd.attributes.da.magic) || 0;
  const bonus = Number(sd.attributes.da.bonus) || 0;
  sd.attributes.da.value = base + bodyArmorAC + shieldBonus + appliedDex + magic + bonus;
}

export function prepSkills(sd, prof) {
  for (const skill of Object.values(sd.skills)) {
    const ablKey = (skill.ability || '').toLowerCase();
    const mod = sd.abilities[ablKey]?.modifier || 0;
    // multiplier:0 é o valor padrão de toda perícia — não pode ser tratado como
    // "não definido" (?? só cai pro fallback em null/undefined, nunca em 0).
    // proficient decide 0 vs proficiente; multiplier só entra quando maior que 1
    // (Expertise, ×2), caso algo defina isso no futuro.
    const multiplier = skill.proficient ? (skill.multiplier > 1 ? skill.multiplier : 1) : 0;
    const profValue = Math.floor(prof * multiplier);
    skill.total = mod + profValue + (Number(skill.bonus) || 0);
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
  sd.attributes.initiative.total = dexMod
    + (Number(sd.attributes.initiative.value) || 0)
    + (Number(sd.attributes.initiative.bonus) || 0);
}

// Tipos de item que contam peso físico de verdade — feature/spell/race/
// class/etc também herdam `weight` do schema base, mas não são objetos
// carregados; incluir eles inflaria o peso à toa.
const PHYSICAL_ITEM_TYPES = ['weapon', 'armor', 'item'];

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

  if (!enc.enabled) {
    enc.weight = 0;
    enc.capacity = 0;
    enc.tier = 'none';
    enc.overCapacity = false;
    return;
  }

  const weight = (items || [])
    .filter((i) => PHYSICAL_ITEM_TYPES.includes(i.type))
    .reduce((sum, i) => {
      const idata = i.system || i.data || {};
      const w = Number(idata.weight) || 0;
      const qty = Number(idata.quantity) || 1;
      return sum + w * qty;
    }, 0);

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
const PACT_MAGIC_TABLE = [
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5],
];

function applyPactMagicSlots(slots, classLevel) {
  const [count, slotLevel] = PACT_MAGIC_TABLE[classLevel - 1] || [0, 0];
  for (let lvl = 1; lvl <= 9; lvl++) {
    const max = lvl === slotLevel ? count : 0;
    slots[lvl].max = max;
    if ((slots[lvl].value ?? 0) > max) slots[lvl].value = max;
  }
}

function applySingleClassSlots(slots, idata) {
  const casterType = idata?.casterType;

  if (casterType === 'pact') {
    const classLevel = Math.max(1, Math.min(20, Number(idata.levels) || 1));
    applyPactMagicSlots(slots, classLevel);
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

  const effectiveLevel = Math.max(0, Math.min(20, fullLevels + Math.floor(halfLevels / 2)));

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

export function prepCharacter(sd, items) {
  prepAbilities(sd);
  const level = Number(sd.details?.level) || 1;
  const baseProf = Math.floor((level - 1) / 4) + 2;
  const prof = baseProf + (Number(sd.attributes.prof.bonus) || 0);
  sd.attributes.prof.value = prof;
  sd.details.proficiencyBonus = prof;

  if (sd.attributes.armor) prepArmorAndDA(sd, items);
  prepSkills(sd, prof);
  prepSaves(sd, prof);
  prepInitiative(sd);
  prepSpellSlots(sd, items);
  prepEncumbrance(sd, items);

  const sc = sd.attributes.spellcasting;
  if (sc) {
    const mod = sd.abilities[sc.ability]?.modifier || 0;
    sc.dc = 8 + prof + mod;
    sc.attackBonus = prof + mod;
  }
}

export function prepNpc(sd) {
  prepAbilities(sd);
  const cr = Number(sd.details?.cr) || 0;
  const prof = Math.floor((Math.max(cr, 1) - 1) / 4) + 2;
  sd.attributes.prof.value = prof;

  const dexMod = sd.abilities.dex.modifier || 0;
  const base = Number(sd.attributes.da.base) || 10;
  sd.attributes.da.value = base + (Number(sd.attributes.da.bonus) || 0) + (Number(sd.attributes.da.magic) || 0) + dexMod;
  sd.attributes.initiative.total = dexMod + (Number(sd.attributes.initiative.value) || 0) + (Number(sd.attributes.initiative.bonus) || 0);

  prepSkills(sd, prof);
  for (const k of ABILITY_KEYS) {
    const save = sd.saves[k];
    const mod = sd.abilities[k]?.modifier || 0;
    save.total = mod + (save.proficient ? prof : 0);
  }
}
