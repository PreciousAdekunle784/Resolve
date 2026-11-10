import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "./anthropic";
import { AIError } from "./errors";
import { complaintDraftSchema } from "./schemas";

/** Builds a provider whose HTTP calls are answered by `respond`. */
function providerWith(respond: (body: Record<string, unknown>) => { status?: number; json: unknown; headers?: Record<string, string> }) {
  const calls: Record<string, unknown>[] = [];
  const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push(body);
    const r = respond(body);
    return new Response(JSON.stringify(r.json), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  }) as typeof fetch;
  const provider = new AnthropicProvider({
    apiKey: "test",
    model: "claude-opus-5-5",
    effort: "medium",
    useFallbacks: true,
    timeoutMs: 5000,
    fetch: fakeFetch,
    maxRetries: 0,
  });
  return { provider, calls };
}

const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

const request = {
  system: "You write a formal complaint letter.",
  content: [{ type: "text" as const, text: "<case_data>…</case_data>" }],
  schema: complaintDraftSchema,
};

describe("AnthropicProvider structured output validation", () => {
  it("returns validated data for a schema-valid response", async () => {
    const valid = { subject: "Complaint", body: "Dear Sir/Madam,\n\nText", missing_placeholders: [] };
    const { provider, calls } = providerWith(() => ({ json: message(JSON.stringify(valid)) }));
    const result = await provider.generateStructured(request);
    expect(result.data).toEqual(valid);
    expect(result.model).toBe("claude-opus-5-5");
    // Structured output format and the refusal fallback are requested.
    expect((calls[0].output_config as { format?: unknown }).format).toBeTruthy();
    expect(calls[0].fallbacks).toBe("default");
  });

  it("rejects a response that doesn't match the schema", async () => {
    const { provider } = providerWith(() => ({ json: message(JSON.stringify({ subject: "x" })) }));
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects a response that isn't JSON", async () => {
    const { provider } = providerWith(() => ({ json: message("Sure! Here is your letter…") }));
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AIError);
  });

  it("treats a truncated response as invalid", async () => {
    const { provider } = providerWith(() => ({ json: message('{"subject":"x","body":"Dear', "max_tokens") }));
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("reports refusals clearly", async () => {
    const { provider } = providerWith(() => ({ json: { ...message(""), content: [], stop_reason: "refusal" } }));
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ code: "refused" });
  });

  it("maps provider rate limits", async () => {
    const { provider } = providerWith(() => ({
      status: 429,
      json: { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
    }));
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ code: "provider_rate_limited", retryable: true });
  });

  it("maps outages and bad credentials without leaking details", async () => {
    const outage = providerWith(() => ({ status: 529, json: { type: "error", error: { type: "overloaded_error", message: "overloaded" } } }));
    await expect(outage.provider.generateStructured(request)).rejects.toMatchObject({ code: "provider_unavailable" });
    const auth = providerWith(() => ({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }));
    const err = await auth.provider.generateStructured(request).catch((e) => e);
    expect(err.code).toBe("provider_auth_failed");
    expect(err.userMessage).not.toMatch(/x-api-key/);
  });
});
