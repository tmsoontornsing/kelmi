// Checks a recipe catalog's `contains-<allergen>` tags against its ingredients, using the same word lists the app and
// the planner use. The planner honours an explicit tag and falls back to the words, so a missing tag is a gap the words
// may or may not cover (a title or ingredient name can hide an allergen); this makes the gaps visible before an import.
// Pure functions, tested in recipe-allergens.test.ts.

import { ALLERGEN_WORDS, allergenGroupsIn } from '../../apps/mobile/src/lib/allergens.ts';
import { key, type Catalog } from './recipe-csv.ts';

// Every allergen group has a tag: contains-peanuts, contains-tree-nuts, contains-shellfish, contains-dairy,
// contains-gluten, contains-eggs, contains-soy, contains-fish, contains-sesame.
export const CONTAINS_TAGS = Object.keys(ALLERGEN_WORDS).map((g) => `contains-${g}`);

export type RecipeAllergenReview = {
  title: string;
  // Allergen groups the title or ingredients point to, with the names that did.
  found: Record<string, string[]>;
  // Of those, the ones the recipe's tags do not declare.
  undeclared: string[];
  // contains-* tags that are not one of CONTAINS_TAGS (a typo such as contains-nuts), which the planner would never read.
  unknownTags: string[];
  hasContainsTag: boolean;
};

export function reviewAllergens(catalog: Pick<Catalog, 'recipes' | 'recipeIngredients'>): RecipeAllergenReview[] {
  const names = new Map<string, string[]>();
  for (const l of catalog.recipeIngredients) {
    const k = key(l.recipe_title);
    names.set(k, [...(names.get(k) ?? []), l.ingredient_name]);
  }
  return catalog.recipes.map((r) => {
    const found: Record<string, string[]> = {};
    for (const text of [r.title, ...(names.get(key(r.title)) ?? [])]) {
      for (const g of allergenGroupsIn(text)) (found[g] ??= []).push(text);
    }
    const contains = r.tags.filter((t) => t.startsWith('contains-'));
    return {
      title: r.title,
      found,
      undeclared: Object.keys(found).filter((g) => !r.tags.includes(`contains-${g}`)),
      unknownTags: contains.filter((t) => !CONTAINS_TAGS.includes(t)),
      hasContainsTag: contains.length > 0,
    };
  });
}

// The recipe's tags plus a contains-* tag for every allergen its ingredients point to. Only ever adds restrictions.
export const withDeclaredAllergens = (tags: string[], undeclared: string[]): string[] => [...new Set([...tags, ...undeclared.map((g) => `contains-${g}`)])];

// Human-readable lines for the importer to print. `undeclared` is the one to act on; `untagged` lists recipes with no
// contains-* tag at all, which is right for a recipe with no allergens and a gap for one that has them.
export function summarise(reviews: RecipeAllergenReview[]): { undeclared: string[]; unknown: string[]; untagged: string[] } {
  return {
    undeclared: reviews
      .filter((r) => r.undeclared.length > 0)
      .map((r) => `${r.title}: ingredients point to ${r.undeclared.map((g) => `${g} (${r.found[g].slice(0, 2).join(', ')})`).join('; ')} but there is no matching contains- tag`),
    unknown: reviews.filter((r) => r.unknownTags.length > 0).map((r) => `${r.title}: unknown tag ${r.unknownTags.join(', ')}`),
    untagged: reviews.filter((r) => !r.hasContainsTag).map((r) => r.title),
  };
}
