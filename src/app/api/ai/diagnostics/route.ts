import { ApiError, GoogleGenAI } from "@google/genai";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { rankFlashModels } from "@/lib/ai/gemini";
import { getConfiguredProviderName, getGeminiApiKey } from "@/lib/ai/provider-info";

export const maxDuration = 200;

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);

/** Never return anything that could contain the key. */
function describe(e: unknown): string {
  if (e instanceof ApiError) return `HTTP ${e.status}: ${String(e.message).replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").slice(0, 400)}`;
  if (e instanceof Error) return `${e.name}: ${e.message.slice(0, 200)}`;
  return String(e).slice(0, 200);
}

/**
 * Signed-in diagnostics for the AI connection: which provider is configured,
 * which Gemini models the key can use, and a timed test request. Returns no
 * secrets. Used to troubleshoot a deployment.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const provider = getConfiguredProviderName();
  if (provider !== "gemini") return jsonOk({ provider, note: "Diagnostics currently cover the Gemini provider only." });
  const apiKey = getGeminiApiKey();
  if (!apiKey) return jsonError(503, "No Gemini API key found (GEMINI_API_KEY).");

  const configuredModel = process.env.AI_MODEL?.trim() || "gemini-flash-latest";
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000, retryOptions: { attempts: 1 } } });
  const report: Record<string, unknown> = { provider, configuredModel, aiModelSet: Boolean(process.env.AI_MODEL?.trim()) };

  try {
    const started = Date.now();
    const pager = await withTimeout(client.models.list({ config: { pageSize: 200, queryBase: true } }), 20_000);
    const models: { name?: string; supportedActions?: string[] }[] = [];
    for await (const m of pager) models.push(m);
    report.listModels = { ok: true, ms: Date.now() - started, total: models.length, flashCandidates: rankFlashModels(models).slice(0, 8) };
  } catch (e) {
    report.listModels = { ok: false, error: describe(e) };
  }

  // Optional ?models=a,b,c to test specific models (max 5).
  const requested = (new URL(request.url).searchParams.get("models") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^gemini-[a-z0-9.-]{1,60}$/i.test(m))
    .slice(0, 5);
  const candidates = requested.length
    ? requested
    : Array.from(new Set([configuredModel, ...(((report.listModels as { flashCandidates?: string[] })?.flashCandidates ?? []).slice(0, 2))]));
  const tests: Record<string, unknown>[] = [];
  for (const model of candidates) {
    const started = Date.now();
    try {
      const r = await withTimeout(
        client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: 'Reply with the JSON {"ok": true}' }] }],
          config: { responseMimeType: "application/json", maxOutputTokens: 200 },
        }),
        30_000,
      );
      tests.push({ model, ok: true, ms: Date.now() - started, finishReason: r.candidates?.[0]?.finishReason, text: (r.text ?? "").slice(0, 80), modelVersion: r.modelVersion });
    } catch (e) {
      tests.push({ model, ok: false, ms: Date.now() - started, error: describe(e) });
    }
  }
  report.testRequests = tests;
  return jsonOk(report);
}
