import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIError } from "@/lib/ai/errors";
import { getAIProvider, isAIConfigured } from "@/lib/ai";
import { ensureAIAllowed, generateComplaint } from "@/lib/ai/service";
import { findBank } from "@/lib/banks";
import { confirmedFactTexts } from "@/lib/complaint-template";
import { CASE_STATUS_INFO, ISSUE_CATEGORY_INFO, PAYMENT_CHANNEL_LABELS } from "@/lib/constants";
import { isValidEmailAddress } from "@/lib/email/mime";
import { formatDate, formatMoneyPlain } from "@/lib/format";
import { getRelevantGuidance } from "@/lib/guidance";
import type {
  BankChannelRow,
  BankResponseRow,
  CaseRow,
  ComplaintDraftRow,
  EvidenceRow,
  GuidanceRow,
  Profile,
  SubmissionRow,
} from "@/lib/types";
import { checkComplaintBeforeSending, groundRecoveryPlan, groundResponseAnalysis, type ComplaintCheckResult } from "./checks";
import { COMPLAINT_REVIEW_SYSTEM, RECOVERY_PLAN_SYSTEM, RESPONSE_ANALYSIS_SYSTEM } from "./prompts";
import {
  bankResponseAnalysisSchema,
  complaintReviewSchema,
  recoveryPlanSchema,
  type ComplaintReview,
  type StoredBankResponseAnalysis,
  type StoredRecoveryPlan,
} from "./schemas";

/**
 * AI orchestration layer for bank submissions.
 *
 * Every step of the submission workflow is a predefined, typed tool. Some are
 * deterministic (bank identification, channel discovery, email preparation)
 * and some use the configured AI provider (complaint review, response
 * analysis, recovery planning). The workflow — not the model — decides which
 * tool runs, and the model is never allowed to choose or invent a recipient:
 * recipients come only from the curated channel directory or from the user.
 *
 * Every run is recorded in ai_tool_runs for audit.
 */

export const TOOL_NAMES = [
  "identify_bank",
  "discover_complaint_channels",
  "generate_complaint",
  "validate_complaint",
  "prepare_email",
  "analyze_bank_response",
  "recommend_recovery",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  profile: Profile;
  c: CaseRow;
}

const escape = (v: string) => v.replace(/</g, "‹").replace(/>/g, "›");

async function audited<T>(
  ctx: ToolContext,
  tool: ToolName,
  input: Record<string, unknown>,
  fn: () => Promise<{ result: T; model?: string | null; output?: Record<string, unknown> }>,
): Promise<T> {
  const started = Date.now();
  try {
    const { result, model, output } = await fn();
    await ctx.supabase.from("ai_tool_runs").insert({
      user_id: ctx.userId,
      case_id: ctx.c.id,
      tool,
      status: "succeeded",
      model: model ?? null,
      input,
      output: output ?? null,
      duration_ms: Date.now() - started,
    });
    return result;
  } catch (error) {
    await ctx.supabase.from("ai_tool_runs").insert({
      user_id: ctx.userId,
      case_id: ctx.c.id,
      tool,
      status: "failed",
      input,
      error_code: error instanceof AIError ? error.code : error instanceof ToolError ? error.code : "unexpected",
      duration_ms: Date.now() - started,
    });
    throw error;
  }
}

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

// ---------------------------------------------------------------------------
// identify_bank (deterministic)
// ---------------------------------------------------------------------------

export interface BankIdentification {
  bank_id: string | null;
  bank_name: string | null;
  logo: string | null;
  entered_name: string | null;
}

export function identifyBank(ctx: ToolContext): Promise<BankIdentification> {
  return audited(ctx, "identify_bank", { entered_name: ctx.c.institution_name }, async () => {
    const bank = findBank(ctx.c.institution_name);
    const result = { bank_id: bank?.id ?? null, bank_name: bank?.name ?? null, logo: bank?.logo ?? null, entered_name: ctx.c.institution_name };
    return { result, output: { bank_id: result.bank_id } };
  });
}

// ---------------------------------------------------------------------------
// discover_complaint_channels (deterministic directory lookup)
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<BankChannelRow["status"], number> = { verified: 0, unverified: 1, outdated: 2, archived: 3 };

export function discoverComplaintChannels(ctx: ToolContext, bankId: string | null): Promise<BankChannelRow[]> {
  return audited(ctx, "discover_complaint_channels", { bank_id: bankId }, async () => {
    if (!bankId) return { result: [], output: { count: 0 } };
    const { data, error } = await ctx.supabase.from("bank_contact_channels").select("*").eq("bank_id", bankId).neq("status", "archived");
    if (error) throw new ToolError("lookup_failed", "Could not load the bank's contact channels.");
    const channels = ((data ?? []) as BankChannelRow[]).sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.purpose === "complaints" ? -1 : 1) - (b.purpose === "complaints" ? -1 : 1),
    );
    return { result: channels, output: { count: channels.length, verified: channels.filter((c) => c.status === "verified").length } };
  });
}

// ---------------------------------------------------------------------------
// generate_complaint (AI)
// ---------------------------------------------------------------------------

export function generateComplaintTool(ctx: ToolContext) {
  return audited(ctx, "generate_complaint", {}, async () => {
    await ensureAIAllowed(ctx.supabase, ctx.profile, "complaint_generation");
    const result = await generateComplaint(ctx.supabase, ctx.userId, ctx.c, ctx.profile);
    return { result, model: result.model, output: { unsupported_details: result.unsupported.length, placeholders: result.draft.missing_placeholders.length } };
  });
}

// ---------------------------------------------------------------------------
// validate_complaint (deterministic checks + optional AI review)
// ---------------------------------------------------------------------------

export interface ComplaintValidation {
  checks: ComplaintCheckResult;
  ai: { review: ComplaintReview; model: string } | null;
  ai_unavailable_reason: string | null;
}

async function loadEvidence(ctx: ToolContext): Promise<EvidenceRow[]> {
  const { data, error } = await ctx.supabase.from("evidence").select("*").eq("case_id", ctx.c.id).order("created_at");
  if (error) throw new ToolError("lookup_failed", "Could not load evidence.");
  return (data ?? []) as EvidenceRow[];
}

export function validateComplaint(ctx: ToolContext, draft: ComplaintDraftRow, opts: { useAI: boolean }): Promise<ComplaintValidation> {
  return audited(ctx, "validate_complaint", { draft_id: draft.id, version: draft.version, use_ai: opts.useAI }, async () => {
    const evidence = await loadEvidence(ctx);
    const checks = checkComplaintBeforeSending({
      subject: draft.subject,
      content: draft.content,
      approved: draft.status === "approved",
      facts: { amount: ctx.c.amount, transaction_date: ctx.c.transaction_date, transaction_reference: ctx.c.transaction_reference },
      confirmedFacts: confirmedFactTexts(ctx.c, ctx.profile, evidence),
    });

    let ai: ComplaintValidation["ai"] = null;
    let reason: string | null = null;
    if (!opts.useAI) reason = null;
    else if (!isAIConfigured()) reason = "AI isn't set up on this site.";
    else if (!ctx.profile.ai_processing_consent) reason = "Turn on AI analysis in Settings to get an AI review.";
    else {
      try {
        await ensureAIAllowed(ctx.supabase, ctx.profile, "complaint_review");
        const { data, model } = await getAIProvider().generateStructured({
          system: COMPLAINT_REVIEW_SYSTEM,
          schema: complaintReviewSchema,
          maxOutputTokens: 4000,
          content: [
            {
              type: "text",
              text: [
                `<case_data>\n${escape(caseFacts(ctx.c))}\n</case_data>`,
                `<complaint>\nSubject: ${escape(draft.subject)}\n\n${escape(draft.content)}\n</complaint>`,
                "Review this complaint following your instructions.",
              ].join("\n\n"),
            },
          ],
        });
        ai = { review: { ...data, issues: data.issues.slice(0, 6) }, model };
      } catch (error) {
        reason = error instanceof AIError ? error.userMessage : "The AI review isn't available right now.";
      }
    }
    return {
      result: { checks, ai, ai_unavailable_reason: reason },
      model: ai?.model ?? null,
      output: { ready: checks.ready, blocking: checks.blocking, warnings: checks.warnings, ai_issues: ai?.review.issues ?? [], ai_summary: ai?.review.summary ?? null },
    };
  });
}

// ---------------------------------------------------------------------------
// prepare_email (deterministic)
// ---------------------------------------------------------------------------

/** Gmail caps a message at 25 MB including encoding overhead; keep attachments well below. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export interface EmailPlan {
  to: string;
  from: { name: string | null; address: string };
  subject: string;
  body: string;
  evidence: EvidenceRow[];
  complaintPdfName: string;
}

export function prepareEmail(
  ctx: ToolContext,
  input: { draft: ComplaintDraftRow; recipient: string; senderAddress: string; evidenceIds: string[] },
): Promise<EmailPlan> {
  return audited(ctx, "prepare_email", { draft_id: input.draft.id, attachments: input.evidenceIds.length }, async () => {
    if (!isValidEmailAddress(input.recipient)) throw new ToolError("invalid_recipient", "The recipient email address isn't valid.");
    const all = await loadEvidence(ctx);
    const evidence = all.filter((e) => input.evidenceIds.includes(e.id));
    if (evidence.length !== new Set(input.evidenceIds).size) throw new ToolError("invalid_attachment", "One of the selected files couldn't be found.");
    const total = evidence.reduce((n, e) => n + e.file_size, 0);
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new ToolError("attachments_too_large", "The selected files are too large to email together (15 MB limit). Choose fewer files.");
    }
    const plan: EmailPlan = {
      to: input.recipient,
      from: { name: ctx.profile.full_name, address: input.senderAddress },
      // The exact subject and letter the user approved — nothing is rewritten.
      subject: input.draft.subject,
      body: input.draft.content,
      evidence,
      complaintPdfName: `Complaint-${ctx.c.case_number}.pdf`,
    };
    return { result: plan, output: { attachment_bytes: total, attachments: evidence.length + 1 } };
  });
}

// ---------------------------------------------------------------------------
// analyze_bank_response (AI)
// ---------------------------------------------------------------------------

export function analyzeBankResponse(ctx: ToolContext, response: BankResponseRow): Promise<{ analysis: StoredBankResponseAnalysis; model: string }> {
  return audited(ctx, "analyze_bank_response", { response_id: response.id }, async () => {
    await ensureAIAllowed(ctx.supabase, ctx.profile, "response_analysis");
    const { data, model } = await getAIProvider().generateStructured({
      system: RESPONSE_ANALYSIS_SYSTEM,
      schema: bankResponseAnalysisSchema,
      maxOutputTokens: 4000,
      content: [
        {
          type: "text",
          text: [
            `Current case status: ${CASE_STATUS_INFO[ctx.c.status].label}`,
            `<case_data>\n${escape(caseFacts(ctx.c))}\n</case_data>`,
            `<bank_reply>\nReceived: ${formatDate(response.received_at, { withTime: true })}\nFrom: ${escape(response.from_address ?? "unknown")}\nSubject: ${escape(response.subject ?? "")}\n\n${escape(response.body_text)}\n</bank_reply>`,
            "Analyse this reply following your instructions.",
          ].join("\n\n"),
        },
      ],
    });
    const analysis = groundResponseAnalysis(data, `${response.subject ?? ""}\n${response.body_text}`);
    return {
      result: { analysis, model },
      model,
      output: { classification: analysis.classification, suggested_case_status: analysis.suggested_case_status, removed: analysis.grounding.removed.length },
    };
  });
}

// ---------------------------------------------------------------------------
// recommend_recovery (AI)
// ---------------------------------------------------------------------------

export function recommendRecovery(
  ctx: ToolContext,
  history: { submissions: SubmissionRow[]; responses: BankResponseRow[] },
): Promise<{ plan: StoredRecoveryPlan; model: string; guidance: GuidanceRow[] }> {
  return audited(ctx, "recommend_recovery", { submissions: history.submissions.length, responses: history.responses.length }, async () => {
    await ensureAIAllowed(ctx.supabase, ctx.profile, "recovery_plan");
    let guidance: GuidanceRow[] = [];
    try {
      guidance = await getRelevantGuidance(ctx.supabase, { country: ctx.profile.country, category: ctx.c.issue_category });
    } catch {
      guidance = [];
    }
    const submissions = history.submissions
      .map((s) => `- ${s.method} to ${s.recipient}: ${s.status}${s.sent_at ? ` on ${formatDate(s.sent_at)}` : ""}${s.user_reference ? ` (reference ${s.user_reference})` : ""}`)
      .join("\n");
    const responses = history.responses
      .map((r) => {
        const a = r.analysis as { classification?: string; summary?: string } | null;
        return `- ${formatDate(r.received_at)} from ${r.from_address ?? "the institution"}: ${a?.summary ?? r.body_text.slice(0, 600)}${a?.classification ? ` [${a.classification}]` : ""}`;
      })
      .join("\n");
    const guidanceBlock = guidance
      .map((g) => `ID: ${g.id}\nTitle: ${g.title}\nStatus: ${g.status}${g.verified_at ? ` (verified ${formatDate(g.verified_at)})` : ""}\nSource: ${g.source_url}\nContent: ${g.content}`)
      .join("\n\n");

    const { data, model } = await getAIProvider().generateStructured({
      system: RECOVERY_PLAN_SYSTEM,
      schema: recoveryPlanSchema,
      maxOutputTokens: 5000,
      content: [
        {
          type: "text",
          text: [
            `Today's date: ${formatDate(new Date())}`,
            `<case_data>\n${escape(caseFacts(ctx.c))}\nCase status: ${CASE_STATUS_INFO[ctx.c.status].label}\nNext follow-up date: ${ctx.c.next_follow_up_date ?? "not set"}\n\nSubmissions:\n${escape(submissions || "none")}\n\nReplies from the institution:\n${escape(responses || "none")}\n</case_data>`,
            `<guidance>\n${guidanceBlock || "No guidance records available."}\n</guidance>`,
            "Plan the next steps following your instructions.",
          ].join("\n\n"),
        },
      ],
    });
    const plan = groundRecoveryPlan(data, guidance.map((g) => g.id));
    return { result: { plan, model, guidance }, model, output: plan as unknown as Record<string, unknown> };
  });
}

function caseFacts(c: CaseRow): string {
  return [
    `Case number: ${c.case_number}`,
    `Problem type: ${c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].label : "not selected"}`,
    `Institution: ${c.institution_name ?? "not provided"}`,
    `Amount: ${c.amount ? formatMoneyPlain(c.amount, c.currency) : "not provided"}`,
    `Transaction date: ${c.transaction_date ? formatDate(c.transaction_date, { withTime: true }) : "not provided"}`,
    `Transaction reference: ${c.transaction_reference ?? "not provided"}`,
    `Payment channel: ${c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : "not provided"}`,
    `Recipient: ${c.recipient_details ?? "not provided"}`,
    `What happened: ${c.incident_description ?? "not provided"}`,
    `Resolution requested: ${c.requested_resolution ?? "not provided"}`,
    `Institution complaint reference: ${c.institution_reference ?? "not provided"}`,
  ].join("\n");
}
