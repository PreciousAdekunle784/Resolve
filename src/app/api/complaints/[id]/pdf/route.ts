import { jsonError, requireApiUser } from "@/lib/api";
import { addCaseEvent } from "@/lib/cases";
import { renderComplaintPdf } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";
import type { ComplaintDraftRow } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

/** Exports a complaint draft (owned by the signed-in user) as a PDF download. */
export async function GET(_request: Request, ctx: RouteContext<"/api/complaints/[id]/pdf">) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Draft not found.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("complaint_drafts")
    .select("*, cases(case_number)")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error || !data) return jsonError(404, "Draft not found.");
  const draft = data as ComplaintDraftRow & { cases: { case_number: string } | null };
  const caseNumber = draft.cases?.case_number ?? "case";

  const bytes = await renderComplaintPdf({
    subject: draft.subject,
    body: draft.content,
    caseNumber,
    version: draft.version,
    approved: draft.status === "approved",
  });

  await addCaseEvent(supabase, {
    caseId: draft.case_id,
    userId: auth.user.id,
    type: "complaint_exported",
    description: `Complaint version ${draft.version} exported as PDF`,
    metadata: { draft_id: draft.id },
  }).catch(() => undefined);

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Resolve-complaint-${caseNumber}-v${draft.version}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
