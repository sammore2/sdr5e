const LIFE_DOMAIN_SPELLS = Object.freeze({
  3: ['Aid', 'Bless', 'Cure Wounds', 'Lesser Restoration'],
  5: ['Mass Healing Word', 'Revivify'],
  7: ['Aura of Life', 'Death Ward'],
  9: ['Greater Restoration', 'Mass Cure Wounds'],
});
const OATH_OF_DEVOTION_SPELLS = Object.freeze({
  3: ['Protection from Evil and Good', 'Shield of Faith'],
  5: ['Aid', 'Zone of Truth'],
  9: ['Beacon of Hope', 'Dispel Magic'],
  13: ['Freedom of Movement', 'Guardian of Faith'],
  17: ['Commune', 'Flame Strike'],
});
const CIRCLE_LAND_SPELLS = Object.freeze({
  arid: { 3: ['Blur', 'Burning Hands', 'Fire Bolt'], 5: ['Fireball'], 7: ['Blight'], 9: ['Wall of Stone'] },
  polar: { 3: ['Fog Cloud', 'Hold Person', 'Ray of Frost'], 5: ['Sleet Storm'], 7: ['Ice Storm'], 9: ['Cone of Cold'] },
  temperate: { 3: ['Misty Step', 'Shocking Grasp', 'Sleep'], 5: ['Lightning Bolt'], 7: ['Freedom of Movement'], 9: ['Tree Stride'] },
  tropical: { 3: ['Acid Splash', 'Ray of Sickness', 'Web'], 5: ['Stinking Cloud'], 7: ['Polymorph'], 9: ['Insect Plague'] },
});

const normalize = (value) => String(value || '').trim().toLocaleLowerCase();

export function subclassAlwaysPreparedSpellNames(classIdentifier, subclassName, classLevel) {
  const normalizedSubclass = normalize(subclassName);
  const grantTable = classIdentifier === 'cleric' && normalizedSubclass === 'life domain'
    ? { subclassName: 'Life Domain', grantIdPrefix: 'life-domain', spells: LIFE_DOMAIN_SPELLS }
    : classIdentifier === 'paladin' && normalizedSubclass === 'oath of devotion'
      ? { subclassName: 'Oath of Devotion', grantIdPrefix: 'oath-of-devotion', spells: OATH_OF_DEVOTION_SPELLS }
      : null;
  if (!grantTable) return [];
  const level = Number(classLevel);
  if (!Number.isInteger(level) || level < 1 || level > 20) return [];
  return Object.entries(grantTable.spells)
    .filter(([grantLevel]) => Number(grantLevel) <= level)
    .flatMap(([grantLevel, names]) => names.map((name) => ({
      classIdentifier,
      subclassName: grantTable.subclassName,
      grantLevel: Number(grantLevel),
      name,
      grantId: `${grantTable.grantIdPrefix}:${normalize(name).replaceAll(' ', '-')}`,
    })));
}

export function resolveSubclassAlwaysPreparedSpells(classIdentifier, subclassName, classLevel, spellEntries) {
  const grants = subclassAlwaysPreparedSpellNames(classIdentifier, subclassName, classLevel);
  if (!grants.length) return { valid: true, grants: [], errors: [] };
  if (!Array.isArray(spellEntries)) return { valid: false, grants: [], errors: ['spell-data-unavailable'] };
  const resolved = [];
  const errors = [];
  for (const grant of grants) {
    // Some subclass grants can be outside the base class list, so the grant
    // table, not the ordinary list membership, is the source of eligibility.
    const entry = spellEntries.find((candidate) => normalize(candidate.name) === normalize(grant.name));
    if (!entry || Number(entry.data?.spellLevel) < 0) {
      errors.push(`grant-spell-unavailable:${grant.grantId}`);
      continue;
    }
    resolved.push({ ...grant, entry });
  }
  return { valid: errors.length === 0, grants: resolved, errors };
}

export function circleLandAlwaysPreparedSpellNames(terrain, classLevel) {
  const normalizedTerrain = normalize(terrain);
  const table = CIRCLE_LAND_SPELLS[normalizedTerrain];
  const level = Number(classLevel);
  if (!table || !Number.isInteger(level) || level < 3 || level > 20) return [];
  return Object.entries(table).filter(([grantLevel]) => Number(grantLevel) <= level)
    .flatMap(([grantLevel, names]) => names.map((name) => ({
      classIdentifier: 'druid', subclassName: 'Circle of the Land', grantLevel: Number(grantLevel), name,
      grantId: `circle-land:${normalizedTerrain}:${normalize(name).replaceAll(' ', '-')}`,
    })));
}

export function resolveCircleLandAlwaysPreparedSpells(terrain, classLevel, spellEntries) {
  const grants = circleLandAlwaysPreparedSpellNames(terrain, classLevel);
  if (!grants.length) return { valid: false, grants: [], errors: ['circle-land-choice-required'] };
  if (!Array.isArray(spellEntries)) return { valid: false, grants: [], errors: ['spell-data-unavailable'] };
  const resolved = [];
  const errors = [];
  for (const grant of grants) {
    const entry = spellEntries.find((candidate) => normalize(candidate.name) === normalize(grant.name));
    if (!entry || Number(entry.data?.spellLevel) < 0) {
      errors.push(`grant-spell-unavailable:${grant.grantId}`);
      continue;
    }
    resolved.push({ ...grant, entry });
  }
  return { valid: errors.length === 0, grants: resolved, errors };
}

export function subclassSpellGrantItemData(grant, { independentlyOwned = false, priorData = null } = {}) {
  return {
    ...grant.entry.data,
    prepared: true,
    alwaysPrepared: true,
    sourceClassIdentifier: grant.classIdentifier,
    subclassSpellGrantId: grant.grantId,
    subclassSpellGrantIds: [grant.grantId],
    subclassSpellGrantOwned: !independentlyOwned,
    ...(independentlyOwned ? { subclassSpellGrantPrevious: {
      prepared: !!priorData?.prepared, alwaysPrepared: !!priorData?.alwaysPrepared,
    } } : {}),
  };
}

export function planSubclassSpellGrantReconciliation(existingItems, classIdentifier, desiredGrants, managedGrantPrefix) {
  const grants = desiredGrants || [];
  const desiredByName = new Map(grants.map((grant) => [normalize(grant.name), grant]));
  const managedPrefix = String(managedGrantPrefix || '');
  const writes = [];
  const managedItems = (existingItems || []).filter((item) => item.type === 'spell'
    && (item.system || item.data || {}).sourceClassIdentifier === classIdentifier
    && ((item.system || item.data || {}).subclassSpellGrantIds || [
      (item.system || item.data || {}).subclassSpellGrantId,
    ].filter(Boolean)).some((grantId) => String(grantId).startsWith(managedPrefix)));
  const handledNames = new Set();

  for (const item of managedItems) {
    const current = item.system || item.data || {};
    const currentIds = [...new Set(current.subclassSpellGrantIds || [current.subclassSpellGrantId].filter(Boolean))];
    const nextIds = currentIds.filter((grantId) => !String(grantId).startsWith(managedPrefix));
    const desired = desiredByName.get(normalize(item.name));
    if (desired && !nextIds.includes(desired.grantId)) nextIds.push(desired.grantId);
    if (desired) handledNames.add(normalize(item.name));
    if (!nextIds.length && current.subclassSpellGrantOwned === true) {
      writes.push({ kind: 'delete', item });
      continue;
    }
    if (!nextIds.length) {
      const previous = current.subclassSpellGrantPrevious || { prepared: false, alwaysPrepared: false };
      const data = { ...current, prepared: !!previous.prepared, alwaysPrepared: !!previous.alwaysPrepared };
      delete data.subclassSpellGrantId;
      delete data.subclassSpellGrantIds;
      delete data.subclassSpellGrantOwned;
      delete data.subclassSpellGrantPrevious;
      writes.push({ kind: 'update', item, data });
      continue;
    }
    const nextId = desired?.grantId || nextIds[0];
    const grantData = desired ? desired.entry.data : {};
    writes.push({ kind: 'update', item, data: {
      ...current, ...grantData, prepared: true, alwaysPrepared: true,
      sourceClassIdentifier: classIdentifier, subclassSpellGrantId: nextId, subclassSpellGrantIds: nextIds,
    } });
  }

  for (const grant of grants) {
    if (handledNames.has(normalize(grant.name))) continue;
    const sameClassSpell = (existingItems || []).find((item) => item.type === 'spell'
      && normalize(item.name) === normalize(grant.name)
      && (item.system || item.data || {}).sourceClassIdentifier === classIdentifier);
    const data = sameClassSpell?.system || sameClassSpell?.data || {};
    if (sameClassSpell) {
      const currentIds = [...new Set(data.subclassSpellGrantIds || [data.subclassSpellGrantId].filter(Boolean))];
      if (currentIds.includes(grant.grantId)) { handledNames.add(normalize(grant.name)); continue; }
      const previous = data.subclassSpellGrantPrevious || { prepared: !!data.prepared, alwaysPrepared: !!data.alwaysPrepared };
      writes.push({ kind: 'update', item: sameClassSpell, data: {
        ...data, ...grant.entry.data, prepared: true, alwaysPrepared: true,
        sourceClassIdentifier: classIdentifier, subclassSpellGrantId: grant.grantId,
        subclassSpellGrantIds: [...currentIds, grant.grantId], subclassSpellGrantPrevious: previous,
        subclassSpellGrantOwned: data.subclassSpellGrantOwned === true,
      } });
    } else {
      writes.push({ kind: 'create', name: grant.name, type: 'spell', data: subclassSpellGrantItemData(grant) });
    }
    handledNames.add(normalize(grant.name));
  }
  return writes;
}

export function planSubclassSpellGrantWrites(grants, existingItems = []) {
  const writes = [];
  for (const grant of grants || []) {
    const sameClassSpell = existingItems.find((item) => item.type === 'spell'
      && normalize(item.name) === normalize(grant.name)
      && (item.system || item.data || {}).sourceClassIdentifier === grant.classIdentifier);
    const data = subclassSpellGrantItemData(grant);
    if (sameClassSpell) {
      const current = sameClassSpell.system || sameClassSpell.data || {};
      if (current.subclassSpellGrantId === grant.grantId && current.alwaysPrepared === true && current.prepared === true) continue;
      const currentIds = [...new Set(current.subclassSpellGrantIds || [current.subclassSpellGrantId].filter(Boolean))];
      const prior = current.subclassSpellGrantPrevious || { prepared: !!current.prepared, alwaysPrepared: !!current.alwaysPrepared };
      writes.push({ kind: 'update', item: sameClassSpell, data: {
        ...current, ...data, subclassSpellGrantId: grant.grantId,
        subclassSpellGrantIds: [...currentIds, grant.grantId], subclassSpellGrantOwned: current.subclassSpellGrantOwned === true,
        subclassSpellGrantPrevious: prior,
      } });
    } else {
      writes.push({ kind: 'create', name: grant.name, type: 'spell', data });
    }
  }
  return writes;
}
