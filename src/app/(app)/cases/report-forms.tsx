"use client";

import Link from "next/link";
import { useState } from "react";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { BankPicker } from "@/components/forms/bank-picker";
import { useFormAction } from "@/components/forms/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FieldError, Input, Select, Textarea } from "@/components/ui/field";
import {
  CURRENCIES,
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_INFO,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNELS,
  SENSITIVE_DATA_WARNING,
  type IssueCategory,
} from "@/lib/constants";
import { toLagosDateTimeLocal } from "@/lib/format";
import type { CaseRow } from "@/lib/types";
import { createCaseAction, saveCaseStepAction, submitReportAction } from "./actions";

function StepButtons({ pending, editMode, backHref }: { pending: boolean; editMode: boolean; backHref?: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
      {backHref ? (
        <ButtonLink href={backHref} variant="ghost">
          {editMode ? "Cancel" : "Back"}
        </ButtonLink>
      ) : (
        <span />
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        {!editMode ? (
          <Button type="submit" name="intent" value="exit" variant="secondary" disabled={pending}>
            Save and finish later
          </Button>
        ) : null}
        <Button type="submit" name="intent" value="continue" loading={pending} loadingText="Saving…">
          {editMode ? "Save changes" : "Save and continue"}
        </Button>
      </div>
    </div>
  );
}

export function CategoryStepForm({ caseId, current }: { caseId?: string; current?: IssueCategory | null }) {
  const { state, pending, onSubmit } = useFormAction(caseId ? saveCaseStepAction : createCaseAction);
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {caseId ? (
        <>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="step" value="1" />
        </>
      ) : null}
      <FormMessage state={state} />
      <fieldset className="space-y-3">
        <legend className="sr-only">Type of problem</legend>
        {ISSUE_CATEGORIES.map((c) => (
          <label
            key={c}
            className="flex cursor-pointer gap-4 rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 transition-colors has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-brand-600 hover:border-ink-300"
          >
            <input type="radio" name="issue_category" value={c} defaultChecked={current === c} className="mt-1 accent-brand-600" required />
            <span className="space-y-0.5">
              <span className="block font-medium text-ink-950">{ISSUE_CATEGORY_INFO[c].label}</span>
              <span className="block text-sm leading-relaxed text-ink-600">{ISSUE_CATEGORY_INFO[c].description}</span>
            </span>
          </label>
        ))}
        <FieldError messages={errorsFor(state, "issue_category")} />
      </fieldset>
      <p className="text-xs text-ink-500">
        Not sure which one fits? Pick the closest — Resolve&apos;s analysis will point out if another category seems more likely.
      </p>
      <div className="flex justify-end gap-3 border-t border-ink-100 pt-5">
        {caseId ? (
          <Button type="submit" name="intent" value="exit" variant="secondary" disabled={pending}>
            Save and finish later
          </Button>
        ) : null}
        <Button type="submit" name="intent" value="continue" loading={pending} loadingText="Saving…">
          Continue
        </Button>
      </div>
    </form>
  );
}

export function DetailsStepForm({ c, editMode }: { c: CaseRow; editMode: boolean }) {
  const { state, pending, onSubmit } = useFormAction(saveCaseStepAction);
  const err = (f: string) => errorsFor(state, f);
  const isTransfer = c.issue_category === "failed_or_pending_transfer" || c.issue_category === "erroneous_transfer";
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <input type="hidden" name="step" value="2" />
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Bank or payment provider"
          htmlFor="institution_name"
          hint="The institution that holds the account the money left from."
          error={err("institution_name")}
          className="sm:col-span-2"
        >
          <BankPicker
            id="institution_name"
            name="institution_name"
            defaultValue={c.institution_name ?? ""}
            invalid={!!err("institution_name")}
            describedBy="institution_name-hint"
          />
        </Field>
        <Field label="Amount" htmlFor="amount" error={err("amount")}>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={c.amount === null ? "" : String(c.amount)}
            placeholder="e.g. 25000"
            className="tabular"
            invalid={!!err("amount")}
          />
        </Field>
        <Field label="Currency" htmlFor="currency" error={err("currency")}>
          <Select id="currency" name="currency" defaultValue={c.currency || "NGN"}>
            {CURRENCIES.map((cur) => (
              <option key={cur} value={cur}>{cur}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Date and time of the transaction"
          htmlFor="transaction_date"
          hint="Nigerian time (WAT). Use the time shown on your debit alert or receipt if you have it."
          error={err("transaction_date")}
        >
          <Input
            id="transaction_date"
            name="transaction_date"
            type="datetime-local"
            defaultValue={toLagosDateTimeLocal(c.transaction_date)}
            max={toLagosDateTimeLocal(new Date().toISOString())}
            invalid={!!err("transaction_date")}
          />
        </Field>
        <Field label="How did you pay?" htmlFor="payment_channel" error={err("payment_channel")}>
          <Select id="payment_channel" name="payment_channel" defaultValue={c.payment_channel ?? ""} invalid={!!err("payment_channel")}>
            <option value="">Choose a channel</option>
            {PAYMENT_CHANNELS.map((p) => (
              <option key={p} value={p}>{PAYMENT_CHANNEL_LABELS[p]}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Transaction reference"
          htmlFor="transaction_reference"
          optional
          hint="Also called session ID or transaction ID. Copy it exactly from your receipt or alert. Leave blank if you don't have it."
          error={err("transaction_reference")}
          className="sm:col-span-2"
        >
          <Input
            id="transaction_reference"
            name="transaction_reference"
            defaultValue={c.transaction_reference ?? ""}
            className="font-mono"
            autoComplete="off"
            invalid={!!err("transaction_reference")}
          />
        </Field>
        <Field
          label={isTransfer ? "Recipient details" : "Merchant or payee (if known)"}
          htmlFor="recipient_details"
          optional
          hint={isTransfer ? "Recipient name, bank and account number (NUBAN), as you entered them." : "The name shown on the debit, if any."}
          error={err("recipient_details")}
          className="sm:col-span-2"
        >
          <Input id="recipient_details" name="recipient_details" defaultValue={c.recipient_details ?? ""} invalid={!!err("recipient_details")} />
        </Field>
      </div>
      <StepButtons pending={pending} editMode={editMode} backHref={editMode ? `/cases/${c.id}` : `/cases/${c.id}/report?step=1`} />
    </form>
  );
}

export function DescriptionStepForm({ c, editMode }: { c: CaseRow; editMode: boolean }) {
  const { state, pending, onSubmit } = useFormAction(saveCaseStepAction);
  const [length, setLength] = useState((c.incident_description ?? "").length);
  const err = (f: string) => errorsFor(state, f);
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <input type="hidden" name="caseId" value={c.id} />
      <input type="hidden" name="step" value="3" />
      <FormMessage state={state} />
      <Alert tone="warning">{SENSITIVE_DATA_WARNING}</Alert>
      <Field
        label="What happened?"
        htmlFor="incident_description"
        hint={`In your own words: what you were trying to do, what went wrong, and what you have noticed since. ${length}/5000`}
        error={err("incident_description")}
      >
        <Textarea
          id="incident_description"
          name="incident_description"
          rows={7}
          maxLength={5000}
          defaultValue={c.incident_description ?? ""}
          onChange={(e) => setLength(e.target.value.length)}
          placeholder="For example: On Tuesday I transferred money from my mobile app to my supplier. My account was debited, but my supplier says the money has not arrived…"
          invalid={!!err("incident_description")}
        />
      </Field>
      <Field
        label="What have you already tried?"
        htmlFor="previous_attempts"
        optional
        hint="For example: called customer care on 3 March, visited a branch, sent an email. Include any reference numbers they gave you."
        error={err("previous_attempts")}
      >
        <Textarea id="previous_attempts" name="previous_attempts" rows={4} maxLength={3000} defaultValue={c.previous_attempts ?? ""} invalid={!!err("previous_attempts")} />
      </Field>
      <Field
        label="What outcome are you asking for?"
        htmlFor="requested_resolution"
        optional
        hint="For example: a refund of the debited amount, reversal of the duplicate charge, or confirmation of where the money is."
        error={err("requested_resolution")}
      >
        <Textarea id="requested_resolution" name="requested_resolution" rows={3} maxLength={1000} defaultValue={c.requested_resolution ?? ""} invalid={!!err("requested_resolution")} />
      </Field>
      <StepButtons pending={pending} editMode={editMode} backHref={editMode ? `/cases/${c.id}` : `/cases/${c.id}/report?step=2`} />
    </form>
  );
}

export function SubmitReportForm({ caseId, canSubmit }: { caseId: string; canSubmit: boolean }) {
  const { state, pending, onSubmit } = useFormAction(submitReportAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="caseId" value={caseId} />
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <ButtonLink href={`/cases/${caseId}/report?step=4`} variant="ghost">Back</ButtonLink>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard?saved=1" className="inline-flex h-10 items-center justify-center rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 hover:bg-ink-50">
            Save and finish later
          </Link>
          <Button type="submit" loading={pending} loadingText="Submitting…" disabled={!canSubmit}>
            Confirm and create case
          </Button>
        </div>
      </div>
    </form>
  );
}
