-- Nutrition facts for each catalog ingredient, so the app can show calories, macros, cholesterol and sodium
-- per serving. Every nutrient is per 100 g of the ingredient; grams_per_unit converts the ingredient's
-- pricing unit (one lb, one each, one tbsp) to grams, so a recipe line's nutrients are
-- quantity x grams_per_unit / 100 x the value here. Filled by supabase/scripts/import-recipes.ts from
-- nutrition.csv. An ingredient with no row simply has no nutrition shown.
create table public.ingredient_nutrition (
  ingredient_id uuid primary key references public.ingredients (id) on delete cascade,
  grams_per_unit numeric(10, 2) not null check (grams_per_unit > 0),
  kcal numeric(8, 2) not null check (kcal >= 0),
  protein_g numeric(8, 2) not null check (protein_g >= 0),
  carbs_g numeric(8, 2) not null check (carbs_g >= 0),
  fiber_g numeric(8, 2) not null check (fiber_g >= 0),
  sugar_g numeric(8, 2) not null check (sugar_g >= 0),
  fat_g numeric(8, 2) not null check (fat_g >= 0),
  sat_fat_g numeric(8, 2) not null check (sat_fat_g >= 0),
  cholesterol_mg numeric(8, 2) not null check (cholesterol_mg >= 0),
  sodium_mg numeric(10, 2) not null check (sodium_mg >= 0)
);

-- Catalog data: readable by signed-in users, written only by the service role (the import script).
alter table public.ingredient_nutrition enable row level security;

create policy "ingredient_nutrition: read" on public.ingredient_nutrition
  for select using (auth.role() = 'authenticated');
