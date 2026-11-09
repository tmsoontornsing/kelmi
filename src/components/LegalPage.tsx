import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ThemeToggle } from './ThemeToggle';
import { COMPANY } from '../links';

// Renders content/<doc>.md, which is copied from the app's legal text (apps/mobile: node scripts/build-legal.mjs).
export type LegalDocId = 'terms' | 'privacy' | 'consumer-health-data';

export function LegalPage({ doc }: { doc: LegalDocId }) {
  const lines = readFileSync(join(process.cwd(), 'content', `${doc}.md`), 'utf8').split('\n');
  const out: React.ReactNode[] = [];
  let title = '';
  let summary = '';
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length}>{list.map((i, n) => <li key={n}>{i}</li>)}</ul>);
    list = [];
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (l.startsWith('# ')) title = l.slice(2);
    else if (l.startsWith('> ')) summary = l.slice(2);
    else if (l.startsWith('## ')) { flush(); out.push(<h2 key={out.length}>{l.slice(3)}</h2>); }
    else if (l.startsWith('- ')) list.push(l.slice(2));
    else if (l.trim()) { flush(); out.push(<p key={out.length}>{l}</p>); }
  }
  flush();
  return <LegalShell title={title} summary={summary}>{out}</LegalShell>;
}

// The page chrome shared by the legal documents and the delete-account page.
export function LegalShell({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="/" aria-label="Kelmi home"><span className="pipbadge"><img src="/pip-mark.svg" alt="" /></span>Kelmi</a>
          <div className="navright"><ThemeToggle /></div>
        </div>
      </header>
      <main className="wrap legal">
        <a className="back" href="/">← Back to Kelmi</a>
        <h1 className="display">{title}</h1>
        <p className="summary">{summary}</p>
        <article>{children}</article>
      </main>
      <footer><div className="wrap"><div className="row">
        <span className="footnote">© {new Date().getFullYear()} {COMPANY}</span>
        <nav aria-label="Legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/consumer-health-data">Health data</a><a href="/delete-account">Delete account</a></nav>
      </div></div></footer>
    </>
  );
}
