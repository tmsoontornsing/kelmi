import { minCandidates, shuffle } from "./plan-logic.ts";
import { MEAL_TYPES, type Candidate, type MealType, type Plan, type PlanInput } from "./provider.ts";

// Builds a valid week without a model, so planning works (and costs nothing) before an AI key is set,
// and still works if the model fails. It favors cheaper recipes, shuffles a little for variety, and
// spreads repeats across the week rather than putting them on back-to-back days.

// Times the recipe at `index` is used when `n` recipes rotate through seven days.
const usesOf = (index: number, n: number) => Math.ceil((7 - index) / n);

export function basicPlan(input: PlanInput, rng: () => number = Math.random): Plan {
  const chosen = {} as Record<MealType, Candidate[]>;
  for (const type of MEAL_TYPES) {
    const byCost = [...input.candidates[type]].sort((a, b) => a.estimatedCostUsd - b.estimatedCostUsd);
    const need = Math.min(byCost.length, minCandidates(type, input.householdSize));
    // Draw from the cheaper part of the list, but not always the same few recipes.
    const pool = byCost.slice(0, Math.max(need, Math.ceil(byCost.length * 0.6)));
    // Liked recipes go first, but a liked recipe outside the cheaper part of the list can still make the week.
    const liked = input.candidates[type].filter((c) => c.liked && !pool.includes(c));
    const shuffled = shuffle(pool, rng);
    // Within the rest, prefer what the household likes, what fits their goal, and meat for someone who likes a lot of it.
    const wantsMeat = input.meatLevel === "lots";
    const rank = (c: Candidate) => Number(!!c.liked) * 2 + Number(!!c.fitsGoal) + Number(wantsMeat && !!c.meat);
    const ranked = [...liked, ...[...shuffled].sort((a, b) => rank(b) - rank(a))];
    chosen[type] = ranked.slice(0, need);
  }

  // Over budget: replace the chosen recipe whose swap saves the most with the cheapest unused one, until under budget.
  const budget = input.weeklyBudgetUsd;
  const weekCost = () =>
    MEAL_TYPES.reduce(
      (sum, t) => sum + chosen[t].reduce((s, c, i) => s + c.estimatedCostUsd * usesOf(i, chosen[t].length), 0),
      0,
    );
  for (let round = 0; budget !== null && weekCost() > budget && round < 30; round++) {
    let best: { type: MealType; index: number; replacement: Candidate; saving: number } | null = null;
    for (const type of MEAL_TYPES) {
      const used = new Set(chosen[type].map((c) => c.id));
      const cheapestUnused = input.candidates[type]
        .filter((c) => !used.has(c.id))
        .sort((a, b) => a.estimatedCostUsd - b.estimatedCostUsd)[0];
      if (!cheapestUnused) continue;
      chosen[type].forEach((c, index) => {
        const saving = (c.estimatedCostUsd - cheapestUnused.estimatedCostUsd) * usesOf(index, chosen[type].length);
        if (saving > 0 && (!best || saving > best.saving)) best = { type, index, replacement: cheapestUnused, saving };
      });
    }
    if (!best) break;
    const { type, index, replacement } = best as { type: MealType; index: number; replacement: Candidate };
    chosen[type][index] = replacement;
  }

  return {
    items: MEAL_TYPES.flatMap((type) =>
      Array.from({ length: 7 }, (_, d) => ({
        recipe_id: chosen[type][d % chosen[type].length].id,
        day_of_week: d + 1,
        meal_type: type,
      })),
    ),
  };
}
