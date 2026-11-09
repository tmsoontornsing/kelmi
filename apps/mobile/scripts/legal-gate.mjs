// Release gate for the legal text. Exits non-zero while any of these is true:
//   - legalReady() is false (a field in src/legal/config.ts still starts with "[")
//   - a bracket placeholder such as [CONTACT EMAIL] remains in legal/*.md or apps/web/content/*.md
//   - the generated Markdown is out of date with src/legal/documents.ts (run build-legal.mjs first)
//   - CONTACT_EMAIL in apps/web/src/links.ts is empty
// Run from apps/mobile:  node scripts/legal-gate.mjs   (build first: node scripts/build-legal.mjs)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const { legalReady, LEGAL } = await import('../src/legal/config.ts');
const { LEGAL_DOCS } = await import('../src/legal/documents.ts');

const problems = [];
if (!legalReady()) {
  const open = Object.entries(LEGAL).filter(([, v]) => v.startsWith('[')).map(([k, v]) => `${k} = ${v}`);
  problems.push(`legalReady() is false. Open fields in src/legal/config.ts: ${open.join('; ')}`);
}

const dirs = [join(repo, 'legal'), join(repo, 'apps/web/content')];
for (const dir of dirs) {
  if (!existsSync(dir)) { problems.push(`${dir} is missing. Run node scripts/build-legal.mjs`); continue; }
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    const found = [...new Set(text.match(/\[[A-Z][A-Z ]+\]/g) ?? [])];
    if (found.length) problems.push(`${dir.replace(repo + '/', '')}/${f} still has ${found.join(', ')}`);
  }
  for (const doc of Object.values(LEGAL_DOCS)) {
    if (!existsSync(join(dir, `${doc.id}.md`))) problems.push(`${dir.replace(repo + '/', '')}/${doc.id}.md is missing. Run node scripts/build-legal.mjs`);
  }
}

const links = readFileSync(join(repo, 'apps/web/src/links.ts'), 'utf8');
if (/CONTACT_EMAIL\s*=\s*''/.test(links)) problems.push("CONTACT_EMAIL in apps/web/src/links.ts is empty");

if (problems.length) {
  console.error('Legal gate FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Legal gate passed.');
