import { z } from "zod";

/**
 * Structured-output schemas for the AI-backed orchestration tools. Like the
 * other AI schemas, results are validated with Zod and then checked by
 * Resolve's own grounding rules before anything is shown or saved.
 */

// ---------------------------------------------------------------------------
// validate_complaint (AI review, advisory only)
// ---------------------------------------------------------------------------

export const complaintReviewSchema = z.object({
  summary: z.string().describe("One or two sentences on whether the letter is clear and complete."),
  issues: z
    .array(
      z.object({
        problem: z.string().describe("What is unclear, missing or inappropriate in the letter."),
        suggestion: z.string().describe("How the customer could fix it, without inventing facts."),
      }),
    )
    .describe("At most 6 issues. Empty if the letter is ready."),
  tone_ok: z.boolean().describe("True if the tone is firm, factual and polite."),
});
export type ComplaintReview = z.infer<typeof complaintReviewSchema>;

// ---------------------------------------------------------------------------
// analyze_bank_response
// ---------------------------------------------------------------------------

export const RESPONSE_CLASSIFICATIONS = [
  "acknowledgement",
  "information_requested",
  "under_investigation",
  "resolved_in_customer_favour",
  "partially_resolved",
  "declined",
  "referred_elsewhere",
  "unclear",
] as const;
export type ResponseClassification = (typeof RESPONSE_CLASSIFICATIONS)[number];

export const SUGGESTABLE_STATUSES = [
  "awaiting_institution_response",
  "additional_information_required",
  "ready_for_escalation",
  "resolved",
] as const;

const quoted = z.object({
  value: z.string(),
  quote: z.string().describe("The exact words from the reply that contain this value."),
});

export const bankResponseAnalysisSchema = z.object({
  classification: z.enum(RESPONSE_CLASSIFICATIONS),
  summary: z.string().describe("Plain-language summary of what the institution said, in 1-3 sentences."),
  reference_numbers: z.array(quoted).describe("Complaint/ticket/case reference numbers that appear in the reply."),
  information_requested: z.array(z.string()).describe("Each item the institution asked the customer to provide."),
  timeframes: z.array(z.object({ quote: z.string().describe("Exact words stating a timeframe or date.") })),
  amounts: z.array(quoted).describe("Amounts mentioned in the reply (e.g. a reversal amount)."),
  suggested_case_status: z.enum(SUGGESTABLE_STATUSES).nullable().describe("Null if the status should not change."),
  status_reason: z.string(),
  reply_points: z.array(z.string()).describe("Points the customer may want to include if they reply. No invented facts."),
  confidence: z.enum(["high", "medium", "low"]),
});
export type BankResponseAnalysis = z.infer<typeof bankResponseAnalysisSchema>;

/** What we store: the model output plus Resolve's grounding checks. */
export type StoredBankResponseAnalysis = BankResponseAnalysis & {
  grounding: { checked_at: string; removed: string[] };
};

// ---------------------------------------------------------------------------
// recommend_recovery
// ---------------------------------------------------------------------------

export const recoveryPlanSchema = z.object({
  situation: z.string().describe("Where the complaint stands now, in 1-3 sentences."),
  next_actions: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        timing: z.enum(["now", "when_bank_replies", "if_no_reply"]),
      }),
    )
    .describe("At most 5 actions, most important first."),
  escalation: z.object({
    consider_now: z.boolean(),
    explanation: z.string().describe("Never state deadlines unless they appear in verified guidance."),
    guidance_ids: z.array(z.string()).describe("Only IDs from the provided guidance list."),
  }),
  evidence_to_gather: z.array(z.string()),
  cautions: z.array(z.string()),
});
export type RecoveryPlan = z.infer<typeof recoveryPlanSchema>;
export type StoredRecoveryPlan = RecoveryPlan & { grounding: { checked_at: string; removed_guidance_ids: string[] } };
