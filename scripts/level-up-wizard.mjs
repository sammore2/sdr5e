// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/level-up-wizard.mjs
// Component Version: 0.2.0
//
// Level up guiado pra um personagem já existente — mesmo padrão do
// character-wizard.mjs (LoomHandlebarsMixin, steps pré-computados, sem
// helper `eq`), mas ligado a um `actorId` real via LoomActorSheet em vez de
// criar documentos do zero. Ganho de HP usa valor médio fixo (mesma
// convenção de spendHitDie em roll-engine.mjs) — sem rolagem de verdade,
// dispatchRoll não retorna resultado pro código.
//
// Feat/Subclass/Spell agora puxam do compendium de verdade (GET /compendium/
// browse/entries), igual ao picker de Raça/Classe em character-wizard.mjs —
// nenhum sourceId hardcoded, funciona com qualquer pack de terceiro instalado
// depois. Fallback freeform continua existindo pra Feat/Subclass quando não
// há entrada correspondente em nenhum pack carregado.
// ══════════════════════════════════════════════════════════════════════════

import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, showToast } from '/_loom/sdk/index.js';
import { ABILITY_KEYS, ABILITY_LABELS, ASI_LEVELS, SUBCLASS_LEVEL, SPELL_SLOT_TABLE, KNOWN_SPELLS_TABLE, KNOWN_CANTRIPS_TABLE } from './config.mjs';

const STEPS = ['class', 'hp', 'asi', 'subclass', 'spells', 'review'];

export class Sdr5eLevelUpWizard extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 480, height: 580 } };
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
  _featPick = null; // full compendium entry ({id, name, data, sourceId, sourceName}) once picked
  _subclassName = '';
  _subclassPick = null;
  _spellPicks = { leveled: [], cantrips: [] };
  _initialized = false;
  _lastActiveStepId = null;

  // Um bucket de query/results/timer por picker ligado ao compendium neste
  // wizard — mesmo padrão do `_search` em character-wizard.mjs.
  _search = {
    feat: { query: '', results: [], timer: null },
    subclass: { query: '', results: [], timer: null },
    spell: { query: '', results: [], timer: null },
  };

  _currentClassItem() {
    const items = this.document?.items || [];
    return items.find((i) => i.id === this._classId) || null;
  }

  _currentClassIdentifier() {
    const classItem = this._currentClassItem();
    const idata = classItem ? (classItem.system || classItem.data || {}) : null;
    return idata?.classIdentifier || '';
  }

  /** Nível de magia mais alto disponível em `classLevel` pro `casterType`
   * dado. Pact Magic do Warlock não usa SPELL_SLOT_TABLE (ver nota da própria
   * tabela em config.mjs) — aproximado pela progressão real do SRD (1 nos
   * níveis 1-2, 2 no 3-4, 3 no 5-6, 4 no 7-8, teto 5 a partir do 9). */
  _maxSpellLevelAt(casterType, classLevel) {
    if (casterType === 'pact') return Math.min(5, Math.ceil(Math.min(classLevel, 9) / 2));
    const table = SPELL_SLOT_TABLE[casterType];
    const row = table?.[classLevel - 1] || [];
    for (let i = row.length - 1; i >= 0; i--) { if (row[i] > 0) return i + 1; }
    return 0;
  }

  _newCountFromTable(table, classIdentifier, currentLevel, nextLevel) {
    const perLevel = table[classIdentifier];
    if (!perLevel) return 0;
    const cur = perLevel[currentLevel - 1] ?? 0;
    const next = perLevel[nextLevel - 1] ?? cur;
    return Math.max(0, next - cur);
  }

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
    const classIdentifier = idata?.classIdentifier || '';
    const casterType = idata?.casterType || 'none';

    const die = idata?.hitDie || 'd8';
    const dieMax = Number(die.replace(/\D/g, '')) || 8;
    const conMod = sd.abilities?.con?.modifier ?? 0;
    const avgRoll = Math.ceil((dieMax + 1) / 2);
    const hpGain = Math.max(1, avgRoll + conMod);

    const showAsi = ASI_LEVELS.includes(nextClassLevel);
    const showSubclass = nextClassLevel === SUBCLASS_LEVEL && !idata?.subclassName;

    // Step de magias: aparece sempre que a classe tem alguma conjuração E
    // este nível concede slot/cantrip novo de verdade.
    const isKnownCaster = Object.prototype.hasOwnProperty.call(KNOWN_SPELLS_TABLE, classIdentifier);
    const maxSpellLevel = this._maxSpellLevelAt(casterType, nextClassLevel);
    const newSpellsRequired = isKnownCaster ? this._newCountFromTable(KNOWN_SPELLS_TABLE, classIdentifier, currentClassLevel, nextClassLevel) : 0;
    const newCantripsRequired = this._newCountFromTable(KNOWN_CANTRIPS_TABLE, classIdentifier, currentClassLevel, nextClassLevel);
    const isPreparedCaster = (casterType === 'full' || casterType === 'half') && !isKnownCaster;
    const showSpells = maxSpellLevel > 0 || newCantripsRequired > 0 || isPreparedCaster;

    const activeSteps = STEPS.filter((s) => {
      if (s === 'class') return classItems.length > 1;
      if (s === 'asi') return showAsi;
      if (s === 'subclass') return showSubclass;
      if (s === 'spells') return showSpells;
      return true;
    });
    const step = activeSteps[this._step] || activeSteps[activeSteps.length - 1];
    this._lastActiveStepId = step;

    const spellResults = this._search.spell.results.filter((e) => {
      const alreadyPicked = this._spellPicks.leveled.some((p) => p.id === e.id) || this._spellPicks.cantrips.some((p) => p.id === e.id);
      return !alreadyPicked;
    });

    return {
      ...context,
      _classItems: classItems.map((i) => ({ id: i.id, name: i.name, levels: (i.system || i.data || {}).levels || 1, selected: i.id === this._classId })),
      _stepClass: step === 'class',
      _stepHp: step === 'hp',
      _stepAsi: step === 'asi',
      _stepSubclass: step === 'subclass',
      _stepSpells: step === 'spells',
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
      _featPicked: !!this._featPick,
      _featQuery: this._search.feat.query,
      _featResults: this._search.feat.results,
      _subclassName: this._subclassName,
      _subclassPicked: !!this._subclassPick,
      _subclassQuery: this._search.subclass.query,
      _subclassResults: this._search.subclass.results,
      _isKnownCaster: isKnownCaster,
      _newSpellsRequired: newSpellsRequired,
      _newCantripsRequired: newCantripsRequired,
      _spellQuery: this._search.spell.query,
      _spellResults: spellResults,
      _spellPicksLeveled: this._spellPicks.leveled,
      _spellPicksCantrips: this._spellPicks.cantrips,
      _spellLeveledCount: this._spellPicks.leveled.length,
      _spellCantripCount: this._spellPicks.cantrips.length,
      _canFinish: !!classItem,
    };
  }

  _onChangeForm(event) {
    const target = event.target;
    const searchKind = target?.dataset?.wizardSearch;
    if (searchKind && this._search[searchKind]) {
      const bucket = this._search[searchKind];
      bucket.query = target.value;
      clearTimeout(bucket.timer);
      bucket.timer = setTimeout(() => void this._runSearch(searchKind), 300);
      return;
    }
    if (!target?.name) return;
    if (target.name === 'w:classId') { this._classId = target.value; void this.render(); return; }
    if (target.name === 'w:asiMode') {
      this._asiMode = target.value;
      void this.render().then(() => this._preloadStepData());
      return;
    }
    if (target.name === 'w:asiFirst') { this._asiPicks.first = target.value; return; }
    if (target.name === 'w:asiSecond') { this._asiPicks.second = target.value; return; }
  }

  onAction(action, id, target) {
    if (action === 'wizard-next') { void this._goStep(1); return; }
    if (action === 'wizard-back') { void this._goStep(-1); return; }
    if (action === 'wizard-finish') { void this._finish(); return; }
    if (action === 'wizard-pick-feat') { this._pickFromResults('feat', id); return; }
    if (action === 'wizard-clear-feat') { void this._clearFeat(); return; }
    if (action === 'wizard-pick-subclass') { this._pickFromResults('subclass', id); return; }
    if (action === 'wizard-clear-subclass') { void this._clearSubclass(); return; }
    if (action === 'wizard-toggle-spell') { this._toggleSpellPick(id); return; }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _goStep(delta) {
    this._step = Math.max(0, this._step + delta);
    await this.render();
    await this._preloadStepData();
  }

  /** Carrega o grid de opções do compendium assim que o step correspondente
   * é aberto (ou o modo ASI vira "feat") — mesmo comportamento do grid de
   * Raça/Classe em character-wizard.mjs: navegável por padrão, a busca só
   * filtra o que já está carregado. */
  async _preloadStepData() {
    const stepId = this._lastActiveStepId;
    if (stepId === 'asi' && this._asiMode === 'feat' && !this._featPick && !this._search.feat.results.length && !this._search.feat.query) {
      void this._runSearch('feat');
    } else if (stepId === 'subclass' && !this._subclassPick && !this._search.subclass.results.length && !this._search.subclass.query) {
      void this._runSearch('subclass');
    } else if (stepId === 'spells' && !this._search.spell.results.length && !this._search.spell.query) {
      void this._runSearch('spell');
    }
  }

  /** `entryType` é o mesmo nome do `kind` aqui (feat/subclass/spell).
   * `includeData: true` é necessário pro subclass (filtrado por
   * `classIdentifier`) e spell (filtrado por `classes[]`/`spellLevel`) —
   * ver o comentário de querySourceEntries em compendium-source.ts pra saber
   * por que isso não é o padrão da rota. */
  async _searchEntries(entryType, query) {
    const params = new URLSearchParams({ entryType, includeData: 'true' });
    if (query) params.set('search', query);
    try {
      const res = await api.get(`/compendium/browse/entries?${params}`);
      return res?.entries ?? [];
    } catch (err) {
      console.warn('[srd5e] level-up compendium search failed:', err);
      return [];
    }
  }

  async _runSearch(kind) {
    const queryAtRequest = this._search[kind].query;
    let results = await this._searchEntries(kind, queryAtRequest);

    const classIdentifier = this._currentClassIdentifier();
    if (kind === 'subclass' && classIdentifier) {
      results = results.filter((e) => (e.data?.classIdentifier || '') === classIdentifier);
    } else if (kind === 'spell' && classIdentifier) {
      results = results.filter((e) => Array.isArray(e.data?.classes) && e.data.classes.includes(classIdentifier));
    }

    // Resposta pode ter chegado depois de uma busca mais nova — mesma guarda
    // anti-race de character-wizard.mjs's _runSearch.
    if (this._search[kind].query !== queryAtRequest) return;
    this._search[kind].results = results;
    await this.render();
  }

  _pickFromResults(kind, entryId) {
    const entry = this._search[kind].results.find((e) => e.id === entryId);
    if (!entry) return;
    if (kind === 'feat') {
      this._featPick = entry;
      this._featName = entry.name;
      this._search.feat.results = [];
      this._search.feat.query = entry.name;
    } else if (kind === 'subclass') {
      this._subclassPick = entry;
      this._subclassName = entry.name;
      this._search.subclass.results = [];
      this._search.subclass.query = entry.name;
    }
    void this.render();
  }

  async _clearFeat() {
    this._featPick = null;
    this._featName = '';
    this._search.feat.query = '';
    this._search.feat.results = [];
    await this.render();
    await this._preloadStepData();
  }

  async _clearSubclass() {
    this._subclassPick = null;
    this._subclassName = '';
    this._search.subclass.query = '';
    this._search.subclass.results = [];
    await this.render();
    await this._preloadStepData();
  }

  _toggleSpellPick(entryId) {
    const all = [...this._search.spell.results, ...this._spellPicks.leveled, ...this._spellPicks.cantrips];
    const entry = all.find((e) => e.id === entryId);
    if (!entry) return;
    const bucket = (entry.data?.spellLevel ?? 0) === 0 ? 'cantrips' : 'leveled';
    const list = this._spellPicks[bucket];
    const idx = list.findIndex((e) => e.id === entryId);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(entry);
    void this.render();
  }

  async _finish() {
    const sd = this.document?.systemData;
    const items = this.document?.items || [];
    const classItem = items.find((i) => i.id === this._classId);
    if (!sd || !classItem) { showToast?.('Pick a class first.', 'warning'); return; }

    const worldId = window.Loom?.world?.id;
    const idata = classItem.system || classItem.data || {};
    const currentClassLevel = Number(idata.levels) || 1;
    const nextClassLevel = currentClassLevel + 1;

    // 1) Classe sobe de nível (e ganha subclassName se um subclass do
    // compendium foi escolhido neste level-up).
    const updatedClassData = { ...idata, levels: nextClassLevel };
    if (this._subclassPick) updatedClassData.subclassName = this._subclassPick.name;
    await api.put(`/items/${classItem.id}`, { data: updatedClassData });

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
      } else if (this._asiMode === 'feat') {
        if (this._featPick) {
          // Item real do compendium — traz os campos mecânicos (`data`) que
          // a entrada já tem, nada de item em branco.
          await api.post('/items', { worldId, name: this._featPick.name, type: 'feat', data: this._featPick.data, actorId: this.document.id });
        }
      }
    }

    // 4) Subclasse — item de compendium real (features/etc na própria
    // `data`), além do `subclassName` já gravado na classe acima.
    if (this._subclassPick) {
      await api.post('/items', { worldId, name: this._subclassPick.name, type: 'subclass', data: this._subclassPick.data, actorId: this.document.id });
    }

    // 5) Magias novas escolhidas (conhecidas ou adicionadas ao repertório de
    // preparo) — cada uma vira um item `spell` real na ficha.
    for (const entry of [...this._spellPicks.leveled, ...this._spellPicks.cantrips]) {
      await api.post('/items', { worldId, name: entry.name, type: 'spell', data: entry.data, actorId: this.document.id });
    }

    await this.document.update(patch);
    showToast?.(`Leveled up to ${nextClassLevel}!`, 'success');
    windowManager.close(this.options.id);
  }
}
