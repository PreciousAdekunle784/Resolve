"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/types";
import { useFormAction } from "./use-form-action";

/** A one-button form that runs a server action with hidden fields and shows its result. */
export function InlineAction({
  action,
  fields,
  label,
  pendingLabel,
  variant = "secondary",
  size = "sm",
  confirm,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  label: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  confirm?: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  return (
    <form
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} size={size} loading={pending} loadingText={pendingLabel}>
        {label}
      </Button>
      {state && !state.ok ? <span className="text-xs font-medium text-danger-700" role="alert">{state.error}</span> : null}
      {state && state.ok && state.message ? <span className="text-xs text-success-700" role="status">{state.message}</span> : null}
    </form>
  );
}
