// Writes the Terms of Service, Privacy Policy and Consumer Health Data Privacy Policy from src/legal/documents.ts to
// legal/*.md at the repo root and to apps/web/content/*.md (which the website renders). The app shows the same text, so edit documents.ts, not the
// Markdown, then run: node scripts/build-legal.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The app imports without file extensions, as Metro allows; Node needs them, so retry with .ts.
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
const { LEGAL_DOCS } = await import('../src/legal/documents.ts');
const { legalReady } = await import('../src/legal/config.ts');

const outDirs = [join(root, '../../legal'), join(root, '../web/content')];
for (const d of outDirs) mkdirSync(d, { recursive: true });

for (const doc of Object.values(LEGAL_DOCS)) {
  const body = doc.blocks
    .map((b) => ('h' in b ? `## ${b.h}` : 'p' in b ? b.p.replace(/\n/g, '  \n') : b.list.map((i) => `- ${i}`).join('\n')))
    .join('\n\n');
  for (const d of outDirs) writeFileSync(join(d, `${doc.id}.md`), `# Kelmi ${doc.title}\n\n${body}\n`);
}

console.log(`Wrote ${Object.values(LEGAL_DOCS).map((d) => d.id + '.md').join(', ')} to legal/ and apps/web/content/.`);
if (!legalReady()) console.warn('Placeholders remain in src/legal/config.ts. Fill them in before publishing.');
