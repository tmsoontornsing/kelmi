# Recipe catalog import

Loads ingredients, recipes and, optionally, nutrition into Supabase from CSV files.

```bash
# Check the files without touching the database
node supabase/scripts/import-recipes.ts <folder> --dry-run

# Import (set these in your shell; never commit them or put the key in the app)
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service role key>
node supabase/scripts/import-recipes.ts <folder>

# Tests
node --test supabase/scripts/*.test.ts
```

Needs Node 23.6 or newer (it runs the `.ts` files directly). `sample-data/` holds seven placeholder
recipes for trying the importer. It is not real catalog data and should not be imported into production.

Re-running is safe. Ingredients are upserted by name (prices update). Recipes are matched by title, ignoring case:
ones that exist are updated (tags, steps, servings, minutes) and the rest are created; recipes in the database but not
in the file are left alone. Recipe lines are upserted by recipe and ingredient, and lines an updated recipe no longer has
are removed. Nutrition rows are upserted by ingredient, so corrected figures replace the old ones.

Every run prints an allergen review: recipes whose ingredients contain an allergen (by the same word lists the app and
planner use) without the matching `contains-<allergen>` tag, unknown `contains-` tags, and recipes with no `contains-`
tag. `--strict` stops the import on a missing or unknown tag; `--add-missing-allergen-tags` adds the missing tags as the
recipes are imported (the CSV itself is never changed).

## Files

Header row required, columns in any order, extra columns ignored. Quote any field that contains a comma,
quote, or line break.

**ingredients.csv**: `name, aisle, avg_price_usd, unit`

`unit` is the unit the price is for, e.g. `4.49` per `lb`. Names are unique, ignoring case.

**recipes.csv**: `title, servings, minutes, tags, steps`

`tags` is separated by `|`. `steps` is free text, one step per line.

**recipe_ingredients.csv**: `recipe_title, ingredient_name, quantity, unit`

`unit` must equal the ingredient's pricing unit, so a recipe's cost is exactly the sum of
quantity x price. Convert to that unit when preparing the data.

**nutrition.csv** (optional): `ingredient_name, grams_per_unit, kcal, protein_g, carbs_g, fiber_g, sugar_g,
fat_g, sat_fat_g, cholesterol_mg, sodium_mg`

Every nutrient is per 100 g, the way USDA FoodData Central lists them, so values can be checked against it
directly. `grams_per_unit` is what one of the ingredient's pricing units weighs: 453.6 for `lb`, about 50 for
one `each` egg, 13.5 for a `tbsp` of oil. The app works out each recipe line as
quantity x grams_per_unit / 100 x the value, sums the lines, and divides by servings. An ingredient with no
row is left out of the totals, and the recipe screen says which ones. The importer rejects rows whose
protein, carbs and fat exceed 100 g, or whose fiber, sugar or saturated fat exceed their totals.

## Tags the plan function understands

- **Meal** (required): `breakfast`, `lunch`, `dinner`. A recipe is only offered for a meal it is tagged for, and
  can carry several (a soup might be `lunch|dinner`). The importer rejects a recipe with none.
- **Diet**: `vegan`, `vegetarian`, `pescatarian`, `lowcarb`, `halal`. A recipe is only offered to someone
  on a strict diet if it carries a matching tag (a `vegan` recipe also satisfies vegetarian and pescatarian).
  Untagged recipes are offered only to people on "Everything".
- **Allergens**: `contains-peanuts`, `contains-tree-nuts`, `contains-shellfish`, `contains-dairy`,
  `contains-gluten`, `contains-eggs`, `contains-soy`. These are the reliable signal. The function also
  matches ingredient names as a backup, but that list is a safety net, not a guarantee.
- **Dislikes**: `spicy` marks spicy recipes.
- **Equipment**: `needs-<appliance>` for each appliance the recipe requires, using the app's ids:
  `stovetop`, `oven`, `microwave`, `slow-cooker`, `pressure-cooker`, `air-fryer`, `rice-cooker`, `grill`,
  `blender`, `food-processor`. A recipe is only offered to households that have every appliance it needs.
  Untagged recipes need nothing, and a household that has not listed any appliances is not filtered.
  Tag an appliance only when it is truly required, not for optional shortcuts.
