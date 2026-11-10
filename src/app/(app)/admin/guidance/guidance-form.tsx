"use client";

import { useState } from "react";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldError, Input, Select, Textarea } from "@/components/ui/field";
import { GUIDANCE_STATUSES, ISSUE_CATEGORIES, ISSUE_CATEGORY_INFO } from "@/lib/constants";
import type { GuidanceRow } from "@/lib/types";
import { saveGuidanceAction } from "./actions";

export function GuidanceForm({ g }: { g?: GuidanceRow }) {
  const form = useFormAction(saveGuidanceAction);
  // Re-mount the fields after a successful "add" so every input (and its state) resets.
  return <GuidanceFields key={g ? g.id : form.successKey} g={g} form={form} />;
}

function GuidanceFields({ g, form }: { g?: GuidanceRow; form: ReturnType<typeof useFormAction> }) {
  const { state, pending, onSubmit } = form;
  const [status, setStatus] = useState<string>(g?.status ?? "unverified");
  const err = (f: string) => errorsFor(state, f);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={g?.id ?? ""} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor={`title-${g?.id ?? "new"}`} error={err("title")} className="sm:col-span-2">
          <Input id={`title-${g?.id ?? "new"}`} name="title" defaultValue={g?.title} />
        </Field>
        <Field label="Institution or regulator" htmlFor={`inst-${g?.id ?? "new"}`} error={err("institution")}>
          <Input id={`inst-${g?.id ?? "new"}`} name="institution" defaultValue={g?.institution ?? "Central Bank of Nigeria"} />
        </Field>
        <Field label="Country code" htmlFor={`country-${g?.id ?? "new"}`} error={err("country")}>
          <Input id={`country-${g?.id ?? "new"}`} name="country" maxLength={2} defaultValue={g?.country ?? "NG"} />
        </Field>
        <Field label="Issue category" htmlFor={`cat-${g?.id ?? "new"}`} error={err("issue_category")}>
          <Select id={`cat-${g?.id ?? "new"}`} name="issue_category" defaultValue={g?.issue_category ?? ""}>
            <option value="">All problem types</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{ISSUE_CATEGORY_INFO[c].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor={`status-${g?.id ?? "new"}`} error={err("status")}>
          <Select id={`status-${g?.id ?? "new"}`} name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {GUIDANCE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Official source URL" htmlFor={`url-${g?.id ?? "new"}`} error={err("source_url")} className="sm:col-span-2">
          <Input id={`url-${g?.id ?? "new"}`} name="source_url" type="url" defaultValue={g?.source_url} />
        </Field>
        <Field label="Publication date" htmlFor={`pub-${g?.id ?? "new"}`} optional error={err("publication_date")}>
          <Input id={`pub-${g?.id ?? "new"}`} name="publication_date" type="date" defaultValue={g?.publication_date ?? ""} />
        </Field>
        <Field label="Effective from" htmlFor={`from-${g?.id ?? "new"}`} optional error={err("effective_from")}>
          <Input id={`from-${g?.id ?? "new"}`} name="effective_from" type="date" defaultValue={g?.effective_from ?? ""} />
        </Field>
        <Field label="Effective until" htmlFor={`until-${g?.id ?? "new"}`} optional error={err("effective_until")}>
          <Input id={`until-${g?.id ?? "new"}`} name="effective_until" type="date" defaultValue={g?.effective_until ?? ""} />
        </Field>
        <Field
          label="Guidance content"
          htmlFor={`content-${g?.id ?? "new"}`}
          error={err("content")}
          className="sm:col-span-2"
          hint="Summarise only what the official source actually says. Don't add requirements or deadlines it doesn't state. The AI uses this text."
        >
          <Textarea id={`content-${g?.id ?? "new"}`} name="content" rows={6} defaultValue={g?.content} />
        </Field>
      </div>
      {status === "verified" ? (
        <div className="space-y-1">
          <label className="flex gap-3 text-sm text-ink-700">
            <Checkbox name="confirm_verified" />
            <span>I checked this summary against the official source today. Saving sets the verification date to now.</span>
          </label>
          <FieldError messages={err("confirm_verified")} />
        </div>
      ) : null}
      <Button type="submit" loading={pending}>{g ? "Save changes" : "Add guidance"}</Button>
    </form>
  );
}
