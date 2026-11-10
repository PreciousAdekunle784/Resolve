import "server-only";
import { AnthropicProvider } from "./anthropic";
import { AIError } from "./errors";
import { GeminiProvider } from "./gemini";
import type { AIProvider } from "./provider";
import { getAnthropicApiKey, getConfiguredProviderName, getGeminiApiKey } from "./provider-info";

/**
 * Returns the configured AI provider. AI runs only on the server; API keys are
 * read from server-side environment variables and never sent to the browser.
 *
 *   AI_PROVIDER          anthropic (default) | gemini
 *
 *   Anthropic:
 *   ANTHROPIC_API_KEY    required
 *   AI_MODEL             default: claude-opus-5-5
 *   AI_EFFORT            low | medium | high (default: medium)
 *   AI_REFUSAL_FALLBACK  "default" (on) or "off"
 *
 *   Google Gemini (free API keys from https://aistudio.google.com):
 *   GEMINI_API_KEY       required
 *   AI_MODEL             a model code from Google AI Studio (default: gemini-flash-latest)
 *   GEMINI_PAID_TIER     "true" only if billing is enabled (changes the privacy notice)
 */
export function isAIConfigured(): boolean {
  return getConfiguredProviderName() === "gemini" ? Boolean(getGeminiApiKey()) : Boolean(getAnthropicApiKey());
}

export function getAIProvider(): AIProvider {
  if (getConfiguredProviderName() === "gemini") {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new AIError("not_configured");
    return new GeminiProvider({
      apiKey,
      model: process.env.AI_MODEL?.trim() || "gemini-flash-latest",
      // Keep each attempt short so a slow model can't use up the whole request.
      timeoutMs: 60_000,
      baseUrl: process.env.GEMINI_BASE_URL || undefined,
    });
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new AIError("not_configured");
  const effort = (["low", "medium", "high", "xhigh", "max"] as const).find((e) => e === process.env.AI_EFFORT) ?? "medium";
  return new AnthropicProvider({
    apiKey,
    model: process.env.AI_MODEL?.trim() || "claude-opus-5-5",
    effort,
    useFallbacks: (process.env.AI_REFUSAL_FALLBACK ?? "default") !== "off",
    timeoutMs: 110_000,
  });
}

export { AIError } from "./errors";
