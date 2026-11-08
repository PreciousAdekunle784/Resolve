import type { Metadata } from "next";
import Link from "next/link";
import { CaseList } from "@/components/app/case-list";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/cases";
import { formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, profile } = await requireOnboardedUser("/dashboard");
  const sp = await searchParams;
  const supabase = await createClient();
  const { stats, cases, events } = await getDashboardData(supabase, user.id);
  const firstName = profile.full_name?.split(" ")[0];

  const tiles = [
    { label: "Total cases", value: stats.total, href: "/cases", hint: "Reports you have completed" },
    { label: "Need your action", value: stats.needsAction, href: "/cases?filter=action", hint: "Drafts, information requests, escalations", tone: "warning" as const },
    { label: "Awaiting institution", value: stats.awaiting, href: "/cases?filter=awaiting", hint: "Submitted and waiting for a response" },
    { label: "Resolved", value: stats.resolved, href: "/cases?filter=resolved", hint: "Cases you marked as resolved", tone: "success" as const },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Your dashboard"}
        description="Track your cases, see what needs attention, and pick up where you left off."
        actions={<ButtonLink href="/cases/new" size="lg">Report a Problem</ButtonLink>}
      />

      {sp.welcome ? (
        <Alert tone="success" title="Your account is ready">
          Start by reporting the problem you&apos;re facing. You can save your progress at any step.
        </Alert>
      ) : null}
      {sp.passwordUpdated ? <Alert tone="success">Your password has been updated.</Alert> : null}
      {stats.followUpsDue > 0 ? (
        <Alert tone="warning" title={`${stats.followUpsDue} follow-up${stats.followUpsDue === 1 ? "" : "s"} due`}>
          You planned to follow up on {stats.followUpsDue === 1 ? "a case" : "some cases"} today or earlier.{" "}
          <Link href="/cases?filter=followup" className="font-medium text-brand-700 hover:underline">View cases</Link>
        </Alert>
      ) : null}
      {stats.unfinished > 0 ? (
        <Alert tone="info" title={`You have ${stats.unfinished} unfinished report${stats.unfinished === 1 ? "" : "s"}`}>
          Your answers are saved. <Link href="/cases?filter=unfinished" className="font-medium text-brand-700 hover:underline">Continue where you left off</Link>
        </Alert>
      ) : null}

      <section aria-label="Case summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="group rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 shadow-[var(--shadow-card)] transition-colors hover:border-ink-300 sm:p-5"
          >
            <p className="text-xs font-medium text-ink-600 sm:text-sm">{t.label}</p>
            <p
              className={`tabular mt-2 text-3xl font-semibold ${
                t.tone === "warning" && t.value > 0 ? "text-warning-700" : t.tone === "success" && t.value > 0 ? "text-success-700" : "text-ink-950"
              }`}
            >
              {t.value}
            </p>
            <p className="mt-1 hidden text-xs text-ink-500 sm:block">{t.hint}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Your cases"
            description="Most recently updated first"
            action={cases.length > 0 ? <ButtonLink href="/cases" variant="ghost" size="sm">View all</ButtonLink> : undefined}
          />
          {cases.length === 0 ? (
            <div className="p-5">
              <EmptyState
                className="border-none"
                title="No cases yet"
                description="When something goes wrong with a transaction, report it here. Resolve will help you understand it and prepare a complaint."
                action={<ButtonLink href="/cases/new">Report your first problem</ButtonLink>}
              />
            </div>
          ) : (
            <CaseList cases={cases} />
          )}
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          {events.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-500">Activity on your cases will appear here.</p>
          ) : (
            <ol className="space-y-0 px-5 py-4">
              {events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < events.length - 1 ? <span className="absolute top-3 left-[5px] h-full w-px bg-ink-200" aria-hidden="true" /> : null}
                  <span className="relative mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-100" aria-hidden="true" />
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
        </Card>
      </div>
    </div>
  );
}
