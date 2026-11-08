import Link from "next/link";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { ISSUE_CATEGORY_INFO } from "@/lib/constants";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import type { CaseRow } from "@/lib/types";

export function CaseList({ cases }: { cases: CaseRow[] }) {
  return (
    <ul className="divide-y divide-ink-100">
      {cases.map((c) => {
        const inProgress = c.intake_status === "in_progress";
        const href = inProgress ? `/cases/${c.id}/report` : `/cases/${c.id}`;
        return (
          <li key={c.id}>
            <Link href={href} className="group flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-ink-50 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-500">{c.case_number}</span>
                  {inProgress ? <Badge tone="warning">Unfinished report</Badge> : <StatusBadge status={c.status} />}
                </div>
                <p className="truncate font-medium text-ink-900 group-hover:text-brand-700">
                  {c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].label : "New report"}
                  {c.institution_name ? <span className="text-ink-500"> · {c.institution_name}</span> : null}
                </p>
                {c.next_follow_up_date && !inProgress && c.status !== "resolved" && c.status !== "closed" ? (
                  <p className="text-xs text-warning-800">Follow up on {formatDate(c.next_follow_up_date)}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-6 text-sm sm:justify-end">
                <span className="tabular font-medium text-ink-900">{c.amount ? formatMoney(c.amount, c.currency) : "—"}</span>
                <span className="w-24 text-right text-xs text-ink-500">Updated {formatRelative(c.updated_at)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
