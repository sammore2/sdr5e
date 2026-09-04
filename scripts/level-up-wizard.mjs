// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/level-up-wizard.mjs
// Component Version: 0.1.0
//
// Level up guiado pra um personagem já existente — mesmo padrão do
// character-wizard.mjs (LoomHandlebarsMixin, steps pré-computados, sem
// helper `eq`), mas ligado a um `actorId` real via LoomActorSheet em vez de
// criar documentos do zero. Ganho de HP usa valor médio fixo (mesma
// convenção de spendHitDie em roll-engine.mjs) — sem rolagem de verdade,
// dispatchRoll não retorna resultado pro código.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, showToast } from '/_loom/sdk/index.js';
import { ABILITY_KEYS, ABILITY_LABELS, ASI_LEVELS, SUBCLASS_LEVEL } from './config.mjs';
import { getDefaultData } from './schema.mjs';

const STEPS = ['class', 'hp', 'asi', 'subclass', 'review'];

export class Sdr5eLevelUpWizard extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 460, height: 540 } };
  static PARTS = { main: { template: '/marketplace/rulesets/srd5e/templates/apps/level-up-wizard.hbs' } };

  constructor(props) {
    super({
      ...props,
      id: props?.id || `sdr5e-levelup-${props?.actorId}`,
      title: 'Level Up',
      showFooter: false,
      resizable: true,
      classes: ['sdrn-sheet', 'sdrn-wizard'],
    });
  }

  _step = 0;
  _classId = null;
  _asiMode = 'scores'; // 'scores' | 'feat'
  _asiPicks = { first: '', second: '' };
  _featName = '';
  _subclassName = '';
  _initialized = false;

  async _prepareContext() {
    const context = await super._prepareContext();
    const sd = this.document?.systemData || {};
    const items = this.document?.items || [];
    const classItems = items.filter((i) => i.type === 'class');

    // Primeira renderização: escolhe a única classe automaticamente (caso
    // comum, sem multiclasse) e já resolve o nome de subclasse atual.
    if (!this._initialized) {
      this._initialized = true;
      if (classItems.length === 1) this._classId = classItems[0].id;
    }

    const classItem = classItems.find((i) => i.id === this._classId) || null;
    const idata = classItem ? (classItem.system || classItem.data || {}) : null;
    const currentClassLevel = idata ? Number(idata.levels) || 1 : 0;
    const nextClassLevel = currentClassLevel + 1;
    const nextTotalLevel = (Number(sd.details?.level) || 1) + 1;

    const die = idata?.hitDie || 'd8';
    const dieMax = Number(die.replace(/\D/g, '')) || 8;
    const conMod = sd.abilities?.con?.modifier ?? 0;
    const avgRoll = Math.ceil((dieMax + 1) / 2);
    const hpGain = Math.max(1, avgRoll + conMod);

    const showAsi = ASI_LEVELS.includes(nextClassLevel);
    const showSubclass = nextClassLevel === SUBCLASS_LEVEL && !idata?.subclassName;

    const activeSteps = STEPS.filter((s) => {
      if (s === 'class') return classItems.length > 1;
      if (s === 'asi') return showAsi;
      if (s === 'subclass') return showSubclass;
      return true;
    });
    const step = activeSteps[this._step] || activeSteps[activeSteps.length - 1];

    return {
      ...context,
      _classItems: classItems.map((i) => ({ id: i.id, name: i.name, levels: (i.system || i.data || {}).levels || 1, selected: i.id === this._classId })),
      _stepClass: step === 'class',
      _stepHp: step === 'hp',
      _stepAsi: step === 'asi',
      _stepSubclass: step === 'subclass',
      _stepReview: step === 'review',
      _isFirst: activeSteps.indexOf(step) === 0,
      _isLast: activeSteps.indexOf(step) === activeSteps.length - 1,
      _activeSteps: activeSteps,
      _className: classItem?.name || '(no class selected)',
      _currentClassLevel: currentClassLevel,
      _nextClassLevel: nextClassLevel,
      _nextTotalLevel: nextTotalLevel,
      _die: die,
      _hpGain: hpGain,
      _asiModeScores: this._asiMode === 'scores',
      _asiModeFeat: this._asiMode === 'feat',
      _abilities: ABILITY_KEYS.map((k) => ({ key: k, label: ABILITY_LABELS[k], value: sd.abilities?.[k]?.value ?? 10, atCap: (sd.abilities?.[k]?.value ?? 10) >= 20 })),
      _featName: this._featName,
      _subclassName: this._subclassName,
      _canFinish: !!classItem,
    };
  }

  _onChangeForm(event) {
    const target = event.target;
    if (!target?.name) return;
    if (target.name === 'w:classId') { this._classId = target.value; void this.render(); return; }
    if (target.name === 'w:asiMode') { this._asiMode = target.value; void this.render(); return; }
    if (target.name === 'w:asiFirst') { this._asiPicks.first = target.value; return; }
    if (target.name === 'w:asiSecond') { this._asiPicks.second = target.value; return; }
    if (target.name === 'w:featName') { this._featName = target.value; return; }
    if (target.name === 'w:subclassName') { this._subclassName = target.value; return; }
  }

  onAction(action, id, target) {
    if (action === 'wizard-next') { this._goStep(1); return; }
    if (action === 'wizard-back') { this._goStep(-1); return; }
    if (action === 'wizard-finish') { void this._finish(); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  _goStep(delta) {
    this._step = Math.max(0, this._step + delta);
    void this.render();
  }

  async _finish() {
    const sd = this.document?.systemData;
    const items = this.document?.items || [];
    const classItem = items.find((i) => i.id === this._classId);
    if (!sd || !classItem) { showToast?.('Pick a class first.', 'warning'); return; }

    const idata = classItem.system || classItem.data || {};
    const currentClassLevel = Number(idata.levels) || 1;
    const nextClassLevel = currentClassLevel + 1;

    // 1) Classe sobe de nível (item separado — mesma rota que _toggleEquip usa).
    await api.put(`/items/${classItem.id}`, { data: { ...idata, levels: nextClassLevel } });

    // 2) HP: soma no máximo E no atual (diferente de cura de descanso curto,
    // que só reabastece até o máximo velho — aqui o máximo sobe de verdade).
    const die = idata.hitDie || 'd8';
    const dieMax = Number(die.replace(/\D/g, '')) || 8;
    const conMod = sd.abilities?.con?.modifier ?? 0;
    const hpGain = Math.max(1, Math.ceil((dieMax + 1) / 2) + conMod);
    const hp = sd.resources?.health || { value: 10, max: 10, bonus: 0, temp: 0 };
    const hd = sd.resources?.hitDice || { value: 1, max: 1, die };

    const patch = {
      'system.details.level': (Number(sd.details?.level) || 1) + 1,
      'system.resources.health.max': hp.max + hpGain,
      'system.resources.health.value': hp.value + hpGain,
      'system.resources.hitDice.max': hd.max + 1,
      'system.resources.hitDice.value': hd.value + 1,
    };

    // 3) ASI (só se este step apareceu — checa de novo aqui, não confia só
    // no _asiMode do estado, caso o nível não bata mais o filtro de fora).
    if (ASI_LEVELS.includes(nextClassLevel)) {
      if (this._asiMode === 'scores') {
        const applyBump = (key, amount) => {
          if (!key) return;
          const current = Number(sd.abilities?.[key]?.value) || 10;
          patch[`system.abilities.${key}.value`] = Math.min(20, current + amount);
        };
        if (this._asiPicks.first && this._asiPicks.second && this._asiPicks.first !== this._asiPicks.second) {
          applyBump(this._asiPicks.first, 1);
          applyBump(this._asiPicks.second, 1);
        } else if (this._asiPicks.first) {
          applyBump(this._asiPicks.first, 2);
        }
      } else if (this._asiMode === 'feat' && this._featName.trim()) {
        const featData = getDefaultData('feat');
        featData.requiresLevel = nextClassLevel;
        await api.post('/items', { worldId: window.Loom?.world?.id, name: this._featName.trim(), type: 'feat', data: featData, actorId: this.document.id });
      }
    }

    // 4) Subclasse (só se o campo foi preenchido).
    if (this._subclassName.trim()) {
      await api.put(`/items/${classItem.id}`, { data: { ...idata, levels: nextClassLevel, subclassName: this._subclassName.trim() } });
    }

    await this.document.update(patch);
    showToast?.(`Leveled up to ${nextClassLevel}!`, 'success');
    windowManager.close(this.options.id);
  }
}
