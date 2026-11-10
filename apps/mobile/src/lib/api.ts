import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import {
  DAYS,
  MEAL_TYPES,
  type ApplianceId,
  type DietId,
  type GoalId,
  type MeatLevelId,
  type GroceryAisle,
  type Leftover,
  type Meal,
  type MealType,
  type PlannedMeal,
  type RecipeDetail,
  type RecipeView,
  type Shelf,
  type SlotStatus,
} from '../data/mock';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { currentLanguage, LANGUAGES, t } from '../i18n';
import { friendlyAmount } from './amounts';
import { signInNative, signOutNative } from './nativeSignIn';
import { FREE_PLANS_PER_MONTH } from './limits';
import { findSwapConflict, type SwapConflict } from './swapSafety';
import { perServing, type IngredientNutrition } from './nutrition';
import { supabase } from './supabase';

// Every read and write the app makes to Supabase. All of it runs as the signed-in user, so row-level
// security limits it to their own household. AppState decides when to call these.

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

// A database error that keeps Postgres's error code (and hint), so the app can explain a known one in plain words.
export class DbError extends Error {
  code?: string;
  hint?: string;
  constructor(message: string, code?: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

type DbFailure = { message: string; code?: string; hint?: string };
const check = <T>(result: { data: T; error: DbFailure | null }): T => {
  if (result.error) throw new DbError(result.error.message, result.error.code, result.error.hint);
  return result.data;
};

export type Profile = {
  people: number;
  budget: number;
  diet: DietId;
  allergies: string[];
  dislikes: string[];
  likes: string[];
  appliances: ApplianceId[];
  goal: GoalId;
  meatLevel: MeatLevelId;
  // Free-text preferences like "low sugar". Only ever a soft nudge for the planner; never used as an allergy or diet rule.
  foodNotes: string;
};

// ---- Sign-in: Apple, Google, or email and password.

export type OAuthProvider = 'apple' | 'google';

// Native first (Apple's sheet, Google's account picker), then the browser flow when this build can't do it natively,
// such as Expo Go or a missing client ID. Returns false when the person closes the sheet.
export async function signInWithProvider(provider: OAuthProvider): Promise<boolean> {
  const native = await signInNative(provider);
  if (native !== 'unavailable') return native === 'done';
  return signInWithBrowser(provider);
}

// The provider's own page in a system browser sheet, which returns to kelmi://auth-callback with a one-time code.
async function signInWithBrowser(provider: OAuthProvider): Promise<boolean> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await db().auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error(error?.message ?? t('Could not start sign-in.'));

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;

  const params = new URL(result.url).searchParams;
  const failure = params.get('error_description') ?? params.get('error');
  if (failure) throw new Error(failure);
  const code = params.get('code');
  if (!code) throw new Error(t('Sign-in did not finish. Try again.'));
  const { error: exchangeError } = await db().auth.exchangeCodeForSession(code);
  if (exchangeError) throw new Error(exchangeError.message);
  return true;
}

// 'confirm' means the project wants the address verified first, so there is no session until they tap the emailed link.
export type EmailSignUpResult = 'signed-in' | 'confirm';

const friendlyAuthError = (message: string) => {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return t('That email and password do not match.');
  if (m.includes('already registered')) return t('There is already an account with that email. Try signing in.');
  if (m.includes('rate limit')) return t('Too many tries. Wait a minute and try again.');
  if (m.includes('email not confirmed')) return t('Confirm your email first. Check your inbox for the link.');
  return message;
};

export async function signUpWithEmail(email: string, password: string): Promise<EmailSignUpResult> {
  const { data, error } = await db().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: Linking.createURL('auth-callback') },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  return data.session ? 'signed-in' : 'confirm';
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function signOut() {
  await db().auth.signOut();
  await signOutNative();
}

// ---- Profile

// `saved` is false for a profile the sign-up trigger created but the app has not filled in yet.
export async function loadProfile(userId: string): Promise<(Profile & { saved: boolean }) | null> {
  const row = check(
    await db()
      .from('profiles')
      .select('household_size, weekly_budget_usd, diet, allergies, dislikes, likes, appliances, goal, meat_level, food_notes')
      .eq('id', userId)
      .maybeSingle(),
  );
  if (!row) return null;
  return {
    people: row.household_size,
    budget: row.weekly_budget_usd === null ? 0 : Number(row.weekly_budget_usd),
    diet: (row.diet ?? 'any') as DietId,
    allergies: row.allergies,
    dislikes: row.dislikes,
    likes: row.likes,
    appliances: row.appliances as ApplianceId[],
    goal: (row.goal ?? 'maintain') as GoalId,
    meatLevel: (row.meat_level ?? 'some') as MeatLevelId,
    foodNotes: row.food_notes ?? '',
    saved: row.weekly_budget_usd !== null,
  };
}

export async function saveProfile(userId: string, p: Profile) {
  check(
    await db().from('profiles').upsert({
      id: userId,
      household_size: p.people,
      weekly_budget_usd: p.budget,
      diet: p.diet,
      allergies: p.allergies,
      dislikes: p.dislikes,
      likes: p.likes,
      appliances: p.appliances,
      goal: p.goal,
      meat_level: p.meatLevel,
      food_notes: p.foodNotes.trim().slice(0, 300),
    }),
  );
}

// ---- Consent

// What the server records, set only by the record_consent function (the columns are not writable directly).
export type ConsentKind = 'age' | 'ai' | 'allergy' | 'terms';
// `available` is false while the database does not have the consent columns yet, so the app keeps working before the
// migration is applied and simply does not ask.
export type ConsentState = { available: boolean; age: string | null; ai: string | null; allergy: string | null };
export const NO_CONSENT: ConsentState = { available: false, age: null, ai: null, allergy: null };

export async function loadConsents(userId: string): Promise<ConsentState> {
  const { data, error } = await db().from('profiles').select('age_confirmed_at, ai_consent_at, allergy_ack_at').eq('id', userId).maybeSingle();
  if (error || !data) return NO_CONSENT;
  return { available: true, age: data.age_confirmed_at ?? null, ai: data.ai_consent_at ?? null, allergy: data.allergy_ack_at ?? null };
}

// The server stamps the time itself; the app only says which kind. `terms` carries the version of the documents shown.
export async function recordConsent(kind: ConsentKind, version?: string) {
  check(await db().rpc('record_consent', version ? { p_kind: kind, p_version: version } : { p_kind: kind }));
}

// Taking AI planning back. Needs the server to accept this kind and clear ai_consent_at; until it does, this fails and
// the person is told, rather than the app pretending it worked.
export async function revokeAiConsent() {
  check(await db().rpc('record_consent', { p_kind: 'ai_revoke' }));
}

// ---- Pantry

const SHELF_ORDER = ['Staples', 'Spices', 'Fridge', 'Freezer', 'Produce'];

export async function loadPantry(userId: string): Promise<Shelf[]> {
  const rows = check(await db().from('pantry_items').select('name, shelf').eq('user_id', userId).order('name')) ?? [];
  const shelves = [...SHELF_ORDER, ...new Set(rows.map((r) => r.shelf).filter((s) => !SHELF_ORDER.includes(s)))];
  return shelves.map((name) => ({ name, items: rows.filter((r) => r.shelf === name).map((r) => r.name) }));
}

export async function addPantryItems(userId: string, shelves: Shelf[]) {
  const rows = shelves.flatMap((s) => s.items.map((name) => ({ user_id: userId, shelf: s.name, name })));
  if (rows.length === 0) return;
  const { error } = await db().from('pantry_items').insert(rows);
  // Names are unique per household, ignoring case. An item already on the shelf is not an error.
  if (error && error.code !== '23505') throw new DbError(error.message, error.code, (error as DbFailure).hint);
}

export async function removePantryItem(userId: string, name: string) {
  check(await db().from('pantry_items').delete().eq('user_id', userId).eq('name', name));
}

// ---- Week plan

// Each ingredient's nutrition row, embedded in recipe queries. It is one-to-one, so it comes back as an object.
const NUTRITION = 'nutrition:ingredient_nutrition(grams_per_unit, kcal, protein_g, carbs_g, fiber_g, sugar_g, fat_g, sat_fat_g, cholesterol_mg, sodium_mg)';

type RecipeRow = {
  id: string;
  title: string;
  minutes: number;
  servings: number;
  tags: string[];
  recipe_ingredients: { quantity: number; ingredient: { name: string; avg_price_usd: number; nutrition: IngredientNutrition | null } | null }[];
};

// Per-serving nutrition for a recipe, or undefined when none of its ingredients have data yet.
const servingNutrition = (lines: RecipeRow['recipe_ingredients'], servings: number) => {
  const known = lines.filter((l) => l.ingredient);
  const result = perServing(
    known.map((l) => ({ name: l.ingredient!.name, quantity: Number(l.quantity), nutrition: l.ingredient!.nutrition })),
    servings,
  );
  return result.missing.length === known.length ? undefined : result;
};

const needs = (tags: string[]) => tags.filter((t) => t.startsWith('needs-')).map((t) => t.slice('needs-'.length));
// `factors` are the person's edits to this recipe's amounts, by ingredient name (0 removes one).
const baseCost = (r: RecipeRow, factors: Record<string, number> = {}) =>
  r.recipe_ingredients.reduce(
    (sum, l) => sum + Number(l.quantity) * (factors[l.ingredient?.name ?? ''] ?? 1) * Number(l.ingredient?.avg_price_usd ?? 0),
    0,
  );

// This week's Monday, or tomorrow's on a Sunday, when people plan the week ahead. Uses the phone's own date.
export function currentWeekStart(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? 1 : 1 - day));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Oct 27 to Nov 2" for a week starting on the given Monday, in the language on screen.
export function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const locale = LANGUAGES.find((l) => l.code === currentLanguage())?.locale ?? 'en-US';
  const fmt = (date: Date) => date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return t('{start} to {end}', { start: fmt(start), end: fmt(end) });
}

// The household's latest plan as 21 slots in order, with costs scaled to the household.
export async function loadWeek(
  userId: string,
  people: number,
): Promise<{ planId: string; weekStart: string; meals: PlannedMeal[] } | null> {
  const plan = check(
    await db()
      .from('meal_plans')
      .select('id, week_start')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!plan) return null;
  const edits = await loadEditFactors(userId);
  const items = check(
    await db()
      .from('meal_plan_items')
      .select(
        `day_of_week, meal_type, status, conflict, leftover_id, recipe:recipes(id, title, minutes, servings, tags, recipe_ingredients(quantity, ingredient:ingredients(name, avg_price_usd, ${NUTRITION})))`,
      )
      .eq('plan_id', plan.id)
      .returns<{ day_of_week: number; meal_type: MealType; status: SlotStatus; conflict: boolean; leftover_id: string | null; recipe: RecipeRow | null }[]>(),
  ) ?? [];
  const meals: PlannedMeal[] = [];
  for (const item of items) {
    if (!item.recipe) continue;
    const slot = (item.day_of_week - 1) * 3 + MEAL_TYPES.indexOf(item.meal_type);
    const [day, dayLong] = DAYS[item.day_of_week - 1];
    meals[slot] = {
      id: item.recipe.id,
      name: item.recipe.title,
      type: item.meal_type,
      minutes: `${item.recipe.minutes} min`,
      cost: Math.round((baseCost(item.recipe, edits[item.recipe.id]) * people) / item.recipe.servings),
      nutrition: servingNutrition(item.recipe.recipe_ingredients, item.recipe.servings)?.perServing,
      day,
      dayLong,
      slot,
      appliances: needs(item.recipe.tags),
      status: item.status,
      conflict: item.conflict,
      leftoverId: item.leftover_id,
    };
  }
  if (meals.filter(Boolean).length !== 21) throw new Error(t('This week’s plan is incomplete. Plan the week again.'));
  return { planId: plan.id, weekStart: plan.week_start, meals };
}

// Whether a recipe breaks the household's allergies or diet, read from its tags, title and ingredient names with the same
// word lists the pantry uses. Fails closed: if the recipe can't be read, the swap does not go ahead.
export async function swapConflict(recipeId: string, allergies: string[], diet: string): Promise<SwapConflict | null> {
  const r = check(
    await db()
      .from('recipes')
      .select('title, tags, recipe_ingredients(ingredient:ingredients(name))')
      .eq('id', recipeId)
      .maybeSingle<{ title: string; tags: string[]; recipe_ingredients: { ingredient: { name: string } | { name: string }[] | null }[] }>(),
  );
  if (!r) throw new Error(t('This recipe isn’t available.'));
  const names = r.recipe_ingredients.flatMap((l) => (Array.isArray(l.ingredient) ? l.ingredient : l.ingredient ? [l.ingredient] : []).map((i) => i.name));
  return findSwapConflict({ title: r.title, tags: r.tags ?? [], ingredientNames: names }, allergies, diet);
}

export async function swapMeal(planId: string, slot: number, recipeId: string) {
  const day = Math.floor(slot / 3) + 1;
  const row = () => db().from('meal_plan_items');
  const before = check(
    await row()
      .select('recipe_id, status, leftover_id')
      .eq('plan_id', planId)
      .eq('day_of_week', day)
      .eq('meal_type', MEAL_TYPES[slot % 3])
      .maybeSingle<{ recipe_id: string; status: SlotStatus; leftover_id: string | null }>(),
  );
  check(
    await row()
      .update({ recipe_id: recipeId, status: 'cook', leftover_id: null })
      .eq('plan_id', planId)
      .eq('day_of_week', day)
      .eq('meal_type', MEAL_TYPES[slot % 3]),
  );
  try {
    // Re-check the swapped plan against the household's allergies and diet; the list is rebuilt only if there is one.
    await buildGroceryList(planId, undefined, await hasGroceryList(planId));
  } catch (e) {
    // The week and the list must agree, so put the old meal back before reporting the failure.
    if (before) {
      await row()
        .update({ recipe_id: before.recipe_id, status: before.status, leftover_id: before.leftover_id })
        .eq('plan_id', planId)
        .eq('day_of_week', day)
        .eq('meal_type', MEAL_TYPES[slot % 3]);
    }
    throw e;
  }
}

// ---- Grocery list

const AISLE_ORDER = ['Produce', 'Meat and Seafood', 'Dairy and Eggs', 'Bakery', 'Pantry', 'Frozen'];
// "Salsa, ⅛ jar", "Eggs, 2": the amount as a person would write it.
const amountLine = (name: string, qty: number, unit: string) => {
  const amount = friendlyAmount(qty, unit, currentLanguage() === 'en', name);
  return amount ? `${name}, ${amount}` : name;
};

export async function rebuildGroceries(planId: string) {
  check(await db().rpc('rebuild_grocery_list', { p_plan_id: planId }));
}

// A meal that breaks the household's allergies or diet, as the server found it.
export type GroceryConflict = { day_of_week: number; meal_type: MealType; recipe_id: string; title: string; allergens: string[]; diet: boolean };

// Builds the grocery list from the meals chosen, after checking every planned meal against the household's allergies and
// diet. `shop` leaves out meals the person isn't buying for; without it every meal keeps its current choice. With
// `buildList` false it only refreshes which meals conflict, for a household that hasn't made a list yet.
export async function buildGroceryList(
  planId: string,
  shop?: { day_of_week: number; meal_type: MealType; shop: boolean }[],
  buildList = true,
): Promise<GroceryConflict[]> {
  const result = await invoke<{ conflicts: GroceryConflict[] }>('grocery-list', { plan_id: planId, shop, build_list: buildList });
  return result.conflicts ?? [];
}

export async function hasGroceryList(planId: string): Promise<boolean> {
  const list = check(await db().from('grocery_lists').select('id').eq('plan_id', planId).maybeSingle());
  return !!list;
}

// Keeps an existing list in step after a swap, a pantry change or a leftover. Does nothing until the person has made one.
export async function refreshGroceryList(planId: string) {
  if (await hasGroceryList(planId)) await buildGroceryList(planId);
}

// ---- Ratings

// Stars the household gave each meal, keyed by recipe id.
export async function loadRatings(userId: string): Promise<Record<string, number>> {
  const rows = check(await db().from('meal_ratings').select('recipe_id, rating').eq('user_id', userId).returns<{ recipe_id: string; rating: number }[]>()) ?? [];
  return Object.fromEntries(rows.map((r) => [r.recipe_id, r.rating]));
}

export async function rateMeal(userId: string, recipeId: string, rating: number) {
  check(await db().from('meal_ratings').upsert({ user_id: userId, recipe_id: recipeId, rating, rated_at: new Date().toISOString() }));
}

// ---- Savings

// Every grocery list the household has generated, newest first, for the savings report.
export async function loadSavingsRows(userId: string): Promise<{ weekStart: string; total: number; pantry: number }[]> {
  const rows =
    check(
      await db()
        .from('grocery_lists')
        .select('estimated_total_usd, pantry_savings_usd, plan:meal_plans(week_start)')
        .eq('user_id', userId)
        .returns<{ estimated_total_usd: number; pantry_savings_usd: number; plan: { week_start: string } | { week_start: string }[] | null }[]>(),
    ) ?? [];
  return rows.flatMap((r) => {
    const plan = Array.isArray(r.plan) ? r.plan[0] : r.plan;
    return plan ? [{ weekStart: plan.week_start, total: Number(r.estimated_total_usd), pantry: Number(r.pantry_savings_usd) }] : [];
  });
}

// ---- Leftovers

export async function loadLeftovers(userId: string): Promise<Leftover[]> {
  const rows =
    check(
      await db()
        .from('leftovers')
        .select('id, servings, cooked_on, recipe:recipes(id, title)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .returns<{ id: string; servings: number; cooked_on: string; recipe: { id: string; title: string } | null }[]>(),
    ) ?? [];
  return rows.flatMap((r) => (r.recipe ? [{ id: r.id, recipeId: r.recipe.id, name: r.recipe.title, servings: r.servings, cookedOn: r.cooked_on }] : []));
}

export async function addLeftovers(userId: string, recipeId: string, servings: number) {
  check(await db().from('leftovers').insert({ user_id: userId, recipe_id: recipeId, servings }));
}

export async function removeLeftover(id: string) {
  check(await db().from('leftovers').delete().eq('id', id));
}

// Puts a leftover meal in a slot (or takes it out with null), so that meal stops needing ingredients. A leftover fills one slot.
// It takes two writes (free the slot that held it, then fill this one). If the second fails, the first is undone so the
// leftover is not left floating between slots.
export async function assignLeftover(planId: string, slot: number, leftoverId: string | null) {
  const table = () => db().from('meal_plan_items');
  let freed: { day_of_week: number; meal_type: MealType }[] = [];
  if (leftoverId) {
    freed = check(await table().select('day_of_week, meal_type').eq('plan_id', planId).eq('leftover_id', leftoverId).returns<{ day_of_week: number; meal_type: MealType }[]>()) ?? [];
    check(await table().update({ status: 'cook', leftover_id: null }).eq('plan_id', planId).eq('leftover_id', leftoverId));
  }
  try {
    check(
      await table()
        .update(leftoverId ? { status: 'leftover', leftover_id: leftoverId } : { status: 'cook', leftover_id: null })
        .eq('plan_id', planId)
        .eq('day_of_week', Math.floor(slot / 3) + 1)
        .eq('meal_type', MEAL_TYPES[slot % 3]),
    );
  } catch (e) {
    for (const f of freed) {
      await table().update({ status: 'leftover', leftover_id: leftoverId }).eq('plan_id', planId).eq('day_of_week', f.day_of_week).eq('meal_type', f.meal_type);
    }
    throw e;
  }
  await rebuildGroceriesIfAny(planId);
}

async function rebuildGroceriesIfAny(planId: string) {
  if (await hasGroceryList(planId)) await rebuildGroceries(planId);
}

export async function loadGroceries(planId: string): Promise<{
  aisles: GroceryAisle[];
  checked: Record<string, boolean>;
  total: number;
  pantrySavings: number;
} | null> {
  const list = check(
    await db().from('grocery_lists').select('id, estimated_total_usd, pantry_savings_usd').eq('plan_id', planId).maybeSingle(),
  );
  if (!list) return null;
  const items = check(
    await db()
      .from('grocery_items')
      .select('id, quantity, unit, checked, ingredient:ingredients(name, aisle, avg_price_usd)')
      .eq('list_id', list.id)
      .returns<{ id: string; quantity: number; unit: string; checked: boolean; ingredient: { name: string; aisle: string; avg_price_usd: number } }[]>(),
  ) ?? [];
  const aisleNames = [...AISLE_ORDER, ...new Set(items.map((i) => i.ingredient.aisle).filter((a) => !AISLE_ORDER.includes(a)))];
  const aisles = aisleNames
    .map((name) => ({
      name,
      items: items
        .filter((i) => i.ingredient.aisle === name)
        .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))
        .map((i) => ({
          key: i.id,
          name: amountLine(i.ingredient.name, Number(i.quantity), i.unit),
          price: Number(i.quantity) * Number(i.ingredient.avg_price_usd),
        })),
    }))
    .filter((a) => a.items.length > 0);
  return {
    aisles,
    checked: Object.fromEntries(items.map((i) => [i.id, i.checked])),
    total: Number(list.estimated_total_usd),
    pantrySavings: Number(list.pantry_savings_usd),
  };
}

export async function setChecked(itemId: string, checked: boolean) {
  check(await db().from('grocery_items').update({ checked }).eq('id', itemId));
}

// ---- Recipes

export async function loadRecipe(
  recipeId: string,
  people: number,
  pantryNames: string[],
  type: MealType,
): Promise<RecipeView | null> {
  const r = check(
    await db()
      .from('recipes')
      .select(`id, title, minutes, servings, steps, tags, recipe_ingredients(quantity, unit, ingredient:ingredients(name, avg_price_usd, ${NUTRITION}))`)
      .eq('id', recipeId)
      .maybeSingle()
      .returns<{
        id: string;
        title: string;
        minutes: number;
        servings: number;
        steps: string;
        tags: string[];
        recipe_ingredients: (RecipeRow['recipe_ingredients'][number] & { unit: string })[];
      } | null>(),
  );
  if (!r) return null;
  const edit = await loadEdit(recipeId);
  const factors = edit?.factors ?? {};
  const scale = people / r.servings;
  const onShelf = new Set(pantryNames.map((n) => n.trim().toLowerCase()));
  // The person's own amounts: scaled by their factor, with removed ingredients (factor 0) dropped everywhere below.
  const edited = r.recipe_ingredients
    .filter((l) => l.ingredient && (factors[l.ingredient.name] ?? 1) > 0)
    .map((l) => ({ ...l, quantity: Number(l.quantity) * (factors[l.ingredient!.name] ?? 1) }));
  const lines = edited;
  const detail: RecipeDetail = {
    serves: people,
    appliances: needs(r.tags) as ApplianceId[],
    ingredients: lines.map((l) => {
      const qty = Number(l.quantity) * scale;
      const name = l.ingredient!.name;
      return {
        name: amountLine(name, qty, l.unit),
        price: onShelf.has(name.toLowerCase()) ? ('pantry' as const) : Math.round(qty * Number(l.ingredient!.avg_price_usd) * 100) / 100,
      };
    }),
    steps: (edit?.steps ?? r.steps).split('\n').map((s) => s.trim()).filter(Boolean),
    nutrition: servingNutrition(edited, r.servings),
    note: edit?.note ?? undefined,
    edited: !!edit && (Object.values(factors).some((f) => f !== 1) || !!edit.steps),
  };
  const cost = lines.reduce((sum, l) => sum + Number(l.quantity) * scale * Number(l.ingredient!.avg_price_usd), 0);
  return {
    meal: { id: r.id, name: r.title, type, minutes: `${r.minutes} min`, cost: Math.round(cost), nutrition: detail.nutrition?.perServing },
    detail,
  };
}

// The recipe's photo and the credit its licence asks for. Read on its own so a database without these columns still works.
export async function loadRecipePhoto(recipeId: string): Promise<{ url: string; credit: string | null } | null> {
  const { data, error } = await db().from('recipes').select('image_url, image_credit').eq('id', recipeId).maybeSingle<{ image_url: string | null; image_credit: string | null }>();
  if (error || !data?.image_url) return null;
  return { url: data.image_url, credit: data.image_credit?.trim() || null };
}

// ---- Recipe edits (Plus)

export type RecipeEdit = { factors: Record<string, number>; steps: string | null; note: string | null };

// The signed-in person's changes to a recipe, or null when they have made none.
export async function loadEdit(recipeId: string): Promise<RecipeEdit | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const row = check(
    await db().from('recipe_edits').select('factors, steps, note').eq('user_id', uid).eq('recipe_id', recipeId).maybeSingle<{ factors: Record<string, number>; steps: string | null; note: string | null }>(),
  );
  return row ? { factors: row.factors ?? {}, steps: row.steps, note: row.note } : null;
}

// Every recipe the person has changed, as amount factors by ingredient name, so the week's costs can use them.
export async function loadEditFactors(userId: string): Promise<Record<string, Record<string, number>>> {
  const rows = check(await db().from('recipe_edits').select('recipe_id, factors').eq('user_id', userId).returns<{ recipe_id: string; factors: Record<string, number> }[]>()) ?? [];
  return Object.fromEntries(rows.map((r) => [r.recipe_id, r.factors ?? {}]));
}

// What the edit screen works from: the original recipe at the household's size, plus the person's current factors.
export type EditableRecipe = {
  title: string;
  ingredients: { name: string; unit: string; quantity: number; factor: number }[];
  originalSteps: string[];
  steps: string[];
  note: string;
};

export async function loadEditable(recipeId: string, people: number): Promise<EditableRecipe | null> {
  const r = check(
    await db()
      .from('recipes')
      .select('title, servings, steps, recipe_ingredients(quantity, unit, ingredient:ingredients(name))')
      .eq('id', recipeId)
      .maybeSingle<{ title: string; servings: number; steps: string; recipe_ingredients: { quantity: number; unit: string; ingredient: { name: string } | null }[] }>(),
  );
  if (!r) return null;
  const edit = await loadEdit(recipeId);
  const split = (text: string) => text.split('\n').map((x) => x.trim()).filter(Boolean);
  return {
    title: r.title,
    ingredients: r.recipe_ingredients
      .filter((l) => l.ingredient)
      .map((l) => ({ name: l.ingredient!.name, unit: l.unit, quantity: (Number(l.quantity) * people) / r.servings, factor: edit?.factors[l.ingredient!.name] ?? 1 })),
    originalSteps: split(r.steps),
    steps: split(edit?.steps ?? r.steps),
    note: edit?.note ?? '',
  };
}

export async function saveEdit(recipeId: string, edit: { factors: Record<string, number>; steps: string[]; originalSteps: string[]; note: string }) {
  const uid = await currentUserId();
  if (!uid) throw new Error(t('Sign in to edit recipes.'));
  // Only real changes are stored, so an untouched recipe keeps following the catalog.
  const factors = Object.fromEntries(Object.entries(edit.factors).filter(([, f]) => f !== 1));
  const changedSteps = edit.steps.join('\n') !== edit.originalSteps.join('\n');
  const note = edit.note.trim().slice(0, 500);
  if (Object.keys(factors).length === 0 && !changedSteps && !note) return resetEdit(recipeId);
  check(
    await db().from('recipe_edits').upsert({ user_id: uid, recipe_id: recipeId, factors, steps: changedSteps ? edit.steps.join('\n') : null, note: note || null, updated_at: new Date().toISOString() }),
  );
}

export async function resetEdit(recipeId: string) {
  const uid = await currentUserId();
  if (!uid) return;
  check(await db().from('recipe_edits').delete().eq('user_id', uid).eq('recipe_id', recipeId));
}

// ---- Edge Functions

// An error with the server's code on it, so screens decide what to do from the code and never from English text.
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}
export const errorCode = (e: unknown): string | undefined => (e instanceof ApiError ? e.code : undefined);

// The functions answer `{ error: code, message }` with the message in English. Known codes get a translated sentence;
// anything else shows the server's own message.
const serverError = (code: unknown, message: unknown): string => {
  switch (code) {
    case 'plan_limit':
      return t('You’ve used your {n} plans this month. Your count resets on the 1st.', { n: FREE_PLANS_PER_MONTH });
    case 'plus_required':
      return t('Keeping meals while you plan again is part of Kelmi Plus.');
    case 'plan_cap':
      return t('You’ve reached this month’s plan limit. It resets on the 1st.');
    case 'rate_limited':
      return t('You’re going a little fast. Try again in a few minutes.');
    case 'age_required':
      return t('Confirm your age to keep planning.');
    case 'profile_missing':
      return t('Finish setting up your household first');
    case 'not_enough_recipes':
      return t('Not enough recipes match your allergies, diet and kitchen to fill a week.');
    case 'plan_generation_failed':
      return t('Could not build a plan. Try again.');
    default:
      return typeof message === 'string' && message ? message : t('Something went wrong. Try again.');
  }
};

// Planning can take a while, but not forever: after this the request is dropped and the person can try again.
const FUNCTION_TIMEOUT_MS = 90_000;

// Calls a function and turns its error responses into an ApiError the app can show and branch on.
async function invoke<T>(name: string, body: object): Promise<T> {
  const { data, error } = await db().functions.invoke(name, { body, timeout: FUNCTION_TIMEOUT_MS });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      const code = typeof payload?.error === 'string' ? payload.error : 'http_error';
      throw new ApiError(code, serverError(payload?.error, payload?.message));
    }
    if (error instanceof FunctionsRelayError) {
      throw new ApiError('relay_error', t('Kelmi’s servers are busy right now. Try again in a minute.'));
    }
    if (error instanceof FunctionsFetchError) {
      // Our own timeout aborts the request; anything else is a connection problem.
      if ((error.context as { name?: string } | undefined)?.name === 'AbortError') {
        throw new ApiError('timeout', t('That took too long. Check your connection and try again.'));
      }
      throw new ApiError('network', t('Kelmi can’t reach the internet. Check your connection and try again.'));
    }
    throw new ApiError('unknown', t('Something went wrong. Try again.'));
  }
  return data as T;
}

// Plans a week. `locked` (Plus) lists meals to keep while the rest of the week is planned again.
export type LockedMeal = { day_of_week: number; meal_type: MealType; recipe_id: string };
// `planner` says who made the week; `degraded` is true when the AI planner was asked for and failed, so the built-in one
// stepped in. Both are absent from an older server.
export type PlanResult = { planner?: 'claude' | 'idunify' | 'basic'; degraded?: boolean };
export const generatePlan = (weekStart: string, locked?: LockedMeal[]) =>
  invoke<PlanResult | null>('generate-plan', locked && locked.length > 0 ? { week_start: weekStart, locked } : { week_start: weekStart });

// Plan requests made this month, which is what the monthly limit counts (a week planned again counts as another).
// Plans used this month, as the server counts them (claim_plan_generation): a failed plan that used no paid tokens does not
// count. Needs status and input_tokens to be readable (they are, by the own-rows select policy on plan_generations); if
// those columns are missing the count falls back to every row.
export async function loadPlansThisMonth(userId: string): Promise<number> {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await db()
    .from('plan_generations')
    .select('status, input_tokens')
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => r.status !== 'failed' || (r.input_tokens ?? 0) > 0).length;
}

export async function mealOptions(type: MealType, exclude: string[]): Promise<Meal[]> {
  const result = await invoke<{ options: { id: string; title: string; minutes: number; estimated_cost_usd: number }[] }>(
    'meal-options',
    { meal_type: type, exclude },
  );
  return result.options.map((o) => ({
    id: o.id,
    name: o.title,
    type,
    minutes: `${o.minutes} min`,
    cost: Math.round(o.estimated_cost_usd),
  }));
}

export const deleteAccount = () => invoke('delete-account', {});
