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
