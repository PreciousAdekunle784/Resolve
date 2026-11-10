import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, requireApiUser } from "@/lib/api";
import { getProfile } from "@/lib/auth";
import { buildStatementPdf, type StatementCase, type StatementEvent } from "@/lib/statement-pdf";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const PAGE = 1000;

/** Reads every row of a query in pages of 1,000 (Supabase's default limit). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error("Could not load your records.");
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

function loadLogo(publicPath: string): Uint8Array | null {
  try {
    // Only files from /public/banks are ever read.
    const file = path.join(process.cwd(), "public", "banks", path.basename(publicPath));
    return readFileSync(file);
  } catch {
    return null;
  }
}

/**
 * Generates the signed-in user's account statement as a PDF. Every query runs
 * as the user (Row Level Security) and is filtered by their id, so the
 * statement can only contain their own records.
 */
export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const supabase: SupabaseClient = await createClient();

  try {
    const profile = await getProfile(uid);
    if (!profile) return jsonError(404, "We couldn't find your profile.");

    const [cases, events, evidence] = await Promise.all([
      fetchAll<Omit<StatementCase, "evidence_count">>((from, to) =>
        supabase
          .from("cases")
          .select("id, case_number, intake_status, issue_category, institution_name, amount, currency, transaction_date, transaction_reference, payment_channel, recipient_details, status, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAll<StatementEvent>((from, to) =>
        supabase.from("case_events").select("case_id, event_type, description, created_at").eq("user_id", uid).order("created_at", { ascending: true }).range(from, to),
      ),
      fetchAll<{ case_id: string }>((from, to) => supabase.from("evidence").select("case_id").eq("user_id", uid).range(from, to)),
    ]);

    const evidenceCount = new Map<string, number>();
    for (const e of evidence) evidenceCount.set(e.case_id, (evidenceCount.get(e.case_id) ?? 0) + 1);

    const generatedAt = new Date();
    const bytes = await buildStatementPdf(
      {
        generatedAt,
        profile,
        cases: cases.map((c) => ({ ...c, evidence_count: evidenceCount.get(c.id) ?? 0 })),
        events,
      },
      { loadLogo },
    );

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Resolve-statement-${generatedAt.toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[statement] failed:", error instanceof Error ? error.message : typeof error);
    return jsonError(500, "We couldn't generate your statement. Please try again.");
  }
}
