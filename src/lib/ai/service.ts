import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addCaseEvent } from "@/lib/cases";
import { confirmedFactTexts } from "@/lib/complaint-template";
import { CONTACT_METHOD_LABELS, EVIDENCE_BUCKET, ISSUE_CATEGORY_INFO, PAYMENT_CHANNEL_LABELS } from "@/lib/constants";
import { formatDate, formatMoneyPlain } from "@/lib/format";
import { getRelevantGuidance } from "@/lib/guidance";
import type { CaseRow, EvidenceRow, GuidanceRow, Profile } from "@/lib/types";
import { AIError } from "./errors";
import { documentTextsFromExtractions, findUnsupportedDetails, groundCaseAnalysis } from "./grounding";
import { getAIProvider, isAIConfigured } from "./index";
import { CASE_ANALYSIS_SYSTEM, COMPLAINT_SYSTEM, EVIDENCE_EXTRACTION_SYSTEM } from "./prompts";
import {
  caseAnalysisSchema,
  complaintDraftSchema,
  evidenceExtractionSchema,
  type EvidenceExtraction,
  type StoredCaseAnalysis,
} from "./schemas";

const MAX_IMAGE_BYTES_FOR_AI = 5 * 1024 * 1024; // provider limit for images

type UsageKind = "case_analysis" | "evidence_extraction" | "complaint_generation" | "complaint_review" | "response_analysis" | "recovery_plan";

/** Checks configuration, the user's consent and the per-user rate limit. */
export async function ensureAIAllowed(supabase: SupabaseClient, profile: Profile, kind: UsageKind) {
  if (!isAIConfigured()) throw new AIError("not_configured");
  if (!profile.ai_processing_consent) throw new AIError("consent_required");
  const perHour = Number(process.env.AI_RATE_LIMIT_PER_HOUR) > 0 ? Number(process.env.AI_RATE_LIMIT_PER_HOUR) : 10;
  const { data, error } = await supabase.rpc("consume_ai_quota", {
    p_kind: kind,
    p_limit_per_hour: perHour,
    p_limit_per_minute: 3,
  });
  if (error) throw new AIError("provider_unavailable", "Could not check AI usage limits.");
  if (data !== true) throw new AIError("rate_limited");
}

const escape = (v: string) => v.replace(/</g, "‹").replace(/>/g, "›");

function caseFactsBlock(c: CaseRow): string {
  const lines = [
    `Case number: ${c.case_number}`,
    `Problem type selected by user: ${c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].label : "not selected"}`,
    `Institution: ${c.institution_name ?? "not provided"}`,
    `Amount: ${c.amount ? formatMoneyPlain(c.amount, c.currency) : "not provided"}`,
    `Transaction date and time (Nigeria time): ${c.transaction_date ? formatDate(c.transaction_date, { withTime: true }) : "not provided"}`,
    `Transaction date (ISO): ${c.transaction_date ?? "not provided"}`,
    `Transaction reference: ${c.transaction_reference ?? "not provided"}`,
    `Payment channel: ${c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : "not provided"}`,
    `Recipient / payee details: ${c.recipient_details ?? "not provided"}`,
    `Description of what happened: ${c.incident_description ?? "not provided"}`,
    `Previous attempts to resolve: ${c.previous_attempts ?? "not provided"}`,
    `Resolution the user wants: ${c.requested_resolution ?? "not provided"}`,
    `Case status in Resolve: ${c.status}`,
    `Institution complaint reference: ${c.institution_reference ?? "not provided"}`,
  ];
  const answers = c.supplementary_info.map((s) => `Q: ${s.question}\nA: ${s.answer}`).join("\n");
  return `${lines.map(escape).join("\n")}${answers ? `\nAnswers to follow-up questions:\n${escape(answers)}` : ""}`;
}

function userTextsFor(c: CaseRow): string[] {
  return [
    c.institution_name,
    c.amount === null ? null : String(c.amount),
    c.currency,
    c.transaction_date,
    c.transaction_date ? formatDate(c.transaction_date, { withTime: true }) : null,
    c.transaction_reference,
    c.recipient_details,
    c.incident_description,
    c.previous_attempts,
    c.requested_resolution,
    c.institution_reference,
    c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : null,
    ...c.supplementary_info.map((s) => s.answer),
  ].filter((v): v is string => Boolean(v));
}

// ---------------------------------------------------------------------------
// Evidence extraction
// ---------------------------------------------------------------------------

export async function extractEvidence(
  supabase: SupabaseClient,
  userId: string,
  row: EvidenceRow,
): Promise<EvidenceExtraction | null> {
  const setStatus = (extraction_status: EvidenceRow["extraction_status"], extraction_error: string | null = null) =>
    supabase.from("evidence").update({ extraction_status, extraction_error }).eq("id", row.id);

  if (row.mime_type.startsWith("image/") && row.file_size > MAX_IMAGE_BYTES_FOR_AI) {
    await setStatus("unsupported", "Images over 5 MB can't be read automatically. The file is still saved as evidence.");
    return null;
  }

  await setStatus("processing");
  try {
    const { data: blob, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(row.file_path);
    if (error || !blob) throw new AIError("provider_unavailable", "Could not read the stored file.");
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    const provider = getAIProvider();
    const { data, model } = await provider.generateStructured({
      system: EVIDENCE_EXTRACTION_SYSTEM,
      schema: evidenceExtractionSchema,
      maxOutputTokens: 8000,
      content: [
        row.mime_type === "application/pdf"
          ? { type: "pdf", base64 }
          : { type: "image", mediaType: row.mime_type as "image/png" | "image/jpeg", base64 },
        {
          type: "text",
          text: `<document>\nFile name: ${escape(row.original_filename)}\nUser's description: ${escape(row.description ?? "none")}\n</document>\nExtract what this document visibly shows.`,
        },
      ],
    });

    const { error: insertError } = await supabase.from("ai_analyses").insert({
      case_id: row.case_id,
      user_id: userId,
      evidence_id: row.id,
      analysis_type: "evidence_extraction",
      structured_result: data,
      model_identifier: model,
    });
    if (insertError) throw new AIError("provider_unavailable", "Could not save the extraction.");
    await setStatus("completed");
    await addCaseEvent(supabase, {
      caseId: row.case_id,
      userId,
      type: "evidence_extracted",
      description: `AI read ${row.original_filename}`,
      metadata: { evidence_id: row.id, readable: data.readable },
    });
    return data;
  } catch (error) {
    const err = error instanceof AIError ? error : new AIError("invalid_response");
    await setStatus("failed", err.userMessage.slice(0, 500));
    // Configuration/limit problems affect every file — stop and report them.
    if (["not_configured", "provider_auth_failed", "model_unavailable", "provider_rate_limited", "rate_limited"].includes(err.code)) throw err;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Case analysis
// ---------------------------------------------------------------------------

export async function runCaseAnalysis(supabase: SupabaseClient, userId: string, c: CaseRow, profile: Profile) {
  const { data: evidenceData, error: evidenceError } = await supabase
    .from("evidence")
    .select("*")
    .eq("case_id", c.id)
    .order("created_at");
  if (evidenceError) throw new AIError("provider_unavailable", "Could not load evidence.");
  const evidence = (evidenceData ?? []) as EvidenceRow[];

  // 1. Read any evidence that hasn't been read yet (up to 3 files at a time).
  const pending = evidence.filter((e) => e.extraction_status === "not_started" || e.extraction_status === "failed");
  for (let i = 0; i < pending.length; i += 3) {
    await Promise.all(pending.slice(i, i + 3).map((row) => extractEvidence(supabase, userId, row)));
  }

  // 2. Collect the latest extraction for each file.
  const { data: extractionRows } = await supabase
    .from("ai_analyses")
    .select("evidence_id, structured_result, created_at")
    .eq("case_id", c.id)
    .eq("analysis_type", "evidence_extraction")
    .order("created_at", { ascending: false });
  const latest = new Map<string, EvidenceExtraction>();
  for (const r of extractionRows ?? []) {
    const parsed = evidenceExtractionSchema.safeParse(r.structured_result);
    if (r.evidence_id && parsed.success && !latest.has(r.evidence_id as string)) latest.set(r.evidence_id as string, parsed.data);
  }

  // 3. Retrieve official guidance relevant to this case.
  let guidance: GuidanceRow[] = [];
  try {
    guidance = await getRelevantGuidance(supabase, { country: profile.country, category: c.issue_category });
  } catch {
    guidance = [];
  }

  const evidenceBlock = evidence
    .map((e) => {
      const x = latest.get(e.id);
      const header = `File: ${escape(e.original_filename)} | User's description: ${escape(e.description ?? "none")}`;
      if (!x) return `${header}\nExtraction: not available (${e.extraction_status})`;
      return `${header}\nExtraction (from the document): ${escape(JSON.stringify(x))}`;
    })
    .join("\n\n");

  const guidanceBlock = guidance
    .map(
      (g) =>
        `ID: ${g.id}\nTitle: ${g.title}\nInstitution: ${g.institution}\nStatus: ${g.status}${g.verified_at ? ` (verified ${formatDate(g.verified_at)})` : ""}\nApplies to: ${g.issue_category ?? "all problem types"}\nSource: ${g.source_url}\nContent: ${g.content}`,
    )
    .join("\n\n");

  const provider = getAIProvider();
  const { data, model } = await provider.generateStructured({
    system: CASE_ANALYSIS_SYSTEM,
    schema: caseAnalysisSchema,
    maxOutputTokens: 16000,
    content: [
      {
        type: "text",
        text: [
          `Today's date: ${formatDate(new Date())}`,
          `<case_data>\n${caseFactsBlock(c)}\n</case_data>`,
          `<case_data type="evidence">\n${evidenceBlock || "No evidence uploaded."}\n</case_data>`,
          `<guidance>\n${guidanceBlock || "No guidance records available."}\n</guidance>`,
          "Analyse this case following your instructions.",
        ].join("\n\n"),
      },
    ],
  });

  const grounded: StoredCaseAnalysis = groundCaseAnalysis(data, {
    userTexts: userTextsFor(c),
    documentTexts: documentTextsFromExtractions(Array.from(latest.values())),
    guidanceIds: guidance.map((g) => g.id),
  });

  const { data: saved, error } = await supabase
    .from("ai_analyses")
    .insert({
      case_id: c.id,
      user_id: userId,
      analysis_type: "case_analysis",
      structured_result: grounded,
      model_identifier: model,
    })
    .select("id")
    .single();
  if (error || !saved) throw new AIError("provider_unavailable", "Could not save the analysis.");

  await addCaseEvent(supabase, {
    caseId: c.id,
    userId,
    type: "analysis_generated",
    description: "AI case analysis generated",
    metadata: { analysis_id: saved.id, model },
  });
  return { id: saved.id as string, analysis: grounded };
}

// ---------------------------------------------------------------------------
// Complaint generation
// ---------------------------------------------------------------------------

export async function generateComplaint(supabase: SupabaseClient, userId: string, c: CaseRow, profile: Profile) {
  const { data: evidenceData } = await supabase
    .from("evidence")
    .select("original_filename, description")
    .eq("case_id", c.id)
    .order("created_at");
  const evidence = (evidenceData ?? []) as Pick<EvidenceRow, "original_filename" | "description">[];

  const customer = [
    `Customer name: ${profile.full_name ?? "not provided"}`,
    `Account type: ${profile.account_type ?? "not provided"}${profile.business_name ? ` (${profile.business_name})` : ""}`,
    `Email: ${profile.email}`,
    `Phone: ${profile.phone ?? "not provided"}`,
    `Preferred contact method: ${CONTACT_METHOD_LABELS[profile.preferred_contact_method]}`,
  ].map(escape);
  const files = evidence.map((e) => `- ${escape(e.description ? `${e.description} (${e.original_filename})` : e.original_filename)}`);

  const provider = getAIProvider();
  const { data, model } = await provider.generateStructured({
    system: COMPLAINT_SYSTEM,
    schema: complaintDraftSchema,
    maxOutputTokens: 8000,
    content: [
      {
        type: "text",
        text: [
          `Letter date: ${formatDate(new Date())}`,
          `<case_data>\n${customer.join("\n")}\n\n${caseFactsBlock(c)}\n\nEvidence the customer will enclose:\n${files.join("\n") || "none listed"}\n</case_data>`,
          "Write the complaint letter following your instructions.",
        ].join("\n\n"),
      },
    ],
  });

  const unsupported = findUnsupportedDetails(`${data.subject}\n${data.body}`, confirmedFactTexts(c, profile, evidence));
  return { draft: data, model, unsupported };
}
