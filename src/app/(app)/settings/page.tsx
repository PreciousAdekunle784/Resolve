import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { DeleteAccountForm, NotificationsForm, PrivacyForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { profile } = await requireOnboardedUser("/settings");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Manage your profile, privacy choices and data." />

      <Card id="profile">
        <CardHeader title="Profile" description="Used in the complaints you prepare." />
        <CardBody><ProfileForm profile={profile} /></CardBody>
      </Card>

      <Card id="privacy">
        <CardHeader
          title="Privacy"
          description={
            profile.ai_processing_consent && profile.ai_processing_consent_at
              ? `AI analysis allowed since ${formatDate(profile.ai_processing_consent_at)}.`
              : "AI analysis is currently turned off."
          }
        />
        <CardBody><PrivacyForm profile={profile} /></CardBody>
      </Card>

      <Card id="notifications">
        <CardHeader title="Notifications" />
        <CardBody className="space-y-4">
          <Alert tone="info">
            Resolve doesn&apos;t send emails yet. Your choices are saved and will apply when email notifications launch.
            Follow-ups that are due already appear on your dashboard.
          </Alert>
          <NotificationsForm profile={profile} />
        </CardBody>
      </Card>

      <Card id="data">
        <CardHeader title="Your data" description="Download a copy of everything Resolve stores about you." />
        <CardBody>
          <a href="/api/account/export" className={buttonClasses({ variant: "secondary" })}>Download my data (JSON)</a>
          <p className="mt-2 text-xs text-ink-500">Includes your profile, cases, history, analyses and complaint drafts. Evidence files can be downloaded from each case.</p>
        </CardBody>
      </Card>

      <Card id="delete" className="border-danger-100">
        <CardHeader title="Delete account" description="Permanently delete your account, all cases, history, drafts and uploaded files. This can't be undone." />
        <CardBody>
          {isAdminClientConfigured() ? (
            <DeleteAccountForm />
          ) : (
            <Alert tone="warning">
              Account deletion needs the server&apos;s Supabase secret key, which isn&apos;t configured on this installation.
              You can still delete individual cases (and their files) from each case page.
            </Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
