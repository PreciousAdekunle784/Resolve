"use client";

import Link from "next/link";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { ProfileFields } from "@/components/forms/profile-fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldError } from "@/components/ui/field";
import type { Profile } from "@/lib/types";
import { completeOnboardingAction } from "./actions";

export function OnboardingForm({ profile, next }: { profile: Profile; next?: string }) {
  const { state, pending, onSubmit } = useFormAction(completeOnboardingAction);
  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <ProfileFields profile={profile} state={state} />

      <div className="space-y-4 rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 p-5">
        <h2 className="text-sm font-semibold text-ink-900">Your permissions</h2>
        <label className="flex gap-3 text-sm leading-relaxed text-ink-700">
          <Checkbox name="aiConsent" defaultChecked={profile.ai_processing_consent} />
          <span>
            <span className="font-medium text-ink-900">Allow AI analysis (optional).</span> When I ask for an analysis
            or AI-written complaint, Resolve may send my case details and evidence to its AI provider for processing,
            which may take place outside Nigeria. Resolve does not use my data to train AI models. I can withdraw this
            at any time in Settings.
          </span>
        </label>
        <div className="space-y-1">
          <label className="flex gap-3 text-sm leading-relaxed text-ink-700">
            <Checkbox name="acceptTerms" required />
            <span>
              I understand that Resolve is an independent assistant — not a bank, regulator or official CBN service —
              and that it cannot guarantee I will recover money. I accept the{" "}
              <Link href="/terms" target="_blank" className="font-medium text-brand-700 hover:underline">terms</Link> and{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-brand-700 hover:underline">privacy notice</Link>.
            </span>
          </label>
          <FieldError messages={errorsFor(state, "acceptTerms")} />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending} loadingText="Saving…">
        Continue to Resolve
      </Button>
    </form>
  );
}
