-- =============================================================================
-- Resolve: bank complaint submission, response tracking and AI tool audit
-- -----------------------------------------------------------------------------
-- New tables:
--   bank_contact_channels      Official complaint channels per bank (admin-curated,
--                              each with a source URL and verification status).
--   email_connections          A user's connected mailbox (e.g. Gmail), no secrets.
--   email_connection_secrets   Encrypted OAuth tokens. NO access for users at all;
--                              only the server (service role) can read them.
--   complaint_submissions      Every attempt to submit a complaint to a bank, with
--                              the user's authorisation and the provider's result.
--   submission_audit_log       Append-only log of everything that happened to a
--                              submission (written by the server only).
--   bank_responses             Replies from the bank (read from the mailbox or
--                              entered by the user) and their AI analysis.
--   ai_tool_runs               Audit of every AI-orchestration tool execution.
--
-- Integrity rules:
--   * Users can READ their submissions and audit log but cannot write them, so a
--     submission can only be marked "sent" by server code after the email
--     provider confirms it.
--   * The same approved complaint can't be sent twice to the same recipient
--     (unique index), and each request carries an idempotency key.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extend existing check constraints
-- -----------------------------------------------------------------------------

alter table public.case_events drop constraint case_events_event_type_check;
alter table public.case_events add constraint case_events_event_type_check check (event_type in (
  'case_created',
  'report_submitted',
  'case_updated',
  'status_changed',
  'evidence_uploaded',
  'evidence_removed',
  'evidence_extracted',
  'analysis_generated',
  'analysis_reviewed',
  'ai_suggestion_accepted',
  'follow_up_answered',
  'complaint_generated',
  'complaint_edited',
  'complaint_approved',
  'complaint_exported',
  'institution_submission_recorded',
  'institution_response_recorded',
  'follow_up_scheduled',
  'resolution_recorded',
  'note_added',
  -- New in this migration
  'submission_authorized',
  'submission_sent',
  'submission_failed',
  'submission_outcome_unknown',
  'submission_confirmed_by_user',
  'submission_cancelled',
  'bank_response_received',
  'bank_response_analyzed',
  'recovery_plan_generated'
));

alter table public.ai_usage_events drop constraint ai_usage_events_kind_check;
alter table public.ai_usage_events add constraint ai_usage_events_kind_check check (kind in (
  'case_analysis', 'evidence_extraction', 'complaint_generation',
  'complaint_review', 'response_analysis', 'recovery_plan'
));

create or replace function public.consume_ai_quota(
  p_kind text,
  p_limit_per_hour integer,
  p_limit_per_minute integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hour_count integer;
  minute_count integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('case_analysis', 'evidence_extraction', 'complaint_generation',
                    'complaint_review', 'response_analysis', 'recovery_plan') then
    raise exception 'invalid usage kind';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || uid::text));

  select count(*) into hour_count from public.ai_usage_events
    where user_id = uid and created_at > now() - interval '1 hour';
  select count(*) into minute_count from public.ai_usage_events
    where user_id = uid and created_at > now() - interval '1 minute';

  if hour_count >= greatest(p_limit_per_hour, 1) or minute_count >= greatest(p_limit_per_minute, 1) then
    return false;
  end if;

  insert into public.ai_usage_events (user_id, kind) values (uid, p_kind);
  delete from public.ai_usage_events where user_id = uid and created_at < now() - interval '2 days';
  return true;
end;
$$;

revoke all on function public.consume_ai_quota(text, integer, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- bank_contact_channels (reference data, admin-curated)
-- -----------------------------------------------------------------------------

create table public.bank_contact_channels (
  id uuid primary key default gen_random_uuid(),
  -- Matches an id in src/lib/banks.ts (e.g. 'zenith', 'gtbank').
  bank_id text not null check (bank_id ~ '^[a-z0-9-]{2,40}$'),
  bank_name text not null check (char_length(bank_name) between 2 and 160),
  channel_type text not null check (channel_type in ('email', 'web_portal', 'api', 'phone')),
  -- Email address, https URL, API base URL or phone number.
  value text not null check (char_length(value) between 3 and 500),
  label text not null check (char_length(label) between 2 and 160),
  purpose text not null default 'complaints' check (purpose in ('complaints', 'customer_care', 'escalation')),
  -- Where this channel is published by the bank (must be an https page).
  source_url text not null check (source_url ~ '^https://'),
  status text not null default 'unverified' check (status in ('verified', 'unverified', 'outdated', 'archived')),
  verified_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_channels_verified_requires_date check (status <> 'verified' or verified_at is not null),
  constraint bank_channels_email_format check (
    channel_type <> 'email' or value ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ),
  constraint bank_channels_url_format check (
    channel_type not in ('web_portal', 'api') or value ~ '^https://'
  ),
  unique (bank_id, channel_type, value)
);

create index bank_channels_lookup_idx on public.bank_contact_channels (bank_id, status);

create trigger bank_contact_channels_set_updated_at
  before update on public.bank_contact_channels
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- email_connections + email_connection_secrets
-- -----------------------------------------------------------------------------

create table public.email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('gmail')),
  email_address text not null check (char_length(email_address) between 3 and 320),
  scopes text[] not null default '{}',
  -- True when the user also allowed Resolve to read replies in the threads it sends.
  can_read_replies boolean not null default false,
  status text not null default 'active' check (status in ('active', 'reauthorization_required')),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create trigger email_connections_set_updated_at
  before update on public.email_connections
  for each row execute function public.set_updated_at();

create table public.email_connection_secrets (
  connection_id uuid primary key references public.email_connections (id) on delete cascade,
  -- AES-256-GCM encrypted with EMAIL_TOKEN_ENCRYPTION_KEY (never stored in plain text).
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger email_connection_secrets_set_updated_at
  before update on public.email_connection_secrets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- complaint_submissions
-- -----------------------------------------------------------------------------

create table public.complaint_submissions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid references public.complaint_drafts (id) on delete set null,
  draft_version integer not null check (draft_version >= 1),
  -- email          = sent from the user's own connected mailbox
  -- guided_portal  = the user submits on the bank's website with Resolve's help
  -- api            = a direct integration offered officially by the bank
  method text not null check (method in ('email', 'guided_portal', 'api')),
  channel_id uuid references public.bank_contact_channels (id) on delete set null,
  recipient text not null check (char_length(recipient) between 3 and 500),
  recipient_source text not null check (recipient_source in ('verified_directory', 'unverified_directory', 'user_provided')),
  subject text not null check (char_length(subject) between 1 and 300),
  body text not null check (char_length(body) between 1 and 20000),
  -- [{ "kind": "complaint_pdf" | "evidence", "filename": text, "evidence_id": uuid|null, "size": int }]
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  status text not null default 'queued' check (status in (
    'queued', 'sending', 'sent', 'failed', 'unknown',
    'awaiting_user_confirmation', 'confirmed_by_user', 'cancelled'
  )),
  -- Exactly what the user agreed to, and when.
  authorized_at timestamptz not null,
  authorization_statement text not null check (char_length(authorization_statement) between 10 and 2000),
  provider text check (provider is null or provider in ('gmail')),
  sender_address text,
  -- RFC 5322 Message-ID set by Resolve, used to detect whether an uncertain send went through.
  message_id_header text unique,
  provider_message_id text,
  provider_thread_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sending_started_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  sent_at timestamptz,
  user_confirmed_at timestamptz,
  user_reference text check (user_reference is null or char_length(user_reference) <= 120),
  last_checked_for_replies_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint submissions_sent_has_provider_proof check (
    status <> 'sent' or (provider_message_id is not null and sent_at is not null)
  ),
  constraint submissions_email_has_sender check (method <> 'email' or status in ('queued', 'cancelled') or sender_address is not null)
);

-- The same complaint version can't be live twice for the same recipient.
create unique index complaint_submissions_no_duplicates on public.complaint_submissions (draft_id, method, lower(recipient))
  where status in ('queued', 'sending', 'sent', 'unknown', 'awaiting_user_confirmation', 'confirmed_by_user');
create index complaint_submissions_case_idx on public.complaint_submissions (case_id, created_at desc);
create index complaint_submissions_user_idx on public.complaint_submissions (user_id, created_at desc);
create index complaint_submissions_reply_check_idx on public.complaint_submissions (status, last_checked_for_replies_at)
  where status = 'sent';

create trigger complaint_submissions_set_updated_at
  before update on public.complaint_submissions
  for each row execute function public.set_updated_at();

-- A submission always belongs to the same user as its case and draft.
create or replace function public.check_submission_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cases c where c.id = new.case_id and c.user_id = new.user_id) then
    raise exception 'case does not belong to this user';
  end if;
  if new.draft_id is not null and not exists (
    select 1 from public.complaint_drafts d where d.id = new.draft_id and d.case_id = new.case_id and d.user_id = new.user_id
  ) then
    raise exception 'complaint does not belong to this case';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.case_id <> old.case_id) then
    raise exception 'ownership cannot be changed';
  end if;
  return new;
end;
$$;

create trigger complaint_submissions_check_ownership
  before insert or update on public.complaint_submissions
  for each row execute function public.check_submission_ownership();

-- -----------------------------------------------------------------------------
-- submission_audit_log (append-only, server-written)
-- -----------------------------------------------------------------------------

create table public.submission_audit_log (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.complaint_submissions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in (
    'created', 'authorized', 'send_started', 'provider_accepted', 'provider_rejected',
    'outcome_unknown', 'reconciled', 'retry_requested', 'user_confirmed', 'user_reported_not_sent',
    'cancelled', 'replies_checked', 'reply_found'
  )),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);

create index submission_audit_log_submission_idx on public.submission_audit_log (submission_id, created_at);

-- -----------------------------------------------------------------------------
-- bank_responses
-- -----------------------------------------------------------------------------

create table public.bank_responses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid references public.complaint_submissions (id) on delete set null,
  source text not null check (source in ('email_reply', 'user_entered')),
  received_at timestamptz not null,
  from_address text check (from_address is null or char_length(from_address) <= 320),
  subject text check (subject is null or char_length(subject) <= 500),
  body_text text not null check (char_length(body_text) between 1 and 20000),
  provider_message_id text unique,
  analysis jsonb check (analysis is null or jsonb_typeof(analysis) = 'object'),
  analysis_model text check (analysis_model is null or char_length(analysis_model) <= 120),
  analyzed_at timestamptz,
  user_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index bank_responses_case_idx on public.bank_responses (case_id, received_at desc);
create index bank_responses_user_idx on public.bank_responses (user_id);

-- -----------------------------------------------------------------------------
-- ai_tool_runs (audit of the AI orchestration layer)
-- -----------------------------------------------------------------------------

create table public.ai_tool_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  case_id uuid references public.cases (id) on delete cascade,
  tool text not null check (tool in (
    'identify_bank', 'discover_complaint_channels', 'generate_complaint', 'validate_complaint',
    'prepare_email', 'analyze_bank_response', 'recommend_recovery'
  )),
  status text not null check (status in ('succeeded', 'failed')),
  model text check (model is null or char_length(model) <= 120),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  output jsonb check (output is null or jsonb_typeof(output) = 'object'),
  error_code text check (error_code is null or char_length(error_code) <= 60),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index ai_tool_runs_case_idx on public.ai_tool_runs (case_id, tool, created_at desc);
create index ai_tool_runs_user_idx on public.ai_tool_runs (user_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.bank_contact_channels enable row level security;
alter table public.email_connections enable row level security;
alter table public.email_connection_secrets enable row level security;
alter table public.complaint_submissions enable row level security;
alter table public.submission_audit_log enable row level security;
alter table public.bank_responses enable row level security;
alter table public.ai_tool_runs enable row level security;

-- bank_contact_channels: signed-in users read non-archived; admins manage.
create policy "bank_channels_read" on public.bank_contact_channels
  for select to authenticated using (status <> 'archived' or public.is_admin());
create policy "bank_channels_admin_insert" on public.bank_contact_channels
  for insert to authenticated with check (public.is_admin());
create policy "bank_channels_admin_update" on public.bank_contact_channels
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "bank_channels_admin_delete" on public.bank_contact_channels
  for delete to authenticated using (public.is_admin());

-- email_connections: users see and can remove (disconnect) their own.
-- Creating/updating connections happens on the server after OAuth.
create policy "email_connections_select_own" on public.email_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "email_connections_delete_own" on public.email_connections
  for delete to authenticated using (user_id = (select auth.uid()));

-- email_connection_secrets: deliberately NO policies — users can never read tokens.

-- complaint_submissions / audit log: read-only for the owner.
create policy "complaint_submissions_select_own" on public.complaint_submissions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "submission_audit_log_select_own" on public.submission_audit_log
  for select to authenticated using (user_id = (select auth.uid()));

-- bank_responses: owner reads; owner may add responses they received
-- themselves and store AI analysis / review of their own responses.
create policy "bank_responses_select_own" on public.bank_responses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "bank_responses_insert_own" on public.bank_responses
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.owns_case(case_id)
    and source = 'user_entered' and provider_message_id is null and submission_id is null
  );
create policy "bank_responses_update_own" on public.bank_responses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));
create policy "bank_responses_delete_own" on public.bank_responses
  for delete to authenticated using (user_id = (select auth.uid()) and source = 'user_entered');

-- ai_tool_runs: owner reads and records runs of their own cases.
create policy "ai_tool_runs_select_own" on public.ai_tool_runs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ai_tool_runs_insert_own" on public.ai_tool_runs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (case_id is null or public.owns_case(case_id)));

-- -----------------------------------------------------------------------------
-- Table privileges
-- -----------------------------------------------------------------------------

revoke all on public.bank_contact_channels, public.email_connections, public.email_connection_secrets,
  public.complaint_submissions, public.submission_audit_log, public.bank_responses, public.ai_tool_runs
  from anon, authenticated;

grant select, insert, update, delete on public.bank_contact_channels to authenticated;
grant select, delete on public.email_connections to authenticated;
grant select on public.complaint_submissions to authenticated;
grant select on public.submission_audit_log to authenticated;
grant select, delete on public.bank_responses to authenticated;
grant insert (case_id, user_id, source, received_at, from_address, subject, body_text) on public.bank_responses to authenticated;
grant update (analysis, analysis_model, analyzed_at, user_reviewed_at) on public.bank_responses to authenticated;
grant select, insert on public.ai_tool_runs to authenticated;

-- The server (service role) does everything else.
grant all on public.bank_contact_channels, public.email_connections, public.email_connection_secrets,
  public.complaint_submissions, public.submission_audit_log, public.bank_responses, public.ai_tool_runs
  to service_role;
grant usage, select on sequence public.submission_audit_log_id_seq to service_role;
