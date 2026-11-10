"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { BankLogo } from "@/components/bank-logo";
import { CopyButton } from "@/components/forms/copy-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import { emailAuthorizationStatement, portalAuthorizationStatement } from "@/lib/submissions/labels";
import type { BankChannelRow } from "@/lib/types";
import { formatBytes, newIdempotencyKey, postJson } from "./api";

export interface SubmitFlowProps {
  caseId: string;
  caseNumber: string;
  institutionName: string | null;
  bank: { id: string; name: string } | null;
  draft: { id: string; version: number; subject: string; content: string; approved: boolean } | null;
  channels: BankChannelRow[];
  connection: { email: string; canReadReplies: boolean; status: "active" | "reauthorization_required" } | null;
  emailConfigured: boolean;
  evidence: { id: string; name: string; size: number; description: string | null }[];
  /** Lower-cased recipients this complaint version is already live with. */
  alreadySentTo: string[];
  aiAvailable: boolean;
  consent: boolean;
  customerDetails: string;
}

type Method = "email" | "guided_portal";
type Check = {
  checks: { ready: boolean; blocking: string[]; warnings: string[] };
  ai: { review: { summary: string; issues: { problem: string; suggestion: string }[]; tone_ok: boolean }; model: string } | null;
  ai_unavailable_reason: string | null;
};

const MAX_ATTACHMENTS = 15 * 1024 * 1024;

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative pl-11">
      <span
        className={clsx(
          "absolute top-0 left-0 inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset",
          done ? "bg-success-50 text-success-700 ring-success-100" : "bg-ink-50 text-ink-700 ring-ink-200",
        )}
        aria-hidden="true"
      >
        {done ? "✓" : n}
      </span>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </li>
  );
}

function ChannelBadge({ channel }: { channel: BankChannelRow }) {
  if (channel.status === "verified") {
    return (
      <Badge tone="success" dot>
        Verified{channel.verified_at ? ` ${formatDate(channel.verified_at)}` : ""}
      </Badge>
    );
  }
  return <Badge tone="warning">Not yet verified by Resolve</Badge>;
}

export function SubmitFlow(props: SubmitFlowProps) {
  const router = useRouter();
  const { draft, connection } = props;
  const emailChannels = props.channels.filter((c) => c.channel_type === "email");
  const portalChannels = props.channels.filter((c) => c.channel_type === "web_portal");
  const otherChannels = props.channels.filter((c) => c.channel_type === "phone");

  const [method, setMethod] = useState<Method>(props.emailConfigured ? "email" : "guided_portal");
  const channelsForMethod = method === "email" ? emailChannels : portalChannels;
  const firstUsable = channelsForMethod.find((c) => !props.alreadySentTo.includes(c.value.toLowerCase()));
  const [choice, setChoice] = useState<string>(firstUsable?.id ?? "custom");
  const [custom, setCustom] = useState("");
  const [customConfirmed, setCustomConfirmed] = useState(false);
  const [evidenceIds, setEvidenceIds] = useState<string[]>(props.evidence.map((e) => e.id));
  const [readReplies, setReadReplies] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState<"basic" | "ai" | null>(draft?.approved ? "basic" : null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error" | "warning"; title: string; message: string; blocking?: string[] } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const changeMethod = (m: Method) => {
    setMethod(m);
    const list = m === "email" ? emailChannels : portalChannels;
    setChoice(list.find((c) => !props.alreadySentTo.includes(c.value.toLowerCase()))?.id ?? "custom");
    setAuthorized(false);
    setResult(null);
  };

  const selected = channelsForMethod.find((c) => c.id === choice) ?? null;
  const target = selected ? selected.value : custom.trim();
  const needsConfirmation = !selected || selected.status !== "verified";
  const duplicate = target !== "" && props.alreadySentTo.includes(target.toLowerCase());
  const attachmentBytes = props.evidence.filter((e) => evidenceIds.includes(e.id)).reduce((n, e) => n + e.size, 0);
  const statement =
    method === "email"
      ? emailAuthorizationStatement(connection?.email ?? "your Gmail account", target || "the address above")
      : portalAuthorizationStatement(target || "the website above");

  const runCheck = async (useAI: boolean) => {
    if (!draft) return;
    setChecking(useAI ? "ai" : "basic");
    setCheckError(null);
    const r = await postJson<Check>(`/api/cases/${props.caseId}/submission-check`, { draftId: draft.id, useAI });
    if (r.ok) setCheck(r.data);
    else setCheckError(r.error);
    setChecking(null);
  };

  // Run the basic (non-AI) checks as soon as an approved complaint is shown.
  const approvedDraftId = draft?.approved ? draft.id : null;
  useEffect(() => {
    if (!approvedDraftId) return;
    let cancelled = false;
    void postJson<Check>(`/api/cases/${props.caseId}/submission-check`, { draftId: approvedDraftId, useAI: false }).then((r) => {
      if (cancelled) return;
      if (r.ok) setCheck(r.data);
      else setCheckError(r.error);
      setChecking(null);
    });
    return () => {
      cancelled = true;
    };
  }, [approvedDraftId, props.caseId]);

  if (!draft || !draft.approved) {
    return (
      <Card>
        <CardHeader title="Submit your complaint" description="Send it to your institution from your own email, or submit it on their website with Resolve's help." />
        <CardBody>
          <Alert tone="info" title={draft ? "Approve your complaint first" : "Prepare your complaint first"} action={<Link href={`/cases/${props.caseId}?tab=complaint`} className={buttonClasses({ size: "sm", variant: "secondary" })}>Open complaint builder</Link>}>
            Resolve only submits a complaint you have reviewed and approved.
          </Alert>
        </CardBody>
      </Card>
    );
  }

  const ready = check?.checks.ready ?? false;
  const recipientOk = target !== "" && (!needsConfirmation || customConfirmed) && !duplicate;
  const emailReady = method !== "email" || (connection?.status === "active" && props.emailConfigured && attachmentBytes <= MAX_ATTACHMENTS);
  const canSubmit = ready && recipientOk && emailReady && authorized && !sending;

  const submit = async () => {
    setSending(true);
    setResult(null);
    const payload =
      method === "email"
        ? { method, draftId: draft.id, channelId: selected?.id ?? null, recipient: selected ? null : target, recipientConfirmed: customConfirmed, evidenceIds, idempotencyKey, authorized }
        : { method, draftId: draft.id, channelId: selected?.id ?? null, url: selected ? null : target, urlConfirmed: customConfirmed, idempotencyKey, authorized };
    const r = await postJson<{ submission: { status: string; last_error: string | null; recipient: string } }>(`/api/cases/${props.caseId}/submissions`, payload);
    setSending(false);
    if (!r.ok) {
      setResult({ tone: "error", title: r.code === "duplicate" ? "Already submitted" : "Not submitted", message: r.error, blocking: (r.data?.blocking as string[] | undefined) ?? undefined });
      if (r.code !== "network") setIdempotencyKey(newIdempotencyKey());
      router.refresh();
      return;
    }
    const s = r.data.submission;
    if (s.status === "sent") setResult({ tone: "success", title: "Sent", message: `Gmail confirmed your complaint was sent to ${s.recipient}. It's in your Gmail Sent folder too.` });
    else if (s.status === "unknown") setResult({ tone: "warning", title: "Not confirmed", message: "We couldn't confirm whether the email was sent, so Resolve won't send it again automatically. See the submission below." });
    else if (s.status === "failed") setResult({ tone: "error", title: "Not sent", message: s.last_error ?? "Gmail didn't send the email." });
    else if (s.status === "awaiting_user_confirmation") setResult({ tone: "success", title: "Ready for you to submit", message: "Open the website, submit your complaint, then confirm below with any reference they give you." });
    setAuthorized(false);
    setIdempotencyKey(newIdempotencyKey());
    router.refresh();
  };

  const returnTo = `/cases/${props.caseId}?tab=submit`;
  const connectHref = (replies: boolean) => `/api/integrations/gmail/connect?returnTo=${encodeURIComponent(returnTo)}${replies ? "&replies=1" : ""}`;

  return (
    <Card>
      <CardHeader
        title="Submit your complaint"
        description="You stay in control: Resolve sends nothing without your authorisation and never submits on your behalf without telling you exactly what happened."
      />
      <CardBody>
        <ol className="space-y-8">
          <Step n={1} title="Your approved complaint" done>
            <div className="rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" dot>Approved</Badge>
                <span className="text-xs text-ink-500">Version {draft.version}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-ink-900">{draft.subject}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/complaints/${draft.id}/pdf`} className={buttonClasses({ size: "sm", variant: "secondary" })}>Download PDF</a>
              <Link href={`/cases/${props.caseId}?tab=complaint`} className={buttonClasses({ size: "sm", variant: "ghost" })}>Edit complaint</Link>
            </div>
          </Step>

          <Step n={2} title="How and where to submit it" done={recipientOk}>
            <div role="radiogroup" aria-label="Submission method" className="grid gap-2 sm:grid-cols-2">
              {([
                ["email", "Email from my Gmail", "Resolve sends it from your own Gmail account, so replies come to you."],
                ["guided_portal", "On the institution's website", "Resolve opens the official page and you submit it yourself."],
              ] as const).map(([m, label, hint]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => changeMethod(m)}
                  className={clsx(
                    "rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand-600",
                    method === m ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-ink-200 bg-white hover:border-ink-300",
                  )}
                >
                  <span className="block text-sm font-semibold text-ink-900">{label}</span>
                  <span className="mt-0.5 block text-xs text-ink-600">{hint}</span>
                </button>
              ))}
            </div>
            {method === "email" && !props.emailConfigured ? (
              <Alert tone="warning">Sending by email isn&apos;t set up on this installation yet. You can still submit on the institution&apos;s website, or download the PDF and send it yourself.</Alert>
            ) : null}

            <div className="flex items-center gap-3">
              <BankLogo name={props.institutionName} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{props.bank?.name ?? props.institutionName ?? "Your institution"}</p>
                <p className="text-xs text-ink-500">{props.bank ? "Identified from your report" : "Not in Resolve's bank directory — enter their official contact details below"}</p>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="sr-only">{method === "email" ? "Complaint email address" : "Complaint web page"}</legend>
              {channelsForMethod.map((c) => {
                const used = props.alreadySentTo.includes(c.value.toLowerCase());
                return (
                  <label
                    key={c.id}
                    className={clsx(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                      choice === c.id ? "border-brand-600 bg-brand-50/40" : "border-ink-200 hover:border-ink-300",
                      used && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input type="radio" name="channel" className="mt-1 accent-brand-600" checked={choice === c.id} disabled={used} onChange={() => setChoice(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">{c.label}</span>
                        <ChannelBadge channel={c} />
                        {used ? <Badge tone="muted">Already submitted</Badge> : null}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs break-all text-ink-700">{c.value}</span>
                      <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-xs text-brand-700 hover:underline">
                        Where this comes from ↗
                      </a>
                    </span>
                  </label>
                );
              })}
              <label className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3", choice === "custom" ? "border-brand-600 bg-brand-50/40" : "border-ink-200 hover:border-ink-300")}>
                <input type="radio" name="channel" className="mt-1 accent-brand-600" checked={choice === "custom"} onChange={() => setChoice("custom")} />
                <span className="text-sm font-medium text-ink-900">{method === "email" ? "Use a different email address" : "Use a different web page"}</span>
              </label>
            </fieldset>
            {channelsForMethod.filter((c) => c.status === "verified").length === 0 ? (
              <p className="text-xs leading-relaxed text-ink-600">
                Resolve hasn&apos;t verified {method === "email" ? "a complaints email address" : "a complaints page"} for {props.bank?.name ?? "this institution"} yet. Use the one published on
                their official website, mobile app or account statement — never one from a social media message or a stranger.
              </p>
            ) : null}
            {choice === "custom" ? (
              <Field label={method === "email" ? "Institution's complaints email" : "Institution's complaint page (https://…)"} htmlFor="custom-target">
                <Input
                  id="custom-target"
                  type={method === "email" ? "email" : "url"}
                  inputMode={method === "email" ? "email" : "url"}
                  autoComplete="off"
                  placeholder={method === "email" ? "complaints@yourbank.com" : "https://"}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </Field>
            ) : null}
            {needsConfirmation && target ? (
              <label className="flex items-start gap-2.5 text-sm text-ink-800">
                <Checkbox checked={customConfirmed} onChange={(e) => setCustomConfirmed(e.target.checked)} />
                <span>I got this {method === "email" ? "address" : "page"} from my institution&apos;s official website, app or statement.</span>
              </label>
            ) : null}
            {duplicate ? <Alert tone="info">This complaint version has already been submitted there. See the submission history below.</Alert> : null}
            {otherChannels.length > 0 ? (
              <p className="text-xs text-ink-600">
                Other official contacts:{" "}
                {otherChannels.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 ? ", " : ""}
                    {c.label} <span className="font-mono">{c.value}</span>
                  </span>
                ))}
              </p>
            ) : null}
          </Step>

          <Step n={3} title="Final check" done={ready}>
            {checking === "basic" && !check ? (
              <p className="flex items-center gap-2 text-sm text-ink-600" role="status"><Spinner className="size-4" /> Checking your complaint…</p>
            ) : null}
            {checkError ? <Alert tone="error" action={<Button size="sm" variant="secondary" onClick={() => runCheck(false)}>Try again</Button>}>{checkError}</Alert> : null}
            {check ? (
              <div className="space-y-3">
                {check.checks.blocking.length > 0 ? (
                  <Alert tone="error" title="Fix these before submitting">
                    <ul className="list-disc space-y-1 pl-4">{check.checks.blocking.map((b) => <li key={b}>{b}</li>)}</ul>
                  </Alert>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-success-700"><span aria-hidden="true">✓</span> No problems found. It&apos;s approved, has no placeholders and contains no PINs, OTPs or card numbers.</p>
                )}
                {check.checks.warnings.length > 0 ? (
                  <Alert tone="warning" title="Worth a second look">
                    <ul className="list-disc space-y-1 pl-4">{check.checks.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  </Alert>
                ) : null}
                {check.ai ? (
                  <div className="rounded-xl border border-ink-200 px-4 py-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-ink-900">AI review <Badge tone="warning">AI interpretation</Badge></p>
                    <p className="mt-1 text-ink-700">{check.ai.review.summary}</p>
                    {check.ai.review.issues.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {check.ai.review.issues.map((i) => (
                          <li key={i.problem} className="text-ink-700"><span className="font-medium text-ink-900">{i.problem}</span> {i.suggestion}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-xs text-ink-500">Suggestions only. Edit your complaint if you agree, then approve it again.</p>
                  </div>
                ) : check.ai_unavailable_reason ? (
                  <p className="text-xs text-ink-500">{check.ai_unavailable_reason}</p>
                ) : props.aiAvailable && props.consent ? (
                  <Button size="sm" variant="secondary" onClick={() => runCheck(true)} loading={checking === "ai"} loadingText="Reviewing…">Get an AI review</Button>
                ) : null}
              </div>
            ) : null}
          </Step>

          {method === "email" ? (
            <Step n={4} title="Send from your Gmail" done={emailReady && connection?.status === "active"}>
              {!props.emailConfigured ? null : !connection ? (
                <div className="space-y-3 rounded-xl border border-ink-200 px-4 py-4">
                  <p className="text-sm text-ink-700">
                    Connect the Gmail account you want the complaint to come from. Google will ask you to allow Resolve to <strong>send emails on your behalf</strong>. Resolve only sends what you authorise below.
                  </p>
                  <label className="flex items-start gap-2.5 text-sm text-ink-800">
                    <Checkbox checked={readReplies} onChange={(e) => setReadReplies(e.target.checked)} />
                    <span>Also let Resolve check for your institution&apos;s replies. <span className="text-ink-500">(Read-only. Resolve only opens the email threads it sends.)</span></span>
                  </label>
                  <a href={connectHref(readReplies)} className={buttonClasses({ size: "md" })}>Connect Gmail</a>
                </div>
              ) : connection.status !== "active" ? (
                <Alert tone="warning" title="Reconnect Gmail" action={<a href={connectHref(connection.canReadReplies)} className={buttonClasses({ size: "sm", variant: "secondary" })}>Reconnect</a>}>
                  Your permission for {connection.email} has expired or was removed in your Google account.
                </Alert>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-ink-700">
                    From <span className="font-medium text-ink-900">{connection.email}</span>
                    {connection.canReadReplies ? <Badge tone="info" className="ml-2">Replies checked</Badge> : null}{" "}
                    <a href={connectHref(true)} className="ml-1 text-xs text-brand-700 hover:underline">Use another account</a>
                  </p>
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium text-ink-600">Attachments</legend>
                    <label className="flex items-center gap-2.5 text-sm text-ink-800">
                      <Checkbox checked disabled />
                      <span>Complaint-{props.caseNumber}.pdf <span className="text-ink-500">(your approved complaint)</span></span>
                    </label>
                    {props.evidence.map((e) => (
                      <label key={e.id} className="flex items-center gap-2.5 text-sm text-ink-800">
                        <Checkbox
                          checked={evidenceIds.includes(e.id)}
                          onChange={(ev) => setEvidenceIds((ids) => (ev.target.checked ? [...ids, e.id] : ids.filter((x) => x !== e.id)))}
                        />
                        <span className="min-w-0 truncate">{e.description ? `${e.description} — ` : ""}{e.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-ink-500">{formatBytes(e.size)}</span>
                      </label>
                    ))}
                    {attachmentBytes > MAX_ATTACHMENTS ? <p className="text-sm text-danger-700">These files are too large to email together (15 MB limit). Untick some.</p> : null}
                  </fieldset>
                  <details className="rounded-xl border border-ink-200 px-4 py-3 text-sm">
                    <summary className="cursor-pointer font-medium text-ink-900">Preview the email</summary>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-ink-500">From</dt><dd className="text-ink-800">{connection.email}</dd>
                      <dt className="text-ink-500">To</dt><dd className="break-all text-ink-800">{target || "—"}</dd>
                      <dt className="text-ink-500">Subject</dt><dd className="text-ink-800">{draft.subject}</dd>
                    </dl>
                    <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-ink-50 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-ink-800">{draft.content}</pre>
                  </details>
                </div>
              )}
            </Step>
          ) : (
            <Step n={4} title="Submit it on the website">
              <p className="text-sm text-ink-700">
                Open the page in a new tab and fill in their form, copying from below. If the site asks you to sign in, solve a CAPTCHA or enter a one-time code, do that yourself —
                Resolve never handles your login details or codes.
              </p>
              <div className="flex flex-wrap gap-2">
                {target && /^https:\/\//.test(target) ? (
                  <a href={target} target="_blank" rel="noopener noreferrer" className={buttonClasses({ size: "sm" })}>Open the complaint page ↗</a>
                ) : null}
                <CopyButton text={draft.subject} label="Copy subject" />
                <CopyButton text={draft.content} label="Copy complaint" />
                <CopyButton text={props.customerDetails} label="Copy your details" />
              </div>
            </Step>
          )}

          <Step n={5} title={method === "email" ? "Authorise and send" : "Confirm you'll submit it"}>
            <label className="flex items-start gap-2.5 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3 text-sm text-ink-800">
              <Checkbox checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} disabled={!target} />
              <span>{statement}</span>
            </label>
            {result ? (
              <Alert tone={result.tone} title={result.title}>
                {result.message}
                {result.blocking ? <ul className="mt-1 list-disc pl-4">{result.blocking.map((b) => <li key={b}>{b}</li>)}</ul> : null}
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={submit} disabled={!canSubmit} loading={sending} loadingText={method === "email" ? "Sending…" : "Starting…"}>
                {method === "email" ? "Send complaint" : "Start guided submission"}
              </Button>
              {!canSubmit && !sending ? (
                <span className="text-xs text-ink-500">
                  {!ready ? "Fix the items in step 3 first." : !recipientOk ? "Choose and confirm where to submit it." : !emailReady ? "Connect Gmail first." : "Tick the authorisation box to continue."}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-ink-500">Resolve can&apos;t make your institution refund you. It sends your complaint and helps you track their response.</p>
          </Step>
        </ol>
      </CardBody>
    </Card>
  );
}
