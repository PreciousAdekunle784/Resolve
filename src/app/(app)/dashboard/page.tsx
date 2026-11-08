import type { Metadata } from "next";
import Link from "next/link";
import { CaseList } from "@/components/app/case-list";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/cases";
import { formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const STAT_ICONS = {
  total: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z",
  action: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
  awaiting: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  resolved: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, profile } = await requireOnboardedUser("/dashboard");
  const sp = await searchParams;
  const supabase = await createClient();
  const { stats, cases, events } = await getDashboardData(supabase, user.id);
  const firstName = profile.full_name?.split(" ")[0];

  const tiles = [
    { label: "Total cases", value: stats.total, href: "/cases", icon: STAT_ICONS.total, tone: "" },
    { label: "Need your action", value: stats.needsAction, href: "/cases?filter=action", icon: STAT_ICONS.action, tone: stats.needsAction ? "text-warning-700" : "" },
    { label: "Awaiting institution", value: stats.awaiting, href: "/cases?filter=awaiting", icon: STAT_ICONS.awaiting, tone: "" },
    { label: "Resolved", value: stats.resolved, href: "/cases?filter=resolved", icon: STAT_ICONS.resolved, tone: stats.resolved ? "text-success-700" : "" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-ink-950">
            <span className="text-ink-400">{firstName ? `Hi ${firstName},` : "Your"}</span> {firstName ? "here's your overview" : "overview"}
          </h1>
          <p className="mt-1 text-sm text-ink-600">Track your cases, see what needs attention, and pick up where you left off.</p>
        </div>
        <ButtonLink href="/cases/new" size="lg">
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Report a Problem
        </ButtonLink>
      </header>

      {sp.welcome ? (
        <Alert tone="success" title="Your account is ready">
          Start by reporting the problem you&apos;re facing. You can save your progress at any step.
        </Alert>
      ) : null}
      {sp.saved ? <Alert tone="success">Your report is saved. Continue it any time from the list below.</Alert> : null}
      {sp.passwordUpdated ? <Alert tone="success">Your password has been updated.</Alert> : null}

      {/* Stats strip */}
      <section aria-label="Case summary" className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Link
            key={t.label}
            href={t.href}
            className={`flex items-center gap-4 p-4 transition-colors hover:bg-ink-50 sm:p-5 ${i % 2 === 1 ? "border-l border-ink-100" : ""} ${i >= 2 ? "border-t border-ink-100 lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
          >
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-700 sm:flex" aria-hidden="true">
              <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-ink-600">{t.label}</span>
              <span className={`tabular mt-0.5 block text-2xl font-semibold tracking-tight text-ink-950 ${t.tone}`}>{t.value}</span>
            </span>
          </Link>
        ))}
      </section>

      {stats.followUpsDue > 0 || stats.unfinished > 0 ? (
        <div className="flex flex-wrap gap-2">
          {stats.followUpsDue > 0 ? (
            <Link href="/cases?filter=followup" className="inline-flex items-center gap-2 rounded-full border border-warning-100 bg-warning-50 px-3.5 py-1.5 text-sm text-warning-800 hover:border-warning-500/40">
              <span className="size-1.5 rounded-full bg-warning-500" aria-hidden="true" />
              {stats.followUpsDue} follow-up{stats.followUpsDue === 1 ? "" : "s"} due
            </Link>
          ) : null}
          {stats.unfinished > 0 ? (
            <Link href="/cases?filter=unfinished" className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1.5 text-sm text-brand-700 hover:border-brand-300">
              <span className="size-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              You have {stats.unfinished} unfinished report{stats.unfinished === 1 ? "" : "s"} — Continue where you left off
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6">
        <section className="min-w-0 rounded-[var(--radius-card)] border border-ink-200 bg-white" aria-labelledby="recent-cases">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 id="recent-cases" className="text-base font-semibold text-ink-950">Your cases</h2>
            {cases.length > 0 ? (
              <Link href="/cases" className="rounded-full border border-ink-200 px-3 py-1 text-sm text-ink-700 hover:bg-ink-50">
                View all
              </Link>
            ) : null}
          </div>
          {cases.length === 0 ? (
            <div className="p-5 pt-2">
              <EmptyState
                className="border-none bg-ink-50"
                title="No cases yet"
                description="When something goes wrong with a transaction, report it here. Resolve will help you understand it and prepare a complaint."
                action={<ButtonLink href="/cases/new">Report your first problem</ButtonLink>}
              />
            </div>
          ) : (
            <CaseList cases={cases} />
          )}
        </section>

        <section className="min-w-0 rounded-[var(--radius-card)] border border-ink-200 bg-white" aria-labelledby="recent-activity">
          <h2 id="recent-activity" className="px-5 pt-4 pb-2 text-base font-semibold text-ink-950">Recent activity</h2>
          {events.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-500">Activity on your cases will appear here.</p>
          ) : (
            <ol className="grid gap-x-8 px-5 pt-2 pb-5 md:grid-cols-2">
              {events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4">
                  {i < events.length - 1 ? <span className="absolute top-3 left-[4.5px] h-full w-px bg-ink-200 md:hidden" aria-hidden="true" /> : null}
                  <span className="relative mt-1.5 size-2.5 shrink-0 rounded-full bg-ink-900 ring-4 ring-white" aria-hidden="true" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm text-ink-800">{e.description}</p>
                    <p className="text-xs text-ink-500">
                      <Link href={`/cases/${e.case_id}`} className="font-mono hover:text-brand-700">{e.cases?.case_number}</Link>
                      {" · "}
                      {formatRelative(e.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
