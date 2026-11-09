// Run with: deno test supabase/functions/_shared/
import { assert, assertEquals } from "jsr:@std/assert@1";

import { planTotal, validateWeek } from "./plan-logic.ts";
import { basicPlan } from "./planner.ts";
import type { Candidate, PlanInput } from "./provider.ts";

const cands = (prefix: string, costs: number[]): Candidate[] =>
  costs.map((cost, i) => ({ id: `${prefix}${i}`, title: `${prefix}${i}`, minutes: 20, estimatedCostUsd: cost }));

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  householdSize: 4,
  weeklyBudgetUsd: null,
  allergies: [],
  dislikes: [],
  likes: [],
  candidates: { breakfast: cands("b", [3, 4, 5, 6]), lunch: cands("l", [6, 7, 8, 9, 10]), dinner: cands("d", [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) },
  ...over,
});

const seeds = [() => 0, () => 0.5, () => 0.99];

Deno.test("basicPlan always produces a valid week", () => {
  for (const rng of seeds) assertEquals(validateWeek(basicPlan(input(), rng)), null);
});

Deno.test("basicPlan works with exactly the minimum recipes for each meal", () => {
  const tight = input({ candidates: { breakfast: cands("b", [3, 4, 5]), lunch: cands("l", [6, 7, 8, 9]), dinner: cands("d", [9, 10, 11, 12, 13, 14, 15]) } });
  for (const rng of seeds) assertEquals(validateWeek(basicPlan(tight, rng)), null);
});

Deno.test("basicPlan only uses each meal's own candidates", () => {
  const plan = basicPlan(input(), () => 0.5);
  for (const item of plan.items) assert(item.recipe_id.startsWith(item.meal_type[0]));
});

Deno.test("basicPlan swaps in cheaper recipes to get under budget", () => {
  // Expensive lunches are in the cheaper 60% pool, so they can be picked first; the budget forces them out.
  const priced = input({
    weeklyBudgetUsd: 60,
    candidates: { breakfast: cands("b", [1, 1, 1]), lunch: cands("l", [2, 2, 2, 2, 20, 20, 20, 20]), dinner: cands("d", [5, 5, 5, 5, 5, 5, 5]) },
  });
  for (const rng of seeds) {
    const plan = basicPlan(priced, rng);
    assertEquals(validateWeek(plan), null);
    assert(planTotal(plan, priced.candidates) <= 60, `total ${planTotal(plan, priced.candidates)} is over budget`);
  }
});

Deno.test("basicPlan returns its best effort when the budget cannot be met", () => {
  const plan = basicPlan(input({ weeklyBudgetUsd: 1 }), () => 0);
  assertEquals(validateWeek(plan), null);
});

Deno.test("basicPlan favors liked recipes, even pricey ones", () => {
  const dinner = cands("d", [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]).map((c) => (c.id === "d9" ? { ...c, liked: true } : c));
  const plan = basicPlan(input({ candidates: { ...input().candidates, dinner } }), () => 0.5);
  assertEquals(validateWeek(plan), null);
  assert(plan.items.some((i) => i.meal_type === "dinner" && i.recipe_id === "d9"));
});

Deno.test("basicPlan fills a week for one person with leftovers, from as few as four dinners", () => {
  const solo = input({
    householdSize: 1,
    candidates: { breakfast: cands("b", [3, 4, 5]), lunch: cands("l", [6, 7, 8]), dinner: cands("d", [9, 10, 11, 12]) },
  });
  for (const rng of seeds) {
    const plan = basicPlan(solo, rng);
    assertEquals(validateWeek(plan, 1), null);
    // The same four dinners would not be enough for a family.
    assert(validateWeek(plan, 4) !== null);
  }
});
