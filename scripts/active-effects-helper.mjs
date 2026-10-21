// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/active-effects-helper.mjs
// Component Version: 0.1.0
// Central manager for 5e Status Conditions & Loom Active Effects
// Works on Character, NPC, Group, and other actor sheets.
// ══════════════════════════════════════════════════════════════════════════

import { effects, api, LoomDialog, showToast } from '/_loom/sdk/index.js';

export const ALL_CONDITIONS_LIST = [
  { id: 'blinded', label: 'Blinded', icon: 'fas fa-eye-slash', color: '#888888', description: 'Ataques contra têm vantagem; ataques próprios têm desvantagem. Falha em testes de visão. Tira a visão do token.' },
  { id: 'poisoned', label: 'Poisoned', icon: 'fas fa-biohazard', color: '#4caf50', description: 'Desvantagem em jogadas de ataque e testes de habilidade. Emite fumaça verde.' },
  { id: 'stunned', label: 'Stunned', icon: 'fas fa-dizzy', color: '#ffd23f', description: 'Incapacitado, fala com dificuldade. Falha em salvaguardas de For/Des. Ataques contra têm vantagem. Faíscas amarelas.' },
  { id: 'prone', label: 'Prone', icon: 'fas fa-person-falling', color: '#8b4513', description: 'Caído no chão. Ataques próprios têm desvantagem. Ataques a 1,5m têm vantagem; à distância têm desvantagem.' },
  { id: 'invisible', label: 'Invisible', icon: 'fas fa-eye', color: '#9370db', description: 'Impossível de ver sem sentidos especiais. Ataques próprios têm vantagem; contra têm desvantagem. Aura translúcida.' },
  { id: 'restrained', label: 'Restrained', icon: 'fas fa-link', color: '#8b93a1', description: 'Velocidade 0. Ataques contra têm vantagem; ataques próprios têm desvantagem. Desvantagem em salvaguardas de Des.' },
  { id: 'frightened', label: 'Frightened', icon: 'fas fa-ghost', color: '#8e44ad', description: 'Desvantagem em testes e ataques enquanto a fonte do medo estiver visível. Não pode se aproximar. Gotas roxas.' },
  { id: 'grappled', label: 'Grappled', icon: 'fas fa-hand-rock', color: '#c0392b', description: 'Velocidade cai para 0 e não se beneficia de bônus de deslocamento. Brilho avermelhado.' },
  { id: 'unconscious', label: 'Unconscious', icon: 'fas fa-bed', color: '#8fb3ff', description: 'Incapacitado, cai no chão. Falha em salvaguardas de For/Des. Ataques a 1,5m são críticos. Letras Z subindo.' },
  { id: 'burning', label: 'Burning', icon: 'fas fa-fire', color: '#ff7a1a', description: 'Em chamas: sofre dano de fogo recorrente. Partículas de brasas ardentes.' },
  { id: 'paralyzed', label: 'Paralyzed', icon: 'fas fa-hand', color: '#2c8fbf', description: 'Incapacitado e não pode se mover. Falha em salvaguardas de For/Des. Ataques a 1,5m são críticos. Faíscas azuis.' },
  { id: 'deafened', label: 'Deafened', icon: 'fas fa-ear-deaf', color: '#aab7b8', description: 'Não ouve nada. Falha automática em testes que exigem audição. Bolhas prateadas.' },
  { id: 'charmed', label: 'Charmed', icon: 'fas fa-heart', color: '#ff5fa2', description: 'Não pode ferir quem enfeitiçou. Quem enfeitiçou tem vantagem em testes sociais. Corações flutuantes.' },
  { id: 'incapacitated', label: 'Incapacitated', icon: 'fas fa-bolt', color: '#95a5a6', description: 'Não pode realizar ações nem reações. Concentração é interrompida.' },
  { id: 'dead', label: 'Dead', icon: 'fas fa-skull', color: '#222222', description: 'Morto: personagem sem vida. Silhueta escurecida.' },
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
    durationUnit: 'minutes',
    duration: 1,
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
    visual: { kind: 'aura', color: '#ffd700', intensity: 0.8, speed: 1.2, size: 1.3 },
  },
  {
    id: 'bane',
    name: 'Bane',
    icon: 'fas fa-skull',
    durationUnit: 'minutes',
    duration: 1,
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
    visual: { kind: 'aura', color: '#8e44ad', intensity: 0.7, speed: 0.8, size: 1.2 },
  },
  {
    id: 'shield',
    name: 'Shield',
    icon: 'fas fa-shield-alt',
    durationUnit: 'rounds',
    duration: 1,
    expireOn: 'turn-start',
    description: '+5 de Classe de Armadura (AC)',
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 5 },
    ],
    visual: { kind: 'glow', color: '#3498db', intensity: 0.9, speed: 1, size: 1.2 },
  },
  {
    id: 'haste',
    name: 'Haste',
    icon: 'fas fa-bolt',
    durationUnit: 'minutes',
    duration: 1,
    description: '+2 AC, vantagem em Des, dobro de movimento',
    changes: [
      { key: 'attributes.da.bonus', mode: 'add', value: 2 },
    ],
    visual: { kind: 'particles', style: 'sparkles', color: '#f39c12', intensity: 0.9, speed: 2, size: 1.2 },
  },
  {
    id: 'heroism',
    name: 'Heroism',
    icon: 'fas fa-heart-pulse',
    durationUnit: 'minutes',
    duration: 1,
    description: 'Pontos de Vida Temporários adicionais',
    changes: [
      { key: 'resources.health.temp', mode: 'add', value: 5 },
    ],
    visual: { kind: 'particles', style: 'hearts', color: '#e74c3c', intensity: 0.8, speed: 1, size: 1 },
  },
  {
    id: 'mage-armor',
    name: 'Mage Armor',
    icon: 'fas fa-vest',
    durationUnit: 'hours',
    duration: 8,
    description: 'Armadura Arcana base AC 13 + Mod de Destreza',
    changes: [
      { key: 'attributes.da.base', mode: 'add', value: 3 },
    ],
    visual: { kind: 'glow', color: '#1abc9c', intensity: 0.6, speed: 0.5, size: 1.1 },
  },
  {
    id: 'guidance',
    name: 'Guidance',
    icon: 'fas fa-compass',
    durationUnit: 'minutes',
    duration: 1,
    description: '+1d4 em um teste de perícia/habilidade',
    changes: [
      { key: 'attributes.prof.bonus', mode: 'add', value: 2.5 },
    ],
    visual: { kind: 'particles', style: 'sparkles', color: '#f1c40f', intensity: 0.7, speed: 1, size: 1 },
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

/** Obtém as condições ativas no ator (a partir dos efeitos aplicados ou de systemData) */
export async function getActorConditions(actorId) {
  if (!actorId) return [];
  const fx = globalThis.Loom?.effects || effects;
  if (typeof fx?.list === 'function') {
    try {
      const res = await fx.list({ actorId });
      if (res?.ok && Array.isArray(res.effects)) {
        return res.effects
          .filter((e) => !e.disabled && e.conditionId)
          .map((e) => e.conditionId);
      }
    } catch { /* ignore */ }
  }
  try {
    const raw = await fx.forActor(actorId);
    if (Array.isArray(raw)) {
      return raw.filter((e) => !e.disabled && e.conditionId).map((e) => e.conditionId);
    }
  } catch { /* ignore */ }
  return [];
}

/** Prepara a lista de efeitos e condições para qualquer ficha */
export async function getEffectsSheetData(actor) {
  if (!actor?.id) return { _allConditions: ALL_CONDITIONS_LIST, _activeConditions: [], _buffPresets: BUFF_PRESETS, _effects: [] };

  const sd = actor.systemData || {};
  const fallbackConditions = Array.isArray(sd.conditions) ? sd.conditions : [];
  const activeConditionIds = new Set([...(await getActorConditions(actor.id)), ...fallbackConditions]);

  const _allConditions = ALL_CONDITIONS_LIST.map((c) => ({
    ...c,
    active: activeConditionIds.has(c.id),
  }));

  const _activeConditions = _allConditions.filter((c) => c.active);

  const fx = globalThis.Loom?.effects || effects;
  let rawEffects = [];
  try {
    if (typeof fx?.list === 'function') {
      const res = await fx.list({ actorId: actor.id });
      if (res?.ok && Array.isArray(res.effects)) rawEffects = res.effects;
    }
    if (!rawEffects.length) {
      rawEffects = await fx.forActor(actor.id);
    }
  } catch (e) {
    console.error('[srd5e] Error fetching actor effects:', e);
  }

  const _effects = (rawEffects || []).map((e) => {
    let durationLabel = 'Permanente';
    if (e.durationUnit === 'rounds') durationLabel = `${e.duration} rodada${e.duration === 1 ? '' : 's'}`;
    else if (e.durationUnit === 'turns') durationLabel = `${e.duration} turno${e.duration === 1 ? '' : 's'}`;
    else if (e.durationUnit === 'minutes') durationLabel = `${e.duration} min`;
    else if (e.durationUnit === 'hours') durationLabel = `${e.duration} hora${e.duration === 1 ? '' : 's'}`;
    else if (e.duration !== undefined && e.duration >= 0) durationLabel = `${e.duration} ${e.durationUnit || 'rodadas'}`;

    return {
      ...e,
      durationLabel,
      changesSummary: formatChangesSummary(e.changes),
    };
  });

  return {
    _allConditions,
    _activeConditions,
    _buffPresets: BUFF_PRESETS,
    _effects,
  };
}

/** Alterna uma condição no ator usando Loom.effects.condition */
export async function toggleActorCondition(actor, conditionId) {
  if (!actor?.id || !conditionId) return;
  const fx = globalThis.Loom?.effects || effects;
  const currentConditions = await getActorConditions(actor.id);
  const willBeOn = !currentConditions.includes(conditionId);

  if (typeof fx?.condition === 'function') {
    try {
      const res = await fx.condition({
        targetActorId: actor.id,
        conditionId,
        on: willBeOn,
      });
      if (res?.ok) return;
    } catch (err) {
      console.warn(`[srd5e] Loom.effects.condition failed for ${conditionId}:`, err);
    }
  }

  // Fallback se condition() não estiver disponível
  const sd = actor.systemData || {};
  const current = new Set(Array.isArray(sd.conditions) ? sd.conditions : []);
  if (willBeOn) current.add(conditionId);
  else current.delete(conditionId);
  await api.put(`/actors/${actor.id}`, { systemData: { conditions: Array.from(current) } });
}

/** Limpa todas as condições ativas do ator */
export async function clearAllActorConditions(actor) {
  if (!actor?.id) return;
  const fx = globalThis.Loom?.effects || effects;

  if (typeof fx?.clear === 'function') {
    try {
      const res = await fx.clear({
        targetActorId: actor.id,
        filter: { all: true },
      });
      if (res?.ok) return;
    } catch (err) {
      console.warn('[srd5e] Loom.effects.clear failed:', err);
    }
  }

  const current = await getActorConditions(actor.id);
  for (const cond of current) {
    if (typeof fx?.condition === 'function') {
      await fx.condition({ targetActorId: actor.id, conditionId: cond, on: false });
    }
  }
}

/** Aplica um preset de magia/buff no ator */
export async function applyBuffPresetToActor(actor, presetId) {
  if (!actor?.id) return;
  const preset = BUFF_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;

  const fx = globalThis.Loom?.effects || effects;
  await fx.create({
    actorId: actor.id,
    name: preset.name,
    origin: preset.id,
    durationUnit: preset.durationUnit || 'rounds',
    duration: preset.duration,
    expireOn: preset.expireOn || 'turn-end',
    changes: preset.changes,
    visual: preset.visual || {},
  });

  showToast?.(`Efeito "${preset.name}" aplicado!`, { type: 'success' });
}

/** Exclui um efeito ativo */
export async function deleteActiveEffect(effectId) {
  if (!effectId) return;
  const fx = globalThis.Loom?.effects || effects;
  await fx.delete(effectId);
}

/** Pausa ou despausa um efeito ativo */
export async function toggleEffectDisabled(effectId, currentDisabled) {
  if (!effectId) return;
  const fx = globalThis.Loom?.effects || effects;
  await fx.update(effectId, { disabled: !currentDisabled });
}

/** Abre a janela de configuração avançada nativa do LoomVTT para um efeito */
export async function openAdvancedEffectConfig(buffId) {
  if (!buffId) return;
  const fx = globalThis.Loom?.effects || effects;
  if (typeof fx?.openConfig === 'function') {
    await fx.openConfig(buffId);
  }
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
