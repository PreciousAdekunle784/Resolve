import { jsonOk } from "@/lib/api";
import { addCaseEvent } from "@/lib/cases";
import { recommendRecovery } from "@/lib/orchestrator";
import { caseContext, errorResponse } from "@/lib/submissions/api-context";
import type { BankResponseRow, SubmissionRow } from "@/lib/types";

export const maxDuration = 120;

/** Runs the recommend_recovery tool and records it in the case history. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/recovery-plan">) {
  const { id } = await ctx.params;
  const context = await caseContext(request, id);
  if (!context.ok) return context.response;
  const { supabase, userId, c } = context.value;
  const [subs, resps] = await Promise.all([
    supabase.from("complaint_submissions").select("*").eq("case_id", c.id).order("created_at"),
    supabase.from("bank_responses").select("*").eq("case_id", c.id).order("received_at"),
  ]);
  try {
    const { plan, model } = await recommendRecovery(context.value, {
      submissions: (subs.data ?? []) as SubmissionRow[],
      responses: (resps.data ?? []) as BankResponseRow[],
    });
    await addCaseEvent(supabase, { caseId: c.id, userId, type: "recovery_plan_generated", description: "AI recovery plan generated", metadata: { model } });
    return jsonOk({ plan });
  } catch (error) {
    return errorResponse(error);
  }
}
