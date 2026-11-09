import { maxUses, MEAL_TYPES, type MealType, type Plan, type PlanInput } from "./provider.ts";

// Pure decision logic for plan generation: which recipes may be offered to the model, what they
// cost for this household, and whether the model's answer is a usable week. No I/O, so it is
// unit-tested without a database or a model.

export type RecipeRecord = {
  id: string;
  title: string;
  minutes: number;
  servings: number;
  tags: string[];
  ingredientNames: string[];
  // Sum of quantity x avg price over the recipe's lines, for `servings` servings.
  baseCostUsd: number;
  // Per serving, from the ingredients' nutrition data. Left out for a recipe with none, which is then not ranked for a goal.
  kcalPerServing?: number;
  proteinPerServing?: number;
};

export type PlanProfile = {
  household_size: number;
  weekly_budget_usd: number | null;
  diet: string | null;
  allergies: string[];
  dislikes: string[];
  // Foods the household likes, as free text. Recipes that match are offered first.
  likes: string[];
  // Equipment ids the household has, e.g. "oven". Empty means not specified, so nothing is filtered.
  appliances: string[];
  // "maintain" (the default), "cut" or "bulk".
  goal?: string | null;
  // "light", "some" (the default) or "lots". Only matters when the diet allows meat.
  meat_level?: string | null;
  // Free text from the user (e.g. "low sugar"). Prompt-only: never an allergy or diet rule.
  food_notes?: string | null;
  // When the person confirmed their age, and agreed to share their household details with an AI planner. Set by record_consent().
  age_confirmed_at?: string | null;
  ai_consent_at?: string | null;
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;

// Word list per allergen, matched against recipe titles and ingredient names. This is a safety net
// that errs toward excluding. The reliable signal is an explicit `contains-<allergen>` tag on the
// recipe, which is always honoured. Edit these lists as the catalog grows. The app keeps a copy
// (apps/mobile/src/lib/allergens.ts) and supabase/scripts/allergens.test.ts fails if they drift apart.
// A word matches whole words only, with an optional plural "s" ("egg" matches "eggs", not "eggplant").
export const ALLERGEN_WORDS: Record<string, string[]> = {
  "peanuts": ["peanut", "groundnut", "arachis", "satay"],
  // "pesto" is here on purpose: classic basil pesto is made with pine nuts (some with walnuts or cashews), and a jar
  // almost always lists a nut. A nut-free pesto is rare enough that excluding it is the safe call.
  "tree-nuts": ["nut", "almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut", "macadamia", "pine nut", "pignoli", "chestnut", "filbert", "pesto", "marzipan", "praline", "nutella", "frangipane", "amaretto", "nougat"],
  "shellfish": ["shellfish", "seafood", "shrimp", "prawn", "crab", "lobster", "clam", "mussel", "oyster", "scallop", "crawfish", "crayfish", "langoustine", "squid", "calamari", "octopus", "cuttlefish", "abalone", "escargot", "cockle", "krill"],
  "dairy": ["milk", "buttermilk", "cheese", "cheesecake", "butter", "buttercream", "butterscotch", "cream", "creamer", "yogurt", "yoghurt", "kefir", "mozzarella", "parmesan", "cheddar", "ricotta", "mascarpone", "feta", "paneer", "halloumi", "brie", "gouda", "gruyere", "provolone", "pecorino", "romano", "gorgonzola", "queso", "labneh", "quark", "skyr", "raita", "lassi", "custard", "casein", "caseinate", "whey", "ghee", "curd", "lactose", "half and half", "creme fraiche", "ice cream", "gelato", "alfredo", "bechamel", "milkshake"],
  "gluten": ["flour", "wheat", "pasta", "spaghetti", "penne", "linguine", "fettuccine", "macaroni", "orzo", "lasagna", "ravioli", "tortellini", "gnocchi", "noodle", "ramen", "udon", "bread", "breadcrumb", "breading", "panko", "crouton", "stuffing", "dough", "crust", "flour tortilla", "tortilla", "pita", "naan", "cracker", "pretzel", "bagel", "baguette", "brioche", "croissant", "waffle", "pancake", "biscuit", "cornbread", "couscous", "semolina", "bulgur", "farro", "freekeh", "spelt", "kamut", "einkorn", "rye", "barley", "malt", "seitan", "bun", "soy sauce", "teriyaki", "hoisin", "oat", "granola", "muffin", "tempura"],
  "eggs": ["egg", "eggnog", "mayonnaise", "mayo", "aioli", "meringue", "custard", "hollandaise", "albumin", "omelet", "omelette", "frittata", "quiche", "souffle", "carbonara", "pavlova"],
  "soy": ["soy", "soya", "soybean", "soymilk", "tofu", "edamame", "miso", "tempeh", "natto", "tamari", "shoyu", "teriyaki", "hoisin"],
  "fish": ["fish", "seafood", "salmon", "tuna", "cod", "tilapia", "halibut", "trout", "snapper", "mackerel", "haddock", "anchovy", "anchovies", "sardine", "herring", "pollock", "catfish", "swordfish", "bass", "mahi", "flounder", "grouper", "monkfish", "bream", "mullet", "perch", "pike", "carp", "eel", "whitefish", "barramundi", "branzino", "bonito", "dashi", "surimi", "caviar", "roe", "sashimi", "sushi", "caesar", "worcestershire"],
  "sesame": ["sesame", "tahini", "hummus", "halva", "halvah", "gomasio", "zaatar", "za'atar", "benne"],
};

// Labels people use that are not one of the keys above, mapped to the groups they mean. "Nuts" means tree nuts and
// peanuts, because someone who writes "nuts" would not want either in the plan. Looked up by the label's slug.
export const ALLERGEN_ALIASES: Record<string, string[]> = {
  "nuts": ["tree-nuts", "peanuts"],
  "nut": ["tree-nuts", "peanuts"],
  "tree-nut": ["tree-nuts"],
  "treenuts": ["tree-nuts"],
  "peanut": ["peanuts"],
  "wheat": ["gluten"],
  "celiac": ["gluten"],
  "coeliac": ["gluten"],
  "milk": ["dairy"],
  "lactose": ["dairy"],
  "egg": ["eggs"],
  "soya": ["soy"],
  "soybeans": ["soy"],
  "crustaceans": ["shellfish"],
  "molluscs": ["shellfish"],
  "mollusks": ["shellfish"],
  "seafood": ["fish", "shellfish"],
};

// A phrase that contains an allergen word but is not the allergen: removed from the text before it is checked.
// Keep this short; anything not listed here is excluded.
export const ALLERGEN_SAFE_PHRASES: Record<string, string[]> = {
  "gluten": ["corn tortilla"],
};

// Dislikes are softer than allergies, so these only need to catch the obvious cases.
const DISLIKE_WORDS: Record<string, string[]> = {
  "mushrooms": ["mushroom"],
  // Plural only, so "olive oil" does not count as olives.
  "olives": ["olives", "kalamata"],
  "eggplant": ["eggplant", "aubergine"],
  "spicy-food": ["jalapeno", "cayenne", "sriracha", "chipotle", "habanero", "red pepper flakes"],
  "tofu": ["tofu"],
  "fish": ["fish", "salmon", "cod", "tuna", "tilapia", "trout", "halibut", "sardine", "anchovy", "anchovies"],
};

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRegex = (words: string[], flags = "i") => new RegExp(`\\b(?:${words.map(escape).join("|")})s?\\b`, flags);

// Compiled once per allergen (and once per typed-in label), because every recipe in the catalog is checked on every request.
// The size is capped so labels typed by people cannot grow it without end.
const regexCache = new Map<string, RegExp>();
function cachedRegex(cacheKey: string, words: string[], flags = "i"): RegExp {
  const k = `${flags}:${cacheKey}`;
  let re = regexCache.get(k);
  if (!re) {
    if (regexCache.size >= 500) regexCache.clear();
    re = wordRegex(words, flags);
    regexCache.set(k, re);
  }
  return re;
}

// The text without the phrases that look like an allergen but are not one (see ALLERGEN_SAFE_PHRASES).
const withoutSafePhrases = (text: string, group: string): string => {
  const phrases = ALLERGEN_SAFE_PHRASES[group];
  return phrases ? text.replace(cachedRegex(`safe:${group}`, phrases, "gi"), " ") : text;
};

const haystack = (r: RecipeRecord) => [r.title, ...r.ingredientNames].join(" | ");

// The word-list groups an allergy label stands for: its own, the groups an alias names, or none for a label we have
// no list for (which is then matched on its own name).
export function allergenGroups(label: string): string[] {
  const s = slug(label);
  if (ALLERGEN_WORDS[s]) return [s];
  return (ALLERGEN_ALIASES[s] ?? []).filter((g) => ALLERGEN_WORDS[g]);
}

// True when `text` (a title or an ingredient name) points to the allergy `label`.
export function textHasAllergen(text: string, label: string): boolean {
  const groups = allergenGroups(label);
  if (groups.length === 0) return cachedRegex(`own:${label.trim().toLowerCase()}`, [label.trim()]).test(text);
  return groups.some((g) => cachedRegex(`group:${g}`, ALLERGEN_WORDS[g]).test(withoutSafePhrases(text, g)));
}

// The household's allergy labels (for example "Tree nuts") that this recipe breaks, in the household's order.
export function allergensIn(r: RecipeRecord, allergies: string[]): string[] {
  return allergies.filter((label) => {
    const s = slug(label);
    if (!s) return false;
    if (r.tags.includes(`contains-${s}`) || allergenGroups(label).some((g) => r.tags.includes(`contains-${g}`))) return true;
    // An allergy we have no word list for is matched on its own name, so it still filters.
    return textHasAllergen(haystack(r), label);
  });
}

export const violatesAllergy = (r: RecipeRecord, allergies: string[]): boolean => allergensIn(r, allergies).length > 0;

// A planned meal that breaks the household's allergies or diet, for a plan made before they changed either.
export type SlotConflict = { day_of_week: number; meal_type: MealType; recipe_id: string; allergens: string[]; diet: boolean };

export function slotConflicts(
  recipes: RecipeRecord[],
  items: { recipe_id: string; day_of_week: number; meal_type: MealType }[],
  profile: Pick<PlanProfile, "allergies" | "diet">,
): SlotConflict[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return items.flatMap((i) => {
    const r = byId.get(i.recipe_id);
    if (!r) return [];
    const allergens = allergensIn(r, profile.allergies);
    const diet = !matchesDiet(r.tags, profile.diet);
    return allergens.length > 0 || diet ? [{ day_of_week: i.day_of_week, meal_type: i.meal_type, recipe_id: i.recipe_id, allergens, diet }] : [];
  });
}

// Share of a meal still to buy for when leftovers cover part of the household (all of it when none do).
export const cookFraction = (leftoverServings: number, people: number): number =>
  people <= 0 ? 1 : Math.max(0, 1 - Math.min(Math.max(leftoverServings, 0), people) / people);

// Recipe tags that mark a disliked thing when the tag name differs from the dislike's name.
const DISLIKE_TAGS: Record<string, string[]> = { "spicy-food": ["spicy"] };

function dislikes(r: RecipeRecord, label: string): boolean {
  const s = slug(label);
  if (!s) return false;
  if ([s, `contains-${s}`, ...(DISLIKE_TAGS[s] ?? [])].some((t) => r.tags.includes(t))) return true;
  return wordRegex(DISLIKE_WORDS[s] ?? [label.trim()]).test(haystack(r));
}

// Words that show a recipe is the kind of thing a liked food names, when the name alone would miss it.
// Anything not listed is matched on its own words, so a typed-in "pad thai" still works.
const LIKE_WORDS: Record<string, string[]> = {
  "pasta": ["pasta", "spaghetti", "penne", "linguine", "fettuccine", "macaroni", "orzo", "lasagna", "ravioli"],
  "tacos": ["taco", "fajita"],
  "curry": ["curry", "masala", "korma"],
  "stir-fry": ["stir-fry", "stir fry", "fried rice", "lo mein"],
  "soup": ["soup", "stew", "chili", "chowder"],
  "salads": ["salad"],
  "rice-bowls": ["rice bowl", "grain bowl", "burrito bowl", "poke"],
  "roasted-veggies": ["roasted vegetable", "roasted veg", "roasted veggie", "sheet-pan vegetable"],
  // Cuisines and proteins.
  "mexican": ["taco", "fajita", "burrito", "quesadilla", "enchilada", "salsa", "chili"],
  "italian": ["pasta", "spaghetti", "pizza", "bolognese", "margherita", "caprese", "frittata", "primavera", "aglio"],
  "indian": ["curry", "masala", "korma", "chickpea", "lentil", "dal"],
  "asian": ["stir-fry", "stir fry", "fried rice", "teriyaki", "soy sauce", "sesame", "lo mein", "ginger"],
  "mediterranean": ["greek", "hummus", "pita", "feta", "shakshuka", "tzatziki", "falafel", "quinoa", "olive oil"],
  "beef": ["beef", "steak"],
  "pork": ["pork", "bacon", "sausage", "ham"],
  "turkey": ["turkey"],
  "shrimp": ["shrimp", "prawn"],
  "beans": ["bean", "chickpea", "lentil"],
  "one-pot": ["one-pot", "sheet-pan", "skillet", "slow-cooker", "slow cooker"],
};

export function likesRecipe(r: RecipeRecord, label: string): boolean {
  const s = slug(label);
  if (!s) return false;
  if ([s, `contains-${s}`].some((t) => r.tags.includes(t))) return true;
  // "Quick meals" is about time, not a word in the recipe.
  if (s === "quick-meals") return r.minutes <= 20;
  return wordRegex(LIKE_WORDS[s] ?? [label.trim()]).test(haystack(r));
}

export const isLiked = (r: RecipeRecord, likes: string[]) => likes.some((l) => likesRecipe(r, l));

// Which recipe tags satisfy each diet. Strict diets need an explicit tag, so an untagged recipe
// is never offered to a vegan. No diet, or "any", applies no filter. A diet id the server does not know fails closed:
// nothing matches, so a typo or a newer app never silently plans meals the person ruled out.
const DIET_TAGS: Record<string, string[]> = {
  vegan: ["vegan"],
  vegetarian: ["vegetarian", "vegan"],
  pescatarian: ["pescatarian", "vegetarian", "vegan"],
  lowcarb: ["lowcarb"],
  halal: ["halal", "vegetarian", "vegan"],
};

// Every diet id the server accepts. profiles.diet has a CHECK with the same list (20261112000000_input_limits.sql).
export const KNOWN_DIETS: readonly string[] = ["any", ...Object.keys(DIET_TAGS)];
export const isKnownDiet = (diet: string | null | undefined): boolean => !diet || KNOWN_DIETS.includes(diet);

export function matchesDiet(tags: string[], diet: string | null): boolean {
  if (!diet || diet === "any") return true;
  const accepted = DIET_TAGS[diet];
  return !!accepted && accepted.some((t) => tags.includes(t));
}

// A recipe tagged `needs-<appliance>` is only offered to households that have that appliance.
export function hasEquipment(tags: string[], appliances: string[]): boolean {
  if (appliances.length === 0) return true;
  return tags.filter((t) => t.startsWith("needs-")).every((t) => appliances.includes(t.slice("needs-".length)));
}

// A recipe has meat or poultry unless it is tagged vegetarian, vegan or pescatarian (fish counts as not meat).
export const isMeat = (r: RecipeRecord): boolean => !["vegetarian", "vegan", "pescatarian"].some((t) => r.tags.includes(t));

// How well a recipe suits a goal, from its calories and protein per serving. A cut favors protein for the calories and
// fewer calories; a bulk favors calories and protein. Only used to rank recipes against each other.
export function goalScore(r: RecipeRecord, goal: string | null | undefined): number | null {
  if (r.kcalPerServing === undefined || r.proteinPerServing === undefined || r.kcalPerServing <= 0) return null;
  if (goal === "cut") return (r.proteinPerServing * 4 * 100) / r.kcalPerServing - r.kcalPerServing / 40;
  if (goal === "bulk") return r.kcalPerServing / 10 + r.proteinPerServing * 2;
  return null;
}

// The better-fitting half of a meal's recipes for a goal. Empty for "maintain" and for recipes without nutrition data.
export function fitsGoal(pool: RecipeRecord[], goal: string | null | undefined): Set<string> {
  const scored = pool.map((r) => ({ id: r.id, score: goalScore(r, goal) })).filter((x): x is { id: string; score: number } => x.score !== null);
  scored.sort((a, b) => b.score - a.score);
  return new Set(scored.slice(0, Math.ceil(scored.length / 2)).map((x) => x.id));
}

// Most meat recipes a week may offer for each meal when someone likes little meat.
const LIGHT_MEAT_CAP: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };

// Shapes a ranked list by how much meat the household likes. A light eater is offered few meat recipes, unless that would
// leave too few recipes for a week. A heavy eater sees meat recipes first. Everyone else is unchanged.
export function shapeMeat<T extends { id: string; meat: boolean }>(ranked: T[], level: string | null | undefined, type: MealType, people = 4): T[] {
  if (level === "lots") return [...ranked.filter((c) => c.meat), ...ranked.filter((c) => !c.meat)];
  if (level === "light") {
    if (ranked.filter((c) => !c.meat).length < minCandidates(type, people)) return ranked;
    let meatLeft = LIGHT_MEAT_CAP[type];
    return ranked.filter((c) => !c.meat || meatLeft-- > 0);
  }
  return ranked;
}

export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The fewest recipes a meal type needs to fill a week without breaking its repeat limit.
export const minCandidates = (type: MealType, people = 4) => Math.ceil(7 / maxUses(type, people));

// Recipes the model may choose from, for each meal. A recipe is offered for a meal when it carries that
// meal's tag (`breakfast`, `lunch`, `dinner`), so one recipe can serve more than one meal. Allergies,
// diet and equipment are hard filters. Dislikes are applied only while enough variety remains, so a
// small catalog never starves the plan. Recipes that match a liked food come first, so they make the cut when
// the list is trimmed and the model sees them flagged.

export function selectCandidates(
  recipes: RecipeRecord[],
  profile: PlanProfile,
  opts: { limit?: number; rng?: () => number } = {},
): PlanInput["candidates"] {
  const { limit = 40, rng = Math.random } = opts;
  const safe = recipes.filter(
    (r) =>
      !violatesAllergy(r, profile.allergies) &&
      matchesDiet(r.tags, profile.diet) &&
      hasEquipment(r.tags, profile.appliances),
  );
  const forMeal = (type: MealType) => {
    const ofType = safe.filter((r) => r.tags.includes(type));
    const liked = ofType.filter((r) => !profile.dislikes.some((d) => dislikes(r, d)));
    // Keep two weeks' worth of variety before letting dislikes thin the list.
    const pool = liked.length >= minCandidates(type, profile.household_size) * 2 ? liked : ofType;
    const fits = fitsGoal(pool, profile.goal);
    const marked = shuffle(pool, rng).map((r) => ({ r, liked: isLiked(r, profile.likes), fits: fits.has(r.id), meat: isMeat(r) }));
    // Liked and fitting the goal first, then either, then the rest. Stable, so the shuffle still decides the order within each.
    const rank = (m: { liked: boolean; fits: boolean }) => Number(m.liked) * 2 + Number(m.fits);
    const ranked = [...marked].sort((a, b) => rank(b) - rank(a));
    const shaped = shapeMeat(ranked.map((m) => ({ ...m, id: m.r.id })), profile.meat_level, type, profile.household_size);
    return shaped.slice(0, limit).map(({ r, liked, fits: fitsIt, meat }) => ({
      id: r.id,
      title: r.title,
      minutes: r.minutes,
      // Scale the recipe from its own servings to this household.
      estimatedCostUsd: round2((r.baseCostUsd * profile.household_size) / r.servings),
      liked,
      ...(r.kcalPerServing !== undefined ? { kcal: Math.round(r.kcalPerServing), proteinG: Math.round(r.proteinPerServing ?? 0) } : {}),
      meat,
      fitsGoal: fitsIt,
    }));
  };
  return { breakfast: forMeal("breakfast"), lunch: forMeal("lunch"), dinner: forMeal("dinner") };
}

// A week is breakfast, lunch and dinner on each of seven days, with no recipe used more often than its
// meal allows. The provider schema only checks shape.
export function validateWeek(plan: Plan, people = 4): string | null {
  if (plan.items.length !== 21) return `expected 21 meals, got ${plan.items.length}`;
  const slots = new Set(plan.items.map((i) => `${i.day_of_week}|${i.meal_type}`));
  if (slots.size !== 21) return "a day and meal is missing or used twice";
  for (const type of MEAL_TYPES) {
    const uses = new Map<string, number>();
    for (const i of plan.items) if (i.meal_type === type) uses.set(i.recipe_id, (uses.get(i.recipe_id) ?? 0) + 1);
    const most = Math.max(...uses.values());
    if (most > maxUses(type, people)) return `a ${type} recipe is used ${most} times, more than ${maxUses(type, people)}`;
  }
  return null;
}

export function planTotal(plan: Plan, candidates: PlanInput["candidates"]): number {
  const cost = new Map(MEAL_TYPES.flatMap((t) => candidates[t]).map((c) => [c.id, c.estimatedCostUsd]));
  return round2(plan.items.reduce((sum, i) => sum + (cost.get(i.recipe_id) ?? 0), 0));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isMonday(date: string): boolean {
  if (!DATE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(date) && d.getUTCDay() === 1;
}

// The upcoming Monday (today if it is Monday), in UTC. Clients know the user's timezone, so the
// app should send week_start explicitly. This is only the fallback.
export function defaultWeekStart(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

export function monthStartUtc(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// The free plan: three plans a month, enough to plan most weeks. Counted in plan_generations like the paid cap, because
// regenerating a week replaces its meal_plans row and every request costs an AI call.
export const FREE_MONTHLY_PLAN_CAP = 3;

// Plus plans every week, which is four or five plans a month. The cap leaves room to regenerate a week many times
// and stops one account from running up AI cost. A request counts when it is made, whether or not the model succeeds.
export const SUBSCRIBER_MONTHLY_PLAN_CAP = 40;

// No more than this many plan requests in a row within the window, for anyone. It stops a loop or a script from
// running up the AI bill long before the monthly cap would.
export const BURST_LIMIT = 5;
export const BURST_WINDOW_MS = 10 * 60 * 1000;
export const tooFast = (count: number, limit: number = BURST_LIMIT): boolean => count >= limit;

// A global ceiling on AI calls a day across all accounts (claim_plan_generation counts today's rows that are not the
// built-in planner). Past it the request is refused with a 503 rather than risk the bill.
export const DAILY_AI_CALL_CEILING = 2000;

// Why claim_plan_generation can refuse a request, and what the function answers.
export const PLAN_DENIALS: Record<string, { status: number; error: string; message: string }> = {
  rate_limited: { status: 429, error: "rate_limited", message: "You’re going a little fast. Try again in a few minutes." },
  plan_cap: { status: 429, error: "plan_cap", message: "You’ve reached this month’s plan limit. It resets on the 1st." },
  plan_limit: { status: 402, error: "plan_limit", message: `The free plan includes ${FREE_MONTHLY_PLAN_CAP} plans a month.` },
  plus_required: { status: 402, error: "plus_required", message: "Keeping meals while you plan again is part of Kelmi Plus." },
  busy: { status: 503, error: "busy", message: "Kelmi is very busy right now. Please try again a little later." },
};

export const reachedPlanCap = (count: number, cap: number = SUBSCRIBER_MONTHLY_PLAN_CAP): boolean => count >= cap;

export function hasActiveSubscription(rows: { status: string; period_end: string | null }[], now: Date = new Date()): boolean {
  return rows.some((r) => ["active", "trialing"].includes(r.status) && (!r.period_end || new Date(r.period_end) > now));
}

// Meals a Plus user locked before asking for the rest of the week again. The lock is applied after the planner answers,
// so the week is still checked as a whole (allergies, diet, repeats) and a lock can never slip past those checks.
export type MealLock = { day_of_week: number; meal_type: string; recipe_id: string };

export function parseLocks(raw: unknown): MealLock[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MealLock[] = [];
  for (const l of raw.slice(0, 21)) {
    const day = Number(l?.day_of_week);
    const type = String(l?.meal_type);
    const id = String(l?.recipe_id ?? "");
    const key = `${day}-${type}`;
    if (!Number.isInteger(day) || day < 1 || day > 7 || !["breakfast", "lunch", "dinner"].includes(type) || !id || id.length > 64 || seen.has(key)) continue;
    seen.add(key);
    out.push({ day_of_week: day, meal_type: type, recipe_id: id });
  }
  return out;
}

export function applyLocks<T extends { recipe_id: string; day_of_week: number; meal_type: string }>(items: T[], locks: MealLock[]): T[] {
  if (locks.length === 0) return items;
  const byKey = new Map(locks.map((l) => [`${l.day_of_week}-${l.meal_type}`, l.recipe_id]));
  return items.map((i) => {
    const id = byKey.get(`${i.day_of_week}-${i.meal_type}`);
    return id ? { ...i, recipe_id: id } : i;
  });
}

// Why a set of locks cannot be used, found before any model is asked. Every lock must name a real recipe that is tagged
// for its meal and safe for this household, and no recipe may be locked more often than its meal allows in a week.
export type LockProblem = { code: "locked_recipe_unknown" | "locked_recipe_wrong_meal" | "locked_recipe_unsafe" | "locks_overused"; message: string };

export function checkLocks(recipes: RecipeRecord[], locks: MealLock[], profile: PlanProfile): LockProblem | null {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const uses = new Map<string, number>();
  for (const l of locks) {
    const r = byId.get(l.recipe_id);
    if (!r) return { code: "locked_recipe_unknown", message: "A meal you kept is no longer available. Plan the week again without it." };
    if (!r.tags.includes(l.meal_type)) return { code: "locked_recipe_wrong_meal", message: `A kept meal is not a ${l.meal_type} recipe.` };
    if (violatesAllergy(r, profile.allergies) || !matchesDiet(r.tags, profile.diet) || !hasEquipment(r.tags, profile.appliances)) {
      return { code: "locked_recipe_unsafe", message: `${r.title} no longer fits your allergies, diet or kitchen, so it cannot be kept.` };
    }
    const k = `${l.meal_type}|${l.recipe_id}`;
    const n = (uses.get(k) ?? 0) + 1;
    uses.set(k, n);
    if (n > maxUses(l.meal_type as MealType, profile.household_size)) {
      return { code: "locks_overused", message: `${r.title} is kept more often than it can be used in a week.` };
    }
  }
  return null;
}

// After the locks are applied the chosen meals can use one recipe more often than its meal allows (the planner did not
// know about the locks). Swap the surplus, in unlocked slots only, for candidates with uses to spare, cheapest first.
export function repairWeek<T extends { recipe_id: string; day_of_week: number; meal_type: string }>(
  items: T[],
  locks: MealLock[],
  candidates: PlanInput["candidates"],
  people: number,
): T[] {
  if (locks.length === 0) return items;
  const locked = new Set(locks.map((l) => `${l.day_of_week}-${l.meal_type}`));
  const out = items.map((i) => ({ ...i }));
  for (const type of MEAL_TYPES) {
    const limit = maxUses(type, people);
    const uses = new Map<string, number>();
    for (const i of out) if (i.meal_type === type) uses.set(i.recipe_id, (uses.get(i.recipe_id) ?? 0) + 1);
    const spare = [...candidates[type]].sort((a, b) => a.estimatedCostUsd - b.estimatedCostUsd);
    for (const i of out) {
      if (i.meal_type !== type || locked.has(`${i.day_of_week}-${i.meal_type}`) || (uses.get(i.recipe_id) ?? 0) <= limit) continue;
      const swap = spare.find((c) => (uses.get(c.id) ?? 0) < limit);
      if (!swap) continue;
      uses.set(i.recipe_id, (uses.get(i.recipe_id) ?? 0) - 1);
      uses.set(swap.id, (uses.get(swap.id) ?? 0) + 1);
      i.recipe_id = swap.id;
    }
  }
  return out;
}
