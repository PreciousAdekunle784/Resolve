import type { ZodType } from "zod";

/**
 * Provider-neutral interface for AI tasks. Resolve's features depend only on
 * this interface, so the model vendor can be replaced by adding another
 * implementation (see anthropic.ts) and selecting it with AI_PROVIDER.
 */

export type AIContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg"; base64: string }
  | { type: "pdf"; base64: string };

export interface StructuredRequest<T> {
  /** Stable instructions for the task. */
  system: string;
  /** User content: text plus optional images/PDFs. */
  content: AIContentPart[];
  /** Zod schema the result must satisfy. */
  schema: ZodType<T>;
  /** Upper bound on output length. */
  maxOutputTokens?: number;
}

export interface StructuredResponse<T> {
  data: T;
  /** Identifier of the model that produced the result (stored for audit). */
  model: string;
}

export interface AIProvider {
  readonly name: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>>;
}
