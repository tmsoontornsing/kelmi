// Which of a household's allergies a food's name points to. Used on the Pantry, where items are plain names.
//
// The word lists must match supabase/functions/_shared/plan-logic.ts, which the planner uses to keep allergens out of
// plans; supabase/scripts/allergens.test.ts fails if they drift apart. This only reads names, so it cannot know what a
// packaged product contains: it catches "Parmesan" or "Soy sauce", never a hidden ingredient. The screen says so.
// The lists err toward excluding. A word matches whole words only, with an optional plural "s".

export const ALLERGEN_WORDS: Record<string, string[]> = {
  'peanuts': ['peanut', 'groundnut', 'arachis', 'satay'],
  // "pesto" is here on purpose: classic basil pesto is made with pine nuts (some with walnuts or cashews), and a jar
  // almost always lists a nut. A nut-free pesto is rare enough that excluding it is the safe call.
  'tree-nuts': ['nut', 'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'pine nut', 'pignoli', 'chestnut', 'filbert', 'pesto', 'marzipan', 'praline', 'nutella', 'frangipane', 'amaretto', 'nougat'],
  'shellfish': ['shellfish', 'seafood', 'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'crawfish', 'crayfish', 'langoustine', 'squid', 'calamari', 'octopus', 'cuttlefish', 'abalone', 'escargot', 'cockle', 'krill'],
  'dairy': ['milk', 'buttermilk', 'cheese', 'cheesecake', 'butter', 'buttercream', 'butterscotch', 'cream', 'creamer', 'yogurt', 'yoghurt', 'kefir', 'mozzarella', 'parmesan', 'cheddar', 'ricotta', 'mascarpone', 'feta', 'paneer', 'halloumi', 'brie', 'gouda', 'gruyere', 'provolone', 'pecorino', 'romano', 'gorgonzola', 'queso', 'labneh', 'quark', 'skyr', 'raita', 'lassi', 'custard', 'casein', 'caseinate', 'whey', 'ghee', 'curd', 'lactose', 'half and half', 'creme fraiche', 'ice cream', 'gelato', 'alfredo', 'bechamel', 'milkshake'],
  'gluten': ['flour', 'wheat', 'pasta', 'spaghetti', 'penne', 'linguine', 'fettuccine', 'macaroni', 'orzo', 'lasagna', 'ravioli', 'tortellini', 'gnocchi', 'noodle', 'ramen', 'udon', 'bread', 'breadcrumb', 'breading', 'panko', 'crouton', 'stuffing', 'dough', 'crust', 'flour tortilla', 'tortilla', 'pita', 'naan', 'cracker', 'pretzel', 'bagel', 'baguette', 'brioche', 'croissant', 'waffle', 'pancake', 'biscuit', 'cornbread', 'couscous', 'semolina', 'bulgur', 'farro', 'freekeh', 'spelt', 'kamut', 'einkorn', 'rye', 'barley', 'malt', 'seitan', 'bun', 'soy sauce', 'teriyaki', 'hoisin', 'oat', 'granola', 'muffin', 'tempura'],
  'eggs': ['egg', 'eggnog', 'mayonnaise', 'mayo', 'aioli', 'meringue', 'custard', 'hollandaise', 'albumin', 'omelet', 'omelette', 'frittata', 'quiche', 'souffle', 'carbonara', 'pavlova'],
  'soy': ['soy', 'soya', 'soybean', 'soymilk', 'tofu', 'edamame', 'miso', 'tempeh', 'natto', 'tamari', 'shoyu', 'teriyaki', 'hoisin'],
  'fish': ['fish', 'seafood', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'snapper', 'mackerel', 'haddock', 'anchovy', 'anchovies', 'sardine', 'herring', 'pollock', 'catfish', 'swordfish', 'bass', 'mahi', 'flounder', 'grouper', 'monkfish', 'bream', 'mullet', 'perch', 'pike', 'carp', 'eel', 'whitefish', 'barramundi', 'branzino', 'bonito', 'dashi', 'surimi', 'caviar', 'roe', 'sashimi', 'sushi', 'caesar', 'worcestershire'],
  'sesame': ['sesame', 'tahini', 'hummus', 'halva', 'halvah', 'gomasio', 'zaatar', "za'atar", 'benne'],
};

// Labels people use that are not one of the keys above, mapped to the groups they mean.
export const ALLERGEN_ALIASES: Record<string, string[]> = {
  'nuts': ['tree-nuts', 'peanuts'],
  'nut': ['tree-nuts', 'peanuts'],
  'tree-nut': ['tree-nuts'],
  'treenuts': ['tree-nuts'],
  'peanut': ['peanuts'],
  'wheat': ['gluten'],
  'celiac': ['gluten'],
  'coeliac': ['gluten'],
  'milk': ['dairy'],
  'lactose': ['dairy'],
  'egg': ['eggs'],
  'soya': ['soy'],
  'soybeans': ['soy'],
  'crustaceans': ['shellfish'],
  'molluscs': ['shellfish'],
  'mollusks': ['shellfish'],
  'seafood': ['fish', 'shellfish'],
};

// A phrase that contains an allergen word but is not the allergen: removed from the text before it is checked.
export const ALLERGEN_SAFE_PHRASES: Record<string, string[]> = {
  'gluten': ['corn tortilla'],
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRegex = (words: string[], flags = 'i') => new RegExp(`\\b(?:${words.map(escape).join('|')})s?\\b`, flags);

// Compiled once per allergen (and once per typed-in label), not on every check. Capped so typed labels cannot grow it.
const regexCache = new Map<string, RegExp>();
function cachedRegex(cacheKey: string, words: string[], flags = 'i'): RegExp {
  const k = `${flags}:${cacheKey}`;
  let re = regexCache.get(k);
  if (!re) {
    if (regexCache.size >= 500) regexCache.clear();
    re = wordRegex(words, flags);
    regexCache.set(k, re);
  }
  return re;
}

const withoutSafePhrases = (text: string, group: string): string => {
  const phrases = ALLERGEN_SAFE_PHRASES[group];
  return phrases ? text.replace(cachedRegex(`safe:${group}`, phrases, 'gi'), ' ') : text;
};

// The word-list groups an allergy label stands for: its own, the groups an alias names, or none for a label we have no
// list for (which is then matched on its own name, as the planner does).
export function allergenGroups(label: string): string[] {
  const s = slug(label);
  if (ALLERGEN_WORDS[s]) return [s];
  return (ALLERGEN_ALIASES[s] ?? []).filter((g) => ALLERGEN_WORDS[g]);
}

function foodHas(food: string, label: string): boolean {
  const groups = allergenGroups(label);
  if (groups.length === 0) return cachedRegex(`own:${label.trim().toLowerCase()}`, [label.trim()]).test(food);
  return groups.some((g) => cachedRegex(`group:${g}`, ALLERGEN_WORDS[g]).test(withoutSafePhrases(food, g)));
}

// The household's allergy labels (for example "Tree nuts") that this food's name matches, in the household's order.
export function allergensIn(food: string, allergies: string[]): string[] {
  return allergies.filter((label) => slug(label) !== '' && foodHas(food, label));
}

// Every allergen group (a key of ALLERGEN_WORDS) the text points to. Used by the catalog importer to check a recipe's
// contains-* tags against its ingredients.
export function allergenGroupsIn(text: string): string[] {
  return Object.keys(ALLERGEN_WORDS).filter((g) => foodHas(text, g));
}
