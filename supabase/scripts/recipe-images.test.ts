// Run with: node --test supabase/scripts/recipe-images.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { matchImages, parseCredits, slug } from "./recipe-images.ts";

const recipes = [
  { id: "1", title: "Sheet-pan chicken fajitas" },
  { id: "2", title: "Spaghetti aglio e olio" },
  { id: "3", title: "Beef tacos" },
];

test("slug turns titles and file names into the same key", () => {
  assert.equal(slug("Sheet-pan chicken fajitas"), "sheet-pan-chicken-fajitas");
  assert.equal(slug("sheet-pan-chicken-fajitas.JPG"), "sheet-pan-chicken-fajitas");
  assert.equal(slug("  Beef tacos!  "), "beef-tacos");
});

test("matchImages pairs files with recipes, and reports the leftovers", () => {
  const out = matchImages(["Beef-Tacos.jpg", "sheet-pan-chicken-fajitas.webp", "typo-recipe.png", "notes.txt"], recipes);
  assert.deepEqual(out.matched.map((m) => m.recipe.id), ["3", "1"]);
  assert.deepEqual(out.unmatched, ["typo-recipe.png"]);
  assert.deepEqual(out.withoutImage.map((r) => r.id), ["2"]);
});

test("parseCredits reads file,credit lines and skips the header", () => {
  const credits = parseCredits('file,credit\nbeef-tacos.jpg,"Jane Doe, Pexels"\nspaghetti-aglio-e-olio.jpg,Sam Lee / Unsplash\n');
  assert.equal(credits.get("beef-tacos.jpg"), "Jane Doe, Pexels");
  assert.equal(credits.get("spaghetti-aglio-e-olio.jpg"), "Sam Lee / Unsplash");
  assert.equal(credits.size, 2);
});
