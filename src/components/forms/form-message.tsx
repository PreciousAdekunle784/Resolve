import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/types";

/** Shows the top-level success or error message from a server action. */
export function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok) return state.message ? <Alert tone="success">{state.message}</Alert> : null;
  return <Alert tone="error">{state.error}</Alert>;
}

export function errorsFor(state: ActionResult<unknown> | null, field: string): string[] | undefined {
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[field];
}
