import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { verifyPackSources } from './pack-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'ruleset.json'), 'utf8'));
const problems = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const runtimeFiles = (await walk(path.join(root, 'scripts'))).filter((file) => file.endsWith('.mjs'));
runtimeFiles.push(path.join(root, manifest.client));
for (const file of runtimeFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) problems.push(`${path.relative(root, file)}: ${result.stderr || result.stdout}`);
}

const refs = [manifest.client, ...manifest.styles, ...manifest.languages.map((entry) => entry.path), ...manifest.compendiums];
for (const ref of refs) {
  try {
    if (!(await stat(path.join(root, ref))).isFile()) problems.push(`Manifest reference is not a file: ${ref}`);
  } catch {
    problems.push(`Missing manifest reference: ${ref}`);
  }
}

for (const pack of manifest.compendiums) {
  if (!pack.endsWith('.sqlite')) continue;
  let db;
  try {
    db = new DatabaseSync(path.join(root, pack), { readOnly: true });
    const result = db.prepare('PRAGMA integrity_check').get();
    if (result?.integrity_check !== 'ok') problems.push(`${pack}: integrity_check returned ${JSON.stringify(result)}`);
  } catch (error) {
    problems.push(`${pack}: ${error.message}`);
  } finally {
    db?.close();
  }
}

for (const language of manifest.languages) {
  try {
    JSON.parse(await readFile(path.join(root, language.path), 'utf8'));
  } catch (error) {
    problems.push(`${language.path}: ${error.message}`);
  }
}

problems.push(...await verifyPackSources());

if (problems.length) {
  console.error(`SDR5E verification failed (${problems.length} issue${problems.length === 1 ? '' : 's'}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`SDR5E verification passed: ${runtimeFiles.length} JavaScript entry points, ${refs.length} manifest references, ${manifest.compendiums.length} compendiums, and ${manifest.languages.length} language files.`);
}
