"use client";

import { useState } from "react";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldError, Input, Select, Textarea } from "@/components/ui/field";
import { BANK_CHOICES } from "@/lib/banks";
import type { BankChannelRow } from "@/lib/types";
import { saveBankChannelAction } from "./actions";

export function ChannelForm({ ch }: { ch?: BankChannelRow }) {
  const form = useFormAction(saveBankChannelAction);
  // Re-mount the fields after a successful "add" so every input (and its state) resets.
  return <ChannelFields key={ch ? ch.id : form.successKey} ch={ch} form={form} />;
}

function ChannelFields({ ch, form }: { ch?: BankChannelRow; form: ReturnType<typeof useFormAction> }) {
  const { state, pending, onSubmit } = form;
  const [status, setStatus] = useState<string>(ch?.status ?? "unverified");
  const [type, setType] = useState<string>(ch?.channel_type ?? "email");
  const err = (f: string) => errorsFor(state, f);
  const k = ch?.id ?? "new";
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={ch?.id ?? ""} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bank or provider" htmlFor={`bank-${k}`} error={err("bank_id")}>
          <Select id={`bank-${k}`} name="bank_id" defaultValue={ch?.bank_id ?? ""}>
            <option value="">Choose…</option>
            {BANK_CHOICES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Channel type" htmlFor={`type-${k}`} error={err("channel_type")}>
          <Select id={`type-${k}`} name="channel_type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="email">Email</option>
            <option value="web_portal">Complaint web page</option>
            <option value="phone">Phone</option>
          </Select>
        </Field>
        <Field label={type === "email" ? "Email address" : type === "web_portal" ? "Page link (https://…)" : "Phone number"} htmlFor={`value-${k}`} error={err("value")} className="sm:col-span-2">
          <Input id={`value-${k}`} name="value" className="font-mono" defaultValue={ch?.value} />
        </Field>
        <Field label="Label" htmlFor={`label-${k}`} error={err("label")}>
          <Input id={`label-${k}`} name="label" defaultValue={ch?.label ?? "Customer complaints"} />
        </Field>
        <Field label="Purpose" htmlFor={`purpose-${k}`} error={err("purpose")}>
          <Select id={`purpose-${k}`} name="purpose" defaultValue={ch?.purpose ?? "complaints"}>
            <option value="complaints">Complaints</option>
            <option value="customer_care">Customer care</option>
            <option value="escalation">Escalation</option>
          </Select>
        </Field>
        <Field label="Official page where this is published" htmlFor={`src-${k}`} error={err("source_url")} className="sm:col-span-2" hint="The bank's own website page. Users can open it to check.">
          <Input id={`src-${k}`} name="source_url" type="url" defaultValue={ch?.source_url} />
        </Field>
        <Field label="Status" htmlFor={`status-${k}`} error={err("status")}>
          <Select id={`status-${k}`} name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="unverified">unverified</option>
            <option value="verified">verified</option>
            <option value="outdated">outdated</option>
            <option value="archived">archived</option>
          </Select>
        </Field>
        <Field label="Notes" htmlFor={`notes-${k}`} optional error={err("notes")} className="sm:col-span-2">
          <Textarea id={`notes-${k}`} name="notes" rows={2} defaultValue={ch?.notes ?? ""} />
        </Field>
      </div>
      {status === "verified" ? (
        <div>
          <label className="flex items-start gap-2.5 text-sm text-ink-800">
            <Checkbox name="confirm_verified" />
            <span>I checked this contact on the bank&apos;s official page today.</span>
          </label>
          <FieldError messages={err("confirm_verified")} />
        </div>
      ) : null}
      <Button type="submit" loading={pending}>{ch ? "Save changes" : "Add contact channel"}</Button>
    </form>
  );
}
