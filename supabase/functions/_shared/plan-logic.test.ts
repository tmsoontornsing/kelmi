// Run with: deno test supabase/functions/generate-plan/
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  cookFraction,
  defaultWeekStart,
  hasActiveSubscription,
  fitsGoal,
  hasEquipment,
  isLiked,
  isKnownDiet,
  isMeat,
  isMonday,
  checkLocks,
  repairWeek,
  allergenGroups,
  ALLERGEN_WORDS,
  matchesDiet,
  minCandidates,
  monthStartUtc,
  planTotal,
  BURST_LIMIT,
  DAILY_AI_CALL_CEILING,
  PLAN_DENIALS,
  reachedPlanCap,
  tooFast,
  selectCandidates,
  shuffle,
  slotConflicts,
  SUBSCRIBER_MONTHLY_PLAN_CAP,
  FREE_MONTHLY_PLAN_CAP,
  applyLocks,
  parseLocks,
  validateWeek,
  violatesAllergy,
  unresolvedAllergies,
  type PlanProfile,
  type RecipeRecord,
} from "./plan-logic.ts";
import { maxUses, type Plan } from "./provider.ts";

// Recipes default to dinner, because a recipe is only offered for a meal it is tagged for.
const recipe = (over: Partial<RecipeRecord> & { id: string }): RecipeRecord => ({
  title: over.id,
  minutes: 30,
  servings: 4,
  tags: ["dinner"],
  ingredientNames: [],
  baseCostUsd: 20,
  ...over,
});

const profile = (over: Partial<PlanProfile> = {}): PlanProfile => ({
  household_size: 4,
  weekly_budget_usd: 150,
  diet: "any",
  allergies: [],
  dislikes: [],
  likes: [],
  appliances: [],
  ...over,
});

const dinnerIds = (recipes: RecipeRecord[], p: PlanProfile = profile()) =>
  selectCandidates(recipes, p, { rng: () => 0 }).dinner.map((c) => c.id).sort();

Deno.test("allergy: an explicit contains- tag excludes the recipe", () => {
  assert(violatesAllergy(recipe({ id: "a", tags: ["contains-tree-nuts"] }), ["Tree nuts"]));
});

Deno.test("allergy: ingredient words catch untagged recipes", () => {
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Parmesan"] }), ["Dairy"]));
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Shrimp"] }), ["Shellfish"]));
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Eggs"] }), ["Eggs"]));
  assert(violatesAllergy(recipe({ id: "a", title: "Peanut noodles" }), ["Peanuts"]));
});

Deno.test("allergy: soy sauce counts as both soy and gluten", () => {
  const r = recipe({ id: "a", ingredientNames: ["Soy sauce"] });
  assert(violatesAllergy(r, ["Soy"]));
  assert(violatesAllergy(r, ["Gluten"]));
});

Deno.test("allergy: no false hits on eggplant, butternut, or corn tortillas", () => {
  assertEquals(violatesAllergy(recipe({ id: "a", ingredientNames: ["Eggplant"] }), ["Eggs"]), false);
  assertEquals(violatesAllergy(recipe({ id: "a", ingredientNames: ["Butternut squash"] }), ["Dairy"]), false);
  assertEquals(violatesAllergy(recipe({ id: "a", ingredientNames: ["Corn tortillas"] }), ["Gluten"]), false);
});

Deno.test("allergy: oats and English muffins count as gluten, because oats are usually cross-contaminated", () => {
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Rolled oats"] }), ["Gluten"]));
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["English muffins"] }), ["Gluten"]));
  assertEquals(violatesAllergy(recipe({ id: "a", ingredientNames: ["Goat cheese"] }), ["Gluten"]), false);
});

Deno.test("allergy: an allergen we have no list for is matched by its own name", () => {
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Sesame oil"] }), ["Sesame"]));
  assertEquals(violatesAllergy(recipe({ id: "a", ingredientNames: ["Olive oil"] }), ["Sesame"]), false);
});

Deno.test("diet: strict diets need an explicit tag, and 'any' or no diet does not", () => {
  assertEquals(matchesDiet([], "any"), true);
  assertEquals(matchesDiet([], null), true);
  assertEquals(matchesDiet([], "vegan"), false);
  assertEquals(matchesDiet(["vegan"], "vegetarian"), true);
  assertEquals(matchesDiet(["vegetarian"], "vegan"), false);
  assertEquals(matchesDiet(["pescatarian"], "pescatarian"), true);
  assertEquals(matchesDiet(["halal"], "halal"), true);
  assertEquals(matchesDiet(["vegetarian"], "halal"), true);
});

Deno.test("diet: an unknown diet id fails closed instead of passing everything", () => {
  assertEquals(matchesDiet(["vegan", "vegetarian", "halal"], "keto"), false);
  assertEquals(isKnownDiet("keto"), false);
  assertEquals(isKnownDiet("any"), true);
  assertEquals(isKnownDiet(null), true);
  assertEquals(isKnownDiet("vegan"), true);
  assertEquals(dinnerIds([recipe({ id: "a", tags: ["dinner", "vegan"] })], profile({ diet: "keto" })), []);
});

Deno.test("meals: a recipe is offered only for the meals it is tagged for", () => {
  const recipes = [
    recipe({ id: "oats", tags: ["breakfast"] }),
    recipe({ id: "salad", tags: ["lunch", "dinner"] }),
    recipe({ id: "stew", tags: ["dinner"] }),
    recipe({ id: "untagged", tags: [] }),
  ];
  const out = selectCandidates(recipes, profile(), { rng: () => 0 });
  assertEquals(out.breakfast.map((c) => c.id), ["oats"]);
  assertEquals(out.lunch.map((c) => c.id), ["salad"]);
  assertEquals(out.dinner.map((c) => c.id).sort(), ["salad", "stew"]);
});

Deno.test("meals: the fewest recipes a week needs follows each meal's repeat limit", () => {
  assertEquals(minCandidates("dinner"), 7);
  assertEquals(minCandidates("lunch"), 4);
  assertEquals(minCandidates("breakfast"), 3);
});

Deno.test("selectCandidates: filters allergies and diet, and scales cost to the household", () => {
  const recipes = [
    recipe({ id: "ok", baseCostUsd: 12, servings: 4, tags: ["dinner", "vegetarian"] }),
    recipe({ id: "dairy", tags: ["dinner", "vegetarian"], ingredientNames: ["Mozzarella"] }),
    recipe({ id: "meat", tags: ["dinner"] }),
  ];
  const out = selectCandidates(recipes, profile({ diet: "vegetarian", allergies: ["Dairy"], household_size: 6 }), { rng: () => 0 });
  assertEquals(out.dinner.map((c) => c.id), ["ok"]);
  assertEquals(out.dinner[0].estimatedCostUsd, 18); // 12 for 4 servings, scaled to 6 people
});

Deno.test("selectCandidates: dislikes apply only while enough recipes remain", () => {
  const mushroom = (id: string) => recipe({ id, ingredientNames: ["Mushrooms"] });
  const plain = (id: string) => recipe({ id });
  const small = [plain("p1"), plain("p2"), mushroom("m1")];
  assertEquals(dinnerIds(small, profile({ dislikes: ["Mushrooms"] })).length, 3);

  const big = [...Array.from({ length: 14 }, (_, i) => plain(`p${i}`)), mushroom("m1")];
  const out = dinnerIds(big, profile({ dislikes: ["Mushrooms"] }));
  assertEquals(out.length, 14);
  assertEquals(out.includes("m1"), false);
});

Deno.test("dislikes: olive oil is not olives", () => {
  const big = Array.from({ length: 14 }, (_, i) => recipe({ id: `p${i}`, ingredientNames: ["Olive oil"] }));
  assertEquals(dinnerIds(big, profile({ dislikes: ["Olives"] })).length, 14);
});

Deno.test("dislikes: the spicy tag counts as 'Spicy food'", () => {
  const spicy = recipe({ id: "s", tags: ["dinner", "spicy"] });
  const plain = Array.from({ length: 14 }, (_, i) => recipe({ id: `p${i}` }));
  assertEquals(dinnerIds([spicy, ...plain], profile({ dislikes: ["Spicy food"] })).includes("s"), false);
});

Deno.test("equipment: a recipe needs every appliance it is tagged with", () => {
  assertEquals(hasEquipment(["needs-oven", "needs-stovetop"], ["oven", "stovetop", "microwave"]), true);
  assertEquals(hasEquipment(["needs-oven", "needs-stovetop"], ["stovetop"]), false);
  assertEquals(hasEquipment(["needs-slow-cooker"], ["oven", "stovetop"]), false);
});

Deno.test("equipment: untagged recipes are always fine, and an empty list filters nothing", () => {
  assertEquals(hasEquipment([], ["microwave"]), true);
  assertEquals(hasEquipment(["needs-oven"], []), true);
});

Deno.test("selectCandidates: drops recipes that need equipment the household lacks", () => {
  const recipes = [
    recipe({ id: "roast", tags: ["dinner", "needs-oven"] }),
    recipe({ id: "pot", tags: ["dinner", "needs-stovetop"] }),
    recipe({ id: "chili", tags: ["dinner", "needs-stovetop", "needs-slow-cooker"] }),
  ];
  const ids = (appliances: string[]) => dinnerIds(recipes, profile({ appliances }));
  assertEquals(ids(["stovetop"]), ["pot"]);
  assertEquals(ids(["stovetop", "oven"]), ["pot", "roast"]);
  assertEquals(ids(["stovetop", "slow-cooker"]), ["chili", "pot"]);
  assertEquals(ids([]), ["chili", "pot", "roast"]);
});

Deno.test("selectCandidates: respects the limit per meal", () => {
  const many = Array.from({ length: 100 }, (_, i) => recipe({ id: `r${i}` }));
  assertEquals(selectCandidates(many, profile(), { limit: 60 }).dinner.length, 60);
});

Deno.test("shuffle is deterministic for a fixed rng and keeps every item", () => {
  const rng = () => 0;
  assertEquals(shuffle([1, 2, 3, 4], rng), shuffle([1, 2, 3, 4], rng));
  assertEquals([...shuffle([1, 2, 3, 4])].sort(), [1, 2, 3, 4]);
});

// A valid week: breakfasts used up to 3 times, lunches up to 2, dinners all different.
const goodWeek = (): Plan => ({
  items: Array.from({ length: 7 }, (_, d) => d + 1).flatMap((day) => [
    { recipe_id: `b${Math.ceil(day / 3)}`, day_of_week: day, meal_type: "breakfast" as const },
    { recipe_id: `l${Math.ceil(day / 2)}`, day_of_week: day, meal_type: "lunch" as const },
    { recipe_id: `d${day}`, day_of_week: day, meal_type: "dinner" as const },
  ]),
});

Deno.test("validateWeek accepts three meals a day within the repeat limits", () => {
  assertEquals(validateWeek(goodWeek()), null);
});

Deno.test("validateWeek rejects a week that is short or has a slot twice", () => {
  const short = goodWeek();
  short.items.pop();
  assert(validateWeek(short)?.includes("expected 21"));

  const doubled = goodWeek();
  doubled.items[1] = { ...doubled.items[1], day_of_week: 1, meal_type: "breakfast" };
  assert(validateWeek(doubled)?.includes("missing or used twice"));
});

Deno.test("validateWeek enforces the repeat limit for each meal", () => {
  const dinnerTwice = goodWeek();
  dinnerTwice.items[5] = { ...dinnerTwice.items[5], recipe_id: "d1" };
  assert(validateWeek(dinnerTwice)?.includes("dinner recipe is used 2 times"));

  const lunchThrice = goodWeek();
  lunchThrice.items[7] = { ...lunchThrice.items[7], recipe_id: "l1" }; // l1 is already the lunch on days 1 and 2
  assert(validateWeek(lunchThrice)?.includes("lunch recipe is used 3 times"));

  const breakfastFour = goodWeek();
  breakfastFour.items[18] = { ...breakfastFour.items[18], recipe_id: "b1" }; // day 7 breakfast
  assert(validateWeek(breakfastFour)?.includes("breakfast recipe is used 4 times"));
});

Deno.test("planTotal sums candidate costs across meals", () => {
  const cand = (id: string, estimatedCostUsd: number) => ({ id, title: id, minutes: 1, estimatedCostUsd });
  const candidates = { breakfast: [cand("b", 4)], lunch: [cand("l", 6.5)], dinner: [cand("d", 10.25)] };
  const plan: Plan = {
    items: [
      { recipe_id: "b", day_of_week: 1, meal_type: "breakfast" },
      { recipe_id: "l", day_of_week: 1, meal_type: "lunch" },
      { recipe_id: "d", day_of_week: 1, meal_type: "dinner" },
    ],
  };
  assertEquals(planTotal(plan, candidates), 20.75);
});

Deno.test("isMonday accepts real Mondays only", () => {
  assertEquals(isMonday("2026-10-26"), true);
  assertEquals(isMonday("2026-10-27"), false);
  assertEquals(isMonday("2026-02-30"), false);
  assertEquals(isMonday("10/26/2026"), false);
});

Deno.test("defaultWeekStart is the upcoming Monday, or today when it is Monday", () => {
  assertEquals(defaultWeekStart(new Date("2026-10-26T12:00:00Z")), "2026-10-26"); // Monday
  assertEquals(defaultWeekStart(new Date("2026-10-27T12:00:00Z")), "2026-11-02"); // Tuesday
  assertEquals(defaultWeekStart(new Date("2026-11-01T12:00:00Z")), "2026-11-02"); // Sunday
  assertEquals(isMonday(defaultWeekStart(new Date("2026-12-31T23:59:00Z"))), true);
});

Deno.test("monthStartUtc is the first of the month", () => {
  assertEquals(monthStartUtc(new Date("2026-10-26T12:00:00Z")), "2026-10-01T00:00:00.000Z");
});

Deno.test("hasActiveSubscription needs an active or trialing row that has not ended", () => {
  const now = new Date("2026-10-26T00:00:00Z");
  assertEquals(hasActiveSubscription([], now), false);
  assertEquals(hasActiveSubscription([{ status: "active", period_end: null }], now), true);
  assertEquals(hasActiveSubscription([{ status: "trialing", period_end: "2026-11-01T00:00:00Z" }], now), true);
  assertEquals(hasActiveSubscription([{ status: "active", period_end: "2026-10-01T00:00:00Z" }], now), false);
  assertEquals(hasActiveSubscription([{ status: "canceled", period_end: null }], now), false);
});

Deno.test("likes: liked recipes are offered first and flagged, even when the list is trimmed", () => {
  const recipes = [
    recipe({ id: "a" }),
    recipe({ id: "b" }),
    recipe({ id: "c", title: "Chickpea curry" }),
    recipe({ id: "d" }),
  ];
  const out = selectCandidates(recipes, profile({ likes: ["Curry"] }), { limit: 2, rng: () => 0 }).dinner;
  assertEquals(out.length, 2);
  assertEquals(out[0].id, "c");
  assertEquals(out[0].liked, true);
  assertEquals(out[1].liked, false);
});

Deno.test("likes: a food name also matches its usual dishes, and typed-in foods match their own words", () => {
  assert(isLiked(recipe({ id: "p", title: "Baked penne" }), ["Pasta"]));
  assert(isLiked(recipe({ id: "t", title: "Shrimp pad thai" }), ["Pad thai"]));
  assert(isLiked(recipe({ id: "f", title: "Veggie fried rice" }), ["Stir-fry"]));
  assertEquals(isLiked(recipe({ id: "o", title: "Olive oil cake" }), ["Olives"]), false);
});

Deno.test("likes: never override an allergy or a diet", () => {
  const recipes = [
    recipe({ id: "nuts", title: "Peanut noodles", tags: ["dinner", "vegan"] }),
    recipe({ id: "ok", title: "Plain rice", tags: ["dinner", "vegan"] }),
    recipe({ id: "meat", title: "Beef noodles", tags: ["dinner"] }),
  ];
  const out = selectCandidates(recipes, profile({ allergies: ["Peanuts"], diet: "vegan", likes: ["Noodles"] }), { rng: () => 0 }).dinner;
  assertEquals(out.map((c) => c.id), ["ok"]);
});

Deno.test("reachedPlanCap stops a subscriber at the monthly cap", () => {
  assertEquals(reachedPlanCap(0), false);
  assertEquals(reachedPlanCap(SUBSCRIBER_MONTHLY_PLAN_CAP - 1), false);
  assertEquals(reachedPlanCap(SUBSCRIBER_MONTHLY_PLAN_CAP), true);
  assertEquals(reachedPlanCap(SUBSCRIBER_MONTHLY_PLAN_CAP + 5), true);
  assertEquals(reachedPlanCap(3, 3), true);
});

Deno.test("tooFast stops a burst of plan requests", () => {
  assertEquals(tooFast(0), false);
  assertEquals(tooFast(BURST_LIMIT - 1), false);
  assertEquals(tooFast(BURST_LIMIT), true);
  assertEquals(tooFast(2, 2), true);
});

// ---- Goal and meat preferences

const lean = (id: string, over: Partial<RecipeRecord> = {}) =>
  recipe({ id, kcalPerServing: 400, proteinPerServing: 40, tags: ["dinner", "halal"], ...over });
const heavy = (id: string, over: Partial<RecipeRecord> = {}) =>
  recipe({ id, kcalPerServing: 900, proteinPerServing: 30, tags: ["dinner", "halal"], ...over });
const veg = (id: string) => recipe({ id, tags: ["dinner", "vegetarian", "pescatarian"] });
const noRng = () => 0.5;

Deno.test("meat: a recipe is meat unless tagged vegetarian, vegan or pescatarian", () => {
  assert(isMeat(recipe({ id: "a", tags: ["dinner", "halal"] })));
  assert(!isMeat(recipe({ id: "b", tags: ["dinner", "pescatarian"] })));
  assert(!isMeat(recipe({ id: "c", tags: ["dinner", "vegan"] })));
});

Deno.test("goal: a cut ranks lean, lighter recipes above heavy ones, and a bulk the reverse", () => {
  const pool = [lean("lean1"), lean("lean2"), heavy("big1"), heavy("big2")];
  assertEquals([...fitsGoal(pool, "cut")].sort(), ["lean1", "lean2"]);
  assertEquals([...fitsGoal(pool, "bulk")].sort(), ["big1", "big2"]);
  assertEquals(fitsGoal(pool, "maintain").size, 0);
  assertEquals(fitsGoal([recipe({ id: "no-data" })], "cut").size, 0);
});

Deno.test("selectCandidates: a cut offers lean recipes first and flags them", () => {
  const recipes = [heavy("big1"), heavy("big2"), lean("lean1"), lean("lean2")];
  const out = selectCandidates(recipes, profile({ goal: "cut" }), { rng: noRng }).dinner;
  assertEquals(out.slice(0, 2).map((c) => c.id).sort(), ["lean1", "lean2"]);
  assert(out[0].fitsGoal && out[0].kcal === 400 && out[0].proteinG === 40);
  assert(!out[3].fitsGoal);
});

Deno.test("selectCandidates: liked and fitting the goal comes before liked alone", () => {
  const recipes = [heavy("pasta-big", { title: "Big pasta" }), lean("pasta-lean", { title: "Lean pasta" }), lean("plain-lean"), heavy("plain-big")];
  const out = selectCandidates(recipes, profile({ goal: "cut", likes: ["Pasta"] }), { rng: noRng }).dinner.map((c) => c.id);
  assertEquals(out[0], "pasta-lean");
});

Deno.test("meat: a light eater is offered at most two meat dinners when there is enough else", () => {
  const recipes = [...Array.from({ length: 8 }, (_, i) => veg(`v${i}`)), ...Array.from({ length: 6 }, (_, i) => lean(`m${i}`))];
  const out = selectCandidates(recipes, profile({ meat_level: "light" }), { rng: noRng }).dinner;
  assertEquals(out.filter((c) => c.meat).length, 2);
});

Deno.test("meat: a light eater still gets a full week when there is too little non-meat", () => {
  const recipes = [veg("v1"), veg("v2"), ...Array.from({ length: 8 }, (_, i) => lean(`m${i}`))];
  const out = selectCandidates(recipes, profile({ meat_level: "light" }), { rng: noRng }).dinner;
  assertEquals(out.length, 10);
});

Deno.test("meat: a heavy eater sees meat recipes first, and the default changes nothing", () => {
  const recipes = [veg("v1"), veg("v2"), lean("m1"), lean("m2")];
  const lots = selectCandidates(recipes, profile({ meat_level: "lots" }), { rng: noRng }).dinner;
  assertEquals(lots.slice(0, 2).every((c) => c.meat), true);
  const some = selectCandidates(recipes, profile({ meat_level: "some" }), { rng: noRng }).dinner;
  assertEquals(some.length, 4);
});

Deno.test("likes: cuisines, proteins and quick meals match", () => {
  assert(isLiked(recipe({ id: "t", title: "Beef tacos" }), ["Mexican"]));
  assert(isLiked(recipe({ id: "t", title: "Spaghetti bolognese" }), ["Italian"]));
  assert(isLiked(recipe({ id: "t", title: "Pork tenderloin" }), ["Pork"]));
  assert(isLiked(recipe({ id: "t", title: "Banana pancakes", tags: ["breakfast", "contains-eggs"] }), ["Eggs"]));
  assert(isLiked(recipe({ id: "q", minutes: 15 }), ["Quick meals"]));
  assert(!isLiked(recipe({ id: "s", minutes: 45 }), ["Quick meals"]));
});

// ---- Household size

Deno.test("selectCandidates: cost scales in proportion to the number of people", () => {
  const recipes = [recipe({ id: "a", baseCostUsd: 12, servings: 4 })];
  const cost = (people: number) => selectCandidates(recipes, profile({ household_size: people }), { rng: () => 0 }).dinner[0].estimatedCostUsd;
  assertEquals([cost(1), cost(2), cost(4), cost(8)], [3, 6, 12, 24]);
});

Deno.test("maxUses: one or two people get leftovers, three or more cook fresh", () => {
  for (const people of [1, 2]) {
    assertEquals([maxUses("breakfast", people), maxUses("lunch", people), maxUses("dinner", people)], [3, 3, 2]);
  }
  for (const people of [3, 4, 12]) {
    assertEquals([maxUses("breakfast", people), maxUses("lunch", people), maxUses("dinner", people)], [3, 2, 1]);
  }
});

Deno.test("minCandidates: a small household needs fewer different recipes to fill a week", () => {
  assertEquals([minCandidates("dinner", 1), minCandidates("lunch", 1), minCandidates("breakfast", 1)], [4, 3, 3]);
  assertEquals([minCandidates("dinner", 4), minCandidates("lunch", 4), minCandidates("breakfast", 4)], [7, 4, 3]);
});

Deno.test("validateWeek: a dinner may repeat for two people but not for four", () => {
  const repeatsDinner = goodWeek();
  repeatsDinner.items[5] = { ...repeatsDinner.items[5], recipe_id: "d1" };
  assertEquals(validateWeek(repeatsDinner, 2), null);
  assert(validateWeek(repeatsDinner, 4)?.includes("dinner recipe is used 2 times"));
  // Even two people may not eat the same dinner three times.
  const thrice = goodWeek();
  thrice.items[5] = { ...thrice.items[5], recipe_id: "d1" };
  thrice.items[8] = { ...thrice.items[8], recipe_id: "d1" };
  assert(validateWeek(thrice, 2)?.includes("dinner recipe is used 3 times"));
});

Deno.test("violatesAllergy: fish and sesame are matched by word, with or without a tag", () => {
  const salmon = recipe({ id: "salmon", title: "Lemon salmon", ingredientNames: ["Salmon fillet", "Lemon"] });
  const hummus = recipe({ id: "pita", title: "Veggie pitas", ingredientNames: ["Hummus", "Pita bread"] });
  const oil = recipe({ id: "oil", title: "Fried rice", ingredientNames: ["Rice", "Sesame oil"] });
  const tagged = recipe({ id: "tag", title: "Plain bowl", ingredientNames: ["Rice"], tags: ["dinner", "contains-sesame"] });
  const plain = recipe({ id: "plain", title: "Rice and beans", ingredientNames: ["Rice", "Black beans (canned)"] });
  assert(violatesAllergy(salmon, ["Fish"]));
  assert(violatesAllergy(hummus, ["Sesame"]));
  assert(violatesAllergy(oil, ["Sesame"]));
  assert(violatesAllergy(tagged, ["Sesame"]));
  assert(!violatesAllergy(plain, ["Fish", "Sesame"]));
  // Shellfish is not fish, and fish does not hide inside it: each allergy keeps to its own words.
  const shrimp = recipe({ id: "shrimp", title: "Shrimp tacos", ingredientNames: ["Shrimp"] });
  assert(violatesAllergy(shrimp, ["Shellfish"]));
  assert(!violatesAllergy(shrimp, ["Fish"]));
});

// ---- Grocery list: conflicts and leftovers

Deno.test("slotConflicts: flags a planned meal that breaks an allergy or the diet, and leaves safe ones", () => {
  const recipes = [
    recipe({ id: "salmon", title: "Lemon salmon", ingredientNames: ["Salmon fillet"], tags: ["dinner", "pescatarian"] }),
    recipe({ id: "beans", title: "Rice and beans", ingredientNames: ["Rice", "Black beans (canned)"], tags: ["dinner", "vegan", "vegetarian", "pescatarian"] }),
    recipe({ id: "chicken", title: "Roast chicken", ingredientNames: ["Chicken thighs"], tags: ["dinner"] }),
  ];
  const items = [
    { recipe_id: "salmon", day_of_week: 1, meal_type: "dinner" as const },
    { recipe_id: "beans", day_of_week: 2, meal_type: "dinner" as const },
    { recipe_id: "chicken", day_of_week: 3, meal_type: "dinner" as const },
  ];
  const out = slotConflicts(recipes, items, { allergies: ["Fish"], diet: "vegetarian" });
  assertEquals(out.map((c) => [c.day_of_week, c.allergens, c.diet]), [[1, ["Fish"], true], [3, [], true]]);
  assertEquals(slotConflicts(recipes, items, { allergies: [], diet: "any" }), []);
  // A recipe that is no longer in the catalog is ignored rather than breaking the list.
  assertEquals(slotConflicts([], items, { allergies: ["Fish"], diet: null }), []);
});

Deno.test("cookFraction: leftovers cover part or all of a household's meal", () => {
  assertEquals(cookFraction(0, 4), 1);
  assertEquals(cookFraction(2, 4), 0.5);
  assertEquals(cookFraction(4, 4), 0);
  assertEquals(cookFraction(10, 4), 0);
  assertEquals(cookFraction(-3, 4), 1);
  assertEquals(cookFraction(2, 0), 1);
});

Deno.test("the free plan allows three plans a month and Plus allows more", () => {
  assertEquals(FREE_MONTHLY_PLAN_CAP, 3);
  assertEquals(reachedPlanCap(2, FREE_MONTHLY_PLAN_CAP), false);
  assertEquals(reachedPlanCap(3, FREE_MONTHLY_PLAN_CAP), true);
  assertEquals(SUBSCRIBER_MONTHLY_PLAN_CAP > FREE_MONTHLY_PLAN_CAP, true);
});

Deno.test("locks keep chosen meals, and bad lock input is dropped", () => {
  const locks = parseLocks([
    { day_of_week: 2, meal_type: "dinner", recipe_id: "keep" },
    { day_of_week: 2, meal_type: "dinner", recipe_id: "dup" },
    { day_of_week: 9, meal_type: "dinner", recipe_id: "bad-day" },
    { day_of_week: 1, meal_type: "snack", recipe_id: "bad-type" },
    "junk",
  ]);
  assertEquals(locks, [{ day_of_week: 2, meal_type: "dinner", recipe_id: "keep" }]);
  const items = [
    { recipe_id: "a", day_of_week: 1, meal_type: "dinner" },
    { recipe_id: "b", day_of_week: 2, meal_type: "dinner" },
  ];
  assertEquals(applyLocks(items, locks).map((i) => i.recipe_id), ["a", "keep"]);
  assertEquals(parseLocks(undefined), []);
});

// ---- Allergen words and aliases

Deno.test("allergy: the added dairy, gluten, egg, shellfish, fish, nut and peanut words are caught", () => {
  const hits: Record<string, string[]> = {
    Dairy: ["Buttermilk", "Paneer", "Custard", "Casein", "Ghee", "Whey", "Kefir", "Gelato", "Labneh", "Yoghurt"],
    Gluten: ["Pita", "Naan", "Crackers", "Rye bread", "Farro", "Bulgur", "Ramen", "Udon", "Seitan", "Semolina", "Couscous", "Plain tortillas", "Flour tortillas"],
    Eggs: ["Meringue", "Aioli", "Mayonnaise", "Custard", "Hollandaise"],
    Shellfish: ["Squid", "Calamari", "Octopus", "Crayfish"],
    Fish: ["Snapper", "Mackerel", "Haddock", "Anchovies", "Swordfish", "Fish sauce"],
    Peanuts: ["Groundnut oil", "Satay sauce"],
    "Tree nuts": ["Basil pesto", "Pine nuts", "Mixed nuts", "Chestnuts"],
  };
  for (const [allergy, foods] of Object.entries(hits)) {
    for (const food of foods) assert(violatesAllergy(recipe({ id: "a", ingredientNames: [food] }), [allergy]), `${allergy}: ${food}`);
  }
});

Deno.test("allergy: corn tortillas are not gluten, a plain or flour tortilla is", () => {
  assertEquals(violatesAllergy(recipe({ id: "a", ingredientNames: ["Corn tortillas"] }), ["Gluten"]), false);
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Tortillas"] }), ["Gluten"]));
  // Only the corn tortilla is cleared, not the rest of the recipe.
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Corn tortillas", "Soy sauce"] }), ["Gluten"]));
});

Deno.test("allergy: labels like Nuts, Wheat, Milk and Lactose use the right word lists and tags", () => {
  assertEquals(allergenGroups("Nuts"), ["tree-nuts", "peanuts"]);
  assertEquals(allergenGroups("Wheat"), ["gluten"]);
  assertEquals(allergenGroups("Tree nuts"), ["tree-nuts"]);
  assertEquals(allergenGroups("Mustard"), []);
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Walnuts"] }), ["Nuts"]));
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Peanut oil"] }), ["Nuts"]));
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Spaghetti"] }), ["Wheat"]));
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Cheddar"] }), ["Milk"]));
  assert(violatesAllergy(recipe({ id: "a", ingredientNames: ["Ghee"] }), ["Lactose"]));
  assert(violatesAllergy(recipe({ id: "a", tags: ["dinner", "contains-dairy"] }), ["Milk"]));
  assert(violatesAllergy(recipe({ id: "a", tags: ["dinner", "contains-tree-nuts"] }), ["Nuts"]));
  assertEquals(violatesAllergy(recipe({ id: "a", ingredientNames: ["Rice", "Nutmeg"] }), ["Nuts", "Wheat", "Milk", "Lactose"]), false);
});

Deno.test("allergy: every word list is non-empty and has no blank words", () => {
  for (const [group, words] of Object.entries(ALLERGEN_WORDS)) {
    assert(words.length > 0, group);
    for (const w of words) assertEquals(w, w.trim().toLowerCase(), `${group}: "${w}"`);
  }
});

// ---- Locks

Deno.test("checkLocks: refuses unknown, wrong-meal, unsafe and overused locks before any model is asked", () => {
  const recipes = [
    recipe({ id: "stew", tags: ["dinner"] }),
    recipe({ id: "oats", tags: ["breakfast"] }),
    recipe({ id: "nutty", tags: ["dinner"], ingredientNames: ["Walnuts"] }),
    recipe({ id: "bowl", tags: ["lunch"] }),
  ];
  const lock = (recipe_id: string, day_of_week: number, meal_type = "dinner") => ({ recipe_id, day_of_week, meal_type });
  const p = profile({ allergies: ["Tree nuts"] });
  assertEquals(checkLocks(recipes, [lock("stew", 1)], p), null);
  assertEquals(checkLocks(recipes, [lock("gone", 1)], p)?.code, "locked_recipe_unknown");
  assertEquals(checkLocks(recipes, [lock("oats", 1)], p)?.code, "locked_recipe_wrong_meal");
  assertEquals(checkLocks(recipes, [lock("nutty", 1)], p)?.code, "locked_recipe_unsafe");
  // Four people cook each dinner once, so the same dinner twice is more than the week allows.
  assertEquals(checkLocks(recipes, [lock("stew", 1), lock("stew", 2)], p)?.code, "locks_overused");
  assertEquals(checkLocks(recipes, [lock("stew", 1), lock("stew", 2)], profile({ household_size: 2 })), null);
  assertEquals(checkLocks(recipes, [lock("bowl", 1, "lunch"), lock("bowl", 2, "lunch")], p), null);
});

Deno.test("repairWeek: swaps surplus uses of a locked recipe in unlocked slots only", () => {
  const cand = (id: string, cost: number) => ({ id, title: id, minutes: 20, estimatedCostUsd: cost });
  const candidates = { breakfast: [], lunch: [], dinner: [cand("a", 5), cand("b", 6), cand("c", 7), cand("d", 8), cand("e", 9), cand("f", 10), cand("g", 11)] };
  const items = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => ({ recipe_id: id, day_of_week: i + 1, meal_type: "dinner" }));
  // The model's own pick for day 2 is "b"; the person kept "a" on day 2 too, so "a" now appears on days 1 and 2.
  const locks = [{ day_of_week: 2, meal_type: "dinner", recipe_id: "a" }];
  const fixed = repairWeek(applyLocks(items, locks), locks, candidates, 4);
  const uses = new Map<string, number>();
  for (const i of fixed) uses.set(i.recipe_id, (uses.get(i.recipe_id) ?? 0) + 1);
  assertEquals(Math.max(...uses.values()), 1);
  assertEquals(fixed[1].recipe_id, "a");
  assertEquals(fixed.length, 7);
  // No locks: untouched.
  assertEquals(repairWeek(items, [], candidates, 4), items);
});

// ---- Plan denials. (That the SQL caps match these constants is checked by supabase/scripts/plan-claims.test.ts.)

Deno.test("the daily ceiling is refused with a 503 busy, the other denials keep their codes", () => {
  assertEquals(PLAN_DENIALS.busy.status, 503);
  assertEquals(PLAN_DENIALS.busy.error, "busy");
  assertEquals(PLAN_DENIALS.rate_limited.status, 429);
  assertEquals(PLAN_DENIALS.plan_cap.status, 429);
  assertEquals(PLAN_DENIALS.plan_limit.status, 402);
  assertEquals(PLAN_DENIALS.plus_required.status, 402);
  assert(DAILY_AI_CALL_CEILING > 0);
});

// ---------- Allergy labels the server cannot match fail closed ----------

// The app's fixed allergy chips (apps/mobile/src/data/mock.ts ALLERGIES). Every one must resolve, or nobody could plan.
const APP_ALLERGY_CHIPS = ["Peanuts", "Tree nuts", "Shellfish", "Fish", "Dairy", "Gluten", "Eggs", "Soy", "Sesame"];

Deno.test("allergy labels: every app chip resolves to its own group", () => {
  for (const chip of APP_ALLERGY_CHIPS) assertEquals(allergenGroups(chip), [chip.toLowerCase().replace(" ", "-")], chip);
  assertEquals(unresolvedAllergies(APP_ALLERGY_CHIPS), []);
});

Deno.test("allergy labels: spelling, suffixes, accents, scripts and look-alike letters still map to peanuts", () => {
  const peanutLabels = [
    "peanuts", "Peanut", "PEANUTS", " peanuts ", "Peanut allergy", "Peanuts (severe)", "peanut-free", "Severe peanut allergy",
    "ground-nuts", "Groundnuts", "pea nut", "pea-nuts", "cacahuète", "cacahuetes", "Cacahuates", "Arachides", "Amendoim",
    "花生", "ถั่วลิสง", "मूँगफली", "рeanut" /* Cyrillic р */, "pe​anut" /* zero-width space */, "Ｐｅａｎｕｔ" /* full-width */,
  ];
  for (const label of peanutLabels) assertEquals(allergenGroups(label), ["peanuts"], label);
  assertEquals(unresolvedAllergies(peanutLabels), []);
});

Deno.test("allergy labels: the app's translated chip names resolve to the same groups", () => {
  const cases: [string, string][] = [
    ["Nueces de árbol", "tree-nuts"], ["Fruits à coque", "tree-nuts"], ["坚果", "tree-nuts"], ["ถั่วเปลือกแข็ง", "tree-nuts"],
    ["Mariscos", "shellfish"], ["Crustacés", "shellfish"], ["Frutos do mar", "shellfish"], ["贝类海鲜", "shellfish"],
    ["Pescado", "fish"], ["Poisson", "fish"], ["鱼", "fish"], ["ปลา", "fish"],
    ["Lácteos", "dairy"], ["Produits laitiers", "dairy"], ["乳制品", "dairy"], ["นมและผลิตภัณฑ์นม", "dairy"],
    ["Glúten", "gluten"], ["麸质", "gluten"], ["Huevos", "eggs"], ["Œufs", "eggs"], ["鸡蛋", "eggs"], ["ไข่ไก่", "eggs"],
    ["Soja", "soy"], ["大豆", "soy"], ["ถั่วเหลือง", "soy"], ["Sésamo", "sesame"], ["Gergelim", "sesame"], ["芝麻", "sesame"],
  ];
  for (const [label, group] of cases) assertEquals(allergenGroups(label), [group], label);
});

Deno.test("allergy labels: a label we cannot match is reported, never ignored", () => {
  assertEquals(unresolvedAllergies(["Peanuts", "Mustard", "peanut butter", "!!!", "", "  ", "​"]), ["Mustard", "peanut butter", "!!!"]);
  // Bracketed text is never dropped: a second allergen in brackets makes the label unresolved, not half-matched.
  assertEquals(unresolvedAllergies(["Tree nuts (and peanuts)", "Peanuts (sesame"]), ["Tree nuts (and peanuts)", "Peanuts (sesame"]);
  assertEquals(allergenGroups("Frutos secos"), ["peanuts", "tree-nuts"]);
  assertEquals(unresolvedAllergies("not a list"), []);
});

Deno.test("allergy labels: an unmatched label fails closed in the filter, slotConflicts and candidates", () => {
  const rice = recipe({ id: "rice", title: "Rice bowl", ingredientNames: ["Rice"] });
  const peanut = recipe({ id: "pb", title: "Peanut satay", ingredientNames: ["Peanut butter"] });
  // Unknown: every recipe counts as unsafe, so nothing is offered and every planned meal is flagged.
  for (const label of ["Mustard", "peanut butter", "!!!", "реанут"]) {
    assert(violatesAllergy(rice, [label]), label);
    assertEquals(selectCandidates([rice, peanut], profile({ allergies: [label] }), { rng: () => 0 }).dinner, [], label);
    const out = slotConflicts([rice], [{ recipe_id: "rice", day_of_week: 1, meal_type: "dinner" }], { allergies: [label], diet: "any" });
    assertEquals(out.length, 1, label);
    assertEquals(out[0].allergens, [label]);
  }
  // Known labels in any spelling filter peanut and leave rice alone.
  for (const label of ["ถั่วลิสง", "Peanut allergy", "рeanut", "ground-nuts"]) {
    assert(violatesAllergy(peanut, [label]), label);
    assertEquals(violatesAllergy(rice, [label]), false, label);
  }
  // Blank labels are ignored rather than blocking everything.
  assertEquals(violatesAllergy(rice, ["", "  "]), false);
});
