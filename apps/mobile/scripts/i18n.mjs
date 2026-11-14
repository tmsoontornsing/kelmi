// Checks Kelmi's translations. Every string passed to t() or tn() in src/ is a UI key, and every piece of food data
// (recipe titles and steps, ingredients, aisles, units, the example data in data/mock.ts) is a content key. Each
// language has src/i18n/locales/ui/<code>.json and content/<code>.json mapping the English to its translation.
//
//   node scripts/i18n.mjs                      how many keys each language is missing; exits 1 if any are
//   node scripts/i18n.mjs --missing th ui      the missing UI keys for Thai, as JSON to fill in
//   node scripts/i18n.mjs --missing th content the missing content keys for Thai
//   node scripts/i18n.mjs --prune              removes keys the app no longer uses from every file
//
// Needs Node 23.6 or later, which runs the TypeScript data files directly.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node warns that data/mock.ts has no module type; it is only read here, so the warning is noise.
process.removeAllListeners('warning');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const locales = join(src, 'i18n', 'locales');
const catalogDir = join(root, '..', '..', 'supabase', 'catalog', 'starter');
const LANGS = ['es', 'zh', 'hi', 'fr', 'pt', 'th', 'ja'];

// ---- UI keys: string literals passed to t( or tn(.

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'locales' ? [] : files(join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );

const STRING = String.raw`'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"`;
const unescape = (s) => s.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch));
const literal = (m, at) => unescape(m[at] ?? m[at + 1]);

export function uiKeys() {
  const keys = new Set();
  for (const file of [...files(src), ...files(join(root, 'widgets'))]) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(new RegExp(String.raw`\bt\(\s*(?:${STRING})`, 'g'))) keys.add(literal(m, 1));
    for (const m of text.matchAll(new RegExp(String.raw`\btn\(\s*[^,]+,\s*(?:${STRING})\s*,\s*(?:${STRING})`, 'g'))) {
      keys.add(literal(m, 1));
      keys.add(literal(m, 3));
    }
  }
  // Language names, translated with t(l.english) in the picker.
  const index = readFileSync(join(src, 'i18n', 'index.tsx'), 'utf8');
  for (const m of index.matchAll(/english: '([^']+)'/g)) keys.add(m[1]);
  keys.delete('');
  return keys;
}

// ---- Content keys: the example data and the recipe catalog.

// "Chicken breast, 1.5 lb" is a name and a unit, translated apart (see line() in src/i18n).
const addLine = (keys, text) => {
  const comma = text.lastIndexOf(', ');
  if (comma < 0) return keys.add(text);
  keys.add(text.slice(0, comma));
  const m = text.slice(comma + 2).match(/^([\d.,/½¼¾]+)\s*(.*)$/);
  if (!m) keys.add(text.slice(comma + 2));
  else if (m[2]) keys.add(m[2]);
};

export async function contentKeys() {
  const keys = new Set();
  const mock = await import(join(src, 'data', 'mock.ts'));
  for (const m of Object.values(mock.MEALS)) {
    keys.add(m.name);
    if (!/^\d+ min( prep)?$/.test(m.minutes)) keys.add(m.minutes);
  }
  Object.values(mock.MEAL_LABELS).forEach((v) => keys.add(v));
  mock.DAYS.flat().forEach((d) => keys.add(d));
  for (const r of Object.values(mock.RECIPES)) {
    r.ingredients.forEach((i) => addLine(keys, i.name));
    r.steps.forEach((s) => keys.add(s));
  }
  for (const a of mock.GROCERIES) {
    keys.add(a.name);
    a.items.forEach((i) => addLine(keys, i.name));
  }
  for (const s of mock.PANTRY) {
    keys.add(s.name);
    s.items.forEach((i) => keys.add(i));
  }
  for (const d of mock.DIETS) [d.name, d.detail].forEach((v) => keys.add(v));
  for (const g of [...mock.GOALS, ...mock.MEAT_LEVELS]) [g.name, g.detail].forEach((v) => keys.add(v));
  for (const a of mock.APPLIANCES) [a.name, a.detail].forEach((v) => keys.add(v));
  for (const p of mock.PLANS) [p.name, p.per, p.billed, p.badge].forEach((v) => keys.add(v));
  [...mock.ALLERGIES, ...mock.DISLIKES, ...mock.LIKES].forEach((v) => keys.add(v));

  const { parseCatalog } = await import(join(root, '..', '..', 'supabase', 'scripts', 'recipe-csv.ts'));
  const read = (f) => readFileSync(join(catalogDir, f), 'utf8');
  const parsed = parseCatalog({ ingredients: read('ingredients.csv'), recipes: read('recipes.csv'), recipeIngredients: read('recipe_ingredients.csv') });
  const catalog = parsed.catalog ?? parsed;
  for (const i of catalog.ingredients) [i.name, i.aisle, i.unit].forEach((v) => keys.add(v));
  for (const r of catalog.recipes) {
    keys.add(r.title);
    r.steps.split('\n').map((s) => s.trim()).filter(Boolean).forEach((s) => keys.add(s));
  }
  for (const l of catalog.recipeIngredients) keys.add(l.unit);

  // Food names kept in English in a screen's own constants, marked with an `// i18n: content` comment on the line
  // before the declaration. Bare strings in the list and `name:` values count.
  for (const f of files(src)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\/\/ i18n: content\n(?:\/\/.*\n)*const [^=]+=\s*\[([\s\S]*?)\];/g)) {
      for (const lit of m[1].matchAll(/(?:^|[\[,]\s*|name:\s*)'((?:\\.|[^'\\])*)'/gm)) keys.add(unescape(lit[1]));
    }
  }
  keys.delete('');
  return keys;
}

// ---- Report

const file = (kind, lang) => join(locales, kind, `${lang}.json`);
const load = (kind, lang) => JSON.parse(readFileSync(file(kind, lang), 'utf8'));
const save = (kind, lang, dict) => writeFileSync(file(kind, lang), JSON.stringify(dict, null, 2) + '\n');

const wanted = { ui: uiKeys(), content: await contentKeys() };
const args = process.argv.slice(2);

if (args[0] === '--missing') {
  const [, lang, kind = 'ui'] = args;
  const dict = load(kind, lang);
  const missing = Object.fromEntries([...wanted[kind]].filter((k) => !dict[k]).map((k) => [k, '']));
  console.log(JSON.stringify(missing, null, 2));
} else if (args[0] === '--prune') {
  for (const lang of LANGS)
    for (const kind of ['ui', 'content']) {
      const dict = load(kind, lang);
      save(kind, lang, Object.fromEntries(Object.entries(dict).filter(([k]) => wanted[kind].has(k))));
    }
  console.log('Pruned keys the app no longer uses.');
} else {
  let gaps = 0;
  console.log(`UI keys: ${wanted.ui.size}. Content keys: ${wanted.content.size}.`);
  for (const lang of LANGS) {
    const report = ['ui', 'content'].map((kind) => {
      const dict = load(kind, lang);
      const missing = [...wanted[kind]].filter((k) => !dict[k]);
      // A translation must keep every {placeholder} its English has.
      const broken = [...wanted[kind]].filter((k) => dict[k] && (k.match(/\{\w+\}/g) ?? []).some((p) => !dict[k].includes(p)));
      gaps += missing.length + broken.length;
      return `${kind} ${missing.length} missing${broken.length ? `, ${broken.length} with lost placeholders (${broken.slice(0, 3).join(' | ')})` : ''}`;
    });
    console.log(`${lang}: ${report.join('; ')}`);
  }
  process.exit(gaps ? 1 : 0);
}
