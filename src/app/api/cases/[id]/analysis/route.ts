import { isSameOrigin, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { AIError } from "@/lib/ai/errors";
import { ensureAIAllowed, runCaseAnalysis } from "@/lib/ai/service";
import { getProfile } from "@/lib/auth";
import { findOwnedCase } from "@/lib/cases";
import { createClient } from "@/lib/supabase/server";

// Reading several documents and analysing the case can take a while.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/analysis">) {
  if (!isSameOrigin(request)) return jsonError(403, "Request not allowed.");
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const supabase = await createClient();
  const [c, profile] = await Promise.all([findOwnedCase(supabase, auth.user.id, id), getProfile(auth.user.id)]);
  if (!c || !profile) return jsonError(404, "Case not found.");
  if (c.intake_status !== "complete") return jsonError(400, "Finish and submit your report before requesting an analysis.");

  try {
    await ensureAIAllowed(supabase, profile, "case_analysis");
    const result = await runCaseAnalysis(supabase, auth.user.id, c, profile);
    return jsonOk({ id: result.id });
  } catch (error) {
    if (error instanceof AIError) {
      return jsonError(error.httpStatus, error.userMessage, { code: error.code, retryable: error.retryable });
    }
    console.error("[analysis] unexpected error", error instanceof Error ? error.name : typeof error);
    return jsonError(500, "Something went wrong while analysing your case. Your information is saved — please try again.", {
      retryable: true,
    });
  }
}
