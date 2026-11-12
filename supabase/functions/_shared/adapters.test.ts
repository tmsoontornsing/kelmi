// Run with: deno test supabase/functions/_shared/
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";

import { claudeProvider, idunifyBaseUrl, idunifyProvider, ollamaProvider, providerFromEnv } from "./adapters.ts";
import { isRetryable, type PlanInput } from "./provider.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const input: PlanInput = {
  householdSize: 2,
  weeklyBudgetUsd: null,
  allergies: [],
  dislikes: [],
  likes: [],
  candidates: { breakfast: [{ id: uuid, title: "Oats", minutes: 5, estimatedCostUsd: 1 }], lunch: [], dinner: [] },
};
const answer = JSON.stringify({ items: [{ recipe_id: uuid, day_of_week: 1, meal_type: "breakfast" }] });

// Replaces fetch for one test and records the requests made. Nothing here reaches the network.
async function withFetch(reply: (url: string, body: any) => Response | Promise<Response>, run: (calls: { url: string; body: any }[]) => Promise<void>) {
  const real = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), body });
    return Promise.resolve(reply(String(url), body));
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = real;
  }
}

Deno.test("providerFromEnv: only claude, idunify and basic by default; ollama needs the dev switch", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  assertEquals(providerFromEnv(env({})).name, "basic");
  assertEquals(providerFromEnv(env({ ANTHROPIC_API_KEY: "k" })).name, "claude");
  assertEquals(providerFromEnv(env({ IDUNIFY_API_KEY: "k" })).name, "idunify");
  assertEquals(providerFromEnv(env({ KAVI_PLAN_PROVIDER: "ollama" })).name, "basic");
  assertEquals(providerFromEnv(env({ KAVI_PLAN_PROVIDER: "ollama", KAVI_ALLOW_OLLAMA: "1" })).name, "ollama");
  // A typo, or a provider we do not allow, is the built-in planner, never something paid.
  assertEquals(providerFromEnv(env({ KAVI_PLAN_PROVIDER: "openai", ANTHROPIC_API_KEY: "k" })).name, "basic");
  assertEquals(providerFromEnv(env({ KAVI_PLAN_PROVIDER: "Claude", ANTHROPIC_API_KEY: "k" })).name, "basic");
  // Forcing a provider without its key throws, which generate-plan treats as "no AI".
  try {
    providerFromEnv(env({ KAVI_PLAN_PROVIDER: "claude" }));
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as Error).message, "ANTHROPIC_API_KEY is not set");
  }
});

Deno.test("claude: sends max_tokens, reads usage, and parses the plan", async () => {
  await withFetch(
    () => Response.json({ content: [{ type: "text", text: `Sure!\n${answer}` }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn" }),
    async (calls) => {
      let used = 0;
      const plan = await claudeProvider("key").generate(input, (u) => (used = u.inputTokens + u.outputTokens));
      assertEquals(plan.items.length, 1);
      assertEquals(used, 15);
      assertEquals(typeof calls[0].body.max_tokens, "number");
    },
  );
});

Deno.test("claude: a plan cut off at max_tokens is reported as such", async () => {
  await withFetch(
    () => Response.json({ content: [{ type: "text", text: '{"items":[{"recipe_id"' }], stop_reason: "max_tokens" }),
    async () => {
      const e = await assertRejects(() => claudeProvider("key").generate(input), Error, "token limit");
      assertEquals(isRetryable(e), true);
    },
  );
});

Deno.test("4xx answers are not retryable, 5xx are, and a non-JSON body does not crash", async () => {
  for (const [status, retry] of [[400, false], [401, false], [403, false], [429, false], [500, true], [503, true]] as const) {
    await withFetch(() => new Response("no", { status }), async () => {
      assertEquals(isRetryable(await assertRejects(() => claudeProvider("key").generate(input))), retry, String(status));
    });
  }
  await withFetch(() => new Response("<html>bad gateway</html>", { status: 200 }), async () => {
    const e = await assertRejects(() => idunifyProvider("key").generate(input), Error, "not JSON");
    assertEquals(isRetryable(e), true);
  });
});

Deno.test("idunify sends max_tokens", async () => {
  await withFetch(
    () => Response.json({ choices: [{ message: { content: answer }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 2 } }),
    async (calls) => {
      await idunifyProvider("key").generate(input);
      assertEquals(typeof calls[0].body.max_tokens, "number");
    },
  );
});

Deno.test("ollama calls its host and parses the answer", async () => {
  await withFetch(() => Response.json({ response: answer }), async (calls) => {
    assertEquals((await ollamaProvider("http://localhost:1").generate(input)).items.length, 1);
    assertEquals(calls[0].url, "http://localhost:1/api/generate");
  });
});

Deno.test("providerFromEnv: an IDUnify base URL that is not https falls back to the built-in planner", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  const base = { IDUNIFY_API_KEY: "k" };
  assertEquals(providerFromEnv(env({ ...base, IDUNIFY_BASE_URL: "https://ai.idunify.com/v1" })).name, "idunify");
  assertEquals(providerFromEnv(env({ ...base, IDUNIFY_BASE_URL: "https://AI.idunify.com:443/v1/" })).name, "idunify");
  assertEquals(providerFromEnv(env({ ...base })).name, "idunify");
  for (const bad of [
    "http://ai.example.com/v1", "ai.example.com/v1", "ftp://x", "", "not a url",
    // https, but not an allowed host: another domain, a look-alike, a user-info trick, an IP literal, a non-443 port.
    "https://ai.example.com/v1", "https://evil.example/v1", "https://ai.idunify.com.evil.example/v1", "https://ai.idunify.com.",
    "https://ai.idunify.com@evil.example/v1", "https://user:pw@ai.idunify.com/v1", "https://169.254.169.254/latest",
    "https://[::1]/v1", "https://0x7f000001/v1", "https://ai.idunify.com:8443/v1", "http://ai.idunify.com/v1",
  ]) {
    assertEquals(providerFromEnv(env({ ...base, IDUNIFY_BASE_URL: bad })).name, "basic", bad);
  }
  assertEquals(idunifyBaseUrl("https://ai.idunify.com/v1/?x=1#y"), "https://ai.idunify.com/v1");
  assertThrows(() => idunifyProvider("k", "https://evil.example/v1"));
});

Deno.test("providerFromEnv: Ollama only on this machine", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  const base = { KAVI_PLAN_PROVIDER: "ollama", KAVI_ALLOW_OLLAMA: "1" };
  for (const ok of ["http://localhost:11434", "http://127.0.0.1:11434", "http://[::1]:11434"]) {
    assertEquals(providerFromEnv(env({ ...base, OLLAMA_HOST: ok })).name, "ollama", ok);
  }
  for (const bad of ["http://evil.example", "http://evil.example:80", "http://localhost@evil.example", "http://10.0.0.5:11434", "http://localhost.evil.example", "file:///etc/passwd", "nope"]) {
    assertEquals(providerFromEnv(env({ ...base, OLLAMA_HOST: bad })).name, "basic", bad);
  }
  assertThrows(() => ollamaProvider("http://evil.example"));
});

Deno.test("each adapter sends our instructions as the system prompt and the household's data as the user message", async () => {
  const withAllergy = { ...input, allergies: ["Peanuts"] };
  await withFetch(() => Response.json({ content: [{ type: "text", text: answer }], stop_reason: "end_turn" }), async (calls) => {
    await claudeProvider("key").generate(withAllergy);
    const { system, messages } = calls[0].body;
    assertEquals(typeof system, "string");
    assertEquals(messages.length, 1);
    if (system.includes('"""Peanuts"""') || !messages[0].content.includes('"""Peanuts"""')) throw new Error("claude: data in the wrong part");
  });
  await withFetch(() => Response.json({ choices: [{ message: { content: answer }, finish_reason: "stop" }] }), async (calls) => {
    await idunifyProvider("key").generate(withAllergy);
    assertEquals(calls[0].url, "https://ai.idunify.com/v1/chat/completions");
    assertEquals(calls[0].body.messages.map((m: { role: string }) => m.role), ["system", "user"]);
    if (!calls[0].body.messages[1].content.includes('"""Peanuts"""')) throw new Error("idunify: data missing from the user message");
  });
  await withFetch(() => Response.json({ response: answer }), async (calls) => {
    await ollamaProvider("http://localhost:1").generate(withAllergy);
    assertEquals(typeof calls[0].body.system, "string");
    if (calls[0].body.system.includes('"""Peanuts"""')) throw new Error("ollama: data in the system prompt");
  });
});
