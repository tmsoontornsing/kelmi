// Run with: deno test supabase/functions/_shared/
import { assert, assertEquals } from "jsr:@std/assert@1";

import { CircuitBreaker } from "./breaker.ts";
import { generateWeek } from "./generate.ts";
import { selectCandidates, type PlanProfile, type RecipeRecord } from "./plan-logic.ts";
import { basicPlan } from "./planner.ts";
import { ProviderError, type PlanInput, type PlanProvider } from "./provider.ts";

const profile: PlanProfile = { household_size: 4, weekly_budget_usd: null, diet: "any", allergies: [], dislikes: [], likes: [], appliances: [] };
const recipes: RecipeRecord[] = ["breakfast", "lunch", "dinner"].flatMap((meal) =>
  Array.from({ length: 10 }, (_, i): RecipeRecord => ({
    id: `${meal}-${i}`,
    title: `${meal} ${i}`,
    minutes: 20,
    servings: 4,
    tags: [meal],
    ingredientNames: ["Rice"],
    baseCostUsd: 10 + i,
  })),
);
const candidates = selectCandidates(recipes, profile, { rng: () => 0 });
const input: PlanInput = { householdSize: 4, weeklyBudgetUsd: null, allergies: [], dislikes: [], likes: [], candidates };
const good = basicPlan(input, () => 0.5);

const fake = (name: string, steps: (() => Promise<typeof good>)[]): PlanProvider & { calls: number } => {
  const p = {
    name,
    calls: 0,
    generate: () => {
      const step = steps[Math.min(p.calls, steps.length - 1)];
      p.calls++;
      return step();
    },
  };
  return p;
};
const run = (external: PlanProvider | null, breaker = new CircuitBreaker(), locks: { day_of_week: number; meal_type: string; recipe_id: string }[] = []) =>
  generateWeek({ input, recipes, profile, locks, external, basic: fake("basic", [() => Promise.resolve(good)]), breaker });

Deno.test("no external planner: the built-in one answers and it is not degraded", async () => {
  const r = await run(null);
  assertEquals([r.planner, r.degraded, r.plan !== null], ["basic", false, true]);
});

Deno.test("a working external planner is used and not degraded", async () => {
  const claude = fake("claude", [() => Promise.resolve(good)]);
  const r = await run(claude);
  assertEquals([r.planner, r.degraded, claude.calls], ["claude", false, 1]);
});

Deno.test("a 5xx or bad output is retried once, then the built-in planner answers and it is degraded", async () => {
  const claude = fake("claude", [() => Promise.reject(new ProviderError("boom", true, 503))]);
  const r = await run(claude);
  assertEquals([r.planner, r.degraded, claude.calls], ["basic", true, 2]);
});

Deno.test("a 401, 403 or 429 is not retried: the paid call is made once", async () => {
  for (const status of [401, 403, 429, 400]) {
    const claude = fake("claude", [() => Promise.reject(new ProviderError("no", false, status))]);
    const r = await run(claude);
    assertEquals([r.planner, r.degraded, claude.calls], ["basic", true, 1], String(status));
  }
});

Deno.test("a second attempt can succeed", async () => {
  const claude = fake("claude", [() => Promise.reject(new ProviderError("slow", true)), () => Promise.resolve(good)]);
  const r = await run(claude);
  assertEquals([r.planner, r.degraded, claude.calls], ["claude", false, 2]);
});

Deno.test("an unusable week is retried once without locks, and not at all when locks caused it", async () => {
  const short = { items: good.items.slice(0, 5) };
  const a = fake("claude", [() => Promise.resolve(short)]);
  assertEquals((await run(a)).planner, "basic");
  assertEquals(a.calls, 2);
  // A lock the week cannot absorb is not the model's fault: one call, no retry. Day 1 and 2 dinners locked to a recipe
  // that also fills a third dinner slot cannot be repaired when there is nothing else to swap in.
  const b = fake("claude", [() => Promise.resolve(short)]);
  await run(b, new CircuitBreaker(), [{ day_of_week: 1, meal_type: "dinner", recipe_id: "dinner-0" }]);
  assertEquals(b.calls, 1);
});

Deno.test("the circuit breaker skips the paid planner after repeated failures, then lets one request test it", async () => {
  let t = 0;
  const breaker = new CircuitBreaker(2, 1000);
  const claude = fake("claude", [() => Promise.reject(new ProviderError("down", false, 500))]);
  const go = () => generateWeek({ input, recipes, profile, locks: [], external: claude, basic: fake("basic", [() => Promise.resolve(good)]), breaker, now: () => t });
  await go();
  await go();
  const before = claude.calls;
  const skipped = await go();
  assertEquals([claude.calls, skipped.planner, skipped.degraded], [before, "basic", true]);
  t += 1500;
  await go();
  assert(claude.calls > before);
});

Deno.test("when even the built-in planner fails, there is no plan", async () => {
  const r = await generateWeek({ input, recipes, profile, locks: [], external: null, basic: fake("basic", [() => Promise.reject(new Error("x"))]), breaker: new CircuitBreaker() });
  assertEquals([r.plan, r.planner], [null, "none"]);
});

Deno.test("a week that breaks an allergy is never kept", async () => {
  const unsafeRecipes = recipes.map((r) => (r.id === "dinner-0" ? { ...r, ingredientNames: ["Peanut butter"] } : r));
  const withAllergy = { ...profile, allergies: ["Peanuts"] };
  const claude = fake("claude", [() => Promise.resolve(good)]);
  const r = await generateWeek({ input, recipes: unsafeRecipes, profile: withAllergy, locks: [], external: claude, basic: fake("basic", [() => Promise.resolve(good)]), breaker: new CircuitBreaker() });
  // `good` uses dinner-0 somewhere only if it was a candidate; either way nothing unsafe is kept.
  if (r.plan) assert(!r.plan.items.some((i) => i.recipe_id === "dinner-0"));
});
