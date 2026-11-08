import { jsonError, requireApiUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/**
 * Downloads a JSON copy of everything Resolve stores about the user.
 * Evidence files themselves are listed (name, type, size); they can be
 * downloaded individually from each case.
 */
export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const supabase = await createClient();
  const uid = auth.user.id;

  const [profile, cases, events, evidence, analyses, drafts] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("cases").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("case_events").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("evidence").select("id, case_id, original_filename, mime_type, file_size, description, extraction_status, created_at").eq("user_id", uid),
    supabase.from("ai_analyses").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("complaint_drafts").select("*").eq("user_id", uid).order("created_at"),
  ]);
  if ([profile, cases, events, evidence, analyses, drafts].some((r) => r.error)) {
    return jsonError(500, "We couldn't prepare your export. Please try again.");
  }

  const payload = {
    exported_at: new Date().toISOString(),
    notice:
      "This file contains all information Resolve stores about your account. Evidence files are listed here and can be downloaded from each case.",
    profile: profile.data,
    cases: cases.data,
    case_events: events.data,
    evidence_files: evidence.data,
    ai_analyses: analyses.data,
    complaint_drafts: drafts.data,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="resolve-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
