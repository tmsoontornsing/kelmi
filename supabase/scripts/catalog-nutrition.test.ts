// Checks the starter catalog's nutrition figures and the app's nutrition math together.
// Run with: node --test supabase/scripts/catalog-nutrition.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { labelRound, percentDV, perServing } from '../../apps/mobile/src/lib/nutrition.ts';
import { key, parseCatalog } from './recipe-csv.ts';

const dir = join(import.meta.dirname, '../catalog/starter');
const read = (name: string) => readFileSync(join(dir, name), 'utf8');
const { catalog, errors } = parseCatalog({
  ingredients: read('ingredients.csv'),
  recipes: read('recipes.csv'),
  recipeIngredients: read('recipe_ingredients.csv'),
  nutrition: read('nutrition.csv'),
});

test('the starter catalog parses, with nutrition for every ingredient', () => {
  assert.deepEqual(errors, []);
  assert.equal(catalog.nutrition.length, catalog.ingredients.length);
});

// Calories should roughly match protein and carbs at 4 kcal a gram and fat at 9, with fiber at 2.
// This catches a typo in any one column. USDA's own energy factors differ a little by food, hence the margin.
// Baking powder is the one real exception: its "carbs" are mostly mineral salts that carry no energy.
test('every ingredient\'s calories agree with its protein, carbs and fat', () => {
  const off = catalog.nutrition.filter((n) => {
    if (n.ingredient_name === 'Baking powder') return false;
    const expected = 4 * n.protein_g + 4 * (n.carbs_g - n.fiber_g) + 2 * n.fiber_g + 9 * n.fat_g;
    return Math.abs(n.kcal - expected) > Math.max(12, 0.2 * n.kcal);
  });
  assert.deepEqual(
    off.map((n) => n.ingredient_name),
    [],
  );
});

const byName = new Map(catalog.nutrition.map((n) => [key(n.ingredient_name), n]));
const serving = (title: string) => {
  const r = catalog.recipes.find((x) => key(x.title) === key(title))!;
  const lines = catalog.recipeIngredients
    .filter((l) => key(l.recipe_title) === key(title))
    .map((l) => ({ name: l.ingredient_name, quantity: l.quantity, nutrition: byName.get(key(l.ingredient_name)) }));
  return perServing(lines, r.servings);
};

test('every recipe comes out in a believable range per serving', () => {
  for (const r of catalog.recipes) {
    const { perServing: s, missing } = serving(r.title);
    assert.deepEqual(missing, [], r.title);
    assert.ok(s.kcal > 80 && s.kcal < 1300, `${r.title}: ${Math.round(s.kcal)} kcal`);
    assert.ok(s.sodium_mg < 3000, `${r.title}: ${Math.round(s.sodium_mg)} mg sodium`);
  }
});

test('perServing scales each line by its weight and divides by servings', () => {
  const chicken = { grams_per_unit: 453.6, kcal: 120, protein_g: 22.5, carbs_g: 0, fiber_g: 0, sugar_g: 0, fat_g: 2.6, sat_fat_g: 0.6, cholesterol_mg: 73, sodium_mg: 45 };
  const { perServing: s, missing } = perServing(
    [
      { name: 'Chicken', quantity: 1, nutrition: chicken },
      { name: 'Mystery', quantity: 2, nutrition: null },
    ],
    4,
  );
  assert.equal(Math.round(s.kcal), Math.round((120 * 4.536) / 4));
  assert.equal(Math.round(s.protein_g * 10) / 10, Math.round(((22.5 * 4.536) / 4) * 10) / 10);
  assert.deepEqual(missing, ['Mystery']);
});

test('label rounding and percent of Daily Value follow the US label rules', () => {
  assert.equal(labelRound('kcal', 433), 430);
  assert.equal(labelRound('kcal', 47), 45);
  assert.equal(labelRound('sodium_mg', 612), 610);
  assert.equal(labelRound('sodium_mg', 3), 0);
  assert.equal(labelRound('fat_g', 3.3), 3.5);
  assert.equal(labelRound('protein_g', 0.4), 0);
  assert.equal(labelRound('cholesterol_mg', 73), 75);
  assert.equal(percentDV('sodium_mg', 1150), 50);
  assert.equal(percentDV('sugar_g', 10), null);
});
