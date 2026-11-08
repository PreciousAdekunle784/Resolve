import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IssueCategory } from "@/lib/constants";
import { todayInLagos } from "@/lib/format";
import type { GuidanceRow } from "@/lib/types";

/** True when a guidance record is in force on the given date (YYYY-MM-DD). */
export function isGuidanceInEffect(row: Pick<GuidanceRow, "effective_from" | "effective_until">, today: string): boolean {
  if (row.effective_from && row.effective_from > today) return false;
  if (row.effective_until && row.effective_until < today) return false;
  return true;
}

/** Orders records: verified first, then unverified, then outdated. */
export function rankGuidance<T extends Pick<GuidanceRow, "status">>(rows: T[]): T[] {
  const rank = (s: GuidanceRow["status"]) => (s === "verified" ? 0 : s === "unverified" ? 1 : 2);
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status));
}

/**
 * Official guidance retrieval. Returns records for a country that apply to a
 * given issue category (or to all categories), excluding archived records and
 * records that are not currently in effect. Verified records come first.
 */
export async function getRelevantGuidance(
  supabase: SupabaseClient,
  opts: { country: string; category?: IssueCategory | null },
): Promise<GuidanceRow[]> {
  let query = supabase.from("guidance_sources").select("*").eq("country", opts.country).neq("status", "archived");
  if (opts.category) {
    query = query.or(`issue_category.is.null,issue_category.eq.${opts.category}`);
  }
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(50);
  if (error) throw new Error("Could not load official guidance.");
  const today = todayInLagos();
  return rankGuidance(((data ?? []) as GuidanceRow[]).filter((g) => isGuidanceInEffect(g, today)));
}

export function guidanceStatusText(row: Pick<GuidanceRow, "status">): string {
  switch (row.status) {
    case "verified":
      return "Verified by Resolve";
    case "outdated":
      return "May be out of date";
    case "archived":
      return "Archived";
    default:
      return "Not yet verified by Resolve";
  }
}
