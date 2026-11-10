import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

// RevenueCat, the in-app subscription layer for Apple and Google Play. The public SDK keys are safe to ship
// (they only identify the app); the webhook secret lives in Supabase only.
const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

// Must match the entitlement identifier in the RevenueCat dashboard.
export const PLUS_ENTITLEMENT = 'plus';

export const purchasesAvailable = Boolean(apiKey);

export type PlanId = 'annual' | 'monthly';

let configured = false;
let loggedInAs: string | null = null;

export const isPlus = (info: CustomerInfo) => Boolean(info.entitlements.active[PLUS_ENTITLEMENT]);

function configure() {
  if (configured) return true;
  if (!apiKey) return false;
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey });
  configured = true;
  return true;
}

// Tie purchases to the Supabase user, so a subscription follows the account across devices and the webhook can find
// the user. Pass null on sign-out. Returns the current customer info, or null when billing isn't set up.
export async function syncPurchasesUser(userId: string | null): Promise<CustomerInfo | null> {
  if (!configure()) return null;
  if (userId === loggedInAs) return Purchases.getCustomerInfo();
  loggedInAs = userId;
  if (userId) return (await Purchases.logIn(userId)).customerInfo;
  if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  return Purchases.getCustomerInfo();
}

// Calls back whenever the subscription changes (a purchase, a renewal, an expiry, a restore on another device).
export function onPlusChange(listener: (plus: boolean) => void): () => void {
  if (!configure()) return () => {};
  const handler = (info: CustomerInfo) => listener(isPlus(info));
  Purchases.addCustomerInfoUpdateListener(handler);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(handler);
  };
}

// The store's own localized packages from the current offering, keyed by our plan ids.
export async function loadPackages(): Promise<Partial<Record<PlanId, PurchasesPackage>>> {
  if (!configure()) return {};
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
  if (!configure()) throw new Error('Purchases are not set up');
  return isPlus(await Purchases.restorePurchases());
}
