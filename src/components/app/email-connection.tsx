"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { formatDate } from "@/lib/format";

export interface EmailConnectionSummary {
  email: string;
  canReadReplies: boolean;
  status: "active" | "reauthorization_required";
  connectedAt: string;
  lastUsedAt: string | null;
}

/** Connect / reconnect / disconnect the Gmail account complaints are sent from. */
export function EmailConnectionPanel({ connection, configured }: { connection: EmailConnectionSummary | null; configured: boolean }) {
  const router = useRouter();
  const [readReplies, setReadReplies] = useState(connection?.canReadReplies ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const connectHref = `/api/integrations/gmail/connect?returnTo=${encodeURIComponent("/settings#email")}${readReplies ? "&replies=1" : ""}`;

  if (!configured) {
    return <Alert tone="info">Sending complaints by email isn&apos;t set up on this installation yet. You can still download your complaint as a PDF or submit it on your institution&apos;s website.</Alert>;
  }

  const disconnect = async () => {
    if (!window.confirm("Disconnect Gmail? Resolve will lose permission to send emails or check replies. Emails already sent stay in your Gmail.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/gmail/disconnect", { method: "POST" });
      setMessage(res.ok ? { tone: "success", text: "Gmail disconnected and Resolve's access revoked." } : { tone: "error", text: "Could not disconnect Gmail. Please try again." });
    } catch {
      setMessage({ tone: "error", text: "We couldn't reach Resolve. Please try again." });
    }
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {connection ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
              {connection.email}
              {connection.status === "active" ? <Badge tone="success" dot>Connected</Badge> : <Badge tone="warning" dot>Needs reconnecting</Badge>}
            </p>
            <p className="text-xs text-ink-600">
              Can send complaints you authorise{connection.canReadReplies ? " · checks replies in those email threads" : ""} · connected {formatDate(connection.connectedAt)}
              {connection.lastUsedAt ? ` · last used ${formatDate(connection.lastUsedAt)}` : ""}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={disconnect} loading={busy}>Disconnect</Button>
        </div>
      ) : (
        <p className="text-sm text-ink-700">Connect Gmail to send complaints to your institution from your own email address, so their replies come straight to you.</p>
      )}
      <label className="flex items-start gap-2.5 text-sm text-ink-800">
        <Checkbox checked={readReplies} onChange={(e) => setReadReplies(e.target.checked)} />
        <span>Let Resolve check for replies to the complaints it sends (read-only; Resolve only opens those email threads).</span>
      </label>
      <a href={connectHref} className={buttonClasses({ size: "sm", variant: connection ? "secondary" : "primary" })}>
        {connection ? "Reconnect or change account" : "Connect Gmail"}
      </a>
      <p className="text-xs leading-relaxed text-ink-500">
        Resolve never sees your Google password. It sends an email only after you authorise that specific complaint, and stores Google&apos;s access token encrypted. You can also
        remove access any time from your Google Account&apos;s security settings.
      </p>
    </div>
  );
}
