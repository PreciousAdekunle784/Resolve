import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AIError } from "./errors";
import { GeminiProvider, toGeminiJsonSchema } from "./gemini";
import { caseAnalysisSchema, complaintDraftSchema } from "./schemas";

type Reply = { status?: number; body: unknown };
let respond: (body: Record<string, unknown>, url: string) => Reply = () => ({ body: {} });
const requests: { url: string; body: Record<string, unknown> }[] = [];
let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    requests.push({ url: req.url ?? "", body });
    const r = respond(body, req.url ?? "");
    res.writeHead(r.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const provider = () => new GeminiProvider({ apiKey: "test-key", model: "gemini-test-flash", timeoutMs: 5000, baseUrl });
const ok = (text: string, finishReason = "STOP") => ({
  body: { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }], modelVersion: "gemini-test-flash-001" },
});
const err = (status: number, message: string, statusText: string) => ({ status, body: { error: { code: status, message, status: statusText } } });
const request = {
  system: "You write a formal complaint letter.",
  content: [
    { type: "text" as const, text: "<case_data>…</case_data>" },
    { type: "image" as const, mediaType: "image/png" as const, base64: "iVBORw0KGgo=" },
  ],
  schema: complaintDraftSchema,
};
const valid = { subject: "Complaint", body: "Dear Sir/Madam,\n\nText", missing_placeholders: [] };

describe("GeminiProvider", () => {
  it("sends instructions, files and the JSON schema, and returns validated data", async () => {
    requests.length = 0;
    respond = () => ok(JSON.stringify(valid));
    const result = await provider().generateStructured(request);
    expect(result).toEqual({ data: valid, model: "gemini-test-flash-001" });
    const sent = requests[0];
    expect(sent.url).toContain("gemini-test-flash:generateContent");
    const cfg = sent.body.generationConfig as Record<string, unknown>;
    expect(cfg.responseMimeType).toBe("application/json");
    expect(cfg.responseJsonSchema).toBeTruthy();
    expect(JSON.stringify(sent.body.systemInstruction)).toContain("formal complaint letter");
    expect(JSON.stringify(sent.body.contents)).toContain("image/png");
  });

  it("rejects responses that don't match the schema or aren't JSON", async () => {
    respond = () => ok(JSON.stringify({ subject: "only" }));
    await expect(provider().generateStructured(request)).rejects.toMatchObject({ code: "invalid_response" });
    respond = () => ok("Sure! Here's the letter…");
    await expect(provider().generateStructured(request)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("accepts JSON wrapped in a code fence", async () => {
    respond = () => ok("```json\n" + JSON.stringify(valid) + "\n```");
    await expect(provider().generateStructured(request)).resolves.toMatchObject({ data: valid });
  });

  it("treats blocked and truncated responses correctly", async () => {
    respond = () => ok("", "SAFETY");
    await expect(provider().generateStructured(request)).rejects.toMatchObject({ code: "refused" });
    respond = () => ({ body: { promptFeedback: { blockReason: "SAFETY" } } });
    await expect(provider().generateStructured(request)).rejects.toMatchObject({ code: "refused" });
    respond = () => ok('{"subject":"x","body":"Dear', "MAX_TOKENS");
    await expect(provider().generateStructured(request)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("maps free-tier rate limits, bad keys and unknown models to clear errors", async () => {
    respond = () => err(429, "Resource has been exhausted (e.g. check quota).", "RESOURCE_EXHAUSTED");
    await expect(provider().generateStructured(request)).rejects.toMatchObject({ code: "provider_rate_limited", retryable: true });
    respond = () => err(400, "API key not valid. Please pass a valid API key.", "INVALID_ARGUMENT");
    const bad = await provider().generateStructured(request).catch((e) => e);
    expect(bad).toBeInstanceOf(AIError);
    expect(bad.code).toBe("provider_auth_failed");
    expect(bad.userMessage).not.toMatch(/API key not valid/);
    respond = () => err(404, "models/gemini-test-flash is not found", "NOT_FOUND");
    await expect(provider().generateStructured(request)).rejects.toMatchObject({ code: "model_unavailable" });
  });

  it("retries in plain JSON mode if the API rejects the schema", async () => {
    requests.length = 0;
    respond = (body) =>
      (body.generationConfig as Record<string, unknown>).responseJsonSchema
        ? err(400, "Invalid JSON payload: response_json_schema is not supported", "INVALID_ARGUMENT")
        : ok(JSON.stringify(valid));
    await expect(provider().generateStructured(request)).resolves.toMatchObject({ data: valid });
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[1].body.systemInstruction)).toContain("JSON Schema");
  });
});

describe("toGeminiJsonSchema", () => {
  it("produces a plain JSON Schema without the $schema keyword", () => {
    const json = JSON.stringify(toGeminiJsonSchema(caseAnalysisSchema));
    expect(json).not.toContain("$schema");
    expect(json).toContain('"key_facts"');
    expect(json).toContain('"user_provided"');
  });
});
