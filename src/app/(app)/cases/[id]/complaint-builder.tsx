"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "@/components/forms/copy-button";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { useFormAction } from "@/components/forms/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FieldError, Input, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { ComplaintDraftRow } from "@/lib/types";
import { approveComplaintAction, saveComplaintAction } from "./actions";

function GenerateButtons({
  caseId,
  aiAvailable,
  consent,
  hasDraft,
}: {
  caseId: string;
  aiAvailable: boolean;
  consent: boolean;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ai" | "template" | null>(null);
  const [error, setError] = useState<{ message: string; mode: "ai" | "template"; retryable: boolean } | null>(null);

  const generate = async (mode: "ai" | "template") => {
    if (hasDraft && !window.confirm("Create a new version? Your current draft will be kept in the version history.")) return;
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/complaint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: body.error ?? "Something went wrong.", mode, retryable: body.retryable !== false });
        return;
      }
      router.refresh();
    } catch {
      setError({ message: "We couldn't reach Resolve. Check your connection and try again.", mode, retryable: true });
    } finally {
      setBusy(null);
    }
  };

  const aiUsable = aiAvailable && consent;
  return (
    <div className="space-y-3">
      {busy === "ai" ? (
        <div className="flex items-center gap-3 rounded-md bg-brand-50 px-4 py-3 text-sm text-ink-800" role="status">
          <Spinner className="size-4 text-brand-600" /> Writing your complaint from your confirmed case details…
        </div>
      ) : null}
      {error ? (
        <Alert
          tone="error"
          title="The draft wasn't created"
          action={error.retryable ? <Button size="sm" variant="secondary" onClick={() => generate(error.mode)}>Try again</Button> : undefined}
        >
          {error.message}
          {error.mode === "ai" ? " You can also start from the template, which doesn't use AI." : null}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {aiUsable ? (
          <Button onClick={() => generate("ai")} loading={busy === "ai"} loadingText="Writing…" disabled={busy !== null} variant={hasDraft ? "secondary" : "primary"}>
            {hasDraft ? "Regenerate with AI" : "Write my complaint with AI"}
          </Button>
        ) : null}
        <Button onClick={() => generate("template")} loading={busy === "template"} loadingText="Creating…" disabled={busy !== null} variant={aiUsable || hasDraft ? "secondary" : "primary"}>
          {hasDraft ? "Rebuild from template" : "Start from template"}
        </Button>
      </div>
      {!aiAvailable ? (
        <p className="text-xs text-ink-500">AI writing isn&apos;t set up for this installation. The template uses only the details you entered.</p>
      ) : !consent ? (
        <p className="text-xs text-ink-500">
          To let AI write your draft, <Link href="/settings#privacy" className="font-medium text-brand-700 hover:underline">turn on AI analysis in Settings</Link>. The template works without AI.
        </p>
      ) : null}
    </div>
  );
}

function DraftEditor({ caseId, draft, warnings }: { caseId: string; draft: ComplaintDraftRow; warnings: string[] }) {
  const save = useFormAction(saveComplaintAction);
  const approve = useFormAction(approveComplaintAction);
  // The parent remounts this component (via `key`) when a new draft version is created.
  const [subject, setSubject] = useState(draft.subject);
  const [content, setContent] = useState(draft.content);

  const dirty = subject !== draft.subject || content !== draft.content;
  const placeholders = Array.from(new Set(Array.from(`${subject}\n${content}`.matchAll(/\[ADD:\s*([^\]]+)\]/gi)).map((m) => m[1].trim())));
  const approved = draft.status === "approved";

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Complaint draft <span className="font-mono text-sm font-normal text-ink-500">v{draft.version}</span>
            {approved ? <Badge tone="success" dot>Approved {formatDate(draft.approved_at)}</Badge> : <Badge tone="warning" dot>Not yet approved</Badge>}
          </span>
        }
        description={`${draft.generated_by === "ai" ? "Written with AI" : "Built from the template"} · last saved ${formatDate(draft.updated_at, { withTime: true })}`}
      />
      <CardBody className="space-y-4">
        {placeholders.length > 0 ? (
          <Alert tone="warning" title="Fill in the missing details">
            Replace each <code className="rounded bg-white px-1">[ADD: …]</code> placeholder with the real information, or remove it:
            <ul className="mt-1 list-disc pl-5">
              {placeholders.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {warnings.length > 0 ? (
          <Alert tone="error" title="Check these details">
            The draft mentions details that don&apos;t appear in your case information: {warnings.join(", ")}. Make sure they
            are correct, or remove them.
          </Alert>
        ) : null}

        <form onSubmit={save.onSubmit} className="space-y-4">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="draftId" value={draft.id} />
          <Field label="Subject (for email)" htmlFor="subject" error={errorsFor(save.state, "subject")}>
            <Input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          </Field>
          <Field label="Complaint letter" htmlFor="content" error={errorsFor(save.state, "content")} hint={`${content.length.toLocaleString()} / 20,000 characters`}>
            <Textarea id="content" name="content" value={content} onChange={(e) => setContent(e.target.value)} rows={22} maxLength={20000} className="font-[family-name:var(--font-sans)] text-[0.9375rem]" />
          </Field>
          <FormMessage state={save.state} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={save.pending} loadingText="Saving…" disabled={!dirty}>Save changes</Button>
            {dirty ? <span className="text-xs text-warning-800">You have unsaved changes</span> : null}
          </div>
        </form>

        <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          <CopyButton text={content} label="Copy letter" />
          <CopyButton text={subject} label="Copy subject" />
          <a href={`/api/complaints/${draft.id}/pdf`} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-disabled={dirty}>
            Download PDF
          </a>
          {dirty ? <span className="self-center text-xs text-ink-500">Save first so the PDF includes your changes.</span> : null}
        </div>

        {!approved ? (
          <form onSubmit={approve.onSubmit} className="space-y-3 rounded-[var(--radius-control)] border border-ink-200 bg-ink-50 p-4">
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="draftId" value={draft.id} />
            <p className="text-sm font-semibold text-ink-900">Approve this complaint</p>
            <label className="flex gap-3 text-sm text-ink-700">
              <Checkbox name="confirmAccurate" />
              <span>I have read this complaint and confirm it is accurate. Resolve will only send it if I separately authorise that.</span>
            </label>
            <FieldError messages={errorsFor(approve.state, "confirmAccurate")} />
            <FormMessage state={approve.state && !approve.state.ok && errorsFor(approve.state, "confirmAccurate") ? null : approve.state} />
            <Button type="submit" loading={approve.pending} disabled={dirty || placeholders.length > 0}>Approve final draft</Button>
            {dirty ? <p className="text-xs text-ink-500">Save your changes before approving.</p> : null}
          </form>
        ) : (
          <Alert
            tone="success"
            title="Approved — ready to submit"
            action={<Link href={`/cases/${caseId}?tab=submit`} className={buttonClasses({ size: "sm" })}>Submit to your bank</Link>}
          >
            Send it from your own Gmail or submit it on your institution&apos;s website with Resolve&apos;s help. If you send it another way (branch, letter or app),{" "}
            <Link href={`/cases/${caseId}?tab=tracking`} className="font-medium text-brand-700 hover:underline">record the submission</Link> so you can track it.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

export function ComplaintBuilder({
  caseId,
  drafts,
  warnings,
  aiAvailable,
  consent,
}: {
  caseId: string;
  drafts: ComplaintDraftRow[];
  warnings: string[];
  aiAvailable: boolean;
  consent: boolean;
}) {
  const current = drafts.find((d) => d.status !== "superseded") ?? null;
  const history = drafts.filter((d) => d.id !== current?.id);
  return (
    <div className="space-y-5">
      {!current ? (
        <Card>
          <CardHeader title="Prepare your complaint" description="Resolve drafts a formal complaint using only the details you've confirmed in your case. You'll review, edit and approve it before using it." />
          <CardBody>
            <GenerateButtons caseId={caseId} aiAvailable={aiAvailable} consent={consent} hasDraft={false} />
          </CardBody>
        </Card>
      ) : (
        <>
          <DraftEditor key={current.id} caseId={caseId} draft={current} warnings={warnings} />
          <Card>
            <CardHeader title="Start again" description="Create a new version from your latest case details. Your current draft stays in the history." />
            <CardBody>
              <GenerateButtons caseId={caseId} aiAvailable={aiAvailable} consent={consent} hasDraft />
            </CardBody>
          </Card>
        </>
      )}
      {history.length > 0 ? (
        <Card>
          <CardHeader title="Version history" />
          <ul className="divide-y divide-ink-100">
            {history.map((d) => (
              <li key={d.id} className="px-5 py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-mono text-ink-500">v{d.version}</span>{" "}
                      <span className="text-ink-800">{d.generated_by === "ai" ? "AI draft" : "Template draft"}</span>{" "}
                      <span className="text-ink-500">· {formatDate(d.created_at, { withTime: true })}</span>
                    </span>
                    <span className="text-xs font-medium text-brand-700 group-open:hidden">Show</span>
                  </summary>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-ink-50 p-3 font-sans text-sm whitespace-pre-wrap text-ink-700">{d.content}</pre>
                  <a href={`/api/complaints/${d.id}/pdf`} className="mt-2 inline-flex text-sm font-medium text-brand-700 hover:underline">Download this version (PDF)</a>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
