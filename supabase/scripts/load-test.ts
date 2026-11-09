// Fires concurrent requests at an Edge Function and reports status counts and latency.
//   KAVI_URL=https://<ref>.supabase.co KAVI_TOKEN=<a TEST user's access token> \
//     deno run --allow-net --allow-env supabase/scripts/load-test.ts [function] [requests] [concurrency]
// Use a test project or a test account: generate-plan calls the AI provider and counts against the plan limits.
// meal-options is the cheap one to start with.

const [fn = "meal-options", total = "50", conc = "5"] = Deno.args;
const url = Deno.env.get("KAVI_URL");
const token = Deno.env.get("KAVI_TOKEN");
if (!url || !token) {
  console.error("Set KAVI_URL and KAVI_TOKEN");
  Deno.exit(1);
}
const body = fn === "meal-options" ? { meal_type: "dinner", exclude: [] } : {};

const statuses = new Map<number, number>();
const times: number[] = [];
let next = 0;

async function worker() {
  while (next++ < Number(total)) {
    const start = performance.now();
    let status = 0;
    try {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      status = res.status;
      await res.arrayBuffer();
    } catch {
      status = 0; // network error or timeout
    }
    times.push(performance.now() - start);
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
  }
}

const began = performance.now();
await Promise.all(Array.from({ length: Number(conc) }, worker));
const secs = (performance.now() - began) / 1000;
times.sort((a, b) => a - b);
const pct = (p: number) => Math.round(times[Math.min(times.length - 1, Math.floor(times.length * p))]);
console.log(`${times.length} requests in ${secs.toFixed(1)}s (${(times.length / secs).toFixed(1)}/s)`);
console.log("status:", Object.fromEntries(statuses));
console.log(`latency ms: p50 ${pct(0.5)}  p95 ${pct(0.95)}  max ${Math.round(times[times.length - 1])}`);
