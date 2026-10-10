export function normalizeDodgeRecord(value) {
  return value === true || value?.active === true ? { active: true } : { active: false };
}

export function setDodgeRecord() {
  return { active: true };
}

export function clearDodgeRecord() {
  return { active: false };
}

export function dodgeActionView(value, localize = (key) => key) {
  const active = normalizeDodgeRecord(value).active;
  return {
    active,
    title: localize('SDR5E.DodgeAction.Title'),
    note: localize('SDR5E.DodgeAction.Note'),
    recordLabel: localize(active ? 'SDR5E.DodgeAction.Recorded' : 'SDR5E.DodgeAction.Record'),
    clearLabel: localize('SDR5E.DodgeAction.Clear'),
    endTurnNote: localize('SDR5E.DodgeAction.EndTurn'),
  };
}
