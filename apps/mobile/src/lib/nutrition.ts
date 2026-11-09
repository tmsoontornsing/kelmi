// Nutrition math for a recipe, from its ingredient lines. Pure, with no imports, so the catalog tests in
// supabase/scripts run it under Node too.
//
// Each ingredient stores its nutrients per 100 g and how many grams one of its units weighs (one lb, one
// each, one tbsp). A line's nutrients are quantity x grams per unit / 100 x the per-100 g value.
// Values come from the starter catalog, drafted from USDA-style figures, so every result is an estimate.

export const NUTRIENTS = [
  'kcal',
  'protein_g',
  'carbs_g',
  'fiber_g',
  'sugar_g',
  'fat_g',
  'sat_fat_g',
  'cholesterol_mg',
  'sodium_mg',
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number];
export type Nutrients = Record<NutrientKey, number>;

// One ingredient's figures as stored: nutrients in 100 g, and the weight of one pricing unit.
export type IngredientNutrition = Nutrients & { grams_per_unit: number };

// Nutrition for one serving. `missing` names ingredients with no nutrition data, which are counted as zero.
export type ServingNutrition = { perServing: Nutrients; missing: string[] };

// US FDA Daily Values for adults on a 2,000 calorie diet, used for the % column on a label.
// Total sugars has no Daily Value, so it is left out.
export const DAILY_VALUES: Partial<Nutrients> = {
  kcal: 2000,
  protein_g: 50,
  carbs_g: 275,
  fiber_g: 28,
  fat_g: 78,
  sat_fat_g: 20,
  cholesterol_mg: 300,
  sodium_mg: 2300,
};

export const zero = (): Nutrients => Object.fromEntries(NUTRIENTS.map((k) => [k, 0])) as Nutrients;

export function add(a: Nutrients, b: Nutrients, times = 1): Nutrients {
  const out = zero();
  // Number() because database numerics can arrive as strings.
  for (const k of NUTRIENTS) out[k] = a[k] + Number(b[k]) * times;
  return out;
}

// Divides the whole recipe by its servings.
export function perServing(
  lines: { name: string; quantity: number; nutrition: IngredientNutrition | null | undefined }[],
  servings: number,
): ServingNutrition {
  let total = zero();
  const missing: string[] = [];
  for (const l of lines) {
    if (!l.nutrition) {
      missing.push(l.name);
      continue;
    }
    total = add(total, l.nutrition, (Number(l.quantity) * Number(l.nutrition.grams_per_unit)) / 100);
  }
  return { perServing: add(zero(), total, 1 / Math.max(1, servings)), missing };
}

// Percent of the Daily Value, rounded, or null when the nutrient has none.
export function percentDV(key: NutrientKey, amount: number): number | null {
  const dv = DAILY_VALUES[key];
  return dv ? Math.round((amount / dv) * 100) : null;
}

// Rounds the way a US Nutrition Facts label does, so numbers look like the ones people know.
export function labelRound(key: NutrientKey, n: number): number {
  if (key === 'kcal') return n < 5 ? 0 : n <= 50 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10;
  if (key === 'sodium_mg') return n < 5 ? 0 : n <= 140 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10;
  if (key === 'cholesterol_mg') return n < 2 ? 0 : Math.round(n / 5) * 5;
  if (n < 0.5) return 0;
  // Fats go to the half gram under 5 g; every other gram amount is a whole number.
  if ((key === 'fat_g' || key === 'sat_fat_g') && n < 5) return Math.round(n * 2) / 2;
  return Math.round(n);
}
