import { basicPlan } from "./planner.ts";
import { buildMessages, parsePlan, ProviderError, type PlanInput, type PlanProvider } from "./provider.ts";

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
      // Our fixed instructions go in the system prompt; the household's data is the only user message.
      const { system, user } = buildMessages(input);
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
          system,
          messages: [{ role: "user", content: user }],
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

// IDUnify AI: an OpenAI-style proxy. Key and base URL come from Edge Function secrets, never the client. A base URL that
// is not an allowed IDUnify host (see idunifyBaseUrl) throws here, so the key can only ever be sent to IDUnify.
export function idunifyProvider(apiKey: string, baseUrl = "https://ai.idunify.com/v1", model = "gemma4:31b"): PlanProvider {
  const base = idunifyBaseUrl(baseUrl);
  if (!base) throw new Error("IDUnify base URL is not an allowed https IDUnify host");
  return {
    name: "idunify",
    async generate(input: PlanInput, onUsage) {
      const { system, user } = buildMessages(input);
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        // Never follow a redirect off the allowed host with the household's data.
        redirect: "error",
        headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          feature: "kavi.plan",
          user: "kavi-planner",
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
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

// Dev only: local Ollama for testing without API cost. Only on this machine (see ollamaBaseUrl); any other host throws.
export function ollamaProvider(host = "http://localhost:11434", model = "llama3.1:8b"): PlanProvider {
  const base = ollamaBaseUrl(host);
  if (!base) throw new Error("Ollama host must be localhost, 127.0.0.1 or [::1]");
  return {
    name: "ollama",
    async generate(input: PlanInput) {
      const { system, user } = buildMessages(input);
      const res = await fetch(`${base}/api/generate`, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          system,
          prompt: user,
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

// The only hosts the IDUnify key may be sent to. Add a host here (in code review), never through an env var.
export const IDUNIFY_HOSTS: readonly string[] = ["ai.idunify.com"];
const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

const parseUrl = (value: unknown): URL | null => {
  if (typeof value !== "string") return null;
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
};
// An IP address written as the host (IPv4 in any form the URL parser accepts, or IPv6 in brackets).
const isIpHost = (hostname: string) => hostname.startsWith("[") || /^[0-9.]+$/.test(hostname) || /^0x/i.test(hostname);

// The IDUnify base URL to use, without a trailing slash, query or fragment, or null when it is not allowed: it must be
// https, name one of IDUNIFY_HOSTS exactly (no IP address, no user name or password, no port other than 443).
export function idunifyBaseUrl(value: unknown): string | null {
  const u = parseUrl(value);
  if (!u || u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (isIpHost(host) || !IDUNIFY_HOSTS.includes(host)) return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

// The Ollama base URL to use, or null unless it is http(s) on this machine: localhost, 127.0.0.1 or [::1].
export function ollamaBaseUrl(value: unknown): string | null {
  const u = parseUrl(value);
  if (!u || !["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
  if (!LOOPBACK_HOSTS.includes(u.hostname.toLowerCase())) return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
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
    // The key is sent in the Authorization header, so it may only go to an allowed IDUnify host over https: not in the
    // clear, not to a look-alike or "user@host" URL, not to an IP address. Anything else is the built-in planner.
    const baseUrl = env("IDUNIFY_BASE_URL");
    if (baseUrl !== undefined && !idunifyBaseUrl(baseUrl)) {
      console.error(`providerFromEnv: IDUNIFY_BASE_URL must be https on ${IDUNIFY_HOSTS.join(" or ")}; using the built-in planner`);
      return basicProvider();
    }
    return idunifyProvider(key, baseUrl, env("IDUNIFY_MODEL"));
  }
  if (choice === "ollama" && env("KAVI_ALLOW_OLLAMA") === "1") {
    const host = env("OLLAMA_HOST");
    if (host !== undefined && !ollamaBaseUrl(host)) {
      console.error("providerFromEnv: OLLAMA_HOST must be localhost, 127.0.0.1 or [::1]; using the built-in planner");
      return basicProvider();
    }
    return ollamaProvider(host, env("OLLAMA_MODEL"));
  }
  if (choice !== "basic") console.error(`providerFromEnv: "${choice}" is not an allowed planner here; using the built-in planner`);
  return basicProvider();
}

// Wraps a paid planner so every request it is about to send is reported first (generate-plan records it on the claimed
// row). A call that times out reports no tokens, so counting attempts is what keeps timeouts inside the caps. If the
// attempt cannot be recorded, the call is not made: a non-retryable error, so the built-in planner answers instead.
export function countingProvider(provider: PlanProvider, beforeAttempt: () => Promise<void>): PlanProvider {
  return {
    name: provider.name,
    async generate(input, onUsage) {
      try {
        await beforeAttempt();
      } catch (e) {
        throw new ProviderError(`could not record the ${provider.name} attempt: ${(e as Error).message}`, false);
      }
      return provider.generate(input, onUsage);
    },
  };
}
