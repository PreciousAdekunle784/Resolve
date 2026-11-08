"use client";

import { useState } from "react";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  CASE_STATUS_INFO,
  CASE_STATUSES,
  SUBMISSION_CHANNEL_LABELS,
  SUBMISSION_CHANNELS,
  type CaseStatus,
} from "@/lib/constants";
import type { ActionResult, CaseRow } from "@/lib/types";
import {
  addNoteAction,
  recordResolutionAction,
  recordResponseAction,
  recordSubmissionAction,
  setFollowUpAction,
  updateStatusAction,
} from "./actions";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

function Panel({ title, description, children, defaultOpen = false }: { title: string; description: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-[var(--radius-card)] border border-ink-200 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold text-ink-900">{title}</span>
          <span className="block text-sm text-ink-600">{description}</span>
        </span>
        <svg className="size-5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="border-t border-ink-100 px-5 py-4">{children}</div>
    </details>
  );
}

function useAction(action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>) {
  return useFormAction(action);
}

export function SubmissionForm({ c }: { c: CaseRow }) {
  const { state, pending, onSubmit } = useAction(recordSubmissionAction);
  const err = (f: string) => errorsFor(state, f);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date you submitted it" htmlFor="institution_submission_date" error={err("institution_submission_date")}>
          <Input id="institution_submission_date" name="institution_submission_date" type="date" max={today()} defaultValue={c.institution_submission_date ?? today()} />
        </Field>
        <Field label="How you submitted it" htmlFor="institution_submission_channel" error={err("institution_submission_channel")}>
          <Select id="institution_submission_channel" name="institution_submission_channel" defaultValue={c.institution_submission_channel ?? ""}>
            <option value="">Choose…</option>
            {SUBMISSION_CHANNELS.map((s) => (
              <option key={s} value={s}>{SUBMISSION_CHANNEL_LABELS[s]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Complaint reference from your institution" htmlFor="institution_reference" optional error={err("institution_reference")} className="sm:col-span-2" hint="Ask for one if you weren't given it — it makes follow-ups much easier.">
          <Input id="institution_reference" name="institution_reference" className="font-mono" defaultValue={c.institution_reference ?? ""} />
        </Field>
      </div>
      <Button type="submit" loading={pending}>Save submission details</Button>
    </form>
  );
}

export function ResponseForm({ c }: { c: CaseRow }) {
  const { state, pending, onSubmit, successKey } = useAction(recordResponseAction);
  const err = (f: string) => errorsFor(state, f);
  return (
    <form key={successKey} onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of the response" htmlFor="response_date" error={err("response_date")}>
          <Input id="response_date" name="response_date" type="date" max={today()} defaultValue={today()} />
        </Field>
        <Field label="Update status (optional)" htmlFor="new_status">
          <Select id="new_status" name="new_status" defaultValue="">
            <option value="">Keep “{CASE_STATUS_INFO[c.status].label}”</option>
            {(["awaiting_institution_response", "additional_information_required", "ready_for_escalation"] as CaseStatus[]).map((s) => (
              <option key={s} value={s}>{CASE_STATUS_INFO[s].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="What did they say?" htmlFor="response_summary" error={err("response_summary")} className="sm:col-span-2" hint="Summarise their reply. If they resolved it, use “Record the outcome” instead.">
          <Textarea id="response_summary" name="response_summary" rows={3} maxLength={2000} />
        </Field>
      </div>
      <Button type="submit" loading={pending}>Save response</Button>
    </form>
  );
}

export function StatusForm({ c }: { c: CaseRow }) {
  const { state, pending, onSubmit } = useAction(updateStatusAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New status" htmlFor="status" error={errorsFor(state, "status")}>
          <Select id="status" name="status" defaultValue={c.status}>
            {CASE_STATUSES.filter((s) => s !== "resolved" && s !== "closed").map((s) => (
              <option key={s} value={s}>{CASE_STATUS_INFO[s].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="status-note" optional error={errorsFor(state, "note")}>
          <Input id="status-note" name="note" maxLength={1000} />
        </Field>
      </div>
      <p className="text-xs text-ink-500">Resolve never changes your status automatically — for example, it won&apos;t mark a case resolved because time has passed.</p>
      <Button type="submit" loading={pending}>Update status</Button>
    </form>
  );
}

export function FollowUpForm({ c }: { c: CaseRow }) {
  const { state, pending, onSubmit } = useAction(setFollowUpAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Follow up on" htmlFor="next_follow_up_date" error={errorsFor(state, "next_follow_up_date")} hint="Leave empty to clear it.">
          <Input id="next_follow_up_date" name="next_follow_up_date" type="date" min={today()} defaultValue={c.next_follow_up_date ?? ""} />
        </Field>
        <Field label="Reminder note" htmlFor="follow-note" optional error={errorsFor(state, "note")}>
          <Input id="follow-note" name="note" maxLength={500} placeholder="e.g. Call customer care if no reply" />
        </Field>
      </div>
      <p className="text-xs text-ink-500">Due follow-ups appear on your dashboard. Email reminders aren&apos;t available yet.</p>
      <Button type="submit" loading={pending}>Save follow-up date</Button>
    </form>
  );
}

export function ResolutionForm({ c }: { c: CaseRow }) {
  const { state, pending, onSubmit } = useAction(recordResolutionAction);
  const [outcome, setOutcome] = useState<"resolved" | "closed">("resolved");
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <FormMessage state={state} />
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Outcome</legend>
        <label className="flex items-center gap-2"><input type="radio" name="outcome" value="resolved" checked={outcome === "resolved"} onChange={() => setOutcome("resolved")} className="accent-brand-600" /> Resolved</label>
        <label className="flex items-center gap-2"><input type="radio" name="outcome" value="closed" checked={outcome === "closed"} onChange={() => setOutcome("closed")} className="accent-brand-600" /> Closed without resolution</label>
      </fieldset>
      <Field label={outcome === "resolved" ? "How was it resolved?" : "Why are you closing it?"} htmlFor="resolution_details" error={errorsFor(state, "resolution_details")}>
        <Textarea id="resolution_details" name="resolution_details" rows={3} maxLength={3000} defaultValue={c.resolution_details ?? ""} placeholder={outcome === "resolved" ? "e.g. Bank reversed the debit on 12 May" : "e.g. Decided not to pursue"} />
      </Field>
      <Button type="submit" loading={pending}>{outcome === "resolved" ? "Mark as resolved" : "Close case"}</Button>
    </form>
  );
}

export function NoteForm({ caseId }: { caseId: string }) {
  const { state, pending, onSubmit, successKey } = useAction(addNoteAction);
  return (
    <form key={successKey} onSubmit={onSubmit} className="space-y-3" noValidate>
      <input type="hidden" name="caseId" value={caseId} />
      <FormMessage state={state} />
      <Field label="Note" htmlFor="note" error={errorsFor(state, "note")}>
        <Textarea id="note" name="note" rows={2} maxLength={1000} placeholder="e.g. Called customer care, spoke to an agent who promised a call back" />
      </Field>
      <Button type="submit" size="sm" loading={pending}>Add note</Button>
    </form>
  );
}

export function TrackingPanels({ c }: { c: CaseRow }) {
  const closed = c.status === "resolved" || c.status === "closed";
  return (
    <div className="space-y-3">
      <Panel title="Record your submission" description="When and how you sent your complaint, and the reference they gave you." defaultOpen={c.status === "draft"}>
        <SubmissionForm c={c} />
      </Panel>
      <Panel title="Record a response from your institution" description="Log replies, requests for information or outcomes they've told you about.">
        <ResponseForm c={c} />
      </Panel>
      <Panel title="Plan a follow-up" description="Set a date to chase up your complaint.">
        <FollowUpForm c={c} />
      </Panel>
      <Panel title="Change status" description="For example, mark that you've escalated the complaint.">
        <StatusForm c={c} />
      </Panel>
      <Panel title={closed ? "Update the outcome" : "Record the outcome"} description="Mark the case resolved or closed and note what happened.">
        <ResolutionForm c={c} />
      </Panel>
      <Panel title="Add a note" description="Anything else worth remembering, such as phone calls.">
        <NoteForm caseId={c.id} />
      </Panel>
    </div>
  );
}
