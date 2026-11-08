import { z } from "zod";
import { isSameOrigin, jsonError, jsonOk, readJson, requireApiUser } from "@/lib/api";
import { addCaseEvent } from "@/lib/cases";
import { EVIDENCE_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceRow } from "@/lib/types";
import { findSensitiveData, uuidSchema } from "@/lib/validation";

async function loadOwnedEvidence(id: string, userId: string) {
  if (!uuidSchema.safeParse(id).success) return { supabase: null, row: null };
  const supabase = await createClient();
  const { data } = await supabase.from("evidence").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return { supabase, row: (data as EvidenceRow | null) ?? null };
}

/** Update an evidence file's description. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/evidence/[id]">) {
  if (!isSameOrigin(request)) return jsonError(403, "Request not allowed.");
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = z.object({ description: z.string().trim().max(500) }).safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Descriptions can be up to 500 characters.");
  const sensitive = findSensitiveData(parsed.data.description);
  if (sensitive) return jsonError(400, sensitive);

  const { supabase, row } = await loadOwnedEvidence(id, auth.user.id);
  if (!supabase || !row) return jsonError(404, "File not found.");
  const { data, error } = await supabase
    .from("evidence")
    .update({ description: parsed.data.description || null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(500, "Could not save the description. Please try again.");
  return jsonOk({ evidence: data });
}

/** Remove an evidence file (storage object and database record). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/evidence/[id]">) {
  if (!isSameOrigin(request)) return jsonError(403, "Request not allowed.");
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const { supabase, row } = await loadOwnedEvidence(id, auth.user.id);
  if (!supabase || !row) return jsonError(404, "File not found.");

  const { error: storageError } = await supabase.storage.from(EVIDENCE_BUCKET).remove([row.file_path]);
  if (storageError) return jsonError(502, "Could not remove the file. Please try again.");
  const { error } = await supabase.from("evidence").delete().eq("id", id);
  if (error) return jsonError(500, "Could not remove the file record. Please try again.");

  await addCaseEvent(supabase, {
    caseId: row.case_id,
    userId: auth.user.id,
    type: "evidence_removed",
    description: `Evidence removed: ${row.original_filename}`,
    metadata: { evidence_id: row.id },
  });
  return jsonOk({ ok: true });
}
