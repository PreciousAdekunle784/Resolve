"use client";

import { useState } from "react";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { deleteCaseAction } from "../actions";

export function DeleteCase({ caseId, caseNumber }: { caseId: string; caseNumber: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(deleteCaseAction);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-danger-700 hover:bg-danger-50 hover:text-danger-700" onClick={() => setOpen(true)}>
        Delete case
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-[var(--radius-card)] border border-danger-100 bg-danger-50 p-4" noValidate>
      <input type="hidden" name="caseId" value={caseId} />
      <p className="text-sm font-semibold text-ink-900">Permanently delete case {caseNumber}?</p>
      <p className="text-sm text-ink-700">
        This deletes the case, its timeline, analyses, complaint drafts and all uploaded evidence files. It can&apos;t be undone.
      </p>
      <FormMessage state={state && !state.ok && errorsFor(state, "confirm") ? null : state} />
      <Field label="Type DELETE to confirm" htmlFor="confirm-delete" error={errorsFor(state, "confirm")}>
        <Input id="confirm-delete" name="confirm" autoComplete="off" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" loading={pending} loadingText="Deleting…">Delete permanently</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
