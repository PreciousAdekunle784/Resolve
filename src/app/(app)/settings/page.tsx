import type { Metadata } from "next";
import { DownloadStatementButton } from "@/components/app/download-statement";
import { EmailConnectionPanel } from "@/components/app/email-connection";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { aiDataUseNotice, getAIProviderInfo } from "@/lib/ai/provider-info";
import { requireOnboardedUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { isEmailSubmissionConfigured } from "@/lib/email/google";
import { createClient } from "@/lib/supabase/server";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import type { EmailConnectionRow } from "@/lib/types";
import { DeleteAccountForm, NotificationsForm, PrivacyForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

const GMAIL_MESSAGES: Record<string, string> = {
  denied: "You didn't give Resolve permission, so Gmail wasn't connected.",
  expired: "The connection took too long or was started in another tab. Please try again.",
  send_permission_missing: "Resolve needs permission to send email. Please try again and allow it on Google's screen.",
  no_refresh_token: "Google didn't grant lasting access. Remove Resolve from your Google account's third-party access page, then connect again.",
  not_configured: "Sending by email isn't set up on this installation yet.",
  google_error: "Google returned an error. Please try again.",
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { user, profile } = await requireOnboardedUser("/settings");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: connectionRow } = await supabase.from("email_connections").select("*").eq("user_id", user.id).maybeSingle();
  const connection = connectionRow as EmailConnectionRow | null;
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
        <CardBody><PrivacyForm profile={profile} aiNotice={aiDataUseNotice(getAIProviderInfo())} /></CardBody>
      </Card>

      <Card id="email" className="scroll-mt-24">
        <CardHeader title="Connected email" description="The Gmail account Resolve sends your complaints from." />
        <CardBody className="space-y-3">
          {sp.gmail === "connected" ? <Alert tone="success">Gmail connected{connection ? ` as ${connection.email_address}` : ""}.</Alert> : null}
          {sp.gmail === "error" ? <Alert tone="error" title="Gmail wasn't connected">{GMAIL_MESSAGES[String(sp.reason)] ?? GMAIL_MESSAGES.google_error}</Alert> : null}
          <EmailConnectionPanel
            configured={isEmailSubmissionConfigured()}
            connection={
              connection
                ? { email: connection.email_address, canReadReplies: connection.can_read_replies, status: connection.status, connectedAt: connection.connected_at, lastUsedAt: connection.last_used_at }
                : null
            }
          />
        </CardBody>
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
        <CardHeader title="Your data" description="Download a statement of your account and every transaction you've reported." />
        <CardBody className="space-y-2">
          <DownloadStatementButton />
          <p className="text-xs text-ink-500">
            A PDF with your account details, a summary of amounts reported, outstanding and resolved, your full
            transaction history and all case activity. Evidence files can be downloaded from each case.
          </p>
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
