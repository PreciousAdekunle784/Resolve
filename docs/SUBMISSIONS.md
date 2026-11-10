# Bank complaint submission and recovery tracking

This document explains how Resolve takes a user from an approved complaint to a
real, authorised submission to their bank, and then tracks the bank's response.
It also lists what needs extra credentials, partnerships or infrastructure.

> Resolve never controls the bank's decision. It sends what the user approves,
> records exactly what happened, and helps the user understand replies and plan
> next steps. It never promises a refund.

---

## 1. The user's journey

On a case, the **Submit to bank** tab walks the user through five steps:

1. **Approved complaint.** Only the latest approved version can be submitted.
   Editing it or creating a new version removes the approval, so the user
   approves again before submitting.
2. **How and where.**
   - *Email from my Gmail.* Resolve sends the complaint from the user's own
     Gmail account, so the bank's replies come straight to them.
   - *On the institution's website (guided).* Resolve opens the bank's official
     complaint page and gives copy buttons for the subject, the letter and the
     user's details. The user submits it themselves, including any login,
     CAPTCHA or one-time code.

   Recipients come only from the **bank contact directory** (curated by an
   administrator, each with a source link and a verification status) or are
   typed by the user. For any address that isn't marked verified, the user must
   confirm they got it from the bank's official website, app or statement.
3. **Final check.** These deterministic checks always run, and they are the
   only checks that can block a submission:
   - the complaint is approved
   - there are no `[ADD: …]` placeholders
   - there's a subject line
   - there are no PINs, OTPs, passwords, BVN/NIN or full card numbers

   Warnings (missing amount, date or reference, details not found in the case)
   don't block. An optional **AI review** gives advisory suggestions, labelled
   "AI interpretation".
4. **Send from your Gmail.** Connect Gmail (once), choose which evidence files
   to attach (the complaint PDF is always attached), and preview the exact
   email.
5. **Authorise.** The user ticks a plain-language authorisation statement that
   names the sending account and the recipient. That exact text and the time
   are stored on the submission.

Afterwards the tab shows:

- **Submission history:** every attempt with its true status, Gmail message ID,
  attachments and an activity log.
- **Replies from your institution:** replies found in the Gmail thread, or
  pasted by the user, with an optional AI explanation.
- **Next required action** (always shown, no AI) and an optional AI
  **recovery plan**.

The overview's "Next step" card uses the same next-action logic.

## 2. Submission statuses (what users see)

| Status | Meaning |
| --- | --- |
| Sent | Gmail returned a message ID. The database refuses `sent` without one. |
| Not sent | Gmail refused it, or it failed before sending. Safe to retry. |
| Not confirmed | The connection broke and we can't tell whether it was sent. Resolve never resends automatically; see §4. |
| Waiting for you | Guided website submission started. The user submits it, then confirms. |
| Submitted | The user confirmed a website submission (with an optional bank reference). |
| Cancelled | Cancelled by the user. |

## 3. Architecture

```
UI (src/app/(app)/cases/[id]/submit/*)
  │  fetch
  ▼
API routes
  /api/cases/[id]/submissions        create (email | guided_portal)
  /api/cases/[id]/submission-check   validate_complaint tool
  /api/submissions/[id]              retry | cancel | reconcile | report_not_sent | confirm_submitted | check_replies
  /api/cases/[id]/responses          add a reply received elsewhere
  /api/responses/[id]                analyze | apply_status | mark_reviewed, DELETE
  /api/cases/[id]/recovery-plan      recommend_recovery tool
  /api/integrations/gmail/*          connect | callback | disconnect
  /api/cron/submissions              background job (Vercel Cron)
  │
  ▼
src/lib/orchestrator   AI orchestration layer (typed tools, audited in ai_tool_runs)
src/lib/submissions    engine (state machine, idempotency, reconciliation), adapters, labels, next action
src/lib/email          Google OAuth + Gmail client, MIME builder, AES-GCM token encryption
```

### AI orchestration tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `identify_bank` | Deterministic | Matches the institution name to Resolve's bank directory. |
| `discover_complaint_channels` | Deterministic | Looks up that bank's channels (verified first). **The AI never chooses or invents a recipient.** |
| `generate_complaint` | AI | Existing complaint writer (now audited). |
| `validate_complaint` | Deterministic + optional AI | Blocking checks, warnings, and advisory AI review. |
| `prepare_email` | Deterministic | Builds the email from the exact approved text, checks attachments belong to the case and stay under 15 MB. |
| `analyze_bank_response` | AI | Classifies a reply and pulls out references, requested information and timeframes. Anything the AI "quotes" that isn't actually in the reply is removed. |
| `recommend_recovery` | AI | Ordered next actions and escalation advice. It may only cite guidance IDs Resolve provided, and may not state deadlines unless they're in *verified* guidance. |

The workflow decides which tool runs. The model only ever fills in structured
outputs (validated with Zod). It uses the existing provider layer (Gemini on
your deployment), server-side only.

### Database (`supabase/migrations/20261110000004_bank_submissions.sql`)

| Table | Who can do what |
| --- | --- |
| `bank_contact_channels` | Signed-in users read; admins manage. Email/URL format checks; "verified" requires a date. |
| `email_connections` | Owner reads and can delete (disconnect). Created only by the server after OAuth. |
| `email_connection_secrets` | **No user access at all.** AES-256-GCM encrypted refresh/access tokens; server (service role) only. |
| `complaint_submissions` | Owner reads only. Written by the server, so users can't fake "sent". |
| `submission_audit_log` | Owner reads only; append-only. |
| `bank_responses` | Owner reads; owner may add replies they received (`user_entered`) and store analysis; mailbox replies are server-written. |
| `ai_tool_runs` | Owner reads and records runs on their own cases. |

Integrity rules enforced by the database:

- No duplicate live submission of the same complaint version to the same
  recipient (case-insensitive unique index).
- Unique `(user_id, idempotency_key)`.
- `sent` requires a provider message ID and a sent time.
- A submission must belong to the same user as its case and complaint
  (trigger).
- Ownership can't change.

New timeline events: `submission_authorized`, `submission_sent`,
`submission_failed`, `submission_outcome_unknown`,
`submission_confirmed_by_user`, `submission_cancelled`,
`bank_response_received`, `bank_response_analyzed`, `recovery_plan_generated`.
New AI quota kinds: `complaint_review`, `response_analysis`, `recovery_plan`.

## 4. Preventing duplicate or phantom submissions

1. **Idempotency key.** Every create request carries one. Replaying it returns
   the original submission instead of sending again.
2. **Unique index.** The same complaint version can't be live twice for the
   same recipient.
3. **Atomic claim.** A row moves `queued|failed → sending` only if its status
   and attempt count are unchanged, so two requests (or the background job)
   can't both send it.
4. **Honest uncertainty.** Each email carries a Resolve-generated `Message-ID`.
   If Gmail's answer is lost (timeout, dropped connection, 5xx), the submission
   becomes **Not confirmed**:
   - If the user allowed reply checking (read-only scope), Resolve searches
     their mailbox for that Message-ID. If found, it's marked **Sent**. If it's
     still not there two minutes after the attempt, it's marked **Not sent**.
   - Otherwise the user checks their Sent folder and tells Resolve "It was
     sent" or "It's not there".
5. **Rate limit.** 10 complaint emails per user per 24 hours.

## 5. Gmail integration

- OAuth 2.0 authorisation-code flow with **PKCE** and an encrypted,
  user-bound, 10-minute `state` cookie.
- Scopes:
  - `gmail.send` (required)
  - `gmail.readonly` (optional, only if the user ticks "check for replies").
    Resolve only opens threads of emails it sent.
- Refresh tokens are encrypted with `EMAIL_TOKEN_ENCRYPTION_KEY` and stored in
  `email_connection_secrets`. Access tokens are refreshed automatically. A
  revoked or expired grant marks the connection "needs reconnecting".
- Disconnecting (or deleting the account) revokes the token at Google and
  deletes it.
- Messages are sent with the Gmail API media upload (`message/rfc822`, up to
  ~25 MB). Header injection is impossible: header values can't contain line
  breaks.

### Set it up (one time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a
   project (or use an existing one).
2. Go to **APIs & Services → Library**, search for **Gmail API** and click
   **Enable**.
3. Go to **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - App name "Resolve", your support email, and your app domain and privacy
     policy link (`https://<your-site>/privacy`).
   - **Data access / Scopes:** add `.../auth/gmail.send` and
     `.../auth/gmail.readonly`.
   - **Audience:** while the app is in *Testing*, add each Google account that
     will try it as a **test user** (up to 100).
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client
   ID**:
   - Type: **Web application**.
   - Authorised redirect URI: `https://<your-site>/api/integrations/gmail/callback`
     (for local development, also add
     `http://localhost:3000/api/integrations/gmail/callback`).
5. Copy the **Client ID** and **Client secret** into Vercel (Project →
   Settings → Environment Variables) as `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET`.
6. Add `EMAIL_TOKEN_ENCRYPTION_KEY`. Generate a value with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

7. Add `CRON_SECRET` (any long random string). `SUPABASE_SECRET_KEY` must
   already be set.
8. In Supabase **SQL Editor**, run
   `supabase/migrations/20261110000004_bank_submissions.sql` once. New
   projects can run `supabase/setup.sql`, which includes it.
9. Redeploy.

> **Going public.** `gmail.send` is a *sensitive* scope and `gmail.readonly` is
> a *restricted* scope. Before anyone outside your test-user list can connect,
> Google must verify the app:
> - a privacy policy, a demo video and a justification of the scopes
> - for `gmail.readonly`, an annual third-party security assessment (CASA)
>
> Until then, either keep the app in Testing mode or remove the read scope.
> Without it, the "check for replies" option simply isn't offered: users add
> replies themselves.

### Background job

`vercel.json` schedules `GET /api/cron/submissions` daily at 06:17 UTC. That's
the most often the Vercel Hobby plan allows; increase it on Pro. Vercel sends
`Authorization: Bearer $CRON_SECRET`. Each run:

- marks submissions stuck in "sending" for 10+ minutes as "Not confirmed"
- reconciles unconfirmed sends by Message-ID
- resumes queued sends whose request ended early
- checks threads of sent emails (last 120 days, not checked in the past 6 hours)
  for new replies

Users can also click **Check for replies** at any time.

## 6. Direct bank APIs (pathway A)

`src/lib/submissions/adapters.ts` defines a `BankApiAdapter` interface and an
**empty** registry. No Nigerian bank currently publishes a complaint-submission
API for third parties, and Resolve doesn't imitate or scrape private bank
endpoints.

To add one, you need a formal partnership and credentials issued by the bank.
Then implement `submit()` so it returns the bank's own complaint reference,
which counts as the proof of submission.

## 7. Browser automation for bank portals (pathway C)

Complaint portals use logins, CAPTCHAs and one-time codes, which must stay with
the user, and they can't run inside Vercel serverless functions. Resolve
therefore ships the **guided** mode, which needs no infrastructure, and a
`PortalAutomationProvider` interface for a future worker.

A worker deployment needs:

- A long-running container (e.g. Fly.io, Railway, Cloud Run) with Playwright
  and Chromium, reachable at `PORTAL_AUTOMATION_URL`, and authenticated with a
  shared secret or mTLS.
- Per-bank scripts that fill in public form fields only. The job pauses in a
  `needs_user` state and streams the page to the user (e.g. a remote browser
  view) for any login, CAPTCHA or OTP step. It must never receive the user's
  banking credentials.
- The bank's confirmation reference captured as proof of submission.
- Each bank's terms of use checked before automating its site.

## 8. Testing

- **Unit:** MIME builder (encoding, attachments, header-injection refusal),
  token encryption, complaint checks (including no false card-number matches on
  emails or `+234` phone numbers), reply and recovery grounding, next-action
  logic.
- **Database security** (`tests/db/submissions.test.ts`): token secrecy, users
  can't create or alter submissions, provider proof required for "sent",
  duplicate and idempotency constraints, cross-user ownership, audit log,
  replies, AI tool runs.
- **End-to-end** (`tests/e2e/submission.spec.ts`), run against a local
  emulator of Google OAuth and the Gmail API (`tests/e2e/mock-google.mjs`) that
  checks client credentials, PKCE, scopes and bearer tokens:
  - admin channel curation
  - declined and successful OAuth
  - authorised send, with the email's From, To, subject, body and both
    attachments checked
  - duplicate refusal and idempotent replay
  - rejected sends with retry
  - a dropped connection reconciled by Message-ID
  - a server error then "It's not there" and retry
  - reply detection and AI explanation, with fabricated details removed
  - applying a status, adding a reply by hand, the scheduled job
  - the recovery plan
  - guided portal confirmation
  - phone-width layout
  - other users blocked from every endpoint
  - re-approval after a new version, and disconnecting

The emulator stands in for Google only in tests. A real end-to-end run needs
your OAuth client (§5) and a Google account listed as a test user.
