# Security and privacy design

This document explains how Resolve protects user data and where the limits are.

## Threat model (summary)

| Risk | Protection |
| --- | --- |
| A user reads or changes another user's cases, evidence, analyses, drafts or history | Row Level Security (RLS) on every table (`user_id = auth.uid()`). Child tables also check case ownership through `owns_case()`. Server code filters by `user_id` too (defence in depth). Covered by `tests/db/rls.test.ts` and the E2E isolation test |
| Private evidence is exposed | `evidence` bucket is private, so there are no public URLs. Storage policies only allow `<user_id>/<case_id>/…` paths for the owner and that user's own cases. Viewing uses 5-minute signed URLs |
| Malicious or disguised uploads | Declared type, extension and size are checked before an upload URL is issued. After upload, the server reads the file's magic bytes, rejects anything that isn't a real PNG/JPEG/PDF and deletes it. The bucket also enforces the size and MIME limits. There is a maximum of 10 files per case (database trigger) |
| Case history is rewritten | `case_events` has no UPDATE/DELETE grants or policies, so it is append-only. Status changes are logged by a database trigger |
| Ownership or case number tampering | Trigger blocks changes to `user_id`, `case_number`, `created_at`. Users can't edit `profiles.email` (column grants) |
| Fake "official" guidance | Only admins (`app_metadata.role = 'admin'`, settable only with the service key) can write guidance. A verified record needs a verification date (CHECK constraint) |
| Secrets leak to the browser | Settings are read on the server at runtime. The only value the server passes to the browser is the publishable key (for evidence uploads), which is designed to be public and is protected by RLS. A secret key placed in the publishable-key setting is detected and refused. The secret key is only used through `src/lib/supabase/admin.ts` (marked `server-only`) for account deletion, Gmail token storage and recording provider-confirmed submission results. The AI key is only used in `src/lib/ai/` (server-only) |
| AI abuse / cost | Per-user limits (10/hour by default, 3/minute) enforced atomically in the database (`consume_ai_quota`). Consent is required. Inputs are bounded (10 files, 10 MB each, text length limits) |
| Prompt injection via descriptions or documents | User content is wrapped in `<case_data>`/`<document>` tags and the system prompt says to treat it as data. Output is schema-constrained, then grounding-checked: facts not found in the user's input or in document text are marked *Unverified*, and unknown guidance IDs are removed |
| AI fabrication in complaints | Complaints are generated only from confirmed case facts. Missing details become `[ADD: …]` placeholders, and drafts can't be approved while any remain. References and amounts not found in the case facts are flagged before approval. The user must approve every draft |
| Open redirects | `next` parameters must be same-site relative paths (`safeNextPath`) |
| Cross-site requests to JSON APIs | Same-origin `Origin` check on state-changing API routes, on top of SameSite auth cookies. Server actions have Next.js's built-in origin protection |
| Clickjacking / sniffing | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, strict referrer policy, restrictive Permissions-Policy |
| A complaint is sent without consent, twice, or to the wrong place | Explicit authorisation statement stored on every submission. Idempotency key plus a unique index on (complaint version, recipient). An atomic "claim" before sending. Recipients come only from the admin-curated directory or the user, never from AI. Unverified addresses need the user's confirmation. 10 emails per user per day. See `docs/SUBMISSIONS.md` |
| A submission is shown as "sent" when it wasn't | Users can't write `complaint_submissions` (read-only grants). The server marks "sent" only with Gmail's message ID, enforced by a CHECK constraint. Uncertain outcomes become "Not confirmed" and are reconciled by Message-ID, never resent blindly |
| Gmail tokens leak | OAuth with PKCE and an encrypted, user-bound state cookie. Tokens are AES-256-GCM encrypted (`EMAIL_TOKEN_ENCRYPTION_KEY`) in `email_connection_secrets`, which has RLS on and no policies or grants for users. Only the server's service-role client reads them. Revoked on disconnect and on account deletion |
| Email header injection | The MIME builder refuses line breaks in any header value and validates addresses (`src/lib/email/mime.ts`) |
| Background job abuse | `/api/cron/submissions` requires `Authorization: Bearer $CRON_SECRET` (constant-time comparison) |
| Account enumeration | Password reset always shows the same message. Sign-up relies on Supabase's identical responses |

## Data minimisation

- Resolve never asks for BVN, NIN, PINs, OTPs, internet banking passwords or full card numbers.
- Free-text fields reject text that looks like a PIN/OTP/password disclosure, a BVN/NIN, or a Luhn-valid card number. Reference fields accept long numeric session IDs.
- Users are told to cover sensitive details before uploading documents. The AI flags when it sees them.
- AI usage rows are kept for 2 days (rate limiting only).

## User rights

- **Export:** Settings → *Download PDF Statement* (account details, every reported transaction, totals and case activity).
- **Correction:** every profile and case field can be edited. Changes are logged.
- **Deletion:** delete a case (removes its files and records), or delete the account. Account deletion removes every storage object in the user's folder, then deletes the auth user, which cascades to all rows.
- **AI consent:** opt in at onboarding or in Settings. Withdraw at any time.

## AI provider

Case details and evidence are sent to the configured AI provider only when the user has consented and asks for an analysis or AI draft. Resolve itself does not use user data to train models.

- **Anthropic** (`AI_PROVIDER=anthropic`): not used for training under Anthropic's commercial terms.
- **Google Gemini free tier** (`AI_PROVIDER=gemini`): Google's terms allow free-tier content to be used to improve its products, and human reviewers may read it. The consent text at onboarding, in Settings and in the privacy notice says this automatically (`src/lib/ai/provider-info.ts`). Use the free tier for demos and testing with non-sensitive data. For real users, enable billing (then set `GEMINI_PAID_TIER=true`) or use a provider whose terms exclude training.

Check the provider's current data-handling terms and complete a transfer-impact assessment for cross-border processing under the NDPA before launch.

## Known limitations / before launch

- No legal review yet. The privacy notice and terms are drafts.
- Email confirmation and password reset use Supabase's mailer. Configure a production SMTP provider.
- An interrupted upload (file uploaded, but the browser closed before it was verified) leaves an orphan object in the user's private folder. It is not accessible to others and is removed when the account is deleted. A scheduled cleanup job is a recommended next step.
- Consider adding a Content Security Policy once the final domains are known.
- Gmail: `gmail.send` (sensitive) and `gmail.readonly` (restricted) need Google's app verification before public launch, and `gmail.readonly` also needs an annual CASA security assessment. Until then, only test users listed in the Google Cloud project can connect.
- Bank contact channels start empty. An administrator must add and verify each bank's official complaint address before users see "Verified" channels.
- Rate limiting covers AI endpoints. Supabase applies its own limits to auth endpoints.
