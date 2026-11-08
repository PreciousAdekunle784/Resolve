import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AIError } from "./errors";
import type { AIContentPart, AIProvider, StructuredRequest, StructuredResponse } from "./provider";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Anthropic (Claude) implementation of the AI provider interface.
 * Uses structured outputs so responses must match the Zod schema, and the
 * server-side refusal fallback so a declined request is retried on a
 * recommended fallback model instead of failing outright.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;
  private effort: Effort;
  private useFallbacks: boolean;

  constructor(opts: { apiKey: string; model: string; effort: Effort; useFallbacks: boolean; timeoutMs: number }) {
    this.client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 1 });
    this.model = opts.model;
    this.effort = opts.effort;
    this.useFallbacks = opts.useFallbacks;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    const content: BetaContentBlockParam[] = request.content.map(toBlock);
    let message;
    try {
      message = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: request.maxOutputTokens ?? 16000,
        system: request.system,
        messages: [{ role: "user", content }],
        output_config: {
          effort: this.effort,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the helper's generic is narrower than our ZodType<T>.
          format: betaZodOutputFormat(request.schema as any),
        },
        ...(this.useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
    } catch (error) {
      throw mapError(error);
    }

    if (message.stop_reason === "refusal") throw new AIError("refused");
    if (message.stop_reason === "max_tokens") throw new AIError("invalid_response", "The AI response was cut off.");

    // Validate again ourselves — never trust model output without checking it.
    const checked = request.schema.safeParse(message.parsed_output);
    if (!checked.success) throw new AIError("invalid_response");
    return { data: checked.data, model: message.model ?? this.model };
  }
}

function toBlock(part: AIContentPart): BetaContentBlockParam {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.base64 } };
    case "pdf":
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: part.base64 } };
  }
}

function mapError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AIError("timeout");
  if (error instanceof Anthropic.APIConnectionError) return new AIError("provider_unavailable");
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("[ai] Anthropic authentication/permission error — check ANTHROPIC_API_KEY.");
    return new AIError("not_configured");
  }
  if (error instanceof Anthropic.RateLimitError) return new AIError("provider_rate_limited");
  if (error instanceof Anthropic.BadRequestError) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("too large") || msg.includes("too long") || msg.includes("exceed")) return new AIError("input_too_large");
    console.error("[ai] Anthropic rejected the request:", error.status);
    return new AIError("invalid_response");
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[ai] Anthropic API error:", error.status);
    return new AIError("provider_unavailable");
  }
  // Errors thrown while parsing the structured output.
  console.error("[ai] Unexpected AI error:", error instanceof Error ? error.name : typeof error);
  return new AIError("invalid_response");
}
