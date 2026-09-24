// ─────────────────────────────────────────────────────────────────────────────
// SDR5E — scripts/settings.mjs
// Component Version: 0.1.0
// Configurações do sistema SDR5E (Modern SRD) integradas ao settingsRegistry do LoomVTT.
// ─────────────────────────────────────────────────────────────────────────────

export const SDR5E_SETTINGS = [
  {
    key: 'initiativeTiebreaker',
    name: 'Desempate de Iniciativa (Tiebreaker)',
    hint: 'Adiciona a pontuação decimal de Destreza (DEX / 100) à iniciativa para desempatar automaticamente.',
    scope: 'world',
    type: Boolean,
    default: true
  },
  {
    key: 'maxHpFirstLevel',
    name: 'PV Máximo no 1º Nível',
    hint: 'Garante que novos heróis recebam o valor máximo de pontos de vida em seu primeiro nível.',
    scope: 'world',
    type: Boolean,
    default: true
  },
  {
    key: 'encumbranceTracking',
    name: 'Rastreamento de Carga (Encumbrance)',
    hint: 'Aplica a regra opcional do SRD de capacidade de carga e penalidades por excesso de peso.',
    scope: 'world',
    type: Boolean,
    default: false
  },
  {
    key: 'collapseItemCards',
    name: 'Cards Compactos no Chat',
    hint: 'Exibe rolagens e ativações de itens de forma mais enxuta para economizar espaço no chat.',
    scope: 'client',
    type: Boolean,
    default: false
  },
  {
    key: 'learningMilestones',
    name: 'Progressão por Marcos (Milestones)',
    hint: 'Permite evolução guiada por marcos da história em vez de acúmulo numérico de XP.',
    scope: 'world',
    type: Boolean,
    default: true
  },
  {
    key: 'criticalHitRule',
    name: 'Regra de Acerto Crítico',
    hint: 'Método de cálculo do dano em acertos críticos.',
    scope: 'world',
    type: String,
    default: 'doubleDice',
    choices: {
      doubleDice: 'Dobrar Dados de Dano (SRD)',
      maxDice: 'Dado Máximo + Rolagem',
      flatMax: 'Dano Máximo Fixo'
    }
  },
  {
    key: 'deathSaveDC',
    name: 'CD da Salvaguarda Contra a Morte',
    hint: 'Dificuldade para testes de resistência contra a morte (padrão 5e é 10).',
    scope: 'world',
    type: Number,
    default: 10
  },
  {
    key: 'diagonalMovement',
    name: 'Cálculo de Diagonal na Grade',
    hint: 'Regra de contagem de movimento diagonal no grid.',
    scope: 'world',
    type: String,
    default: '555',
    choices: {
      '555': '5/5/5 ft (Equidistante - Padrão)',
      '5105': '5/10/5 ft (Variante DMG)'
    }
  },
  {
    key: 'primaryParty',
    name: 'Grupo Principal',
    hint: 'Ator do tipo Grupo usado como referência de dificuldade de encontros.',
    scope: 'world',
    type: String,
    default: ''
  }
];

export function registerSettings() {
  if (!window.Loom?.settings?.register) return;
  for (const s of SDR5E_SETTINGS) {
    try {
      window.Loom.settings.register('srd5e', s.key, {
        name: s.name,
        hint: s.hint,
        scope: s.scope,
        config: true,
        type: s.type,
        default: s.default,
        choices: s.choices
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
