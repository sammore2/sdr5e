// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/roll-dialog.mjs
// Component Version: 0.1.0
//
// Caixa de rolagem pré-roll (Advantage/Normal/Disadvantage + Bônus
// Situacional), mesmo padrão visual/comportamental do dnd5e real
// (Handout 37). Usa LoomDialog.wait (core SDK), mesmo mecanismo que
// showColorDialog/showSelectDialog do core já usam (dialog.ts) — conteúdo
// customizado em vez de um dos helpers de propósito único.
// ══════════════════════════════════════════════════════════════════════════

import { LoomDialog } from '/_loom/sdk/index.js';
import { resolveInitiativeAdvantage } from './initiative-mechanics.mjs';

/**
 * @param {{title: string, parts: {label: string, value: number}[]}} opts
 * @returns {Promise<{advantage: number, situational: number} | null>} null = cancelado (fechou sem escolher)
 */
export function showRollDialog({ title, parts = [], advantage: baseAdvantage = 0, initiative = false }) {
  const container = document.createElement('div');
  container.className = 'sdrn-roll-dialog';

  const nonZero = parts.filter((p) => p.value);
  const formulaText = ['1d20', ...nonZero.map((p) => `${p.value >= 0 ? '+' : ''}${p.value}`)].join(' ');
  const breakdownText = nonZero.length
    ? nonZero.map((p) => `${p.label} ${p.value >= 0 ? '+' : ''}${p.value}`).join(' · ')
    : '';
  const surprisedLabel = window.Loom?.i18n?.localize?.('SDR5E.Roll.SurprisedInitiative') || 'SDR5E.Roll.SurprisedInitiative';

  container.innerHTML = `
    <div class="sdrn-roll-dialog-formula">${formulaText}</div>
    ${breakdownText ? `<div class="sdrn-roll-dialog-breakdown">${breakdownText}</div>` : ''}
    ${initiative ? `<label class="sdrn-roll-dialog-surprise"><input type="checkbox" class="sdrn-roll-dialog-surprised" /> ${surprisedLabel}</label>` : ''}
    <input type="number" class="sdrn-roll-dialog-situational" placeholder="Situational Bonus?" value="0" />
    <div class="sdrn-roll-dialog-config">
      <label>Roll Mode</label>
      <select class="sdrn-roll-dialog-mode">
        <option value="public">Público como Usuário</option>
        <option value="gmroll">Privado para Mestres</option>
        <option value="blindroll">Cego para Mestres</option>
        <option value="selfroll">Somente para Si</option>
      </select>
    </div>
  `;
  const situationalInput = container.querySelector('.sdrn-roll-dialog-situational');
  const modeSelect = container.querySelector('.sdrn-roll-dialog-mode');
  const surprisedInput = container.querySelector('.sdrn-roll-dialog-surprised');
  const getSituational = () => Number(situationalInput?.value) || 0;
  const getMode = () => modeSelect?.value || 'public';
  const isSurprised = () => !!surprisedInput?.checked;
  const resolveChoice = (choice) => initiative
    ? resolveInitiativeAdvantage(baseAdvantage, choice, isSurprised())
    : resolveInitiativeAdvantage(baseAdvantage, choice, false);
  const result = (choice) => ({ advantage: resolveChoice(choice), situational: getSituational(), rollMode: getMode(), surprised: isSurprised() });

  return LoomDialog.wait({
    window: { title },
    content: container,
    width: 340,
    buttons: [
      { action: 'advantage', label: 'Advantage', variant: 'ghost', callback: () => result(1) },
      { action: 'normal', label: 'Normal', variant: 'primary', callback: () => result(0) },
      { action: 'disadvantage', label: 'Disadvantage', variant: 'ghost', callback: () => result(-1) },
    ],
  });
}
