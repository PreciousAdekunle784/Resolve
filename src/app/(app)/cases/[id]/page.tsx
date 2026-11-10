import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clsx } from "clsx";
import { EvidenceManager } from "@/components/app/evidence-manager";
import { getSupabasePublishableKey } from "@/lib/env";
import { Timeline } from "@/components/app/timeline";
import { GuidanceCard } from "@/components/guidance-card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/misc";
import { isAIConfigured } from "@/lib/ai";
import { findUnsupportedDetails } from "@/lib/ai/grounding";
import { caseAnalysisSchema, type StoredCaseAnalysis } from "@/lib/ai/schemas";
import { requireOnboardedUser } from "@/lib/auth";
import { getCaseOrNotFound } from "@/lib/cases";
import { confirmedFactTexts } from "@/lib/complaint-template";
import {
  CASE_STATUS_INFO,
  ISSUE_CATEGORY_INFO,
  PAYMENT_CHANNEL_LABELS,
  SUBMISSION_CHANNEL_LABELS,
} from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { getRelevantGuidance } from "@/lib/guidance";
import { createClient } from "@/lib/supabase/server";
import type { AiAnalysisRow, CaseEventRow, CaseRow, ComplaintDraftRow, EvidenceRow, GuidanceRow } from "@/lib/types";
import { AnalysisView, NoAnalysisYet, RunAnalysisButton } from "./analysis-panel";
import { ComplaintBuilder } from "./complaint-builder";
import { DeleteCase } from "./delete-case";
import { TrackingPanels } from "./tracking-forms";

export const metadata: Metadata = { title: "Case" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "evidence", label: "Evidence" },
  { key: "analysis", label: "AI analysis" },
  { key: "complaint", label: "Complaint" },
  { key: "tracking", label: "Tracking & history" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Deterministic "what's next" prompt based on the case's status. */
function nextAction(c: CaseRow, hasApprovedDraft: boolean): { title: string; body: string; href: string; cta: string } {
  switch (c.status) {
    case "draft":
      return hasApprovedDraft
        ? { title: "Send your complaint", body: "Your complaint is approved. Send it through your institution's official channel, then record the submission.", href: `/cases/${c.id}?tab=tracking`, cta: "Record submission" }
        : { title: "Prepare your complaint", body: "Review the analysis, then create and approve your complaint draft.", href: `/cases/${c.id}?tab=complaint`, cta: "Open complaint builder" };
    case "submitted_to_institution":
    case "awaiting_institution_response":
      return { title: "Wait for a response — and follow up", body: "Record any reply you receive. Plan a follow-up date so the case doesn't go quiet.", href: `/cases/${c.id}?tab=tracking`, cta: "Update tracking" };
    case "additional_information_required":
      return { title: "Send the information requested", body: "Gather what your institution asked for, add it as evidence, and record when you sent it.", href: `/cases/${c.id}?tab=evidence`, cta: "Add evidence" };
    case "ready_for_escalation":
      return { title: "Check the official escalation route", body: "Read the official guidance before escalating, and keep your institution's complaint reference handy.", href: "/help/guidance", cta: "View official guidance" };
    case "escalated_by_user":
      return { title: "Track your escalation", body: "Record any responses and keep notes of every contact.", href: `/cases/${c.id}?tab=tracking`, cta: "Update tracking" };
    default:
      return { title: "This case is finished", body: "You can still view its full history and documents.", href: `/cases/${c.id}?tab=tracking`, cta: "View history" };
  }
}

export default async function CasePage({ params, searchParams }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, profile } = await requireOnboardedUser(`/cases/${id}`);
  const supabase = await createClient();
  const c = await getCaseOrNotFound(supabase, user.id, id);
  if (c.intake_status === "in_progress") redirect(`/cases/${id}/report`);
  const tab: Tab = TABS.find((t) => t.key === sp.tab)?.key ?? "overview";

  const [evidenceRes, analysisRes, draftsRes, eventsRes] = await Promise.all([
    supabase.from("evidence").select("*").eq("case_id", id).order("created_at"),
    supabase.from("ai_analyses").select("*").eq("case_id", id).eq("analysis_type", "case_analysis").order("created_at", { ascending: false }).limit(1),
    supabase.from("complaint_drafts").select("*").eq("case_id", id).order("version", { ascending: false }),
    supabase.from("case_events").select("*").eq("case_id", id).order("created_at", { ascending: true }),
  ]);
  if (evidenceRes.error || analysisRes.error || draftsRes.error || eventsRes.error) throw new Error("Could not load this case.");
  const evidence = (evidenceRes.data ?? []) as EvidenceRow[];
  const analysisRow = (analysisRes.data?.[0] as AiAnalysisRow | undefined) ?? null;
  const drafts = (draftsRes.data ?? []) as ComplaintDraftRow[];
  const events = (eventsRes.data ?? []) as CaseEventRow[];

  const parsedAnalysis = analysisRow ? caseAnalysisSchema.safeParse(analysisRow.structured_result) : null;
  const hasGrounding = Boolean(analysisRow && (analysisRow.structured_result as { grounding?: unknown }).grounding);
  const analysis = parsedAnalysis?.success && hasGrounding ? (analysisRow!.structured_result as unknown as StoredCaseAnalysis) : null;

  let guidance: GuidanceRow[] = [];
  try {
    guidance = await getRelevantGuidance(supabase, { country: profile.country, category: c.issue_category });
  } catch {
    guidance = [];
  }

  const currentDraft = drafts.find((d) => d.status !== "superseded") ?? null;
  const draftWarnings = currentDraft
    ? findUnsupportedDetails(`${currentDraft.subject}\n${currentDraft.content}`, confirmedFactTexts(c, profile, evidence))
    : [];
  const next = nextAction(c, currentDraft?.status === "approved");
  const aiAvailable = isAIConfigured();
  const title = c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].label : "Case";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link href="/cases" className="text-sm text-ink-600 hover:text-ink-900">← All cases</Link>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-ink-500">{c.case_number}</span>
              <StatusBadge status={c.status} />
            </div>
            <h1 className="text-2xl font-semibold text-ink-950">
              {title}
              {c.institution_name ? <span className="text-ink-500"> · {c.institution_name}</span> : null}
            </h1>
            <p className="tabular text-lg font-medium text-ink-800">{formatMoney(c.amount, c.currency)}</p>
          </div>
        </header>
      </div>

      {sp.submitted ? (
        <Alert tone="success" title="Your case has been created">
          Next, {aiAvailable && profile.ai_processing_consent ? "run an AI analysis to check your details, then " : ""}prepare your complaint.
        </Alert>
      ) : null}
      {sp.updated ? <Alert tone="success">Your changes were saved and recorded in the case history.</Alert> : null}

      <nav aria-label="Case sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "overview" ? `/cases/${id}` : `/cases/${id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={clsx(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-brand-600 text-ink-950" : "border-transparent text-ink-600 hover:text-ink-900",
            )}
          >
            {t.label}
            {t.key === "evidence" ? <span className="ml-1.5 text-xs text-ink-500">{evidence.length}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Transaction details"
                description="Facts you have confirmed. These are used to build your complaint."
                action={<ButtonLink href={`/cases/${id}/report?step=2`} variant="ghost" size="sm">Edit</ButtonLink>}
              />
              <CardBody>
                <DescriptionList
                  items={[
                    { label: "Institution", value: c.institution_name },
                    { label: "Amount", value: formatMoney(c.amount, c.currency) },
                    { label: "Date and time", value: formatDate(c.transaction_date, { withTime: true }) },
                    { label: "Payment channel", value: c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : null },
                    { label: "Transaction reference", value: c.transaction_reference, mono: true },
                    { label: "Recipient / payee", value: c.recipient_details },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="What happened" action={<ButtonLink href={`/cases/${id}/report?step=3`} variant="ghost" size="sm">Edit</ButtonLink>} />
              <CardBody className="space-y-4 text-sm">
                <p className="leading-relaxed whitespace-pre-line text-ink-800">{c.incident_description}</p>
                {c.previous_attempts ? (
                  <div>
                    <p className="text-xs font-medium text-ink-500">Previous attempts</p>
                    <p className="mt-0.5 whitespace-pre-line text-ink-800">{c.previous_attempts}</p>
                  </div>
                ) : null}
                {c.requested_resolution ? (
                  <div>
                    <p className="text-xs font-medium text-ink-500">Requested outcome</p>
                    <p className="mt-0.5 whitespace-pre-line text-ink-800">{c.requested_resolution}</p>
                  </div>
                ) : null}
                {c.supplementary_info.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-ink-500">Your answers to follow-up questions</p>
                    <ul className="mt-1 space-y-1.5">
                      {c.supplementary_info.map((s) => (
                        <li key={s.question} className="text-ink-800"><span className="text-ink-500">{s.question}</span><br />{s.answer}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </div>
          <div className="space-y-6">
            <Card className="border-brand-100">
              <CardHeader title="Next step" />
              <CardBody className="space-y-3">
                <p className="font-medium text-ink-900">{next.title}</p>
                <p className="text-sm text-ink-600">{next.body}</p>
                <ButtonLink href={next.href} size="sm">{next.cta}</ButtonLink>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Complaint tracking" />
              <CardBody>
                <DescriptionList
                  items={[
                    { label: "Status", value: CASE_STATUS_INFO[c.status].label },
                    { label: "Submitted on", value: c.institution_submission_date ? formatDate(c.institution_submission_date) : null },
                    { label: "Submitted by", value: c.institution_submission_channel ? SUBMISSION_CHANNEL_LABELS[c.institution_submission_channel] : null },
                    { label: "Institution reference", value: c.institution_reference, mono: true },
                    { label: "Next follow-up", value: c.next_follow_up_date ? formatDate(c.next_follow_up_date) : null },
                    ...(c.resolution_details ? [{ label: "Outcome", value: c.resolution_details }] : []),
                  ]}
                />
              </CardBody>
            </Card>
            {guidance.length > 0 ? (
              <Card>
                <CardHeader title="Official guidance" description="Check the official source before relying on it." />
                <CardBody className="space-y-2">
                  {guidance.slice(0, 4).map((g) => (
                    <a key={g.id} href={g.source_url} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium text-brand-700 hover:underline">
                      {g.title}
                      {g.status !== "verified" ? <span className="ml-1 text-xs font-normal text-warning-800">(not yet verified)</span> : null}
                    </a>
                  ))}
                  <Link href="/help/guidance" className="block pt-1 text-xs text-ink-500 hover:text-ink-800">All guidance →</Link>
                </CardBody>
              </Card>
            ) : null}
            <div className="flex justify-end">
              <DeleteCase caseId={c.id} caseNumber={c.case_number} />
            </div>
          </div>
        </div>
      ) : null}

      {tab === "evidence" ? (
        <Card>
          <CardHeader title="Evidence" description="Files are private. Only you can view them, through links that expire after 5 minutes." />
          <CardBody>
            <EvidenceManager caseId={c.id} initialEvidence={evidence} supabaseKey={getSupabasePublishableKey()} />
          </CardBody>
        </Card>
      ) : null}

      {tab === "analysis" ? (
        <div className="space-y-5">
          <RunAnalysisButton caseId={c.id} hasAnalysis={Boolean(analysisRow)} aiAvailable={aiAvailable} consent={profile.ai_processing_consent} />
          {analysisRow && !analysis ? (
            <Alert tone="error">The last analysis couldn&apos;t be displayed because it failed validation. Please run a new analysis.</Alert>
          ) : null}
          {analysis && analysisRow ? (
            <AnalysisView
              caseId={c.id}
              analysisId={analysisRow.id}
              analysis={analysis}
              model={analysisRow.model_identifier}
              createdAt={analysisRow.created_at}
              reviewedAt={analysisRow.reviewed_at}
              review={analysisRow.user_review}
              answers={c.supplementary_info}
              currentValues={{
                amount: c.amount ? formatMoney(c.amount, c.currency) : null,
                currency: c.currency,
                transaction_date: c.transaction_date ? formatDate(c.transaction_date, { withTime: true }) : null,
                transaction_reference: c.transaction_reference,
                institution_name: c.institution_name,
                payment_channel: c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : null,
                recipient_details: c.recipient_details,
              }}
              guidanceTitles={Object.fromEntries(guidance.map((g) => [g.id, { title: g.title, url: g.source_url, status: g.status }]))}
            />
          ) : !analysisRow ? (
            <NoAnalysisYet />
          ) : null}
          {guidance.length > 0 && !analysis ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-ink-900">Official guidance for this type of problem</h2>
              {guidance.slice(0, 3).map((g) => (
                <GuidanceCard key={g.id} g={g} />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "complaint" ? (
        <ComplaintBuilder caseId={c.id} drafts={drafts} warnings={draftWarnings} aiAvailable={aiAvailable} consent={profile.ai_processing_consent} />
      ) : null}

      {tab === "tracking" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-ink-900">Update your case</h2>
            <TrackingPanels c={c} />
          </div>
          <Card>
            <CardHeader title="Case history" description="Every change, oldest first. History can't be edited." />
            <CardBody>
              <Timeline events={events} />
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
