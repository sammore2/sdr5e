// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/enrich-packs.mjs
// Automates icons and Active Effects enrichment across all compendium packs
// ══════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'packs', 'source');
const ASSET_PREFIX = '/marketplace/rulesets/srd5e/assets/icons';

// ──────────────────────────────────────────────────────────────────────────
// Active Effects Catalog
// ──────────────────────────────────────────────────────────────────────────

const SPELL_EFFECTS = {
  'Bless': {
    name: 'Bless',
    icon: `/10.png`,
    description: '+1d4 (+2.5) em jogadas de ataque e salvaguardas.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'bless',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.str.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.dex.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.con.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.int.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.wis.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.cha.misc', mode: 'add', value: 2.5, priority: 10 },
    ],
    visual: { kind: 'aura', color: '#ffd700', intensity: 0.8, speed: 1.2, size: 1.3 }
  },
  'Bane': {
    name: 'Bane',
    icon: `/10.png`,
    description: '-1d4 (-2.5) em jogadas de ataque e salvaguardas.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'bane',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: -2.5, priority: 10 },
      { key: 'saves.str.misc', mode: 'add', value: -2.5, priority: 10 },
      { key: 'saves.dex.misc', mode: 'add', value: -2.5, priority: 10 },
      { key: 'saves.con.misc', mode: 'add', value: -2.5, priority: 10 },
      { key: 'saves.int.misc', mode: 'add', value: -2.5, priority: 10 },
      { key: 'saves.wis.misc', mode: 'add', value: -2.5, priority: 10 },
      { key: 'saves.cha.misc', mode: 'add', value: -2.5, priority: 10 },
    ],
    visual: { kind: 'aura', color: '#4a154b', intensity: 0.8, speed: 0.8, size: 1.2 }
  },
  'Shield': {
    name: 'Shield',
    icon: `/10.png`,
    description: '+5 de bônus na Classe de Armadura (AC).',
    durationUnit: 'rounds',
    duration: 1,
    expireOn: 'turn-start',
    conditionId: 'shield-spell',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 5, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#00bfff', intensity: 0.9, speed: 1.5, size: 1.2 }
  },
  'Shield of Faith': {
    name: 'Shield of Faith',
    icon: `/10.png`,
    description: '+2 de bônus na Classe de Armadura (AC).',
    durationUnit: 'minutes',
    duration: 10,
    conditionId: 'shield-of-faith',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 2, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#4169e1', intensity: 0.7, speed: 1.0, size: 1.3 }
  },
  'Mage Armor': {
    name: 'Mage Armor',
    icon: `/10.png`,
    description: 'Armadura Arcana: Base AC torna-se 13 + Mod de Destreza.',
    durationUnit: 'hours',
    duration: 8,
    conditionId: 'mage-armor',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.da.base', mode: 'override', value: 13, priority: 5 }
    ],
    visual: { kind: 'tint', color: '#1e90ff', intensity: 0.5, speed: 1.0, size: 1.0 }
  },
  'Haste': {
    name: 'Haste',
    icon: `/10.png`,
    description: '+2 na CA, vantagem em testes de Des, dobro de velocidade de movimento.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'haste',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 2, priority: 10 },
      { key: 'attributes.movement.walk', mode: 'multiply', value: 2, priority: 20 }
    ],
    visual: { kind: 'aura', color: '#ffff00', intensity: 0.9, speed: 2.5, size: 1.4 }
  },
  'Slow': {
    name: 'Slow',
    icon: `/10.png`,
    description: '-2 na CA, metade do deslocamento, sem reações.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'slow',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: -2, priority: 10 },
      { key: 'attributes.movement.walk', mode: 'multiply', value: 0.5, priority: 20 }
    ],
    visual: { kind: 'tint', color: '#8a2be2', intensity: 0.7, speed: 0.4, size: 1.1 }
  },
  'Hold Person': {
    name: 'Hold Person',
    icon: `/10.png`,
    description: 'Condição: Paralisado (Paralyzed). Incapacitado e não pode se mover.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'paralyzed',
    removeOnCombatEnd: true,
    changes: [],
    visual: { kind: 'aura', color: '#ffbf00', intensity: 0.8, speed: 0.5, size: 1.2 }
  },
  'Hold Monster': {
    name: 'Hold Monster',
    icon: `/10.png`,
    description: 'Condição: Paralisado (Paralyzed). Incapacitado e não pode se mover.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'paralyzed',
    removeOnCombatEnd: true,
    changes: [],
    visual: { kind: 'aura', color: '#ffbf00', intensity: 0.8, speed: 0.5, size: 1.2 }
  },
  'Blindness/Deafness': {
    name: 'Blindness',
    icon: `/10.png`,
    description: 'Condição: Cego (Blinded). Ataques contra têm vantagem; próprios têm desvantagem.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'blinded',
    removeOnCombatEnd: true,
    changes: [],
    visual: { kind: 'tint', color: '#333333', intensity: 0.8, speed: 1.0, size: 1.0 }
  },
  'Invisibility': {
    name: 'Invisibility',
    icon: `/10.png`,
    description: 'Condição: Invisível (Invisible). Vantagem em ataques próprios; desvantagem contra.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'invisible',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'tint', color: '#00ffff', intensity: 0.4, speed: 1.0, size: 1.0 }
  },
  'Greater Invisibility': {
    name: 'Greater Invisibility',
    icon: `/10.png`,
    description: 'Condição: Invisível (Invisible). Permanece invisível mesmo após atacar ou conjurar.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'invisible',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'tint', color: '#00ffff', intensity: 0.4, speed: 1.0, size: 1.0 }
  },
  'Faerie Fire': {
    name: 'Faerie Fire',
    icon: `/10.png`,
    description: 'Luz mágica: Ataques contra o alvo têm vantagem se o atacante puder vê-lo.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'faerie-fire',
    removeOnCombatEnd: true,
    changes: [],
    visual: { kind: 'glow', color: '#bf00ff', intensity: 1.0, speed: 1.0, size: 1.4 }
  },
  'Fly': {
    name: 'Fly',
    icon: `/10.png`,
    description: 'Deslocamento de voo de 60 pés (18 metros).',
    durationUnit: 'minutes',
    duration: 10,
    conditionId: 'flying',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.movement.fly', mode: 'override', value: 18, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#87cefa', intensity: 0.6, speed: 1.5, size: 1.3 }
  },
  'Pass without Trace': {
    name: 'Pass without Trace',
    icon: `/10.png`,
    description: '+10 de bônus em testes de Furtividade (Stealth) e não pode ser rastreado.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'pass-without-trace',
    removeOnCombatEnd: false,
    changes: [
      { key: 'skills.ste.bonus', mode: 'add', value: 10, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#2e8b57', intensity: 0.7, speed: 0.8, size: 1.2 }
  },
  'Barkskin': {
    name: 'Barkskin',
    icon: `/10.png`,
    description: 'Pele de Carvalho: A Classe de Armadura não pode ser menor que 16.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'barkskin',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.da.base', mode: 'upgrade', value: 16, priority: 15 }
    ],
    visual: { kind: 'tint', color: '#8b4513', intensity: 0.6, speed: 1.0, size: 1.0 }
  },
  'Heroism': {
    name: 'Heroism',
    icon: `/10.png`,
    description: 'Imune à condição Amedrontado (Frightened) e ganha Pontos de Vida Temporários.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'heroism',
    removeOnCombatEnd: true,
    changes: [
      { key: 'resources.health.temp', mode: 'add', value: 5, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ff69b4', intensity: 0.7, speed: 1.0, size: 1.2 }
  },
  'Aid': {
    name: 'Aid',
    icon: `/10.png`,
    description: '+5 no HP Máximo e pontos de vida atuais.',
    durationUnit: 'hours',
    duration: 8,
    conditionId: 'aid',
    removeOnCombatEnd: false,
    changes: [
      { key: 'resources.health.bonus', mode: 'add', value: 5, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#32cd32', intensity: 0.6, speed: 1.0, size: 1.2 }
  },
  'Longstrider': {
    name: 'Longstrider',
    icon: `/10.png`,
    description: '+10 pés (+3 metros) de velocidade de caminhada.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'longstrider',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.movement.walk', mode: 'add', value: 3, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#00fa9a', intensity: 0.5, speed: 1.2, size: 1.1 }
  },
  'Guidance': {
    name: 'Guidance',
    icon: `/10.png`,
    description: '+1d4 (+2.5) em um teste de perícia ou habilidade.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'guidance',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.prof.bonus', mode: 'add', value: 2.5, priority: 10 }
    ],
    visual: { kind: 'glow', color: '#ffdf00', intensity: 0.8, speed: 1.0, size: 1.2 }
  },
  'Resistance': {
    name: 'Resistance',
    icon: `/10.png`,
    description: '+1d4 (+2.5) em uma salvaguarda.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'resistance-spell',
    removeOnCombatEnd: true,
    changes: [
      { key: 'saves.str.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.dex.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.con.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.int.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.wis.misc', mode: 'add', value: 2.5, priority: 10 },
      { key: 'saves.cha.misc', mode: 'add', value: 2.5, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ffffff', intensity: 0.7, speed: 1.0, size: 1.2 }
  },
  'Silence': {
    name: 'Silence',
    icon: `/10.png`,
    description: 'Condição: Silenciado (Silenced). Nenhum som pode ser criado ou ouvido.',
    durationUnit: 'minutes',
    duration: 10,
    conditionId: 'silenced',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'aura', color: '#191970', intensity: 0.6, speed: 0.5, size: 1.5 }
  },
  'Death Ward': {
    name: 'Death Ward',
    icon: `/10.png`,
    description: 'Proteção contra a morte: a primeira vez que cair a 0 HP, cai a 1 HP em vez disso.',
    durationUnit: 'hours',
    duration: 8,
    conditionId: 'death-ward',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'aura', color: '#ffd700', intensity: 0.7, speed: 0.8, size: 1.2 }
  },
  'Foresight': {
    name: 'Foresight',
    icon: `/10.png`,
    description: 'Previsão: Vantagem em todas jogadas de ataque, testes e salvaguardas. Desvantagem contra.',
    durationUnit: 'hours',
    duration: 8,
    conditionId: 'foresight',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: 4, priority: 10 },
      { key: 'attributes.da.bonus', mode: 'add', value: 4, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#9370db', intensity: 0.9, speed: 1.5, size: 1.5 }
  },
  'True Seeing': {
    name: 'True Seeing',
    icon: `/10.png`,
    description: 'Visão Verdadeira: Enxerga no escuro, ilusões, formato original e plano etéreo.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'true-seeing',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'glow', color: '#00ffff', intensity: 0.9, speed: 1.0, size: 1.2 }
  },
  'Stoneskin': {
    name: 'Stoneskin',
    icon: `/10.png`,
    description: 'Pele de Pedra: Resistência a dano não mágico de concussão, perfuração e corte.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'stoneskin',
    removeOnCombatEnd: true,
    changes: [],
    visual: { kind: 'tint', color: '#708090', intensity: 0.7, speed: 1.0, size: 1.0 }
  },
  'Spider Climb': {
    name: 'Spider Climb',
    icon: `/10.png`,
    description: 'Escalar como Aranha: Deslocamento de escalada igual ao deslocamento de caminhada.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'spider-climb',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'tint', color: '#2f4f4f', intensity: 0.5, speed: 1.0, size: 1.0 }
  },
  'Water Breathing': {
    name: 'Water Breathing',
    icon: `/10.png`,
    description: 'Respiração Aquática: Capacidade de respirar debaixo d’água.',
    durationUnit: 'hours',
    duration: 24,
    conditionId: 'water-breathing',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'aura', color: '#00bfff', intensity: 0.4, speed: 0.8, size: 1.1 }
  },
  'See Invisibility': {
    name: 'See Invisibility',
    icon: `/10.png`,
    description: 'Ver o Invisível: Enxerga criaturas e objetos invisíveis e o plano etéreo.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'see-invisibility',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'glow', color: '#00ced1', intensity: 0.7, speed: 1.0, size: 1.2 }
  }
};

const MAGIC_ITEM_EFFECTS = {
  'Potion of Speed': {
    name: 'Potion of Speed',
    icon: `/15.png`,
    description: 'Efeito de Velocidade (Haste): +2 na CA, dobro de movimento.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'haste',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 2, priority: 10 },
      { key: 'attributes.movement.walk', mode: 'multiply', value: 2, priority: 20 }
    ],
    visual: { kind: 'aura', color: '#ffff00', intensity: 0.8, speed: 2.0, size: 1.3 }
  },
  'Potion of Invisibility': {
    name: 'Potion of Invisibility',
    icon: `/15.png`,
    description: 'Condição: Invisível (Invisible). Duração de 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'invisible',
    removeOnCombatEnd: false,
    changes: [],
    visual: { kind: 'tint', color: '#00ffff', intensity: 0.4, speed: 1.0, size: 1.0 }
  },
  'Potion of Flying': {
    name: 'Potion of Flying',
    icon: `/15.png`,
    description: 'Deslocamento de voo igual ao deslocamento de caminhada por 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'flying',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.movement.fly', mode: 'override', value: 12, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#87cefa', intensity: 0.6, speed: 1.2, size: 1.2 }
  },
  'Potion of Giant Strength (Hill)': {
    name: 'Hill Giant Strength',
    icon: `/15.png`,
    description: 'Força torna-se 21 por 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'giant-strength',
    removeOnCombatEnd: false,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 21, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#b8860b', intensity: 0.7, speed: 1.0, size: 1.2 }
  },
  'Potion of Giant Strength (Frost or Stone)': {
    name: 'Frost/Stone Giant Strength',
    icon: `/15.png`,
    description: 'Força torna-se 23 por 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'giant-strength',
    removeOnCombatEnd: false,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 23, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#b0c4de', intensity: 0.7, speed: 1.0, size: 1.2 }
  },
  'Potion of Giant Strength (Fire)': {
    name: 'Fire Giant Strength',
    icon: `/15.png`,
    description: 'Força torna-se 25 por 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'giant-strength',
    removeOnCombatEnd: false,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 25, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ff4500', intensity: 0.8, speed: 1.2, size: 1.3 }
  },
  'Potion of Giant Strength (Cloud)': {
    name: 'Cloud Giant Strength',
    icon: `/15.png`,
    description: 'Força torna-se 27 por 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'giant-strength',
    removeOnCombatEnd: false,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 27, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#e6e6fa', intensity: 0.8, speed: 1.2, size: 1.3 }
  },
  'Potion of Giant Strength (Storm)': {
    name: 'Storm Giant Strength',
    icon: `/15.png`,
    description: 'Força torna-se 29 por 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'giant-strength',
    removeOnCombatEnd: false,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 29, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#1e90ff', intensity: 0.9, speed: 1.8, size: 1.4 }
  },
  'Potion of Heroism': {
    name: 'Heroism',
    icon: `/15.png`,
    description: 'Efeito de Bless (+1d4 em ataques e salvaguardas) e 10 HP Temporários por 1 hora.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'bless',
    removeOnCombatEnd: false,
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: 2.5, priority: 10 },
      { key: 'resources.health.temp', mode: 'add', value: 10, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ff1493', intensity: 0.8, speed: 1.0, size: 1.2 }
  },
  'Ring of Protection': {
    name: 'Ring of Protection',
    icon: `/30.png`,
    description: '+1 de bônus na Classe de Armadura e em todas as Salvaguardas.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'ring-of-protection',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.str.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.dex.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.con.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.int.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.wis.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.cha.misc', mode: 'add', value: 1, priority: 10 }
    ]
  },
  'Cloak of Protection': {
    name: 'Cloak of Protection',
    icon: `/30.png`,
    description: '+1 de bônus na Classe de Armadura e em todas as Salvaguardas.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'cloak-of-protection',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.str.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.dex.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.con.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.int.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.wis.misc', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.cha.misc', mode: 'add', value: 1, priority: 10 }
    ]
  },
  'Boots of Speed': {
    name: 'Boots of Speed',
    icon: `/30.png`,
    description: 'Ativação: Dobra o deslocamento de caminhada por até 10 minutos.',
    durationUnit: 'minutes',
    duration: 10,
    conditionId: 'boots-of-speed',
    removeOnCombatEnd: true,
    changes: [
      { key: 'attributes.movement.walk', mode: 'multiply', value: 2, priority: 20 }
    ],
    visual: { kind: 'aura', color: '#00ff7f', intensity: 0.7, speed: 2.0, size: 1.2 }
  },
  'Bracers of Defense': {
    name: 'Bracers of Defense',
    icon: `/30.png`,
    description: '+2 na Classe de Armadura enquanto não estiver usando armadura nem escudo.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'bracers-of-defense',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 2, priority: 10 }
    ]
  },
  'Amulet of Health': {
    name: 'Amulet of Health',
    icon: `/30.png`,
    description: 'Sua pontuação de Constituição torna-se 19.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'amulet-of-health',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.con.value', mode: 'override', value: 19, priority: 10 }
    ]
  },
  'Headband of Intellect': {
    name: 'Headband of Intellect',
    icon: `/30.png`,
    description: 'Sua pontuação de Inteligência torna-se 19.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'headband-of-intellect',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.int.value', mode: 'override', value: 19, priority: 10 }
    ]
  },
  'Gauntlets of Ogre Power': {
    name: 'Gauntlets of Ogre Power',
    icon: `/30.png`,
    description: 'Sua pontuação de Força torna-se 19.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'gauntlets-of-ogre-power',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 19, priority: 10 }
    ]
  },
  'Belt of Giant Strength (Hill)': {
    name: 'Belt of Hill Giant Strength',
    icon: `/30.png`,
    description: 'Sua pontuação de Força torna-se 21.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'belt-giant-strength',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 21, priority: 10 }
    ]
  },
  'Belt of Giant Strength (Frost or Stone)': {
    name: 'Belt of Frost/Stone Giant Strength',
    icon: `/30.png`,
    description: 'Sua pontuação de Força torna-se 23.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'belt-giant-strength',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 23, priority: 10 }
    ]
  },
  'Belt of Giant Strength (Fire)': {
    name: 'Belt of Fire Giant Strength',
    icon: `/30.png`,
    description: 'Sua pontuação de Força torna-se 25.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'belt-giant-strength',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 25, priority: 10 }
    ]
  },
  'Belt of Giant Strength (Cloud)': {
    name: 'Belt of Cloud Giant Strength',
    icon: `/30.png`,
    description: 'Sua pontuação de Força torna-se 27.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'belt-giant-strength',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 27, priority: 10 }
    ]
  },
  'Belt of Giant Strength (Storm)': {
    name: 'Belt of Storm Giant Strength',
    icon: `/30.png`,
    description: 'Sua pontuação de Força torna-se 29.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'belt-giant-strength',
    removeOnCombatEnd: false,
    transfer: true,
    changes: [
      { key: 'abilities.str.value', mode: 'override', value: 29, priority: 10 }
    ]
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Icon Mappers
// ──────────────────────────────────────────────────────────────────────────

const SUBCLASS_ICON_MAP = {
  'berserker': `${ASSET_PREFIX}/classes/berserker.webp`,
  'path of the berserker': `${ASSET_PREFIX}/classes/berserker.webp`,
  'champion': `${ASSET_PREFIX}/classes/champion.webp`,
  'college of lore': `${ASSET_PREFIX}/classes/lore.webp`,
  'lore': `${ASSET_PREFIX}/classes/lore.webp`,
  'circle of the land': `${ASSET_PREFIX}/classes/land.webp`,
  'land': `${ASSET_PREFIX}/classes/land.webp`,
  'life domain': `${ASSET_PREFIX}/classes/life.webp`,
  'life': `${ASSET_PREFIX}/classes/life.webp`,
  'oath of devotion': `${ASSET_PREFIX}/classes/devotion.webp`,
  'devotion': `${ASSET_PREFIX}/classes/devotion.webp`,
  'hunter': `${ASSET_PREFIX}/classes/hunter.webp`,
  'thief': `${ASSET_PREFIX}/classes/thief.webp`,
  'draconic sorcery': `${ASSET_PREFIX}/classes/draconic.webp`,
  'draconic': `${ASSET_PREFIX}/classes/draconic.webp`,
  'the fiend': `${ASSET_PREFIX}/classes/fiend.webp`,
  'fiend': `${ASSET_PREFIX}/classes/fiend.webp`,
  'school of evocation': `${ASSET_PREFIX}/classes/evoker.webp`,
  'evoker': `${ASSET_PREFIX}/classes/evoker.webp`,
  'warrior of the open hand': `${ASSET_PREFIX}/classes/open-hand.webp`,
  'open hand': `${ASSET_PREFIX}/classes/open-hand.webp`,
};

const SPECIES_ICON_MAP = {
  'dragonborn': `${ASSET_PREFIX}/species/dragonborn.webp`,
  'dwarf': `${ASSET_PREFIX}/species/dwarf.webp`,
  'hill dwarf': `${ASSET_PREFIX}/species/dwarf.webp`,
  'mountain dwarf': `${ASSET_PREFIX}/species/dwarf.webp`,
  'elf': `${ASSET_PREFIX}/species/elf-high.webp`,
  'high elf': `${ASSET_PREFIX}/species/elf-high.webp`,
  'wood elf': `${ASSET_PREFIX}/species/elf-wood.webp`,
  'drow': `${ASSET_PREFIX}/species/drow.webp`,
  'gnome': `${ASSET_PREFIX}/species/gnome-forest.webp`,
  'forest gnome': `${ASSET_PREFIX}/species/gnome-forest.webp`,
  'rock gnome': `${ASSET_PREFIX}/species/gnome-rock.webp`,
  'goliath': `${ASSET_PREFIX}/species/goliath.webp`,
  'halfling': `${ASSET_PREFIX}/species/halfling.webp`,
  'lightfoot halfling': `${ASSET_PREFIX}/species/halfling.webp`,
  'stout halfling': `${ASSET_PREFIX}/species/halfling.webp`,
  'human': `${ASSET_PREFIX}/species/human.webp`,
  'orc': `${ASSET_PREFIX}/species/orc.webp`,
  'tiefling': `${ASSET_PREFIX}/species/tiefling-infernal.webp`,
  'abyssal tiefling': `${ASSET_PREFIX}/species/tiefling-abyssal.webp`,
  'chthonic tiefling': `${ASSET_PREFIX}/species/tiefling-chthonic.webp`,
  'infernal tiefling': `${ASSET_PREFIX}/species/tiefling-infernal.webp`
};

function getSpellIcon(name, school, level) {
  const n = (name || '').toLowerCase();
  if (n.includes('fire') || n.includes('flame') || n.includes('burn') || n.includes('scorch') || n.includes('heat') || n.includes('sunburst')) {
    return `${ASSET_PREFIX}/1.png`;
  }
  if (n.includes('lightning') || n.includes('shock') || n.includes('thunder') || n.includes('spark') || n.includes('storm')) {
    return `${ASSET_PREFIX}/2.png`;
  }
  if (n.includes('frost') || n.includes('ice') || n.includes('cold') || n.includes('chill') || n.includes('blizzard')) {
    return `${ASSET_PREFIX}/3.png`;
  }
  if (n.includes('cure') || n.includes('heal') || n.includes('word') || n.includes('reviv') || n.includes('aid') || n.includes('bless') || n.includes('restoration') || n.includes('vitality') || n.includes('prayer')) {
    return `${ASSET_PREFIX}/4.png`;
  }
  if (n.includes('blind') || n.includes('deaf') || n.includes('death') || n.includes('necro') || n.includes('dark') || n.includes('blight') || n.includes('curse') || n.includes('doom') || n.includes('bane')) {
    return `${ASSET_PREFIX}/5.png`;
  }
  if (n.includes('shield') || n.includes('armor') || n.includes('protect') || n.includes('ward') || n.includes('barkskin') || n.includes('stoneskin') || n.includes('sanctuary')) {
    return `${ASSET_PREFIX}/10.png`;
  }
  if (n.includes('summon') || n.includes('conjure') || n.includes('familiar') || n.includes('steed') || n.includes('elemental') || n.includes('gate') || n.includes('teleport')) {
    return `${ASSET_PREFIX}/11.png`;
  }
  if (n.includes('invisib') || n.includes('charm') || n.includes('sleep') || n.includes('hold') || n.includes('illusion') || n.includes('mirror') || n.includes('blur') || n.includes('mind') || n.includes('detect') || n.includes('see') || n.includes('command')) {
    return `${ASSET_PREFIX}/12.png`;
  }
  if (n.includes('poison') || n.includes('acid') || n.includes('sick') || n.includes('cloudkill') || n.includes('pestilence') || n.includes('grease') || n.includes('web')) {
    return `${ASSET_PREFIX}/13.png`;
  }
  if (n.includes('fly') || n.includes('haste') || n.includes('speed') || n.includes('jump') || n.includes('longstrider') || n.includes('feather') || n.includes('levitate') || n.includes('expeditious') || n.includes('stride')) {
    return `${ASSET_PREFIX}/14.png`;
  }
  const circle = Number(level) || 0;
  if (circle >= 1 && circle <= 9) {
    return `${ASSET_PREFIX}/spell-tiers/spell${circle}.webp`;
  }
  return `${ASSET_PREFIX}/spell-tiers/spell1.webp`;
}

function getItemIcon(name, type, data = {}) {
  const n = (name || '').toLowerCase();
  const t = (type || data.type || '').toLowerCase();
  if (t.includes('potion') || data.consumableType === 'potion' || n.includes('potion') || n.includes('elixir') || n.includes('oil')) {
    return `${ASSET_PREFIX}/15.png`;
  }
  if (t === 'weapon' || n.includes('sword') || n.includes('dagger') || n.includes('bow') || n.includes('axe') || n.includes('spear') || n.includes('mace') || n.includes('blade') || n.includes('hammer') || n.includes('crossbow') || n.includes('glaive') || n.includes('halberd') || n.includes('flail')) {
    return `${ASSET_PREFIX}/20.png`;
  }
  if (t === 'armor' || n.includes('armor') || n.includes('shield') || n.includes('plate') || n.includes('mail') || n.includes('leather') || n.includes('padded') || n.includes('hide')) {
    return `${ASSET_PREFIX}/25.png`;
  }
  if (n.includes('ring') || n.includes('amulet') || n.includes('cloak') || n.includes('cape') || n.includes('robe') || n.includes('belt') || n.includes('bracers') || n.includes('headband') || n.includes('circlet') || n.includes('periapt') || n.includes('necklace')) {
    return `${ASSET_PREFIX}/30.png`;
  }
  if (n.includes('scroll') || n.includes('book') || n.includes('tome') || n.includes('manual') || n.includes('grimoire')) {
    return `${ASSET_PREFIX}/35.png`;
  }
  if (n.includes('boot') || n.includes('shoe') || n.includes('slipper')) {
    return `${ASSET_PREFIX}/14.png`;
  }
  if (n.includes('staff') || n.includes('wand') || n.includes('rod')) {
    return `${ASSET_PREFIX}/11.png`;
  }
  return `${ASSET_PREFIX}/40.png`;
}

function setPackMetaType(json, expectedType) {
  const packMetaTable = json.tables?.find((t) => t.name === 'pack_meta');
  if (packMetaTable && packMetaTable.rows?.length) {
    packMetaTable.rows[0].type = expectedType;
  }
}

export async function enrichPacks() {
  console.log('--- Starting Pack Enrichment ---');

  // 1. Classes
  {
    const filePath = path.join(sourceRoot, 'classes.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const id = data.classIdentifier || row.name.toLowerCase();
      row.imgUrl = `${ASSET_PREFIX}/classes/${id}.webp`;
      data.imgUrl = row.imgUrl;
      data.type = 'class';
      data.itemType = 'class';
      row.type = 'class';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched classes.json (${json.tables[0].rows.length} rows)`);
  }

  // 2. Subclasses
  {
    const filePath = path.join(sourceRoot, 'subclasses.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const nameKey = row.name.toLowerCase();
      const icon = SUBCLASS_ICON_MAP[nameKey] || `${ASSET_PREFIX}/classes/${data.classIdentifier || 'fighter'}.webp`;
      row.imgUrl = icon;
      data.imgUrl = icon;
      data.type = 'subclass';
      data.itemType = 'subclass';
      row.type = 'subclass';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched subclasses.json (${json.tables[0].rows.length} rows)`);
  }

  // 3. Races / Species
  {
    const filePath = path.join(sourceRoot, 'races.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const nameKey = row.name.toLowerCase();
      const icon = SPECIES_ICON_MAP[nameKey] || `${ASSET_PREFIX}/species/human.webp`;
      row.imgUrl = icon;
      data.imgUrl = icon;
      data.type = 'race';
      data.itemType = 'race';
      row.type = 'race';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched races.json (${json.tables[0].rows.length} rows)`);
  }

  // 4. Backgrounds
  {
    const filePath = path.join(sourceRoot, 'backgrounds.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const nameKey = row.name.toLowerCase();
      const icon = `${ASSET_PREFIX}/backgrounds/${nameKey}.webp`;
      row.imgUrl = icon;
      data.imgUrl = icon;
      data.type = 'background';
      data.itemType = 'background';
      row.type = 'background';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched backgrounds.json (${json.tables[0].rows.length} rows)`);
  }

  // 5. Feats
  {
    const filePath = path.join(sourceRoot, 'feats.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const isAsi = row.name.toLowerCase().includes('ability score');
      const icon = isAsi ? `${ASSET_PREFIX}/svg/ability-score-improvement.svg` : `/10.png`;
      row.imgUrl = icon;
      data.imgUrl = icon;
      data.type = 'feat';
      data.itemType = 'feat';
      row.type = 'feat';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched feats.json (${json.tables[0].rows.length} rows)`);
  }

  // 6. Features
  {
    const filePath = path.join(sourceRoot, 'features.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const classId = data.classIdentifier;
      const icon = classId ? `${ASSET_PREFIX}/classes/${classId}.webp` : `${ASSET_PREFIX}/10.png`;
      row.imgUrl = icon;
      data.imgUrl = icon;
      data.type = 'feature';
      data.itemType = 'feature';
      row.type = 'feature';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched features.json (${json.tables[0].rows.length} rows)`);
  }

  // 7. Spells (Icons + Active Effects)
  {
    const filePath = path.join(sourceRoot, 'spells.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    let spellEffectsAdded = 0;

    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const school = (data.school || '').toLowerCase();
      row.imgUrl = getSpellIcon(row.name, school, data.level);
      data.imgUrl = row.imgUrl;
      data.type = 'spell';
      data.itemType = 'spell';
      row.type = 'spell';

      // Active Effects injection
      const effectDef = SPELL_EFFECTS[row.name];
      if (effectDef) {
        data.effects = [{
          ...effectDef,
          icon: row.imgUrl
        }];
        spellEffectsAdded++;
      }

      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched spells.json (${json.tables[0].rows.length} rows, ${spellEffectsAdded} Active Effects assigned)`);
  }

  // 8. Magic Items & Equipment (Icons + Active Effects)
  {
    const filePath = path.join(sourceRoot, 'magic-items.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Item');
    let itemEffectsAdded = 0;

    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      const subType = (data.type || row.type || 'item').toLowerCase();
      const name = row.name;

      const icon = getItemIcon(name, subType, data);
      row.imgUrl = icon;
      data.imgUrl = icon;
      data.type = subType;
      data.itemType = subType;
      row.type = subType;

      // Active Effects injection
      const effectDef = MAGIC_ITEM_EFFECTS[name];
      if (effectDef) {
        data.effects = [{
          ...effectDef,
          icon: row.imgUrl
        }];
        itemEffectsAdded++;
      } else if (name.includes('+1') || name.includes('+2') || name.includes('+3')) {
        const bonusMatch = name.match(/\+([123])/);
        const bonus = bonusMatch ? Number(bonusMatch[1]) : 1;
        if (subType === 'weapon') {
          data.effects = [{
            name: `${name} Bonus`,
            icon,
            description: `+${bonus} de bônus em jogadas de ataque e dano.`,
            durationUnit: 'permanent',
            duration: -1,
            conditionId: `magic-weapon-plus-${bonus}`,
            transfer: true,
            changes: [
              { key: 'attributes.meleeBonus', mode: 'add', value: bonus, priority: 10 },
              { key: 'attributes.rangedBonus', mode: 'add', value: bonus, priority: 10 }
            ]
          }];
          itemEffectsAdded++;
        } else if (subType === 'armor' || name.toLowerCase().includes('shield') || name.toLowerCase().includes('armor')) {
          data.effects = [{
            name: `${name} Bonus`,
            icon,
            description: `+${bonus} de bônus na Classe de Armadura (AC).`,
            durationUnit: 'permanent',
            duration: -1,
            conditionId: `magic-armor-plus-${bonus}`,
            transfer: true,
            changes: [
              { key: 'attributes.da.bonus', mode: 'add', value: bonus, priority: 10 }
            ]
          }];
          itemEffectsAdded++;
        }
      }

      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched magic-items.json (${json.tables[0].rows.length} rows, ${itemEffectsAdded} Active Effects assigned)`);
  }

  // 9. Monsters / NPCs
  {
    const filePath = path.join(sourceRoot, 'monsters.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Actor');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      data.type = 'npc';
      data.actorType = 'npc';
      row.type = 'npc';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched monsters.json (${json.tables[0].rows.length} rows)`);
  }

  // 10. Vehicles
  {
    const filePath = path.join(sourceRoot, 'vehicles.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'Actor');
    for (const row of json.tables[0].rows) {
      const data = JSON.parse(row.data || '{}');
      data.type = 'vehicle';
      data.actorType = 'vehicle';
      row.type = 'vehicle';
      row.data = JSON.stringify(data);
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched vehicles.json (${json.tables[0].rows.length} rows)`);
  }

  // 11. Journal / Rules
  {
    const filePath = path.join(sourceRoot, 'journal.json');
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    setPackMetaType(json, 'JournalEntry');
    for (const row of json.tables[0].rows) {
      row.type = 'JournalEntry';
    }
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched journal.json (${json.tables[0].rows.length} rows)`);
  }

  console.log('--- Pack Enrichment Complete ---');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await enrichPacks();
}
