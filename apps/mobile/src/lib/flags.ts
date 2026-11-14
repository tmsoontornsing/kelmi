// Launch switches. Flip one to true only when the thing behind it is real.

// Kelmi Plus, sold through Apple and Google via RevenueCat (src/lib/purchases.ts). Keep this true only while the store
// products, the RevenueCat keys (REVENUECAT_IOS_KEY / REVENUECAT_ANDROID_KEY) and the webhook are live and a sandbox purchase
// has been tested end to end: the Terms (section 4) describe Plus as on sale. While false the Plus screens redirect away and
// every price, upgrade button, restore row and "part of Kelmi Plus" lock is hidden.
export const PLUS_ENABLED = true;

// A/B tests write to experiment_events in Supabase. Off until the privacy policy covers them (it lists only the three usage
// counts today, not the paywall events) and there is something to test.
export const EXPERIMENTS_ENABLED = false;

// Anonymous usage counts (src/lib/analytics.ts). ANALYTICS_ENABLED shows the Settings switch and allows collection at all.
// ANALYTICS_DEFAULT_ON is what a person gets before they choose: false means nothing is recorded until they switch it on.
// The privacy policy (src/legal/documents.ts, "Usage counts") is written for either value; change both together if you flip it.
export const ANALYTICS_ENABLED = true;
export const ANALYTICS_DEFAULT_ON = false;

// Features that only need the phone (Cook mode, swapping a meal, sending the list, the full nutrition label) are open to
// everyone while Plus is hidden, because a lock with no way to unlock it is a dead end. Once Plus is enabled they follow
// the subscription again.
export const onDeviceUnlocked = (subscribed: boolean) => !PLUS_ENABLED || subscribed;

// Features the server charges for (keeping meals when planning again, editing recipes) stay hidden until Plus is real.
export const serverPlusUnlocked = (subscribed: boolean) => PLUS_ENABLED && subscribed;
