"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import { METHOD_LABELS, SUBMISSION_STATUS_INFO } from "@/lib/submissions/labels";
import type { SubmissionAuditRow, SubmissionRow } from "@/lib/types";
import { postJson, todayLagos } from "./api";

const AUDIT_LABELS: Record<string, string> = {
  created: "Submission created",
  authorized: "You authorised it",
  send_started: "Handed to Gmail",
  provider_accepted: "Gmail confirmed it was sent",
  provider_rejected: "Not sent",
  outcome_unknown: "Outcome couldn't be confirmed",
  reconciled: "Checked your mailbox for it",
  retry_requested: "You asked to try again",
  user_confirmed: "You confirmed it was submitted",
  user_reported_not_sent: "You reported it wasn't sent",
  cancelled: "Cancelled",
  replies_checked: "Checked for replies",
  reply_found: "Reply found",
};

function ConfirmForm({ submission, onDone }: { submission: SubmissionRow; onDone: (message: string) => void }) {
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(todayLagos());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/submissions/${submission.id}`, { action: "confirm_submitted", reference: reference || null, submittedOn: date });
    setBusy(false);
    if (r.ok) onDone("Thanks — your submission is recorded.");
    else setError(r.error);
  };
  return (
    <div className="space-y-3 rounded-xl border border-ink-200 px-4 py-3">
      <p className="text-sm font-medium text-ink-900">{submission.method === "email" ? "Is it in your Gmail Sent folder?" : "Submitted it on their website?"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date you submitted it" htmlFor={`date-${submission.id}`}>
          <Input id={`date-${submission.id}`} type="date" max={todayLagos()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reference they gave you" htmlFor={`ref-${submission.id}`} optional>
          <Input id={`ref-${submission.id}`} className="font-mono" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
      <Button size="sm" onClick={confirm} loading={busy}>{submission.method === "email" ? "Yes, it was sent" : "I've submitted it"}</Button>
    </div>
  );
}

function SubmissionItem({ s, audit, canReadReplies }: { s: SubmissionRow; audit: SubmissionAuditRow[]; canReadReplies: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const info = SUBMISSION_STATUS_INFO[s.status];

  const act = async (action: string, success: (data: Record<string, unknown>) => string) => {
    setBusy(action);
    setMessage(null);
    const r = await postJson<Record<string, unknown>>(`/api/submissions/${s.id}`, { action });
    setBusy(null);
    if (r.ok) setMessage({ tone: "success", text: success(r.data) });
    else setMessage({ tone: "error", text: r.error });
    router.refresh();
  };

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={info.tone} dot>{info.label}</Badge>
            <span className="text-xs text-ink-500">{METHOD_LABELS[s.method]} · version {s.draft_version}</span>
            {s.recipient_source === "verified_directory" ? <Badge tone="success">Verified channel</Badge> : s.recipient_source === "user_provided" ? <Badge tone="neutral">Provided by you</Badge> : <Badge tone="warning">Unverified channel</Badge>}
          </div>
          <p className="text-sm font-medium break-all text-ink-900">{s.recipient}</p>
          <p className="text-xs text-ink-600">
            {s.sent_at ? `Sent ${formatDate(s.sent_at, { withTime: true })}` : s.user_confirmed_at ? `Confirmed ${formatDate(s.user_confirmed_at, { withTime: true })}` : `Authorised ${formatDate(s.authorized_at, { withTime: true })}`}
            {s.sender_address ? ` · from ${s.sender_address}` : ""}
          </p>
        </div>
      </div>

      <p className="text-sm text-ink-700">{info.description}</p>
      {s.provider_message_id ? <p className="text-xs text-ink-500">Gmail message ID <span className="font-mono">{s.provider_message_id}</span></p> : null}
      {s.user_reference ? <p className="text-xs text-ink-500">Their reference <span className="font-mono">{s.user_reference}</span></p> : null}
      {s.attachments.length > 0 ? <p className="text-xs text-ink-500">Attached: {s.attachments.map((a) => a.filename).join(", ")}</p> : null}
      {s.last_error && (s.status === "failed" || s.status === "unknown") ? <Alert tone={s.status === "failed" ? "error" : "warning"}>{s.last_error}</Alert> : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {s.status === "unknown" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-700">Open your Gmail <strong>Sent</strong> folder and look for an email to {s.recipient} with the subject “{s.subject}”.</p>
          <div className="flex flex-wrap gap-2">
            {canReadReplies ? (
              <Button size="sm" variant="secondary" loading={busy === "reconcile"} onClick={() => act("reconcile", (d) => ((d.submission as SubmissionRow | null)?.status === "sent" ? "Found it — Gmail confirms it was sent." : "Not found in Gmail yet."))}>
                Check Gmail again
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" loading={busy === "report_not_sent"} onClick={() => act("report_not_sent", () => "Marked as not sent. You can try again now.")}>
              It&apos;s not there
            </Button>
          </div>
          <ConfirmForm submission={s} onDone={(text) => { setMessage({ tone: "success", text }); router.refresh(); }} />
        </div>
      ) : null}

      {s.status === "awaiting_user_confirmation" ? (
        <div className="space-y-3">
          <a href={s.recipient} target="_blank" rel="noopener noreferrer" className={buttonClasses({ size: "sm", variant: "secondary" })}>Open the complaint page ↗</a>
          <ConfirmForm submission={s} onDone={(text) => { setMessage({ tone: "success", text }); router.refresh(); }} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {s.status === "failed" && s.method === "email" ? (
          <Button size="sm" loading={busy === "retry"} onClick={() => act("retry", (d) => ((d.submission as SubmissionRow).status === "sent" ? "Sent — Gmail confirmed it." : "Still not sent. See the message above."))}>
            Try again
          </Button>
        ) : null}
        {["failed", "queued", "awaiting_user_confirmation"].includes(s.status) ? (
          <Button size="sm" variant="ghost" loading={busy === "cancel"} onClick={() => act("cancel", () => "Cancelled.")}>Cancel</Button>
        ) : null}
        {s.status === "sent" && canReadReplies ? (
          <Button size="sm" variant="secondary" loading={busy === "check_replies"} onClick={() => act("check_replies", (d) => (Number(d.found) > 0 ? `Found ${d.found} new ${Number(d.found) === 1 ? "reply" : "replies"}.` : "No new replies yet."))}>
            Check for replies
          </Button>
        ) : null}
      </div>
      {s.status === "sent" && !canReadReplies ? <p className="text-xs text-ink-500">Replies will arrive in your Gmail. Add them below so Resolve can track them.</p> : null}
      {s.status === "sent" && s.last_checked_for_replies_at ? <p className="text-xs text-ink-500">Last checked for replies {formatDate(s.last_checked_for_replies_at, { withTime: true })}</p> : null}

      {audit.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-600 hover:text-ink-900">Activity log ({audit.length})</summary>
          <ol className="mt-2 space-y-1 border-l border-ink-200 pl-3">
            {audit.map((a) => (
              <li key={a.id} className="text-ink-700">
                <span className="text-ink-500">{formatDate(a.created_at, { withTime: true })}</span> — {AUDIT_LABELS[a.action] ?? a.action}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

export function SubmissionHistory({ submissions, audit, canReadReplies }: { submissions: SubmissionRow[]; audit: SubmissionAuditRow[]; canReadReplies: boolean }) {
  return (
    <Card>
      <CardHeader title="Submission history" description="Every attempt, exactly as it happened. “Sent” only appears when Gmail confirms it." />
      <CardBody>
        {submissions.length === 0 ? (
          <p className="text-sm text-ink-600">Nothing submitted yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {submissions.map((s) => (
              <SubmissionItem key={s.id} s={s} audit={audit.filter((a) => a.submission_id === s.id)} canReadReplies={canReadReplies} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
