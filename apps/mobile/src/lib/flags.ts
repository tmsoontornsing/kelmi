// Launch switches. Flip one to true only when the thing behind it is real.

// Kelmi Plus. Billing (RevenueCat and Stripe) is not wired up, so nothing may sell or imply a subscription yet. While this is
// false the Plus screens redirect away and every price, upgrade button, restore row and "part of Kelmi Plus" lock is hidden.
// The code stays so it can be switched back on when purchases work.
export const PLUS_ENABLED = false;

// A/B tests write to experiment_events in Supabase. Off until the privacy policy covers them and there is something to test.
export const EXPERIMENTS_ENABLED = false;

// Features that only need the phone (Cook mode, swapping a meal, sending the list, the full nutrition label) are open to
// everyone while Plus is hidden, because a lock with no way to unlock it is a dead end. Once Plus is enabled they follow
// the subscription again.
export const onDeviceUnlocked = (subscribed: boolean) => !PLUS_ENABLED || subscribed;

// Features the server charges for (keeping meals when planning again, editing recipes) stay hidden until Plus is real.
export const serverPlusUnlocked = (subscribed: boolean) => PLUS_ENABLED && subscribed;
