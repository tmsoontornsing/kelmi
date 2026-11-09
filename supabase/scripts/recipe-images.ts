// Pure helpers for upload-recipe-images.ts, kept apart so they run under node --test without a database.

// "Sheet-pan chicken fajitas" and "sheet-pan-chicken-fajitas.JPG" both become "sheet-pan-chicken-fajitas".
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const extension = (file: string) => file.split(".").pop()?.toLowerCase() ?? "";

export type Recipe = { id: string; title: string };

// Pairs each image file with the recipe whose title matches its file name. Files that match no recipe come back
// separately, so a typo is reported and not silently skipped. Recipes with no file are listed too.
export function matchImages(files: string[], recipes: Recipe[]) {
  const bySlug = new Map(recipes.map((r) => [slug(r.title), r]));
  const matched: { file: string; recipe: Recipe }[] = [];
  const unmatched: string[] = [];
  for (const file of files) {
    if (!(extension(file) in IMAGE_TYPES)) continue;
    const recipe = bySlug.get(slug(file));
    if (recipe) matched.push({ file, recipe });
    else unmatched.push(file);
  }
  const used = new Set(matched.map((m) => m.recipe.id));
  return { matched, unmatched, withoutImage: recipes.filter((r) => !used.has(r.id)) };
}

// credits.csv: "file,credit" per line, for photos whose license asks for a credit. A credit may contain commas.
export function parseCredits(text: string): Map<string, string> {
  const credits = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const comma = line.indexOf(",");
    if (comma < 1 || line.toLowerCase().startsWith("file,")) continue;
    credits.set(line.slice(0, comma).trim(), line.slice(comma + 1).trim().replace(/^"|"$/g, ""));
  }
  return credits;
}
