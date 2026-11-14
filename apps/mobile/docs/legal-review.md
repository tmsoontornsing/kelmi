# Legal risk review (2026-11-14)

A liability pass over the Kelmi app, backend, website and store listing. This is a checklist to take to a licensed US attorney and a Thai attorney. It is not legal advice and does not replace them.

## Already in good shape

- Allergy, nutrition and price disclaimers: in the Terms, on screen before the first plan, on every recipe, and on the website. UI copy never promises allergen-free food.
- AI sharing is opt-in on its own screen, can be turned off in Settings, and sends no name or email.
- Age gate (13+) asks for a birth date with nothing pre-selected and remembers an under-13 answer.
- Terms acceptance is an unticked checkbox, recorded on the server with the version and time.
- Paywall shows Apple's and Google's required auto-renewal wording, price, trial length, and links to the Terms and Privacy Policy.
- Account deletion in the app and on the web, with a warning that it does not cancel a store subscription.
- Analytics are off by default, not linked to the account, and never include food details.

## Fixed in this change

| # | Risk | Fix |
|---|------|-----|
| 1 | Terms said "Kelmi is free... we do not charge for it" while the app sells Kelmi Plus. Selling an auto-renewing subscription without its terms in the contract breaks state auto-renewal laws (California's ARL and others) and invites deceptive-practice claims. | Terms section 4 rewritten: free plan limits, auto-renewal, trials, cancelling, refunds through Apple and Google, price changes, what happens when Plus ends, the 40-plans-a-month cap. |
| 2 | The company is Thai, so Thailand's PDPA applies to all of Kelmi's data. The Privacy Policy said Kelmi does not follow Thai law. | Privacy Policy names the data controller, its country and address, legal grounds for each use, PDPA rights, the right to complain to Thailand's PDPC, and how data moves between countries. |
| 3 | Allergies, food notes and halal reveal health and religion: "sensitive data" that needs explicit consent under the PDPA (s.26). There was only a safety acknowledgement. | The allergy notice is now also a consent screen ("I understand and agree"), separate from the Terms, recorded on the server, in all 8 languages. |
| 4 | RevenueCat (subscriptions) received every signed-in user's ID and device details but was not in the Privacy Policy, and its record survived account deletion. | Disclosed in the Privacy Policy and Terms. `delete-account` now deletes the RevenueCat customer too (needs `REVENUECAT_SECRET_KEY`). |
| 5 | No governing law: `[STATE]` / `[COUNTY]` placeholders. | Delaware law, New Castle County courts, small claims in the user's own county, and a line keeping the user's home-state consumer protections (which makes the clause more enforceable). |
| 6 | California Civil Code 1789.3 requires paid services to give California users the provider's name and address and the state's consumer complaint unit. | Added to Terms section 16. |
| 7 | Minors could buy Plus with no rule against it. | Terms: under-18s need a parent's or guardian's permission to buy Plus. |
| 8 | Paywall headline "Plan every week, stay under budget", "Meals inside your budget", "keep each week under budget", "what Kelmi has saved you": implied promises about money. | Reworded to "around your budget" and "estimated savings", in all 8 languages (the old Chinese and Japanese translations promised not to overspend). |
| 9 | Website, sitemap, structured data, waitlist and store listing pointed at usekavi.com, not the domain you own (usekelmi.com). The store privacy URL would have been wrong. | All moved to usekelmi.com. |
| 10 | Website FAQ and deletion page said "Kelmi is free today / paid plans may come later". | Updated to describe Kelmi Plus. |
| 11 | iOS privacy manifest listed entries twice and left out name, purchase history and usage counts. | Deduplicated; Name, Purchase History and Product Interaction (analytics, not linked) added. |
| 12 | Open-source credits missed five MIT packages (RevenueCat, PostHog, Google Sign-In, date picker, aes-js). | Added. |
| 13 | No statement on which language controls. | English controls where a translation differs. |

`TERMS_VERSION` is now `2026-11-14`.

## What you still need to do

Release is blocked (`node scripts/legal-gate.mjs` fails) until item 1 is done.

1. **Registered address.** Put the company's registered address, as on its DBD certificate, in `address` in `src/legal/config.ts`, then run `node scripts/build-legal.mjs`.
2. **Effective date.** Set `effective` in `src/legal/config.ts` to the real publication date.
3. **Secrets.** Set `REVENUECAT_SECRET_KEY` in Supabase secrets, using the narrowest secret key RevenueCat offers. Then delete a test account that bought in the sandbox before signing in, and check that its RevenueCat customer and any `$RCAnonymousID` alias are both gone. A failed deletion is only logged (`revenuecat_delete_failed`) and not retried. Clear those customers by hand, or add a retry table later.
4. **Sign in with Apple token revocation.** Apple requires apps to revoke the Apple token when an account is deleted (guideline 5.1.1(v)). `delete-account` cannot do it yet; see the note at the top of that file. This can get the app rejected.
5. **Store privacy forms.** In App Store Connect and Google Play Data safety, declare: email, name, user ID, health (diet and allergies), other user content, purchase history (linked, app functionality), and product interaction (not linked, analytics, optional). Add Kelmi Plus as auto-renewable in-app purchases in both stores.
6. **Check billing works** end to end before release. `src/lib/flags.ts` has `PLUS_ENABLED = true`, but its comment still says billing is not wired up. Selling something that does not deliver is the fastest route to refunds and complaints.
7. **Data processing agreements** with Supabase, RevenueCat, PostHog, Anthropic and IDUnify AI. The policy says Anthropic's and IDUnify's retention and training terms are not confirmed. Confirm them, and whether IDUnify AI stores or trains on prompts, then update section 4 of the Privacy Policy.
8. **Trademark.** Search USPTO and the Thai DIP for "Kelmi" before spending on branding. "Kelmio" is a food inventory app on the App Store.

## Questions for the lawyers

- **Thai attorney:**
  - Is the in-app consent timing enough? The household profile reaches the server at sign-up, before the consent screen (shown before the first plan). The strictest reading puts consent before collection. Moving it means a separate checkbox at sign-up, shown when the profile has allergies, diet or notes.
  - Do you need a Data Protection Officer? PDPA s.41 requires one when processing sensitive data at scale is a core activity.
  - Under the PDPA, people under 20 are minors. Is consent from users aged 13 to 19 valid without a parent?
  - Is the cross-border wording right (data in the US, managed from Thailand)?
  - Does PDPC breach notice (72 hours) need an internal process now?
- **US attorney:**
  - California's 2025 auto-renewal amendments (AB 2863): annual reminder notices and consent rules for app-store billing.
  - Is the arbitration clause enforceable against a foreign company? Should it add mass-arbitration batching?
  - Is a one-year time limit on claims allowed in key states?
  - Washington My Health My Data Act: does the in-app consent meet its "separate consent" standard?
  - Is any registration needed for a Thai entity selling to US consumers through the app stores?
