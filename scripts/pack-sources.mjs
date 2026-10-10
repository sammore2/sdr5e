import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'ruleset.json'), 'utf8'));
const packNames = manifest.compendiums.filter((entry) => entry.endsWith('.sqlite'));
const sourceRoot = path.join(root, 'packs', 'source');

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid SQLite identifier: ${value}`);
  return `"${value}"`;
}

function snapshotPack(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tableRows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tables = tableRows.map(({ name, sql }) => {
      const table = quoteIdentifier(name);
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
      if (!columns.length || !sql) throw new Error(`Missing schema or columns in ${path.basename(file)}:${name}`);
      const order = columns.map(quoteIdentifier).join(', ');
      const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()
        .map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
      return { name, schema: sql, columns, rows };
    });
    if (!tables.some((table) => table.name === 'entries')) throw new Error(`No entries table in ${path.basename(file)}`);
    return { format: 1, pack: path.basename(file), tables };
  } finally {
    db.close();
  }
}

async function exportSources() {
  await mkdir(sourceRoot, { recursive: true });
  for (const pack of packNames) {
    const snapshot = snapshotPack(path.join(root, pack));
    await writeFile(path.join(sourceRoot, `${path.basename(pack, '.sqlite')}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }
  console.log(`Exported versioned sources for ${packNames.length} SQLite compendiums to packs/source.`);
}

async function buildSources(outputDirectory) {
  const outputRoot = path.resolve(outputDirectory || path.join(os.tmpdir(), 'srd5e-packs-rebuilt'));
  await mkdir(outputRoot, { recursive: true });
  for (const pack of packNames) {
    const sourcePath = path.join(sourceRoot, `${path.basename(pack, '.sqlite')}.json`);
    const source = JSON.parse(await readFile(sourcePath, 'utf8'));
    if (source.format !== 1 || source.pack !== path.basename(pack) || !Array.isArray(source.tables)) {
      throw new Error(`Unsupported or mismatched pack source: ${sourcePath}`);
    }
    const outputPath = path.join(outputRoot, path.basename(pack));
    const db = new DatabaseSync(outputPath);
    try {
      db.exec('PRAGMA journal_mode = DELETE;');
      db.exec('BEGIN IMMEDIATE;');
      for (const table of source.tables) {
        const tableName = quoteIdentifier(table.name);
        const columns = table.columns.map(quoteIdentifier);
        if (!table.schema.startsWith('CREATE TABLE')) throw new Error(`Invalid table schema in ${sourcePath}:${table.name}`);
        db.exec(table.schema);
        if (!table.rows.length) continue;
        const placeholders = table.columns.map(() => '?').join(', ');
        const insert = db.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`);
        for (const row of table.rows) insert.run(...table.columns.map((column) => row[column] ?? null));
      }
      db.exec('COMMIT;');
      const integrity = db.prepare('PRAGMA integrity_check').get();
      if (integrity?.integrity_check !== 'ok') throw new Error(`Integrity check failed for ${outputPath}`);
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch { /* transaction may already be closed */ }
      throw error;
    } finally {
      db.close();
    }
    if (JSON.stringify(snapshotPack(outputPath)) !== JSON.stringify(source)) {
      throw new Error(`Rebuilt pack differs from its versioned source: ${outputPath}`);
    }
  }
  console.log(`Rebuilt ${packNames.length} SQLite compendiums at ${outputRoot}.`);
}

export async function verifyPackSources() {
  const problems = [];
  for (const pack of packNames) {
    const sourcePath = path.join(sourceRoot, `${path.basename(pack, '.sqlite')}.json`);
    try {
      const source = JSON.parse(await readFile(sourcePath, 'utf8'));
      const current = snapshotPack(path.join(root, pack));
      if (JSON.stringify(current) !== JSON.stringify(source)) problems.push(`${pack}: versioned source differs from compiled SQLite`);
    } catch (error) {
      problems.push(`${pack}: ${error.message}`);
    }
  }
  return problems;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [mode = 'export', outputDirectory] = process.argv.slice(2);
  if (mode === 'export') await exportSources();
  else if (mode === 'build') await buildSources(outputDirectory);
  else throw new Error('Usage: node scripts/pack-sources.mjs [export | build [output-directory]]');
}
