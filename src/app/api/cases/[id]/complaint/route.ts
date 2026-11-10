import { z } from "zod";
import { isSameOrigin, jsonError, jsonOk, readJson, requireApiUser } from "@/lib/api";
import { AIError } from "@/lib/ai/errors";
import { ensureAIAllowed, generateComplaint } from "@/lib/ai/service";
import { getProfile } from "@/lib/auth";
import { addCaseEvent, findOwnedCase } from "@/lib/cases";
import { buildTemplateComplaint } from "@/lib/complaint-template";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceRow } from "@/lib/types";

export const maxDuration = 300;

/**
 * Creates a new complaint draft version, either with AI ("ai") or from a
 * plain template built only from the user's own facts ("template"). Earlier
 * versions are kept (marked superseded) so nothing is lost.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/complaint">) {
  if (!isSameOrigin(request)) return jsonError(403, "Request not allowed.");
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = z.object({ mode: z.enum(["ai", "template"]) }).safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid request.");

  const supabase = await createClient();
  const [c, profile] = await Promise.all([findOwnedCase(supabase, auth.user.id, id), getProfile(auth.user.id)]);
  if (!c || !profile) return jsonError(404, "Case not found.");
  if (c.intake_status !== "complete") return jsonError(400, "Finish and submit your report first.");

  let subject: string;
  let content: string;
  let model: string | null = null;
  let warnings: string[] = [];
  try {
    if (parsed.data.mode === "ai") {
      await ensureAIAllowed(supabase, profile, "complaint_generation");
      const result = await generateComplaint(supabase, auth.user.id, c, profile);
      subject = result.draft.subject;
      content = result.draft.body;
      model = result.model;
      warnings = result.unsupported;
    } else {
      const { data: ev } = await supabase.from("evidence").select("original_filename, description").eq("case_id", c.id).order("created_at");
      const t = buildTemplateComplaint(c, profile, (ev ?? []) as Pick<EvidenceRow, "original_filename" | "description">[]);
      subject = t.subject;
      content = t.body;
    }
  } catch (error) {
    if (error instanceof AIError) {
      return jsonError(error.httpStatus, error.userMessage, { code: error.code, retryable: error.retryable });
    }
    console.error("[complaint] unexpected error", error instanceof Error ? error.name : typeof error);
    return jsonError(500, "Something went wrong while preparing your complaint. Please try again.", { retryable: true });
  }

  const { data: latest } = await supabase
    .from("complaint_drafts")
    .select("version")
    .eq("case_id", c.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((latest?.version as number | undefined) ?? 0) + 1;

  const { error: supersedeError } = await supabase
    .from("complaint_drafts")
    .update({ status: "superseded" })
    .eq("case_id", c.id)
    .neq("status", "superseded");
  if (supersedeError) return jsonError(500, "Could not save the draft. Please try again.");

  const { data: draft, error } = await supabase
    .from("complaint_drafts")
    .insert({
      case_id: c.id,
      user_id: auth.user.id,
      subject: subject.slice(0, 300),
      content: content.slice(0, 20000),
      version,
      status: "draft",
      generated_by: parsed.data.mode,
      model_identifier: model,
    })
    .select("*")
    .single();
  if (error || !draft) return jsonError(500, "Could not save the draft. Please try again.");

  await addCaseEvent(supabase, {
    caseId: c.id,
    userId: auth.user.id,
    type: "complaint_generated",
    description: `Complaint draft version ${version} created ${parsed.data.mode === "ai" ? "with AI" : "from the template"}`,
    metadata: { draft_id: draft.id, version, mode: parsed.data.mode },
  });

  return jsonOk({ draft, warnings }, 201);
}
