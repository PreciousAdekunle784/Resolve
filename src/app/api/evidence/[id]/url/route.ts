import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { EVIDENCE_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";

const SIGNED_URL_SECONDS = 300; // 5 minutes

/**
 * Returns a short-lived signed URL for viewing (or downloading) one of the
 * user's own evidence files. Files are never exposed through public URLs.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/evidence/[id]/url">) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "File not found.");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("evidence")
    .select("file_path, original_filename")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!row) return jsonError(404, "File not found.");

  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(row.file_path as string, SIGNED_URL_SECONDS, download ? { download: row.original_filename as string } : undefined);
  if (error || !data) return jsonError(502, "Could not open the file. Please try again.");
  return jsonOk({ url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS });
}
