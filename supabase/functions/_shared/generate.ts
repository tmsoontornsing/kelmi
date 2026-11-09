import type { CircuitBreaker } from "./breaker.ts";
import { applyLocks, repairWeek, slotConflicts, validateWeek, type MealLock, type PlanProfile, type RecipeRecord } from "./plan-logic.ts";
import { isRetryable, type Plan, type PlanInput, type PlanProvider, type Usage } from "./provider.ts";

// Runs the planners for one request and says who answered. Pure apart from the providers it is given, so it is tested
// with fakes. A paid provider (when there is one) gets at most two tries, and only while a retry could help; the
// built-in planner always runs last, so the household still gets a week.

export type GenerateResult = {
  plan: Plan | null;
  // Which planner's week was kept; "none" when nothing produced a usable week.
  planner: string;
  // True when a paid planner was meant to answer but did not (it failed, or its breaker is open) and the built-in one did.
  degraded: boolean;
};

export async function generateWeek(opts: {
  input: PlanInput;
  recipes: RecipeRecord[];
  profile: Pick<PlanProfile, "allergies" | "diet" | "household_size">;
  locks: MealLock[];
  // The paid (or other external) planner, or null when none should be used: none configured, or no AI consent.
  external: PlanProvider | null;
  basic: PlanProvider;
  breaker: CircuitBreaker;
  onUsage?: (u: Usage) => void;
  now?: () => number;
}): Promise<GenerateResult> {
  const { input, recipes, profile, locks, external, basic, breaker, onUsage } = opts;
  const now = opts.now ?? Date.now;

  // A planner's week with the locks applied, then checked as a whole. Whoever wrote it, no meal may break an allergy or
  // the diet. Returns the week, or why it is unusable and whether asking the model again could fix that.
  const finish = (made: Plan): { plan: Plan } | { problem: string; fixable: boolean } => {
    const items = repairWeek(applyLocks(made.items, locks), locks, input.candidates, profile.household_size);
    const attempt = { ...made, items };
    const unsafe = slotConflicts(recipes, attempt.items, profile);
    if (unsafe.length > 0) return { problem: `${unsafe.length} meal(s) break the household's allergies or diet`, fixable: true };
    const problem = validateWeek(attempt, profile.household_size);
    // With meals kept, a week that still does not fit is down to the locks, which the model cannot change.
    return problem ? { problem, fixable: locks.length === 0 } : { plan: attempt };
  };

  let degraded = false;
  if (external) {
    if (breaker.isOpen(now())) {
      degraded = true;
      console.warn(`generate-plan: DEGRADED: ${external.name} skipped, its circuit breaker is open; using the built-in planner`);
    } else {
      for (let attempt = 1; attempt <= 2; attempt++) {
        let retry = true;
        try {
          const done = finish(await external.generate(input, onUsage));
          if ("plan" in done) {
            breaker.recordSuccess();
            return { plan: done.plan, planner: external.name, degraded: false };
          }
          console.error(`generate-plan: ${external.name} returned an unusable week: ${done.problem}`);
          retry = done.fixable;
        } catch (e) {
          console.error(`generate-plan: ${external.name} failed: ${(e as Error).message}`);
          retry = isRetryable(e);
        }
        if (!retry) break;
      }
      breaker.recordFailure(now());
      degraded = true;
      console.warn(`generate-plan: DEGRADED: ${external.name} gave no usable week; falling back to the built-in planner`);
    }
  }

  try {
    const done = finish(await basic.generate(input, onUsage));
    if ("plan" in done) return { plan: done.plan, planner: basic.name, degraded };
    console.error(`generate-plan: ${basic.name} returned an unusable week: ${done.problem}`);
  } catch (e) {
    console.error(`generate-plan: ${basic.name} failed: ${(e as Error).message}`);
  }
  return { plan: null, planner: "none", degraded };
}
