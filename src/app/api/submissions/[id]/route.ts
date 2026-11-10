import { z } from "zod";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { todayInLagos } from "@/lib/format";
import { errorResponse, submissionContext } from "@/lib/submissions/api-context";
import { cancelSubmission, checkForReplies, confirmSubmittedByUser, reconcileUnknownSubmission, reportNotSent, retrySubmission } from "@/lib/submissions/engine";

export const maxDuration = 120;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("check_replies") }),
  z.object({ action: z.literal("reconcile") }),
  z.object({ action: z.literal("report_not_sent") }),
  z.object({
    action: z.literal("confirm_submitted"),
    reference: z.string().trim().max(120).nullish(),
    submittedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

/** User actions on one of their submissions. */
export async function POST(request: Request, ctx: RouteContext<"/api/submissions/[id]">) {
  const { id } = await ctx.params;
  const context = await submissionContext(request, id);
  if (!context.ok) return context.response;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid request.");
  const s = context.value.submission;
  try {
    switch (parsed.data.action) {
      case "retry":
        return jsonOk({ submission: await retrySubmission(s) });
      case "cancel":
        return jsonOk({ submission: await cancelSubmission(s) });
      case "reconcile":
        return jsonOk({ submission: await reconcileUnknownSubmission(s.id) });
      case "report_not_sent":
        return jsonOk({ submission: await reportNotSent(s) });
      case "check_replies":
        return jsonOk({ found: await checkForReplies(s) });
      case "confirm_submitted": {
        const date = parsed.data.submittedOn;
        if (date > todayInLagos()) return jsonError(400, "The date can't be in the future.");
        return jsonOk({ submission: await confirmSubmittedByUser(s, { reference: parsed.data.reference || null, submittedOn: date }) });
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}
