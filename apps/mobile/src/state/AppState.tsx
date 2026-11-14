import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import {
  DAYS,
  MEAL_TYPES,
  DEFAULT_SLOTS,
  GROCERIES,
  MEALS,
  PANTRY,
  RECIPES,
  SWAP_POOL,
  type ApplianceId,
  type DietId,
  type GoalId,
  type Leftover,
  type MeatLevelId,
  type GroceryAisle,
  type Meal,
  type PlannedMeal,
  type RecipeView,
  type Shelf,
} from '../data/mock';
import { comma, t, useLanguage } from '../i18n';
import { sundayReminderIsOn, setSundayReminder } from '../lib/timerAlert';
import * as api from '../lib/api';
import { trackEvent } from '../lib/analytics';
import * as purchases from '../lib/purchases';
import { getAgeStatus, getAiAsked, saveConsent, setAiAsked } from '../lib/consent';
import { TERMS_VERSION } from '../legal/config';
import { loadPlanInfo, savePlanInfo, type PlanInfo } from '../lib/planInfo';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { syncWidgets } from '../lib/widgets';
import { haptic } from '../motion';
import { celebrate } from '../motion/celebrate';

// App state. With Supabase configured (EXPO_PUBLIC_SUPABASE_* in .env), a signed-in household's profile,
// pantry, plan and grocery list load from and save to Supabase. Without it, the app runs on the example
// data in data/mock.ts so every screen can still be tried.

export type PlanStatus = 'ready' | 'loading' | 'empty' | 'error';

type AppState = {
  live: boolean;
  authReady: boolean;
  signedIn: boolean;
  email: string | null;
  people: number;
  budget: number;
  diet: DietId;
  allergies: string[];
  dislikes: string[];
  likes: string[];
  foodNotes: string;
  setFoodNotes: (v: string) => void;
  appliances: ApplianceId[];
  goal: GoalId;
  meatLevel: MeatLevelId;
  remindSunday: boolean;
  subscribed: boolean;
  // What the server has recorded about consent. `available` is false before the database has the columns, and then the app
  // asks for nothing.
  consent: api.ConsentState;
  // Which planner made the week on screen, when known.
  planInfo: PlanInfo | null;
  // True when the last attempt to save the household (allergies, diet, size, budget) failed.
  profileSaveFailed: boolean;
  // Why that save failed, when the database refused an entry and it can be said plainly; otherwise null.
  profileSaveHint: string | null;
  planStatus: PlanStatus;
  planError: string | null;
  plan: PlannedMeal[];
  planTotal: number;
  weekLabel: string;
  groceries: GroceryAisle[];
  groceryTotal: number;
  pantrySavings: number;
  checked: Record<string, boolean>;
  // Whether a grocery list exists for this plan yet. The person makes one from the Groceries tab.
  hasList: boolean;
  leftovers: Leftover[];
  // Stars (1 to 5) the household gave each meal they cooked, keyed by recipe id.
  ratings: Record<string, number>;
  pantry: Shelf[];
};

type Actions = {
  setPeople: (n: number) => void;
  setBudget: (n: number) => void;
  setDiet: (d: DietId) => void;
  setGoal: (g: GoalId) => void;
  setMeatLevel: (m: MeatLevelId) => void;
  toggleAllergy: (a: string) => void;
  toggleDislike: (d: string) => void;
  toggleLike: (food: string) => void;
  addLike: (food: string) => void;
  toggleAppliance: (id: ApplianceId) => void;
  setRemindSunday: (on: boolean) => void;
  recordConsent: (kind: api.ConsentKind) => Promise<void>;
  // "Not now" on the AI screen: plan with the built-in planner and ask again only from Settings.
  skipAiConsent: () => Promise<void>;
  revokeAiConsent: () => Promise<void>;
  retryProfileSave: () => void;
  signInWithProvider: (provider: api.OAuthProvider) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string, name: api.PersonName) => Promise<api.EmailSignUpResult>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  subscribe: () => void;
  // True when the store found an active Plus subscription for this account.
  restorePurchases: () => Promise<boolean>;
  setPlanStatus: (s: PlanStatus) => void;
  generatePlan: (keepLocked?: boolean) => void;
  plansUsed: number;
  lockedSlots: number[];
  toggleLock: (slot: number) => void;
  getRecipe: (id: string, slot?: number) => Promise<RecipeView | null>;
  getSwapOptions: (slot: number) => Promise<Meal[]>;
  swapMeal: (slot: number, meal: Meal) => Promise<void>;
  toggleChecked: (key: string) => void;
  rateMeal: (recipeId: string, stars: number) => Promise<void>;
  // Saves a Plus member's own version of a recipe (or removes it with null), then updates the week and any grocery list.
  saveRecipeEdit: (recipeId: string, edit: Parameters<typeof api.saveEdit>[1] | null) => Promise<void>;
  // Builds the grocery list from the meals chosen (every meal when `shop` is left out). Resolves with the meals that break
  // the household's allergies or diet, which are left off.
  generateGroceries: (shop?: { slot: number; shop: boolean }[]) => Promise<api.GroceryConflict[]>;
  addLeftovers: (recipeId: string, name: string, servings: number) => Promise<void>;
  removeLeftover: (id: string) => Promise<void>;
  // Puts a leftover meal in a slot, or takes it out with null.
  assignLeftover: (slot: number, leftoverId: string | null) => Promise<void>;
  addPantryItem: (shelf: string, item: string) => void;
  removePantryItem: (shelf: string, item: string) => void;
};

const Ctx = createContext<(AppState & Actions) | null>(null);

const LIVE = isSupabaseConfigured;

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
// Entries the person types in: trimmed, control characters removed, cut to the database's limit (40 for lists, 80 for a pantry name).
const cleanEntry = (text: string, max: number) => text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim().slice(0, max);
// Limits on the household's lists, in step with the profiles_lists_ok check (migration 20261112000000_input_limits.sql).
const MAX_LIKES = 30;
const MAX_DISLIKES = 20;
const MAX_ALLERGIES = 20;
const MAX_ENTRY = 40;

// Why a profile save or pantry insert was refused by the database, in plain words; null when it is not a known refusal.
const pantryFailure = (e: unknown) => {
  const err = e as { code?: string; hint?: string; message?: string };
  const text = `${err?.hint ?? ''} ${err?.message ?? ''}`;
  if (text.includes('pantry_free_limit')) return t('The free pantry is full. Remove an item to add another.');
  if (text.includes('pantry_limit') || text.includes('pantry_full')) return t('Your pantry is full. Remove an item to add another.');
  if (err?.code === '23514') return t('That name is too long or not allowed. Use up to 80 characters.');
  return null;
};
const profileFailure = (e: unknown) =>
  (e as { code?: string })?.code === '23514'
    ? t('One of your entries is too long or not allowed. Shorten your foods or remove the odd one, then try again.')
    : null;

const message = (e: unknown) => (e instanceof Error ? e.message : t('Something went wrong. Try again.'));

// ---- Example data, used when Supabase is not configured

const demoPlan = (ids: string[]): PlannedMeal[] =>
  ids.map((id, slot) => {
    const [day, dayLong] = DAYS[Math.floor(slot / 3)];
    return { ...MEALS[id], day, dayLong, slot, appliances: RECIPES[id]?.appliances ?? [] };
  });
const DEMO_GROCERIES: GroceryAisle[] = GROCERIES.map((a) => ({
  name: a.name,
  items: a.items.map((i) => ({ key: i.name, ...i })),
}));
const DEMO_GROCERY_TOTAL = GROCERIES.reduce((s, a) => s + a.items.reduce((sum, i) => sum + i.price, 0), 0);

export function AppStateProvider({ children }: { children: ReactNode }) {
  // Reading the language re-renders the provider when it changes, so weekLabel and the widgets follow it.
  const { lang } = useLanguage();
  // Household. These start as onboarding defaults; once signed in they mirror the saved profile.
  const [people, setPeopleRaw] = useState(4);
  // Covers all three meals a day, so the default is higher than it was for dinners alone.
  const [budget, setBudgetRaw] = useState(220);
  const [diet, setDiet] = useState<DietId>('any');
  const [goal, setGoal] = useState<GoalId>('maintain');
  const [meatLevel, setMeatLevel] = useState<MeatLevelId>('some');
  // A real account starts with nothing chosen: allergies and dislikes are the person's own answers, never a default. The
  // example data keeps its sample choices so a build without Supabase still shows a filled-in app.
  const [allergies, setAllergies] = useState<string[]>(LIVE ? [] : ['Peanuts', 'Shellfish']);
  const [dislikes, setDislikes] = useState<string[]>(LIVE ? [] : ['Mushrooms']);
  const [likes, setLikes] = useState<string[]>([]);
  const [foodNotes, setFoodNotes] = useState('');
  // Most kitchens have these three, so they start ticked and the user unticks what they lack.
  const [appliances, setAppliances] = useState<ApplianceId[]>(['stovetop', 'oven', 'microwave']);
  const [remindSunday, setRemindSundayState] = useState(false);
  // The reminder is a scheduled notification, so it is read back from the phone rather than remembered in the app.
  useEffect(() => {
    sundayReminderIsOn().then(setRemindSundayState);
  }, []);
  const [subscribed, setSubscribed] = useState(false);
  // A new account's pantry is empty; the example pantry is only for the logged-out example build.
  const [pantry, setPantry] = useState<Shelf[]>(LIVE ? [] : PANTRY);
  const [consent, setConsent] = useState<api.ConsentState>(api.NO_CONSENT);
  const [aiAsked, setAiAskedState] = useState(false);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [profileSaveFailed, setProfileSaveFailed] = useState(false);
  const [profileSaveHint, setProfileSaveHint] = useState<string | null>(null);
  const [saveNonce, setSaveNonce] = useState(0);
  // Set when the household saved but rebuilding the plan's checks did not, so a retry finishes the job.
  const needsRefresh = useRef(false);
  // True while a plan request is out, so a second tap can't send another.
  const planning = useRef(false);

  // Account
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!LIVE);
  const [demoSignedIn, setDemoSignedIn] = useState(false);

  // Week. In example mode these start filled in; when live they load after sign-in.
  const [planStatus, setPlanStatus] = useState<PlanStatus>(LIVE ? 'loading' : 'ready');
  const [planError, setPlanError] = useState<string | null>(null);
  const [plansUsed, setPlansUsed] = useState(0);
  // Meals (by slot) a Plus user is keeping while the rest of the week is planned again.
  const [lockedSlots, setLockedSlots] = useState<number[]>([]);
  const [plan, setPlan] = useState<PlannedMeal[]>(LIVE ? [] : demoPlan(DEFAULT_SLOTS));
  const [planId, setPlanId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [groceries, setGroceries] = useState<GroceryAisle[]>(LIVE ? [] : DEMO_GROCERIES);
  const [groceryTotal, setGroceryTotal] = useState(LIVE ? 0 : DEMO_GROCERY_TOTAL);
  const [pantrySavings, setPantrySavings] = useState(LIVE ? 0 : 17.8);
  const [hasList, setHasList] = useState(!LIVE);
  const [leftovers, setLeftovers] = useState<Leftover[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>(
    LIVE ? {} : { 'Bell peppers, 3': true, 'Yellow onions, 3 lb bag': true },
  );

  const userId = session?.user.id ?? null;
  const profile: api.Profile = { people, budget, diet, allergies, dislikes, likes, appliances, goal, meatLevel, foodNotes };

  // Latest values for async work started earlier, so it never acts on stale state.
  const latest = useRef({ profile, pantry, planId, hasList, plan, consent, aiAsked, subscribed, lockedSlots });
  latest.current = { profile, pantry, planId, hasList, plan, consent, aiAsked, subscribed, lockedSlots };
  // The profile as last saved, so the save effect only writes real changes.
  const savedProfile = useRef<string | null>(null);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(demoTimer.current), []);

  const reloadGroceries = async (id: string) => {
    // A list exists only once the person has generated one, so none is built here.
    const list = await api.loadGroceries(id);
    setHasList(!!list);
    setGroceries(list?.aisles ?? []);
    setChecked(list?.checked ?? {});
    setGroceryTotal(list?.total ?? 0);
    setPantrySavings(list?.pantrySavings ?? 0);
  };

  const reloadWeek = async (uid: string, householdSize: number) => {
    const week = await api.loadWeek(uid, householdSize);
    if (!week) {
      setPlan([]);
      setPlanId(null);
      setWeekStart(null);
      setGroceries([]);
      setChecked({});
      setGroceryTotal(0);
      setPantrySavings(0);
      setHasList(false);
      setPlanStatus('empty');
      return;
    }
    setPlan(week.meals);
    setPlanId(week.planId);
    setWeekStart(week.weekStart);
    await reloadGroceries(week.planId);
    setPlanError(null);
    setPlanStatus('ready');
  };

  const showError = (e: unknown) => {
    setPlanError(message(e));
    setPlanStatus('error');
  };

  // Follow the Supabase session: restored from the phone on launch, then any sign-in or sign-out.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Subscriptions: RevenueCat follows the signed-in user (so Plus follows the account across devices) and tells us
  // whenever it changes. Without RevenueCat keys this does nothing and `subscribed` stays false.
  useEffect(() => {
    if (!purchases.purchasesAvailable) return;
    let cancelled = false;
    purchases
      .syncPurchasesUser(userId)
      .then((info) => {
        if (!cancelled && info) setSubscribed(purchases.isPlus(info));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);
  useEffect(() => purchases.onPlusChange(setSubscribed), []);

  // On sign-in, bring the household together: a brand-new account takes what was set up during onboarding,
  // and a returning one loads what it saved before. Then load the week and its grocery list.
  useEffect(() => {
    if (!userId) {
      savedProfile.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      setPlanStatus('loading');
      try {
        // First, record the age check and the Terms acceptance made at sign-up, then read back what the server holds.
        await saveConsent();
        const [consents, asked] = await Promise.all([api.loadConsents(userId), getAiAsked(userId)]);
        if (cancelled) return;
        setConsent(consents);
        setAiAskedState(asked);
        const local = latest.current.profile;
        const server = await api.loadProfile(userId);
        let current = local;
        if (server?.saved) {
          current = { people: server.people, budget: server.budget, diet: server.diet, allergies: server.allergies, dislikes: server.dislikes, likes: server.likes, appliances: server.appliances, goal: server.goal, meatLevel: server.meatLevel, foodNotes: server.foodNotes };
          if (cancelled) return;
          setPeopleRaw(current.people);
          setBudgetRaw(current.budget);
          setDiet(current.diet);
          setAllergies(current.allergies);
          setDislikes(current.dislikes);
          setLikes(current.likes);
          setFoodNotes(current.foodNotes);
          setAppliances(current.appliances);
          setGoal(current.goal);
          setMeatLevel(current.meatLevel);
        } else {
          await api.saveProfile(userId, local);
        }
        savedProfile.current = JSON.stringify(current);

        // Whatever the account holds is what shows, including an empty pantry: nothing is put there for the person.
        const shelves = await api.loadPantry(userId);
        if (cancelled) return;
        setPantry(shelves);
        await reloadWeek(userId, current.people);
        loadPlanInfo(userId).then((info) => !cancelled && setPlanInfo(info));
        api.loadPlansThisMonth(userId).then(setPlansUsed).catch(() => {});
        const mine = await api.loadLeftovers(userId).catch(() => [] as Leftover[]);
        if (!cancelled) setLeftovers(mine);
        const rated = await api.loadRatings(userId).catch(() => ({}) as Record<string, number>);
        if (!cancelled) setRatings(rated);
      } catch (e) {
        if (!cancelled) showError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Save household changes a moment after they stop, then refresh the plan's costs and grocery list. A failed save is shown
  // to the person (allergy and diet changes only protect them once they are saved) and can be retried.
  useEffect(() => {
    if (!userId || savedProfile.current === null) return;
    const snapshot = JSON.stringify(profile);
    if (snapshot === savedProfile.current && !needsRefresh.current) return;
    const timer = setTimeout(async () => {
      try {
        if (snapshot !== savedProfile.current) {
          await api.saveProfile(userId, profile);
          savedProfile.current = snapshot;
          needsRefresh.current = true;
        }
        const id = latest.current.planId;
        if (id) {
          // Re-check every planned meal against the new allergies and diet; the list is rebuilt only if there is one.
          await api.buildGroceryList(id, undefined, latest.current.hasList);
          await reloadWeek(userId, profile.people);
        }
        needsRefresh.current = false;
        setProfileSaveFailed(false);
        setProfileSaveHint(null);
      } catch (e) {
        console.warn('Saving the household failed', e);
        setProfileSaveFailed(true);
        setProfileSaveHint(profileFailure(e));
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [userId, people, budget, diet, allergies, dislikes, likes, appliances, goal, meatLevel, foodNotes, saveNonce]);

  // Pantry changes move items on and off the grocery list.
  const refreshListAfterPantryChange = async () => {
    const id = latest.current.planId;
    if (!id || !latest.current.hasList) return;
    await api.rebuildGroceries(id);
    await reloadGroceries(id);
  };

  const clearLiveData = () => {
    setPlan([]);
    setPlanId(null);
    setWeekStart(null);
    setGroceries([]);
    setChecked({});
    setHasList(false);
    setLeftovers([]);
    setRatings({});
    setConsent(api.NO_CONSENT);
    setAiAskedState(false);
    setPlanInfo(null);
    setProfileSaveFailed(false);
    setProfileSaveHint(null);
    needsRefresh.current = false;
    setPlanStatus('loading');
    setPlanError(null);
  };

  // Keep the home screen widget in step with the plan and the grocery checklist, and resend in a new language.
  useEffect(() => {
    syncWidgets(plan, groceries, checked);
  }, [plan, groceries, checked, lang]);

  const signedIn = LIVE ? session !== null : demoSignedIn;
  const planTotal = plan.reduce((s, m) => s + m.cost, 0);

  // Plans the week. One request at a time; a failure never takes away a week that is already on screen.
  const generate = async (keepLocked?: boolean, afterAge = false): Promise<void> => {
    if (planning.current) return;
    const cur = latest.current;
    const keep =
      keepLocked && cur.subscribed
        ? cur.lockedSlots.filter((s) => cur.plan[s]).map((s) => ({ day_of_week: Math.floor(s / 3) + 1, meal_type: cur.plan[s].type, recipe_id: cur.plan[s].id }))
        : [];
    if (!LIVE) {
      setPlanError(null);
      setPlanStatus('loading');
      // Simulates the generate-plan call so the loading state can be seen.
      // A second tap restarts the wait instead of stacking timers.
      if (demoTimer.current) clearTimeout(demoTimer.current);
      demoTimer.current = setTimeout(() => {
        demoTimer.current = undefined;
        setPlan(demoPlan(DEFAULT_SLOTS));
        setPlanStatus('ready');
        haptic.success();
        celebrate('confetti');
      }, 1500);
      return;
    }
    if (!userId) return;
    // Before the first plan: the allergy notice, then the AI choice. Each reopens this once it is answered.
    if (cur.consent.available) {
      if (!cur.consent.allergy) return router.push({ pathname: '/allergy-ack', params: { then: 'plan' } });
      if (!cur.consent.ai && !cur.aiAsked) return router.push({ pathname: '/ai-consent', params: { then: 'plan' } });
    }
    planning.current = true;
    const hadPlan = cur.plan.length === 21;
    setPlanError(null);
    setPlanStatus('loading');
    try {
      const result = await api.generatePlan(api.currentWeekStart(), keep);
      await reloadWeek(userId, cur.profile.people);
      setLockedSlots([]);
      if (result?.planner) {
        const info: PlanInfo = { weekStart: api.currentWeekStart(), planner: result.planner, degraded: !!result.degraded };
        setPlanInfo(info);
        savePlanInfo(userId, info);
      } else {
        setPlanInfo(null);
      }
      haptic.success();
      celebrate('confetti');
      trackEvent('plan_generated');
    } catch (e) {
      if (api.errorCode(e) === 'age_required' && !afterAge) {
        planning.current = false;
        setPlanStatus(hadPlan ? 'ready' : 'empty');
        // This phone already has a passing age answer: tell the server and go again. Otherwise ask for it.
        if ((await getAgeStatus()) === 'ok') {
          try {
            await api.recordConsent('age');
            return generate(keepLocked, true);
          } catch (err) {
            Alert.alert(t('Couldn’t plan this week'), message(err));
            return;
          }
        }
        router.push({ pathname: '/age', params: { next: '/week' } });
        return;
      }
      if (hadPlan) {
        // The week on screen stays; say what went wrong.
        setPlanStatus('ready');
        Alert.alert(t('Couldn’t plan this week'), message(e));
      } else {
        showError(e);
      }
    } finally {
      planning.current = false;
      api.loadPlansThisMonth(userId).then(setPlansUsed).catch(() => {});
    }
  };

  const value: AppState & Actions = {
    live: LIVE,
    authReady,
    signedIn,
    email: session?.user.email ?? null,
    people,
    budget,
    diet,
    allergies,
    dislikes,
    likes,
    foodNotes,
    setFoodNotes: (v: string) => setFoodNotes(v.replace(/[\r\n]+/g, ' ').slice(0, 300)),
    appliances,
    goal,
    meatLevel,
    remindSunday,
    subscribed,
    consent,
    planInfo,
    profileSaveFailed,
    profileSaveHint,
    planStatus,
    planError,
    plan,
    planTotal,
    weekLabel: weekStart ? api.weekLabel(weekStart) : LIVE ? api.weekLabel(api.currentWeekStart()) : api.weekLabel('2025-10-27'),
    groceries,
    groceryTotal,
    pantrySavings,
    checked,
    hasList,
    leftovers,
    ratings,
    pantry,
    setPeople: (n: number) => setPeopleRaw(Math.min(12, Math.max(1, n))),
    setBudget: (n: number) => setBudgetRaw(Math.min(400, Math.max(50, Math.round(n)))),
    setDiet,
    setGoal,
    setMeatLevel,
    toggleAllergy: (a: string) => {
      if (!allergies.includes(a) && allergies.length >= MAX_ALLERGIES) {
        return Alert.alert(t('Too many allergies'), t('You can list up to {n} allergies.', { n: MAX_ALLERGIES }));
      }
      setAllergies((l) => toggle(l, a));
    },
    toggleDislike: (d: string) => {
      if (!dislikes.includes(d) && dislikes.length >= MAX_DISLIKES) {
        return Alert.alert(t('Too many dislikes'), t('You can list up to {n} dislikes.', { n: MAX_DISLIKES }));
      }
      setDislikes((l) => toggle(l, d));
    },
    toggleLike: (food: string) => {
      if (!likes.includes(food) && likes.length >= MAX_LIKES) {
        return Alert.alert(t('Too many foods'), t('You can list up to {n} foods you like.', { n: MAX_LIKES }));
      }
      setLikes((l) => toggle(l, food));
    },
    addLike: (food: string) => {
      const name = cleanEntry(food, MAX_ENTRY).replace(/^./, (ch) => ch.toUpperCase());
      if (!name) return;
      if (likes.some((x) => x.toLowerCase() === name.toLowerCase())) return;
      if (likes.length >= MAX_LIKES) {
        return Alert.alert(t('Too many foods'), t('You can list up to {n} foods you like.', { n: MAX_LIKES }));
      }
      setLikes((l) => (l.some((x) => x.toLowerCase() === name.toLowerCase()) ? l : [...l, name]));
    },
    toggleAppliance: (id: ApplianceId) =>
      setAppliances((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])),
    setRemindSunday: (on: boolean) => {
      setRemindSundayState(on);
      setSundayReminder(on, t('Plan your week'), t('Next week’s plan is ready when you are.')).then((ok) => !ok && setRemindSundayState(false));
    },
    recordConsent: async (kind: api.ConsentKind) => {
      if (!userId) return;
      await api.recordConsent(kind, kind === 'terms' ? TERMS_VERSION : undefined);
      // The server stamped the time; show the choice at once, then read the real value back.
      const now = new Date().toISOString();
      const field = { age: 'age', ai: 'ai', allergy: 'allergy', terms: null }[kind];
      if (field) setConsent((c) => ({ ...c, [field]: now }));
      api.loadConsents(userId).then((c) => c.available && setConsent(c)).catch(() => {});
    },
    skipAiConsent: async () => {
      if (!userId) return;
      setAiAskedState(true);
      await setAiAsked(userId, true);
    },
    revokeAiConsent: async () => {
      if (!userId) return;
      await api.revokeAiConsent();
      setConsent((c) => ({ ...c, ai: null }));
      setAiAskedState(true);
      await setAiAsked(userId, true);
    },
    retryProfileSave: () => setSaveNonce((n) => n + 1),
    signInWithProvider: (provider: api.OAuthProvider) => api.signInWithProvider(provider),
    signUpWithEmail: (email: string, password: string, name: api.PersonName) => api.signUpWithEmail(email, password, name),
    signInWithEmail: (email: string, password: string) => api.signInWithEmail(email, password),
    // Example mode only. Live sign-in goes through Apple, Google, or email.
    signIn: () => setDemoSignedIn(true),
    signOut: async () => {
      if (LIVE) {
        await api.signOut();
        clearLiveData();
      } else {
        setDemoSignedIn(false);
      }
    },
    deleteAccount: async () => {
      if (LIVE) {
        await api.deleteAccount();
        await api.signOut().catch(() => {});
        clearLiveData();
      } else {
        setDemoSignedIn(false);
      }
    },
    subscribe: () => setSubscribed(true),
    restorePurchases: async () => {
      const plus = await purchases.restore();
      setSubscribed(plus);
      return plus;
    },
    setPlanStatus,
    generatePlan: (keepLocked?: boolean) => {
      void generate(keepLocked);
    },
    plansUsed,
    lockedSlots,
    toggleLock: (slot: number) => setLockedSlots((l) => (l.includes(slot) ? l.filter((s) => s !== slot) : [...l, slot])),
    getRecipe: async (id: string, slot?: number) => {
      const planned = slot === undefined ? undefined : plan[slot];
      if (!LIVE) {
        const meal = planned ?? (Object.hasOwn(MEALS, id) ? MEALS[id] : undefined);
        if (!meal) return null;
        return { meal, detail: Object.hasOwn(RECIPES, meal.id) ? RECIPES[meal.id] : null };
      }
      const type = planned?.type ?? 'dinner';
      const view = await api.loadRecipe(planned?.id ?? id, people, pantry.flatMap((s) => s.items), type);
      return view && planned ? { ...view, meal: { ...view.meal, cost: planned.cost } } : view;
    },
    getSwapOptions: async (slot: number) => {
      const current = plan[slot];
      if (!current) return [];
      if (!LIVE) {
        // Only offer meals of the same type that the household has the equipment to cook.
        const fits = (id: string) => (RECIPES[id]?.appliances ?? []).every((a) => appliances.includes(a));
        return SWAP_POOL[current.type].filter((id) => id !== current.id && fits(id)).map((id) => MEALS[id]);
      }
      return api.mealOptions(current.type, [current.id]);
    },
    swapMeal: async (slot: number, meal: Meal) => {
      const current = plan[slot];
      if (!current) return;
      if (LIVE) {
        // Check the recipe against the household's allergies and diet before anything is written. If it can't be checked,
        // it isn't swapped in.
        const conflict = await api.swapConflict(meal.id, allergies, diet);
        if (conflict) {
          if (conflict.allergens.length > 0) {
            throw new Error(t('This recipe may contain {items}, which you avoid. Pick a different meal.', { items: conflict.allergens.join(comma()) }));
          }
          throw new Error(t('This recipe doesn’t fit the diet you chose. Pick a different meal.'));
        }
      }
      // Show the swap right away; when live, the saved week and list replace it a moment later.
      setPlan((p) => p.map((m) => (m.slot === slot ? { ...meal, day: m.day, dayLong: m.dayLong, slot, appliances: LIVE ? [] : RECIPES[meal.id]?.appliances ?? [] } : m)));
      if (!LIVE || !userId || !planId) return;
      try {
        await api.swapMeal(planId, slot, meal.id);
        await reloadWeek(userId, people);
      } catch (e) {
        setPlan((p) => p.map((m) => (m.slot === slot ? current : m)));
        throw e;
      }
    },
    toggleChecked: (key: string) => {
      const next = !checked[key];
      setChecked((c) => ({ ...c, [key]: next }));
      if (LIVE) {
        api.setChecked(key, next).catch(() => setChecked((c) => ({ ...c, [key]: !next })));
      }
    },
    saveRecipeEdit: async (recipeId, edit) => {
      if (!LIVE || !userId) return;
      if (edit) await api.saveEdit(recipeId, edit);
      else await api.resetEdit(recipeId);
      if (planId) {
        await api.refreshGroceryList(planId);
        await reloadWeek(userId, people);
      }
    },
    rateMeal: async (recipeId: string, stars: number) => {
      const before = ratings[recipeId];
      setRatings((r) => ({ ...r, [recipeId]: stars }));
      if (!LIVE || !userId) return;
      try {
        await api.rateMeal(userId, recipeId, stars);
      } catch (e) {
        setRatings((r) => {
          const next = { ...r };
          if (before === undefined) delete next[recipeId];
          else next[recipeId] = before;
          return next;
        });
        throw e;
      }
    },
    generateGroceries: async (shop) => {
      if (!LIVE) {
        setHasList(true);
        return [];
      }
      if (!planId || !userId) return [];
      const choice = shop?.map((s) => ({ day_of_week: Math.floor(s.slot / 3) + 1, meal_type: MEAL_TYPES[s.slot % 3], shop: s.shop }));
      const conflicts = await api.buildGroceryList(planId, choice);
      await reloadWeek(userId, people);
      haptic.success();
      trackEvent('grocery_list_built');
      return conflicts;
    },
    addLeftovers: async (recipeId: string, name: string, servings: number) => {
      if (!LIVE || !userId) {
        setLeftovers((l) => [{ id: `${Date.now()}`, recipeId, name, servings, cookedOn: new Date().toISOString().slice(0, 10) }, ...l]);
        return;
      }
      await api.addLeftovers(userId, recipeId, servings);
      setLeftovers(await api.loadLeftovers(userId));
    },
    removeLeftover: async (id: string) => {
      const before = leftovers;
      setLeftovers((l) => l.filter((x) => x.id !== id));
      if (!LIVE || !userId) return;
      try {
        await api.removeLeftover(id);
        if (planId) await reloadWeek(userId, people);
      } catch (e) {
        setLeftovers(before);
        throw e;
      }
    },
    assignLeftover: async (slot: number, leftoverId: string | null) => {
      if (!LIVE || !userId || !planId) {
        setPlan((p) => p.map((m) => (m.slot === slot ? { ...m, status: leftoverId ? 'leftover' : 'cook', leftoverId } : m)));
        return;
      }
      try {
        await api.assignLeftover(planId, slot, leftoverId);
        await reloadWeek(userId, people);
      } catch (e) {
        // Show what the database really holds, not the half-finished change.
        await reloadWeek(userId, people).catch(() => {});
        throw e;
      }
    },
    addPantryItem: (shelf: string, item: string) => {
      const exists = pantry.some((s) => s.items.some((i) => i.toLowerCase() === item.toLowerCase()));
      if (exists) return;
      setPantry((p) => p.map((s) => (s.name === shelf ? { ...s, items: [...s.items, item] } : s)));
      if (LIVE && userId) {
        api
          .addPantryItems(userId, [{ name: shelf, items: [item] }])
          .then(refreshListAfterPantryChange)
          .catch((e) => {
            console.warn('Adding to the pantry failed', e);
            // The insert was refused: take the optimistic item back off the shelf and say why.
            setPantry((p) => p.map((s) => (s.name === shelf ? { ...s, items: s.items.filter((x) => x !== item) } : s)));
            Alert.alert(t('Couldn’t add to the pantry'), pantryFailure(e) ?? t('Something went wrong. Try again.'));
          });
      }
    },
    removePantryItem: (shelf: string, item: string) => {
      setPantry((p) => p.map((s) => (s.name === shelf ? { ...s, items: s.items.filter((x) => x !== item) } : s)));
      if (LIVE && userId) {
        api
          .removePantryItem(userId, item)
          .then(refreshListAfterPantryChange)
          .catch((e) => console.warn('Removing from the pantry failed', e));
      }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
