// What the + menu offers on each pantry shelf. Names match the recipe catalog exactly, so an item added here comes off
// the grocery list when a recipe needs it. Saved in English; shown with tx().
// i18n: content
export const COMMON: Record<string, string[]> = {
  Staples: [
    'Rice', 'Quinoa', 'Spaghetti', 'Penne', 'Egg noodles', 'Lentils', 'Rolled oats', 'Flour', 'Sugar', 'Cornstarch',
    'Baking powder', 'Olive oil', 'Sesame oil', 'Soy sauce', 'Rice vinegar', 'Honey', 'Maple syrup', 'Canned tuna',
    'Black beans (canned)', 'Kidney beans (canned)', 'Chickpeas (canned)', 'Diced tomatoes (canned)', 'Tomato paste',
    'Marinara sauce', 'Chicken broth', 'Vegetable broth', 'Almonds', 'Sandwich bread', 'Flour tortillas', 'Corn tortillas',
  ],
  Spices: [
    'Salt', 'Black pepper', 'Cumin', 'Chili powder', 'Paprika', 'Oregano', 'Italian seasoning', 'Curry powder',
    'Red pepper flakes', 'Cinnamon',
  ],
  Fridge: [
    'Eggs', 'Butter', 'Milk', 'Plain yogurt', 'Cheddar', 'Mozzarella', 'Parmesan', 'Feta', 'Tofu (firm)', 'Orange juice',
    'Ketchup', 'Mustard', 'Mayonnaise', 'Salsa', 'Hummus', 'Bacon', 'Deli turkey',
  ],
  Freezer: ['Frozen peas and carrots', 'Frozen corn', 'Frozen berries', 'Pizza dough', 'Chicken breast', 'Ground beef', 'Shrimp'],
  Produce: [
    'Garlic', 'Ginger', 'Yellow onion', 'Red onion', 'Green onions', 'Bell pepper', 'Carrots', 'Celery', 'Russet potato',
    'Sweet potato', 'Tomato', 'Cucumber', 'Spinach', 'Lemon', 'Lime', 'Avocado', 'Bananas', 'Apples',
  ],
};

// Which shelf a typed name probably belongs on: a known item first, then a few giveaway words. Null when unsure.
export function guessShelf(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const [shelf, items] of Object.entries(COMMON)) if (items.some((i) => i.toLowerCase() === n)) return shelf;
  if (/\b(frozen|ice cream)\b/.test(n)) return 'Freezer';
  if (/\b(powder|seasoning|spice|pepper flakes|cinnamon|turmeric|nutmeg|paprika|cumin|oregano|thyme|rosemary)\b/.test(n)) return 'Spices';
  if (/\b(milk|cheese|yogurt|butter|cream|egg|eggs|juice|sauce|dressing|ham|sausage|tofu)\b/.test(n)) return 'Fridge';
  if (/\b(onion|lettuce|apple|banana|berries|pepper|tomato|potato|carrot|herb|garlic|fruit|vegetable|mushroom)\b/.test(n)) return 'Produce';
  if (/\b(rice|pasta|noodle|flour|sugar|oil|vinegar|beans|lentils|oats|cereal|canned|bread|tortilla|broth)\b/.test(n)) return 'Staples';
  return null;
}

// Foods the recipe catalog uses that the + menu doesn't list, so they can still be found by typing.
const MORE: Record<string, string[]> = {
  Staples: ['Burger buns', 'English muffins', 'Pita bread'],
  Fridge: ['Rotisserie chicken'],
  Freezer: ['Chicken thighs', 'Flank steak', 'Ground turkey', 'Pork tenderloin', 'Salmon fillet', 'White fish fillets'],
  Produce: ['Baby carrots', 'Basil', 'Broccoli crowns', 'Cabbage', 'Cauliflower', 'Cilantro', 'Eggplant', 'Green beans', 'Jalapeno pepper', 'Mushrooms', 'Parsley', 'Zucchini'],
};

// Every food a pantry can hold, with the shelf it usually goes on. These are the names recipes use, so an item added here comes
// off the grocery list when a recipe needs it, and nothing outside this list can be added.
const SHELF_OF = new Map<string, string>(
  [COMMON, MORE].flatMap((group) => Object.entries(group).flatMap(([shelf, items]) => items.map((i) => [i, shelf] as const))),
);
export const FOODS = [...SHELF_OF.keys()];
export const shelfOfFood = (food: string) => SHELF_OF.get(food) ?? null;

// Lowercase, no accents or punctuation, one space between words, and a plural folded to its singular, so "Tomatoes" finds Tomato.
const norm = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?<=[a-z]{3})(es|s)\b/g, '');

// The catalog name for what someone typed, in English or in the language on screen, or null when it isn't a food Kelmi knows.
export function findFood(text: string, show: (name: string) => string = (n) => n): string | null {
  const n = norm(text);
  if (!n) return null;
  return FOODS.find((f) => norm(f) === n || norm(show(f)) === n) ?? null;
}

// Foods to offer while typing: names that start with the text first, then names with a word that does.
export function suggestFoods(text: string, show: (name: string) => string = (n) => n, limit = 6): string[] {
  const n = norm(text);
  if (n.length < 2) return [];
  const names = (f: string) => [norm(f), norm(show(f))];
  const starts = FOODS.filter((f) => names(f).some((x) => x.startsWith(n)));
  const has = FOODS.filter((f) => !starts.includes(f) && names(f).some((x) => x.split(' ').some((w) => w.startsWith(n))));
  return [...starts, ...has].slice(0, limit);
}
