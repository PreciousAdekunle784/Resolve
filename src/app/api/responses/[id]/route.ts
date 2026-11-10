import { z } from "zod";
import { isSameOrigin, jsonError, jsonOk, readJson, requireApiUser } from "@/lib/api";
import { addCaseEvent } from "@/lib/cases";
import { CASE_STATUS_INFO } from "@/lib/constants";
import { analyzeBankResponse } from "@/lib/orchestrator";
import { SUGGESTABLE_STATUSES, type StoredBankResponseAnalysis } from "@/lib/orchestrator/schemas";
import { caseContext, errorResponse } from "@/lib/submissions/api-context";
import { createClient } from "@/lib/supabase/server";
import type { BankResponseRow } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export const maxDuration = 120;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("analyze") }),
  z.object({ action: z.literal("apply_status") }),
  z.object({ action: z.literal("mark_reviewed") }),
]);

async function loadResponse(request: Request, id: string) {
  if (!isSameOrigin(request)) return { error: jsonError(403, "Request not allowed.") };
  const auth = await requireApiUser();
  if ("response" in auth) return { error: auth.response };
  if (!uuidSchema.safeParse(id).success) return { error: jsonError(404, "Reply not found.") };
  const supabase = await createClient();
  const { data } = await supabase.from("bank_responses").select("*").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!data) return { error: jsonError(404, "Reply not found.") };
  return { response: data as BankResponseRow };
}

/** Analyse a bank reply with AI, apply its suggested status, or mark it reviewed. */
export async function POST(request: Request, ctx: RouteContext<"/api/responses/[id]">) {
  const { id } = await ctx.params;
  const loaded = await loadResponse(request, id);
  if ("error" in loaded) return loaded.error;
  const r = loaded.response;
  const context = await caseContext(request, r.case_id);
  if (!context.ok) return context.response;
  const { supabase, userId, c } = context.value;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid request.");

  try {
    if (parsed.data.action === "analyze") {
      const { analysis, model } = await analyzeBankResponse(context.value, r);
      const { error } = await supabase
        .from("bank_responses")
        .update({ analysis, analysis_model: model, analyzed_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) return jsonError(500, "Could not save the analysis.");
      await addCaseEvent(supabase, { caseId: c.id, userId, type: "bank_response_analyzed", description: `AI analysed the reply from ${r.from_address ?? "your institution"}`, metadata: { response_id: r.id, model } });
      return jsonOk({ analysis });
    }

    if (parsed.data.action === "apply_status") {
      const analysis = r.analysis as StoredBankResponseAnalysis | null;
      const status = analysis?.suggested_case_status;
      if (!status || !(SUGGESTABLE_STATUSES as readonly string[]).includes(status)) return jsonError(400, "There's no suggested status to apply.");
      if (status === "resolved") return jsonError(400, "Use “Record the outcome” on the Tracking tab to resolve a case, so the outcome is documented.");
      if (status !== c.status) {
        const { error } = await supabase.from("cases").update({ status }).eq("id", c.id).eq("user_id", userId);
        if (error) return jsonError(500, "Could not update the case status.");
      }
      await supabase.from("bank_responses").update({ user_reviewed_at: new Date().toISOString() }).eq("id", r.id);
      return jsonOk({ status, label: CASE_STATUS_INFO[status].label });
    }

    await supabase.from("bank_responses").update({ user_reviewed_at: new Date().toISOString() }).eq("id", r.id);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Removes a reply the user added themselves. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/responses/[id]">) {
  const { id } = await ctx.params;
  const loaded = await loadResponse(request, id);
  if ("error" in loaded) return loaded.error;
  if (loaded.response.source !== "user_entered") return jsonError(400, "Replies read from your mailbox can't be removed.");
  const supabase = await createClient();
  const { error } = await supabase.from("bank_responses").delete().eq("id", id);
  if (error) return jsonError(500, "Could not remove the reply.");
  return jsonOk({ ok: true });
}
