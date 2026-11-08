"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import type { ActionResult } from "@/lib/types";

/**
 * Wraps a server action for use in a form WITHOUT React's automatic form reset,
 * so the user's input is preserved when validation fails. The clicked submit
 * button's name/value is included (used for "Save and exit" vs "Continue").
 * `successKey` changes after each successful submission — pass it as a form
 * `key` to clear a form once it has been saved.
 */
export function useFormAction<T = undefined>(
  action: (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>,
) {
  const [state, dispatch, pending] = useActionState(action, null);
  const [successKey, setSuccessKey] = useState(0);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    // Adjusting state during render (recommended over an effect).
    setSeenState(state);
    if (state?.ok) setSuccessKey((k) => k + 1);
  }
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  return { state, pending, onSubmit, successKey };
}
