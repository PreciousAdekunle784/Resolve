"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "success"; file: string } | { kind: "error"; message: string };

function filenameFrom(header: string | null): string {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `Resolve-statement-${new Date().toISOString().slice(0, 10)}.pdf`;
}

/** Generates the PDF account statement, then downloads it automatically. */
export function DownloadStatementButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  // Hide the success message after a while.
  useEffect(() => {
    if (state.kind !== "success") return;
    const t = setTimeout(() => setState({ kind: "idle" }), 8000);
    return () => clearTimeout(t);
  }, [state]);

  const download = async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/account/statement", { cache: "no-store" });
      if (!res.ok || !res.headers.get("content-type")?.includes("application/pdf")) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "We couldn't generate your statement. Please try again.");
      }
      const blob = await res.blob();
      const file = filenameFrom(res.headers.get("content-disposition"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ kind: "success", file });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof TypeError ? "We couldn't reach Resolve. Check your connection and try again." : e instanceof Error ? e.message : "Something went wrong.",
      });
    }
  };

  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        onClick={() => void download()}
        loading={state.kind === "loading"}
        loadingText="Preparing your statement…"
        icon={
          <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        }
      >
        Download PDF Statement
      </Button>
      <div aria-live="polite">
        {state.kind === "success" ? (
          <Alert tone="success" title="Statement downloaded">
            {state.file} has been saved to your device.
          </Alert>
        ) : null}
        {state.kind === "error" ? (
          <Alert tone="error" title="Download failed" action={<Button size="sm" variant="secondary" onClick={() => void download()}>Try again</Button>}>
            {state.message}
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
