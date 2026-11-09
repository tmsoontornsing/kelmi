// Uploads a folder of recipe photos to the recipe-images Storage bucket and points each recipe at its photo.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role key> \
//     node supabase/scripts/upload-recipe-images.ts <folder> [--dry-run]
//
// Name each photo after its recipe: "Beef tacos" is beef-tacos.jpg (jpg, png or webp; capitals and spaces are fine).
// Photos that need a credit go in <folder>/credits.csv as "file,credit". Without a folder, it lists the recipes that
// still have no photo. Runs on Node 23.6 or later with no dependencies. The service role key stays on your computer:
// it must never go in the app.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { extension, IMAGE_TYPES, matchImages, parseCredits, slug } from "./recipe-images.ts";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const folder = args.find((a) => !a.startsWith("--"));
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const recipesRes = await fetch(`${url}/rest/v1/recipes?select=id,title,image_url&order=title`, { headers });
if (!recipesRes.ok) {
  console.error(`Could not read recipes: ${recipesRes.status} ${await recipesRes.text()}`);
  process.exit(1);
}
const recipes: { id: string; title: string; image_url: string | null }[] = await recipesRes.json();

if (!folder) {
  const missing = recipes.filter((r) => !r.image_url);
  console.log(`${recipes.length - missing.length} of ${recipes.length} recipes have a photo. Still needed (file name to use):`);
  for (const r of missing) console.log(`  ${slug(r.title)}.jpg   ${r.title}`);
  process.exit(0);
}

const files = readdirSync(folder);
const { matched, unmatched, withoutImage } = matchImages(files, recipes);
const creditsFile = join(folder, "credits.csv");
const credits = existsSync(creditsFile) ? parseCredits(readFileSync(creditsFile, "utf8")) : new Map<string, string>();

for (const { file, recipe } of matched) {
  const name = `${slug(recipe.title)}.${extension(file)}`;
  const publicUrl = `${url}/storage/v1/object/public/recipe-images/${name}`;
  if (dryRun) {
    console.log(`would upload ${file} -> ${name}`);
    continue;
  }
  const body = readFileSync(join(folder, file));
  const up = await fetch(`${url}/storage/v1/object/recipe-images/${name}`, {
    method: "POST",
    headers: { ...headers, "content-type": IMAGE_TYPES[extension(file)], "x-upsert": "true", "cache-control": "max-age=31536000" },
    body,
  });
  if (!up.ok) {
    console.error(`FAILED ${file}: ${up.status} ${await up.text()}`);
    continue;
  }
  const set = await fetch(`${url}/rest/v1/recipes?id=eq.${recipe.id}`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ image_url: publicUrl, image_credit: credits.get(file) ?? null }),
  });
  console.log(set.ok ? `ok     ${recipe.title}` : `FAILED ${recipe.title}: ${set.status} ${await set.text()}`);
}

if (unmatched.length) console.log(`\nNo recipe matches these files (check the spelling):\n  ${unmatched.join("\n  ")}`);
if (withoutImage.length) console.log(`\n${withoutImage.length} recipes still have no file in this folder.`);
if (dryRun) console.log("\nDry run: nothing was uploaded.");
