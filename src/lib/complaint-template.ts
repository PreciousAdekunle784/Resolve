import { CONTACT_METHOD_LABELS, ISSUE_CATEGORY_INFO, PAYMENT_CHANNEL_LABELS } from "@/lib/constants";
import { formatDate, formatMoneyPlain } from "@/lib/format";
import type { CaseRow, EvidenceRow, Profile } from "@/lib/types";

/**
 * Builds a complaint draft WITHOUT AI, directly from the facts the user
 * entered. Used when AI is unavailable or the user has not consented to AI
 * processing. Missing details become [ADD: ...] placeholders.
 */

type ProfileLike = Pick<Profile, "full_name" | "email" | "phone" | "preferred_contact_method" | "account_type" | "business_name">;
type EvidenceLike = Pick<EvidenceRow, "original_filename" | "description">;

const add = (what: string) => `[ADD: ${what}]`;

export function buildTemplateComplaint(c: CaseRow, profile: ProfileLike, evidence: EvidenceLike[], today = new Date()) {
  const category = c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].label.toLowerCase() : "transaction problem";
  const amount = c.amount ? formatMoneyPlain(c.amount, c.currency) : add("amount");
  const when = c.transaction_date ? formatDate(c.transaction_date, { withTime: true }) : add("date and time of the transaction");
  const reference = c.transaction_reference ?? add("transaction reference / session ID");
  const channel = c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : add("payment channel");
  const institution = c.institution_name ?? add("institution name");
  const name = profile.full_name ?? add("your full name");

  const contactLines = [
    `Email: ${profile.email}`,
    profile.phone ? `Phone: ${profile.phone}` : null,
    `Preferred contact method: ${CONTACT_METHOD_LABELS[profile.preferred_contact_method]}`,
  ].filter(Boolean);

  const subject = `Complaint: ${ISSUE_CATEGORY_INFO[c.issue_category ?? "failed_or_pending_transfer"].label} of ${amount} on ${
    c.transaction_date ? formatDate(c.transaction_date) : add("date")
  }`;

  const paragraphs = [
    formatDate(today),
    `To: Customer Complaints Unit\n${institution}`,
    `Subject: ${subject}`,
    "Dear Sir/Madam,",
    `I am writing to formally report a ${category} on my ${profile.account_type === "business" ? `business account${profile.business_name ? ` (${profile.business_name})` : ""}` : "account"} with ${institution}.`,
    [
      "Transaction details:",
      `- Date and time: ${when}`,
      `- Amount: ${amount}`,
      `- Transaction reference: ${reference}`,
      `- Payment channel: ${channel}`,
      c.recipient_details ? `- Recipient / payee: ${c.recipient_details}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    `What happened:\n${c.incident_description ?? add("a description of what happened")}`,
    c.previous_attempts
      ? `Previous attempts to resolve this:\n${c.previous_attempts}`
      : "This is my first formal written complaint about this transaction.",
    ...(c.supplementary_info.length > 0
      ? [`Additional information:\n${c.supplementary_info.map((s) => `- ${s.question} ${s.answer}`).join("\n")}`]
      : []),
    evidence.length > 0
      ? `Supporting evidence enclosed:\n${evidence.map((e) => `- ${e.description ? `${e.description} (${e.original_filename})` : e.original_filename}`).join("\n")}`
      : `Supporting evidence: ${add("list any receipts, alerts or statements you will attach")}`,
    `Resolution requested:\n${c.requested_resolution ?? add("the outcome you are asking for, e.g. a refund of the debited amount")}`,
    "Please acknowledge receipt of this complaint and provide a complaint reference number. I would be grateful for a written update on your investigation and its outcome.",
    `Yours faithfully,\n${name}\n${contactLines.join("\n")}`,
  ];

  const body = paragraphs.join("\n\n");
  const placeholders = Array.from(body.matchAll(/\[ADD: ([^\]]+)\]/g)).map((m) => m[1]);
  return { subject, body, placeholders: Array.from(new Set(placeholders)) };
}

/** Facts the complaint may legitimately mention (used by the fabrication check). */
export function confirmedFactTexts(c: CaseRow, profile: ProfileLike, evidence: EvidenceLike[]): string[] {
  return [
    c.case_number,
    c.institution_name,
    c.amount === null ? null : String(c.amount),
    c.currency,
    c.transaction_date,
    c.transaction_date ? formatDate(c.transaction_date, { withTime: true }) : null,
    c.transaction_reference,
    c.recipient_details,
    c.incident_description,
    c.previous_attempts,
    c.requested_resolution,
    c.institution_reference,
    profile.full_name,
    profile.email,
    profile.phone,
    profile.business_name,
    ...c.supplementary_info.flatMap((s) => [s.question, s.answer]),
    ...evidence.flatMap((e) => [e.original_filename, e.description]),
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
}
