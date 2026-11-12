import { loadProfile, loadRecipes } from "../_shared/data.ts";
import { asCaller, fail, json, readJson } from "../_shared/http.ts";
import { selectCandidates } from "../_shared/plan-logic.ts";
import { MEAL_TYPES, type MealType } from "../_shared/provider.ts";

// POST { meal_type: "breakfast" | "lunch" | "dinner", exclude?: string[] }
// Authorization: Bearer <the signed-in user's access token>
//
// Recipes the caller could swap in for a meal: the same allergy, diet, equipment and dislike filters the
// planner uses, liked foods first and then cheapest. `exclude` drops recipe ids, such as the one being replaced.

const LIMIT = 6;
// A plan has 21 meals, so a longer list is not a real request.
const MAX_EXCLUDE = 50;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await asCaller(req);
  if (caller instanceof Response) return caller;
  const { db, userId } = caller;

  const body = await readJson(req);
  if (body instanceof Response) return body;
  const mealType = body?.meal_type as MealType;
  if (!MEAL_TYPES.includes(mealType)) {
    return json({ error: "invalid_meal_type", message: "meal_type must be breakfast, lunch or dinner" }, 400);
  }
  const exclude = new Set<string>(
    // Cut to MAX_EXCLUDE first, so a huge list is never walked.
    Array.isArray(body?.exclude) ? body.exclude.slice(0, MAX_EXCLUDE).filter((x: unknown): x is string => typeof x === "string" && x.length <= 64) : [],
  );

  try {
    const profile = await loadProfile(db, userId);
    if (!profile) return json({ error: "profile_missing", message: "Finish setting up your household first" }, 409);
    const options = selectCandidates(await loadRecipes(db), profile, { limit: 1000 })
      [mealType].filter((c) => !exclude.has(c.id))
      // Liked foods first, then cheapest.
      .sort((a, b) => Number(!!b.liked) - Number(!!a.liked) || a.estimatedCostUsd - b.estimatedCostUsd)
      .slice(0, LIMIT)
      .map((c) => ({ id: c.id, title: c.title, minutes: c.minutes, estimated_cost_usd: c.estimatedCostUsd }));
    return json({ meal_type: mealType, options });
  } catch (e) {
    return fail("meal-options", "read_failed", (e as Error).message);
  }
});
