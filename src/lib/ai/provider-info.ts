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

export function getConfiguredProviderName(): AIProviderName {
  return process.env.AI_PROVIDER === "gemini" ? "gemini" : "anthropic";
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
