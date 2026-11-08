"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addCaseEvent, findOwnedCase } from "@/lib/cases";
import { EVIDENCE_BUCKET, ISSUE_CATEGORIES } from "@/lib/constants";
import { fromLagosDateTimeLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, CaseRow } from "@/lib/types";
import { caseCompleteSchema, caseDraftSchema, fieldErrors, formDataToObject } from "@/lib/validation";
import { z } from "zod";

const SESSION_ENDED: ActionResult = { ok: false, error: "Your session has ended. Please sign in again." };

/** Step 1 of a new report: choose the problem type and create the saved draft. */
export async function createCaseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  const parsed = z.object({ issue_category: z.enum(ISSUE_CATEGORIES, { message: "Choose the type of problem" }) }).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Choose the type of problem to continue.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .insert({ user_id: user.id, issue_category: parsed.data.issue_category, intake_step: 2 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "We couldn't start your report. Please try again." };
  redirect(`/cases/${data.id}/report?step=2`);
}

const STEP_FIELDS: Record<number, (keyof CaseRow)[]> = {
  1: ["issue_category"],
  2: ["institution_name", "amount", "currency", "transaction_date", "transaction_reference", "payment_channel", "recipient_details"],
  3: ["incident_description", "previous_attempts", "requested_resolution"],
};

const FIELD_LABELS: Partial<Record<keyof CaseRow, string>> = {
  issue_category: "problem type",
  institution_name: "institution",
  amount: "amount",
  currency: "currency",
  transaction_date: "transaction date",
  transaction_reference: "transaction reference",
  payment_channel: "payment channel",
  recipient_details: "recipient details",
  incident_description: "description",
  previous_attempts: "previous attempts",
  requested_resolution: "requested resolution",
};

/**
 * Saves one step of the report wizard (or an edit to a completed case).
 * Partial data is allowed so users can save and continue later.
 */
export async function saveCaseStepAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  const caseId = String(formData.get("caseId") ?? "");
  const step = Number(formData.get("step"));
  const intent = String(formData.get("intent") ?? "continue");
  if (!STEP_FIELDS[step]) return { ok: false, error: "Unknown step." };

  const supabase = await createClient();
  const existing = await findOwnedCase(supabase, user.id, caseId);
  if (!existing) return { ok: false, error: "This case could not be found." };

  const raw = formDataToObject(formData);
  if ("transaction_date" in raw) {
    if (raw.transaction_date) {
      const iso = fromLagosDateTimeLocal(raw.transaction_date);
      if (!iso) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: { transaction_date: ["Enter a valid date and time"] } };
      raw.transaction_date = iso;
    }
  }
  const parsed = caseDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  if (parsed.data.transaction_date && new Date(parsed.data.transaction_date).getTime() > Date.now() + 5 * 60_000) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: { transaction_date: ["The transaction date can't be in the future"] } };
  }

  // Only update the fields that belong to this step; empty inputs clear the value.
  const update: Record<string, unknown> = {};
  for (const field of STEP_FIELDS[step]) {
    const value = (parsed.data as Record<string, unknown>)[field];
    if (field === "currency") update[field] = value ?? "NGN";
    else if (field === "issue_category") {
      if (value) update[field] = value;
    } else update[field] = value ?? null;
  }
  const isComplete = existing.intake_status === "complete";
  if (isComplete) {
    // Core facts cannot be removed from a submitted report.
    const merged = { ...existing, ...update, amount: update.amount ?? (existing.amount === null ? null : Number(existing.amount)) };
    const check = caseCompleteSchema.safeParse(merged);
    if (!check.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(check.error) };
  } else {
    update.intake_step = Math.max(existing.intake_step, Math.min(step + 1, 5));
  }

  const { error } = await supabase.from("cases").update(update).eq("id", caseId).eq("user_id", user.id);
  if (error) return { ok: false, error: "We couldn't save your answers. Please try again." };

  if (isComplete) {
    const changed = STEP_FIELDS[step].filter((f) => normalise(existing[f]) !== normalise(update[f]));
    if (changed.length > 0) {
      await addCaseEvent(supabase, {
        caseId,
        userId: user.id,
        type: "case_updated",
        description: `Updated ${changed.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`,
        metadata: { fields: changed },
      });
    }
    revalidatePath(`/cases/${caseId}`);
    redirect(`/cases/${caseId}?updated=1`);
  }

  if (intent === "exit") redirect("/dashboard?saved=1");
  const nextStep = step + 1;
  redirect(`/cases/${caseId}/report?step=${nextStep}`);
}

function normalise(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return v.toFixed(2);
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) return Number(v).toFixed(2);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toISOString();
  return String(v);
}

/** Final step: validate the whole report and mark it complete. */
export async function submitReportAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  const caseId = String(formData.get("caseId") ?? "");
  const supabase = await createClient();
  const existing = await findOwnedCase(supabase, user.id, caseId);
  if (!existing) return { ok: false, error: "This case could not be found." };
  if (existing.intake_status === "complete") redirect(`/cases/${caseId}`);

  const check = caseCompleteSchema.safeParse({ ...existing, amount: existing.amount === null ? undefined : Number(existing.amount) });
  if (!check.success) {
    return { ok: false, error: "Some required details are missing. Use the Edit links to complete them.", fieldErrors: fieldErrors(check.error) };
  }

  const { error } = await supabase
    .from("cases")
    .update({ intake_status: "complete", intake_step: 5, submitted_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "We couldn't submit your report. Please try again." };

  await addCaseEvent(supabase, {
    caseId,
    userId: user.id,
    type: "report_submitted",
    description: "Report completed and reviewed",
  });
  revalidatePath("/dashboard");
  redirect(`/cases/${caseId}?submitted=1`);
}

/** Permanently deletes a case, its evidence files and all related records. */
export async function deleteCaseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  const caseId = String(formData.get("caseId") ?? "");
  if (formData.get("confirm") !== "DELETE") {
    return { ok: false, error: "Type DELETE to confirm.", fieldErrors: { confirm: ["Type DELETE to confirm"] } };
  }
  const supabase = await createClient();
  const existing = await findOwnedCase(supabase, user.id, caseId);
  if (!existing) return { ok: false, error: "This case could not be found." };

  const { data: files, error: filesError } = await supabase.from("evidence").select("file_path").eq("case_id", caseId);
  if (filesError) return { ok: false, error: "We couldn't delete this case. Please try again." };
  if (files && files.length > 0) {
    const { error: storageError } = await supabase.storage.from(EVIDENCE_BUCKET).remove(files.map((f) => f.file_path as string));
    if (storageError) return { ok: false, error: "We couldn't delete the evidence files for this case. Please try again." };
  }
  const { error } = await supabase.from("cases").delete().eq("id", caseId).eq("user_id", user.id);
  if (error) return { ok: false, error: "We couldn't delete this case. Please try again." };
  revalidatePath("/dashboard");
  redirect("/cases?deleted=1");
}
