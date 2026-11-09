import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb, applyAll } from './harness.mjs';
const db = await makeDb();
const r = await applyAll(db);
if (r.some((x) => !x.ok)) { console.log(r.filter((x) => !x.ok)); process.exit(1); }
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../smoke-test.sql');
const sql = fs.readFileSync(file, 'utf8');
const notices = [];
await db.exec(sql, { onNotice: (n) => notices.push(n.message) });
console.log(notices.join('\n') || '(no notices captured)');
