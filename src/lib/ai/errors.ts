export type AIErrorCode =
  | "not_configured"
  | "provider_auth_failed"
  | "model_unavailable"
  | "consent_required"
  | "rate_limited"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "invalid_response"
  | "refused"
  | "input_too_large"
  | "unsupported_file";

const MESSAGES: Record<AIErrorCode, string> = {
  not_configured:
    "AI features aren't set up yet (no AI API key found). You can still use Resolve manually, including a template complaint. (Site owner: set AI_PROVIDER=gemini and GEMINI_API_KEY, then redeploy.)",
  provider_auth_failed:
    "The AI service rejected this site's API key, so AI features are unavailable. You can still use Resolve manually, including a template complaint. (Site owner: check the API key value, then redeploy.)",
  model_unavailable:
    "The AI model this site is set to use isn't available. You can still use Resolve manually, including a template complaint. (Site owner: set AI_MODEL to a model code listed in Google AI Studio, or leave it empty, then redeploy.)",
  consent_required: "AI analysis needs your permission. You can turn it on in Settings → Privacy.",
  rate_limited: "You've used AI features a lot in a short time. Please wait a few minutes and try again.",
  provider_rate_limited: "The AI service is busy right now. Please try again in a minute.",
  provider_unavailable: "The AI service is temporarily unavailable. Your information is saved — please try again shortly.",
  timeout: "The AI took too long to respond. Your information is saved — please try again.",
  invalid_response: "The AI returned a response we couldn't verify, so we didn't save it. Please try again.",
  refused: "The AI couldn't help with this request. You can continue manually or try again later.",
  input_too_large: "There is too much information to analyse at once. Try removing some very large files.",
  unsupported_file: "This file can't be read automatically, but it is still saved as evidence.",
};

/** An AI failure with a safe, user-facing message (never leaks provider details). */
export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  constructor(code: AIErrorCode, detail?: string) {
    super(detail ?? MESSAGES[code]);
    this.name = "AIError";
    this.code = code;
    this.retryable = ["provider_rate_limited", "provider_unavailable", "timeout", "invalid_response", "rate_limited"].includes(code);
  }
  get userMessage(): string {
    return MESSAGES[this.code];
  }
  get httpStatus(): number {
    switch (this.code) {
      case "not_configured":
      case "provider_auth_failed":
      case "model_unavailable":
        return 503;
      case "consent_required":
        return 403;
      case "rate_limited":
      case "provider_rate_limited":
        return 429;
      case "timeout":
        return 504;
      case "input_too_large":
      case "unsupported_file":
        return 413;
      default:
        return 502;
    }
  }
}
