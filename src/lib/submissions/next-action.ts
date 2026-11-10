import type { BankResponseRow, CaseRow, SubmissionRow } from "@/lib/types";

export interface NextAction {
  title: string;
  body: string;
  href: string;
  cta: string;
}

/**
 * The single most important thing the user should do next, worked out from
 * the case, its complaint, submissions and replies. Deterministic (no AI).
 */
export function nextRequiredAction(input: {
  c: Pick<CaseRow, "id" | "status">;
  hasApprovedDraft: boolean;
  submissions: Pick<SubmissionRow, "status" | "created_at">[];
  responses: Pick<BankResponseRow, "analyzed_at" | "user_reviewed_at">[];
}): NextAction {
  const { c } = input;
  const tab = (t: string) => `/cases/${c.id}?tab=${t}`;
  const latest = [...input.submissions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const unreviewed = input.responses.some((r) => !r.user_reviewed_at);

  if (unreviewed && !["resolved", "closed"].includes(c.status)) {
    return { title: "Review your institution's reply", body: "A reply needs your attention. Resolve can explain it and suggest what to do next.", href: `${tab("submit")}#responses`, cta: "Review the reply" };
  }
  if (latest?.status === "unknown") {
    return { title: "Check whether your email was sent", body: "We couldn't confirm your complaint email went out. Check your Gmail Sent folder and tell us, so nothing is sent twice.", href: tab("submit"), cta: "Check the submission" };
  }
  if (latest?.status === "awaiting_user_confirmation") {
    return { title: "Finish submitting on the website", body: "Submit your complaint on your institution's website, then confirm here with any reference they give you.", href: tab("submit"), cta: "Continue" };
  }

  switch (c.status) {
    case "draft":
      if (!input.hasApprovedDraft) {
        return { title: "Prepare your complaint", body: "Review the analysis, then create and approve your complaint draft.", href: tab("complaint"), cta: "Open complaint builder" };
      }
      if (latest?.status === "failed") {
        return { title: "Your complaint wasn't sent", body: "The last attempt failed and nothing was sent. See why, then try again or choose another channel.", href: tab("submit"), cta: "See what happened" };
      }
      return { title: "Submit your complaint", body: "Your complaint is approved. Send it to your institution from your own email, or submit it on their website with Resolve's help.", href: tab("submit"), cta: "Submit to your bank" };
    case "submitted_to_institution":
    case "awaiting_institution_response":
      return { title: "Wait for a reply — and follow up", body: "Add any reply you receive so Resolve can explain it. Plan a follow-up date so the case doesn't go quiet.", href: tab("submit"), cta: "Track replies" };
    case "additional_information_required":
      return { title: "Send the information requested", body: "Gather what your institution asked for, add it as evidence, and reply to them with it.", href: tab("evidence"), cta: "Add evidence" };
    case "ready_for_escalation":
      return { title: "Check the official escalation route", body: "Read the official guidance before escalating, and keep your institution's complaint reference handy.", href: "/help/guidance", cta: "View official guidance" };
    case "escalated_by_user":
      return { title: "Track your escalation", body: "Record any responses and keep notes of every contact.", href: tab("tracking"), cta: "Update tracking" };
    default:
      return { title: "This case is finished", body: "You can still view its full history and documents.", href: tab("tracking"), cta: "View history" };
  }
}
