/*
 * css-compare.mjs
 *
 * Compares two CSS files rule by rule and exits 1 on any difference.
 * Comments, whitespace, trailing semicolons and hex-colour case are ignored, so a LESS
 * build of unchanged CSS compares equal to the original, while any changed, missing, added or
 * reordered rule is reported.
 *
 * Usage:
 *   node css-compare.mjs <expected.css> <actual.css>
 *   node css-compare.mjs --self-test
 */
import fs from 'node:fs';

const GROUPING = ['@media', '@container', '@supports', '@layer'];

function norm(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*:\s*/g, ':')
    .replace(/;\s*$/, '')
    .replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => m.toLowerCase())
    // a leading-dot decimal is the same number as the zero-prefixed one (.2s equals 0.2s)
    .replace(/(^|[^0-9A-Za-z_.-])\.(\d)/g, '$10.$2')
    .trim();
}

// Selector combinators may be written with or without spaces (a>b equals a > b).
function normSel(value) {
  return norm(value).replace(/\s*([>+~])\s*/g, '$1');
}

function normBody(body) {
  return body
    .split(';')
    .map((d) => norm(d))
    .filter(Boolean)
    .join(';');
}

export function parseRules(text) {
  const src = text.replace(/\r/g, '');
  const rules = [];
  const ctx = [];
  let buf = '';
  let line = 1;
  let startLine = 1;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      line += (src.slice(i, stop).match(/\n/g) || []).length;
      i = stop;
      continue;
    }
    if (c === '{') {
      const head = buf.trim().startsWith('@') ? norm(buf) : normSel(buf);
      if (GROUPING.some((g) => head.startsWith(g))) {
        ctx.push(head);
        buf = '';
        i++;
        continue;
      }
      let depth = 1;
      let j = i + 1;
      while (j < n && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      const body = src.slice(i + 1, j - 1);
      rules.push({ ctx: ctx.join(' > '), sel: head, body: normBody(body), line: startLine });
      line += (src.slice(i, j).match(/\n/g) || []).length;
      i = j;
      buf = '';
      continue;
    }
    if (c === '"' || c === "'") {
      // copy a quoted string whole, so a ';' inside it (e.g. in a font URL) does not end the statement
      const end = src.indexOf(c, i + 1);
      const stop = end < 0 ? n : end + 1;
      buf += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '(') {
      const end = src.indexOf(')', i + 1);
      const stop = end < 0 ? n : end + 1;
      buf += src.slice(i, stop);
      line += (src.slice(i, stop).match(/\n/g) || []).length;
      i = stop;
      continue;
    }
    if (c === ';') {
      // top-level at-rule statement such as @import or @charset
      const stmt = norm(buf);
      if (stmt) rules.push({ ctx: ctx.join(' > '), sel: stmt, body: '', line: startLine });
      buf = '';
      i++;
      continue;
    }
    if (c === '}') {
      ctx.pop();
      buf = '';
      i++;
      continue;
    }
    if (buf.trim() === '' && !/\s/.test(c)) startLine = line;
    if (c === '\n') line++;
    buf += c;
    i++;
  }
  return rules;
}

export function compare(expectedText, actualText) {
  const a = parseRules(expectedText);
  const b = parseRules(actualText);
  const diffs = [];
  const max = Math.max(a.length, b.length);
  for (let k = 0; k < max; k++) {
    const x = a[k];
    const y = b[k];
    if (!x) {
      diffs.push(`extra rule #${k + 1} in actual: ${y.sel}`);
    } else if (!y) {
      diffs.push(`missing rule #${k + 1} (expected line ${x.line}): ${x.sel}`);
    } else if (x.ctx !== y.ctx || x.sel !== y.sel || x.body !== y.body) {
      diffs.push(`rule #${k + 1} differs (expected line ${x.line}): ${x.sel}`);
    }
    if (diffs.length >= 10) break;
  }
  return { expectedRules: a.length, actualRules: b.length, diffs };
}

if (process.argv[2] === '--self-test') {
  const base = '.a { color: #FFF; margin: 0 }\n@media (max-width: 1px) { .b { top: 1px; } }\n/* note */\n.c{x:y}';
  const same = '.a{color:#fff;margin:0;}\n@media (max-width:1px){.b{top:1px}}\n.c { x : y ; }';
  const moved = '.c{x:y}\n.a { color: #FFF; margin: 0 }\n@media (max-width: 1px) { .b { top: 1px; } }';
  const changed = '.a { color: #FFF; margin: 1px }\n@media (max-width: 1px) { .b { top: 1px; } }\n.c{x:y}';
  const ok = compare(base, same).diffs.length === 0;
  const orderCaught = compare(base, moved).diffs.length > 0;
  const valueCaught = compare(base, changed).diffs.length > 0;
  console.log(`self-test: equal=${ok} reorder-detected=${orderCaught} value-change-detected=${valueCaught}`);
  process.exit(ok && orderCaught && valueCaught ? 0 : 1);
}

const [expectedPath, actualPath] = process.argv.slice(2);
if (!expectedPath || !actualPath) {
  console.error('usage: node css-compare.mjs <expected.css> <actual.css>  |  --self-test');
  process.exit(2);
}
const result = compare(fs.readFileSync(expectedPath, 'utf8'), fs.readFileSync(actualPath, 'utf8'));
console.log(`expected rules: ${result.expectedRules} | actual rules: ${result.actualRules}`);
if (result.diffs.length) {
  console.log('DIFFERENT:');
  result.diffs.forEach((d) => console.log('  ' + d));
  process.exit(1);
}
console.log('IDENTICAL');
