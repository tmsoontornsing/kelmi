# Kelmi Plus: what it includes

Status: **defined in the app but switched off.** `PLUS_ENABLED` in `apps/mobile/src/lib/flags.ts` is `false` because billing
(RevenueCat / store subscriptions) is not wired up yet. While it is off, the Plus screens redirect away and every price,
upgrade button and "Plus" lock label is hidden.

## Free vs Plus

| | Free | Plus |
|---|---|---|
| Weekly plans per month | 3 | up to 40 (a new plan every week) |
| Meals inside your budget | yes | yes |
| Diet and allergy filters | yes | yes |
| Foods you like | yes | yes |
| Kitchen-aware recipes | yes | yes |
| Calories on every recipe | yes | yes |
| Grocery list that skips your pantry | yes | yes |
| Swap any meal, budget and list update | | yes |
| Keep meals you love, re-plan the rest | | yes |
| Cook mode with step timers | | yes |
| Edit any recipe | | yes |
| Savings report | | yes |
| Send the list to anyone, or to Reminders | | yes |
| Full nutrition on every recipe | | yes |
| Unlimited pantry items | | yes |

Numbers live in `apps/mobile/src/lib/limits.ts` (`FREE_PLANS_PER_MONTH`, `PLUS_PLANS_PER_MONTH`). The server enforces them
(`supabase/functions/_shared/plan-logic.ts`), so keep the two in step.

## Price (as shown in the app)

About $59 a year, shown as roughly $4.92 a month, billed yearly. Cancel any time in the App Store or Google Play settings.

## Open items before Plus can launch

- Create the RevenueCat products, offering and entitlement, and the matching App Store / Google Play subscriptions.
- Turn `PLUS_ENABLED` on only once purchases and restore actually work.
- Decide whether any free feature is too generous to give people a reason to upgrade (for example calories on every
  recipe). Better decided from real usage than guessed. The A/B test switch (`EXPERIMENTS_ENABLED`) is off for now.
- The privacy policy must cover any paywall analytics before experiments are turned on.

## Free trial

Recommendation: a **3-day free trial on the yearly plan only**, none on monthly. (Set up in App Store Connect on 2026-11-13: free for the first 3 days, United States, no end date. You chose 3 days over the 7 I first suggested.)

- The free plan already gives 3 plans a month, so people can try Kelmi without a card. A trial on top mainly helps the
  person who hit the 3-plan limit and wants to see a full month before paying about $59 for the year.
- Three days is short enough that fewer people forget to cancel; if people don't reach the "aha" moment in three days, consider a longer trial.
- No trial on monthly keeps the yearly plan the obviously better deal.
- Review it after launch with real data (trial starts, trial-to-paid rate, refunds) before changing it.

How it works in the app: the trial is configured in the store (an introductory offer with a free period), not in the app.
`freeTrialOf()` in `src/lib/purchases.ts` reads it from the RevenueCat package, so the paywall then shows "Start free trial",
"3 days free, then $X per year", and the trial renewal wording Apple requires. With no trial in the store, the paywall is
unchanged. Changing the trial length later needs no app update.

## What is built, and what is left

Built in the app and on the server: purchases (`src/lib/purchases.ts`), the paywall and Plus screens, the RevenueCat webhook
(`supabase/functions/revenuecat-webhook`), server-enforced plan limits, and a gate on every Plus feature in the table above.

Left, all outside the code (each needs your accounts):

1. **App Store Connect:** create the subscription group and the yearly (and monthly) auto-renewing subscriptions; add the
   3-day free introductory offer to the yearly one (done); fill in the subscription review details and screenshot.
2. **Google Play:** same products, if Android ships.
3. **RevenueCat:** create the project and the iOS (and Android) apps; import the products; create the entitlement `plus`
   (the id the app expects), an offering marked current with Annual and Monthly packages; add the webhook pointing at the
   `revenuecat-webhook` function.
4. **Supabase secrets:** the RevenueCat public SDK key per platform (handed to the app by `app-config`) and the webhook secret.
5. **Test with a sandbox account** on a TestFlight build: buy, trial start, restore, cancel, expiry; confirm the server
   shows the account as Plus afterwards.
6. **Then** set `PLUS_ENABLED = true` in `src/lib/flags.ts`, update the privacy form if needed, and ship a build.

Do not set `PLUS_ENABLED` before step 5 passes: it makes every price and upgrade button visible.
