import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import type { PlanProfile, RecipeRecord } from "./plan-logic.ts";

// Reads shared by the plan functions. Both run as the caller, so row-level security applies.

export async function loadProfile(db: SupabaseClient, userId: string): Promise<PlanProfile | null> {
  const { data, error } = await db
    .from("profiles")
    .select("household_size, weekly_budget_usd, diet, allergies, dislikes, likes, appliances, goal, meat_level, food_notes, age_confirmed_at, ai_consent_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`profile read failed: ${error.message}`);
  if (!data) return null;
  return { ...data, weekly_budget_usd: data.weekly_budget_usd === null ? null : Number(data.weekly_budget_usd) };
}

type Nutrition = { grams_per_unit: number; kcal: number; protein_g: number };
type IngredientRow = { name: string; avg_price_usd: number; ingredient_nutrition?: Nutrition | Nutrition[] | null };

// One ingredient's nutrition, which the API returns as an object, or as a list of one.
const nutritionOf = (i: IngredientRow): Nutrition | null => (Array.isArray(i.ingredient_nutrition) ? i.ingredient_nutrition[0] : i.ingredient_nutrition) ?? null;

export type RecipeQueryRow = {
  id: string;
  title: string;
  minutes: number;
  servings: number;
  tags: string[];
  recipe_ingredients: { quantity: number; ingredient: IngredientRow | null }[];
};

// The whole catalog with each recipe's ingredient names and cost, read a page at a time (PostgREST caps one response at
// its max-rows setting, 1,000 by default). If the pages do not add up to the catalog's size the read throws: planning from
// a silently shortened catalog would offer a smaller, different set of recipes without anyone knowing.
//
// The catalog is the same for every signed-in user and changes only when recipes are imported, so a warm function
// instance keeps it for a minute instead of re-reading it on every request. Short, so a corrected recipe (a fixed
// allergen tag, say) reaches planning quickly.
const CATALOG_TTL_MS = 60 * 1000;
const PAGE_SIZE = 500;
let catalog: { at: number; recipes: RecipeRecord[] } | null = null;

export async function loadRecipes(db: SupabaseClient): Promise<RecipeRecord[]> {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.recipes;
  const recipes = await readRecipes(db);
  catalog = { at: Date.now(), recipes };
  return recipes;
}

// Just these recipes (a plan's own meals), without reading the whole catalog.
export async function loadRecipesByIds(db: SupabaseClient, ids: string[]): Promise<RecipeRecord[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  return readRecipes(db, unique);
}

const columns = (nutrition: boolean) =>
  `id, title, minutes, servings, tags, recipe_ingredients(quantity, ingredient:ingredients(name, avg_price_usd${
    nutrition ? ", ingredient_nutrition(grams_per_unit, kcal, protein_g)" : ""
  }))`;

// Reads every page, ordered by id so pages do not overlap, and throws unless it got as many rows as the table has.
export async function readAllPages(
  db: SupabaseClient,
  nutrition: boolean,
  ids?: string[],
  pageSize = PAGE_SIZE,
): Promise<{ rows: RecipeQueryRow[]; error: { message: string } | null }> {
  const rows: RecipeQueryRow[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += pageSize) {
    let q = db.from("recipes").select(columns(nutrition), { count: "exact" }).order("id");
    if (ids) q = q.in("id", ids);
    const { data, error, count } = await q.range(from, from + pageSize - 1).returns<RecipeQueryRow[]>();
    if (error) return { rows, error };
    total = count ?? total;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  if (total !== null && rows.length < total) {
    throw new Error(`recipe read was cut short: got ${rows.length} of ${total} recipes (is the API's max rows below ${pageSize}?)`);
  }
  return { rows, error: null };
}

async function readRecipes(db: SupabaseClient, ids?: string[]): Promise<RecipeRecord[]> {
  let { rows: data, error } = await readAllPages(db, true, ids);
  if (error) {
    // Calories and protein only rank recipes for a goal, so a failed nutrition read must not stop planning.
    console.error(`recipe read with nutrition failed, retrying without it: ${error.message}`);
    ({ rows: data, error } = await readAllPages(db, false, ids));
  }
  if (error) throw new Error(`recipe read failed: ${error.message}`);
  return data.map((r) => {
    const lines = r.recipe_ingredients.filter((l) => l.ingredient);
    // Calories and protein per serving, counting an ingredient with no nutrition data as zero, as the app does.
    let kcal = 0;
    let protein = 0;
    let known = 0;
    for (const l of lines) {
      const n = nutritionOf(l.ingredient!);
      if (!n) continue;
      known++;
      const grams = (Number(l.quantity) * Number(n.grams_per_unit)) / 100;
      kcal += grams * Number(n.kcal);
      protein += grams * Number(n.protein_g);
    }
    const nutrition = known > 0 ? { kcalPerServing: kcal / r.servings, proteinPerServing: protein / r.servings } : {};
    return {
      ...nutrition,
      id: r.id,
      title: r.title,
      minutes: r.minutes,
      servings: r.servings,
      tags: r.tags,
      ingredientNames: lines.map((l) => l.ingredient!.name),
      baseCostUsd: lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.ingredient!.avg_price_usd), 0),
    };
  });
}
