// Run with: deno test supabase/functions/_shared/
import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { readAllPages } from "./data.ts";

// A stand-in for the part of the Supabase client the catalog read uses: from().select().order().in().range().returns().
function fakeDb(total: number, maxRows: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: String(i).padStart(5, "0") }));
  const requests: [number, number][] = [];
  const q: any = {
    select: () => q,
    order: () => q,
    in: () => q,
    range: (from: number, to: number) => {
      requests.push([from, to]);
      q.slice = rows.slice(from, Math.min(to + 1, from + maxRows));
      return q;
    },
    returns: () => Promise.resolve({ data: q.slice, error: null, count: total }),
  };
  return { db: { from: () => q } as never, requests };
}

Deno.test("the catalog is read page by page until it is all there", async () => {
  const { db, requests } = fakeDb(1250, 1000);
  const { rows, error } = await readAllPages(db, true, undefined, 500);
  assertEquals([rows.length, error], [1250, null]);
  assertEquals(requests, [[0, 499], [500, 999], [1000, 1499]]);
});

Deno.test("a catalog that comes back short throws instead of being used", async () => {
  // The server only returns 100 rows per request, whatever was asked for.
  const { db } = fakeDb(1250, 100);
  await assertRejects(() => readAllPages(db, true, undefined, 500), Error, "cut short");
});
