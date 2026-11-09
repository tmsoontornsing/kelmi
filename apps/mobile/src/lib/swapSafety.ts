import { allergensIn } from './allergens';

// A last check on the phone before a swapped-in recipe is written to the week. The planner and the meal-options function
// already filter, but a swap is the one place the person picks the recipe, so it is checked again with the same word
// lists the pantry uses (lib/allergens.ts). Like them, it reads names and tags only: a hidden ingredient gets through.

export type SwapRecipe = { title: string; tags: string[]; ingredientNames: string[] };
export type SwapConflict = { allergens: string[]; diet: boolean };

// Which recipe tags satisfy each diet. Matches DIET_TAGS in supabase/functions/_shared/plan-logic.ts: strict diets need an
// explicit tag, and a diet this list does not know applies no filter.
const DIET_TAGS: Record<string, string[]> = {
  vegan: ['vegan'],
  vegetarian: ['vegetarian', 'vegan'],
  pescatarian: ['pescatarian', 'vegetarian', 'vegan'],
  lowcarb: ['lowcarb'],
  halal: ['halal', 'vegetarian', 'vegan'],
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function findSwapConflict(recipe: SwapRecipe, allergies: string[], diet: string): SwapConflict | null {
  const haystack = [recipe.title, ...recipe.ingredientNames].join(' | ');
  const allergens = allergies.filter((label) => recipe.tags.includes(`contains-${slug(label)}`) || allergensIn(haystack, [label]).length > 0);
  const accepted = DIET_TAGS[diet];
  const dietBreak = !!accepted && !accepted.some((tag) => recipe.tags.includes(tag));
  return allergens.length > 0 || dietBreak ? { allergens, diet: dietBreak } : null;
}
