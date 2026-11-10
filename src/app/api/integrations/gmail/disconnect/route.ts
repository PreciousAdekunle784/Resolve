import { isSameOrigin, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { disconnectGmail } from "@/lib/email/connections";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

/** Revokes Resolve's Gmail access at Google and deletes the stored tokens. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "Request not allowed.");
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  if (!isAdminClientConfigured()) return jsonError(503, "Email connections aren't set up on this site.");
  try {
    await disconnectGmail(auth.user.id);
    return jsonOk({ ok: true });
  } catch {
    return jsonError(500, "Could not disconnect Gmail. Please try again.");
  }
}
