import { breakerFor } from "../_shared/breaker.ts";
import { basicProvider, countingProvider, providerFromEnv } from "../_shared/adapters.ts";
import { loadProfile, loadRecipes } from "../_shared/data.ts";
import { generateWeek } from "../_shared/generate.ts";
import { adminClient, asCaller, fail, json, readJson } from "../_shared/http.ts";
import {
  checkLocks,
  defaultWeekStart,
  isKnownDiet,
  isMonday,
  minCandidates,
  parseLocks,
  PLAN_DENIALS,
  planTotal,
  selectCandidates,
  unresolvedAllergies,
} from "../_shared/plan-logic.ts";
import { cleanList, cleanNotes, MEAL_TYPES, type PlanInput, type PlanProvider, type Usage } from "../_shared/provider.ts";

// POST { week_start?: "YYYY-MM-DD", locked?: [{ day_of_week, meal_type, recipe_id }] }  (a Monday; defaults to the upcoming Monday, in UTC)
// Authorization: Bearer <the signed-in user's access token>
//
// Builds a week of breakfast, lunch and dinner (21 meals) for the caller from their profile, saves it, and returns it.
// Reads run as the caller, so row-level security applies. Claiming the request (the burst and monthly caps), recording
// its cost, and swapping the week in are database functions only the service role can call, run here for the user id
// that asCaller verified.
//
// Returns { plan_id, week_start, estimated_total_usd, over_budget, grocery_list_ready, planner, degraded }. `planner`
// is who wrote the week: "claude", "idunify" or "basic" (built in). `degraded` is true when an AI planner was meant to
// answer but failed and the built-in one did. A household that has not agreed to AI planning (profiles.ai_consent_at)
// always gets "basic": nothing about them is sent to an AI provider.
//
// Env: ANTHROPIC_API_KEY to plan with Claude, or IDUNIFY_API_KEY for IDUnify (otherwise the free built-in planner), or
// KAVI_PLAN_PROVIDER to force one of claude, idunify, basic. SUPABASE_URL, the anon key and the service role key are
// provided by Supabase.

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await asCaller(req);
  if (caller instanceof Response) return caller;
  const { db, userId } = caller;

  let weekStart = defaultWeekStart();
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (body?.week_start !== undefined) {
    if (typeof body.week_start !== "string" || !isMonday(body.week_start)) {
      return json({ error: "invalid_week_start", message: "week_start must be a Monday, as YYYY-MM-DD" }, 400);
    }
    // This week (its Monday can be up to 6 days ago) through about a year ahead; nothing in year 0001 or 9999.
    const daysAway = (Date.parse(`${body.week_start}T00:00:00Z`) - Date.now()) / 86_400_000;
    if (!(daysAway >= -7 && daysAway <= 400)) {
      return json({ error: "invalid_week_start", message: "week_start must be this week or a week within the next year" }, 400);
    }
    weekStart = body.week_start;
  }

  // Plus only: meals to keep while the rest of the week is planned again. Malformed locks are refused outright rather
  // than dropped, so a bad request never gets as far as a model call.
  const locks = parseLocks(body?.locked);
  if (body?.locked !== undefined && (!Array.isArray(body.locked) || body.locked.length > 21 || locks.length !== body.locked.length)) {
    return json({ error: "invalid_locks", message: "Those kept meals are not valid." }, 400);
  }

  let profile, recipes;
  try {
    profile = await loadProfile(db, userId);
    recipes = await loadRecipes(db);
  } catch (e) {
    return fail("generate-plan", "read_failed", (e as Error).message);
  }
  if (!profile) return json({ error: "profile_missing", message: "Finish setting up your household first" }, 409);
  if (!profile.age_confirmed_at) return json({ error: "age_required", message: "Confirm your age to plan meals." }, 403);
  if (!isKnownDiet(profile.diet)) {
    return json({ error: "diet_unknown", message: "Choose your diet again in Settings so meals can be matched to it." }, 422);
  }
  // An allergy the server cannot match to an allergen group would otherwise be impossible to filter for, so planning is
  // refused (fail closed) until the person picks it from the list. Checked before anything is counted or planned.
  const unknownAllergies = unresolvedAllergies(profile.allergies);
  if (unknownAllergies.length > 0) {
    return json(
      { error: "unknown_allergy", message: "Choose allergies from the list so we can keep you safe.", labels: cleanList(unknownAllergies, 20) },
      422,
    );
  }

  // Everything that can be checked without a model is checked before the request is counted or a model is paid.
  if (locks.length > 0) {
    const problem = checkLocks(recipes, locks, profile);
    if (problem) return json({ error: problem.code, message: problem.message }, 422);
  }
  const candidates = selectCandidates(recipes, profile);
  const short = MEAL_TYPES.filter((t) => candidates[t].length < minCandidates(t, profile.household_size));
  if (short.length > 0) {
    return json(
      {
        error: "not_enough_recipes",
        message: `Not enough ${short.join(" and ")} recipes match your allergies, diet and kitchen to fill a week.`,
        available: Object.fromEntries(MEAL_TYPES.map((t) => [t, candidates[t].length])),
      },
      422,
    );
  }

  // Claim the request: the burst limit, the monthly cap and the log row are one locked step in the database. Any error
  // refuses the request, because the caps are what protect the AI bill.
  const admin = adminClient();
  const { data: claimRows, error: claimError } = await admin.rpc("claim_plan_generation", { p_user: userId, p_requires_plus: locks.length > 0 });
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (claimError || !claim) return fail("generate-plan", "claim_failed", claimError?.message ?? "no result");
  if (!claim.allowed) {
    const denied = PLAN_DENIALS[claim.reason as string];
    if (!denied) return fail("generate-plan", "claim_denied_unknown", String(claim.reason));
    return json({ error: denied.error, message: denied.message }, denied.status);
  }
  const generationId = claim.generation_id as string;
  // 'basic_only': today's shared AI budget is used up (free accounts stop at 80% of it), so this week is planned by the
  // free built-in planner rather than refused.
  const aiAllowed = claim.reason !== "basic_only";

  // What the model sees is cleaned again in buildPrompt; the household's lists are also cut to the same sizes here.
  const input: PlanInput = {
    householdSize: profile.household_size,
    weeklyBudgetUsd: profile.weekly_budget_usd,
    allergies: cleanList(profile.allergies, 20),
    dislikes: cleanList(profile.dislikes, 20),
    likes: cleanList(profile.likes, 30),
    goal: profile.goal ?? "maintain",
    meatLevel: profile.meat_level ?? "some",
    foodNotes: cleanNotes(profile.food_notes ?? ""),
    candidates,
  };

  // An AI planner only with the household's consent. Without it the built-in planner answers and nothing is sent out.
  let external: PlanProvider | null = null;
  if (profile.ai_consent_at && aiAllowed) {
    try {
      const preferred = providerFromEnv((k) => Deno.env.get(k));
      // Every paid request is recorded on the claimed row before it is sent, so one that times out (and reports no
      // tokens) still counts toward the monthly cap and the daily AI ceiling.
      if (preferred.name !== "basic") {
        external = countingProvider(preferred, async () => {
          const { error } = await admin.rpc("record_ai_attempt", { p_id: generationId });
          if (error) throw new Error(error.message);
        });
      }
    } catch (e) {
      console.error(`generate-plan: provider setup failed: ${(e as Error).message}`);
    }
  }

  // What the model calls used, retries included.
  const used = { model: "", inputTokens: 0, outputTokens: 0 };
  const onUsage = (u: Usage) => {
    used.model = u.model;
    used.inputTokens += u.inputTokens;
    used.outputTokens += u.outputTokens;
  };
  const result = await generateWeek({
    input,
    recipes,
    profile,
    locks,
    external,
    basic: basicProvider(),
    breaker: breakerFor(external?.name ?? "none"),
    onUsage,
  });

  // Record the cost and how the request ended. A failed plan counts toward the burst limit, and toward the monthly cap
  // when it sent a paid request (recorded per attempt above) or used paid tokens (retries included). Logged as well as saved, so it shows in the function logs if the row could not be updated.
  const finish = async (ok: boolean) => {
    console.log(`generate-plan: ${ok ? "ok" : "failed"} planner=${result.planner} degraded=${result.degraded} usage=${JSON.stringify(used)}`);
    const { error } = await admin.rpc("record_generation_result", {
      p_id: generationId,
      p_status: ok ? "succeeded" : "failed",
      p_provider: result.planner,
      p_model: used.model || null,
      p_input_tokens: used.inputTokens,
      p_output_tokens: used.outputTokens,
    });
    if (error) console.error(`generate-plan: could not record the result: ${error.message}`);
  };

  const plan = result.plan;
  if (!plan) {
    await finish(false);
    return json({ error: "plan_generation_failed", message: "Could not build a plan. Try again." }, 502);
  }

  // Swap the week in one transaction. A failure leaves the person's existing plan exactly as it was.
  const { data: planId, error: saveError } = await admin.rpc("replace_meal_plan", {
    p_user: userId,
    p_week: weekStart,
    p_items: plan.items.map((i) => ({ recipe_id: i.recipe_id, day_of_week: i.day_of_week, meal_type: i.meal_type })),
  });
  if (saveError || !planId) {
    await finish(false);
    return fail("generate-plan", "plan_save_failed", saveError?.message ?? "no row returned");
  }
  await finish(true);

  // The grocery list is not built here: the person generates it from the Groceries tab, choosing which meals to shop for.
  // Kept meals may sit outside the candidate list, so price those from the catalog.
  const offered = new Set(MEAL_TYPES.flatMap((t) => candidates[t].map((c) => c.id)));
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const keptCost = plan.items.reduce((sum, i) => {
    const r = offered.has(i.recipe_id) ? undefined : byId.get(i.recipe_id);
    return sum + (r ? (r.baseCostUsd * profile.household_size) / r.servings : 0);
  }, 0);
  const total = Math.round((planTotal(plan, candidates) + keptCost) * 100) / 100;
  return json({
    plan_id: planId,
    week_start: weekStart,
    estimated_total_usd: total,
    over_budget: profile.weekly_budget_usd !== null && total > profile.weekly_budget_usd,
    grocery_list_ready: false,
    planner: result.planner,
    degraded: result.degraded,
  });
});
