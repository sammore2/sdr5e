// ══════════════════════════════════════════════════════════════════════════
// SDR5E — scripts/utils.mjs
// Component Version: 0.1.0
// Small standalone helpers shared across modules.
// ══════════════════════════════════════════════════════════════════════════

export function fmtMod(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

/**
 * Fills in any key missing from `target` using `defaults`, recursively —
 * plain objects only (arrays/primitives are taken as-is, never merged
 * field-by-field). Actors created before a schema field existed (e.g.
 * `resources.hitDice` added mid-project) keep whatever was already saved
 * and only gain the NEW field, so this never overwrites real player data,
 * it only backfills gaps left by schema growth over time.
 */
export function mergeDefaults(target, defaults) {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return target ?? defaults;
  for (const key of Object.keys(defaults)) {
    const defVal = defaults[key];
    if (target[key] === undefined) {
      target[key] = defVal;
    } else if (
      typeof defVal === 'object' && defVal !== null && !Array.isArray(defVal) &&
      typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])
    ) {
      mergeDefaults(target[key], defVal);
    }
  }
  return target;
}

export function setPathValue(obj, path, value) {
  const parts = path.split('.');
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
}

// Advantage/disadvantage on d20 rolls (`sdr5eRoll`'s `advantage` param) was
// wired into the roll engine from the start but nothing ever actually
// triggered it — every ability/skill/save/attack roll call site passed 0
// (normal), with no UI path to change that. Real dnd5e-Foundry's convention
// is Shift-click = advantage, Ctrl-click = disadvantage; `onAction(action,
// id, target)` only gets the clicked element, not the click event, so
// there's no per-click modifier-key info to read — tracked globally instead
// via keydown/keyup, same approach a real hand would use to hold a key
// before clicking. Registered once at module load (this file is imported
// by every sheet).
let _shiftDown = false;
let _ctrlDown = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') _shiftDown = true; if (e.key === 'Control') _ctrlDown = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') _shiftDown = false; if (e.key === 'Control') _ctrlDown = false; });
  window.addEventListener('blur', () => { _shiftDown = false; _ctrlDown = false; });
}

/** 1 = advantage (Shift held), -1 = disadvantage (Ctrl held), 0 = normal. Shift wins if both are held. */
export function currentAdvantageMode() {
  if (_shiftDown) return 1;
  if (_ctrlDown) return -1;
  return 0;
}
