# Architecture

## Request flow

```
Browser ──► Next.js (Vercel)
             ├─ src/proxy.ts            refreshes the Supabase session cookie; redirects signed-out users away from app pages
             ├─ Server Components       read data AS THE USER (publishable key + user JWT) → Supabase PostgREST → RLS
             ├─ Server Actions          validate with Zod → write as the user → RLS → case_events
             └─ Route Handlers (/api)   uploads, signed URLs, AI, PDF, export
                    ├─ Supabase Storage (private "evidence" bucket, storage RLS)
                    └─ AI provider (src/lib/ai) ──► Anthropic Messages API (structured outputs)
```

All data access uses the signed-in user's own session, so Row Level Security is always in force. The service-role (secret) key is used in exactly one place: permanent account deletion.

## Evidence upload

1. Browser → `POST /api/cases/:id/evidence/upload-url` with name, type and size. The server validates them and checks case ownership and the file limit, then returns a one-time signed upload URL for `<uid>/<caseId>/<uuid>.<ext>`.
2. Browser uploads directly to Supabase Storage (XHR, with progress). The bucket enforces size and type, and storage RLS enforces the folder.
3. Browser → `POST /api/cases/:id/evidence`. The server downloads the object, checks its magic bytes and size, deletes it if invalid, and otherwise inserts the `evidence` row and an event.
4. Viewing: `GET /api/evidence/:id/url` returns a 5-minute signed URL.

## AI pipeline

`src/lib/ai/` contains:

- `provider.ts`: the provider-neutral interface (`generateStructured(system, content, zodSchema)`).
- `anthropic.ts`: the Claude implementation (structured outputs via `betaZodOutputFormat`, server-side refusal fallback, error mapping, a second Zod validation).
- `gemini.ts`: the Google Gemini implementation (JSON output with the task's JSON Schema, plus a plain-JSON retry if the schema is rejected; images and PDFs sent inline; error mapping; Zod validation).
- `provider-info.ts`: describes the active provider so consent text accurately says where data goes.
- `schemas.ts`: Zod schemas for evidence extraction, case analysis and complaint drafts.
- `prompts.ts`: system prompts encoding the responsible-AI rules.
- `grounding.ts`: deterministic checks applied to every result before it is saved.
- `service.ts`: orchestration, consent and rate-limit checks.

Case analysis steps:

1. Each unread evidence file is read (up to 3 at a time). The result is stored as an `evidence_extraction` row and the file's `extraction_status` is updated.
2. Relevant guidance is retrieved.
3. The analysis call receives the user's facts, the extractions and the guidance.
4. Grounding: a fact claimed as user-provided or document-extracted must actually appear in that source, or it is downgraded to *Unverified*. AI-"inferred" references, amounts and dates are always unverified. Invented guidance IDs are removed.
5. The result is saved to `ai_analyses` and an event is recorded. The user reviews it, confirms or rejects document facts (which updates the case record), answers questions and marks it reviewed.

If AI is unavailable (no key, no consent, rate limit, provider error or timeout), the user sees a clear message with a retry option. Nothing they entered is lost, and the template complaint works without AI.

To switch AI providers, set `AI_PROVIDER` (`gemini` or `anthropic`). To add another, implement `AIProvider` and select it in `getAIProvider()`.

## Case lifecycle

- `intake_status`: `in_progress` (wizard draft, saved after every step) → `complete` (reviewed and submitted). It can't go back.
- `status`: `draft` → `submitted_to_institution` → `awaiting_institution_response` / `additional_information_required` / `ready_for_escalation` / `escalated_by_user` → `resolved` / `closed`. Every change creates a `status_changed` event through a database trigger. Resolution needs an explicit outcome from the user. Nothing is closed automatically.

## Database

See `supabase/migrations/20261108000001_initial_schema.sql`. Tables: `profiles`, `cases`, `evidence`, `case_events`, `ai_analyses`, `complaint_drafts`, `guidance_sources`, plus `ai_usage_events` (rate limiting). All have RLS, foreign keys with `on delete cascade` to the auth user, CHECK constraints for enums and lengths, and indexes for the dashboard queries.
