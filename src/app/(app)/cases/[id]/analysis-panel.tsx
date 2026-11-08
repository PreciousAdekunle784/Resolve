"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { InlineAction } from "@/components/forms/inline-action";
import { useFormAction } from "@/components/forms/use-form-action";
import { SourceBadge } from "@/components/app/source-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldError, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import type { StoredCaseAnalysis } from "@/lib/ai/schemas";
import { ISSUE_CATEGORY_INFO, type IssueCategory } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { SupplementaryAnswer } from "@/lib/types";
import {
  answerFollowUpAction,
  applySuggestionAction,
  dismissSuggestionAction,
  markAnalysisReviewedAction,
} from "./actions";

export function RunAnalysisButton({
  caseId,
  hasAnalysis,
  aiAvailable,
  consent,
}: {
  caseId: string;
  hasAnalysis: boolean;
  aiAvailable: boolean;
  consent: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ status: "idle" | "running" | "error"; message?: string; retryable?: boolean }>({ status: "idle" });

  if (!aiAvailable) {
    return (
      <Alert tone="warning" title="AI analysis isn't available right now">
        AI hasn&apos;t been set up for this Resolve installation. Everything else still works — you can review your
        case, upload evidence and create a complaint from the template.
      </Alert>
    );
  }
  if (!consent) {
    return (
      <Alert tone="info" title="AI analysis needs your permission" action={<Link href="/settings#privacy" className="text-sm font-medium text-brand-700 hover:underline">Turn on AI analysis in Settings</Link>}>
        With your permission, Resolve sends your case details and evidence to its AI provider to produce an analysis.
        You can withdraw permission at any time.
      </Alert>
    );
  }

  const run = async () => {
    setState({ status: "running" });
    try {
      const res = await fetch(`/api/cases/${caseId}/analysis`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", message: body.error ?? "The analysis failed. Please try again.", retryable: body.retryable !== false });
        return;
      }
      setState({ status: "idle" });
      router.refresh();
    } catch {
      setState({ status: "error", message: "We couldn't reach Resolve. Check your connection and try again.", retryable: true });
    }
  };

  return (
    <div className="space-y-3">
      {state.status === "running" ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-ink-800" role="status">
          <Spinner className="mt-0.5 size-4 text-brand-600" />
          <div>
            <p className="font-medium">Analysing your case…</p>
            <p className="text-ink-600">Reading your evidence and checking the details. This can take up to a couple of minutes — please keep this page open.</p>
          </div>
        </div>
      ) : null}
      {state.status === "error" ? (
        <Alert tone="error" title="The analysis didn't complete" action={state.retryable ? <Button size="sm" variant="secondary" onClick={run}>Try again</Button> : undefined}>
          {state.message}
        </Alert>
      ) : null}
      {state.status !== "running" ? (
        <Button onClick={run} variant={hasAnalysis ? "secondary" : "primary"}>
          {hasAnalysis ? "Run a new analysis" : "Analyse my case"}
        </Button>
      ) : null}
    </div>
  );
}

function FollowUpQuestion({ caseId, question, reason, existing }: { caseId: string; question: string; reason: string; existing?: SupplementaryAnswer }) {
  const { state, pending, onSubmit } = useFormAction(answerFollowUpAction);
  const [open, setOpen] = useState(!existing);
  return (
    <li className="space-y-2 rounded-[var(--radius-control)] border border-ink-200 bg-white p-4">
      <p className="text-sm font-medium text-ink-900">{question}</p>
      <p className="text-xs text-ink-500">{reason}</p>
      {existing && !open ? (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-ink-50 px-3 py-2">
          <p className="text-sm text-ink-800"><span className="font-medium">Your answer:</span> {existing.answer}</p>
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Change</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="question" value={question} />
          <Textarea name="answer" rows={2} maxLength={1000} defaultValue={existing?.answer ?? ""} aria-label={`Answer: ${question}`} invalid={!!errorsFor(state, "answer")} />
          <FieldError messages={errorsFor(state, "answer")} />
          {state && !state.ok && !errorsFor(state, "answer") ? <p className="text-xs text-danger-700">{state.error}</p> : null}
          {state?.ok ? <p className="text-xs text-success-700">{state.message}</p> : null}
          <Button type="submit" size="sm" loading={pending} loadingText="Saving…">Save answer</Button>
        </form>
      )}
    </li>
  );
}

export function AnalysisView({
  caseId,
  analysisId,
  analysis,
  model,
  createdAt,
  reviewedAt,
  review,
  answers,
  currentValues,
  guidanceTitles,
}: {
  caseId: string;
  analysisId: string;
  analysis: StoredCaseAnalysis;
  model: string;
  createdAt: string;
  reviewedAt: string | null;
  review: Record<string, unknown>;
  answers: SupplementaryAnswer[];
  currentValues: Record<string, string | null>;
  guidanceTitles: Record<string, { title: string; url: string; status: string }>;
}) {
  const reviewState = useFormAction(markAnalysisReviewedAction);
  const cat = analysis.category_assessment;
  const answered = new Map(answers.map((a) => [a.question, a]));

  return (
    <div className="space-y-5">
      <Alert tone="warning">
        This analysis was produced by AI on {formatDate(createdAt, { withTime: true })}. It can contain mistakes. Check
        each point, correct your case details where needed, and never treat it as legal advice or a promise of any outcome.
      </Alert>

      <Card>
        <CardHeader title="Summary" />
        <CardBody className="space-y-4">
          <p className="text-sm leading-relaxed whitespace-pre-line text-ink-800">{analysis.summary}</p>
          <div className="rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700">
            <span className="font-medium text-ink-900">Problem type: </span>
            {cat.likely_category === "unclear" ? "Unclear from the information so far" : ISSUE_CATEGORY_INFO[cat.likely_category as IssueCategory].label}
            {!cat.matches_selected_category ? <Badge tone="warning" className="ml-2">Differs from what you selected</Badge> : null}
            <p className="mt-1 text-ink-600">{cat.explanation}</p>
          </div>
        </CardBody>
      </Card>

      {analysis.conflicts.length > 0 ? (
        <Card className="border-warning-100">
          <CardHeader title="Details that don't match" description="Resolve these before sending your complaint." />
          <CardBody>
            <ul className="space-y-3">
              {analysis.conflicts.map((cf, i) => (
                <li key={i} className="rounded-md bg-warning-50 p-3 text-sm">
                  <p className="font-medium text-ink-900">{cf.description}</p>
                  <ul className="mt-1.5 space-y-0.5 text-ink-700">
                    {cf.values.map((v, j) => (
                      <li key={j}><span className="text-ink-500">{v.source}:</span> {v.value}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-ink-700"><span className="font-medium">How to resolve: </span>{cf.how_to_resolve}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {analysis.missing_information.length > 0 ? (
        <Card>
          <CardHeader title="Missing information" />
          <CardBody>
            <ul className="space-y-2">
              {analysis.missing_information.map((m, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <Badge tone={m.importance === "required" ? "warning" : "neutral"} className="mt-0.5 shrink-0">
                    {m.importance === "required" ? "Needed" : "Helpful"}
                  </Badge>
                  <span>
                    <span className="font-medium text-ink-900">{m.item}</span>
                    <span className="block text-ink-600">{m.why_it_matters}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link href={`/cases/${caseId}/report?step=2`} className="mt-4 inline-flex text-sm font-medium text-brand-700 hover:underline">
              Add details to your case →
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {analysis.follow_up_questions.length > 0 ? (
        <Card>
          <CardHeader title="Questions for you" description="Your answers are added to your case and used next time you run the analysis or generate a complaint." />
          <CardBody>
            <ul className="space-y-3">
              {analysis.follow_up_questions.map((q, i) => (
                <FollowUpQuestion key={i} caseId={caseId} question={q.question} reason={q.reason} existing={answered.get(q.question)} />
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Key facts" description="Each fact shows where it came from. Confirm details found in your documents to add them to your case." />
        <CardBody>
          {analysis.key_facts.length === 0 ? (
            <p className="text-sm text-ink-500">No key facts identified.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {analysis.key_facts.map((f, i) => {
                const decision = review[`fact_${i}`];
                const current = f.case_field !== "none" ? currentValues[f.case_field] : null;
                const canApply =
                  f.case_field !== "none" &&
                  f.source === "document_extracted" &&
                  decision !== "accepted" &&
                  decision !== "rejected" &&
                  (f.case_field === "amount" || f.case_field === "transaction_date" ? Boolean(f.normalized_value) : true);
                return (
                  <li key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-ink-500">{f.label}</p>
                        <SourceBadge source={f.source} />
                        {decision === "accepted" ? <Badge tone="success">Confirmed by you</Badge> : null}
                        {decision === "rejected" ? <Badge tone="muted">Marked incorrect</Badge> : null}
                      </div>
                      <p className="text-sm break-words text-ink-900">{f.value}</p>
                      <p className="text-xs text-ink-500">{f.source_detail}</p>
                      {canApply && current ? <p className="text-xs text-ink-600">Currently in your case: <span className="font-medium">{current}</span></p> : null}
                    </div>
                    {canApply ? (
                      <div className="flex shrink-0 gap-2">
                        <InlineAction action={applySuggestionAction} fields={{ caseId, analysisId, factIndex: String(i) }} label="Use this value" variant="secondary" />
                        <InlineAction action={dismissSuggestionAction} fields={{ caseId, analysisId, factIndex: String(i) }} label="Incorrect" variant="ghost" />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What to do next" />
        <CardBody>
          <ol className="space-y-3">
            {analysis.next_steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-xs font-medium text-brand-700">{i + 1}</span>
                <span>
                  <span className="font-medium text-ink-900">{s.title}</span>
                  <span className="block leading-relaxed text-ink-600">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      {analysis.evidence_suggestions.length > 0 ? (
        <Card>
          <CardHeader title="Evidence that may help" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {analysis.evidence_suggestions.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <Badge tone={e.already_provided ? "success" : "neutral"} className="mt-0.5 shrink-0">{e.already_provided ? "Provided" : "Suggested"}</Badge>
                  <span><span className="font-medium text-ink-900">{e.item}</span><span className="block text-ink-600">{e.reason}</span></span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {analysis.guidance_references.length > 0 ? (
        <Card>
          <CardHeader title="Official guidance" />
          <CardBody>
            <ul className="space-y-3 text-sm">
              {analysis.guidance_references.map((g) => {
                const meta = guidanceTitles[g.guidance_id];
                if (!meta) return null;
                return (
                  <li key={g.guidance_id} className="space-y-1">
                    <a href={meta.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">{meta.title}</a>
                    {meta.status !== "verified" ? <Badge tone="warning" className="ml-2">Not yet verified by Resolve</Badge> : null}
                    <p className="text-ink-600">{g.relevance}</p>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {analysis.important_cautions.length > 0 ? (
        <Alert tone="warning" title="Please note">
          <ul className="list-disc space-y-1 pl-5">
            {analysis.important_cautions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-500">
          Model: {model}
          {analysis.grounding.downgraded_facts.length > 0
            ? ` · ${analysis.grounding.downgraded_facts.length} fact(s) marked unverified by Resolve's checks`
            : " · All sourced facts matched your information or documents"}
        </p>
        {reviewedAt ? (
          <Badge tone="success">Reviewed {formatDate(reviewedAt)}</Badge>
        ) : (
          <form onSubmit={reviewState.onSubmit} className="flex flex-col items-start gap-1 sm:items-end">
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="analysisId" value={analysisId} />
            <Button type="submit" size="sm" loading={reviewState.pending}>I&apos;ve reviewed this analysis</Button>
            <FormMessage state={reviewState.state} />
          </form>
        )}
      </div>
    </div>
  );
}

export function NoAnalysisYet() {
  return (
    <EmptyState
      title="No analysis yet"
      description="Resolve can read your evidence, check your details for gaps or conflicts, ask follow-up questions and explain your options."
    />
  );
}
