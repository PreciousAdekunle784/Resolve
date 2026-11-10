/**
 * Describes the configured AI provider so the app can tell users, accurately,
 * where their data goes when they opt in to AI features. Server-side only
 * (reads non-public environment variables); pass the result to client
 * components as props.
 */

export type AIProviderName = "anthropic" | "gemini";

export interface AIProviderInfo {
  provider: AIProviderName;
  /** Company name shown to users. */
  company: string;
  /**
   * True when the provider's terms allow it to use submitted content to
   * improve its products (e.g. Google's free Gemini API tier).
   */
  mayUseDataForTraining: boolean;
}

const cleanEnv = (v: string | undefined) => v?.trim().replace(/^["'`]+|["'`]+$/g, "").trim() || undefined;

/** The Gemini API key (GEMINI_API_KEY, or the common alternatives GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY). */
export function getGeminiApiKey(): string | undefined {
  return cleanEnv(process.env.GEMINI_API_KEY) ?? cleanEnv(process.env.GOOGLE_API_KEY) ?? cleanEnv(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function getAnthropicApiKey(): string | undefined {
  return cleanEnv(process.env.ANTHROPIC_API_KEY);
}

/**
 * The AI provider to use. AI_PROVIDER is matched case-insensitively ("Gemini",
 * "google" and "gemini" all work). If it isn't set, Gemini is chosen when only
 * a Gemini key is present.
 */
export function getConfiguredProviderName(): AIProviderName {
  const chosen = cleanEnv(process.env.AI_PROVIDER)?.toLowerCase();
  if (chosen === "gemini" || chosen === "google" || chosen === "google-gemini") return "gemini";
  if (chosen === "anthropic" || chosen === "claude") return "anthropic";
  return getGeminiApiKey() && !getAnthropicApiKey() ? "gemini" : "anthropic";
}

export function getAIProviderInfo(): AIProviderInfo {
  if (getConfiguredProviderName() === "gemini") {
    return {
      provider: "gemini",
      company: "Google (Gemini API)",
      // Google's free tier may use content to improve its products. Set
      // GEMINI_PAID_TIER=true only if billing is enabled on the API key's project.
      mayUseDataForTraining: process.env.GEMINI_PAID_TIER !== "true",
    };
  }
  return { provider: "anthropic", company: "Anthropic", mayUseDataForTraining: false };
}

/** The sentence about provider data use shown wherever users give AI consent. */
export function aiDataUseNotice(info: AIProviderInfo): string {
  return info.mayUseDataForTraining
    ? `This installation uses the free tier of ${info.company}. Under its terms, Google may use submitted content to improve its products and people may review it, so do not include anything you are not comfortable sharing. Resolve itself does not use your data to train AI models.`
    : `Your case details are processed by ${info.company}. Resolve does not use your data to train AI models.`;
}
