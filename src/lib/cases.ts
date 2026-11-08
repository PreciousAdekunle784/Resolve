import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { AWAITING_STATUSES, OPEN_STATUSES, USER_ACTION_STATUSES } from "@/lib/constants";
import { todayInLagos } from "@/lib/format";
import type { CaseEventRow, CaseRow } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

/**
 * Case data access. All queries run as the signed-in user, so Row Level
 * Security guarantees users only ever see their own cases. We still filter by
 * user_id explicitly as a second layer of protection.
 */

export async function getCaseOrNotFound(supabase: SupabaseClient, userId: string, caseId: string): Promise<CaseRow> {
  if (!uuidSchema.safeParse(caseId).success) notFound();
  const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not load this case.");
  if (!data) notFound();
  return data as CaseRow;
}

/** Same as above but returns null instead of rendering a 404 (for API routes and actions). */
export async function findOwnedCase(supabase: SupabaseClient, userId: string, caseId: string): Promise<CaseRow | null> {
  if (!uuidSchema.safeParse(caseId).success) return null;
  const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not load this case.");
  return (data as CaseRow | null) ?? null;
}

export async function addCaseEvent(
  supabase: SupabaseClient,
  event: { caseId: string; userId: string; type: string; description: string; metadata?: Record<string, unknown> },
) {
  const { error } = await supabase.from("case_events").insert({
    case_id: event.caseId,
    user_id: event.userId,
    event_type: event.type,
    description: event.description.slice(0, 2000),
    metadata: event.metadata ?? {},
  });
  if (error) throw new Error("Could not record case activity.");
}

export async function getDashboardData(supabase: SupabaseClient, userId: string) {
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count: n, error } = await build(base());
    if (error) throw new Error("Could not load dashboard figures.");
    return n ?? 0;
  };
  const base = () => supabase.from("cases").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const complete = (q: ReturnType<typeof base>) => q.eq("intake_status", "complete");

  const [total, needsAction, awaiting, resolved, unfinished, followUpsDue] = await Promise.all([
    count((q) => complete(q)),
    count((q) => complete(q).in("status", USER_ACTION_STATUSES)),
    count((q) => complete(q).in("status", AWAITING_STATUSES)),
    count((q) => complete(q).eq("status", "resolved")),
    count((q) => q.eq("intake_status", "in_progress")),
    count((q) => complete(q).in("status", OPEN_STATUSES).lte("next_follow_up_date", todayInLagos())),
  ]);

  const [{ data: cases, error: casesError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("cases").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(8),
    supabase
      .from("case_events")
      .select("id, case_id, event_type, description, created_at, cases(case_number)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (casesError || eventsError) throw new Error("Could not load your recent activity.");

  return {
    stats: { total, needsAction, awaiting, resolved, unfinished, followUpsDue },
    cases: (cases ?? []) as CaseRow[],
    events: (events ?? []) as unknown as (Pick<CaseEventRow, "id" | "case_id" | "event_type" | "description" | "created_at"> & {
      cases: { case_number: string } | null;
    })[],
  };
}

export function caseTitle(c: Pick<CaseRow, "institution_name" | "issue_category">, labels: Record<string, { short: string }>) {
  const category = c.issue_category ? labels[c.issue_category].short : "New report";
  return c.institution_name ? `${category} · ${c.institution_name}` : category;
}
