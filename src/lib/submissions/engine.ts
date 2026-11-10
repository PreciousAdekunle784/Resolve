import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findBank } from "@/lib/banks";
import { EVIDENCE_BUCKET } from "@/lib/constants";
import { getEmailConnection, getGmailAccess, touchConnection } from "@/lib/email/connections";
import {
  EmailProviderError,
  findMessageByMessageId,
  getGmailThread,
  isEmailSubmissionConfigured,
  messageHeader,
  messageText,
  sendGmailMessage,
} from "@/lib/email/google";
import { buildMimeMessage, isValidEmailAddress, parseAddress, stripQuotedReply } from "@/lib/email/mime";
import { getSiteUrl } from "@/lib/env";
import { formatDate, todayInLagos } from "@/lib/format";
import { prepareEmail, validateComplaint, type ToolContext } from "@/lib/orchestrator";
import { renderComplaintPdf } from "@/lib/pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailAuthorizationStatement, portalAuthorizationStatement } from "./labels";
import type { BankChannelRow, CaseRow, ComplaintDraftRow, EvidenceRow, SubmissionAttachment, SubmissionRow } from "@/lib/types";

/**
 * Hybrid submission engine.
 *
 * Execution pathways (see SubmissionMethod):
 *   email          Sent from the user's own Gmail account through the Gmail API.
 *                  Marked "sent" only when Gmail returns a message id.
 *   guided_portal  Resolve opens the bank's official complaint page and the user
 *                  submits it themselves (CAPTCHA, login and OTP stay with the
 *                  user). Marked "confirmed_by_user" when they tell us they did.
 *   api            Direct bank integrations — only where a bank offers one
 *                  officially (see ./adapters.ts). None are available today.
 *
 * Safety rules:
 *   * Nothing is sent without an explicit authorisation recorded on the row.
 *   * Each request carries an idempotency key; the database also refuses a
 *     second live submission of the same complaint version to the same recipient.
 *   * A submission is "claimed" atomically before sending, so two requests (or
 *     the background job) can't send it twice.
 *   * If we can't tell whether Gmail sent a message, it's marked "unknown" and
 *     reconciled by searching the user's mailbox for its Message-ID — never
 *     blindly re-sent.
 *
 * Writes use the service-role client because users may not write submissions
 * directly (so nobody can fake a "sent" status). Every entry point checks
 * ownership with the user's own client first.
 */

export const DAILY_EMAIL_LIMIT = 10;
const STALE_SENDING_MS = 10 * 60 * 1000;

export class SubmissionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

async function audit(submission: Pick<SubmissionRow, "id" | "user_id">, action: string, detail: Record<string, unknown> = {}) {
  await createAdminClient().from("submission_audit_log").insert({ submission_id: submission.id, user_id: submission.user_id, action, detail });
}

async function caseEvent(c: Pick<CaseRow, "id" | "user_id">, type: string, description: string, metadata: Record<string, unknown> = {}) {
  await createAdminClient()
    .from("case_events")
    .insert({ case_id: c.id, user_id: c.user_id, event_type: type, description: description.slice(0, 2000), metadata });
}

async function loadSubmission(id: string): Promise<SubmissionRow | null> {
  const { data } = await createAdminClient().from("complaint_submissions").select("*").eq("id", id).maybeSingle();
  return (data as SubmissionRow | null) ?? null;
}

async function update(id: string, fields: Partial<SubmissionRow>, guard?: { status?: SubmissionRow["status"][]; attempt?: number }) {
  let q = createAdminClient().from("complaint_submissions").update(fields).eq("id", id);
  if (guard?.status) q = q.in("status", guard.status);
  if (guard?.attempt !== undefined) q = q.eq("attempt_count", guard.attempt);
  const { data, error } = await q.select("*");
  if (error) throw new Error("Could not update the submission.");
  return ((data ?? []) as SubmissionRow[])[0] ?? null;
}

async function loadCurrentApprovedDraft(supabase: SupabaseClient, c: CaseRow, draftId: string): Promise<ComplaintDraftRow> {
  const { data } = await supabase.from("complaint_drafts").select("*").eq("id", draftId).eq("case_id", c.id).maybeSingle();
  const draft = data as ComplaintDraftRow | null;
  if (!draft) throw new SubmissionError(404, "Complaint not found.", "draft_not_found");
  if (draft.status !== "approved") throw new SubmissionError(400, "Approve the latest version of your complaint before submitting it.", "draft_not_approved");
  return draft;
}

async function resolveChannel(supabase: SupabaseClient, c: CaseRow, channelId: string, type: BankChannelRow["channel_type"]) {
  const { data } = await supabase.from("bank_contact_channels").select("*").eq("id", channelId).maybeSingle();
  const channel = data as BankChannelRow | null;
  if (!channel || channel.channel_type !== type || channel.status === "archived") {
    throw new SubmissionError(400, "That contact channel isn't available.", "channel_unavailable");
  }
  if (channel.status === "outdated") throw new SubmissionError(400, "That contact channel is marked as outdated. Choose another one.", "channel_outdated");
  if (findBank(c.institution_name)?.id !== channel.bank_id) {
    throw new SubmissionError(400, "That contact channel belongs to a different institution.", "channel_mismatch");
  }
  return channel;
}

/** Looks up an existing submission for this idempotency key (replayed request). */
async function findByIdempotencyKey(userId: string, key: string) {
  const { data } = await createAdminClient().from("complaint_submissions").select("*").eq("user_id", userId).eq("idempotency_key", key).maybeSingle();
  return (data as SubmissionRow | null) ?? null;
}

async function insertSubmission(row: Record<string, unknown>): Promise<SubmissionRow> {
  const { data, error } = await createAdminClient().from("complaint_submissions").insert(row).select("*").single();
  if (error || !data) {
    const message = `${error?.message ?? ""} ${(error as { details?: string } | null)?.details ?? ""}`;
    if (message.includes("complaint_submissions_no_duplicates") || (error?.code === "23505" && !message.includes("idempotency"))) {
      throw new SubmissionError(409, "This complaint has already been submitted to that recipient. Check the submission history below.", "duplicate");
    }
    throw new SubmissionError(500, "Could not save the submission. Nothing was sent.", "save_failed");
  }
  return data as SubmissionRow;
}

// ---------------------------------------------------------------------------
// Email submission
// ---------------------------------------------------------------------------

export interface CreateEmailSubmissionInput {
  draftId: string;
  channelId?: string | null;
  recipient?: string | null;
  recipientConfirmed: boolean;
  evidenceIds: string[];
  idempotencyKey: string;
  authorized: boolean;
}

export async function createEmailSubmission(ctx: ToolContext, input: CreateEmailSubmissionInput): Promise<{ submission: SubmissionRow; replayed: boolean }> {
  if (!isEmailSubmissionConfigured()) throw new SubmissionError(503, "Sending by email isn't set up on this site yet.", "not_configured");
  const replay = await findByIdempotencyKey(ctx.userId, input.idempotencyKey);
  if (replay) {
    if (replay.case_id !== ctx.c.id) throw new SubmissionError(409, "This request was already used for another case.", "idempotency_conflict");
    return { submission: replay, replayed: true };
  }
  if (!input.authorized) throw new SubmissionError(400, "Please confirm that you authorise Resolve to send this complaint.", "authorization_required");

  const draft = await loadCurrentApprovedDraft(ctx.supabase, ctx.c, input.draftId);

  let recipient: string;
  let recipientSource: SubmissionRow["recipient_source"];
  let channelId: string | null = null;
  if (input.channelId) {
    const channel = await resolveChannel(ctx.supabase, ctx.c, input.channelId, "email");
    recipient = channel.value.toLowerCase();
    channelId = channel.id;
    recipientSource = channel.status === "verified" ? "verified_directory" : "unverified_directory";
  } else {
    recipient = (input.recipient ?? "").trim().toLowerCase();
    if (!isValidEmailAddress(recipient)) throw new SubmissionError(400, "Enter a valid email address for your institution.", "invalid_recipient");
    recipientSource = "user_provided";
  }
  if (recipientSource !== "verified_directory" && !input.recipientConfirmed) {
    throw new SubmissionError(400, "Confirm that you got this address from your institution's official website, app or statement.", "recipient_confirmation_required");
  }

  const validation = await validateComplaint(ctx, draft, { useAI: false });
  if (!validation.checks.ready) {
    throw new SubmissionError(422, "Your complaint needs a few changes before it can be sent.", "validation_failed", { blocking: validation.checks.blocking });
  }

  const { connection } = await getGmailAccess(ctx.userId).catch((error) => {
    if (error instanceof EmailProviderError) throw new SubmissionError(400, error.message, error.code);
    throw error;
  });
  const plan = await prepareEmail(ctx, { draft, recipient, senderAddress: connection.email_address, evidenceIds: input.evidenceIds });

  const admin = createAdminClient();
  const { count } = await admin
    .from("complaint_submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .eq("method", "email")
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if ((count ?? 0) >= DAILY_EMAIL_LIMIT) {
    throw new SubmissionError(429, `You can send up to ${DAILY_EMAIL_LIMIT} complaint emails a day. Please try again tomorrow.`, "daily_limit");
  }

  const attachments: SubmissionAttachment[] = [
    { kind: "complaint_pdf", filename: plan.complaintPdfName, evidence_id: null, size: 0 },
    ...plan.evidence.map((e) => ({ kind: "evidence" as const, filename: e.original_filename, evidence_id: e.id, size: e.file_size })),
  ];
  const host = new URL(getSiteUrl()).hostname || "resolve.local";
  const submission = await insertSubmission({
    case_id: ctx.c.id,
    user_id: ctx.userId,
    draft_id: draft.id,
    draft_version: draft.version,
    method: "email",
    channel_id: channelId,
    recipient,
    recipient_source: recipientSource,
    subject: plan.subject,
    body: plan.body,
    attachments,
    idempotency_key: input.idempotencyKey,
    status: "queued",
    authorized_at: new Date().toISOString(),
    authorization_statement: emailAuthorizationStatement(connection.email_address, recipient),
    provider: "gmail",
    sender_address: connection.email_address,
    message_id_header: `<${randomUUID()}@${host}>`,
  }).catch(async (error) => {
    // A concurrent request with the same key may have won the race.
    const existing = await findByIdempotencyKey(ctx.userId, input.idempotencyKey);
    if (existing) return existing;
    throw error;
  });

  await audit(submission, "created", { method: "email", recipient_source: recipientSource });
  await audit(submission, "authorized", { statement: submission.authorization_statement });
  await caseEvent(ctx.c, "submission_authorized", `You authorised sending complaint version ${draft.version} to ${recipient} from ${connection.email_address}`, {
    submission_id: submission.id,
  });

  return { submission: await executeEmailSubmission(submission.id), replayed: false };
}

async function buildAttachments(submission: SubmissionRow, c: Pick<CaseRow, "case_number">) {
  const admin = createAdminClient();
  const files = [];
  for (const a of submission.attachments) {
    if (a.kind === "complaint_pdf") {
      const pdf = await renderComplaintPdf({ subject: submission.subject, body: submission.body, caseNumber: c.case_number, version: submission.draft_version, approved: true });
      files.push({ filename: a.filename, contentType: "application/pdf", content: Buffer.from(pdf) });
    } else if (a.evidence_id) {
      const { data: row } = await admin.from("evidence").select("*").eq("id", a.evidence_id).eq("user_id", submission.user_id).eq("case_id", submission.case_id).maybeSingle();
      const evidence = row as EvidenceRow | null;
      if (!evidence) throw new SubmissionError(400, `The file “${a.filename}” was removed. Start a new submission without it.`, "attachment_missing");
      const { data: blob, error } = await admin.storage.from(EVIDENCE_BUCKET).download(evidence.file_path);
      if (error || !blob) throw new SubmissionError(500, `Couldn't read “${a.filename}”. Nothing was sent — please try again.`, "attachment_unreadable");
      files.push({ filename: evidence.original_filename, contentType: evidence.mime_type, content: Buffer.from(await blob.arrayBuffer()) });
    }
  }
  return files;
}

async function loadCase(id: string): Promise<CaseRow> {
  const { data } = await createAdminClient().from("cases").select("*").eq("id", id).single();
  return data as CaseRow;
}

async function markSent(submission: SubmissionRow, ids: { id: string; threadId: string }, via: "provider_accepted" | "reconciled") {
  const updated = await update(submission.id, {
    status: "sent",
    provider_message_id: ids.id,
    provider_thread_id: ids.threadId,
    sent_at: new Date().toISOString(),
    last_error: null,
  });
  await audit(submission, via, { provider_message_id: ids.id });
  const c = await loadCase(submission.case_id);
  const caseUpdate: Record<string, unknown> = {
    institution_submission_date: todayInLagos(),
    institution_submission_channel: "email",
  };
  if (c.status === "draft") caseUpdate.status = "submitted_to_institution";
  await createAdminClient().from("cases").update(caseUpdate).eq("id", c.id).eq("user_id", submission.user_id);
  await caseEvent(c, "submission_sent", `Complaint version ${submission.draft_version} emailed to ${submission.recipient} from ${submission.sender_address}. Gmail confirmed it was sent (message ID ${ids.id}).`, {
    submission_id: submission.id,
    provider_message_id: ids.id,
  });
  return updated ?? submission;
}

/** Sends a queued (or failed) email submission. Safe to call more than once. */
export async function executeEmailSubmission(submissionId: string): Promise<SubmissionRow> {
  const current = await loadSubmission(submissionId);
  if (!current) throw new SubmissionError(404, "Submission not found.", "not_found");
  if (current.method !== "email" || !["queued", "failed"].includes(current.status)) return current;

  // Atomic claim: only one caller can move this attempt to "sending".
  const claimed = await update(
    current.id,
    { status: "sending", attempt_count: current.attempt_count + 1, sending_started_at: new Date().toISOString(), last_error: null },
    { status: ["queued", "failed"], attempt: current.attempt_count },
  );
  if (!claimed) return (await loadSubmission(submissionId)) ?? current;
  await audit(claimed, "send_started", { attempt: claimed.attempt_count });

  const c = await loadCase(claimed.case_id);
  const fail = async (message: string, code: string) => {
    const failed = await update(claimed.id, { status: "failed", last_error: message.slice(0, 1000) });
    await audit(claimed, "provider_rejected", { code, message });
    await caseEvent(c, "submission_failed", `Your complaint email to ${claimed.recipient} was not sent: ${message}`, { submission_id: claimed.id, code });
    return failed ?? claimed;
  };

  let accessToken: string;
  let connectionId: string;
  let raw: Buffer;
  try {
    const access = await getGmailAccess(claimed.user_id);
    if (access.connection.email_address !== claimed.sender_address) {
      return await fail(
        `You authorised sending from ${claimed.sender_address}, but Gmail is now connected as ${access.connection.email_address}. Start a new submission to send from this account.`,
        "sender_changed",
      );
    }
    accessToken = access.accessToken;
    connectionId = access.connection.id;
    const profile = await createAdminClient().from("profiles").select("full_name").eq("id", claimed.user_id).single();
    raw = buildMimeMessage({
      from: { name: (profile.data?.full_name as string | null) ?? null, address: claimed.sender_address! },
      to: claimed.recipient,
      subject: claimed.subject,
      text: claimed.body,
      messageId: claimed.message_id_header!,
      attachments: await buildAttachments(claimed, c),
    });
  } catch (error) {
    // Nothing has been sent yet.
    const message = error instanceof EmailProviderError || error instanceof SubmissionError ? error.message : "Something went wrong while preparing the email. Nothing was sent.";
    return fail(message, error instanceof EmailProviderError || error instanceof SubmissionError ? error.code : "prepare_failed");
  }

  try {
    const ids = await sendGmailMessage(accessToken, raw);
    await touchConnection(connectionId);
    return await markSent(claimed, ids, "provider_accepted");
  } catch (error) {
    if (error instanceof EmailProviderError && error.code === "uncertain") {
      const unknown = await update(claimed.id, { status: "unknown", last_error: error.message });
      await audit(claimed, "outcome_unknown", { message: error.message });
      await caseEvent(c, "submission_outcome_unknown", `We couldn't confirm whether your complaint email to ${claimed.recipient} was sent. Resolve won't resend it automatically.`, {
        submission_id: claimed.id,
      });
      return (await reconcileUnknownSubmission(claimed.id).catch(() => null)) ?? unknown ?? claimed;
    }
    const message = error instanceof EmailProviderError ? error.message : "Gmail didn't accept the email. Nothing was sent.";
    return fail(message, error instanceof EmailProviderError ? error.code : "send_failed");
  }
}

/**
 * For a submission whose outcome is unknown: search the user's mailbox for the
 * Message-ID Resolve set. Needs the optional read permission; without it the
 * user is asked to check their Sent folder and tell us.
 */
export async function reconcileUnknownSubmission(submissionId: string): Promise<SubmissionRow | null> {
  const s = await loadSubmission(submissionId);
  if (!s || s.status !== "unknown" || !s.message_id_header) return s;
  const connection = await getEmailConnection(s.user_id);
  if (!connection?.can_read_replies || connection.email_address !== s.sender_address) return s;
  const { accessToken } = await getGmailAccess(s.user_id);
  const found = await findMessageByMessageId(accessToken, s.message_id_header);
  if (found) return markSent(s, found, "reconciled");
  const startedAt = s.sending_started_at ? new Date(s.sending_started_at).getTime() : 0;
  if (Date.now() - startedAt > 2 * 60 * 1000) {
    // Gmail has no record of it well after the attempt, so it wasn't sent.
    const failed = await update(s.id, { status: "failed", last_error: "Gmail has no record of this email, so it wasn't sent. You can try again." }, { status: ["unknown"] });
    await audit(s, "reconciled", { found: false });
    return failed ?? s;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Guided portal submission
// ---------------------------------------------------------------------------

export async function createPortalSubmission(
  ctx: ToolContext,
  input: { draftId: string; channelId?: string | null; url?: string | null; urlConfirmed: boolean; idempotencyKey: string; authorized: boolean },
): Promise<{ submission: SubmissionRow; replayed: boolean }> {
  const replay = await findByIdempotencyKey(ctx.userId, input.idempotencyKey);
  if (replay) return { submission: replay, replayed: true };
  if (!input.authorized) throw new SubmissionError(400, "Please confirm you'll submit the complaint yourself on the institution's website.", "authorization_required");
  const draft = await loadCurrentApprovedDraft(ctx.supabase, ctx.c, input.draftId);

  let url: string;
  let source: SubmissionRow["recipient_source"];
  let channelId: string | null = null;
  if (input.channelId) {
    const channel = await resolveChannel(ctx.supabase, ctx.c, input.channelId, "web_portal");
    url = channel.value;
    channelId = channel.id;
    source = channel.status === "verified" ? "verified_directory" : "unverified_directory";
  } else {
    url = (input.url ?? "").trim();
    try {
      if (new URL(url).protocol !== "https:") throw new Error();
    } catch {
      throw new SubmissionError(400, "Enter the full https:// address of your institution's complaint page.", "invalid_url");
    }
    source = "user_provided";
  }
  if (source !== "verified_directory" && !input.urlConfirmed) {
    throw new SubmissionError(400, "Confirm that this is your institution's official website.", "recipient_confirmation_required");
  }
  const validation = await validateComplaint(ctx, draft, { useAI: false });
  if (!validation.checks.ready) {
    throw new SubmissionError(422, "Your complaint needs a few changes before it can be submitted.", "validation_failed", { blocking: validation.checks.blocking });
  }

  const submission = await insertSubmission({
    case_id: ctx.c.id,
    user_id: ctx.userId,
    draft_id: draft.id,
    draft_version: draft.version,
    method: "guided_portal",
    channel_id: channelId,
    recipient: url,
    recipient_source: source,
    subject: draft.subject,
    body: draft.content,
    attachments: [],
    idempotency_key: input.idempotencyKey,
    status: "awaiting_user_confirmation",
    authorized_at: new Date().toISOString(),
    authorization_statement: portalAuthorizationStatement(url),
  });
  await audit(submission, "created", { method: "guided_portal", recipient_source: source });
  await caseEvent(ctx.c, "submission_authorized", `You started submitting complaint version ${draft.version} on ${url}`, { submission_id: submission.id });
  return { submission, replayed: false };
}

// ---------------------------------------------------------------------------
// User actions on an existing submission
// ---------------------------------------------------------------------------

export async function confirmSubmittedByUser(s: SubmissionRow, input: { reference: string | null; submittedOn: string }) {
  if (!["awaiting_user_confirmation", "unknown"].includes(s.status)) {
    throw new SubmissionError(400, "This submission can't be confirmed.", "invalid_state");
  }
  const updated = await update(
    s.id,
    { status: "confirmed_by_user", user_confirmed_at: new Date().toISOString(), user_reference: input.reference },
    { status: ["awaiting_user_confirmation", "unknown"] },
  );
  if (!updated) throw new SubmissionError(409, "This submission changed. Refresh and try again.", "conflict");
  await audit(s, "user_confirmed", { reference: input.reference, submitted_on: input.submittedOn });
  const c = await loadCase(s.case_id);
  const caseUpdate: Record<string, unknown> = {
    institution_submission_date: input.submittedOn,
    institution_submission_channel: s.method === "email" ? "email" : "website_form",
  };
  if (input.reference) caseUpdate.institution_reference = input.reference;
  if (c.status === "draft") caseUpdate.status = "submitted_to_institution";
  await createAdminClient().from("cases").update(caseUpdate).eq("id", c.id).eq("user_id", s.user_id);
  await caseEvent(
    c,
    "submission_confirmed_by_user",
    `You confirmed you submitted complaint version ${s.draft_version} ${s.method === "email" ? `by email to ${s.recipient}` : `on ${s.recipient}`} on ${formatDate(input.submittedOn)}${input.reference ? ` (reference ${input.reference})` : ""}`,
    { submission_id: s.id },
  );
  return updated;
}

export async function reportNotSent(s: SubmissionRow) {
  if (s.status !== "unknown") throw new SubmissionError(400, "Only an unconfirmed email can be marked as not sent.", "invalid_state");
  const updated = await update(s.id, { status: "failed", last_error: "You checked your Sent folder and the email isn't there." }, { status: ["unknown"] });
  await audit(s, "user_reported_not_sent");
  return updated ?? s;
}

export async function retrySubmission(s: SubmissionRow) {
  if (s.method !== "email" || s.status !== "failed") throw new SubmissionError(400, "Only a failed email can be retried.", "invalid_state");
  await audit(s, "retry_requested", { previous_error: s.last_error });
  return executeEmailSubmission(s.id);
}

export async function cancelSubmission(s: SubmissionRow) {
  if (!["queued", "failed", "awaiting_user_confirmation"].includes(s.status)) {
    throw new SubmissionError(400, "This submission can't be cancelled.", "invalid_state");
  }
  const updated = await update(s.id, { status: "cancelled" }, { status: ["queued", "failed", "awaiting_user_confirmation"] });
  if (!updated) throw new SubmissionError(409, "This submission changed. Refresh and try again.", "conflict");
  await audit(s, "cancelled");
  await caseEvent(await loadCase(s.case_id), "submission_cancelled", `You cancelled the submission to ${s.recipient}`, { submission_id: s.id });
  return updated;
}

// ---------------------------------------------------------------------------
// Reply monitoring
// ---------------------------------------------------------------------------

/** Reads the email thread of a sent submission and records any new replies. Returns how many were found. */
export async function checkForReplies(s: SubmissionRow): Promise<number> {
  if (s.method !== "email" || s.status !== "sent" || !s.provider_thread_id) {
    throw new SubmissionError(400, "Replies can only be checked for emails Resolve sent.", "invalid_state");
  }
  const connection = await getEmailConnection(s.user_id);
  if (!connection?.can_read_replies) {
    throw new SubmissionError(400, "Allow Resolve to check for replies (reconnect Gmail with that option ticked), or add the bank's reply yourself.", "read_scope_missing");
  }
  if (connection.email_address !== s.sender_address) {
    throw new SubmissionError(400, `This email was sent from ${s.sender_address}. Reconnect that Gmail account to check for replies.`, "sender_changed");
  }
  const { accessToken } = await getGmailAccess(s.user_id).catch((error) => {
    if (error instanceof EmailProviderError) throw new SubmissionError(400, error.message, error.code);
    throw error;
  });
  const thread = await getGmailThread(accessToken, s.provider_thread_id).catch((error) => {
    if (error instanceof EmailProviderError) throw new SubmissionError(502, error.message, error.code);
    throw error;
  });

  const admin = createAdminClient();
  const sentAt = s.sent_at ? new Date(s.sent_at).getTime() : 0;
  let found = 0;
  const c = await loadCase(s.case_id);
  for (const m of thread.messages ?? []) {
    if (m.id === s.provider_message_id) continue;
    const from = parseAddress(messageHeader(m, "From"));
    if (!from || from === s.sender_address?.toLowerCase()) continue; // the user's own messages
    const receivedAt = Number(m.internalDate);
    if (!Number.isFinite(receivedAt) || receivedAt < sentAt - 60_000) continue;
    const { data: existing } = await admin.from("bank_responses").select("id").eq("provider_message_id", m.id).maybeSingle();
    if (existing) continue;
    const body = stripQuotedReply(messageText(m)).slice(0, 20000) || "(The reply had no readable text. Open it in Gmail to see attachments.)";
    const { error } = await admin.from("bank_responses").insert({
      case_id: s.case_id,
      user_id: s.user_id,
      submission_id: s.id,
      source: "email_reply",
      received_at: new Date(receivedAt).toISOString(),
      from_address: from,
      subject: (messageHeader(m, "Subject") ?? "").slice(0, 500) || null,
      body_text: body,
      provider_message_id: m.id,
    });
    if (error) continue;
    found++;
    await audit(s, "reply_found", { provider_message_id: m.id, from });
    await caseEvent(c, "bank_response_received", `Reply received from ${from} on ${formatDate(new Date(receivedAt), { withTime: true })}`, {
      submission_id: s.id,
    });
  }
  await update(s.id, { last_checked_for_replies_at: new Date().toISOString() });
  await audit(s, "replies_checked", { found });
  return found;
}

// ---------------------------------------------------------------------------
// Background processing (called by the scheduled job)
// ---------------------------------------------------------------------------

export async function processPendingSubmissions(opts: { replyBatch?: number } = {}) {
  const admin = createAdminClient();
  const summary = { resumed: 0, reconciled: 0, repliesChecked: 0, repliesFound: 0, errors: 0 };

  // 1. Submissions stuck in "sending" (e.g. the server stopped mid-request) become "unknown".
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  const { data: stuck } = await admin.from("complaint_submissions").select("*").eq("status", "sending").lt("sending_started_at", staleBefore).limit(50);
  for (const s of (stuck ?? []) as SubmissionRow[]) {
    const moved = await update(s.id, { status: "unknown", last_error: "Sending was interrupted, so we can't tell whether the email was sent." }, { status: ["sending"] });
    if (moved) await audit(s, "outcome_unknown", { reason: "stale_sending" });
  }

  // 2. Try to resolve unknown outcomes from the mailbox.
  const { data: unknown } = await admin.from("complaint_submissions").select("id").eq("status", "unknown").limit(50);
  for (const { id } of (unknown ?? []) as { id: string }[]) {
    try {
      const r = await reconcileUnknownSubmission(id);
      if (r && r.status !== "unknown") summary.reconciled++;
    } catch {
      summary.errors++;
    }
  }

  // 3. Queued submissions whose request ended before sending.
  const { data: queued } = await admin
    .from("complaint_submissions")
    .select("id")
    .eq("status", "queued")
    .eq("method", "email")
    .lt("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(20);
  for (const { id } of (queued ?? []) as { id: string }[]) {
    try {
      await executeEmailSubmission(id);
      summary.resumed++;
    } catch {
      summary.errors++;
    }
  }

  // 4. Check for replies to recently sent emails (users who allowed it).
  const { data: sent } = await admin
    .from("complaint_submissions")
    .select("*")
    .eq("status", "sent")
    .eq("method", "email")
    .gte("sent_at", new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString())
    .or(`last_checked_for_replies_at.is.null,last_checked_for_replies_at.lt.${new Date(Date.now() - 6 * 3600 * 1000).toISOString()}`)
    .order("last_checked_for_replies_at", { ascending: true, nullsFirst: true })
    .limit(opts.replyBatch ?? 25);
  for (const s of (sent ?? []) as SubmissionRow[]) {
    const connection = await getEmailConnection(s.user_id).catch(() => null);
    if (!connection?.can_read_replies || connection.status !== "active" || connection.email_address !== s.sender_address) continue;
    try {
      summary.repliesFound += await checkForReplies(s);
      summary.repliesChecked++;
    } catch {
      summary.errors++;
    }
  }
  return summary;
}
