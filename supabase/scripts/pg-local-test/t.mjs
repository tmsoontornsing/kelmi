// Tiny assertion helpers shared by the test scripts.
export const results = [];
export async function check(id, name, fn) {
  try { const detail = await fn(); results.push({ id, name, pass: true, detail: detail ?? '' }); }
  catch (e) { results.push({ id, name, pass: false, detail: String(e.message ?? e) }); }
}
export function eq(actual, expected, what = 'value') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
}
export function ok(cond, what) { if (!cond) throw new Error(what); }
// Expect the promise to fail; optionally match sqlstate code, message regex and hint.
export async function fails(p, { code, re, hint } = {}) {
  let err;
  try { await p; } catch (e) { err = e; }
  if (!err) throw new Error('expected an error but the statement succeeded');
  if (code && err.code !== code) throw new Error(`expected sqlstate ${code}, got ${err.code}: ${err.message}`);
  if (re && !re.test(err.message)) throw new Error(`expected message ${re}, got: ${err.message}`);
  if (hint && err.hint !== hint) throw new Error(`expected hint ${hint}, got ${err.hint}`);
  return `${err.code} ${err.message}`;
}
export function report() {
  const w = Math.max(...results.map((r) => r.id.length));
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(w)}  ${r.name}${r.pass ? '' : '\n        -> ' + r.detail}`);
  const bad = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  return bad;
}
