export function normalizeHelpRecords(value = []) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record) => {
    const mode = record?.mode;
    const allyName = String(record?.allyName || '').trim().slice(0, 100);
    if (!allyName || !['ability', 'attack'].includes(mode)) return [];
    if (mode === 'attack') {
      const enemyName = String(record?.enemyName || '').trim().slice(0, 100);
      return enemyName ? [{ mode, allyName, enemyName }] : [];
    }
    const proficiencyKind = record?.proficiencyKind;
    const proficiencyKey = String(record?.proficiencyKey || '').trim().slice(0, 100);
    return ['skill', 'tool'].includes(proficiencyKind) && proficiencyKey
      ? [{ mode, allyName, proficiencyKind, proficiencyKey }]
      : [];
  });
}

export function helpProficiencyOptions(systemData = {}, localize = (key) => key) {
  const skills = Object.entries(systemData.skills || {})
    .filter(([, value]) => value?.proficient === true)
    .map(([key]) => ({ kind: 'skill', key, label: localize(`srd5e.Skills.${key}`) }));
  const tools = Array.isArray(systemData.proficiencies?.tools) ? systemData.proficiencies.tools
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((key) => ({ kind: 'tool', key, label: key })) : [];
  return [...skills, ...tools];
}

export function createHelpRecord(candidate, systemData = {}) {
  const mode = candidate?.mode;
  const allyName = String(candidate?.allyName || '').trim();
  if (!allyName || !['ability', 'attack'].includes(mode)) return { valid: false, reason: 'invalid-target' };
  if (mode === 'attack') {
    const enemyName = String(candidate?.enemyName || '').trim();
    if (!enemyName) return { valid: false, reason: 'invalid-target' };
    return { valid: true, record: { mode, allyName: allyName.slice(0, 100), enemyName: enemyName.slice(0, 100) } };
  }
  const proficiencyKind = candidate?.proficiencyKind;
  const proficiencyKey = String(candidate?.proficiencyKey || '').trim();
  const eligible = helpProficiencyOptions(systemData).some((option) => option.kind === proficiencyKind && option.key === proficiencyKey);
  if (!eligible) return { valid: false, reason: 'proficiency-unavailable' };
  return { valid: true, record: { mode, allyName: allyName.slice(0, 100), proficiencyKind, proficiencyKey: proficiencyKey.slice(0, 100) } };
}

export function appendHelpRecord(records, record) {
  const normalized = normalizeHelpRecords(records);
  const next = normalizeHelpRecords([...normalized, record]);
  return next.length === normalized.length + 1 ? next : normalized;
}

export function removeHelpRecord(records, index) {
  const normalized = normalizeHelpRecords(records);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= normalized.length) return normalized;
  return normalized.filter((_, row) => row !== i);
}

export function helpActionView(systemData = {}, value = [], localize = (key) => key) {
  const records = normalizeHelpRecords(value).map((record, index) => ({
    ...record,
    index,
    modeLabel: localize(record.mode === 'ability' ? 'SDR5E.HelpAction.AbilityMode' : 'SDR5E.HelpAction.AttackMode'),
    proficiencyLabel: record.mode === 'ability'
      ? helpProficiencyOptions(systemData, localize).find((option) => option.kind === record.proficiencyKind && option.key === record.proficiencyKey)?.label || record.proficiencyKey
      : '',
    description: localize(record.mode === 'ability' ? 'SDR5E.HelpAction.AbilityRecord' : 'SDR5E.HelpAction.AttackRecord')
      .replace('{ally}', record.allyName)
      .replace('{enemy}', record.enemyName || '')
      .replace('{proficiency}', record.mode === 'ability'
        ? (helpProficiencyOptions(systemData, localize).find((option) => option.kind === record.proficiencyKind && option.key === record.proficiencyKey)?.label || record.proficiencyKey)
        : ''),
  }));
  const proficiencies = helpProficiencyOptions(systemData, localize).map((option) => ({
    ...option,
    value: `${option.kind}:${option.key}`,
  }));
  return {
    records,
    proficiencies,
    hasProficiencies: proficiencies.length > 0,
    title: localize('SDR5E.HelpAction.Title'),
    note: localize('SDR5E.HelpAction.Note'),
    abilityMode: localize('SDR5E.HelpAction.AbilityMode'),
    attackMode: localize('SDR5E.HelpAction.AttackMode'),
    allyLabel: localize('SDR5E.HelpAction.Ally'),
    enemyLabel: localize('SDR5E.HelpAction.Enemy'),
    proficiencyLabel: localize('SDR5E.HelpAction.Proficiency'),
    recordLabel: localize('SDR5E.HelpAction.Record'),
    clearLabel: localize('SDR5E.HelpAction.Clear'),
    removeLabel: localize('SDR5E.HelpAction.Remove'),
    abilityHint: localize('SDR5E.HelpAction.AbilityHint'),
    attackHint: localize('SDR5E.HelpAction.AttackHint'),
    invalidTarget: localize('SDR5E.HelpAction.InvalidTarget'),
    unavailableProficiency: localize('SDR5E.HelpAction.UnavailableProficiency'),
    saveFailed: localize('SDR5E.HelpAction.SaveFailed'),
    modeOptions: [
      { key: 'skill', label: localize('SDR5E.HelpAction.Skill') },
      { key: 'tool', label: localize('SDR5E.HelpAction.Tool') },
    ],
  };
}
