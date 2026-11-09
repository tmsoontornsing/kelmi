// Run with: node --test supabase/scripts/*.test.ts
// The plan caps live in two places, the SQL in claim_plan_generation and the constants in plan-logic.ts. This keeps them
// from drifting, and checks the rules that cost money: failed plans that used tokens count, and the daily ceiling exists.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const sql = read('../migrations/20261110000000_plan_claims.sql');
const logic = read('../functions/_shared/plan-logic.ts');
const constant = (name: string) => {
  const m = logic.match(new RegExp(`export const ${name} = ([0-9]+);`));
  assert.ok(m, `${name} not found in plan-logic.ts`);
  return Number(m[1]);
};

test('claim_plan_generation uses the same caps as plan-logic.ts', () => {
  assert.ok(sql.includes(`c_burst_limit constant int := ${constant('BURST_LIMIT')};`));
  assert.ok(sql.includes(`c_free_cap constant int := ${constant('FREE_MONTHLY_PLAN_CAP')};`));
  assert.ok(sql.includes(`c_plus_cap constant int := ${constant('SUBSCRIBER_MONTHLY_PLAN_CAP')};`));
  assert.ok(sql.includes(`c_daily_ai_ceiling constant int := ${constant('DAILY_AI_CALL_CEILING')};`));
});

test('a failed plan counts toward the monthly cap when it used tokens', () => {
  assert.ok(sql.includes("(g.status <> 'failed' or g.input_tokens > 0)"));
});

test('the daily ceiling returns the busy code, and every code the SQL returns is mapped in plan-logic.ts', () => {
  assert.ok(/v_daily >= c_daily_ai_ceiling/.test(sql));
  for (const code of [...sql.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1])) {
    assert.ok(new RegExp(`\\b${code}: \\{`).test(logic), `denial code ${code} has no entry in PLAN_DENIALS`);
  }
  assert.ok(/busy: \{ status: 503/.test(logic));
});

test('failed plans keep their tokens: record_generation_result stores them whatever the status', () => {
  assert.ok(/input_tokens = greatest\(coalesce\(p_input_tokens, 0\), 0\)/.test(sql));
});
