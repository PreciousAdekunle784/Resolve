import type { StatusTone } from "@/lib/constants";
import type { SubmissionRow, SubmissionStatus } from "@/lib/types";

/** Labels for submission states. "Sent" is only ever shown when the email provider confirmed it. */
export const SUBMISSION_STATUS_INFO: Record<SubmissionStatus, { label: string; tone: StatusTone; description: string }> = {
  queued: { label: "Queued", tone: "info", description: "Authorised and about to be sent." },
  sending: { label: "Sending…", tone: "info", description: "Being handed to Gmail right now." },
  sent: { label: "Sent", tone: "success", description: "Gmail confirmed the email was sent." },
  failed: { label: "Not sent", tone: "danger", description: "Nothing was sent. You can try again." },
  unknown: { label: "Not confirmed", tone: "warning", description: "We couldn't confirm whether the email went out." },
  awaiting_user_confirmation: { label: "Waiting for you", tone: "warning", description: "Submit it on the institution's website, then confirm here." },
  confirmed_by_user: { label: "Submitted", tone: "success", description: "You confirmed you submitted it." },
  cancelled: { label: "Cancelled", tone: "muted", description: "This submission was cancelled." },
};

export const METHOD_LABELS: Record<SubmissionRow["method"], string> = {
  email: "Email from your Gmail",
  guided_portal: "Institution's website",
  api: "Direct integration",
};

export const LIVE_SUBMISSION_STATUSES: SubmissionStatus[] = ["queued", "sending", "sent", "unknown", "awaiting_user_confirmation", "confirmed_by_user"];

export const RESPONSE_CLASSIFICATION_INFO: Record<string, { label: string; tone: StatusTone }> = {
  acknowledgement: { label: "Acknowledgement", tone: "info" },
  information_requested: { label: "Information requested", tone: "warning" },
  under_investigation: { label: "Under investigation", tone: "info" },
  resolved_in_customer_favour: { label: "Resolved in your favour", tone: "success" },
  partially_resolved: { label: "Partly resolved", tone: "warning" },
  declined: { label: "Declined", tone: "danger" },
  referred_elsewhere: { label: "Referred elsewhere", tone: "neutral" },
  unclear: { label: "Unclear", tone: "neutral" },
};

/** The exact authorisation text shown to the user and stored with the submission. */
export function emailAuthorizationStatement(sender: string, recipient: string): string {
  return `I authorise Resolve to send my approved complaint and the selected attachments from my email account ${sender} to ${recipient}. I confirm the complaint is accurate and that I am sending it on my own behalf.`;
}

export function portalAuthorizationStatement(url: string): string {
  return `I will submit my approved complaint myself on the institution's official website (${url}). Resolve will not submit it for me or handle any login, CAPTCHA or one-time code.`;
}
