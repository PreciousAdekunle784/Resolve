import { timingSafeEqual } from "node:crypto";
import { jsonError, jsonOk } from "@/lib/api";
import { isEmailSubmissionConfigured } from "@/lib/email/google";
import { processPendingSubmissions } from "@/lib/submissions/engine";

export const maxDuration = 300;

/**
 * Background job (Vercel Cron, see vercel.json): resolves interrupted sends,
 * resumes queued submissions and checks Gmail threads for bank replies.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonError(503, "CRON_SECRET is not configured.");
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return jsonError(401, "Unauthorized.");
  if (!isEmailSubmissionConfigured()) return jsonOk({ skipped: "email submission not configured" });
  return jsonOk(await processPendingSubmissions());
}
