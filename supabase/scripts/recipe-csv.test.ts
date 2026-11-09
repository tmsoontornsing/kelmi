// Run with: node --test supabase/scripts/recipe-csv.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCatalog, parseCsv, unitConflicts } from './recipe-csv.ts';

const ING = 'name,aisle,avg_price_usd,unit\nChicken,Meat,4.50,lb\nOil,Pantry,0.35,tbsp\n';
const REC = 'title,servings,minutes,tags,steps\nStir fry,4,20,Dinner| Vegetarian ,"Chop.\nCook, then serve."\n';
const LINES = 'recipe_title,ingredient_name,quantity,unit\nStir fry,chicken,1.5,LB\nStir fry,Oil,2,tbsp\n';

const catalog = (o: Partial<{ ingredients: string; recipes: string; recipeIngredients: string }> = {}) =>
  parseCatalog({ ingredients: ING, recipes: REC, recipeIngredients: LINES, ...o });

test('parseCsv handles quotes, escaped quotes, embedded newlines, CRLF, and BOM', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
});

test('parseCsv rejects an unterminated quote', () => {
  assert.throws(() => parseCsv('a,b\n"oops,1\n'), /unterminated/);
});

test('a valid catalog parses, normalizes tags, and matches names case-insensitively', () => {
  const { catalog: c, errors } = catalog();
  assert.deepEqual(errors, []);
  assert.deepEqual(c.recipes[0].tags, ['dinner', 'vegetarian']);
  assert.equal(c.recipes[0].steps, 'Chop.\nCook, then serve.');
  assert.equal(c.recipeIngredients[0].ingredient_name, 'Chicken');
  assert.equal(c.recipeIngredients[0].unit, 'lb');
});

test('missing column is reported with the columns that were found', () => {
  const { errors } = catalog({ ingredients: 'name,aisle,unit\nA,B,lb\n' });
  assert.match(errors[0], /ingredients\.csv: missing column\(s\): avg_price_usd/);
});

test('bad numbers, duplicates, and unknown references are all reported', () => {
  const { errors } = catalog({
    ingredients: ING + 'chicken,Meat,x,lb\nSalt,Pantry,-1,tsp\n',
    recipes: REC + 'Stir fry,2,10,,steps\nSoup,0,10,,steps\n',
    recipeIngredients: LINES + 'Ghost,Oil,1,tbsp\nStir fry,Mystery,1,tbsp\nStir fry,Oil,0,tbsp\n',
  });
  const text = errors.join('\n');
  assert.match(text, /duplicate ingredient "chicken"/);
  assert.match(text, /ingredients\.csv row 4: avg_price_usd must be a number/);
  assert.match(text, /duplicate recipe "Stir fry"/);
  assert.match(text, /servings must be a whole number above 0/);
  assert.match(text, /recipe "Ghost" is not in recipes\.csv/);
  assert.match(text, /ingredient "Mystery" is not in ingredients\.csv/);
  assert.match(text, /quantity must be a number from 0\.01/);
  assert.match(text, /appears twice/);
});

test('a recipe line must use the ingredient pricing unit', () => {
  const { errors } = catalog({ recipeIngredients: 'recipe_title,ingredient_name,quantity,unit\nStir fry,Chicken,1,oz\nStir fry,Oil,1,tbsp\n' });
  assert.match(errors.join('\n'), /unit "oz" does not match Chicken's pricing unit "lb"/);
});

test('a recipe needs a meal tag, and one recipe can carry several', () => {
  const none = catalog({ recipes: 'title,servings,minutes,tags,steps\nStir fry,4,20,vegetarian,Cook.\n' });
  assert.match(none.errors.join('\n'), /tags must include at least one of breakfast, lunch, dinner/);
  const two = catalog({ recipes: 'title,servings,minutes,tags,steps\nStir fry,4,20,Lunch|DINNER,Cook.\n' });
  assert.deepEqual(two.errors, []);
  assert.deepEqual(two.catalog.recipes[0].tags, ['lunch', 'dinner']);
});

test('a recipe with no ingredient lines is an error', () => {
  const { errors } = catalog({ recipeIngredients: 'recipe_title,ingredient_name,quantity,unit\n' });
  assert.match(errors.join('\n'), /recipe "Stir fry" has no valid ingredient lines/);
});

test('an unquoted comma gives a clear error instead of shifting columns', () => {
  const { errors } = catalog({ ingredients: 'name,aisle,avg_price_usd,unit\nSalt, fine,Pantry,1,lb\n' });
  assert.match(errors.join('\n'), /5 values but only 4 columns/);
});

test('prices accept a dollar sign', () => {
  const { catalog: c, errors } = catalog({ ingredients: 'name,aisle,avg_price_usd,unit\nChicken,Meat,"$4.50",lb\nOil,Pantry,0.35,tbsp\n' });
  assert.deepEqual(errors, []);
  assert.equal(c.ingredients[0].avg_price_usd, 4.5);
});

const NUT = 'ingredient_name,grams_per_unit,kcal,protein_g,carbs_g,fiber_g,sugar_g,fat_g,sat_fat_g,cholesterol_mg,sodium_mg\n';

test('nutrition is optional and parses when given', () => {
  assert.deepEqual(catalog().catalog.nutrition, []);
  const { catalog: c, errors } = parseCatalog({
    ingredients: ING,
    recipes: REC,
    recipeIngredients: LINES,
    nutrition: NUT + 'chicken,453.6,120,22.5,0,0,0,2.6,0.6,73,45\n',
  });
  assert.deepEqual(errors, []);
  assert.equal(c.nutrition[0].ingredient_name, 'Chicken');
  assert.equal(c.nutrition[0].sodium_mg, 45);
});

test('nutrition rows with unknown names, bad numbers, or impossible totals are reported', () => {
  const { errors } = parseCatalog({
    ingredients: ING,
    recipes: REC,
    recipeIngredients: LINES,
    nutrition:
      NUT +
      'Tofu,100,1,1,1,0,0,1,0,0,0\n' +
      'Chicken,0,120,22.5,0,0,0,2.6,0.6,73,45\n' +
      'Oil,13.5,884,0,0,0,0,100,13.8,0,2\n' +
      'oil,13.5,884,0,0,0,0,100,13.8,0,2\n',
  });
  assert.ok(errors.some((e) => /row 1: ingredient "Tofu" is not in ingredients\.csv/.test(e)));
  assert.ok(errors.some((e) => /row 2: grams_per_unit must be a number above 0/.test(e)));
  assert.ok(errors.some((e) => /row 4: duplicate nutrition for "oil"/.test(e)));
  const { errors: totals } = parseCatalog({
    ingredients: ING,
    recipes: REC,
    recipeIngredients: LINES,
    nutrition: NUT + 'Chicken,453.6,500,60,30,40,0,20,25,0,0\n',
  });
  assert.ok(totals.some((e) => /add up to 110 g/.test(e)));
});

test('unitConflicts lists every ingredient used with more than one unit, ignoring case and spacing', () => {
  const lines = [
    { recipe: 'Stir fry', ingredient: 'Chicken', unit: 'lb' },
    { recipe: 'Soup', ingredient: ' chicken ', unit: 'LB' },
    { recipe: 'Curry', ingredient: 'Rice', unit: 'cup' },
    { recipe: 'Pilaf', ingredient: 'rice', unit: 'oz' },
    { recipe: 'Bowl', ingredient: 'Oil', unit: 'tbsp' },
  ];
  const out = unitConflicts(lines);
  assert.equal(out.length, 1);
  assert.match(out[0], /^rice is used with 2 different units: "cup" \(Curry\) vs "oz" \(Pilaf\)$/i);
  assert.deepEqual(unitConflicts(lines.filter((l) => l.ingredient.trim().toLowerCase() !== 'rice')), []);
});
