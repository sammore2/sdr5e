import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.resolve(process.argv[2] || '');
const manifestPath = process.argv[3] || 'ruleset.json';
if (!process.argv[2] || !process.argv[3]) {
  console.error('Usage: node scripts/verify-package.mjs <package.zip> <manifest-path>');
  process.exit(2);
}

function readZipEntries(bytes) {
  const minimumOffset = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record is missing.');

  const count = bytes.readUInt16LE(eocd + 10);
  const centralDirectoryOffset = bytes.readUInt32LE(eocd + 16);
  if (count === 0xffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error('ZIP64 packages are not supported by this verifier.');
  }

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid central-directory entry at index ${index}.`);
    }
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push(name.replace(/^(?:\.\/)+/, '').replace(/\/$/, ''));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const [archiveBytes, manifestText] = await Promise.all([
  readFile(archivePath),
  readFile(path.resolve(root, manifestPath), 'utf8'),
]);
const entries = new Set(readZipEntries(archiveBytes));
const manifest = JSON.parse(manifestText);
const forbidden = /^(?:\.git|\.github|\.agents|\.dev|\.planning|\.codex|\.vite|node_modules|tests)(?:\/|$)/;
const forbiddenFiles = new Set([
  '.gitignore', '.gitattributes', 'package.json', 'package-lock.json',
  'scripts/verify.mjs', 'scripts/verify-package.mjs',
]);
const leaked = [...entries].filter((entry) => forbidden.test(entry) || forbiddenFiles.has(entry));
const required = [
  manifestPath,
  manifest.client,
  ...manifest.styles,
  ...manifest.languages.map((language) => language.path),
  ...manifest.compendiums,
];
const missing = required.filter((entry) => !entries.has(entry));

if (leaked.length || missing.length) {
  console.error(JSON.stringify({ leaked, missing }, null, 2));
  process.exit(1);
}

console.log(`Package verified: ${entries.size} entries; internal files excluded; all ${required.length - 1} manifest references included.`);
