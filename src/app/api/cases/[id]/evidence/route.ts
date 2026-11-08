import { z } from "zod";
import { isSameOrigin, jsonError, jsonOk, readJson, requireApiUser } from "@/lib/api";
import { addCaseEvent, findOwnedCase } from "@/lib/cases";
import { EVIDENCE_BUCKET, EVIDENCE_MAX_FILE_BYTES } from "@/lib/constants";
import { detectMimeType, fileExtension, isAllowedMimeType, sanitizeFilename } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceRow } from "@/lib/types";
import { findSensitiveData } from "@/lib/validation";

const bodySchema = z.object({
  path: z.string().min(1).max(512),
  originalFilename: z.string().min(1).max(255),
  description: z.string().trim().max(500).optional(),
});

/**
 * Step 2 of an evidence upload: verifies the uploaded object on the server
 * (owner folder, real file type from its bytes, size) before recording it as
 * evidence. Anything that fails verification is deleted from storage.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/evidence">) {
  if (!isSameOrigin(request)) return jsonError(403, "Request not allowed.");
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id: caseId } = await ctx.params;
  const userId = auth.user.id;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid request.");
  const { path, originalFilename } = parsed.data;
  const description = parsed.data.description || null;
  const sensitive = findSensitiveData(description);
  if (sensitive) return jsonError(400, sensitive);

  // The path must be inside this user's folder for this case, with no tricks.
  const pathPattern = new RegExp(`^${userId}/${caseId}/[0-9a-f-]{36}\\.(png|jpg|pdf)$`);
  if (!pathPattern.test(path)) return jsonError(400, "Invalid file location.");

  const supabase = await createClient();
  const owned = await findOwnedCase(supabase, userId, caseId);
  if (!owned) return jsonError(404, "Case not found.");

  const discard = async () => {
    await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
  };

  const { data: blob, error: downloadError } = await supabase.storage.from(EVIDENCE_BUCKET).download(path);
  if (downloadError || !blob) return jsonError(400, "We couldn't find the uploaded file. Please try uploading it again.");

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > EVIDENCE_MAX_FILE_BYTES) {
    await discard();
    return jsonError(400, "Files must be between 1 byte and 10 MB.");
  }
  const realType = detectMimeType(bytes);
  if (!realType || !isAllowedMimeType(realType)) {
    await discard();
    return jsonError(400, "This file isn't a valid PNG, JPG or PDF. Please upload a different file.");
  }
  const expectedExt = realType === "image/jpeg" ? "jpg" : realType === "image/png" ? "png" : "pdf";
  if (fileExtension(path) !== expectedExt) {
    await discard();
    return jsonError(400, "The file's contents don't match its type. Please upload a different file.");
  }

  const { data: row, error: insertError } = await supabase
    .from("evidence")
    .insert({
      case_id: caseId,
      user_id: userId,
      file_path: path,
      original_filename: sanitizeFilename(originalFilename),
      mime_type: realType,
      file_size: bytes.byteLength,
      description,
      extraction_status: "not_started",
    })
    .select("*")
    .single();
  if (insertError || !row) {
    await discard();
    const limit = insertError?.message?.includes("at most 10");
    return jsonError(400, limit ? "A case can have up to 10 files." : "We couldn't save this file. Please try again.");
  }

  await addCaseEvent(supabase, {
    caseId,
    userId,
    type: "evidence_uploaded",
    description: `Evidence added: ${(row as EvidenceRow).original_filename}`,
    metadata: { evidence_id: row.id },
  });

  return jsonOk({ evidence: row as EvidenceRow }, 201);
}
