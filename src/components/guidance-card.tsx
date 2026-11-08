import { Badge } from "@/components/ui/badge";
import { ISSUE_CATEGORY_INFO } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { GuidanceRow } from "@/lib/types";

export function GuidanceCard({ g, relevance }: { g: GuidanceRow; relevance?: string }) {
  const tone = g.status === "verified" ? "success" : g.status === "outdated" ? "danger" : "warning";
  return (
    <article className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold text-ink-950">{g.title}</h3>
          <p className="text-xs text-ink-500">
            {g.institution} · {g.issue_category ? ISSUE_CATEGORY_INFO[g.issue_category].label : "All problem types"}
          </p>
        </div>
        <Badge tone={tone} dot>
          {g.status === "verified"
            ? `Verified ${formatDate(g.verified_at)}`
            : g.status === "outdated"
              ? "May be out of date"
              : "Not yet verified by Resolve"}
        </Badge>
      </div>
      {relevance ? (
        <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-ink-800">
          <span className="font-medium">Why this may help: </span>
          {relevance}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-700">{g.content}</p>
      {g.status !== "verified" ? (
        <p className="mt-3 text-xs leading-relaxed text-warning-800">
          Resolve has not verified this summary against the official source. Read the official page before relying on
          it.
        </p>
      ) : null}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
        {g.publication_date ? (
          <div>
            <dt className="inline">Published: </dt>
            <dd className="inline">{formatDate(g.publication_date)}</dd>
          </div>
        ) : null}
        {g.effective_from ? (
          <div>
            <dt className="inline">Effective from: </dt>
            <dd className="inline">{formatDate(g.effective_from)}</dd>
          </div>
        ) : null}
        {g.effective_until ? (
          <div>
            <dt className="inline">Effective until: </dt>
            <dd className="inline">{formatDate(g.effective_until)}</dd>
          </div>
        ) : null}
      </dl>
      <a
        href={g.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium break-all text-brand-700 underline-offset-4 hover:underline"
      >
        Open official source
        <span className="sr-only">(opens in a new tab)</span>
        <svg className="size-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M11 3a1 1 0 100 2h2.59l-6.3 6.3a1 1 0 101.42 1.4L15 6.42V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
        </svg>
      </a>
    </article>
  );
}
