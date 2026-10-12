// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/active-effects-helper.mjs
// Component Version: 0.1.0
// Central manager for 5e Status Conditions & Loom Active Effects
// Works on Character, NPC, Group, and other actor sheets.
// ══════════════════════════════════════════════════════════════════════════

import { effects, api, LoomDialog, showToast } from '/_loom/sdk/index.js';

export const ALL_CONDITIONS_LIST = [
  { id: 'blinded', label: 'Blinded', icon: 'fas fa-eye-slash', color: '#888888', description: 'Ataques contra têm vantagem; ataques próprios têm desvantagem. Falha em testes de visão.' },
  { id: 'charmed', label: 'Charmed', icon: 'fas fa-heart', color: '#e91e8c', description: 'Não pode ferir quem enfeitiçou. Quem enfeitiçou tem vantagem em testes sociais.' },
  { id: 'deafened', label: 'Deafened', icon: 'fas fa-ear-deaf', color: '#8a8a8a', description: 'Não ouve nada. Falha automática em testes que exigem audição.' },
  { id: 'frightened', label: 'Frightened', icon: 'fas fa-ghost', color: '#9b59b6', description: 'Desvantagem em testes e ataques enquanto a fonte do medo estiver visível. Não pode se aproximar.' },
  { id: 'grappled', label: 'Grappled', icon: 'fas fa-hand-rock', color: '#a0522d', description: 'Velocidade cai para 0 e não se beneficia de bônus de deslocamento.' },
  { id: 'incapacitated', label: 'Incapacitated', icon: 'fas fa-bolt', color: '#607d8b', description: 'Não pode realizar ações nem reações. Concentração é interrompida.' },
  { id: 'invisible', label: 'Invisible', icon: 'fas fa-eye', color: '#00bcd4', description: 'Impossível de ver sem sentidos especiais. Ataques próprios têm vantagem; contra têm desvantagem.' },
  { id: 'paralyzed', label: 'Paralyzed', icon: 'fas fa-hand', color: '#ffc107', description: 'Incapacitado e não pode se mover. Falha em salvaguardas de For/Des. Ataques a 1,5m são críticos.' },
  { id: 'petrified', label: 'Petrified', icon: 'fas fa-monument', color: '#9e9e9e', description: 'Transformado em pedra. Incapacitado, resistência a todo dano, imune a veneno.' },
  { id: 'poisoned', label: 'Poisoned', icon: 'fas fa-biohazard', color: '#4caf50', description: 'Desvantagem em jogadas de ataque e testes de habilidade.' },
  { id: 'prone', label: 'Prone', icon: 'fas fa-person-falling', color: '#ff5722', description: 'Caído no chão. Ataques próprios têm desvantagem. Ataques a 1,5m têm vantagem; à distância têm desvantagem.' },
  { id: 'restrained', label: 'Restrained', icon: 'fas fa-link', color: '#8b4513', description: 'Velocidade 0. Ataques contra têm vantagem; ataques próprios têm desvantagem. Desvantagem em salvaguardas de Des.' },
  { id: 'stunned', label: 'Stunned', icon: 'fas fa-dizzy', color: '#ff9800', description: 'Incapacitado, fala com dificuldade. Falha em salvaguardas de For/Des. Ataques contra têm vantagem.' },
  { id: 'unconscious', label: 'Unconscious', icon: 'fas fa-bed', color: '#1a1614', description: 'Incapacitado, cai no chão. Falha em salvaguardas de For/Des. Ataques a 1,5m são críticos.' },
  { id: 'exhaustion', label: 'Exhaustion', icon: 'fas fa-battery-quarter', color: '#b22222', description: 'Penalidade cumulativa em testes d20 e redução de velocidade de movimento.' },
  { id: 'concentrating', label: 'Concentrating', icon: 'fas fa-brain', color: '#3f51b5', description: 'Mantendo concentração em magia ou efeito mágico ativo.' },
  { id: 'cover-half', label: 'Half Cover', icon: 'fas fa-shield-alt', color: '#4a90d9', description: 'Bônus de +2 na Classe de Armadura e em salvaguardas de Destreza.' },
  { id: 'cover-3q', label: '3/4 Cover', icon: 'fas fa-shield', color: '#2c5f8a', description: 'Bônus de +5 na Classe de Armadura e em salvaguardas de Destreza.' },
];

export const BUFF_PRESETS = [
  {
    id: 'bless',
    name: 'Bless',
    icon: 'fas fa-magic',
    duration: 10,
    description: '+1d4 em jogadas de ataque e salvaguardas',
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: 2.5 },
      { key: 'saves.str.misc', mode: 'add', value: 2.5 },
      { key: 'saves.dex.misc', mode: 'add', value: 2.5 },
      { key: 'saves.con.misc', mode: 'add', value: 2.5 },
      { key: 'saves.int.misc', mode: 'add', value: 2.5 },
      { key: 'saves.wis.misc', mode: 'add', value: 2.5 },
      { key: 'saves.cha.misc', mode: 'add', value: 2.5 },
    ],
  },
  {
    id: 'bane',
    name: 'Bane',
    icon: 'fas fa-skull',
    duration: 10,
    description: '-1d4 em jogadas de ataque e salvaguardas',
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: -2.5 },
      { key: 'saves.str.misc', mode: 'add', value: -2.5 },
      { key: 'saves.dex.misc', mode: 'add', value: -2.5 },
      { key: 'saves.con.misc', mode: 'add', value: -2.5 },
      { key: 'saves.int.misc', mode: 'add', value: -2.5 },
      { key: 'saves.wis.misc', mode: 'add', value: -2.5 },
      { key: 'saves.cha.misc', mode: 'add', value: -2.5 },
    ],
  },
  {
    id: 'shield',
    name: 'Shield',
    icon: 'fas fa-shield-alt',
    duration: 1,
    description: '+5 de Classe de Armadura (AC)',
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 5 },
    ],
  },
  {
    id: 'haste',
    name: 'Haste',
    icon: 'fas fa-bolt',
    duration: 10,
    description: '+2 AC, vantagem em Des, dobro de movimento',
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 2 },
    ],
  },
  {
    id: 'heroism',
    name: 'Heroism',
    icon: 'fas fa-heart-pulse',
    duration: 10,
    description: 'Pontos de Vida Temporários adicionais',
    changes: [
      { key: 'resources.health.temp', mode: 'add', value: 5 },
    ],
  },
  {
    id: 'mage-armor',
    name: 'Mage Armor',
    icon: 'fas fa-vest',
    duration: 480,
    description: 'Armadura Arcana base AC 13 + Mod de Destreza',
    changes: [
      { key: 'attributes.da.base', mode: 'add', value: 3 },
    ],
  },
  {
    id: 'guidance',
    name: 'Guidance',
    icon: 'fas fa-compass',
    duration: 10,
    description: '+1d4 em um teste de perícia/habilidade',
    changes: [
      { key: 'attributes.prof.bonus', mode: 'add', value: 2.5 },
    ],
  },
];

const CHANGE_KEY_LABELS = {
  'attributes.da.bonus': 'AC Bônus',
  'attributes.da.base': 'Base AC',
  'attributes.attackBonus': 'Jogada de Ataque',
  'attributes.meleeBonus': 'Ataque Corpo-a-Corpo',
  'attributes.rangedBonus': 'Ataque à Distância',
  'attributes.prof.bonus': 'Bônus de Proficiência',
  'resources.health.bonus': 'HP Máximo',
  'resources.health.temp': 'HP Temporário',
  'attributes.movement.walk': 'Deslocamento',
  'attributes.initiative.bonus': 'Iniciativa',
  'saves.str.misc': 'Salvaguarda FOR',
  'saves.dex.misc': 'Salvaguarda DES',
  'saves.con.misc': 'Salvaguarda CON',
  'saves.int.misc': 'Salvaguarda INT',
  'saves.wis.misc': 'Salvaguarda SAB',
  'saves.cha.misc': 'Salvaguarda CAR',
};

export function formatChangesSummary(changes) {
  if (!Array.isArray(changes) || !changes.length) return '';
  return changes.map((c) => {
    const label = CHANGE_KEY_LABELS[c.key] || c.key;
    const sign = Number(c.value) >= 0 ? '+' : '';
    return `${label}: ${sign}${c.value}`;
  }).join(' • ');
}

/** Prepara a lista de efeitos e condições para qualquer ficha */
export async function getEffectsSheetData(actor) {
  if (!actor?.id) return { _allConditions: ALL_CONDITIONS_LIST, _activeConditions: [], _buffPresets: BUFF_PRESETS, _effects: [] };

  const sd = actor.systemData || {};
  const currentConditions = Array.isArray(sd.conditions) ? sd.conditions : [];

  const _allConditions = ALL_CONDITIONS_LIST.map((c) => ({
    ...c,
    active: currentConditions.includes(c.id),
  }));

  const _activeConditions = _allConditions.filter((c) => c.active);

  let rawEffects = [];
  try {
    rawEffects = await effects.forActor(actor.id);
  } catch (e) {
    console.error('[srd5e] Error fetching actor effects:', e);
  }

  const _effects = (rawEffects || []).map((e) => ({
    ...e,
    durationLabel: e.duration === undefined || e.duration < 0 ? 'Permanente' : `${e.duration} rodada${e.duration === 1 ? '' : 's'}`,
    changesSummary: formatChangesSummary(e.changes),
  }));

  return {
    _allConditions,
    _activeConditions,
    _buffPresets: BUFF_PRESETS,
    _effects,
  };
}

/** Alterna uma condição no ator e sincroniza com tokens do mundo */
export async function toggleActorCondition(actor, conditionId) {
  if (!actor?.id || !conditionId) return;
  const sd = actor.systemData || {};
  const current = new Set(Array.isArray(sd.conditions) ? sd.conditions : []);

  if (current.has(conditionId)) {
    current.delete(conditionId);
  } else {
    current.add(conditionId);
  }

  const updatedConditions = Array.from(current);
  await api.put(`/actors/${actor.id}`, {
    systemData: {
      ...sd,
      conditions: updatedConditions,
    },
  });

  // Sincroniza tokens no mapa
  try {
    const worldId = window.Loom?.world?.id;
    if (worldId) {
      const casts = await api.get(`/cast?worldId=${worldId}`);
      if (Array.isArray(casts)) {
        for (const cast of casts) {
          if (cast.actorId === actor.id) {
            await api.put(`/cast/${cast.id}`, { statusMarkers: updatedConditions });
          }
        }
      }
    }
  } catch (e) {
    console.error('[srd5e] Failed to sync token status markers:', e);
  }
}

/** Limpa todas as condições ativas do ator */
export async function clearAllActorConditions(actor) {
  if (!actor?.id) return;
  const sd = actor.systemData || {};
  await api.put(`/actors/${actor.id}`, {
    systemData: {
      ...sd,
      conditions: [],
    },
  });

  try {
    const worldId = window.Loom?.world?.id;
    if (worldId) {
      const casts = await api.get(`/cast?worldId=${worldId}`);
      if (Array.isArray(casts)) {
        for (const cast of casts) {
          if (cast.actorId === actor.id) {
            await api.put(`/cast/${cast.id}`, { statusMarkers: [] });
          }
        }
      }
    }
  } catch (e) {
    console.error('[srd5e] Failed to clear token status markers:', e);
  }
}

/** Aplica um preset de magia/buff no ator */
export async function applyBuffPresetToActor(actor, presetId) {
  if (!actor?.id) return;
  const preset = BUFF_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;

  await effects.create({
    actorId: actor.id,
    name: preset.name,
    origin: preset.id,
    duration: preset.duration,
    changes: preset.changes,
  });

  showToast?.(`Efeito "${preset.name}" aplicado!`, { type: 'success' });
}

/** Exclui um efeito ativo */
export async function deleteActiveEffect(effectId) {
  if (!effectId) return;
  await effects.delete(effectId);
}

/** Pausa ou despausa um efeito ativo */
export async function toggleEffectDisabled(effectId, currentDisabled) {
  if (!effectId) return;
  await effects.update(effectId, { disabled: !currentDisabled });
}

/** Abre diálogo para criar um efeito personalizado */
export async function promptCreateCustomEffect(actor, onCreated) {
  if (!actor?.id) return;

  const html = `
    <div style="display:flex; flex-direction:column; gap:10px; padding:8px 4px; font-size:12px; color:#e8d8b8;">
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-weight:700; color:#b8923a;">Nome do Efeito:</span>
        <input type="text" id="custom-effect-name" placeholder="ex: Escudo da Fé, Fúria, etc." style="background:#14120f; border:1px solid #b8923a; color:#fff; padding:6px; border-radius:4px;" />
      </label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <label style="display:flex; flex-direction:column; gap:4px;">
          <span style="font-weight:700; color:#b8923a;">Duração (rodadas):</span>
          <input type="number" id="custom-effect-duration" value="10" placeholder="-1 para permanente" style="background:#14120f; border:1px solid #b8923a; color:#fff; padding:6px; border-radius:4px;" />
        </label>
        <label style="display:flex; flex-direction:column; gap:4px;">
          <span style="font-weight:700; color:#b8923a;">Modificador/Bônus:</span>
          <input type="number" id="custom-effect-value" value="2" style="background:#14120f; border:1px solid #b8923a; color:#fff; padding:6px; border-radius:4px;" />
        </label>
      </div>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-weight:700; color:#b8923a;">Atributo Afetado:</span>
        <select id="custom-effect-key" style="background:#14120f; border:1px solid #b8923a; color:#fff; padding:6px; border-radius:4px;">
          <option value="attributes.da.bonus">Classe de Armadura (AC)</option>
          <option value="attributes.attackBonus">Jogada de Ataque (Geral)</option>
          <option value="resources.health.bonus">HP Máximo</option>
          <option value="resources.health.temp">HP Temporário</option>
          <option value="attributes.movement.walk">Deslocamento (m)</option>
          <option value="attributes.initiative.bonus">Iniciativa</option>
          <option value="saves.str.misc">Salvaguarda: Força</option>
          <option value="saves.dex.misc">Salvaguarda: Destreza</option>
          <option value="saves.con.misc">Salvaguarda: Constituição</option>
          <option value="saves.int.misc">Salvaguarda: Inteligência</option>
          <option value="saves.wis.misc">Salvaguarda: Sabedoria</option>
          <option value="saves.cha.misc">Salvaguarda: Carisma</option>
        </select>
      </label>
    </div>
  `;

  if (typeof LoomDialog?.confirm === 'function') {
    const confirmed = await LoomDialog.confirm({
      title: 'Novo Efeito Ativo',
      content: html,
      confirmLabel: 'Criar Efeito',
      cancelLabel: 'Cancelar',
    });

    if (confirmed) {
      const name = document.getElementById('custom-effect-name')?.value?.trim() || 'Novo Efeito';
      const duration = Number(document.getElementById('custom-effect-duration')?.value) || -1;
      const key = document.getElementById('custom-effect-key')?.value || 'attributes.da.bonus';
      const value = Number(document.getElementById('custom-effect-value')?.value) || 1;

      await effects.create({
        actorId: actor.id,
        name,
        duration,
        changes: [{ key, mode: 'add', value }],
      });

      showToast?.(`Efeito "${name}" criado com sucesso!`, { type: 'success' });
      if (typeof onCreated === 'function') onCreated();
    }
  } else {
    // Fallback nativo
    const name = window.prompt('Nome do Efeito:', 'Novo Efeito');
    if (!name) return;
    const value = Number(window.prompt('Valor do Bônus na AC:', '2')) || 2;
    await effects.create({
      actorId: actor.id,
      name,
      duration: 10,
      changes: [{ key: 'attributes.da.bonus', mode: 'add', value }],
    });
    if (typeof onCreated === 'function') onCreated();
  }
}
