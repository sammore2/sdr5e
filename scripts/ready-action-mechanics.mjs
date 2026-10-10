export function normalizeReadyRecords(value = []) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record) => {
    const trigger = String(record?.trigger || '').trim().slice(0, 160);
    const responseType = record?.responseType;
    if (!trigger || !['action', 'movement', 'spell'].includes(responseType)) return [];
    if (responseType === 'action') {
      const response = String(record?.response || '').trim().slice(0, 160);
      return response ? [{ trigger, responseType, response }] : [];
    }
    if (responseType === 'spell') {
      const spellName = String(record?.spellName || '').trim().slice(0, 160);
      return spellName ? [{ trigger, responseType, spellName }] : [];
    }
    const distance = Number(record?.distance);
    const speed = Number(record?.speed);
    return Number.isFinite(distance) && distance > 0 && Number.isFinite(speed) && distance <= speed
      ? [{ trigger, responseType, distance, speed }]
      : [];
  }).slice(0, 1);
}

export function createReadyRecord(candidate, speed) {
  const trigger = String(candidate?.trigger || '').trim();
  if (!trigger) return { valid: false, reason: 'trigger-required' };
  if (candidate.responseType === 'action') {
    const response = String(candidate.response || '').trim();
    if (!response) return { valid: false, reason: 'response-required' };
    return { valid: true, record: { trigger: trigger.slice(0, 160), responseType: 'action', response: response.slice(0, 160) } };
  }
  if (candidate.responseType === 'spell') {
    const spellName = String(candidate.spellName || '').trim();
    if (!spellName) return { valid: false, reason: 'spell-required' };
    return { valid: true, record: { trigger: trigger.slice(0, 160), responseType: 'spell', spellName: spellName.slice(0, 160) } };
  }
  if (candidate.responseType === 'movement') {
    const currentSpeed = Number(speed);
    const distance = Number(candidate.distance);
    if (!Number.isFinite(currentSpeed) || currentSpeed <= 0) return { valid: false, reason: 'speed-unavailable' };
    if (!Number.isFinite(distance) || distance <= 0 || distance > currentSpeed) return { valid: false, reason: 'movement-exceeds-speed' };
    return { valid: true, record: { trigger: trigger.slice(0, 160), responseType: 'movement', distance, speed: currentSpeed } };
  }
  return { valid: false, reason: 'unsupported-response' };
}

export function appendReadyRecord(records, record) {
  const current = normalizeReadyRecords(records);
  if (current.length) return current;
  const next = normalizeReadyRecords([record]);
  return next.length ? next : current;
}

export function removeReadyRecord(records, index) {
  const normalized = normalizeReadyRecords(records);
  return Number(index) === 0 ? [] : normalized;
}

export function readyActionView(speed, value = [], localize = (key) => key) {
  const records = normalizeReadyRecords(value).map((record, index) => ({
    ...record,
    index,
    description: record.responseType === 'action'
      ? localize('SDR5E.ReadyAction.ActionRecord').replace('{trigger}', record.trigger).replace('{response}', record.response)
      : record.responseType === 'spell'
        ? localize('SDR5E.ReadyAction.SpellRecord').replace('{trigger}', record.trigger).replace('{spell}', record.spellName)
        : localize('SDR5E.ReadyAction.MovementRecord').replace('{trigger}', record.trigger).replace('{distance}', String(record.distance)),
  }));
  return {
    speed: Number(speed) || 0,
    records,
    canRecord: records.length === 0,
    title: localize('SDR5E.ReadyAction.Title'),
    note: localize('SDR5E.ReadyAction.Note'),
    spellNote: localize('SDR5E.ReadyAction.SpellManualNote'),
    triggerLabel: localize('SDR5E.ReadyAction.Trigger'),
    responseTypeLabel: localize('SDR5E.ReadyAction.ResponseType'),
    responseActionLabel: localize('SDR5E.ReadyAction.ResponseAction'),
    spellNameLabel: localize('SDR5E.ReadyAction.SpellName'),
    responseMovementLabel: localize('SDR5E.ReadyAction.ResponseMovement'),
    distanceLabel: localize('SDR5E.ReadyAction.Distance'),
    recordLabel: localize('SDR5E.ReadyAction.Record'),
    removeLabel: localize('SDR5E.ReadyAction.Remove'),
    clearLabel: localize('SDR5E.ReadyAction.Clear'),
    responseOptions: [
      { value: 'action', label: localize('SDR5E.ReadyAction.Action') },
      { value: 'movement', label: localize('SDR5E.ReadyAction.Movement') },
      { value: 'spell', label: localize('SDR5E.ReadyAction.Spell') },
    ],
  };
}
