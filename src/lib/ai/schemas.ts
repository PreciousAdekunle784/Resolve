import { z } from "zod";
import { ISSUE_CATEGORIES } from "@/lib/constants";

/**
 * Structured output schemas for every AI task. The model is constrained to
 * these shapes, and every response is validated again with Zod before it is
 * saved. Nullable fields are used instead of optional ones for compatibility
 * with structured outputs.
 */

export const FACT_SOURCES = ["user_provided", "document_extracted", "ai_inferred", "unverified"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export const CASE_FIELDS = [
  "amount",
  "currency",
  "transaction_date",
  "transaction_reference",
  "institution_name",
  "payment_channel",
  "recipient_details",
  "none",
] as const;
export type CaseField = (typeof CASE_FIELDS)[number];

const confidence = z.enum(["high", "medium", "low"]);

// ---------------------------------------------------------------------------
// Evidence extraction (one per uploaded file)
// ---------------------------------------------------------------------------

export const evidenceExtractionSchema = z.object({
  readable: z.boolean().describe("False if the document is blank, illegible or not related to a transaction."),
  document_type: z.enum([
    "transfer_receipt",
    "debit_alert",
    "account_statement",
    "app_screenshot",
    "message_from_institution",
    "other",
  ]),
  summary: z.string().describe("One or two plain sentences describing what the document shows."),
  extracted_fields: z
    .array(
      z.object({
        field: z.enum([
          "amount",
          "currency",
          "transaction_date",
          "transaction_time",
          "transaction_reference",
          "institution_name",
          "sender_name",
          "recipient_name",
          "recipient_account",
          "recipient_institution",
          "transaction_status",
          "narration",
          "other",
        ]),
        label: z.string(),
        exact_text: z.string().describe("The text exactly as it appears in the document. Never reformat or complete it."),
        confidence,
      }),
    )
    .describe("Only fields that are clearly visible in the document."),
  status_shown: z.string().nullable().describe('Status text shown on the document (e.g. "Successful", "Pending"), or null.'),
  caveats: z.array(z.string()).describe("Limitations, e.g. cropped image, partially hidden text, or that a status is not proof of settlement."),
  sensitive_data_visible: z.boolean().describe("True if a PIN, OTP, password, BVN, NIN or full card number is visible."),
});
export type EvidenceExtraction = z.infer<typeof evidenceExtractionSchema>;

// ---------------------------------------------------------------------------
// Case analysis
// ---------------------------------------------------------------------------

export const caseAnalysisSchema = z.object({
  summary: z.string().describe("A neutral, plain-language summary of what happened, using only provided information."),
  category_assessment: z.object({
    likely_category: z.enum([...ISSUE_CATEGORIES, "unclear"]),
    matches_selected_category: z.boolean(),
    confidence,
    explanation: z.string(),
  }),
  key_facts: z.array(
    z.object({
      label: z.string(),
      value: z.string().describe("The fact as a human-readable value."),
      normalized_value: z
        .string()
        .nullable()
        .describe(
          "Machine-readable value for case fields: amount as plain decimal (e.g. 25000.00); transaction_date as ISO 8601 with offset (e.g. 2026-03-12T14:32:00+01:00) ONLY if both date and time are known; otherwise null.",
        ),
      source: z.enum(FACT_SOURCES),
      source_detail: z.string().describe('Where it came from, e.g. "Your report", "receipt.png", "AI interpretation".'),
      case_field: z.enum(CASE_FIELDS),
    }),
  ),
  missing_information: z.array(
    z.object({
      item: z.string(),
      why_it_matters: z.string(),
      importance: z.enum(["required", "helpful"]),
    }),
  ),
  conflicts: z.array(
    z.object({
      description: z.string(),
      values: z.array(z.object({ source: z.string(), value: z.string() })),
      how_to_resolve: z.string(),
    }),
  ),
  follow_up_questions: z.array(z.object({ question: z.string(), reason: z.string() })).describe("At most 5 questions."),
  next_steps: z.array(z.object({ title: z.string(), detail: z.string() })),
  evidence_suggestions: z.array(z.object({ item: z.string(), reason: z.string(), already_provided: z.boolean() })),
  guidance_references: z
    .array(z.object({ guidance_id: z.string(), relevance: z.string() }))
    .describe("Only IDs from the provided guidance list."),
  important_cautions: z.array(z.string()),
});
export type CaseAnalysis = z.infer<typeof caseAnalysisSchema>;

/** What we store: the model output plus Resolve's own grounding checks. */
export type StoredCaseAnalysis = CaseAnalysis & {
  grounding: { checked_at: string; downgraded_facts: string[]; removed_guidance_ids: string[] };
};

// ---------------------------------------------------------------------------
// Complaint draft
// ---------------------------------------------------------------------------

export const complaintDraftSchema = z.object({
  subject: z.string().describe("A clear subject line for the complaint."),
  body: z.string().describe("The full complaint letter as plain text, with paragraphs separated by blank lines."),
  missing_placeholders: z
    .array(z.string())
    .describe("Every [ADD: ...] placeholder used for information that was not provided."),
});
export type ComplaintDraftOutput = z.infer<typeof complaintDraftSchema>;
