import { basicPlan } from "./planner.ts";
import { buildPrompt, parsePlan, ProviderError, type PlanInput, type PlanProvider } from "./provider.ts";

const CLAUDE_TIMEOUT_MS = 40_000;
const OLLAMA_TIMEOUT_MS = 60_000;
// A week is 21 short objects, about 1,000 tokens; this leaves room and still bounds what one call can cost.
const MAX_OUTPUT_TOKENS = 2048;

// A rejected request (4xx, including a bad key or a rate limit) fails the same way every time, so it is not retried;
// a server error may pass.
const httpError = (who: string, status: number) => new ProviderError(`${who} request failed: ${status}`, status >= 500, status);

// A body that is not JSON (a proxy error page, a cut-off response) is an unusable answer, which a retry may fix.
async function readJson(res: Response, who: string): Promise<any> {
  try {
    return await res.json();
  } catch {
    throw new ProviderError(`${who} returned a body that is not JSON`, true, res.status);
  }
}

// Production: Claude API. Key is read from an Edge Function secret, never sent to the client.
export function claudeProvider(apiKey: string, model = "claude-sonnet-5-5"): PlanProvider {
  return {
    name: "claude",
    async generate(input: PlanInput, onUsage) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [{ role: "user", content: buildPrompt(input) }],
        }),
        // A hung call must fail so the retry and the built-in fallback can run, not hold the request open.
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
      });
      if (!res.ok) throw httpError("Claude", res.status);
      const data = await readJson(res, "Claude");
      onUsage?.({ model, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 });
      // Cut off at the token limit: the JSON is incomplete, so say why rather than fail to parse it.
      if (data.stop_reason === "max_tokens") throw new ProviderError("Claude stopped at the token limit before finishing the plan", true);
      const text = data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
      return parsePlan(text, input);
    },
  };
}

// IDUnify AI: an OpenAI-style proxy. Key and base URL come from Edge Function secrets, never the client.
export function idunifyProvider(apiKey: string, baseUrl = "https://ai.idunify.com/v1", model = "gemma4:31b"): PlanProvider {
  return {
    name: "idunify",
    async generate(input: PlanInput, onUsage) {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          feature: "kavi.plan",
          user: "kavi-planner",
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [{ role: "user", content: buildPrompt(input) }],
        }),
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
      });
      if (!res.ok) throw httpError("IDUnify", res.status);
      const data = await readJson(res, "IDUnify");
      onUsage?.({ model, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 });
      if (data.choices?.[0]?.finish_reason === "length") throw new ProviderError("IDUnify stopped at the token limit before finishing the plan", true);
      return parsePlan(data.choices?.[0]?.message?.content ?? "", input);
    },
  };
}

// Dev only: local Ollama for testing without API cost.
export function ollamaProvider(host = "http://localhost:11434", model = "llama3.1:8b"): PlanProvider {
  return {
    name: "ollama",
    async generate(input: PlanInput) {
      const res = await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: buildPrompt(input),
          format: "json",
          stream: false,
        }),
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      });
      if (!res.ok) throw httpError("Ollama", res.status);
      const data = await readJson(res, "Ollama");
      return parsePlan(data.response ?? "", input);
    },
  };
}

// Built in: no model and no cost. Used until an AI key is set, when the household has not agreed to AI planning, and as
// the fallback when a model fails. Nothing leaves the function.
export function basicProvider(rng?: () => number): PlanProvider {
  return {
    name: "basic",
    generate: (input: PlanInput) => Promise.resolve(basicPlan(input, rng)),
  };
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// Picks the provider from env, from a fixed allowed set. Claude when ANTHROPIC_API_KEY is set, else IDUnify when
// IDUNIFY_API_KEY is (KAVI_PLAN_PROVIDER can name "claude", "idunify" or "basic" to force one). Ollama only when
// KAVI_ALLOW_OLLAMA=1 is also set, so a stray setting in production cannot send households' data to an unknown host.
// Anything else, including a typo, is the built-in planner: it fails closed, never to a paid or unlisted API.
export function providerFromEnv(env: (key: string) => string | undefined): PlanProvider {
  const choice = env("KAVI_PLAN_PROVIDER") ?? (env("ANTHROPIC_API_KEY") ? "claude" : env("IDUNIFY_API_KEY") ? "idunify" : "basic");
  if (choice === "claude") {
    const key = env("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    return claudeProvider(key);
  }
  if (choice === "idunify") {
    const key = env("IDUNIFY_API_KEY");
    if (!key) throw new Error("IDUNIFY_API_KEY is not set");
    // The key is sent in the Authorization header, so a base URL that is not https would send it in the clear (or to
    // anywhere a typo points). Refuse it and use the built-in planner.
    const baseUrl = env("IDUNIFY_BASE_URL");
    if (baseUrl !== undefined && !isHttps(baseUrl)) {
      console.error("providerFromEnv: IDUNIFY_BASE_URL must be an https URL; using the built-in planner");
      return basicProvider();
    }
    return idunifyProvider(key, baseUrl, env("IDUNIFY_MODEL"));
  }
  if (choice === "ollama" && env("KAVI_ALLOW_OLLAMA") === "1") return ollamaProvider(env("OLLAMA_HOST"), env("OLLAMA_MODEL"));
  if (choice !== "basic") console.error(`providerFromEnv: "${choice}" is not an allowed planner here; using the built-in planner`);
  return basicProvider();
}
