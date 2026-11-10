import "server-only";
import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { z, type ZodType } from "zod";
import { AIError } from "./errors";
import type { AIContentPart, AIProvider, StructuredRequest, StructuredResponse } from "./provider";

/** Model found by automatic discovery after the configured one wasn't available (per server instance). */
const discoveredModels = new Map<string, string>();

/**
 * Chooses the best general-purpose "Flash" model from Google's model list:
 * stable before preview, full Flash before Flash-Lite, newest version first.
 */
export function pickFlashModel(models: { name?: string; supportedActions?: string[] }[]): string | null {
  return rankFlashModels(models)[0] ?? null;
}

/** All usable Flash models, best first. */
export function rankFlashModels(models: { name?: string; supportedActions?: string[] }[]): string[] {
  const names = models
    .filter((m) => m.name && (!m.supportedActions || m.supportedActions.includes("generateContent")))
    .map((m) => m.name!.replace(/^models\//, ""))
    .filter((n) => /^gemini-/i.test(n) && /flash/i.test(n))
    .filter((n) => !/(image|tts|audio|live|embed|robotics|computer|native|thinking|learnlm)/i.test(n));
  const version = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/i.exec(n)?.[1] ?? 0);
  const unstable = (n: string) => (/(preview|exp)/i.test(n) ? 1 : 0);
  const lite = (n: string) => (/lite/i.test(n) ? 1 : 0);
  names.sort((a, b) => unstable(a) - unstable(b) || lite(a) - lite(b) || version(b) - version(a) || a.length - b.length);
  return Array.from(new Set(names));
}

/**
 * Google Gemini implementation of the AI provider interface (works with a free
 * Google AI Studio API key). Uses JSON structured output with the task's JSON
 * Schema, and every response is validated again with Zod before use.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor(opts: { apiKey: string; model: string; timeoutMs: number; baseUrl?: string }) {
    this.client = new GoogleGenAI({
      apiKey: opts.apiKey,
      httpOptions: {
        timeout: opts.timeoutMs,
        // Report quota/rate limits straight away instead of silently retrying for minutes.
        retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 4, httpStatusCodes: [500, 502, 503, 504] },
        ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      },
    });
    this.model = opts.model;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    const configured = this.model;
    if (discoveredModels.has(configured)) this.model = discoveredModels.get(configured)!;
    try {
      return await this.generateWithSchema(request);
    } catch (error) {
      if (!(error instanceof AIError && error.code === "model_unavailable") || discoveredModels.has(configured)) throw error;
      // The configured model doesn't exist or has no free quota: try the best available Flash models.
      const tried = new Set([this.model]);
      const candidates = (await this.listFlashModels()).filter((m) => !tried.has(m)).slice(0, 3);
      let lastError: unknown = error;
      for (const candidate of candidates) {
        this.model = candidate;
        try {
          const result = await this.generateWithSchema(request);
          console.warn(`[ai] Gemini model "${configured}" unavailable; using "${candidate}" instead. Set AI_MODEL to choose a model.`);
          discoveredModels.set(configured, candidate);
          return result;
        } catch (e) {
          lastError = e;
          if (!(e instanceof AIError && e.code === "model_unavailable")) throw e;
        }
      }
      throw lastError;
    }
  }

  /** Asks Google which models this API key can use, best Flash models first. */
  private async listFlashModels(): Promise<string[]> {
    try {
      const pager = await this.client.models.list({ config: { pageSize: 200, queryBase: true } });
      const models: { name?: string; supportedActions?: string[] }[] = [];
      for await (const m of pager) models.push(m);
      return rankFlashModels(models);
    } catch (e) {
      console.error("[ai] Could not list Gemini models:", e instanceof ApiError ? e.status : e instanceof Error ? e.name : typeof e);
      return [];
    }
  }

  private async generateWithSchema<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    const jsonSchema = toGeminiJsonSchema(request.schema);
    const parts = request.content.map(toPart);
    try {
      return await this.call(request, parts, { responseJsonSchema: jsonSchema });
    } catch (error) {
      // If the API rejects the schema itself, retry once in plain JSON mode with
      // the schema in the instructions; Zod still validates the result.
      if (error instanceof ApiError && error.status === 400 && /schema/i.test(error.message)) {
        console.warn("[ai] Gemini rejected the response schema; retrying in JSON mode.");
        return this.call(request, parts, { schemaInPrompt: JSON.stringify(jsonSchema) }).catch((e) => {
          throw mapError(e);
        });
      }
      throw mapError(error);
    }
  }

  private async call<T>(
    request: StructuredRequest<T>,
    parts: Part[],
    opts: { responseJsonSchema?: unknown; schemaInPrompt?: string },
  ): Promise<StructuredResponse<T>> {
    const system = opts.schemaInPrompt
      ? `${request.system}\n\nRespond ONLY with a JSON object that matches this JSON Schema:\n${opts.schemaInPrompt}`
      : request.system;
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        ...(opts.responseJsonSchema ? { responseJsonSchema: opts.responseJsonSchema } : {}),
        maxOutputTokens: request.maxOutputTokens ?? 16000,
      },
    });

    if (response.promptFeedback?.blockReason) throw new AIError("refused");
    const candidate = response.candidates?.[0];
    const finish = String(candidate?.finishReason ?? "");
    if (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(finish)) throw new AIError("refused");
    if (finish === "MAX_TOKENS") throw new AIError("invalid_response", "The AI response was cut off.");

    const text = (candidate?.content?.parts ?? [])
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(stripCodeFence(text));
    } catch {
      throw new AIError("invalid_response");
    }
    // Validate ourselves — never trust model output without checking it.
    const checked = request.schema.safeParse(json);
    if (!checked.success) throw new AIError("invalid_response");
    return { data: checked.data, model: response.modelVersion ?? this.model };
  }
}

function toPart(part: AIContentPart): Part {
  switch (part.type) {
    case "text":
      return { text: part.text };
    case "image":
      return { inlineData: { mimeType: part.mediaType, data: part.base64 } };
    case "pdf":
      return { inlineData: { mimeType: "application/pdf", data: part.base64 } };
  }
}

/** Converts a Zod schema into the JSON Schema subset Gemini accepts. */
export function toGeminiJsonSchema(schema: ZodType<unknown>): unknown {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema") continue;
        out[k] = clean(v);
      }
      return out;
    }
    return node;
  };
  return clean(json);
}

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function mapError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof ApiError) {
    const msg = String(error.message ?? "").toLowerCase();
    if (error.status === 429) {
      // "limit: 0" means this model has no free-tier quota at all (paid only).
      if (/limit:\s*0\b/.test(msg)) {
        console.error("[ai] Gemini model has no free-tier quota for this key.");
        return new AIError("model_unavailable");
      }
      return new AIError("provider_rate_limited");
    }
    if (error.status === 401 || error.status === 403 || msg.includes("api key not valid") || msg.includes("api_key_invalid")) {
      console.error("[ai] Gemini rejected the API key — check GEMINI_API_KEY.");
      return new AIError("provider_auth_failed");
    }
    if (error.status === 404) {
      console.error("[ai] Gemini model not found — set AI_MODEL to a model code listed in Google AI Studio.");
      return new AIError("model_unavailable");
    }
    if (error.status === 400 && (msg.includes("too large") || msg.includes("exceeds") || msg.includes("too long"))) {
      return new AIError("input_too_large");
    }
    if (error.status >= 500) return new AIError("provider_unavailable");
    console.error("[ai] Gemini rejected the request:", error.status);
    return new AIError("invalid_response");
  }
  if (error instanceof Error && (error.name === "AbortError" || /timed? ?out|aborted/i.test(error.message))) {
    return new AIError("timeout");
  }
  if (error instanceof TypeError) return new AIError("provider_unavailable"); // network failure
  console.error("[ai] Unexpected Gemini error:", error instanceof Error ? error.name : typeof error);
  return new AIError("invalid_response");
}
