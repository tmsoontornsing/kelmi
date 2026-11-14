@AGENTS.md

## Mascot

Pip is Kelmi's mascot, a mason jar. Use `<Mascot pose="wave" />` from `src/components/Mascot.tsx`. The 13 poses are wave, think, cook, shop, cheer, oops, sleep, peek, love, yum, save, point and read; each pose's `use` in `mascotPoses.generated.ts` says where it belongs. Each pose plays its own idle animation, which Reduce Motion or `animate={false}` turns off. Draw and edit poses in `scripts/build-mascot.mjs`, then run `node scripts/build-mascot.mjs` to regenerate `assets/mascot/*.svg` and `src/components/mascotPoses.generated.ts`. Do not edit the generated files by hand. Add `tappable` to let people poke Pip (a jump, a squish and a tap of haptics); it is a bonus and never the only way to do anything. In development, `/dev/mascot` shows every pose animating.

Pip is also the app icon, splash screen, and every marketing image. `scripts/build-brand.mjs` draws them from Pip's parts in `scripts/pip-art.mjs` and the generated poses, and writes `assets/icon.png`, the iOS dark and tinted icons, the Android adaptive layers, `assets/splash-icon.png`, `assets/favicon.png`, and everything in `marketing/`. After changing Pip, run `node scripts/build-mascot.mjs && node scripts/build-brand.mjs`. Store listing copy is in `marketing/README.md`.

## Nutrition

Each recipe's calories, protein, carbs, fiber, sugars, fat, saturated fat, cholesterol and sodium are estimated per serving from its ingredients. The figures live in the `ingredient_nutrition` table (per 100 g, plus the grams in one pricing unit), loaded from `supabase/catalog/starter/nutrition.csv` by the import script. `src/lib/nutrition.ts` does the math and the label rounding; `api.ts` attaches `nutrition` to each meal and recipe; `NutritionFacts` shows the recipe's label, and the week shows calories per meal and a per-person total for each day. Example data has no nutrition, so those parts stay hidden there.

## Legal

The Terms of Service and Privacy Policy live in `src/legal/documents.ts`, with business details in `src/legal/config.ts`. The app shows them at `/legal/terms` and `/legal/privacy`; `node scripts/build-legal.mjs` writes the same text to `legal/*.md` for the website. When Kelmi starts collecting new data or uses a new service, update the Privacy Policy and the store privacy forms in the same change. `docs/legal-review.md` lists what is fixed, what must happen before release, and the open questions for the US and Thai lawyers. `node scripts/legal-gate.mjs` blocks release while a placeholder remains. Never describe allergen filtering, prices, or nutrition as guaranteed in UI copy.

## Reminders

The grocery list's checkbox button sends unchecked items to a "Kelmi Groceries" list in Apple Reminders (`src/lib/reminders.ts`, using `expo-calendar/legacy`). iOS only; the button is hidden elsewhere. Kelmi creates and reads only that list, and skips items already waiting in it, so sending twice does not duplicate. The permission text lives in the `expo-calendar` plugin entry in `app.json` and takes effect in the next native build; Expo Go shows its own wording.

## Widgets

Two home screen widgets live in `widgets/`: Today's Meals (`KelmiToday.tsx`) and Grocery List (`KelmiGroceries.tsx`), registered in the `expo-widgets` entry of `app.json`. `src/lib/widgets.ts` sends them data whenever the plan or list changes. Widget code runs in an isolated runtime with no hooks and no app imports, and props travel as plain values: send a list as one string joined with "|", not an array. Widgets need a native build (`npx expo run:ios`); Expo Go cannot show them. If a build fails on Desktop with "resource fork, Finder information, or similar detritus not allowed", iCloud is syncing the project; build from a copy outside Desktop and Documents, and run with `LANG=en_US.UTF-8`.

## Typography

Outfit is the one typeface for everything Kelmi draws, loaded in `src/app/_layout.tsx` and named in `fonts` in `src/theme/index.ts`. Always use `<AppText>`, which picks the family from the variant or from `weight`. Do not set `fontWeight` on its own: custom fonts ship one file per weight, so a weight only works by choosing a family (`fonts.regular`, `fonts.medium`, `fonts.displaySemi`, `fonts.display`). A raw `TextInput` needs `fontFamily: fonts.regular` in its style. Only system UI (alerts, the keyboard, share sheets) stays in the system font. `AppText` also adds a hair space around " · " separators, since Outfit sets that dot tight.

## Translations

Kelmi runs in English, Spanish, Simplified Chinese, Hindi, French, Brazilian Portuguese, Thai and Japanese. People pick a language in Settings, under Language (`src/app/language.tsx`); "Same as phone" follows the device. The translator is `src/i18n/index.tsx`, and English text is the key, so a missing translation shows the English instead of a blank.

- Text in code: `const { t, tn } = useT()`, then `t('Save Your Plan')`, `t('{n} of {total} in cart', { n, total })`, `tn(count, '{n} item', '{n} items')`. Always pass a single-quoted literal (the checker finds keys by scanning for them), and keep whole sentences in one key with placeholders, since other languages reorder words. Outside React, import `t` from `src/i18n` and call it when the code runs.
- Food data (recipe titles and steps, ingredients, aisles, units, shelves, diets, appliances, chips, day names, and the example data): show it with `tx(value)`, ingredient and grocery lines ("Chicken breast, 1.5 lb") with `line(value)`, and cooking times with `minutes(value)`. Data keeps its English everywhere else: ids, comparisons, saving to Supabase, and allergy matching.
- Translations live in `src/i18n/locales/ui/<code>.json` (text in code) and `src/i18n/locales/content/<code>.json` (food data, drawn from `data/mock.ts` and `supabase/catalog/starter`). After adding text or recipes, run `node scripts/i18n.mjs` to see what each language is missing, `--missing th ui` to print the gaps as JSON to fill in, and `--prune` to drop keys nothing uses. A recipe added to the catalog shows in English until its title and steps are added to every content file.
- Outfit only has Latin letters, so `AppText` switches Thai, Hindi, Chinese and Japanese to the system font in the matching weight, with taller lines for Thai and Hindi. Leave room for longer text: French and Portuguese run about a third longer than English.
- The Terms of Service and Privacy Policy stay in English, and the sheet says so in other languages. Translating them is a job for the lawyer reviewing them. Arabic and other right-to-left languages are not supported yet; they need the layout mirrored.
