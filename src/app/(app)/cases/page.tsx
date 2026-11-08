import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { CaseList } from "@/components/app/case-list";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { AWAITING_STATUSES, OPEN_STATUSES, USER_ACTION_STATUSES } from "@/lib/constants";
import { todayInLagos } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CaseRow } from "@/lib/types";

export const metadata: Metadata = { title: "My cases" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "action", label: "Needs action" },
  { key: "awaiting", label: "Awaiting institution" },
  { key: "followup", label: "Follow-up due" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
  { key: "unfinished", label: "Unfinished reports" },
] as const;

export default async function CasesPage({ searchParams }: PageProps<"/cases">) {
  const { user } = await requireOnboardedUser("/cases");
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.filter)?.key ?? "all";
  const supabase = await createClient();

  let query = supabase.from("cases").select("*").eq("user_id", user.id);
  switch (filter) {
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
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error("Could not load your cases.");
  const cases = (data ?? []) as CaseRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My cases"
        description="Every problem you've reported, with its current status."
        actions={<ButtonLink href="/cases/new">Report a Problem</ButtonLink>}
      />
      {sp.deleted ? <Alert tone="success">The case and its files were permanently deleted.</Alert> : null}
      <nav aria-label="Filter cases" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/cases" : `/cases?filter=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={clsx(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.key ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-100",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {cases.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No cases yet" : "No cases match this filter"}
          description={filter === "all" ? "Report a problem to create your first case." : "Try a different filter."}
          action={filter === "all" ? <ButtonLink href="/cases/new">Report a Problem</ButtonLink> : <ButtonLink href="/cases" variant="secondary">Show all cases</ButtonLink>}
        />
      ) : (
        <Card>
          <CaseList cases={cases} />
        </Card>
      )}
    </div>
  );
}
