import type { Metadata } from "next";
import { WizardProgress } from "@/components/app/wizard-progress";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CategoryStepForm } from "../report-forms";

export const metadata: Metadata = { title: "Report a problem" };

export default function NewCasePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="New report"
        title="What kind of problem are you facing?"
        description="This takes about 5 minutes. Your answers are saved after each step, so you can finish later."
      />
      <WizardProgress current={1} maxReached={1} />
      <Card>
        <CardBody className="p-5 sm:p-6">
          <CategoryStepForm />
        </CardBody>
      </Card>
    </div>
  );
}
