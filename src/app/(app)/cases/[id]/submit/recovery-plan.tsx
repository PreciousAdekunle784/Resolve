"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { StoredRecoveryPlan } from "@/lib/orchestrator/schemas";
import type { NextAction } from "@/lib/submissions/next-action";
import { postJson } from "./api";

const TIMING: Record<string, string> = { now: "Now", when_bank_replies: "When they reply", if_no_reply: "If there's no reply" };

export function RecoveryPlanCard({
  caseId,
  next,
  plan,
  planDate,
  guidance,
  aiUsable,
}: {
  caseId: string;
  next: NextAction;
  plan: StoredRecoveryPlan | null;
  planDate: string | null;
  guidance: Record<string, { title: string; url: string; status: string }>;
  aiUsable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/cases/${caseId}/recovery-plan`, {});
    setBusy(false);
    if (!r.ok) setError(r.error);
    router.refresh();
  };

  return (
    <Card className="border-brand-100">
      <CardHeader title="Next required action" />
      <CardBody className="space-y-4">
        <div className="space-y-2">
          <p className="font-medium text-ink-900">{next.title}</p>
          <p className="text-sm text-ink-600">{next.body}</p>
          <Link href={next.href} className={buttonClasses({ size: "sm" })}>{next.cta}</Link>
        </div>

        <div className="space-y-3 border-t border-ink-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-900">Recovery plan</p>
            {plan ? <Badge tone="warning">AI interpretation</Badge> : null}
          </div>
          {plan ? (
            <div className="space-y-3 text-sm">
              <p className="text-ink-800">{plan.situation}</p>
              <ol className="space-y-2">
                {plan.next_actions.map((a) => (
                  <li key={a.title} className="rounded-lg border border-ink-200 px-3 py-2">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink-900">{a.title} <Badge tone="neutral">{TIMING[a.timing] ?? a.timing}</Badge></p>
                    <p className="mt-0.5 text-ink-700">{a.detail}</p>
                  </li>
                ))}
              </ol>
              <div>
                <p className="font-medium text-ink-900">Escalation</p>
                <p className="text-ink-700">{plan.escalation.explanation}</p>
                {plan.escalation.guidance_ids.map((id) =>
                  guidance[id] ? (
                    <a key={id} href={guidance[id].url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-brand-700 hover:underline">
                      {guidance[id].title}
                      {guidance[id].status !== "verified" ? <span className="ml-1 text-xs text-warning-800">(not yet verified)</span> : null}
                    </a>
                  ) : null,
                )}
              </div>
              {plan.evidence_to_gather.length > 0 ? (
                <div>
                  <p className="font-medium text-ink-900">Evidence to gather</p>
                  <ul className="list-disc pl-5 text-ink-700">{plan.evidence_to_gather.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              ) : null}
              {plan.cautions.length > 0 ? <Alert tone="warning">{plan.cautions.join(" ")}</Alert> : null}
              {planDate ? <p className="text-xs text-ink-500">Generated {formatDate(planDate, { withTime: true })}. No one can guarantee your money will be returned.</p> : null}
            </div>
          ) : (
            <p className="text-sm text-ink-600">Get a step-by-step plan based on your complaint, its submissions and any replies.</p>
          )}
          {error ? <Alert tone="error">{error}</Alert> : null}
          {aiUsable ? (
            <Button size="sm" variant="secondary" onClick={generate} loading={busy} loadingText="Planning…">{plan ? "Update the plan" : "Get a recovery plan"}</Button>
          ) : (
            <p className="text-xs text-ink-500">
              AI plans need AI analysis turned on in <Link href="/settings#privacy" className="text-brand-700 hover:underline">Settings</Link>.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
