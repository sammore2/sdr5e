export const COVER_DEGREES = Object.freeze({
  NONE: 'none',
  HALF: 'half',
  THREE_QUARTERS: 'three_quarters',
  TOTAL: 'total',
});

const COVER_BONUSES = Object.freeze({
  [COVER_DEGREES.NONE]: 0,
  [COVER_DEGREES.HALF]: 2,
  [COVER_DEGREES.THREE_QUARTERS]: 5,
  [COVER_DEGREES.TOTAL]: 0,
});

export function strongestMarkedCover(markers = []) {
  const values = new Set(Array.isArray(markers) ? markers : []);
  if (values.has('cover-total')) return COVER_DEGREES.TOTAL;
  if (values.has('cover-3q')) return COVER_DEGREES.THREE_QUARTERS;
  if (values.has('cover-half')) return COVER_DEGREES.HALF;
  return COVER_DEGREES.NONE;
}

export function resolveCoverForAttack(degree, baseArmorClass) {
  if (!Object.hasOwn(COVER_BONUSES, degree) || !Number.isFinite(Number(baseArmorClass))) {
    return { valid: false, directlyTargetable: false, armorClass: null, bonus: 0 };
  }
  if (degree === COVER_DEGREES.TOTAL) {
    return { valid: true, directlyTargetable: false, armorClass: null, bonus: 0 };
  }
  const bonus = COVER_BONUSES[degree];
  return { valid: true, directlyTargetable: true, armorClass: Number(baseArmorClass) + bonus, bonus };
}

export function resolveCoverForDexteritySave(degree, effectOriginOppositeCover) {
  if (!Object.hasOwn(COVER_BONUSES, degree)) return { valid: false, bonus: 0 };
  if (effectOriginOppositeCover !== true || degree === COVER_DEGREES.TOTAL) return { valid: true, bonus: 0 };
  return { valid: true, bonus: COVER_BONUSES[degree] };
}

/** Resolve the cover choice before a Dexterity save without coupling the rules to a dialog implementation. */
export async function chooseDexteritySaveCoverBonus(abilityKey, markers, chooseDegree) {
  const values = markers instanceof Set ? [...markers] : (Array.isArray(markers) ? markers : []);
  if (abilityKey !== 'dex' || !values.some((marker) => ['cover-half', 'cover-3q'].includes(marker))) return 0;
  const degree = await chooseDegree({
    defaultDegree: strongestMarkedCover(values),
    options: [COVER_DEGREES.NONE, COVER_DEGREES.HALF, COVER_DEGREES.THREE_QUARTERS],
  });
  if (!degree) return null;
  return resolveCoverForDexteritySave(degree, degree !== COVER_DEGREES.NONE).bonus;
}
