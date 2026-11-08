import "server-only";
import { AnthropicProvider } from "./anthropic";
import { AIError } from "./errors";
import type { AIProvider } from "./provider";

/**
 * Returns the configured AI provider. AI runs only on the server; API keys are
 * read from server-side environment variables and never sent to the browser.
 *
 *   AI_PROVIDER        anthropic (default)
 *   ANTHROPIC_API_KEY  required for the anthropic provider
 *   AI_MODEL           default: claude-opus-5-5
 *   AI_EFFORT          low | medium | high (default: medium)
 *   AI_REFUSAL_FALLBACK  "default" (on) or "off"
 */
export function isAIConfigured(): boolean {
  const provider = process.env.AI_PROVIDER ?? "anthropic";
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  return false;
}

export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "anthropic";
  if (provider !== "anthropic") throw new AIError("not_configured");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AIError("not_configured");
  const effort = (["low", "medium", "high", "xhigh", "max"] as const).find((e) => e === process.env.AI_EFFORT) ?? "medium";
  return new AnthropicProvider({
    apiKey,
    model: process.env.AI_MODEL || "claude-opus-5-5",
    effort,
    useFallbacks: (process.env.AI_REFUSAL_FALLBACK ?? "default") !== "off",
    timeoutMs: 110_000,
  });
}

export { AIError } from "./errors";
