import "server-only";
import type { SubmissionRow } from "@/lib/types";

/**
 * Extension points for the two pathways that need a bank partnership or extra
 * infrastructure. See docs/SUBMISSIONS.md for the full contract.
 *
 * 1. Direct bank APIs. A bank-specific adapter may be registered here ONLY when
 *    the bank officially offers a complaint-submission API and has issued
 *    credentials to Resolve. None are registered: no Nigerian bank currently
 *    publishes such an API for third parties, and Resolve does not imitate or
 *    scrape private bank endpoints.
 *
 * 2. Browser automation for bank complaint portals. Portals use CAPTCHAs,
 *    logins and one-time codes, which must stay with the user. Automation would
 *    run in a separate worker (headless Chromium with Playwright) that fills in
 *    the public form fields and then hands control back to the user for any
 *    verification step. It cannot run inside Vercel serverless functions. Until
 *    such a worker is deployed and PORTAL_AUTOMATION_URL is set, Resolve uses
 *    the guided mode: it opens the official page and the user submits the
 *    complaint themselves, copying each field from Resolve.
 */

export interface BankApiResult {
  /** The bank's own reference for the complaint — required as proof of submission. */
  bankReference: string;
  acceptedAt: string;
}

export interface BankApiAdapter {
  bankId: string;
  /** Submits an approved complaint. Must throw if the bank does not confirm acceptance. */
  submit(submission: SubmissionRow, attachments: { filename: string; contentType: string; content: Buffer }[]): Promise<BankApiResult>;
}

/** Officially supported direct integrations, keyed by bank id (src/lib/banks.ts). Intentionally empty. */
export const BANK_API_ADAPTERS: Record<string, BankApiAdapter> = {};

export function getBankApiAdapter(bankId: string | null): BankApiAdapter | null {
  return bankId ? (BANK_API_ADAPTERS[bankId] ?? null) : null;
}

export interface PortalAutomationJob {
  jobId: string;
  /** "needs_user" when a CAPTCHA, login or OTP step is waiting for the user. */
  state: "queued" | "filling" | "needs_user" | "submitted" | "failed";
  bankReference?: string;
}

export interface PortalAutomationProvider {
  start(submission: SubmissionRow): Promise<PortalAutomationJob>;
  status(jobId: string): Promise<PortalAutomationJob>;
}

/** Returns the automation worker client when one is deployed. None is deployed yet. */
export function getPortalAutomationProvider(): PortalAutomationProvider | null {
  return null;
}
