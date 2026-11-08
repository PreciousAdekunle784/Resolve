/**
 * Shared domain constants. Keep these in sync with the CHECK constraints in
 * supabase/migrations/20261108000001_initial_schema.sql.
 */

export const ISSUE_CATEGORIES = [
  "failed_or_pending_transfer",
  "unauthorised_debit",
  "duplicate_transaction",
  "erroneous_transfer",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_CATEGORY_INFO: Record<IssueCategory, { label: string; short: string; description: string }> = {
  failed_or_pending_transfer: {
    label: "Failed or pending transfer",
    short: "Failed transfer",
    description: "Money left your account, but the transfer failed, is stuck as pending, or the recipient says they never received it.",
  },
  unauthorised_debit: {
    label: "Unrecognised or unauthorised debit",
    short: "Unauthorised debit",
    description: "A debit you do not recognise or did not approve appeared on your account.",
  },
  duplicate_transaction: {
    label: "Duplicate transaction",
    short: "Duplicate debit",
    description: "You were charged more than once for the same payment or transfer.",
  },
  erroneous_transfer: {
    label: "Transfer to the wrong recipient",
    short: "Wrong recipient",
    description: "You sent money to the wrong account number or the wrong person by mistake.",
  },
};

export const PAYMENT_CHANNELS = [
  "mobile_app",
  "internet_banking",
  "ussd",
  "pos",
  "atm",
  "bank_branch",
  "card_online",
  "fintech_wallet",
  "agent_banking",
  "other",
] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  mobile_app: "Mobile banking app",
  internet_banking: "Internet banking (web)",
  ussd: "USSD code",
  pos: "POS terminal",
  atm: "ATM",
  bank_branch: "Bank branch",
  card_online: "Card payment online",
  fintech_wallet: "Fintech / wallet app",
  agent_banking: "Agent banking (POS agent)",
  other: "Other",
};

export const CASE_STATUSES = [
  "draft",
  "submitted_to_institution",
  "awaiting_institution_response",
  "additional_information_required",
  "ready_for_escalation",
  "escalated_by_user",
  "resolved",
  "closed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "muted";

export const CASE_STATUS_INFO: Record<CaseStatus, { label: string; tone: StatusTone; description: string }> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    description: "Your complaint has not been sent to your financial institution yet.",
  },
  submitted_to_institution: {
    label: "Submitted to institution",
    tone: "info",
    description: "You have sent your complaint to your financial institution.",
  },
  awaiting_institution_response: {
    label: "Awaiting institution response",
    tone: "warning",
    description: "You are waiting for your financial institution to respond.",
  },
  additional_information_required: {
    label: "Additional information required",
    tone: "warning",
    description: "Your institution has asked for more information or documents.",
  },
  ready_for_escalation: {
    label: "Ready for escalation",
    tone: "warning",
    description: "You have decided to escalate. Check the official guidance for the escalation route.",
  },
  escalated_by_user: {
    label: "Escalated by you",
    tone: "info",
    description: "You have escalated your complaint (for example, to the regulator).",
  },
  resolved: {
    label: "Resolved",
    tone: "success",
    description: "You have marked this case as resolved.",
  },
  closed: {
    label: "Closed",
    tone: "muted",
    description: "This case is closed.",
  },
};

/** Statuses that need something from the user. */
export const USER_ACTION_STATUSES: CaseStatus[] = ["draft", "additional_information_required", "ready_for_escalation"];
/** Statuses where the user is waiting on the institution. */
export const AWAITING_STATUSES: CaseStatus[] = ["submitted_to_institution", "awaiting_institution_response"];
export const OPEN_STATUSES: CaseStatus[] = CASE_STATUSES.filter((s) => s !== "resolved" && s !== "closed");

export const SUBMISSION_CHANNELS = [
  "branch_visit",
  "email",
  "phone",
  "mobile_app",
  "website_form",
  "social_media",
  "letter",
  "other",
] as const;
export type SubmissionChannel = (typeof SUBMISSION_CHANNELS)[number];

export const SUBMISSION_CHANNEL_LABELS: Record<SubmissionChannel, string> = {
  branch_visit: "In person at a branch",
  email: "Email",
  phone: "Phone / call centre",
  mobile_app: "In-app support / chat",
  website_form: "Website complaint form",
  social_media: "Social media",
  letter: "Letter",
  other: "Other",
};

export const CONTACT_METHODS = ["email", "phone", "sms", "whatsapp"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  email: "Email",
  phone: "Phone call",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

export const ACCOUNT_TYPES = ["individual", "business"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"] as const;

export const COMMON_INSTITUTIONS = [
  "Access Bank",
  "Citibank Nigeria",
  "Ecobank Nigeria",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Globus Bank",
  "Guaranty Trust Bank (GTBank)",
  "Jaiz Bank",
  "Keystone Bank",
  "Kuda Microfinance Bank",
  "Lotus Bank",
  "Moniepoint Microfinance Bank",
  "OPay",
  "PalmPay",
  "Parallex Bank",
  "Polaris Bank",
  "Premium Trust Bank",
  "Providus Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered Bank Nigeria",
  "Sterling Bank",
  "SunTrust Bank",
  "Titan Trust Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Unity Bank",
  "Wema Bank",
  "Zenith Bank",
];

export const EVIDENCE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_MAX_FILES_PER_CASE = 10;
export const EVIDENCE_BUCKET = "evidence";
export const EVIDENCE_ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export type EvidenceMimeType = (typeof EVIDENCE_ALLOWED_MIME_TYPES)[number];

export const GUIDANCE_STATUSES = ["verified", "unverified", "outdated", "archived"] as const;
export type GuidanceStatus = (typeof GUIDANCE_STATUSES)[number];

/** Words we never want users to type into Resolve. Used for warnings in forms. */
export const SENSITIVE_DATA_WARNING =
  "Never share your PIN, OTP, password, BVN, NIN or full card number — not with Resolve, and not with anyone claiming to help you recover money.";
