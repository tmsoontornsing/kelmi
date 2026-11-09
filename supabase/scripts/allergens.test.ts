// Checks the app's pantry allergen matching against the planner's word lists.
// Run with: node --test supabase/scripts/allergens.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ALLERGEN_ALIASES as appAliases,
  ALLERGEN_SAFE_PHRASES as appSafe,
  ALLERGEN_WORDS as app,
  allergenGroupsIn,
  allergensIn,
} from '../../apps/mobile/src/lib/allergens.ts';

// plan-logic.ts imports a Deno-only module, so read its word lists out of the source instead of importing them.
const source = readFileSync(join(import.meta.dirname, '../functions/_shared/plan-logic.ts'), 'utf8');
const read = (name: string) => {
  const body = source.match(new RegExp(`export const ${name}: Record<string, string\\[\\]> = \\{([\\s\\S]*?)\\n\\};`))?.[1];
  return body ? (new Function(`return {${body}}`)() as Record<string, string[]>) : {};
};
const server = read('ALLERGEN_WORDS');

test('the app and the planner use the same allergen word lists', () => {
  assert.ok(Object.keys(server).length > 0, 'could not read the planner word list');
  assert.deepEqual(app, server);
});

test('the app and the planner use the same aliases and safe phrases', () => {
  assert.ok(Object.keys(read('ALLERGEN_ALIASES')).length > 0, 'could not read the planner aliases');
  assert.deepEqual(appAliases, read('ALLERGEN_ALIASES'));
  assert.deepEqual(appSafe, read('ALLERGEN_SAFE_PHRASES'));
});

test('every alias points at a real group', () => {
  for (const [label, groups] of Object.entries(appAliases)) for (const g of groups) assert.ok(app[g], `${label} -> ${g}`);
});

test('foods are matched to the household\'s allergies by name', () => {
  assert.deepEqual(allergensIn('Parmesan', ['Dairy', 'Eggs']), ['Dairy']);
  assert.deepEqual(allergensIn('Mayonnaise', ['Dairy', 'Eggs']), ['Eggs']);
  assert.deepEqual(allergensIn('Soy sauce', ['Soy', 'Gluten', 'Dairy']), ['Soy', 'Gluten']);
  assert.deepEqual(allergensIn('Almonds', ['Tree nuts', 'Peanuts']), ['Tree nuts']);
  assert.deepEqual(allergensIn('Rolled oats', ['Gluten']), ['Gluten']);
});

test('plurals match, and unrelated foods do not', () => {
  assert.deepEqual(allergensIn('Eggs', ['Eggs']), ['Eggs']);
  assert.deepEqual(allergensIn('Olive oil', ['Dairy', 'Soy', 'Eggs', 'Gluten']), []);
  assert.deepEqual(allergensIn('Brown rice', ['Gluten', 'Dairy']), []);
  assert.deepEqual(allergensIn('Peanut butter', ['Peanuts', 'Dairy']), ['Peanuts', 'Dairy']);
  assert.deepEqual(allergensIn('Eggplant', ['Eggs']), []);
  assert.deepEqual(allergensIn('Butternut squash', ['Dairy', 'Tree nuts', 'Peanuts']), []);
  assert.deepEqual(allergensIn('Nutmeg', ['Tree nuts', 'Nuts']), []);
});

test('an allergy with no word list is matched on its own name, and no allergies means no matches', () => {
  assert.deepEqual(allergensIn('Mustard seeds', ['Mustard']), ['Mustard']);
  assert.deepEqual(allergensIn('Parmesan', []), []);
});

// Every word added to a list, with a food that must be caught by that allergy.
const CASES: Record<string, string[]> = {
  'Dairy': ['Buttermilk', 'Paneer', 'Custard', 'Casein', 'Ghee', 'Whey protein', 'Kefir', 'Mascarpone', 'Halloumi', 'Greek yoghurt', 'Gelato', 'Half and half', 'Creme fraiche', 'Lactose', 'Cheesecake', 'Alfredo sauce', 'Labneh', 'Raita', 'Curd'],
  'Gluten': ['Pita bread', 'Naan', 'Crackers', 'Rye flour', 'Farro', 'Bulgur', 'Ramen noodles', 'Udon', 'Seitan', 'Couscous', 'Semolina', 'Tortillas', 'Flour tortillas', 'Teriyaki sauce', 'Penne', 'Gnocchi', 'Croutons', 'Pretzel', 'Bagel', 'Spelt', 'Malt vinegar', 'Pizza crust', 'Tempura shrimp'],
  'Eggs': ['Meringue', 'Aioli', 'Mayonnaise', 'Custard', 'Hollandaise', 'Egg noodles', 'Eggnog', 'Omelette', 'Quiche', 'Spaghetti carbonara'],
  'Shellfish': ['Squid', 'Calamari', 'Octopus', 'Crayfish', 'Seafood mix', 'Shellfish stock', 'Scallops', 'Langoustine'],
  'Fish': ['Snapper', 'Mackerel', 'Haddock', 'Anchovies', 'Anchovy paste', 'Swordfish', 'Pollock', 'Herring', 'Sea bass', 'Fish sauce', 'Caesar dressing', 'Dashi', 'Caviar', 'Sashimi', 'Seafood mix'],
  'Peanuts': ['Groundnut oil', 'Peanut sauce', 'Chicken satay'],
  'Tree nuts': ['Pesto', 'Pine nuts', 'Mixed nuts', 'Chestnuts', 'Marzipan', 'Praline', 'Brazil nuts', 'Nutella', 'Amaretto'],
  'Soy': ['Soybeans', 'Tamari', 'Natto', 'Teriyaki sauce', 'Hoisin sauce', 'Shoyu'],
  'Sesame': ['Halva', 'Za\'atar', 'Gomasio'],
};

for (const [allergy, foods] of Object.entries(CASES)) {
  test(`${allergy}: the added words are caught`, () => {
    for (const food of foods) assert.deepEqual(allergensIn(food, [allergy]), [allergy], food);
  });
}

test('safe foods stay safe', () => {
  assert.deepEqual(allergensIn('Corn tortillas', ['Gluten']), []);
  assert.deepEqual(allergensIn('Corn tortilla chips', ['Gluten']), []);
  assert.deepEqual(allergensIn('Rice', ['Gluten', 'Dairy', 'Eggs', 'Fish', 'Shellfish', 'Tree nuts']), []);
});

test('labels such as Nuts, Wheat, Milk and Lactose map to the right groups', () => {
  assert.deepEqual(allergensIn('Walnuts', ['Nuts']), ['Nuts']);
  assert.deepEqual(allergensIn('Peanut oil', ['Nuts']), ['Nuts']);
  assert.deepEqual(allergensIn('Wheat flour', ['Wheat']), ['Wheat']);
  assert.deepEqual(allergensIn('Spaghetti', ['Wheat']), ['Wheat']);
  assert.deepEqual(allergensIn('Cheddar', ['Milk']), ['Milk']);
  assert.deepEqual(allergensIn('Ghee', ['Lactose']), ['Lactose']);
  assert.deepEqual(allergensIn('Squid', ['Seafood']), ['Seafood']);
  assert.deepEqual(allergensIn('Salmon', ['Seafood']), ['Seafood']);
  assert.deepEqual(allergensIn('Rice', ['Nuts', 'Wheat', 'Milk', 'Lactose']), []);
});

test('allergenGroupsIn lists every group a food points to', () => {
  assert.deepEqual(allergenGroupsIn('Soy sauce').sort(), ['gluten', 'soy']);
  assert.deepEqual(allergenGroupsIn('Seafood mix').sort(), ['fish', 'shellfish']);
  assert.deepEqual(allergenGroupsIn('Rice'), []);
});
