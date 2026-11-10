import { z } from "zod";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { caseContext, errorResponse } from "@/lib/submissions/api-context";
import { createEmailSubmission, createPortalSubmission } from "@/lib/submissions/engine";

export const maxDuration = 120;

const body = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("email"),
    draftId: z.string().uuid(),
    channelId: z.string().uuid().nullish(),
    recipient: z.string().max(320).nullish(),
    recipientConfirmed: z.boolean().default(false),
    evidenceIds: z.array(z.string().uuid()).max(10).default([]),
    idempotencyKey: z.string().min(8).max(100),
    authorized: z.literal(true, { message: "Please confirm that you authorise Resolve to send this complaint." }),
  }),
  z.object({
    method: z.literal("guided_portal"),
    draftId: z.string().uuid(),
    channelId: z.string().uuid().nullish(),
    url: z.string().max(500).nullish(),
    urlConfirmed: z.boolean().default(false),
    idempotencyKey: z.string().min(8).max(100),
    authorized: z.literal(true, { message: "Please confirm you'll submit the complaint yourself." }),
  }),
]);

/**
 * Submits an approved complaint to the user's institution.
 * Requires an explicit authorisation flag and an idempotency key; replaying the
 * same key returns the original submission instead of sending again.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/submissions">) {
  const { id } = await ctx.params;
  const context = await caseContext(request, id);
  if (!context.ok) return context.response;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const v = parsed.data;
  if (v.method === "email" && !v.channelId && !v.recipient) return jsonError(400, "Choose where to send your complaint.");
  if (v.method === "guided_portal" && !v.channelId && !v.url) return jsonError(400, "Choose your institution's complaint page.");
  try {
    const result =
      v.method === "email"
        ? await createEmailSubmission(context.value, v)
        : await createPortalSubmission(context.value, v);
    return jsonOk(result, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse(error, "Something went wrong. Check the submission history before trying again.");
  }
}
