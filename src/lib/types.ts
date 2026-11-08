import type {
  AccountType,
  CaseStatus,
  ContactMethod,
  GuidanceStatus,
  IssueCategory,
  PaymentChannel,
  SubmissionChannel,
} from "@/lib/constants";

/** Row types mirroring the database tables (see supabase/migrations). */

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  country: string;
  account_type: AccountType | null;
  business_name: string | null;
  preferred_contact_method: ContactMethod;
  ai_processing_consent: boolean;
  ai_processing_consent_at: string | null;
  notify_case_updates: boolean;
  notify_follow_up_reminders: boolean;
  terms_accepted_at: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplementaryAnswer {
  question: string;
  answer: string;
  answered_at: string;
}

export interface CaseRow {
  id: string;
  user_id: string;
  case_number: string;
  intake_status: "in_progress" | "complete";
  intake_step: number;
  issue_category: IssueCategory | null;
  institution_name: string | null;
  amount: string | number | null;
  currency: string;
  transaction_date: string | null;
  transaction_reference: string | null;
  payment_channel: PaymentChannel | null;
  recipient_details: string | null;
  incident_description: string | null;
  previous_attempts: string | null;
  requested_resolution: string | null;
  supplementary_info: SupplementaryAnswer[];
  status: CaseStatus;
  institution_reference: string | null;
  institution_submission_date: string | null;
  institution_submission_channel: SubmissionChannel | null;
  next_follow_up_date: string | null;
  resolution_details: string | null;
  resolved_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ExtractionStatus = "not_started" | "processing" | "completed" | "failed" | "unsupported";

export interface EvidenceRow {
  id: string;
  case_id: string;
  user_id: string;
  file_path: string;
  original_filename: string;
  mime_type: "image/png" | "image/jpeg" | "application/pdf";
  file_size: number;
  description: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  created_at: string;
}

export interface CaseEventRow {
  id: string;
  case_id: string;
  user_id: string;
  event_type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AiAnalysisRow {
  id: string;
  case_id: string;
  user_id: string;
  evidence_id: string | null;
  analysis_type: "case_analysis" | "evidence_extraction";
  structured_result: Record<string, unknown>;
  model_identifier: string;
  user_review: Record<string, unknown>;
  reviewed_at: string | null;
  created_at: string;
}

export interface ComplaintDraftRow {
  id: string;
  case_id: string;
  user_id: string;
  subject: string;
  content: string;
  version: number;
  status: "draft" | "approved" | "superseded";
  generated_by: "ai" | "template";
  model_identifier: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuidanceRow {
  id: string;
  title: string;
  institution: string;
  country: string;
  issue_category: IssueCategory | null;
  source_url: string;
  content: string;
  publication_date: string | null;
  verified_at: string | null;
  effective_from: string | null;
  effective_until: string | null;
  status: GuidanceStatus;
  created_at: string;
  updated_at: string;
}

/** Standard result shape returned by server actions to forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
