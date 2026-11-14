import { router } from 'expo-router';

import { t } from '../i18n';
import type { MascotPose } from '../components/Mascot';
import { FREE_PANTRY_LIMIT } from './limits';

// Every spot in the app that sits behind Kelmi Plus has its own name here. Tapping a locked spot opens the paywall with that
// name, and the paywall says what that one feature does for the person, in words written for that moment.
export type PlusFeature = 'swap' | 'keep' | 'cook' | 'edit' | 'share' | 'reminders' | 'nutrition' | 'pantry' | 'plans';

const FEATURES: readonly PlusFeature[] = ['swap', 'keep', 'cook', 'edit', 'share', 'reminders', 'nutrition', 'pantry', 'plans'];
export const isPlusFeature = (v: unknown): v is PlusFeature => typeof v === 'string' && (FEATURES as readonly string[]).includes(v);

// Opens the paywall for one feature. `replace` swaps the current screen out, for a locked screen someone reached by a link.
export const openPlus = (feature: PlusFeature) => router.push({ pathname: '/paywall', params: { feature } });
export const replaceWithPlus = (feature: PlusFeature) => router.replace({ pathname: '/paywall', params: { feature } });

export type PlusPitch = {
  title: string;
  body: string;
  // Pip's pose for the moment.
  pose: MascotPose;
  // Which line of the paywall's benefits list is this feature, so it can be highlighted. Null when the list has no line for it.
  benefit: number | null;
};

// The words are looked up when this runs, so they follow the person's language.
export function plusPitch(feature: PlusFeature): PlusPitch {
  switch (feature) {
    case 'swap':
      return {
        title: t('Swap any meal'),
        body: t('Not feeling tonight’s dinner? Pick another and the budget updates on the spot.'),
        pose: 'think',
        benefit: 1,
      };
    case 'keep':
      return {
        title: t('Keep the meals you love'),
        body: t('Bookmark a meal and it stays put when you plan the week again.'),
        pose: 'love',
        benefit: null,
      };
    case 'cook':
      return {
        title: t('Cook mode with step timers'),
        body: t('One step at a time on a big screen, with timers so nothing burns.'),
        pose: 'cook',
        benefit: 2,
      };
    case 'edit':
      return {
        title: t('Make the recipe yours'),
        body: t('Change any recipe to fit how you cook.'),
        pose: 'read',
        benefit: 2,
      };
    case 'share':
      return {
        title: t('Send your list to anyone'),
        body: t('Share the grocery list with whoever is shopping, in one tap.'),
        pose: 'point',
        benefit: 4,
      };
    case 'reminders':
      return {
        title: t('Groceries in Reminders'),
        body: t('Put your list in Apple Reminders and tick things off in the store.'),
        pose: 'shop',
        benefit: 4,
      };
    case 'nutrition':
      return {
        title: t('The full nutrition label'),
        body: t('See protein, carbs, fat, sodium and % Daily Value on every recipe.'),
        pose: 'yum',
        benefit: 3,
      };
    case 'pantry':
      return {
        title: t('A bigger pantry'),
        body: t('Free pantries hold {n} items. Plus has no limit, so everything you own counts.', { n: FREE_PANTRY_LIMIT }),
        pose: 'peek',
        benefit: null,
      };
    case 'plans':
      return {
        title: t('Plan as many weeks as you like'),
        body: t('You’ve used this month’s free plans. Plus gives you a fresh plan every week.'),
        pose: 'sleep',
        benefit: 0,
      };
  }
}
