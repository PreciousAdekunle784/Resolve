import "server-only";
import type { NextResponse } from "next/server";
import { AIError } from "@/lib/ai/errors";
import { isSameOrigin, jsonError, requireApiUser } from "@/lib/api";
import { getProfile } from "@/lib/auth";
import { findOwnedCase } from "@/lib/cases";
import { EmailProviderError } from "@/lib/email/google";
import { ToolError, type ToolContext } from "@/lib/orchestrator";
import { createClient } from "@/lib/supabase/server";
import type { SubmissionRow } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";
import { SubmissionError } from "./engine";

type Result<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/** Auth + same-origin + case ownership for submission API routes. */
export async function caseContext(request: Request, caseId: string, opts: { requireComplete?: boolean } = {}): Promise<Result<ToolContext>> {
  if (request.method !== "GET" && !isSameOrigin(request)) return { ok: false, response: jsonError(403, "Request not allowed.") };
  const auth = await requireApiUser();
  if ("response" in auth) return { ok: false, response: auth.response };
  const supabase = await createClient();
  const [c, profile] = await Promise.all([findOwnedCase(supabase, auth.user.id, caseId), getProfile(auth.user.id)]);
  if (!c || !profile) return { ok: false, response: jsonError(404, "Case not found.") };
  if (opts.requireComplete !== false && c.intake_status !== "complete") return { ok: false, response: jsonError(400, "Finish and submit your report first.") };
  return { ok: true, value: { supabase, userId: auth.user.id, profile, c } };
}

/** Loads a submission the signed-in user owns (via RLS), plus its case context. */
export async function submissionContext(request: Request, submissionId: string): Promise<Result<{ ctx: ToolContext; submission: SubmissionRow }>> {
  if (!isSameOrigin(request)) return { ok: false, response: jsonError(403, "Request not allowed.") };
  const auth = await requireApiUser();
  if ("response" in auth) return { ok: false, response: auth.response };
  if (!uuidSchema.safeParse(submissionId).success) return { ok: false, response: jsonError(404, "Submission not found.") };
  const supabase = await createClient();
  const { data } = await supabase.from("complaint_submissions").select("*").eq("id", submissionId).eq("user_id", auth.user.id).maybeSingle();
  if (!data) return { ok: false, response: jsonError(404, "Submission not found.") };
  const submission = data as SubmissionRow;
  const result = await caseContext(request, submission.case_id);
  if (!result.ok) return result;
  return { ok: true, value: { ctx: result.value, submission } };
}

export function errorResponse(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (error instanceof SubmissionError) return jsonError(error.status, error.message, { code: error.code, ...error.extra });
  if (error instanceof AIError) return jsonError(error.httpStatus, error.userMessage, { code: error.code, retryable: error.retryable });
  if (error instanceof ToolError) return jsonError(400, error.message, { code: error.code });
  if (error instanceof EmailProviderError) return jsonError(400, error.message, { code: error.code });
  console.error("[submissions] unexpected error", error instanceof Error ? `${error.name}: ${error.message}` : typeof error);
  return jsonError(500, fallback);
}
