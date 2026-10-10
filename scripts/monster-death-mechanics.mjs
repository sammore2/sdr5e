/** SRD default: NPC/monster records die at 0 HP unless the GM opts into death saves. */
export function resolveMonsterZeroHp({ actorType, useCharacterDeathSaves = false, hpAfter, deathState = 'alive' } = {}) {
  if (actorType !== 'npc' || useCharacterDeathSaves === true || Number(hpAfter) > 0) {
    return { deathState: deathState || 'alive', diedNow: false };
  }
  return { deathState: 'dead', diedNow: deathState !== 'dead' };
}

/** Visibility and roll availability for the NPC override's death-save controls. */
export function npcDeathSaveView({ healthValue, useCharacterDeathSaves = false, deathState = 'alive', deathSaves = {} } = {}) {
  const visible = useCharacterDeathSaves === true && (Number(healthValue) || 0) <= 0;
  const settled = ['dead', 'stable'].includes(deathState);
  return {
    visible,
    canRoll: visible && !settled,
    state: deathState === 'dead' ? 'dead' : deathState === 'stable' ? 'stable' : '',
    successPips: Array.from({ length: 3 }, (_, index) => ({ filled: (Number(deathSaves.successes) || 0) > index })),
    failurePips: Array.from({ length: 3 }, (_, index) => ({ filled: (Number(deathSaves.failures) || 0) > index })),
  };
}
