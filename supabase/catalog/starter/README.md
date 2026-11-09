# Starter catalog (DRAFT, needs review)

72 recipes (26 breakfast, 31 lunch, 43 dinner; some serve more than one meal), 104 ingredients, 552 recipe
lines, drafted so the app and plan function have
something real to run on. **Nothing here has been checked against a store or a nutrition source.**

```bash
node supabase/scripts/import-recipes.ts supabase/catalog/starter --dry-run   # validate
node supabase/scripts/import-recipes.ts supabase/catalog/starter             # import (needs env vars, see ../../scripts/README.md)
```

## Review before importing

- **Nutrition (`nutrition.csv`) is drafted from typical USDA values, not looked up one by one.** It is per
  100 g, so each row can be checked against [USDA FoodData Central](https://fdc.nal.usda.gov). The
  `grams_per_unit` weights (a medium onion is 110 g, a bunch of cilantro 60 g, a bag of spinach 284 g) are
  the guesses most worth checking. Meat is raw weight, and bacon counts all its fat even though much
  renders out. Branded items (broth, salsa, tortillas, deli turkey) vary a lot in sodium between brands.
  `catalog-nutrition.test.ts` cross-checks each row's calories against its protein, carbs and fat.

- **Prices are rough US averages**, written from general knowledge, not looked up. They drive every
  cost estimate and budget warning, so check or replace them. Edit `avg_price_usd` in `ingredients.csv`;
  re-importing updates prices.
- **Quantities and steps are drafted, not cooked.** Skim them for anything wrong or unclear.
- **Tags were derived from ingredients**, not typed per recipe, so the allergen tags are only as good
  as the properties set for each ingredient:
  - `contains-*` comes from the ingredients (soy sauce counts as soy and gluten; egg noodles as gluten and eggs).
  - `vegan` means no meat, fish, dairy, eggs or honey. `vegetarian` means no meat or fish.
    `pescatarian` means no meat. `lowcarb` means no pasta, rice, bread, tortilla, dough, noodle or potato
    ingredient, matching the "fewer pasta, rice, and bread meals" wording in the app.
  - `halal` means no pork and no alcohol. It assumes the meat is bought halal. Nothing here checks that.
  - Processed items (broth, salsa, marinara, soy sauce) are assumed free of other allergens. Real
    products vary, so this is a place a human should look.
- **Equipment tags (`needs-oven`, `needs-stovetop`, ...) were derived from keywords in the steps**
  (roast or bake means oven, simmer or saute means stovetop, and so on), then checked by eye.
  Re-check them if you edit steps. Only stovetop, oven, slow cooker and blender are used so far, so
  ticking air fryer, grill and the rest does not change any plan until recipes need them.
- Nothing contains peanuts, and only one recipe contains tree nuts, so those two allergies barely filter yet.
- Vegan has 5 breakfasts, 9 lunches and 9 dinners, and `vegan + gluten allergy` is exactly at the minimum
  (3 / 7 / 7), so those users will see repeats. More vegan recipes are the first thing worth adding.
- **Meal tags (`breakfast`, `lunch`, `dinner`)**: a recipe can carry several, and the importer requires at least
  one. I tagged soups, salads, bowls and pitas that also work as lunch, and a few egg dishes as breakfast.
- **Oats are flagged `contains-gluten`**, because ordinary oats are usually cross-contaminated. Swap in
  certified gluten-free oats and remove the flag if you want them offered to gluten-free households.
- **Planning limits per week**: dinners all different, lunches up to 2 uses of a recipe, breakfasts up to 3.
  That needs at least 7 dinners, 4 lunches and 3 breakfasts left after a household's filters.
- A typical week for 4 people (21 meals) comes to about $208 at the draft prices.

- **Added 2026-11-02:** 9 breakfasts and brunch-style dishes (quinoa porridge, egg skillets and scrambles, turkey and
  sweet potato hash, ginger chicken rice porridge) that are free of gluten and dairy and need only a stovetop, so
  households with those allergies and no oven can fill a week. Built only from existing ingredients. Like the rest,
  they are unreviewed: a person should check the quantities, steps and allergen tags.
