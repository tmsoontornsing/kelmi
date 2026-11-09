import { z } from "npm:zod@3.23.8";

import { loadProfile, loadRecipesByIds } from "../_shared/data.ts";
import { asCaller, fail, json } from "../_shared/http.ts";
import { slotConflicts } from "../_shared/plan-logic.ts";
import { MEAL_TYPES } from "../_shared/provider.ts";

// POST { plan_id, shop?: [{ day_of_week, meal_type, shop }] } builds the signed-in person's grocery list for a plan.
// `shop` says which meals to buy for (an unticked meal becomes "skip"). Every meal is also checked against the
// household's allergies and diet as they are now, so a plan made before they changed either never puts an allergen
// on the list: those meals are flagged `conflict` and left off. Runs as the caller, so row-level security applies.

const Body = z.object({
  plan_id: z.string().uuid(),
  shop: z
    .array(z.object({ day_of_week: z.number().int().min(1).max(7), meal_type: z.enum(MEAL_TYPES), shop: z.boolean() }))
    .max(21)
    .optional(),
  // False refreshes which meals conflict without creating a list, for a household that hasn't made one yet.
  build_list: z.boolean().optional(),
});

type Item = { id: string; recipe_id: string; day_of_week: number; meal_type: (typeof MEAL_TYPES)[number]; status: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await asCaller(req);
  if (caller instanceof Response) return caller;
  const { db, userId } = caller;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request", message: "Choose a plan and the meals to shop for." }, 400);
  const { plan_id, shop, build_list } = parsed.data;

  try {
    const profile = await loadProfile(db, userId);
    if (!profile) return json({ error: "profile_missing", message: "Finish setting up your household first" }, 409);

    const { data: items, error } = await db
      .from("meal_plan_items")
      .select("id, recipe_id, day_of_week, meal_type, status")
      .eq("plan_id", plan_id)
      .returns<Item[]>();
    if (error) return fail("grocery-list", "items_read_failed", error.message);
    if (!items || items.length === 0) return json({ error: "plan_not_found", message: "That plan wasn't found." }, 404);

    // Only the plan's own recipes, not the whole catalog.
    const recipes = await loadRecipesByIds(db, items.map((i) => i.recipe_id));
    const conflicts = slotConflicts(recipes, items, profile);
    const conflicted = new Set(conflicts.map((c) => `${c.day_of_week}|${c.meal_type}`));
    const chosen = new Map((shop ?? []).map((s) => [`${s.day_of_week}|${s.meal_type}`, s.shop]));

    // One call sets every meal's state and (unless build_list is false) rebuilds the list, in a single transaction.
    const patches = items.map((i) => {
      const key = `${i.day_of_week}|${i.meal_type}`;
      const wants = chosen.get(key);
      // Unticked is skipped, and ticking a skipped meal puts it back to cooking; a leftovers meal stays as it is.
      const status = wants === false ? "skip" : i.status === "skip" && wants === true ? "cook" : i.status;
      return { id: i.id, status, conflict: conflicted.has(key) };
    });
    const { error: applyError } = await db.rpc("apply_grocery_choices", {
      p_plan_id: plan_id,
      p_patches: patches,
      p_build_list: build_list !== false,
    });
    if (applyError) return fail("grocery-list", "apply_failed", applyError.message);

    const titles = new Map(recipes.map((r) => [r.id, r.title]));
    return json({ list_ready: build_list !== false, conflicts: conflicts.map((c) => ({ ...c, title: titles.get(c.recipe_id) ?? "" })) });
  } catch (e) {
    return fail("grocery-list", "unexpected", (e as Error).message);
  }
});
