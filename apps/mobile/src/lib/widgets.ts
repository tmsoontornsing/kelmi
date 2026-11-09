import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { MEAL_LABELS, type GroceryAisle, type PlannedMeal } from '../data/mock';
import { t, tx } from '../i18n';

type Widget = { updateSnapshot: (props: Record<string, unknown>) => void };

// The widget module needs the native widget extension, which exists in development and store builds
// but not in Expo Go. Load each widget lazily and treat a failure as "no widgets here" so the app still runs.
let loaded: { today: Widget | null; groceries: Widget | null } | undefined;
function widgets() {
  if (loaded) return loaded;
  // Checking first (rather than catching the failed import) keeps Expo Go from showing an error overlay.
  if (Platform.OS !== 'ios' || !requireOptionalNativeModule('ExpoWidgets')) return (loaded = { today: null, groceries: null });
  const load = (get: () => unknown) => {
    try {
      return get() as Widget;
    } catch {
      return null;
    }
  };
  return (loaded = {
    today: load(() => require('../../widgets/KelmiToday').default),
    groceries: load(() => require('../../widgets/KelmiGroceries').default),
  });
}

// What the largest grocery widget can list. Sending more would only be thrown away.
const GROCERY_ROWS = 18;
// How many items each grocery widget size shows: one column of 4, two of 4, two of 9. Must match KelmiGroceries.
const GROCERY_SHOWN = { small: 4, medium: 8, large: GROCERY_ROWS };

// Names only: "Avocado, 1 each" becomes "Avocado" so rows stay on one line. The name is split off the English line
// the same way line() splits it, then translated. "|" separates rows, so it can't appear inside one.
const itemName = (text: string) => {
  const comma = text.lastIndexOf(', ');
  return tx(comma < 0 ? text : text.slice(0, comma)).replace(/\|/g, ' ');
};

// Push today's meals and the grocery list to the home screen widgets. Widgets can't reach the translator, so every
// piece of their text is translated here, in the language on screen, and sent as ready-made strings.
export function syncWidgets(plan: PlannedMeal[], groceries: GroceryAisle[], checked: Record<string, boolean>) {
  const { today, groceries: list } = widgets();
  if (!today && !list) return;
  try {
    const items = groceries.flatMap((a) => a.items);
    const done = items.filter((i) => checked[i.key]).length;
    const total = items.length;
    const inCart = t('{done} of {total} in cart', { done, total });
    if (today) {
      // The plan runs Monday to Sunday, three meals a day.
      const day = (new Date().getDay() + 6) % 7;
      const meals = plan.length === 21 ? plan.slice(day * 3, day * 3 + 3) : [];
      const dayName = tx(meals[0]?.dayLong ?? '').toUpperCase();
      today.updateSnapshot({
        breakfast: tx(meals[0]?.name ?? ''),
        lunch: tx(meals[1]?.name ?? ''),
        dinner: tx(meals[2]?.name ?? ''),
        done,
        total,
        dinnerHeader: t('DINNER · {day}', { day: dayName }),
        todayHeader: t('TODAY · {day}', { day: dayName }),
        cartText: total > 0 ? inCart : t('No list yet'),
        planPrompt: t('Plan your week'),
        breakfastLabel: tx(MEAL_LABELS.breakfast),
        lunchLabel: tx(MEAL_LABELS.lunch),
        dinnerLabel: tx(MEAL_LABELS.dinner),
        inCartLabel: t('in cart'),
      });
    }
    if (list) {
      const sent = items.filter((i) => !checked[i.key]).slice(0, GROCERY_ROWS);
      const left = Math.max(0, total - done);
      // The line under the list: how many did not fit in this size, then the cart count.
      const footer = (shown: number) => {
        const more = sent.length > shown ? left - shown : 0;
        return more > 0 ? t('and {n} more · {done} of {total} in cart', { n: more, done, total }) : inCart;
      };
      list.updateSnapshot({
        items: sent.map((i) => itemName(i.name)).join('|'),
        done,
        total,
        title: t('GROCERIES'),
        header: total === 0 ? t('GROCERIES') : left === 0 ? t('GROCERIES · ALL DONE') : t('GROCERIES · {n} LEFT', { n: left }),
        emptyText: total > 0 ? t('Everything is in your cart') : t('Plan your week to build a list'),
        progress: t('{done} of {total} items', { done, total }),
        footerSmall: footer(GROCERY_SHOWN.small),
        footerMedium: footer(GROCERY_SHOWN.medium),
        footerLarge: footer(GROCERY_SHOWN.large),
      });
    }
  } catch {
    // A widget that can't update must never break the app.
  }
}
