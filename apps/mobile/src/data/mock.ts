// Example data from the mockups. It stands in for Supabase until the backend is wired up.

import type { Nutrients, ServingNutrition } from '../lib/nutrition';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

export type Meal = {
  id: string;
  name: string;
  type: MealType;
  minutes: string;
  cost: number;
  // Per serving, when the recipe's ingredients have nutrition data. Example data has none.
  nutrition?: Nutrients;
};

// A meal placed in the week. `slot` is its position in the 21-slot plan: day * 3 + the meal type's order.
// `appliances` is the equipment it needs, so the week can flag anything the household lacks.
export type PlannedMeal = Meal & {
  day: string;
  dayLong: string;
  slot: number;
  appliances: string[];
  // How the household treats this meal: cook it (buy for it), skip it (eating out), or eat leftovers. Example data always cooks.
  status?: SlotStatus;
  // The meal breaks the household's allergies or diet, so it is left off the grocery list until swapped.
  conflict?: boolean;
  leftoverId?: string | null;
};

export type SlotStatus = 'cook' | 'skip' | 'leftover';

// A cooked meal with servings still in the fridge.
export type Leftover = { id: string; recipeId: string; name: string; servings: number; cookedOn: string };

// A grocery list line. `key` identifies it for checking off: the line text here, the database row id when live.
export type GroceryItem = { key: string; name: string; price: number };
export type GroceryAisle = { name: string; items: GroceryItem[] };

export const DAYS = [
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
  ['Sun', 'Sunday'],
] as const;

export const MEALS: Record<string, Meal> = {
  // Breakfast. Costs are per use for the household, not whole packages.
  oats: { id: 'oats', name: 'Overnight oats with berries', type: 'breakfast', minutes: '5 min prep', cost: 4 },
  eggtoast: { id: 'eggtoast', name: 'Spinach scramble on toast', type: 'breakfast', minutes: '15 min', cost: 5 },
  parfait: { id: 'parfait', name: 'Yogurt and granola parfaits', type: 'breakfast', minutes: '5 min', cost: 5 },
  pancakes: { id: 'pancakes', name: 'Banana pancakes', type: 'breakfast', minutes: '20 min', cost: 4 },
  burritos: { id: 'burritos', name: 'Egg and bean breakfast burritos', type: 'breakfast', minutes: '20 min', cost: 6 },
  avotoast: { id: 'avotoast', name: 'Avocado toast with eggs', type: 'breakfast', minutes: '10 min', cost: 5 },
  appleoats: { id: 'appleoats', name: 'Cinnamon apple oatmeal', type: 'breakfast', minutes: '15 min', cost: 3 },
  smoothie: { id: 'smoothie', name: 'Berry yogurt smoothies', type: 'breakfast', minutes: '5 min', cost: 5 },
  // Lunch
  wraps: { id: 'wraps', name: 'Turkey and avocado wraps', type: 'lunch', minutes: '10 min', cost: 10 },
  tunasalad: { id: 'tunasalad', name: 'Tuna and chickpea salad', type: 'lunch', minutes: '15 min', cost: 8 },
  quesadilla: { id: 'quesadilla', name: 'Black bean quesadillas', type: 'lunch', minutes: '20 min', cost: 8 },
  chickensand: { id: 'chickensand', name: 'Chicken salad sandwiches', type: 'lunch', minutes: '15 min', cost: 8 },
  tomatosoup: { id: 'tomatosoup', name: 'Tomato soup with grilled cheese', type: 'lunch', minutes: '35 min', cost: 9 },
  hummus: { id: 'hummus', name: 'Hummus and veggie pitas', type: 'lunch', minutes: '10 min', cost: 8 },
  noodlesoup: { id: 'noodlesoup', name: 'Chicken noodle soup', type: 'lunch', minutes: '40 min', cost: 9 },
  burritobowl: { id: 'burritobowl', name: 'Black bean burrito bowls', type: 'lunch', minutes: '25 min', cost: 11 },
  // Dinner
  fajitas: { id: 'fajitas', name: 'Sheet-pan chicken fajitas', type: 'dinner', minutes: '30 min', cost: 16 },
  tacos: { id: 'tacos', name: 'Black bean and sweet potato tacos', type: 'dinner', minutes: '25 min', cost: 11 },
  spaghetti: { id: 'spaghetti', name: 'Spaghetti with turkey meatballs', type: 'dinner', minutes: '35 min', cost: 15 },
  friedrice: { id: 'friedrice', name: 'Veggie fried rice with eggs', type: 'dinner', minutes: '20 min', cost: 9 },
  pizza: { id: 'pizza', name: 'Homemade margherita pizza', type: 'dinner', minutes: '40 min', cost: 14 },
  chili: { id: 'chili', name: 'Slow-cooker beef chili', type: 'dinner', minutes: '15 min prep', cost: 21 },
  salmon: { id: 'salmon', name: 'Lemon garlic salmon with broccoli', type: 'dinner', minutes: '25 min', cost: 26 },
  pesto: { id: 'pesto', name: 'Chicken pesto pasta', type: 'dinner', minutes: '25 min', cost: 13 },
  bowls: { id: 'bowls', name: 'Turkey taco bowls', type: 'dinner', minutes: '20 min', cost: 14 },
  ziti: { id: 'ziti', name: 'Baked ziti with spinach', type: 'dinner', minutes: '45 min', cost: 17 },
  lentil: { id: 'lentil', name: 'Lentil soup with crusty bread', type: 'dinner', minutes: '40 min', cost: 8 },
};

// The default week, Monday to Sunday. Dinners are all different; breakfasts and lunches repeat.
export const DEFAULT_PLAN: Record<MealType, string[]> = {
  breakfast: ['oats', 'eggtoast', 'parfait', 'oats', 'burritos', 'pancakes', 'eggtoast'],
  lunch: ['wraps', 'tunasalad', 'quesadilla', 'chickensand', 'tomatosoup', 'wraps', 'quesadilla'],
  dinner: ['fajitas', 'tacos', 'spaghetti', 'friedrice', 'pizza', 'chili', 'salmon'],
};

// Meal ids in plan order: Monday breakfast, lunch, dinner, then Tuesday, and so on.
export const DEFAULT_SLOTS: string[] = Array.from(
  { length: 21 },
  (_, slot) => DEFAULT_PLAN[MEAL_TYPES[slot % 3]][Math.floor(slot / 3)],
);

// Alternatives offered when swapping, by meal type.
export const SWAP_POOL: Record<MealType, string[]> = {
  breakfast: ['avotoast', 'appleoats', 'smoothie'],
  lunch: ['hummus', 'noodlesoup', 'burritobowl'],
  dinner: ['pesto', 'bowls', 'ziti', 'lentil'],
};

// Kitchen equipment a household can say it has. Meals that need something a household lacks are flagged.
export const APPLIANCES = [
  { id: 'stovetop', name: 'Stovetop', detail: 'Burners for pots and pans' },
  { id: 'oven', name: 'Oven', detail: 'For roasting and baking' },
  { id: 'microwave', name: 'Microwave', detail: '' },
  { id: 'slow-cooker', name: 'Slow cooker', detail: 'Crock-Pot or similar' },
  { id: 'pressure-cooker', name: 'Pressure cooker', detail: 'Instant Pot or similar' },
  { id: 'air-fryer', name: 'Air fryer', detail: '' },
  { id: 'rice-cooker', name: 'Rice cooker', detail: '' },
  { id: 'grill', name: 'Grill', detail: 'Outdoor or indoor' },
  { id: 'blender', name: 'Blender', detail: 'Countertop or immersion' },
  { id: 'food-processor', name: 'Food processor', detail: '' },
] as const;

export type ApplianceId = (typeof APPLIANCES)[number]['id'];

export const applianceName = (id: string) => APPLIANCES.find((a) => a.id === id)?.name ?? id;

export type RecipeDetail = {
  serves: number;
  // Equipment the recipe needs. Anything the household has not ticked is flagged.
  appliances: ApplianceId[];
  ingredients: { name: string; price: number | 'pantry' }[];
  steps: string[];
  // The household's own changes to this recipe (Plus): a private note, and whether amounts or steps were edited.
  note?: string;
  edited?: boolean;
  // Per serving, estimated from the ingredients. Absent when no ingredient has nutrition data.
  nutrition?: ServingNutrition;
};

// What the recipe screen shows: the meal, and its ingredients and steps when they are available.
export type RecipeView = { meal: Meal; detail: RecipeDetail | null };

export const RECIPES: Record<string, RecipeDetail> = {
  fajitas: {
    serves: 4,
    appliances: ['oven'],
    ingredients: [
      { name: 'Chicken breast, 2 lb', price: 8.98 },
      { name: 'Bell peppers, 3', price: 3.75 },
      { name: 'Yellow onion, 1', price: 0.87 },
      { name: 'Flour tortillas, 8', price: 2.63 },
      { name: 'Olive oil, 2 tbsp', price: 'pantry' },
      { name: 'Garlic, 2 cloves', price: 'pantry' },
      { name: 'Chili powder, 1 tbsp', price: 'pantry' },
    ],
    steps: [
      'Heat the oven to 425°F and line a sheet pan with foil.',
      'Slice the chicken, peppers, and onion into thin strips.',
      'Toss with the olive oil, minced garlic, and chili powder, then spread on the pan.',
      'Roast 20 to 22 minutes, until the chicken reaches 165°F.',
      'Warm the tortillas and fill them at the table.',
    ],
  },
  tacos: {
    serves: 4,
    appliances: ['oven', 'stovetop'],
    ingredients: [
      { name: 'Sweet potatoes, 2 lb', price: 2.98 },
      { name: 'Black beans, 2 cans', price: 2.18 },
      { name: 'Flour tortillas, 8', price: 2.63 },
      { name: 'Limes, 2', price: 1.38 },
      { name: 'Cilantro, 1 bunch', price: 0.85 },
      { name: 'Yellow onion, 1', price: 0.87 },
      { name: 'Olive oil, 1 tbsp', price: 'pantry' },
      { name: 'Cumin, 1 tsp', price: 'pantry' },
      { name: 'Salt, a pinch', price: 'pantry' },
    ],
    steps: [
      'Heat the oven to 425°F.',
      'Cut the sweet potatoes into small cubes, toss with the olive oil, half the cumin, and a pinch of salt, and roast 20 minutes until tender.',
      'Warm the black beans in a small pot with the remaining cumin and the chopped onion, about 5 minutes.',
      'Warm the tortillas in a dry pan.',
      'Fill with sweet potato and beans, then top with cilantro and a squeeze of lime.',
    ],
  },
  spaghetti: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Spaghetti, 1 lb', price: 1.49 },
      { name: 'Ground turkey, 1 lb', price: 5.49 },
      { name: 'Crushed tomatoes, 2 cans', price: 3.58 },
      { name: 'Eggs, 1 dozen', price: 3.29 },
      { name: 'Yellow onion, 1', price: 0.87 },
      { name: 'Parmesan, ¼ cup', price: 'pantry' },
      { name: 'Garlic, 3 cloves', price: 'pantry' },
      { name: 'Oregano, 1 tsp', price: 'pantry' },
      { name: 'Olive oil, 1 tbsp', price: 'pantry' },
    ],
    steps: [
      'Mix the turkey with 1 egg, the grated parmesan, half the garlic, and a pinch of salt, then roll into about 16 small meatballs.',
      'Brown the meatballs in the olive oil over medium heat, about 6 minutes, turning once.',
      'Add the diced onion and remaining garlic, then the tomatoes and oregano. Simmer 15 minutes, until the meatballs are cooked through.',
      'Meanwhile, boil the spaghetti in salted water until al dente, then drain.',
      'Toss the spaghetti with the sauce and serve.',
    ],
  },
  friedrice: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Eggs, 1 dozen', price: 3.29 },
      { name: 'Peas, 12 oz', price: 1.79 },
      { name: 'Soy sauce, 10 oz', price: 2.49 },
      { name: 'Rolled oats, 18 oz', price: 3.49 },
      { name: 'Pancake mix, 2 lb', price: 2.99 },
      { name: 'Sandwich bread, 1 loaf', price: 2.49 },
      { name: 'Granola, 12 oz', price: 3.99 },
      { name: 'Maple syrup, 12 oz', price: 4.49 },
      { name: 'Chickpeas, 2 cans', price: 2.38 },
      { name: 'Canned tuna, 3 cans', price: 3.87 },
      { name: 'Green onions, 1 bunch', price: 0.99 },
      { name: 'Rice, 2 cups uncooked', price: 'pantry' },
      { name: 'Olive oil, 2 tbsp', price: 'pantry' },
      { name: 'Garlic, 2 cloves', price: 'pantry' },
    ],
    steps: [
      'Cook the rice ahead and spread it on a tray to cool. Day-old rice works best.',
      'Scramble 3 eggs in a hot pan with a little of the oil, then set them aside.',
      'Fry the garlic and the white parts of the green onions for 30 seconds, then add the peas and cook 2 minutes.',
      'Add the rice and 3 tablespoons of soy sauce and stir-fry until hot, about 4 minutes.',
      'Fold the eggs back in and top with the green onion tops.',
    ],
  },
  pizza: {
    serves: 4,
    appliances: ['oven'],
    ingredients: [
      { name: 'Pizza dough, 1 lb', price: 2.99 },
      { name: 'Shredded mozzarella, 16 oz', price: 5.98 },
      { name: 'Crushed tomatoes, 1 can', price: 1.79 },
      { name: 'Fresh basil, 1 bunch', price: 2.49 },
      { name: 'Yellow onion, 1', price: 0.87 },
      { name: 'Olive oil, 1 tbsp', price: 'pantry' },
      { name: 'Oregano, 1 tsp', price: 'pantry' },
      { name: 'Salt, a pinch', price: 'pantry' },
    ],
    steps: [
      'Heat the oven to 475°F with a baking sheet inside.',
      'Stretch the dough into a thin round on a sheet of parchment.',
      'Spread the tomatoes mixed with the oregano and salt, then top with the mozzarella and thin slices of onion.',
      'Slide it onto the hot sheet and bake 12 to 14 minutes, until the crust is browned and the cheese bubbles.',
      'Finish with torn basil and a drizzle of olive oil.',
    ],
  },
  chili: {
    serves: 6,
    appliances: ['stovetop', 'slow-cooker'],
    ingredients: [
      { name: 'Ground beef, 1.5 lb', price: 8.99 },
      { name: 'Kidney beans, 2 cans', price: 2.18 },
      { name: 'Black beans, 1 can', price: 1.09 },
      { name: 'Crushed tomatoes, 2 cans', price: 3.58 },
      { name: 'Yellow onions, 3 lb bag', price: 3.49 },
      { name: 'Chili seasoning, 1 packet', price: 1.29 },
      { name: 'Garlic, 4 cloves', price: 'pantry' },
      { name: 'Cumin, 1 tsp', price: 'pantry' },
      { name: 'Salt, to taste', price: 'pantry' },
    ],
    steps: [
      'Brown the beef with 2 chopped onions in a skillet, about 8 minutes, then drain the fat.',
      'Put the beef in the slow cooker with the drained beans, tomatoes, minced garlic, cumin, and chili seasoning.',
      'Stir, cover, and cook on low 7 to 8 hours, or on high 4 hours.',
      'Taste, add salt if it needs it, and serve.',
    ],
  },
  salmon: {
    serves: 4,
    appliances: ['oven'],
    ingredients: [
      { name: 'Salmon fillets, 1.25 lb', price: 12.49 },
      { name: 'Deli turkey, 12 oz', price: 4.99 },
      { name: 'Rotisserie chicken, 1', price: 5.99 },
      { name: 'Broccoli crowns, 1.5 lb', price: 2.97 },
      { name: 'Sweet potatoes, 2 lb', price: 2.98 },
      { name: 'Lemons, 2', price: 1.38 },
      { name: 'Butter, 1 lb', price: 4.42 },
      { name: 'Plain yogurt, 32 oz', price: 4.49 },
      { name: 'Milk, ½ gallon', price: 2.19 },
      { name: 'Shredded cheddar, 16 oz', price: 5.98 },
      { name: 'Fresh parsley, 1 bunch', price: 1.29 },
      { name: 'Garlic, 3 cloves', price: 'pantry' },
      { name: 'Olive oil, 2 tbsp', price: 'pantry' },
      { name: 'Salt and pepper', price: 'pantry' },
    ],
    steps: [
      'Heat the oven to 425°F. Cube the sweet potatoes, toss with half the olive oil and a pinch of salt, and roast 15 minutes.',
      'Add the broccoli to the pan with the rest of the oil and roast 10 more minutes.',
      'Melt 2 tablespoons of butter with the minced garlic and the juice of 1 lemon.',
      'Season the salmon with salt and pepper, set it on a second pan, spoon over the lemon butter, and roast 12 minutes, until it flakes easily.',
      'Finish with chopped parsley and lemon wedges.',
    ],
  },
  pesto: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Chicken breast, 2 lb', price: 8.98 },
      { name: 'Penne, 1 lb', price: 1.49 },
      { name: 'Basil pesto, 6 oz jar', price: 2.99 },
      { name: 'Parmesan, ¼ cup', price: 'pantry' },
      { name: 'Olive oil, 1 tbsp', price: 'pantry' },
      { name: 'Salt and pepper', price: 'pantry' },
    ],
    steps: [
      'Cut the chicken into bite-size pieces and season with salt and pepper.',
      'Boil the penne in salted water according to the package. Save ½ cup of the pasta water, then drain.',
      'Sear the chicken in the olive oil over medium-high heat, 6 to 7 minutes, until golden and 165°F inside.',
      'Lower the heat, add the pasta, the pesto, and a splash of pasta water, and toss until coated.',
      'Serve with parmesan.',
    ],
  },
  bowls: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Ground turkey, 1 lb', price: 5.49 },
      { name: 'Black beans, 1 can', price: 1.09 },
      { name: 'Sweet corn, 12 oz', price: 1.79 },
      { name: 'Taco seasoning, 1 packet', price: 1.29 },
      { name: 'Salsa, 1 jar', price: 3.49 },
      { name: 'Limes, 1', price: 0.69 },
      { name: 'Rice, 2 cups uncooked', price: 'pantry' },
      { name: 'Olive oil, 1 tbsp', price: 'pantry' },
    ],
    steps: [
      'Cook the rice.',
      'Brown the turkey in the olive oil, breaking it up. Add the taco seasoning and ¼ cup of water and simmer 3 minutes.',
      'Warm the beans and corn together in a small pan.',
      'Build the bowls with rice, turkey, beans and corn, and salsa. Finish with a squeeze of lime.',
    ],
  },
  ziti: {
    serves: 6,
    appliances: ['oven', 'stovetop'],
    ingredients: [
      { name: 'Ziti or penne, 1 lb', price: 1.49 },
      { name: 'Crushed tomatoes, 2 cans', price: 3.58 },
      { name: 'Shredded mozzarella, 16 oz', price: 5.98 },
      { name: 'Ricotta, 15 oz', price: 3.49 },
      { name: 'Baby spinach, 10 oz', price: 2.99 },
      { name: 'Garlic, 3 cloves', price: 'pantry' },
      { name: 'Oregano, 1 tsp', price: 'pantry' },
      { name: 'Olive oil, 1 tbsp', price: 'pantry' },
      { name: 'Salt, to taste', price: 'pantry' },
    ],
    steps: [
      'Heat the oven to 375°F. Boil the ziti 2 minutes short of the package time, then drain.',
      'Warm the minced garlic in the olive oil in a large pot for 1 minute, then add the tomatoes, oregano, and salt and simmer 10 minutes.',
      'Stir the spinach into the sauce until wilted, then stir in the pasta.',
      'Spread half in a 9 by 13 inch dish, dot with ricotta, add the rest, and top with the mozzarella.',
      'Bake 20 to 25 minutes, until bubbling and browned on top.',
    ],
  },
  lentil: {
    serves: 6,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Brown lentils, 1 lb', price: 1.99 },
      { name: 'Carrots, 1 lb', price: 1.29 },
      { name: 'Yellow onion, 1', price: 0.87 },
      { name: 'Crushed tomatoes, 1 can', price: 1.79 },
      { name: 'Crusty bread, 1 loaf', price: 2.49 },
      { name: 'Chicken broth or water, 6 cups', price: 'pantry' },
      { name: 'Garlic, 3 cloves', price: 'pantry' },
      { name: 'Cumin, 2 tsp', price: 'pantry' },
      { name: 'Olive oil, 2 tbsp', price: 'pantry' },
    ],
    steps: [
      'Soften the diced onion and carrots in the olive oil, about 6 minutes.',
      'Add the minced garlic and cumin and stir for 30 seconds.',
      'Add the rinsed lentils, tomatoes, broth, and 1 teaspoon of salt. Bring to a boil, then simmer 30 minutes, until the lentils are tender.',
      'Taste, adjust the salt, and serve with the bread.',
    ],
  },

  // Breakfast and lunch. Prices are for the portion used, since a package is shared across several meals.
  oats: {
    serves: 4,
    appliances: [],
    ingredients: [
      { name: 'Rolled oats, 2 cups', price: 0.9 },
      { name: 'Milk, 2 cups', price: 0.5 },
      { name: 'Plain yogurt, 1 cup', price: 0.6 },
      { name: 'Frozen berries, 1 cup', price: 1.6 },
      { name: 'Sugar, 2 tbsp', price: 'pantry' },
    ],
    steps: [
      'Stir the oats, milk, yogurt, and sugar together in a large jar or bowl.',
      'Cover and refrigerate overnight, at least 6 hours.',
      'In the morning, loosen with a splash of milk if it is thick, then top with the berries.',
    ],
  },
  eggtoast: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Eggs, 8', price: 2.19 },
      { name: 'Sandwich bread, 8 slices', price: 1.0 },
      { name: 'Baby spinach, 2 cups', price: 1.5 },
      { name: 'Butter, 2 tbsp', price: 0.4 },
      { name: 'Salt, a pinch', price: 'pantry' },
    ],
    steps: [
      'Whisk the eggs with a pinch of salt.',
      'Melt 1 tablespoon of butter in a nonstick pan over medium-low heat and wilt the spinach for 1 minute.',
      'Pour in the eggs and stir gently until just set, about 3 minutes.',
      'Toast the bread, butter it with the rest of the butter, and top with the eggs.',
    ],
  },
  parfait: {
    serves: 4,
    appliances: [],
    ingredients: [
      { name: 'Plain yogurt, 4 cups', price: 2.4 },
      { name: 'Granola, 1 cup', price: 0.9 },
      { name: 'Bananas, 2', price: 0.5 },
      { name: 'Frozen berries, 1 cup', price: 1.6 },
    ],
    steps: [
      'Slice the bananas.',
      'Layer the yogurt, granola, berries, and banana in four glasses or bowls.',
      'Serve right away so the granola stays crunchy.',
    ],
  },
  pancakes: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Pancake mix, 2 cups', price: 1.0 },
      { name: 'Eggs, 1', price: 0.27 },
      { name: 'Milk, 1 cup', price: 0.25 },
      { name: 'Bananas, 3', price: 0.75 },
      { name: 'Maple syrup, ¼ cup', price: 1.5 },
    ],
    steps: [
      'Whisk the mix, egg, and milk until just combined. A few lumps are fine.',
      'Heat a lightly oiled pan over medium heat and pour in ¼ cup of batter per pancake.',
      'Flip when bubbles form and the edges look set, about 2 minutes a side.',
      'Serve with sliced banana and syrup.',
    ],
  },
  burritos: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Eggs, 6', price: 1.65 },
      { name: 'Flour tortillas, 4', price: 1.3 },
      { name: 'Black beans, 1 can', price: 1.09 },
      { name: 'Shredded cheddar, 4 oz', price: 1.0 },
      { name: 'Salsa, ¼ jar', price: 0.9 },
    ],
    steps: [
      'Warm the beans in a small pot and mash them lightly.',
      'Scramble the eggs in a pan until just set.',
      'Warm the tortillas and fill with the eggs, beans, cheddar, and salsa.',
      'Fold in the sides and roll up tightly.',
    ],
  },
  avotoast: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Sandwich bread, 8 slices', price: 1.0 },
      { name: 'Avocados, 2', price: 2.5 },
      { name: 'Eggs, 4', price: 1.1 },
      { name: 'Lemons, 1', price: 0.69 },
      { name: 'Salt, a pinch', price: 'pantry' },
    ],
    steps: [
      'Toast the bread.',
      'Mash the avocados with the lemon juice and a pinch of salt and spread on the toast.',
      'Fry the eggs in a lightly oiled pan until the whites are set.',
      'Top each toast with an egg.',
    ],
  },
  appleoats: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Rolled oats, 2 cups', price: 0.9 },
      { name: 'Milk, 2 cups', price: 0.5 },
      { name: 'Apples, 2', price: 1.2 },
      { name: 'Cinnamon, 1 tsp', price: 'pantry' },
      { name: 'Sugar, 1 tbsp', price: 'pantry' },
    ],
    steps: [
      'Dice the apples.',
      'Simmer the oats, milk, 1 cup of water, and the apples for 8 to 10 minutes, stirring often.',
      'Stir in the cinnamon and sugar and serve warm.',
    ],
  },
  smoothie: {
    serves: 4,
    appliances: ['blender'],
    ingredients: [
      { name: 'Frozen berries, 2 cups', price: 3.2 },
      { name: 'Bananas, 2', price: 0.5 },
      { name: 'Plain yogurt, 1 cup', price: 0.6 },
      { name: 'Milk, 1 cup', price: 0.25 },
    ],
    steps: [
      'Put the milk, yogurt, banana, and berries in the blender, in that order.',
      'Blend until smooth, about 1 minute, adding milk if it is too thick.',
      'Pour into four glasses.',
    ],
  },
  wraps: {
    serves: 4,
    appliances: [],
    ingredients: [
      { name: 'Flour tortillas, 4', price: 1.3 },
      { name: 'Deli turkey, 12 oz', price: 4.99 },
      { name: 'Avocados, 2', price: 2.5 },
      { name: 'Baby spinach, 2 cups', price: 1.0 },
      { name: 'Tomato, 1', price: 0.7 },
      { name: 'Salt, a pinch', price: 'pantry' },
    ],
    steps: [
      'Mash the avocados with a pinch of salt and spread over the tortillas.',
      'Layer on the turkey, spinach, and sliced tomato.',
      'Roll up tightly, tucking in the sides, and cut in half.',
    ],
  },
  tunasalad: {
    serves: 4,
    appliances: [],
    ingredients: [
      { name: 'Canned tuna, 3 cans', price: 3.87 },
      { name: 'Chickpeas, 2 cans', price: 2.38 },
      { name: 'Cucumbers, 1', price: 0.89 },
      { name: 'Red onion, ½', price: 0.6 },
      { name: 'Lemons, 1', price: 0.69 },
      { name: 'Olive oil, 2 tbsp', price: 'pantry' },
    ],
    steps: [
      'Drain the tuna and chickpeas.',
      'Dice the cucumber and onion.',
      'Toss everything with the olive oil, the juice of 1 lemon, and a pinch of salt.',
      'Serve as it is, over greens, or with crackers.',
    ],
  },
  quesadilla: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Flour tortillas, 8', price: 2.63 },
      { name: 'Shredded cheddar, 8 oz', price: 2.99 },
      { name: 'Black beans, 1 can', price: 1.09 },
      { name: 'Bell pepper, 1', price: 1.25 },
    ],
    steps: [
      'Slice the pepper and soften it in a pan, about 3 minutes.',
      'Cover half of each tortilla with cheese, beans, and pepper, then fold over.',
      'Cook in a lightly oiled pan 2 to 3 minutes a side, until golden and melted.',
      'Cut into wedges.',
    ],
  },
  chickensand: {
    serves: 4,
    appliances: [],
    ingredients: [
      { name: 'Rotisserie chicken, 1', price: 5.99 },
      { name: 'Sandwich bread, 8 slices', price: 1.0 },
      { name: 'Celery, 2 stalks', price: 0.5 },
      { name: 'Plain yogurt, ½ cup', price: 0.3 },
      { name: 'Mayonnaise, 3 tbsp', price: 'pantry' },
      { name: 'Salt and pepper', price: 'pantry' },
    ],
    steps: [
      'Shred the chicken, discarding the skin.',
      'Mix with the chopped celery, mayonnaise, yogurt, salt, and pepper.',
      'Pile onto the bread and close the sandwiches.',
    ],
  },
  tomatosoup: {
    serves: 4,
    appliances: ['stovetop', 'blender'],
    ingredients: [
      { name: 'Crushed tomatoes, 2 cans', price: 3.58 },
      { name: 'Shredded cheddar, 8 oz', price: 2.99 },
      { name: 'Sandwich bread, 8 slices', price: 1.0 },
      { name: 'Yellow onion, 1', price: 0.87 },
      { name: 'Butter, 2 tbsp', price: 0.4 },
      { name: 'Milk, ½ cup', price: 0.12 },
      { name: 'Garlic, 2 cloves', price: 'pantry' },
      { name: 'Olive oil, 1 tbsp', price: 'pantry' },
    ],
    steps: [
      'Soften the diced onion and garlic in the olive oil, about 5 minutes.',
      'Add the tomatoes and 1 cup of water, simmer 15 minutes, then blend smooth and stir in the milk.',
      'Butter the bread, fill with the cheddar, and cook in a pan until golden on both sides.',
      'Serve the soup with the sandwiches.',
    ],
  },
  hummus: {
    serves: 4,
    appliances: [],
    ingredients: [
      { name: 'Hummus, 10 oz', price: 3.29 },
      { name: 'Pita bread, 4', price: 2.19 },
      { name: 'Cucumbers, 1', price: 0.89 },
      { name: 'Baby carrots, 1 bag', price: 1.49 },
    ],
    steps: [
      'Slice the cucumber and cut the pitas in half.',
      'Spread the hummus inside the pitas.',
      'Stuff with cucumber and serve with the carrots on the side.',
    ],
  },
  noodlesoup: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Chicken breast, 1 lb', price: 4.49 },
      { name: 'Egg noodles, 8 oz', price: 1.25 },
      { name: 'Carrots, ¾ lb', price: 0.97 },
      { name: 'Celery, 1 bunch', price: 1.49 },
      { name: 'Yellow onion, 1', price: 0.87 },
      { name: 'Chicken broth, 8 cups', price: 'pantry' },
    ],
    steps: [
      'Simmer the chicken in the broth with the chopped carrots, celery, and onion for 20 minutes.',
      'Lift out the chicken, shred it, and return it to the pot.',
      'Add the noodles and cook until tender, about 7 minutes.',
      'Season with salt and pepper and serve.',
    ],
  },
  burritobowl: {
    serves: 4,
    appliances: ['stovetop'],
    ingredients: [
      { name: 'Black beans, 2 cans', price: 2.18 },
      { name: 'Avocados, 2', price: 2.5 },
      { name: 'Sweet corn, 12 oz', price: 1.79 },
      { name: 'Salsa, 1 jar', price: 3.49 },
      { name: 'Limes, 2', price: 1.38 },
      { name: 'Rice, 2 cups uncooked', price: 'pantry' },
    ],
    steps: [
      'Cook the rice.',
      'Warm the beans and corn together in a small pot.',
      'Build the bowls with rice, beans and corn, sliced avocado, and salsa.',
      'Finish with a squeeze of lime.',
    ],
  },
};

export type Aisle = { name: string; items: { name: string; price: number }[] };

export const GROCERIES: Aisle[] = [
  {
    name: 'Produce',
    items: [
      { name: 'Bell peppers, 3', price: 3.75 },
      { name: 'Sweet potatoes, 2 lb', price: 2.98 },
      { name: 'Yellow onions, 3 lb bag', price: 3.49 },
      { name: 'Broccoli crowns, 1.5 lb', price: 2.97 },
      { name: 'Lemons, 2', price: 1.38 },
      { name: 'Cilantro, 1 bunch', price: 0.85 },
      { name: 'Bananas, 1 bunch', price: 1.74 },
      { name: 'Avocados, 4', price: 4.0 },
      { name: 'Baby spinach, 10 oz', price: 2.99 },
    ],
  },
  {
    name: 'Meat and Seafood',
    items: [
      { name: 'Chicken breast, 2 lb', price: 8.98 },
      { name: 'Ground turkey, 1 lb', price: 5.49 },
      { name: 'Ground beef, 1.5 lb', price: 8.99 },
      { name: 'Salmon fillets, 1.25 lb', price: 12.49 },
    ],
  },
  {
    name: 'Dairy and Eggs',
    items: [
      { name: 'Eggs, 1 dozen', price: 3.29 },
      { name: 'Shredded mozzarella, 8 oz', price: 2.99 },
      { name: 'Sour cream, 16 oz', price: 3.19 },
      { name: 'Butter, 1 lb', price: 4.42 },
    ],
  },
  {
    name: 'Pantry',
    items: [
      { name: 'Black beans, 2 cans', price: 2.18 },
      { name: 'Kidney beans, 2 cans', price: 2.18 },
      { name: 'Crushed tomatoes, 2 cans', price: 3.58 },
      { name: 'Spaghetti, 1 lb', price: 1.49 },
      { name: 'Flour tortillas, 10 ct', price: 3.29 },
      { name: 'Pizza dough, 1 lb', price: 2.99 },
      { name: 'Chili seasoning', price: 1.29 },
      { name: 'Taco seasoning', price: 1.29 },
      { name: 'Soy sauce, 10 oz', price: 2.49 },
    ],
  },
  {
    name: 'Frozen',
    items: [
      { name: 'Mixed vegetables, 2 bags', price: 4.58 },
      { name: 'Peas, 12 oz', price: 1.79 },
      { name: 'Sweet corn, 12 oz', price: 1.79 },
      { name: 'Mixed berries, 24 oz', price: 6.58 },
    ],
  },
];

export type Shelf = { name: string; items: string[] };

export const PANTRY: Shelf[] = [
  { name: 'Staples', items: ['Rice', 'Olive oil', 'Flour', 'Sugar', 'Chicken broth'] },
  { name: 'Spices', items: ['Garlic', 'Salt', 'Black pepper', 'Chili powder', 'Cumin', 'Oregano'] },
  { name: 'Fridge', items: ['Ketchup', 'Mustard', 'Mayonnaise', 'Parmesan'] },
];

export const DIETS = [
  { id: 'any', name: 'Everything', detail: 'Meat, fish, and vegetarian meals' },
  { id: 'vegetarian', name: 'Vegetarian', detail: 'No meat or fish' },
  { id: 'pescatarian', name: 'Pescatarian', detail: 'Fish and seafood, no other meat' },
  { id: 'vegan', name: 'Vegan', detail: 'No animal products' },
  { id: 'lowcarb', name: 'Lower carb', detail: 'Fewer pasta, rice, and bread meals' },
  { id: 'halal', name: 'Halal', detail: 'Halal meat only, no pork' },
] as const;

export type DietId = (typeof DIETS)[number]['id'];

// What the household is eating toward. A cut plans lighter, higher-protein meals; a bulk plans bigger ones.
export const GOALS = [
  { id: 'maintain', name: 'Just eat well', detail: 'Balanced meals, no calorie target' },
  { id: 'cut', name: 'Cutting', detail: 'Lighter meals with more protein' },
  { id: 'bulk', name: 'Bulking', detail: 'Bigger meals with more calories and protein' },
] as const;

export type GoalId = (typeof GOALS)[number]['id'];

// How much meat they like. Only asked of diets that allow meat.
export const MEAT_LEVELS = [
  { id: 'light', name: 'A little', detail: 'A couple of meat meals a week' },
  { id: 'some', name: 'Some', detail: 'Meat at most dinners' },
  { id: 'lots', name: 'A lot', detail: 'Meat in most lunches and dinners' },
] as const;

export type MeatLevelId = (typeof MEAT_LEVELS)[number]['id'];

export const dietAllowsMeat = (diet: DietId) => diet === 'any' || diet === 'lowcarb' || diet === 'halal';

export const ALLERGIES = ['Peanuts', 'Tree nuts', 'Shellfish', 'Fish', 'Dairy', 'Gluten', 'Eggs', 'Soy', 'Sesame'];
export const DISLIKES = ['Mushrooms', 'Olives', 'Eggplant', 'Spicy food', 'Tofu', 'Fish'];
// Foods and styles to choose from, in groups. The group titles are translated where they are shown.
export const LIKE_GROUPS = [
  { title: 'Proteins', items: ['Chicken', 'Beef', 'Pork', 'Turkey', 'Salmon', 'Shrimp', 'Eggs', 'Beans', 'Tofu'] },
  { title: 'Cuisines', items: ['Mexican', 'Italian', 'Indian', 'Asian', 'Mediterranean'] },
  { title: 'Dishes', items: ['Pasta', 'Tacos', 'Curry', 'Stir-fry', 'Soup', 'Pizza', 'Rice bowls', 'Salads', 'Avocado', 'Roasted veggies'] },
  { title: 'Style', items: ['Quick meals', 'One-pot'] },
] as const;

export const LIKES: string[] = LIKE_GROUPS.flatMap((g) => [...g.items]);

// Proteins a diet rules out, so they are not offered as something to like.
const OFF_DIET: Record<string, string[]> = {
  vegan: ['Chicken', 'Beef', 'Pork', 'Turkey', 'Salmon', 'Shrimp', 'Eggs'],
  vegetarian: ['Chicken', 'Beef', 'Pork', 'Turkey', 'Salmon', 'Shrimp'],
  pescatarian: ['Chicken', 'Beef', 'Pork', 'Turkey'],
  halal: ['Pork'],
};
export const likeFitsDiet = (food: string, diet: DietId) => !(OFF_DIET[diet] ?? []).includes(food);

export const PLANS = [
  { id: 'annual', name: 'Annual', price: 59.99, per: 'year', billed: 'Billed yearly, about $5.00 a month', badge: 'Save 37%', best: true },
  { id: 'monthly', name: 'Monthly', price: 7.99, per: 'month', billed: 'Billed every month', badge: '', best: false },
] as const;

export const money = (n: number) => '$' + n.toFixed(2);
