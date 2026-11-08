import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isSameOrigin, jsonError, jsonOk, readJson, requireApiUser } from "@/lib/api";
import { findOwnedCase } from "@/lib/cases";
import { EVIDENCE_BUCKET, EVIDENCE_MAX_FILES_PER_CASE } from "@/lib/constants";
import { checkDeclaredFile, extensionFor } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});

/**
 * Step 1 of an evidence upload: validates the file's declared type/size and
 * returns a one-time signed upload URL for a path inside the user's own
 * private folder. The browser uploads directly to Supabase Storage (so large
 * files don't pass through our server), then calls the finalise endpoint.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/evidence/upload-url">) {
  if (!isSameOrigin(request)) return jsonError(403, "Request not allowed.");
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id: caseId } = await ctx.params;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid upload request.");
  const check = checkDeclaredFile(parsed.data);
  if (!check.ok) return jsonError(400, check.error);

  const supabase = await createClient();
  const owned = await findOwnedCase(supabase, auth.user.id, caseId);
  if (!owned) return jsonError(404, "Case not found.");

  const { count, error: countError } = await supabase
    .from("evidence")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId);
  if (countError) return jsonError(500, "Could not check your existing files. Please try again.");
  if ((count ?? 0) >= EVIDENCE_MAX_FILES_PER_CASE) {
    return jsonError(400, `A case can have up to ${EVIDENCE_MAX_FILES_PER_CASE} files. Remove a file to add another.`);
  }

  const ext = extensionFor(parsed.data.mimeType as Parameters<typeof extensionFor>[0]);
  const path = `${auth.user.id}/${caseId}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return jsonError(502, "Could not prepare the upload. Please try again.");

  return jsonOk({ path, signedUrl: data.signedUrl, token: data.token });
}
