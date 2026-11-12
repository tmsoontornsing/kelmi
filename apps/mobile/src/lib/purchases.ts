import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { supabase } from './supabase';

// RevenueCat, the in-app subscription layer for Apple and Google Play. The app does not ship RevenueCat's SDK key: the
// backend hands it out after sign-in (the app-config function), so it is not inside the download. The webhook secret lives
// in Supabase only.

// Must match the entitlement identifier in the RevenueCat dashboard.
export const PLUS_ENTITLEMENT = 'plus';

// Whether this build can sell Plus at all: a store platform, and a backend to ask for the key. Whether purchases are
// actually set up depends on the backend having a key for the platform; see isConfigured().
export const purchasesAvailable = (Platform.OS === 'ios' || Platform.OS === 'android') && Boolean(supabase);

export type PlanId = 'annual' | 'monthly';

let configured = false;
let configuring: Promise<boolean> | null = null;
let loggedInAs: string | null = null;
const plusListeners = new Set<(plus: boolean) => void>();

export const isPlus = (info: CustomerInfo) => Boolean(info.entitlements.active[PLUS_ENTITLEMENT]);

// True once RevenueCat has been given its key and started.
export const isConfigured = () => configured;

// Asks the backend for this platform's key. Only a signed-in person gets one, so null also means "not signed in yet".
async function fetchKey(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('app-config', { method: 'POST', body: {} });
  if (error) return null;
  const key = Platform.select({ ios: data?.revenuecat?.ios, android: data?.revenuecat?.android });
  return typeof key === 'string' && key ? key : null;
}

// Starts RevenueCat the first time it is needed, once the backend has handed over the key. Safe to call from several places
// at once: they all wait for the same attempt, and a failed attempt can be tried again later.
function configure(): Promise<boolean> {
  if (configured) return Promise.resolve(true);
  configuring ??= (async () => {
    try {
      const apiKey = await fetchKey();
      if (!apiKey) return false;
      if (__DEV__) {
        // The SDK reports a missing offering with console.error, which pops a red screen in development even though the
        // app copes (the paywall falls back to no packages). Send its logs to console.warn instead.
        Purchases.setLogHandler((_level, message) => console.warn(`[RevenueCat] ${message}`));
        Purchases.setLogLevel(LOG_LEVEL.WARN);
      }
      Purchases.configure({ apiKey });
      // One listener for the whole app; screens add and remove themselves through onPlusChange.
      Purchases.addCustomerInfoUpdateListener((info) => plusListeners.forEach((l) => l(isPlus(info))));
      configured = true;
      return true;
    } catch {
      return false;
    } finally {
      configuring = null;
    }
  })();
  return configuring;
}

// Tie purchases to the Supabase user, so a subscription follows the account across devices and the webhook can find
// the user. Pass null on sign-out. Returns the current customer info, or null when billing isn't set up (or nobody is signed
// in yet, which is when the key cannot be fetched).
export async function syncPurchasesUser(userId: string | null): Promise<CustomerInfo | null> {
  if (!userId && !configured) return null;
  if (!(await configure())) return null;
  if (userId === loggedInAs) return Purchases.getCustomerInfo();
  loggedInAs = userId;
  if (userId) return (await Purchases.logIn(userId)).customerInfo;
  if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  return Purchases.getCustomerInfo();
}

// Calls back whenever the subscription changes (a purchase, a renewal, an expiry, a restore on another device).
export function onPlusChange(listener: (plus: boolean) => void): () => void {
  plusListeners.add(listener);
  return () => {
    plusListeners.delete(listener);
  };
}

// The store's own localized packages from the current offering, keyed by our plan ids.
export async function loadPackages(): Promise<Partial<Record<PlanId, PurchasesPackage>>> {
  if (!(await configure())) return {};
  const current = (await Purchases.getOfferings()).current;
  const out: Partial<Record<PlanId, PurchasesPackage>> = {};
  if (current?.annual) out.annual = current.annual;
  if (current?.monthly) out.monthly = current.monthly;
  return out;
}

// True when the purchase made them a subscriber, false when they backed out of the store sheet.
export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return isPlus(customerInfo);
  } catch (e) {
    const err = e as { userCancelled?: boolean; code?: string };
    if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw e;
  }
}

export async function restore(): Promise<boolean> {
  if (!(await configure())) throw new Error('Purchases are not set up');
  return isPlus(await Purchases.restorePurchases());
}
