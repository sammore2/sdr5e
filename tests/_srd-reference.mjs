import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Local-only SRD 5.2 markdown reference. The .dev/ folder is gitignored, so it is
// absent on CI. Tests that need a reference file skip (instead of failing with ENOENT)
// when it is missing, and still run locally where the folder exists.
const SRD_DIR = new URL('../.dev/srd5.2_markdown/', import.meta.url);

export function srdReferencePath(name) {
  return fileURLToPath(new URL(name, SRD_DIR));
}

export function hasSrdReference(name) {
  return existsSync(srdReferencePath(name));
}

// Value for node:test's `skip` option: false when every named reference exists,
// otherwise a reason string naming the missing files.
export function srdSkip(...names) {
  const missing = names.filter((name) => !hasSrdReference(name));
  if (missing.length === 0) return false;
  return `local SRD reference not present (gitignored): .dev/srd5.2_markdown/${missing.join(', ')}`;
}
