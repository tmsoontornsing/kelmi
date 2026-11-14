// Kelmi's Terms of Service, Privacy Policy and Consumer Health Data Privacy Policy. This file is the one source: the app
// renders it on the legal screens, and scripts/build-legal.mjs writes the same text to legal/*.md and apps/web/content/*.md.
//
// DRAFT: written to match how Kelmi works at launch (United States only, ages 13 and up, a free plan plus the optional
// Kelmi Plus subscription sold through Apple and Google, run by a company registered in Thailand), not reviewed by a
// lawyer. Have a US attorney and a Thai attorney review it before release, and update it whenever Kelmi starts collecting
// something new, uses a new service provider, or changes what it charges.

import { LEGAL } from './config';

export type Block = { h: string } | { p: string } | { list: string[] };
export type LegalDoc = { id: 'terms' | 'privacy' | 'consumer-health-data'; title: string; blocks: Block[] };

const L = LEGAL;

// The wording of the in-app screen that asks before anything goes to an AI provider. Keep this identical to the app.
const AI_SCREEN =
  'To pick your meals, Kelmi sends your household size, budget, allergies, diet, likes, dislikes and food notes to an AI provider (Anthropic or IDUnify AI). It does not send your name or email. You can say no and Kelmi will use its built-in planner instead.';

export const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Terms of Service',
  blocks: [
    { p: `Effective ${L.effective}` },
    {
      p: `These Terms of Service ("Terms") are an agreement between you and ${L.company}, a company registered in ${L.country} ("${L.company}", "we", "us"), about your use of the Kelmi app and related services (together, "Kelmi"). By creating an account or using Kelmi, you agree to these Terms and acknowledge our Privacy Policy and Consumer Health Data Privacy Policy. If you do not agree, do not use Kelmi.`,
    },
    {
      p: 'Please read section 3 (food, allergies and health) and section 14 (disputes) carefully. To the extent the law allows, section 14 requires most disputes to be resolved by individual arbitration instead of in court, and waives class actions, unless you opt out within 30 days.',
    },

    { h: '1. Who can use Kelmi' },
    {
      p: 'Kelmi is offered only in the United States, and only to people who are at least 13 years old. By using Kelmi you confirm that you are 13 or older and located in the United States. Do not use Kelmi if you are under 13, if you are outside the United States, or if the law forbids you from using it. If you are under 18, you should use Kelmi only with the permission of a parent or guardian, and you must not buy Kelmi Plus without that parent or guardian\'s permission. That is a requirement on you: Kelmi does not check for or collect that permission. Apple and Google offer parents tools, such as Ask to Buy and purchase approvals, to control purchases. If you are under 18, you may have rights under your state\'s law, including rights to cancel certain contracts, that these Terms do not take away. We may end accounts that we believe do not meet these rules.',
    },

    { h: '2. Your account' },
    {
      p: 'You can sign in with Apple, Google, or an email address and password. Give accurate information, keep your sign-in details secure, and tell us promptly if you think someone else has used your account. You are responsible for activity on your account.',
    },

    { h: '3. What Kelmi is, and what it is not' },
    {
      p: 'Kelmi suggests weekly meal plans, recipes, grocery lists, price estimates and nutrition estimates based on what you tell it. It is a planning tool. Please read these limits; they matter for your safety.',
    },
    {
      list: [
        'Allergies and food restrictions. The allergy filter is a helper, not a guarantee. Kelmi tries to leave out recipes that contain the foods you list, using tags on each recipe and ingredient. Those tags can be incomplete or wrong. Kelmi\'s allergy list does not cover every allergen. Store-bought products differ by brand, can change their recipe without notice, can contain hidden ingredients, and can be made alongside allergens. Kelmi cannot promise that any recipe or ingredient is free of an allergen. Always read every product label yourself. If you or anyone you cook for has a food allergy, especially a severe one, check every ingredient yourself before you buy, cook, or serve it, and talk to a doctor or allergist about how to manage it. Do not rely on Kelmi for a food allergy or any medical need.',
        'Not medical or nutrition advice. Nutrition figures are estimates calculated from typical values for each ingredient, not lab measurements, and actual amounts vary with brands, portion sizes and cooking. Kelmi does not diagnose, treat, or manage any medical condition. Talk to a doctor or registered dietitian before relying on Kelmi if you are pregnant or nursing, have diabetes, kidney or heart disease, an eating disorder, or any condition affected by what you eat, or if you are planning meals for an infant.',
        'Diet and religious labels. Labels such as halal, vegetarian, vegan, or gluten-free describe how a recipe is meant to be made. Kelmi does not certify food. Buy products certified to the standard you follow.',
        'Prices and budgets. Prices are estimated from average US prices and are not quotes from any store. What you pay depends on your store, location, brands and the date. Kelmi does not promise that you will spend a particular amount or stay within your budget.',
        'Food safety. Follow safe food handling: wash hands and produce, keep raw meat separate, refrigerate promptly, and cook food to safe internal temperatures (for example, 165°F for poultry). Recipe times are estimates. Use care with knives, heat and appliances, and supervise anyone who is learning to cook.',
        'Automated suggestions. Meal plans may be created by software, including artificial intelligence services if you allow them, and can contain mistakes. Use your own judgment.',
      ],
    },

    { h: '4. Free plan, Kelmi Plus, and billing' },
    {
      p: 'Kelmi has a free plan and an optional paid subscription, Kelmi Plus. The free plan includes three meal plans a month and up to 20 pantry items. Kelmi Plus adds the features described in the app, and includes up to 40 meal plans a month so the service cannot be abused. You never have to buy Kelmi Plus to use the free plan.',
    },
    {
      list: [
        'Buying. Kelmi Plus is sold only through the Apple App Store or Google Play, using your Apple or Google account. The app shows the price, billing period, and any free trial before you buy, and nothing is charged unless you confirm the purchase in Apple\'s or Google\'s purchase screen. Apple or Google, not us, take the payment, and their terms for purchases also apply.',
        'Automatic renewal. Kelmi Plus is a subscription that renews automatically at the end of each billing period (monthly or yearly, as you chose), at the price then in effect, and your Apple or Google account is charged for each renewal, until you cancel. To avoid being charged for the next period, cancel at least 24 hours before the current period ends.',
        'Free trials. If you start a free trial, it turns into a paid subscription and you are charged when the trial ends, unless you cancel at least 24 hours before it ends. A trial is offered once per person, as Apple or Google decide.',
        'Cancelling. You can cancel any time in your App Store account settings (iPhone: Settings, your name, Subscriptions) or in Google Play (Payments and subscriptions). Kelmi also links there from Settings. After you cancel, Kelmi Plus stays on until the end of the period you have paid for, then your account moves to the free plan. Deleting the app or your Kelmi account does not cancel a subscription; you must cancel it with Apple or Google.',
        'Refunds. Payments are handled by Apple or Google, so refunds are decided by them under their own refund policies, and you request them from Apple (reportaproblem.apple.com) or Google Play. We cannot issue refunds for store purchases ourselves. Except where the law requires otherwise, we do not give refunds or credits for partial periods. Nothing here limits any right to a refund you have under the law of your state.',
        'Price changes. We may change the price of Kelmi Plus. A new price will not apply to a period you have already paid for. If the price of your subscription goes up, Apple or Google will tell you before it takes effect and, where the store or the law requires, ask you to agree to it; if you do not want to pay the new price, cancel before it applies.',
        'When Plus ends. If your subscription ends, Plus features turn off. You can still see and delete what you made with them (such as your edited recipes), but adding more is limited to the free plan.',
        'If we stop offering Plus. If we stop offering Kelmi Plus or end Kelmi, we will stop renewals and tell you in advance, and you can ask Apple or Google about a refund for any unused paid period.',
      ],
    },
    {
      p: 'We may change what the free plan or Kelmi Plus includes, or their limits. If a change takes away something material that you are paying for, we will tell you in advance, and it will not apply until your next billing period, so you can cancel first (see section 9).',
    },

    { h: '5. Acceptable use' },
    { p: 'You agree not to:' },
    {
      list: [
        'break any law, or use Kelmi to harm, harass, or deceive anyone;',
        'access accounts or data that are not yours, or test, probe, or break our security;',
        'copy, scrape, resell, or redistribute Kelmi or its recipes, prices, or nutrition data in bulk, or use them to build a competing product or to train machine learning models;',
        'reverse engineer the app, except where the law allows despite this limit;',
        'overload or interfere with Kelmi, including through bots or automated access.',
      ],
    },

    { h: '6. Your information and content' },
    {
      p: 'You keep ownership of what you enter, such as your pantry items, foods you like, and household details. You give us permission to store, process, and display it only as needed to run Kelmi for you, as described in the Privacy Policy. If you send us feedback or ideas, we may use them without any obligation to you.',
    },

    { h: '7. Our content' },
    {
      p: 'Kelmi\'s software, design, Pip the mascot, recipes, text, and data are protected by intellectual property laws. The recipes and text in Kelmi are written by or for us, and you may not copy, republish, or sell them except as these Terms allow. Some elements, such as open-source software and fonts, are licensed to us by others under their own terms. We give you a personal, limited, non-exclusive, non-transferable, revocable license to use the app on devices you own or control, for your own non-commercial use, under these Terms.',
    },

    { h: '8. Third-party services' },
    {
      p: 'Kelmi relies on services from other companies, such as Apple and Google for sign-in and payments, RevenueCat to keep track of subscriptions, AI providers (only if you allow them, see the Privacy Policy), and cloud providers for hosting. Their own terms and privacy policies apply to your use of their services. We are not responsible for services we do not control. Links to other websites are for convenience only.',
    },
    {
      p: 'Maps and stores. Kelmi has a button that opens your phone\'s maps app (Apple Maps or Google Maps) with a search for grocery stores. The maps app, and the stores it shows, are not ours. We do not choose, check, or endorse the results, and we do not promise that any store exists, is open, is nearby, is safe to visit, has the products you want, or charges the prices Kelmi estimates. Check hours and availability yourself before you go, take care when traveling, and follow local laws, including when driving. We are not responsible for travel, purchases, or products you buy at any store, or for anything that happens there.',
    },

    { h: '9. Changes to Kelmi and to these Terms' },
    {
      p: 'We may add, change, or remove features. We may update these Terms. If a change is material, we will tell you in the app or by email before it takes effect. Continuing to use Kelmi after the change takes effect means you accept the updated Terms. If you do not agree, stop using Kelmi and delete your account.',
    },

    { h: '10. Ending your use' },
    {
      p: 'You can stop using Kelmi and delete your account at any time in Settings. We may suspend or end your access if you break these Terms, if we must for legal reasons, or if we stop offering Kelmi. Sections that by their nature should continue, including 3, 6 through 8, and 11 through 16, continue after your access ends.',
    },

    { h: '11. Disclaimer of warranties' },
    {
      p: 'Kelmi is provided "as is" and "as available". To the fullest extent the law allows, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, title, non-infringement, and accuracy. We do not promise that Kelmi will be uninterrupted, error-free, or secure, or that recipes, allergen tags, prices, or nutrition information are accurate, complete, or suitable for you. Some places do not allow these exclusions, so some may not apply to you. Store hours, locations, distances, and prices come from other companies or are estimates, and we do not verify them.',
    },

    { h: '12. Limitation of liability' },
    {
      p: `To the fullest extent the law allows, ${L.company} and its owners, employees, and suppliers will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, data, or goodwill, arising from or related to Kelmi or these Terms, even if we were told they were possible. To the extent the law allows, our total liability for all claims relating to Kelmi or these Terms is limited to the greater of the amount you paid us for Kelmi in the 12 months before the claim arose, or US $50.`,
    },
    {
      p: 'Nothing in these Terms excludes or limits any liability that cannot lawfully be excluded or limited. That includes liability for fraud or willful misconduct, and liability for death or personal injury caused by negligence where the law does not allow it to be limited. If your state does not allow some of the limits above, they apply only as far as your state allows.',
    },

    { h: '13. Indemnity' },
    {
      p: `To the extent the law allows, you agree to defend and indemnify ${L.company} against third-party claims, losses, and costs (including reasonable legal fees) to the extent they arise from your breach of these Terms, your violation of law, or your misuse of Kelmi. You do not have to cover any claim, loss, or cost to the extent it is caused by our own errors, negligence, or misconduct, including mistakes in Kelmi's recipes, tags, or suggestions.`,
    },

    { h: '14. Resolving disputes' },
    {
      list: [
        `Talk to us first. Before filing a claim, contact us at ${L.email} and describe the problem and what you want. We will try to resolve it within 60 days.`,
        'Arbitration. If we cannot resolve it, you and we agree to resolve any dispute arising from or relating to Kelmi or these Terms by binding individual arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules, instead of in court. The Federal Arbitration Act governs this section. The arbitrator may award the same individual relief a court could. We will pay arbitration filing and arbitrator fees beyond what you would pay to file in court, unless the arbitrator finds your claim frivolous.',
        'Exceptions. Either side may bring an individual claim in small claims court, or ask a court to stop infringement of intellectual property.',
        'No class actions. Claims may be brought only on an individual basis, not as a plaintiff or class member in any class, consolidated, or representative action. If this waiver is found unenforceable for a claim, that claim proceeds in court, not in arbitration.',
        // The opt-out only works if LEGAL.email is a real, monitored address. See docs/legal-review.md.
        `Opting out. You can opt out of arbitration within 30 days of first accepting these Terms by emailing ${L.email} with your name, the email on your account, and a clear statement that you opt out of arbitration.`,
        `Governing law and courts. These Terms are governed by the laws of the State of ${L.state}, without regard to conflict of law rules, except that the Federal Arbitration Act governs this section. This choice of law does not take away any protection you have under the mandatory consumer protection laws of the state where you live. Any claim not subject to arbitration, other than a small claims case, which you may bring in your own county, will be heard only in the state or federal courts located in ${L.county}, ${L.state}, and you and we consent to their jurisdiction.`,
        'Time limit. To the extent the law allows, any claim must be brought within one year after it arose, or it is permanently barred.',
      ],
    },

    { h: '15. App Store terms' },
    {
      p: 'If you got Kelmi from the Apple App Store, these Terms are between you and us, not Apple. Apple is not responsible for Kelmi or its content, has no obligation to provide maintenance or support, and is not responsible for any claims relating to Kelmi, including product liability claims, claims that Kelmi fails to meet a legal or regulatory requirement, consumer protection or privacy claims, or claims that Kelmi infringes someone else\'s intellectual property. We, not Apple, are responsible for investigating and resolving those claims. If Kelmi fails to meet a warranty that applies, you may notify Apple and Apple will refund the purchase price, if any; Apple has no other warranty obligation. You confirm that you are not in a country subject to a US government embargo or listed on a US government list of prohibited or restricted parties. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you. Your use must also follow the App Store Terms of Service.',
    },

    { h: '16. General' },
    {
      p: 'These Terms, the Privacy Policy and the Consumer Health Data Privacy Policy are the whole agreement between you and us about Kelmi. If any part is unenforceable, the rest stays in effect. Our not enforcing a right is not a waiver of it. You may not transfer these Terms; we may transfer them in connection with a merger, acquisition, or sale of assets. Neither side is liable for delays caused by events beyond its reasonable control. These Terms are written in English; if a translation differs, the English version controls, to the extent the law allows.',
    },
    {
      p: `Notice to California residents. Under California Civil Code section 1789.3: Kelmi is provided by ${L.company}, ${L.address}, ${L.email}. The free plan costs nothing; Kelmi Plus costs the price shown in the app before you buy. To resolve a complaint about Kelmi, contact us at ${L.email}. You may also contact the Complaint Assistance Unit of the Division of Consumer Services of the California Department of Consumer Affairs in writing at 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834, or by telephone at (916) 445-1254 or (800) 952-5210.`,
    },

    { h: '17. Contact' },
    { p: `${L.company}\n${L.address}\n${L.email}` },
  ],
};

export const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  blocks: [
    { p: `Effective ${L.effective}` },
    {
      p: `This Privacy Policy explains what information ${L.company} ("we", "us") collects through the Kelmi app, the usekelmi.com website and related services ("Kelmi"), how we use and share it, and the choices and rights you have. Kelmi is offered only in the United States and only to people 13 or older. Our Consumer Health Data Privacy Policy gives more detail about the diet and allergy information you enter.`,
    },
    {
      p: `Who is responsible. ${L.company}, a company registered in ${L.country}, at ${L.address}, decides how your information is used and is responsible for it (the "data controller" under Thailand's Personal Data Protection Act B.E. 2562, the "PDPA"). For any privacy question or request, contact us at ${L.email}.`,
    },

    { h: '1. Information you give us' },
    {
      list: [
        'Account. Your email address, and your full name and password if you sign up with email (we store only a secure hash of the password). We keep your name with your account and do not send it to the AI providers. If you sign in with Apple or Google, we receive your email address (Apple may give us a private relay address instead) and a user ID, and Google may also share your name and profile picture.',
        'Household profile. How many people you cook for, your weekly grocery budget, your diet (for example vegetarian or halal), allergies, foods you dislike, foods you like, your goal and meat preference, any food notes you type in Settings (for example “low sugar”), and the kitchen equipment you have.',
        'Your lists. Pantry items, meal plans, meals you swap, which meals you choose to shop for (and which you skip, like nights eating out), grocery lists and what you check off, leftover meals and how many servings are left, and steps you mark done.',
        'Recipe edits. If you change a recipe, Kelmi saves your own version to your account: the amounts you changed, ingredients you left out, steps you rewrote, and any note you add. The original recipe is not changed.',
        'Meal ratings. The stars you give a meal after cooking it, kept private to your account. If you share a meal, Kelmi draws a picture on your phone with the dish name, your stars and the Kelmi name, and hands it to your phone\'s share sheet. It contains nothing about you, and Kelmi does not see where you send it.',
        'Purchases (only if you buy Kelmi Plus). Which plan you bought, whether it is in a free trial, active, cancelled or expired, when it renews or ends, the store (Apple or Google), and the store\'s transaction identifiers. This comes from Apple or Google through RevenueCat (see section 6), which also checks for a subscription each time you sign in. We never receive your card or bank details; Apple or Google keep those.',
        'Preferences. Settings such as reminder and notification choices.',
        'Reminders (only if you choose "Add list to Reminders" on iPhone). Kelmi asks for permission to use Reminders, then adds your grocery items to a list named Kelmi Groceries. Kelmi reads only that list, to avoid adding an item twice, and never reads your other reminders. Those reminders live on your device and in your Apple account, under Apple\'s privacy practices; they are not sent to us. You can turn the permission off in iPhone Settings.',
        'Stores near you (only if you tap the location button on the grocery list). Kelmi asks you to confirm, then opens your phone\'s maps app (Apple Maps or Google Maps) with a search for grocery stores. Kelmi does not ask for, read, or store your location, and does not send it anywhere. Your maps app uses your location under its own privacy policy and your phone\'s location settings.',
        'Support. What you send us when you contact us.',
      ],
    },

    { h: '2. Information collected automatically, and what we do not collect' },
    {
      p: 'Our hosting and sign-in providers record technical information needed to run and secure Kelmi, such as your IP address, device and app version, and the times you sign in or make requests. We also keep a record of each meal plan request (your account ID, the time, and which provider and how much computing it used) so we can apply the monthly limit and prevent abuse.',
    },
    {
      p: 'Usage counts (optional, off unless you turn them on). If you switch on "Share usage counts" in Settings, Kelmi records when you open the app, when a meal plan is made, and when a grocery list is built. These counts go to PostHog, an analytics service that acts for us as a service provider, together with a random number it creates on your phone, and nothing else about your phone: we remove the device, system, language and time zone details its software would otherwise add. PostHog also receives the network address a request comes from, in order to deliver it, and we have it set to discard that address rather than store it. They are not linked to your name, email, or account, and they never include your allergies, diet, food notes, recipes, or anything you type. We turn off PostHog\'s screen and session recording, automatic event capture, and location lookup, and we do not read your advertising identifier. We use the counts only to see which features get used and to fix what does not work, and we never sell them or share them for advertising. You can turn this off at any time: collection stops right away and the random number is discarded. Because the counts are not tied to your account, we cannot tell which ones are yours, so deleting your account does not remove them. Kelmi does not use any other analytics, advertising, or tracking software, and does not track you across other companies\' apps or websites. If this changes, we will update this Policy and tell you before it takes effect, and we will ask for your consent where the law requires it.',
    },

    { h: '3. Sensitive information' },
    {
      p: 'Your allergies, dislikes, diet, and typed food notes can reveal information about your health or, in the case of a choice such as halal, your religious beliefs. Some laws, including Thailand\'s PDPA and Washington\'s My Health My Data Act, treat this as sensitive or "consumer health" data. We collect it only because you choose to give it, and use it only to plan your meals and grocery lists. Before Kelmi plans meals with it, the app asks for your explicit consent on its own screen (the allergy notice, "I understand and agree"), and we record when you gave it. You can leave it blank, change it, or delete it in Settings at any time; removing it, or deleting your account, withdraws your consent for it. We never sell it, use it for advertising, or use it to make decisions about you that have legal or similarly significant effects.',
    },

    { h: '4. AI meal planning' },
    {
      p: `Kelmi can use an AI provider to pick your meals. It does this only after you allow it in the app. The screen in the app says: "${AI_SCREEN}"`,
    },
    {
      list: [
        'What is sent. Your household size, weekly budget, allergies, diet, foods you like and dislike, and food notes, along with your eating goal and meat preference and a list of candidate recipes (recipe names, times and estimated costs) to choose from. We do not send your name, email address, or account ID. Food notes are free text, so do not type anything there that you would not want sent to an AI provider.',
        'Who receives it. Anthropic and IDUnify AI. They receive this information from us to produce a meal plan and act on our behalf as service providers (processors). We have not yet confirmed either provider\'s data retention or model-training terms in a signed agreement, so we make no promise about them here; we will update this Policy when we have. Each provider\'s own terms and privacy policy also apply.',
        'If you say no. Kelmi uses its built-in planner, which runs without an AI provider and sends nothing to one. Plans from the built-in planner may be simpler.',
        'Changing your mind. You can withdraw your permission at any time in the app\'s Settings. After that, Kelmi stops sending your information to an AI provider for new plans. Information already sent is handled under the provider\'s terms; ask us at the contact address below if you want help with that.',
      ],
    },

    { h: '5. How we use information' },
    {
      list: [
        'To provide Kelmi: plan meals that fit your household, budget, diet, allergies, and kitchen; estimate prices and nutrition; and build and sync your grocery list.',
        'To manage your account.',
        'To send notifications you turn on, and service messages such as changes to these policies.',
        'To respond to you, fix problems, and keep Kelmi secure, including preventing fraud and abuse.',
        'To improve Kelmi using information that does not identify you.',
        'To comply with the law and enforce our Terms.',
      ],
    },
    { p: 'We do not sell your personal information, share it for cross-context behavioral advertising, or use it to show you ads.' },
    { p: 'Our legal grounds. Where a law such as the PDPA asks for a legal ground for each use, we rely on:' },
    {
      list: [
        'Our contract with you (the Terms): to run your account, plan your meals, build your lists, and provide Kelmi Plus if you buy it.',
        'Your consent: for sending your food details to an AI provider, for using allergies, diet and food notes (sensitive data), for optional usage counts, and for notifications and Reminders. You can withdraw consent at any time, as described in this Policy; that does not affect what was done before.',
        'Our legitimate interests: to keep Kelmi secure, prevent fraud and abuse, enforce limits, and fix problems, in ways that do not override your rights.',
        'Legal obligations: to keep records the law requires, such as tax and accounting records, and to respond to lawful requests.',
      ],
    },
    { p: 'An email address is needed to create an account, and we cannot provide an account without it. Everything else in your household profile is optional, but Kelmi cannot plan around details you leave out, such as an allergy.' },

    { h: '6. Who we share it with' },
    {
      list: [
        'Supabase, our database, sign-in and hosting provider, which stores your account and data for us as a service provider.',
        'PostHog, our analytics provider, only if you switch on "Share usage counts" in Settings. It receives the three counts described in section 2, tied to a random number and not to you, and acts for us as a service provider.',
        'AI providers (Anthropic and IDUnify AI), only if you allow it. See section 4.',
        'RevenueCat, our subscription provider. When you sign in on an iPhone or Android phone, the app gives RevenueCat your Kelmi account ID (a random code, not your name or email) so a subscription follows your account, and RevenueCat\'s software also receives technical details such as your device model, system version, app version, store country and network address. If you buy Kelmi Plus, it also receives your purchase records from Apple or Google, and tells us whether your subscription is active. It never receives your food details, and acts for us as a service provider.',
        'Apple and Google. If you sign in with Apple or Google, they are independent companies that decide for themselves how to handle your sign-in under their own privacy policies; they are not our service providers. If you buy Kelmi Plus, Apple or Google take the payment and are likewise independent controllers of your payment information.',
        'Maps apps you choose to open. When you tap the grocery store button, your phone hands a search for "grocery store" to Apple Maps or Google Maps. We send them no personal information, and they are not our service providers; their own privacy policies apply.',
        'For legal reasons: when required by law or valid legal process, or to protect the rights, safety, and property of you, others, or us.',
        'In a business transfer, such as a merger or sale of assets, subject to this Policy.',
      ],
    },

    { h: '7. How long we keep it' },
    {
      list: [
        'Account and profile data (email, household profile, pantry, plans, lists, ratings, recipe edits): kept while your account exists. We delete it from our active systems when you delete your account in Settings.',
        'Meal plan request records: kept while your account exists, and deleted with it.',
        'Subscription records: kept while your account exists. When you delete your account, we delete our copy and ask RevenueCat to delete its record of you. Apple and Google keep their own purchase records, and sales reports from them that the law requires us to keep for tax and accounting do not include your name or email.',
        'Backups: copies of deleted data in backups are removed on our database provider\'s backup cycle, which we expect to be up to about 30 days.',
        'Waitlist emails: kept until Kelmi launches and we send the launch email, or until you ask us to remove you, and then deleted within a reasonable time (see section 9).',
        'Server logs: kept by our hosting providers for the periods they set, normally short.',
        'Records the law requires us to keep, or that we need to resolve a dispute, may be kept longer. Apple and Google keep their own sign-in records under their own policies.',
      ],
    },

    { h: '8. Your choices and rights' },
    {
      list: [
        'Change your details any time in Settings, and turn notifications on or off there or in your device settings.',
        'Delete your account and its data: Settings, Delete account.',
        `Ask for a copy of your information, or ask us to correct or delete it, by emailing ${L.email}.`,
      ],
    },
    {
      p: `Because we are a company registered in ${L.country}, the PDPA gives you, wherever you live, the right to be informed; to access and get a copy of your information; to receive it in a commonly used electronic format and have it sent to another company where technically possible; to object to how we use it; to ask us to delete, destroy or anonymize it; to ask us to restrict how we use it; to correct it; and to withdraw consent at any time. You can also complain to Thailand's Personal Data Protection Committee (the Office of the Personal Data Protection Commission, www.pdpc.or.th). Some of these rights have limits set by law, and we will tell you if one applies.`,
    },
    {
      p: 'Kelmi is offered only in the United States for now. Depending on the state where you live, such as California, Virginia, Colorado, Connecticut, Washington, Nevada, and others, you may have the right to know what personal information we hold and how we use it, to access and receive a portable copy, to correct it, to delete it, to limit the use of sensitive information, to withdraw consent, and to opt out of sale, sharing for advertising, and profiling. We offer these choices to everyone who uses Kelmi, whether or not the law of your state requires it. Because we do not sell or share personal information for advertising, there is nothing to opt out of; if that ever changes, we will honor Global Privacy Control signals. We will not discriminate against you for using your rights.',
    },
    {
      p: `To make a request, email ${L.email} from the address on your account. We will verify your request and respond within 45 days. Where the law allows, we may extend that once by up to 45 more days if we tell you why. You may use an authorized agent where the law allows. If we deny your request, you can appeal by replying to our decision, and we will respond to your appeal within 60 days, or sooner if the law requires. If you are not satisfied, you can contact your state attorney general.`,
    },

    { h: '9. The website and the waitlist' },
    {
      list: [
        'Waitlist. If you join the waitlist on usekelmi.com, we collect your email address and the time you joined. We use it only to send you one email when Kelmi is available. We do not use it for anything else and do not sell or share it for advertising. The form has a link to this Policy.',
        `Getting off the waitlist. Email ${L.email} and ask us to remove you, or use the unsubscribe link in any email we send you. We will delete your address.`,
        'Hosting and logs. The website is served by a hosting provider, which, like most hosts, records technical information such as your IP address, browser type, the pages you request and the time, in server logs, to deliver and secure the site. We use this only for running and protecting the site.',
        'Cookies and storage. The website sets no cookies. If you use the light/dark toggle, it saves your choice in your browser\'s local storage under the name "kavi-theme". This stays on your device and is not sent to us. The website has no analytics and no advertising or tracking scripts.',
      ],
    },

    { h: '10. Consumer health data and state laws' },
    {
      p: 'The allergies, dislikes, diet, and food notes you enter may be consumer health data under laws such as Washington\'s My Health My Data Act and Nevada\'s consumer health data law. Our separate Consumer Health Data Privacy Policy explains what we collect, why, who we share it with, and your rights, including the right to withdraw consent and to delete it. In short: we collect it from you, use it only to provide the meal planning you ask for, share it only with our service providers (and with the AI providers named in section 4 only if you allow it), and never sell it.',
    },

    { h: '11. Where Kelmi is offered' },
    {
      p: 'Kelmi is offered only to people in the United States. We do not offer it in the European Union, the United Kingdom, Switzerland or any other country, and this Policy is not designed to meet the laws of countries where Kelmi is not offered. If you are outside the United States, please do not use Kelmi or give us your information. If we expand to other countries, we will publish a policy for them first.',
    },
    {
      p: `Your information is stored and processed in the United States by Supabase. Because ${L.company} is based in ${L.country}, our team may also view and manage it from ${L.country}, and our service providers (section 6) may process it in the United States or other countries where they work. We follow the PDPA when we handle your information, and we send it to other countries only where the PDPA allows it, such as where it is needed to provide Kelmi to you under our contract, or with your consent, and we require our service providers to protect it.`,
    },

    { h: '12. Children' },
    {
      p: `Kelmi is not directed to, and is not knowingly used by, children under 13. We do not knowingly collect personal information from anyone under 13 (see the Children's Online Privacy Protection Act, COPPA). If we learn that we have collected information from a child under 13, we will delete it. If you believe a child under 13 has given us information, contact ${L.email} and we will delete it. People aged 13 to 17 may use Kelmi (the Terms ask those under 18 to use it only with a parent or guardian's permission, which Kelmi does not verify). We handle their information under this Policy like everyone else's: we do not sell it, we do not show ads, and we send food preferences to an AI provider only after the person allows it in the app. Some state laws give minors extra privacy protections, and we do not claim that this Policy meets all of them.`,
    },

    { h: '13. Security' },
    {
      p: 'We protect your information with measures such as encryption in transit, access controls that limit each account to its own data, and keeping secret keys off your device. No system is perfectly secure, so we cannot guarantee security. If a breach affects your information, we will notify you, and the authorities, as the law requires.',
    },

    { h: '14. Changes to this Policy' },
    {
      p: 'We will update this Policy when our practices change. If a change is material, we will tell you in the app or by email before it takes effect, and ask for your consent where the law requires it.',
    },

    { h: '15. Contact us' },
    { p: `${L.company}\n${L.address}\n${L.email}` },
  ],
};

export const CONSUMER_HEALTH: LegalDoc = {
  id: 'consumer-health-data',
  title: 'Consumer Health Data Privacy Policy',
  blocks: [
    { p: `Effective ${L.effective}` },
    {
      p: `This policy is for people in the United States and is provided by ${L.company}, a company registered in ${L.country} at ${L.address} ("we", "us"), under laws such as Washington's My Health My Data Act and Nevada's consumer health data law. It adds detail to our Privacy Policy. It is not medical advice, and Kelmi is not a medical service.`,
    },

    { h: '1. What consumer health data we collect' },
    {
      list: [
        'Allergies and foods you must avoid.',
        'Your diet (for example vegetarian, vegan, pescatarian, lower carb or halal).',
        'Foods you like and dislike.',
        'Food notes you type in Settings (for example "low sugar" or "easy on the stomach"), which are free text and may describe a health condition if you choose to write one.',
        'Your eating goal and meat preference, and the nutrition estimates shown for your meals.',
      ],
    },
    { p: 'We collect this only from you, when you enter it. We do not collect it from other sources. Before Kelmi plans meals with it, the app asks for your consent on a separate screen (the allergy notice, "I understand and agree"), and we record when you gave it.' },
    { p: 'Kelmi is for people 13 and older. It is not directed to children under 13 and we do not knowingly collect their information; if we learn we have, we delete it. People 13 to 17 may use Kelmi, and their consumer health data is handled the same way as everyone else\'s under this policy. We do not sell it, and it goes to an AI provider only if the person allows it in the app. Laws on minors\' health-related data vary by state, and we do not claim this policy meets all of them.' },

    { h: '2. Why we collect and use it' },
    {
      p: 'Only to provide the service you ask for: to choose meals that avoid the foods you list and fit your diet, goal and budget, to build your grocery list, and to show you your own settings. We do not use it for advertising, we do not sell it, and we do not use it to make decisions about you that have legal or similarly significant effects.',
    },

    { h: '3. Who we share it with' },
    {
      list: [
        'Supabase, our database and hosting provider, which stores it for us as a service provider.',
        'AI providers (Anthropic and IDUnify AI), only if you allow it. Kelmi asks before anything is sent. The in-app screen says: ' + `"${AI_SCREEN}"` + ' If you say no, Kelmi uses its built-in planner and sends nothing to an AI provider. We do not send your name or email, but food notes are free text, so only type what you are comfortable sending. We have not yet confirmed either provider\'s retention or model-training terms in a signed agreement, so we make no promise about them.',
        'Government or other parties only when the law requires it, or to protect rights and safety.',
      ],
    },
    { p: 'We do not sell consumer health data and we do not share it for advertising. We do not collect it for any purpose other than those in section 2.' },
    { p: 'Optional usage counts (see the Privacy Policy) never include your allergies, dislikes, diet, or food notes.' },

    { h: '4. Your rights' },
    {
      list: [
        'Withdraw consent. You can stop AI sharing in the app\'s Settings at any time. You can also leave allergy, diet and notes blank, or remove them, which withdraws your consent for them.',
        'Access. Ask us to confirm whether we collect your consumer health data, and for a copy of it.',
        'Delete. Delete it yourself in Settings, delete your whole account in Settings (Delete account), or ask us to delete it.',
        'Know who received it. Ask us for a list of the third parties and affiliates that received your consumer health data.',
        'Appeal. If we deny a request, you can appeal, and if you are not satisfied you can contact your state attorney general.',
      ],
    },
    {
      p: `To make a request, email ${L.email} from the address on your account. We will respond within 45 days, and may extend that once by up to 45 more days if we tell you why.`,
    },

    { h: '5. How long we keep it' },
    {
      p: 'While your account exists. When you delete your account, we delete it from our active systems, and copies in backups are removed on our database provider\'s backup cycle, which we expect to be up to about 30 days.',
    },

    { h: '6. Security and changes' },
    {
      p: 'We use encryption in transit and access controls that limit each account to its own data. We will update this policy if our practices change, and we will ask for your consent before collecting or sharing more consumer health data than described here, where the law requires it.',
    },

    { h: '7. Contact' },
    { p: `${L.company}\n${L.address}\n${L.email}` },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY, consumerHealth: CONSUMER_HEALTH } as const;
