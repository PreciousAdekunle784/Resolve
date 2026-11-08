import Link from "next/link";
import { clsx } from "clsx";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ISSUE_CATEGORY_INFO, type IssueCategory } from "@/lib/constants";
import { formatDate, formatMoney, todayInLagos } from "@/lib/format";
import type { CaseRow } from "@/lib/types";

const CATEGORY_STYLE: Record<IssueCategory, { chip: string; icon: string }> = {
  failed_or_pending_transfer: {
    chip: "bg-brand-100 text-brand-700",
    icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  },
  unauthorised_debit: {
    chip: "bg-rose-100 text-rose-700",
    icon: "M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  duplicate_transaction: {
    chip: "bg-amber-100 text-amber-800",
    icon: "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75m9 10.5h3.375c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125h-9.75c-.621 0-1.125.504-1.125 1.125V7.5",
  },
  erroneous_transfer: {
    chip: "bg-violet-100 text-violet-700",
    icon: "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
  },
};

const AVATAR_COLOURS = ["bg-ink-900", "bg-brand-700", "bg-emerald-700", "bg-rose-700", "bg-amber-700", "bg-violet-700", "bg-cyan-800"];

function avatarFor(name: string | null) {
  const label = (name ?? "")
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|bank|plc|ltd|limited)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { label: label || "?", colour: AVATAR_COLOURS[hash % AVATAR_COLOURS.length] };
}

export function CategoryChip({ category }: { category: IssueCategory | null }) {
  if (!category) return <span className="text-sm text-ink-500">Not chosen</span>;
  const style = CATEGORY_STYLE[category];
  return (
    <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap text-ink-800">
      <span className={clsx("flex size-6 shrink-0 items-center justify-center rounded-full", style.chip)} aria-hidden="true">
        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
        </svg>
      </span>
      {ISSUE_CATEGORY_INFO[category].short}
    </span>
  );
}

/** Case table in the style of a transactions list. Each row links to its case. */
export function CaseList({ cases }: { cases: CaseRow[] }) {
  const today = todayInLagos();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-xs text-ink-500">
            <th scope="col" className="hidden py-3 pr-4 pl-5 font-normal md:table-cell">Date</th>
            <th scope="col" className="py-3 pr-4 pl-5 font-normal md:pl-0">Case</th>
            <th scope="col" className="hidden py-3 pr-4 font-normal lg:table-cell">Category</th>
            <th scope="col" className="hidden py-3 pr-4 font-normal sm:table-cell">Status</th>
            <th scope="col" className="py-3 pr-5 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cases.map((c) => {
            const inProgress = c.intake_status === "in_progress";
            const href = inProgress ? `/cases/${c.id}/report` : `/cases/${c.id}`;
            const avatar = avatarFor(c.institution_name);
            const followUpDue =
              !inProgress && c.next_follow_up_date && c.next_follow_up_date <= today && c.status !== "resolved" && c.status !== "closed";
            const status = inProgress ? <Badge tone="warning" dot>Unfinished report</Badge> : <StatusBadge status={c.status} />;
            return (
              <tr key={c.id} className="group relative transition-colors hover:bg-ink-50/80">
                <td className="hidden py-4 pr-4 pl-5 whitespace-nowrap text-ink-600 md:table-cell">
                  {formatDate(c.transaction_date ?? c.created_at)}
                </td>
                <td className="py-4 pr-4 pl-5 md:pl-0">
                  <div className="flex items-center gap-3">
                    <span className={clsx("flex size-9 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white", avatar.colour)} aria-hidden="true">
                      {avatar.label}
                    </span>
                    <div className="min-w-0">
                      <Link href={href} className="block font-medium break-words text-ink-900 after:absolute after:inset-0 group-hover:text-brand-700 focus-visible:outline-offset-[-2px]">
                        {c.institution_name ?? (c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].label : "New report")}
                        <span className="sr-only"> — {c.case_number}</span>
                      </Link>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                        <span className="font-mono">{c.case_number}</span>
                        {followUpDue ? <span className="text-warning-800">· Follow-up due</span> : null}
                      </p>
                      <div className="mt-1.5 sm:hidden">{status}</div>
                    </div>
                  </div>
                </td>
                <td className="hidden py-4 pr-4 lg:table-cell">
                  <CategoryChip category={c.issue_category} />
                </td>
                <td className="hidden py-4 pr-4 whitespace-nowrap sm:table-cell">{status}</td>
                <td className="tabular py-4 pr-5 text-right font-medium whitespace-nowrap text-ink-900">
                  {c.amount ? formatMoney(c.amount, c.currency) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
