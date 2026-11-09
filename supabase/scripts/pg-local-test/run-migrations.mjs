import { makeDb, applyAll, migrationFiles, applyOne } from './harness.mjs';
const db = await makeDb();
const res = await applyAll(db);
for (const r of res) console.log(r.ok ? 'OK  ' : 'FAIL', r.file, r.error ?? '');
if (res.some((r) => !r.ok)) process.exit(1);
// idempotency: re-apply the six new ones
const again = await applyAll(db, { from: '20261110000000' });
for (const r of again) console.log(r.ok ? 'RE-OK  ' : 'RE-FAIL', r.file, r.error ?? '');
if (again.some((r) => !r.ok)) process.exit(1);
