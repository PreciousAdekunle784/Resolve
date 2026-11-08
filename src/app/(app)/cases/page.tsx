import type { Metadata } from "next";
import { CaseFilterBar } from "@/components/app/case-filters";
import { CaseList } from "@/components/app/case-list";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { CASE_PERIODS, countAdvancedFilters, parseCaseFilters, periodStart } from "@/lib/case-filters";
import { AWAITING_STATUSES, OPEN_STATUSES, USER_ACTION_STATUSES } from "@/lib/constants";
import { todayInLagos } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CaseRow } from "@/lib/types";

export const metadata: Metadata = { title: "My cases" };

export default async function CasesPage({ searchParams }: PageProps<"/cases">) {
  const { user } = await requireOnboardedUser("/cases");
  const sp = await searchParams;
  const filters = parseCaseFilters(sp);
  const supabase = await createClient();

  let query = supabase.from("cases").select("*").eq("user_id", user.id);
  switch (filters.view) {
    case "action":
      query = query.eq("intake_status", "complete").in("status", USER_ACTION_STATUSES);
      break;
    case "awaiting":
      query = query.eq("intake_status", "complete").in("status", AWAITING_STATUSES);
      break;
    case "followup":
      query = query.eq("intake_status", "complete").in("status", OPEN_STATUSES).lte("next_follow_up_date", todayInLagos());
      break;
    case "resolved":
      query = query.eq("status", "resolved");
      break;
    case "closed":
      query = query.eq("status", "closed");
      break;
    case "unfinished":
      query = query.eq("intake_status", "in_progress");
      break;
  }
  const days = CASE_PERIODS.find((p) => p.key === filters.period)?.days;
  if (days) query = query.gte("transaction_date", periodStart(days));
  if (filters.statuses.length) query = query.in("status", filters.statuses);
  if (filters.categories.length) query = query.in("issue_category", filters.categories);
  if (filters.channels.length) query = query.in("payment_channel", filters.channels);
  if (filters.min !== null) query = query.gte("amount", filters.min);
  if (filters.max !== null) query = query.lte("amount", filters.max);
  if (filters.q) {
    const term = `*${filters.q}*`;
    query = query.or(`case_number.ilike.${term},institution_name.ilike.${term},transaction_reference.ilike.${term}`);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error("Could not load your cases.");
  const cases = (data ?? []) as CaseRow[];
  const filtered = filters.view !== "all" || filters.period !== "any" || countAdvancedFilters(filters) > 0 || Boolean(filters.q);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-ink-950">
            <span className="text-ink-400">All</span> Cases
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            {filters.q ? <>Results for &ldquo;{filters.q}&rdquo; · </> : null}
            {cases.length} {cases.length === 1 ? "case" : "cases"}
            {filtered ? " match your filters" : ""}
          </p>
        </div>
        <ButtonLink href="/cases/new">Report a Problem</ButtonLink>
      </header>
      {sp.deleted ? <Alert tone="success">The case and its files were permanently deleted.</Alert> : null}

      <CaseFilterBar filters={filters} />

      {cases.length === 0 ? (
        <EmptyState
          title={filtered ? "No cases match these filters" : "No cases yet"}
          description={filtered ? "Try a different filter or search term." : "Report a problem to create your first case."}
          action={filtered ? <ButtonLink href="/cases" variant="secondary">Show all cases</ButtonLink> : <ButtonLink href="/cases/new">Report a Problem</ButtonLink>}
        />
      ) : (
        <section className="rounded-[var(--radius-card)] border border-ink-200 bg-white" aria-label="Cases">
          <CaseList cases={cases} />
        </section>
      )}
    </div>
  );
}
