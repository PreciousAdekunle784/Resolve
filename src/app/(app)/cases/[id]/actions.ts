"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { caseAnalysisSchema } from "@/lib/ai/schemas";
import { addCaseEvent, findOwnedCase } from "@/lib/cases";
import { CASE_STATUS_INFO, SUBMISSION_CHANNEL_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, AiAnalysisRow, CaseRow, ComplaintDraftRow, SupplementaryAnswer } from "@/lib/types";
import {
  caseCompleteSchema,
  caseDraftSchema,
  complaintEditSchema,
  fieldErrors,
  followUpAnswerSchema,
  followUpSchema,
  formDataToObject,
  noteSchema,
  resolutionSchema,
  responseSchema,
  statusUpdateSchema,
  submissionSchema,
  uuidSchema,
} from "@/lib/validation";

const SESSION_ENDED: ActionResult = { ok: false, error: "Your session has ended. Please sign in again." };
const CHECK_FIELDS = "Please check the highlighted fields.";

async function context(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const caseId = String(formData.get("caseId") ?? "");
  const c = await findOwnedCase(supabase, user.id, caseId);
  if (!c) return null;
  return { user, supabase, c };
}

function done(caseId: string, message: string): ActionResult {
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/dashboard");
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// AI analysis review
// ---------------------------------------------------------------------------

async function loadAnalysis(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, analysisId: string) {
  if (!uuidSchema.safeParse(analysisId).success) return null;
  const { data } = await supabase
    .from("ai_analyses")
    .select("*")
    .eq("id", analysisId)
    .eq("user_id", userId)
    .eq("analysis_type", "case_analysis")
    .maybeSingle();
  return (data as AiAnalysisRow | null) ?? null;
}

/** Copies an AI-suggested value into the case record after the user confirms it. */
export async function applySuggestionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const analysis = await loadAnalysis(supabase, user.id, String(formData.get("analysisId")));
  if (!analysis || analysis.case_id !== c.id) return { ok: false, error: "Analysis not found." };
  const parsed = caseAnalysisSchema.safeParse(analysis.structured_result);
  if (!parsed.success) return { ok: false, error: "This analysis can't be used. Please run a new analysis." };

  const index = Number(formData.get("factIndex"));
  const fact = parsed.data.key_facts[index];
  if (!fact || fact.case_field === "none") return { ok: false, error: "This suggestion can't be applied automatically." };

  if (fact.source !== "document_extracted" && fact.source !== "user_provided") {
    return { ok: false, error: "Only details found in your documents can be applied. Check this one yourself and edit your case details if needed." };
  }
  const field = fact.case_field;
  let rawValue = field === "amount" || field === "transaction_date" ? fact.normalized_value : fact.value;
  if (field === "transaction_date" && rawValue) {
    const d = new Date(rawValue);
    rawValue = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (!rawValue) {
    return { ok: false, error: "The exact value isn't clear enough to apply automatically. Edit your case details instead." };
  }
  const check = caseDraftSchema.safeParse({ [field]: field === "amount" ? rawValue : rawValue.trim() });
  const value = check.success ? (check.data as Record<string, unknown>)[field] : undefined;
  if (!check.success || value === undefined) {
    return { ok: false, error: "This value isn't in a format Resolve can use. Edit your case details instead." };
  }
  const merged = { ...c, [field]: value, amount: field === "amount" ? value : c.amount === null ? undefined : Number(c.amount) };
  if (!caseCompleteSchema.safeParse(merged).success) return { ok: false, error: "This value can't be applied. Edit your case details instead." };

  const { error } = await supabase.from("cases").update({ [field]: value }).eq("id", c.id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not update your case. Please try again." };

  const review = { ...(analysis.user_review as Record<string, unknown>) };
  review[`fact_${index}`] = "accepted";
  await supabase.from("ai_analyses").update({ user_review: review }).eq("id", analysis.id);
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "ai_suggestion_accepted",
    description: `You confirmed the ${fact.label.toLowerCase()} suggested by the analysis`,
    metadata: { field, previous: c[field as keyof CaseRow] ?? null, value, analysis_id: analysis.id, source: fact.source },
  });
  return done(c.id, `Updated ${fact.label.toLowerCase()}.`);
}

/** Records that the user rejected an AI-suggested fact. */
export async function dismissSuggestionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const analysis = await loadAnalysis(supabase, user.id, String(formData.get("analysisId")));
  if (!analysis || analysis.case_id !== c.id) return { ok: false, error: "Analysis not found." };
  const index = Number(formData.get("factIndex"));
  const review = { ...(analysis.user_review as Record<string, unknown>), [`fact_${index}`]: "rejected" };
  const { error } = await supabase.from("ai_analyses").update({ user_review: review }).eq("id", analysis.id);
  if (error) return { ok: false, error: "Could not save. Please try again." };
  return done(c.id, "Marked as incorrect.");
}

export async function markAnalysisReviewedAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const analysis = await loadAnalysis(supabase, user.id, String(formData.get("analysisId")));
  if (!analysis || analysis.case_id !== c.id) return { ok: false, error: "Analysis not found." };
  const { error } = await supabase.from("ai_analyses").update({ reviewed_at: new Date().toISOString() }).eq("id", analysis.id);
  if (error) return { ok: false, error: "Could not save. Please try again." };
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "analysis_reviewed",
    description: "You reviewed the AI analysis",
    metadata: { analysis_id: analysis.id },
  });
  return done(c.id, "Analysis marked as reviewed.");
}

export async function answerFollowUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const parsed = followUpAnswerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };

  const answers: SupplementaryAnswer[] = (c.supplementary_info ?? []).filter((a) => a.question !== parsed.data.question);
  answers.push({ question: parsed.data.question, answer: parsed.data.answer, answered_at: new Date().toISOString() });
  if (answers.length > 30) return { ok: false, error: "You've answered the maximum number of questions for this case." };

  const { error } = await supabase.from("cases").update({ supplementary_info: answers }).eq("id", c.id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not save your answer. Please try again." };
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "follow_up_answered",
    description: `You answered: "${parsed.data.question.slice(0, 120)}"`,
  });
  return done(c.id, "Answer saved. Run the analysis again to include it.");
}

// ---------------------------------------------------------------------------
// Complaint drafts
// ---------------------------------------------------------------------------

async function loadDraft(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, caseId: string, draftId: string) {
  if (!uuidSchema.safeParse(draftId).success) return null;
  const { data } = await supabase
    .from("complaint_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .eq("case_id", caseId)
    .maybeSingle();
  return (data as ComplaintDraftRow | null) ?? null;
}

export async function saveComplaintAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const draft = await loadDraft(supabase, user.id, c.id, String(formData.get("draftId")));
  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status === "superseded") return { ok: false, error: "This is an older version. Edit the latest version instead." };
  const parsed = complaintEditSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.content === draft.content && parsed.data.subject === draft.subject) return { ok: true, message: "No changes to save." };

  const wasApproved = draft.status === "approved";
  const { error } = await supabase
    .from("complaint_drafts")
    .update({ subject: parsed.data.subject, content: parsed.data.content, status: "draft", approved_at: null })
    .eq("id", draft.id);
  if (error) return { ok: false, error: "Could not save your changes. Please try again." };
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "complaint_edited",
    description: `You edited complaint version ${draft.version}${wasApproved ? " (approval removed — please approve again)" : ""}`,
    metadata: { draft_id: draft.id },
  });
  return done(c.id, wasApproved ? "Saved. Because you changed an approved draft, please review and approve it again." : "Draft saved.");
}

export async function approveComplaintAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const draft = await loadDraft(supabase, user.id, c.id, String(formData.get("draftId")));
  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status !== "draft") return { ok: false, error: "Only the current draft can be approved." };
  if (/\[ADD:/i.test(draft.content) || /\[ADD:/i.test(draft.subject)) {
    return { ok: false, error: "Replace every [ADD: …] placeholder with the real information (or remove it) before approving." };
  }
  if (formData.get("confirmAccurate") !== "on") {
    return { ok: false, error: "Please confirm that the complaint is accurate.", fieldErrors: { confirmAccurate: ["Please confirm"] } };
  }
  const { error } = await supabase
    .from("complaint_drafts")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", draft.id);
  if (error) return { ok: false, error: "Could not approve the draft. Please try again." };
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "complaint_approved",
    description: `You approved complaint version ${draft.version}`,
    metadata: { draft_id: draft.id },
  });
  return done(c.id, "Complaint approved. Copy or download it, send it through your institution's official channel, then record the submission.");
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export async function recordSubmissionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const parsed = submissionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.institution_submission_date > new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: CHECK_FIELDS, fieldErrors: { institution_submission_date: ["The date can't be in the future"] } };
  }

  const update: Record<string, unknown> = {
    institution_reference: v.institution_reference ?? null,
    institution_submission_date: v.institution_submission_date,
    institution_submission_channel: v.institution_submission_channel,
  };
  if (c.status === "draft") update.status = "submitted_to_institution";
  const { error } = await supabase.from("cases").update(update).eq("id", c.id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not save. Please try again." };
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "institution_submission_recorded",
    description: `Complaint submitted to ${c.institution_name ?? "institution"} by ${SUBMISSION_CHANNEL_LABELS[v.institution_submission_channel].toLowerCase()} on ${formatDate(v.institution_submission_date)}${v.institution_reference ? ` (reference ${v.institution_reference})` : ""}`,
    metadata: { ...update },
  });
  return done(c.id, "Submission recorded.");
}

export async function updateStatusAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const parsed = statusUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.status === c.status) return { ok: false, error: "The case already has this status." };
  if (parsed.data.status === "resolved" || parsed.data.status === "closed") {
    return { ok: false, error: "Use “Record the outcome” to resolve or close a case, so the outcome is documented." };
  }
  const update: Record<string, unknown> = { status: parsed.data.status };
  if (c.status === "resolved") update.resolved_at = null;
  // The database trigger records the status change in the timeline.
  const { error } = await supabase.from("cases").update(update).eq("id", c.id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not update the status. Please try again." };
  if (parsed.data.note) {
    await addCaseEvent(supabase, { caseId: c.id, userId: user.id, type: "note_added", description: parsed.data.note });
  }
  return done(c.id, `Status updated to “${CASE_STATUS_INFO[parsed.data.status].label}”.`);
}

export async function recordResponseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const parsed = responseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "institution_response_recorded",
    description: `Response from ${c.institution_name ?? "institution"} (${formatDate(v.response_date)}): ${v.response_summary}`,
    metadata: { response_date: v.response_date },
  });
  if (v.new_status && v.new_status !== c.status && v.new_status !== "resolved" && v.new_status !== "closed") {
    const { error } = await supabase.from("cases").update({ status: v.new_status }).eq("id", c.id).eq("user_id", user.id);
    if (error) return { ok: false, error: "The response was saved, but the status couldn't be updated." };
  }
  return done(c.id, "Response recorded.");
}

export async function setFollowUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const parsed = followUpSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const date = parsed.data.next_follow_up_date ?? null;
  const { error } = await supabase.from("cases").update({ next_follow_up_date: date }).eq("id", c.id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not save. Please try again." };
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "follow_up_scheduled",
    description: date ? `Follow-up planned for ${formatDate(date)}${parsed.data.note ? `: ${parsed.data.note}` : ""}` : "Follow-up date cleared",
    metadata: { next_follow_up_date: date },
  });
  return done(c.id, date ? "Follow-up date saved." : "Follow-up date cleared.");
}

export async function recordResolutionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const parsed = resolutionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { error } = await supabase
    .from("cases")
    .update({
      status: v.outcome,
      resolution_details: v.resolution_details,
      resolved_at: v.outcome === "resolved" ? new Date().toISOString() : c.resolved_at,
      next_follow_up_date: null,
    })
    .eq("id", c.id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not save the outcome. Please try again." };
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: user.id,
    type: "resolution_recorded",
    description: `${v.outcome === "resolved" ? "Marked resolved" : "Closed"}: ${v.resolution_details}`,
  });
  return done(c.id, v.outcome === "resolved" ? "Case marked as resolved." : "Case closed.");
}

export async function addNoteAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await context(formData);
  if (!ctx) return SESSION_ENDED;
  const { user, supabase, c } = ctx;
  const parsed = noteSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  await addCaseEvent(supabase, { caseId: c.id, userId: user.id, type: "note_added", description: parsed.data.note });
  return done(c.id, "Note added.");
}

