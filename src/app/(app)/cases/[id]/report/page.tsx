import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EvidenceManager } from "@/components/app/evidence-manager";
import { getSupabasePublishableKey } from "@/lib/env";
import { WizardProgress } from "@/components/app/wizard-progress";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { getCaseOrNotFound } from "@/lib/cases";
import { ISSUE_CATEGORY_INFO, PAYMENT_CHANNEL_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CaseRow, EvidenceRow } from "@/lib/types";
import { caseCompleteSchema } from "@/lib/validation";
import { CategoryStepForm, DescriptionStepForm, DetailsStepForm, SubmitReportForm } from "../../report-forms";

export const metadata: Metadata = { title: "Report a problem" };

const STEP_COPY: Record<number, { title: string; description: string }> = {
  1: { title: "What kind of problem are you facing?", description: "Choose the option that best matches what happened." },
  2: { title: "Tell us about the transaction", description: "Use the details from your debit alert, receipt or statement where you can. Leave anything you don't know blank." },
  3: { title: "What happened?", description: "Describe the problem in your own words. Clear, specific details make a stronger complaint." },
  4: { title: "Add supporting evidence", description: "Optional, but helpful. Upload receipts, alerts, statements or screenshots. You can add more later." },
  5: { title: "Review your report", description: "Check everything is correct. You can edit any section before creating your case." },
};

export default async function ReportPage({ params, searchParams }: PageProps<"/cases/[id]/report">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user } = await requireOnboardedUser(`/cases/${id}/report`);
  const supabase = await createClient();
  const c = await getCaseOrNotFound(supabase, user.id, id);
  const editMode = c.intake_status === "complete";

  const requested = Number(sp.step);
  let step = Number.isInteger(requested) && requested >= 1 && requested <= 5 ? requested : c.intake_step;
  if (editMode && step !== 2 && step !== 3) redirect(`/cases/${id}`);
  // The evidence step has nothing required, so reaching it unlocks the review step.
  const maxStep = c.intake_step >= 4 ? 5 : c.intake_step;
  if (!editMode && step > maxStep) step = maxStep;

  let evidence: EvidenceRow[] = [];
  if (step === 4 || step === 5) {
    const { data, error } = await supabase.from("evidence").select("*").eq("case_id", id).order("created_at");
    if (error) throw new Error("Could not load evidence.");
    evidence = (data ?? []) as EvidenceRow[];
  }

  const copy = STEP_COPY[step];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={
          <span>
            {editMode ? "Edit case" : "Report"} · <span className="font-mono normal-case">{c.case_number}</span>
          </span>
        }
        title={editMode ? (step === 2 ? "Edit transaction details" : "Edit what happened") : copy.title}
        description={editMode ? "Changes are recorded in your case timeline." : copy.description}
      />
      {!editMode ? <WizardProgress current={step} maxReached={maxStep} caseId={c.id} /> : null}
      {sp.saved ? <Alert tone="success">Your progress is saved.</Alert> : null}

      {step === 5 ? (
        <ReviewStep c={c} evidence={evidence} />
      ) : (
        <Card>
          <CardBody className="p-5 sm:p-6">
            {step === 1 ? <CategoryStepForm caseId={c.id} current={c.issue_category} /> : null}
            {step === 2 ? <DetailsStepForm c={c} editMode={editMode} /> : null}
            {step === 3 ? <DescriptionStepForm c={c} editMode={editMode} /> : null}
            {step === 4 ? (
              <div className="space-y-6">
                <EvidenceManager caseId={c.id} initialEvidence={evidence} supabaseKey={getSupabasePublishableKey()} />
                <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:justify-between">
                  <ButtonLink href={`/cases/${c.id}/report?step=3`} variant="ghost">Back</ButtonLink>
                  <ButtonLink href={`/cases/${c.id}/report?step=5`}>
                    {evidence.length === 0 ? "Skip for now and review" : "Continue to review"}
                  </ButtonLink>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

async function ReviewStep({ c, evidence }: { c: CaseRow; evidence: EvidenceRow[] }) {
  const check = caseCompleteSchema.safeParse({ ...c, amount: c.amount === null ? undefined : Number(c.amount) });
  const missing = check.success ? [] : Array.from(new Set(check.error.issues.map((i) => i.message)));
  const section = (title: string, step: number, children: React.ReactNode) => (
    <Card>
      <CardHeader title={title} action={<Link href={`/cases/${c.id}/report?step=${step}`} className="text-sm font-medium text-brand-700 hover:underline">Edit</Link>} />
      <CardBody>{children}</CardBody>
    </Card>
  );

  return (
    <div className="space-y-4">
      {missing.length > 0 ? (
        <Alert tone="warning" title="A few details are still needed">
          <ul className="list-disc space-y-0.5 pl-5">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="info">
          When you confirm, Resolve creates your case. Nothing is sent to your bank — you stay in control of when and
          how you complain.
        </Alert>
      )}
      {section(
        "Problem type",
        1,
        <p className="text-sm text-ink-900">{c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].label : <span className="text-ink-400">Not chosen</span>}</p>,
      )}
      {section(
        "Transaction",
        2,
        <DescriptionList
          items={[
            { label: "Institution", value: c.institution_name },
            { label: "Amount", value: c.amount ? formatMoney(c.amount, c.currency) : null },
            { label: "Date and time", value: c.transaction_date ? formatDate(c.transaction_date, { withTime: true }) : null },
            { label: "Payment channel", value: c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : null },
            { label: "Transaction reference", value: c.transaction_reference, mono: true },
            { label: "Recipient / payee", value: c.recipient_details },
          ]}
        />,
      )}
      {section(
        "What happened",
        3,
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium text-ink-500">Description</p>
            <p className="mt-0.5 whitespace-pre-line text-ink-900">{c.incident_description ?? <span className="text-ink-400">Not provided</span>}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Previous attempts</p>
            <p className="mt-0.5 whitespace-pre-line text-ink-900">{c.previous_attempts ?? <span className="text-ink-400">None recorded</span>}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Requested outcome</p>
            <p className="mt-0.5 whitespace-pre-line text-ink-900">{c.requested_resolution ?? <span className="text-ink-400">Not provided</span>}</p>
          </div>
        </div>,
      )}
      {section(
        "Evidence",
        4,
        evidence.length === 0 ? (
          <p className="text-sm text-ink-500">No files yet. You can add evidence after creating the case.</p>
        ) : (
          <ul className="space-y-1 text-sm text-ink-900">
            {evidence.map((e) => (
              <li key={e.id}>
                {e.original_filename}
                {e.description ? <span className="text-ink-500"> — {e.description}</span> : null}
              </li>
            ))}
          </ul>
        ),
      )}
      <Card>
        <CardBody>
          <SubmitReportForm caseId={c.id} canSubmit={missing.length === 0} />
        </CardBody>
      </Card>
    </div>
  );
}
