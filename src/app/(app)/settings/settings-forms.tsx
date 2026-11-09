"use client";

import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { ProfileFields } from "@/components/forms/profile-fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import type { Profile } from "@/lib/types";
import { deleteAccountAction, updateNotificationsAction, updatePrivacyAction, updateProfileAction } from "./actions";

export function ProfileForm({ profile }: { profile: Profile }) {
  const { state, pending, onSubmit } = useFormAction(updateProfileAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <ProfileFields profile={profile} state={state} />
      <Button type="submit" loading={pending} loadingText="Saving…">Save profile</Button>
    </form>
  );
}

export function PrivacyForm({ profile, aiNotice }: { profile: Profile; aiNotice: string }) {
  const { state, pending, onSubmit } = useFormAction(updatePrivacyAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormMessage state={state} />
      <label className="flex gap-3 text-sm leading-relaxed text-ink-700">
        <Checkbox name="aiConsent" defaultChecked={profile.ai_processing_consent} />
        <span>
          <span className="font-medium text-ink-900">Allow AI analysis.</span> When you ask for an analysis or an
          AI-written complaint, Resolve sends the case details and evidence to its AI provider for processing, which
          may happen outside Nigeria. {aiNotice} Turning this off stops any new AI processing; Resolve keeps working
          without it.
        </span>
      </label>
      <Button type="submit" loading={pending}>Save privacy choice</Button>
    </form>
  );
}

export function NotificationsForm({ profile }: { profile: Profile }) {
  const { state, pending, onSubmit } = useFormAction(updateNotificationsAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormMessage state={state} />
      <label className="flex gap-3 text-sm text-ink-700">
        <Checkbox name="notifyCaseUpdates" defaultChecked={profile.notify_case_updates} />
        <span><span className="font-medium text-ink-900">Case updates</span> — emails when something changes on a case.</span>
      </label>
      <label className="flex gap-3 text-sm text-ink-700">
        <Checkbox name="notifyFollowUps" defaultChecked={profile.notify_follow_up_reminders} />
        <span><span className="font-medium text-ink-900">Follow-up reminders</span> — emails on follow-up dates you set.</span>
      </label>
      <Button type="submit" loading={pending}>Save preferences</Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const { state, pending, onSubmit } = useFormAction(deleteAccountAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormMessage state={state && !state.ok && errorsFor(state, "confirm") ? null : state} />
      <Field label="Type DELETE MY ACCOUNT to confirm" htmlFor="confirm-account" error={errorsFor(state, "confirm")}>
        <Input id="confirm-account" name="confirm" autoComplete="off" />
      </Field>
      <Button type="submit" variant="danger" loading={pending} loadingText="Deleting…">Permanently delete my account</Button>
    </form>
  );
}
