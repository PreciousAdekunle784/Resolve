"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CASE_STATUS_INFO, type CaseStatus } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { StoredBankResponseAnalysis } from "@/lib/orchestrator/schemas";
import { RESPONSE_CLASSIFICATION_INFO } from "@/lib/submissions/labels";
import type { BankResponseRow } from "@/lib/types";
import { postJson, todayLagos } from "./api";

function AddResponseForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayLagos());
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Add a reply you received</Button>;
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/cases/${caseId}/responses`, { receivedOn: date, from: from || null, subject: subject || null, text });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setText("");
    setSubject("");
    setFrom("");
    router.refresh();
  };
  return (
    <div className="space-y-3 rounded-xl border border-ink-200 px-4 py-4">
      <p className="text-sm text-ink-700">Paste a reply you got by email, SMS, letter or in the app. Don&apos;t include PINs, OTPs or passwords.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date received" htmlFor="resp-date">
          <Input id="resp-date" type="date" max={todayLagos()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="From" htmlFor="resp-from" optional>
          <Input id="resp-from" value={from} maxLength={320} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Subject" htmlFor="resp-subject" optional>
          <Input id="resp-subject" value={subject} maxLength={500} onChange={(e) => setSubject(e.target.value)} />
        </Field>
      </div>
      <Field label="Their reply" htmlFor="resp-text">
        <Textarea id="resp-text" rows={6} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={busy}>Save reply</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function AnalysisView({ r, a, caseId, caseStatus }: { r: BankResponseRow; a: StoredBankResponseAnalysis; caseId: string; caseStatus: CaseStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const cls = RESPONSE_CLASSIFICATION_INFO[a.classification] ?? RESPONSE_CLASSIFICATION_INFO.unclear;
  const suggested = a.suggested_case_status;

  const apply = async () => {
    setBusy(true);
    const res = await postJson<{ label: string }>(`/api/responses/${r.id}`, { action: "apply_status" });
    setBusy(false);
    setMessage(res.ok ? { tone: "success", text: `Case status set to “${res.data.label}”.` } : { tone: "error", text: res.error });
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={cls.tone} dot>{cls.label}</Badge>
        <Badge tone="warning">AI interpretation</Badge>
        <span className="text-xs text-ink-500">Check it against the original reply</span>
      </div>
      <p className="text-ink-800">{a.summary}</p>
      {a.reference_numbers.length > 0 ? (
        <p className="text-ink-700">Their reference: {a.reference_numbers.map((x) => <span key={x.value} className="mr-2 font-mono text-ink-900">{x.value}</span>)}</p>
      ) : null}
      {a.information_requested.length > 0 ? (
        <div>
          <p className="font-medium text-ink-900">They asked for</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-700">{a.information_requested.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ) : null}
      {a.timeframes.length > 0 ? <p className="text-ink-700">Timeframe they gave: {a.timeframes.map((t) => `“${t.quote}”`).join(", ")}</p> : null}
      {a.amounts.length > 0 ? <p className="text-ink-700">Amounts mentioned: {a.amounts.map((x) => x.value).join(", ")}</p> : null}
      {a.reply_points.length > 0 ? (
        <div>
          <p className="font-medium text-ink-900">If you reply, consider</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-700">{a.reply_points.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ) : null}
      {a.status_reason ? <p className="text-ink-700">{a.status_reason}</p> : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {suggested && suggested !== caseStatus ? (
        suggested === "resolved" ? (
          <Link href={`/cases/${caseId}?tab=tracking`} className={buttonClasses({ size: "sm", variant: "secondary" })}>Record the outcome</Link>
        ) : (
          <Button size="sm" variant="secondary" onClick={apply} loading={busy}>
            Set status to “{CASE_STATUS_INFO[suggested].label}”
          </Button>
        )
      ) : null}
      {a.grounding.removed.length > 0 ? <p className="text-xs text-ink-500">Resolve removed {a.grounding.removed.length} detail(s) the AI mentioned that aren&apos;t in the reply.</p> : null}
    </div>
  );
}

function ResponseItem({ r, caseId, caseStatus, aiUsable }: { r: BankResponseRow; caseId: string; caseStatus: CaseStatus; aiUsable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysis = r.analysis as StoredBankResponseAnalysis | null;

  const act = async (action: string) => {
    setBusy(action);
    setError(null);
    const res = await postJson(`/api/responses/${r.id}`, { action });
    setBusy(null);
    if (!res.ok) setError(res.error);
    router.refresh();
  };
  const remove = async () => {
    if (!window.confirm("Remove this reply?")) return;
    setBusy("delete");
    const res = await postJson(`/api/responses/${r.id}`, {}, "DELETE");
    setBusy(null);
    if (!res.ok) setError(res.error);
    router.refresh();
  };

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={r.source === "email_reply" ? "info" : "neutral"}>{r.source === "email_reply" ? "From your Gmail" : "Added by you"}</Badge>
        {!r.user_reviewed_at ? <Badge tone="warning" dot>New</Badge> : null}
        <span className="text-xs text-ink-500">
          {formatDate(r.received_at, { withTime: r.source === "email_reply" })}
          {r.from_address ? ` · ${r.from_address}` : ""}
        </span>
      </div>
      {r.subject ? <p className="text-sm font-medium text-ink-900">{r.subject}</p> : null}
      <details open={!analysis}>
        <summary className="cursor-pointer text-xs text-ink-600 hover:text-ink-900">Original reply</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-50 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink-800">{r.body_text}</pre>
      </details>
      {analysis ? <AnalysisView r={r} a={analysis} caseId={caseId} caseStatus={caseStatus} /> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {!analysis && aiUsable ? (
          <Button size="sm" onClick={() => act("analyze")} loading={busy === "analyze"} loadingText="Reading the reply…">Explain this reply</Button>
        ) : null}
        {!r.user_reviewed_at ? <Button size="sm" variant="secondary" onClick={() => act("mark_reviewed")} loading={busy === "mark_reviewed"}>Mark as reviewed</Button> : null}
        {r.source === "user_entered" ? <Button size="sm" variant="ghost" onClick={remove} loading={busy === "delete"}>Remove</Button> : null}
      </div>
    </li>
  );
}

export function BankResponses({ caseId, caseStatus, responses, aiUsable }: { caseId: string; caseStatus: CaseStatus; responses: BankResponseRow[]; aiUsable: boolean }) {
  return (
    <Card id="responses" className="scroll-mt-24">
      <CardHeader title="Replies from your institution" description="Replies Resolve found in your Gmail thread, and any you add yourself." />
      <CardBody className="space-y-4">
        {responses.length === 0 ? <p className="text-sm text-ink-600">No replies yet.</p> : (
          <ul className="divide-y divide-ink-100">
            {responses.map((r) => <ResponseItem key={r.id} r={r} caseId={caseId} caseStatus={caseStatus} aiUsable={aiUsable} />)}
          </ul>
        )}
        <AddResponseForm caseId={caseId} />
      </CardBody>
    </Card>
  );
}
