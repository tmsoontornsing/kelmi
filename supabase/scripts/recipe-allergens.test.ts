// Run with: node --test supabase/scripts/recipe-allergens.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONTAINS_TAGS, reviewAllergens, summarise, withDeclaredAllergens } from './recipe-allergens.ts';

const recipe = (title: string, tags: string[]) => ({ title, steps: 'x', servings: 2, minutes: 10, tags });
const line = (recipe_title: string, ingredient_name: string) => ({ recipe_title, ingredient_name, quantity: 1, unit: 'each' });

test('a fish recipe with no contains-fish tag is reported, and contains-fish is a known tag', () => {
  assert.ok(CONTAINS_TAGS.includes('contains-fish'));
  const reviews = reviewAllergens({
    recipes: [recipe('Salmon bowls', ['dinner']), recipe('Baked cod', ['dinner', 'contains-fish'])],
    recipeIngredients: [line('Salmon bowls', 'Salmon fillet'), line('Salmon bowls', 'Rice'), line('Baked cod', 'White fish fillets')],
  });
  assert.deepEqual(reviews[0].undeclared, ['fish']);
  assert.deepEqual(reviews[1].undeclared, []);
  const s = summarise(reviews);
  assert.equal(s.undeclared.length, 1);
  assert.match(s.undeclared[0], /^Salmon bowls: .*fish/);
});

test('every allergen the ingredients point to must be declared, and soy sauce needs soy and gluten', () => {
  const [r] = reviewAllergens({
    recipes: [recipe('Fried rice', ['dinner', 'contains-soy'])],
    recipeIngredients: [line('Fried rice', 'Soy sauce'), line('Fried rice', 'Eggs')],
  });
  assert.deepEqual(r.undeclared.sort(), ['eggs', 'gluten']);
});

test('a recipe with no contains- tags is listed as untagged, whether or not it needs one', () => {
  const s = summarise(
    reviewAllergens({
      recipes: [recipe('Rice and beans', ['dinner']), recipe('Cheese toast', ['breakfast', 'contains-dairy'])],
      recipeIngredients: [line('Rice and beans', 'Rice'), line('Cheese toast', 'Cheddar')],
    }),
  );
  assert.deepEqual(s.untagged, ['Rice and beans']);
  assert.deepEqual(s.undeclared, []);
});

test('a misspelled contains- tag is reported because the planner would never read it', () => {
  const [r] = reviewAllergens({ recipes: [recipe('Pad thai', ['dinner', 'contains-nuts'])], recipeIngredients: [line('Pad thai', 'Rice noodles')] });
  assert.deepEqual(r.unknownTags, ['contains-nuts']);
});

test('corn tortillas do not need a gluten tag', () => {
  const [r] = reviewAllergens({ recipes: [recipe('Tacos', ['dinner'])], recipeIngredients: [line('Tacos', 'Corn tortillas')] });
  assert.deepEqual(r.undeclared, []);
});

test('withDeclaredAllergens only adds tags', () => {
  assert.deepEqual(withDeclaredAllergens(['dinner', 'contains-soy'], ['soy', 'fish']), ['dinner', 'contains-soy', 'contains-fish']);
  assert.deepEqual(withDeclaredAllergens(['dinner'], []), ['dinner']);
});
