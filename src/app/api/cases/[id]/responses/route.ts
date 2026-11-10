import { z } from "zod";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { addCaseEvent } from "@/lib/cases";
import { formatDate, todayInLagos } from "@/lib/format";
import { caseContext } from "@/lib/submissions/api-context";

const body = z.object({
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from: z.string().trim().max(320).nullish(),
  subject: z.string().trim().max(500).nullish(),
  text: z.string().trim().min(10, "Paste the institution's reply (at least a sentence).").max(20000),
});

/** Records a reply from the institution that the user received themselves (e.g. by SMS, email or letter). */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/responses">) {
  const { id } = await ctx.params;
  const context = await caseContext(request, id);
  if (!context.ok) return context.response;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const v = parsed.data;
  if (v.receivedOn > todayInLagos()) return jsonError(400, "The date can't be in the future.");
  const { supabase, userId, c } = context.value;
  const { data, error } = await supabase
    .from("bank_responses")
    .insert({
      case_id: c.id,
      user_id: userId,
      source: "user_entered",
      received_at: `${v.receivedOn}T12:00:00+01:00`,
      from_address: v.from || null,
      subject: v.subject || null,
      body_text: v.text,
    })
    .select("*")
    .single();
  if (error || !data) return jsonError(500, "Could not save the reply. Please try again.");
  await addCaseEvent(supabase, {
    caseId: c.id,
    userId,
    type: "bank_response_received",
    description: `You added a reply from ${c.institution_name ?? "your institution"} received on ${formatDate(v.receivedOn)}`,
    metadata: { response_id: data.id },
  });
  return jsonOk({ response: data }, 201);
}
