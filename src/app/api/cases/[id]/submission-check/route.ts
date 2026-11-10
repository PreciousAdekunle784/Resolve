import { z } from "zod";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { validateComplaint } from "@/lib/orchestrator";
import { caseContext, errorResponse } from "@/lib/submissions/api-context";
import type { ComplaintDraftRow } from "@/lib/types";

export const maxDuration = 120;

/** Runs the validate_complaint tool: deterministic checks, plus an optional AI review. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/submission-check">) {
  const { id } = await ctx.params;
  const context = await caseContext(request, id);
  if (!context.ok) return context.response;
  const parsed = z.object({ draftId: z.string().uuid(), useAI: z.boolean().default(false) }).safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid request.");
  const { data } = await context.value.supabase.from("complaint_drafts").select("*").eq("id", parsed.data.draftId).eq("case_id", id).maybeSingle();
  if (!data) return jsonError(404, "Complaint not found.");
  try {
    const result = await validateComplaint(context.value, data as ComplaintDraftRow, { useAI: parsed.data.useAI });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
