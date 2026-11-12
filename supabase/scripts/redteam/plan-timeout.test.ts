// RED TEAM (local only): what generate-plan records when the paid model times out. Real claudeProvider + generateWeek,
// wrapped in countingProvider exactly as generate-plan/index.ts does (the hook stands in for record_ai_attempt).
// globalThis.fetch is stubbed (no network). Fails if a paid request can be sent without being counted. Run:
//   cd supabase/scripts/redteam && deno test --no-check --cached-only --deny-net plan-timeout.test.ts
import { assert } from "jsr:@std/assert@1";
import { claudeProvider, countingProvider } from "../../functions/_shared/adapters.ts";
import { CircuitBreaker } from "../../functions/_shared/breaker.ts";
import { generateWeek } from "../../functions/_shared/generate.ts";
import { selectCandidates, type PlanProfile, type RecipeRecord } from "../../functions/_shared/plan-logic.ts";
import { basicPlan } from "../../functions/_shared/planner.ts";
import type { PlanInput, PlanProvider, Usage } from "../../functions/_shared/provider.ts";

const profile: PlanProfile = { household_size: 4, weekly_budget_usd: null, diet: "any", allergies: [], dislikes: [], likes: [], appliances: [] };
const recipes: RecipeRecord[] = ["breakfast", "lunch", "dinner"].flatMap((meal) =>
  Array.from({ length: 10 }, (_, i): RecipeRecord => ({
    id: `${meal}-${i}`, title: `${meal} ${i}`, minutes: 20, servings: 4, tags: [meal], ingredientNames: ["Rice"], baseCostUsd: 10 + i,
  })));
const candidates = selectCandidates(recipes, profile, { rng: () => 0 });
const input = { householdSize: 4, weeklyBudgetUsd: null, allergies: [], dislikes: [], likes: [], candidates } as unknown as PlanInput;

async function scenario(basic: PlanProvider, recordAttempt: () => Promise<void>) {
  let sent = 0, attempts = 0;
  const realFetch = globalThis.fetch;
  // The request reaches Anthropic (billable once it is processed) but no answer arrives within CLAUDE_TIMEOUT_MS.
  globalThis.fetch = (() => { sent++; return Promise.reject(new DOMException("The signal has been aborted", "TimeoutError")); }) as typeof fetch;
  const used = { model: "", inputTokens: 0, outputTokens: 0 };
  try {
    const external = countingProvider(claudeProvider("sk-test-not-real"), async () => { await recordAttempt(); attempts++; });
    const r = await generateWeek({
      input, recipes, profile, locks: [], external, basic, breaker: new CircuitBreaker(),
      onUsage: (u: Usage) => { used.model = u.model; used.inputTokens += u.inputTokens; used.outputTokens += u.outputTokens; },
    });
    return { requestsSentToClaude: sent, attemptsRecorded: attempts, planner: r.planner, degraded: r.degraded, gotPlan: r.plan !== null, recordedUsage: used };
  } finally { globalThis.fetch = realFetch; }
}

Deno.test("B1-timeout: timed-out Claude calls are counted even with 0 tokens", async () => {
  const ok = () => Promise.resolve();
  const fallbackOk = await scenario({ name: "basic", generate: (i) => Promise.resolve(basicPlan(i, () => 0.5)) }, ok);
  const fallbackFails = await scenario({ name: "basic", generate: () => Promise.reject(new Error("no week")) }, ok);
  // If the attempt cannot be recorded, no paid request is sent at all.
  const recordFails = await scenario({ name: "basic", generate: (i) => Promise.resolve(basicPlan(i, () => 0.5)) }, () => Promise.reject(new Error("db down")));
  const proven = [fallbackOk, fallbackFails, recordFails].some((s) => s.requestsSentToClaude > s.attemptsRecorded);
  console.log(`\n[${proven ? "PROVEN" : "BLOCKED"}] B1-timeout paid requests sent without being recorded`);
  console.log(`  evidence (fallback ok): ${JSON.stringify(fallbackOk)}`);
  console.log(`  evidence (fallback fails): ${JSON.stringify(fallbackFails)}`);
  console.log(`  evidence (attempt cannot be recorded): ${JSON.stringify(recordFails)}`);
  assert(!proven, "a paid request was sent without being counted");
  assert(fallbackOk.attemptsRecorded === 2 && recordFails.requestsSentToClaude === 0 && recordFails.gotPlan);
});
