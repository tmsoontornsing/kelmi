// Imports the recipe catalog CSVs into Supabase.
//
//   node supabase/scripts/import-recipes.ts <folder> [--dry-run] [--strict] [--add-missing-allergen-tags]
//
// <folder> must hold ingredients.csv, recipes.csv and recipe_ingredients.csv, and may hold nutrition.csv
// (see README.md).
// --dry-run validates the files and prints counts without touching the database.
// --strict stops (before anything is sent) if a recipe's ingredients point to an allergen its tags do not declare.
// --add-missing-allergen-tags adds those missing contains-* tags to the recipes as they are imported. The CSV is not changed.
//
// Every run also prints an allergen review: recipes whose ingredients contain an allergen without the matching
// contains-<allergen> tag (the planner reads those tags first), unknown contains- tags, and recipes with no contains- tag.
//
// A real run needs two environment variables. Set them in your shell, not in a file you commit:
//   SUPABASE_URL                e.g. https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   bypasses row-level security. Never put it in the app.
//
// Safe to re-run: ingredients are upserted by name (prices update), recipes are matched by lower(title) and updated
// (tags, steps, servings, minutes) when they exist and created when they do not, recipe_ingredients are upserted by
// (recipe, ingredient) with lines no longer in the file removed, and nutrition by ingredient. Recipes in the database
// but not in the file are left alone.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reviewAllergens, summarise, withDeclaredAllergens } from './recipe-allergens.ts';
import { key, parseCatalog, unitConflicts } from './recipe-csv.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const strict = args.includes('--strict');
const addMissing = args.includes('--add-missing-allergen-tags');
const dir = args.find((a) => !a.startsWith('--'));

if (!dir) {
  console.error('Usage: node supabase/scripts/import-recipes.ts <folder> [--dry-run]');
  process.exit(2);
}

// nutrition.csv is optional; the others are required.
const readOptional = (name: string) => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return undefined;
  }
};

const read = (name: string) => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    console.error(`Cannot read ${join(dir, name)}`);
    process.exit(2);
  }
};

const { catalog, errors } = parseCatalog({
  ingredients: read('ingredients.csv'),
  recipes: read('recipes.csv'),
  recipeIngredients: read('recipe_ingredients.csv'),
  nutrition: readOptional('nutrition.csv'),
});

if (errors.length) {
  console.error(`Found ${errors.length} problem(s). Nothing was imported.\n`);
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  if (errors.length > 50) console.error(`  ...and ${errors.length - 50} more`);
  process.exit(1);
}

console.log(
  `Valid: ${catalog.ingredients.length} ingredients, ${catalog.recipes.length} recipes, ${catalog.recipeIngredients.length} recipe lines, ${catalog.nutrition.length} nutrition rows.`,
);
// Allergen review. A missing tag is only a warning unless --strict, because the planner also reads the ingredient words.
const reviews = reviewAllergens(catalog);
const review = summarise(reviews);
if (review.undeclared.length) {
  console.warn(`\nAllergen review: ${review.undeclared.length} recipe(s) have an allergen in the ingredients that the tags do not declare:`);
  for (const line of review.undeclared) console.warn(`  - ${line}`);
}
if (review.unknown.length) {
  console.warn(`\nUnknown contains- tags (the planner would never read these):`);
  for (const line of review.unknown) console.warn(`  - ${line}`);
}
if (review.untagged.length) {
  console.warn(`\n${review.untagged.length} of ${catalog.recipes.length} recipes have no contains- tag at all. That is right only if they have no allergens:`);
  console.warn(`  ${review.untagged.slice(0, 40).join('; ')}${review.untagged.length > 40 ? `; ...and ${review.untagged.length - 40} more` : ''}`);
}
if (strict && (review.undeclared.length || review.unknown.length)) {
  console.error('\n--strict: fix the tags above (or use --add-missing-allergen-tags). Nothing was imported.');
  process.exit(1);
}
if (addMissing) {
  const missing = new Map(reviews.map((r) => [key(r.title), r.undeclared]));
  for (const r of catalog.recipes) r.tags = withDeclaredAllergens(r.tags, missing.get(key(r.title)) ?? []);
  if (review.undeclared.length) console.log(`\nAdded the missing contains- tags to ${review.undeclared.length} recipe(s) for this import.`);
}

if (dryRun) {
  console.log('Dry run: nothing was sent to the database.');
  process.exit(0);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell, or use --dry-run.');
  process.exit(2);
}

async function rest<T>(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: serviceKey!,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} failed (${res.status}): ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : []) as T;
}

const chunks = <T>(list: T[], size = 500): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// Every ingredient must use one unit across ALL recipes, the ones in the file and the ones already in the database that
// this file does not replace (grocery lists add quantities across recipes). Nothing is written if any ingredient has two.
async function checkUnits(): Promise<string[]> {
  const inFile = new Set(catalog.recipes.map((r) => key(r.title)));
  const lines = catalog.recipeIngredients.map((l) => ({ recipe: l.recipe_title, ingredient: l.ingredient_name, unit: l.unit }));
  for (let offset = 0; ; offset += 1000) {
    const page = await rest<{ unit: string; recipes: { title: string } | null; ingredients: { name: string } | null }[]>(
      `recipe_ingredients?select=unit,recipes(title),ingredients(name)&order=recipe_id,ingredient_id&limit=1000&offset=${offset}`,
    );
    for (const r of page) {
      if (r.recipes && r.ingredients && !inFile.has(key(r.recipes.title))) {
        lines.push({ recipe: r.recipes.title, ingredient: r.ingredients.name, unit: r.unit });
      }
    }
    if (page.length < 1000) break;
  }
  return unitConflicts(lines);
}

try {
  const conflicts = await checkUnits();
  if (conflicts.length) {
    console.error(`Found ${conflicts.length} ingredient(s) with more than one unit. Nothing was imported.\n`);
    for (const c of conflicts.slice(0, 50)) console.error(`  - ${c}`);
    if (conflicts.length > 50) console.error(`  ...and ${conflicts.length - 50} more`);
    console.error('\nUse one unit per ingredient (change the ingredient\'s unit and every recipe that uses it together).');
    process.exit(1);
  }

  // 1. Ingredients: upsert by name, then map name to id.
  const ingredientId = new Map<string, string>();
  for (const part of chunks(catalog.ingredients)) {
    const rows = await rest<{ id: string; name: string }[]>('ingredients?on_conflict=name', {
      method: 'POST',
      body: part,
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    for (const r of rows) ingredientId.set(key(r.name), r.id);
  }

  // 2. Recipes, matched by lower(title) (titles are not unique in the schema, so the oldest one wins): a recipe that
  // exists is updated with the file's tags, steps, servings and minutes; one that does not is created.
  const recipeId = new Map<string, string>();
  let duplicates = 0;
  for (let offset = 0; ; offset += 1000) {
    const page = await rest<{ id: string; title: string }[]>(`recipes?select=id,title&order=created_at,id&limit=1000&offset=${offset}`);
    for (const r of page) {
      if (recipeId.has(key(r.title))) duplicates++;
      else recipeId.set(key(r.title), r.id);
    }
    if (page.length < 1000) break;
  }
  if (duplicates) console.warn(`${duplicates} recipe(s) in the database share a title with another; only the oldest of each is updated.`);
  const existing = catalog.recipes.filter((r) => recipeId.has(key(r.title)));
  const fresh = catalog.recipes.filter((r) => !recipeId.has(key(r.title)));
  for (const part of chunks(existing)) {
    await rest('recipes?on_conflict=id', {
      method: 'POST',
      body: part.map((r) => ({ id: recipeId.get(key(r.title)), ...r })),
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
  for (const part of chunks(fresh)) {
    const rows = await rest<{ id: string; title: string }[]>('recipes', {
      method: 'POST',
      body: part,
      prefer: 'return=representation',
    });
    for (const r of rows) recipeId.set(key(r.title), r.id);
  }

  // 3. Recipe lines for every recipe in the file, so a half-finished earlier run heals itself.
  const lines = catalog.recipeIngredients.map((l) => ({
    recipe_id: recipeId.get(key(l.recipe_title))!,
    ingredient_id: ingredientId.get(key(l.ingredient_name))!,
    quantity: l.quantity,
    unit: l.unit,
  }));
  for (const part of chunks(lines)) {
    await rest('recipe_ingredients?on_conflict=recipe_id,ingredient_id', {
      method: 'POST',
      body: part,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
  // Lines an updated recipe no longer has in the file are removed, so an allergen taken out of a recipe stops counting
  // (and one that was swapped does not linger in its cost).
  let removed = 0;
  for (const r of existing) {
    const id = recipeId.get(key(r.title))!;
    const keep = lines.filter((l) => l.recipe_id === id).map((l) => l.ingredient_id);
    const gone = await rest<{ ingredient_id: string }[]>(`recipe_ingredients?recipe_id=eq.${id}&ingredient_id=not.in.(${keep.join(',')})`, {
      method: 'DELETE',
      prefer: 'return=representation',
    });
    removed += gone.length;
  }

  // 4. Nutrition, one row per ingredient, replaced on every run so corrected figures land.
  const facts = catalog.nutrition.map(({ ingredient_name, ...values }) => ({
    ingredient_id: ingredientId.get(key(ingredient_name))!,
    ...values,
  }));
  for (const part of chunks(facts)) {
    await rest('ingredient_nutrition?on_conflict=ingredient_id', {
      method: 'POST',
      body: part,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  console.log(
    `Imported: ${ingredientId.size} ingredients, ${fresh.length} new recipes, ${existing.length} existing recipes updated, ${lines.length} recipe lines (${removed} stale lines removed), ${facts.length} nutrition rows.`,
  );
} catch (e) {
  console.error(`Import stopped: ${(e as Error).message}`);
  console.error('Re-running is safe: finished steps are upserted, not duplicated.');
  process.exit(1);
}
