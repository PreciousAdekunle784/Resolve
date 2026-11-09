-- =============================================================================
-- Resolve: complete Supabase setup (all migrations in one file)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Run it ONCE on a new project. (Generated from supabase/migrations/.)
-- =============================================================================


-- >>> supabase/migrations/20261108000001_initial_schema.sql
-- =============================================================================
-- Resolve: initial database schema
-- -----------------------------------------------------------------------------
-- Tables: profiles, cases, evidence, case_events, ai_analyses,
--         complaint_drafts, guidance_sources, ai_usage_events
--
-- Security model:
--   * Row Level Security (RLS) is enabled on every table.
--   * Users can only read/write rows that belong to them (user_id = auth.uid()).
--   * case_events are append-only for users (no update/delete policies), so the
--     case history cannot be silently rewritten.
--   * guidance_sources are publicly readable (except archived records) and
--     only editable by administrators (app_metadata.role = 'admin', which can
--     only be set with the service-role key / Supabase dashboard).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Returns true when the current JWT belongs to a Resolve administrator.
-- app_metadata cannot be edited by end users, so this is safe to rely on.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) <= 320),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  country text not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  account_type text check (account_type in ('individual', 'business')),
  business_name text check (business_name is null or char_length(business_name) <= 160),
  preferred_contact_method text not null default 'email'
    check (preferred_contact_method in ('email', 'phone', 'sms', 'whatsapp')),
  -- Explicit, revocable consent to send case details and evidence to the
  -- external AI provider for analysis (required before any AI processing).
  ai_processing_consent boolean not null default false,
  ai_processing_consent_at timestamptz,
  -- Notification preferences (stored now; delivery is not implemented yet).
  notify_case_updates boolean not null default true,
  notify_follow_up_reminders boolean not null default true,
  terms_accepted_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per user. Never stores BVN, NIN, PINs, OTPs, passwords or card details.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if the user changes their login email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- cases
-- -----------------------------------------------------------------------------

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  case_number text not null unique,
  -- 'in_progress' = the user is still filling in the report (saved draft)
  -- 'complete'    = the report was reviewed and submitted into Resolve
  intake_status text not null default 'in_progress'
    check (intake_status in ('in_progress', 'complete')),
  intake_step smallint not null default 1 check (intake_step between 1 and 10),
  issue_category text check (issue_category in (
    'failed_or_pending_transfer',
    'unauthorised_debit',
    'duplicate_transaction',
    'erroneous_transfer'
  )),
  institution_name text check (institution_name is null or char_length(institution_name) between 2 and 160),
  amount numeric(16, 2) check (amount is null or (amount > 0 and amount < 100000000000000)),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  transaction_date timestamptz,
  transaction_reference text check (transaction_reference is null or char_length(transaction_reference) <= 120),
  payment_channel text check (payment_channel in (
    'mobile_app', 'internet_banking', 'ussd', 'pos', 'atm', 'bank_branch',
    'card_online', 'fintech_wallet', 'agent_banking', 'other'
  )),
  recipient_details text check (recipient_details is null or char_length(recipient_details) <= 300),
  incident_description text check (incident_description is null or char_length(incident_description) <= 5000),
  previous_attempts text check (previous_attempts is null or char_length(previous_attempts) <= 3000),
  requested_resolution text check (requested_resolution is null or char_length(requested_resolution) <= 1000),
  -- Answers to AI follow-up questions, provided by the user:
  -- [{ "question": text, "answer": text, "answered_at": timestamptz }]
  supplementary_info jsonb not null default '[]'::jsonb
    check (jsonb_typeof(supplementary_info) = 'array'),
  status text not null default 'draft' check (status in (
    'draft',
    'submitted_to_institution',
    'awaiting_institution_response',
    'additional_information_required',
    'ready_for_escalation',
    'escalated_by_user',
    'resolved',
    'closed'
  )),
  institution_reference text check (institution_reference is null or char_length(institution_reference) <= 120),
  institution_submission_date date,
  institution_submission_channel text check (institution_submission_channel is null or institution_submission_channel in (
    'branch_visit', 'email', 'phone', 'mobile_app', 'website_form', 'social_media', 'letter', 'other'
  )),
  next_follow_up_date date,
  resolution_details text check (resolution_details is null or char_length(resolution_details) <= 3000),
  resolved_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A report can only be marked complete when its core facts are present.
  constraint cases_complete_requires_core_fields check (
    intake_status = 'in_progress' or (
      issue_category is not null
      and institution_name is not null
      and amount is not null
      and transaction_date is not null
      and payment_channel is not null
      and incident_description is not null
      and char_length(incident_description) >= 20
    )
  ),
  -- While a report is still being written, the case stays in 'draft'.
  constraint cases_in_progress_is_draft check (
    intake_status = 'complete' or status = 'draft'
  )
);

create index cases_user_id_idx on public.cases (user_id);
create index cases_user_status_idx on public.cases (user_id, status);
create index cases_user_updated_idx on public.cases (user_id, updated_at desc);
create index cases_user_follow_up_idx on public.cases (user_id, next_follow_up_date)
  where next_follow_up_date is not null;

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

-- Generate a unique, non-sequential, human-friendly case number, e.g. RSV-7F3A-92C1.
-- Random (not sequential) so case numbers do not reveal how many cases exist.
create or replace function public.generate_case_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  candidate text;
  hex text;
begin
  loop
    hex := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    candidate := 'RSV-' || substr(hex, 1, 4) || '-' || substr(hex, 5, 4);
    exit when not exists (select 1 from public.cases where case_number = candidate);
  end loop;
  new.case_number := candidate;
  return new;
end;
$$;

create trigger cases_generate_case_number
  before insert on public.cases
  for each row execute function public.generate_case_number();

-- Ownership and identity fields can never change after creation.
create or replace function public.protect_case_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  if new.case_number <> old.case_number then
    raise exception 'case_number cannot be changed';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  if old.intake_status = 'complete' and new.intake_status = 'in_progress' then
    raise exception 'a submitted report cannot be returned to in-progress';
  end if;
  return new;
end;
$$;

create trigger cases_protect_identity
  before update on public.cases
  for each row execute function public.protect_case_identity();

-- -----------------------------------------------------------------------------
-- case_events (append-only activity timeline)
-- -----------------------------------------------------------------------------

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in (
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
    'note_added'
  )),
  description text not null check (char_length(description) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index case_events_case_created_idx on public.case_events (case_id, created_at desc);
create index case_events_user_created_idx on public.case_events (user_id, created_at desc);

-- Every status change automatically creates a timeline event. Because this is
-- enforced in the database it cannot be skipped by application code.
create or replace function public.log_case_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.case_events (case_id, user_id, event_type, description, metadata)
    values (
      new.id,
      new.user_id,
      'status_changed',
      'Status changed from ' || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' '),
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger cases_log_status_change
  after update of status on public.cases
  for each row execute function public.log_case_status_change();

create or replace function public.log_case_created()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.case_events (case_id, user_id, event_type, description, metadata)
  values (new.id, new.user_id, 'case_created', 'Case ' || new.case_number || ' was started', '{}'::jsonb);
  return new;
end;
$$;

create trigger cases_log_created
  after insert on public.cases
  for each row execute function public.log_case_created();

-- -----------------------------------------------------------------------------
-- evidence
-- -----------------------------------------------------------------------------

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null unique check (char_length(file_path) <= 512),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'application/pdf')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  description text check (description is null or char_length(description) <= 500),
  extraction_status text not null default 'not_started' check (extraction_status in (
    'not_started', 'processing', 'completed', 'failed', 'unsupported'
  )),
  extraction_error text check (extraction_error is null or char_length(extraction_error) <= 500),
  created_at timestamptz not null default now(),
  -- Files must live in the owner's private folder: <user_id>/<case_id>/<file>
  constraint evidence_path_matches_owner check (
    file_path like (user_id::text || '/' || case_id::text || '/%')
  )
);

create index evidence_case_idx on public.evidence (case_id, created_at);
create index evidence_user_idx on public.evidence (user_id);

-- Limit the number of files per case (protects storage and AI costs).
create or replace function public.enforce_evidence_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.evidence where case_id = new.case_id) >= 10 then
    raise exception 'A case can have at most 10 evidence files'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger evidence_enforce_limit
  before insert on public.evidence
  for each row execute function public.enforce_evidence_limit();

-- -----------------------------------------------------------------------------
-- ai_analyses
-- -----------------------------------------------------------------------------

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  evidence_id uuid references public.evidence (id) on delete cascade,
  analysis_type text not null check (analysis_type in ('case_analysis', 'evidence_extraction')),
  structured_result jsonb not null check (jsonb_typeof(structured_result) = 'object'),
  model_identifier text not null check (char_length(model_identifier) <= 120),
  -- The user's review of the analysis (accepted / rejected suggestions).
  user_review jsonb not null default '{}'::jsonb check (jsonb_typeof(user_review) = 'object'),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_analyses_evidence_link check (
    (analysis_type = 'evidence_extraction') = (evidence_id is not null)
  )
);

create index ai_analyses_case_idx on public.ai_analyses (case_id, analysis_type, created_at desc);
create index ai_analyses_user_idx on public.ai_analyses (user_id);
create index ai_analyses_evidence_idx on public.ai_analyses (evidence_id) where evidence_id is not null;

-- -----------------------------------------------------------------------------
-- complaint_drafts
-- -----------------------------------------------------------------------------

create table public.complaint_drafts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null default '' check (char_length(subject) <= 300),
  content text not null check (char_length(content) between 1 and 20000),
  version integer not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  generated_by text not null default 'ai' check (generated_by in ('ai', 'template')),
  model_identifier text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, version),
  constraint complaint_drafts_approved_has_timestamp check (
    status <> 'approved' or approved_at is not null
  )
);

create index complaint_drafts_case_idx on public.complaint_drafts (case_id, version desc);
create index complaint_drafts_user_idx on public.complaint_drafts (user_id);

create trigger complaint_drafts_set_updated_at
  before update on public.complaint_drafts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- guidance_sources
-- -----------------------------------------------------------------------------

create table public.guidance_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 200),
  institution text not null check (char_length(institution) between 2 and 160),
  country text not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  -- null = applies to all issue categories
  issue_category text check (issue_category is null or issue_category in (
    'failed_or_pending_transfer',
    'unauthorised_debit',
    'duplicate_transaction',
    'erroneous_transfer'
  )),
  source_url text not null check (source_url ~ '^https://'),
  content text not null check (char_length(content) between 1 and 20000),
  publication_date date,
  verified_at timestamptz,
  effective_from date,
  effective_until date,
  status text not null default 'unverified' check (status in ('verified', 'unverified', 'outdated', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guidance_verified_requires_date check (status <> 'verified' or verified_at is not null),
  constraint guidance_effective_range check (
    effective_until is null or effective_from is null or effective_until >= effective_from
  )
);

create index guidance_lookup_idx on public.guidance_sources (country, issue_category, status);

create trigger guidance_sources_set_updated_at
  before update on public.guidance_sources
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- ai_usage_events (rate limiting for AI endpoints)
-- -----------------------------------------------------------------------------

create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('case_analysis', 'evidence_extraction', 'complaint_generation')),
  created_at timestamptz not null default now()
);

create index ai_usage_events_user_created_idx on public.ai_usage_events (user_id, created_at desc);

-- Atomically checks and records AI usage for the calling user.
-- Returns true if the request is allowed, false if the limit is reached.
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
  if p_kind not in ('case_analysis', 'evidence_extraction', 'complaint_generation') then
    raise exception 'invalid usage kind';
  end if;
  -- Serialise concurrent requests from the same user.
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || uid::text));

  select count(*) into hour_count from public.ai_usage_events
    where user_id = uid and created_at > now() - interval '1 hour';
  select count(*) into minute_count from public.ai_usage_events
    where user_id = uid and created_at > now() - interval '1 minute';

  if hour_count >= greatest(p_limit_per_hour, 1) or minute_count >= greatest(p_limit_per_minute, 1) then
    return false;
  end if;

  insert into public.ai_usage_events (user_id, kind) values (uid, p_kind);
  -- Housekeeping: keep only recent usage rows for this user.
  delete from public.ai_usage_events where user_id = uid and created_at < now() - interval '2 days';
  return true;
end;
$$;

revoke all on function public.consume_ai_quota(text, integer, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer, integer) to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.evidence enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.complaint_drafts enable row level security;
alter table public.guidance_sources enable row level security;
alter table public.ai_usage_events enable row level security;

-- profiles: a user can read and update only their own profile.
-- Inserts happen through the handle_new_user trigger; deletes happen by
-- deleting the auth user (cascade).
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- cases
create policy "cases_select_own" on public.cases
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cases_insert_own" on public.cases
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "cases_update_own" on public.cases
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "cases_delete_own" on public.cases
  for delete to authenticated using (user_id = (select auth.uid()));

-- Helper used by child-table policies: does the case belong to the caller?
create or replace function public.owns_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cases c where c.id = p_case_id and c.user_id = auth.uid()
  );
$$;

revoke all on function public.owns_case(uuid) from public, anon;
grant execute on function public.owns_case(uuid) to authenticated;

-- case_events: readable by owner; insertable by owner for their own case;
-- never updatable or deletable by users (append-only history).
create policy "case_events_select_own" on public.case_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "case_events_insert_own" on public.case_events
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));

-- evidence
create policy "evidence_select_own" on public.evidence
  for select to authenticated using (user_id = (select auth.uid()));
create policy "evidence_insert_own" on public.evidence
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));
create policy "evidence_update_own" on public.evidence
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));
create policy "evidence_delete_own" on public.evidence
  for delete to authenticated using (user_id = (select auth.uid()));

-- ai_analyses
create policy "ai_analyses_select_own" on public.ai_analyses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ai_analyses_insert_own" on public.ai_analyses
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));
create policy "ai_analyses_update_own" on public.ai_analyses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));

-- complaint_drafts
create policy "complaint_drafts_select_own" on public.complaint_drafts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "complaint_drafts_insert_own" on public.complaint_drafts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));
create policy "complaint_drafts_update_own" on public.complaint_drafts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_case(case_id));
create policy "complaint_drafts_delete_own" on public.complaint_drafts
  for delete to authenticated using (user_id = (select auth.uid()));

-- guidance_sources: public read (except archived); admin-only writes.
create policy "guidance_public_read" on public.guidance_sources
  for select to anon, authenticated using (status <> 'archived' or public.is_admin());
create policy "guidance_admin_insert" on public.guidance_sources
  for insert to authenticated with check (public.is_admin());
create policy "guidance_admin_update" on public.guidance_sources
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "guidance_admin_delete" on public.guidance_sources
  for delete to authenticated using (public.is_admin());

-- ai_usage_events: users can see their own usage; writes only via consume_ai_quota().
create policy "ai_usage_select_own" on public.ai_usage_events
  for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Table privileges (defence in depth: anon has no access to private tables)
-- -----------------------------------------------------------------------------

-- Supabase grants broad default privileges on new tables. Start from zero and
-- grant back only what each role needs.
revoke all on public.profiles, public.cases, public.case_events, public.evidence,
  public.ai_analyses, public.complaint_drafts, public.ai_usage_events,
  public.guidance_sources from anon, authenticated;
grant select on public.guidance_sources to anon;

-- Users may update their profile details, but not their id, email (synced
-- from the auth account) or timestamps.
grant select on public.profiles to authenticated;
grant update (
  full_name, phone, country, account_type, business_name, preferred_contact_method,
  ai_processing_consent, ai_processing_consent_at, notify_case_updates,
  notify_follow_up_reminders, terms_accepted_at, onboarding_completed_at
) on public.profiles to authenticated;
grant select, insert, update, delete on public.cases to authenticated;
grant select, insert on public.case_events to authenticated;
grant select, insert, update, delete on public.evidence to authenticated;
grant select, insert, update on public.ai_analyses to authenticated;
grant select, insert, update, delete on public.complaint_drafts to authenticated;
grant select, insert, update, delete on public.guidance_sources to authenticated;
grant select on public.ai_usage_events to authenticated;


-- >>> supabase/migrations/20261108000002_evidence_storage.sql
-- =============================================================================
-- Resolve: private evidence storage
-- -----------------------------------------------------------------------------
-- * The "evidence" bucket is PRIVATE: files are never available via public URLs.
-- * Supabase Storage enforces the size limit and allowed MIME types below.
-- * Files are stored as <user_id>/<case_id>/<random-uuid>.<ext>, and the
--   policies below only allow a user to touch objects in their own folder.
-- * The application additionally checks file signatures ("magic bytes") on the
--   server before an upload is accepted as evidence.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "evidence_objects_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "evidence_objects_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.owns_case(((storage.foldername(name))[2])::uuid)
  );

create policy "evidence_objects_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "evidence_objects_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- >>> supabase/migrations/20261108000003_guidance_seed.sql
-- =============================================================================
-- Resolve: initial official guidance sources (Nigeria)
-- -----------------------------------------------------------------------------
-- IMPORTANT: These records point to official Central Bank of Nigeria (CBN)
-- pages, but their content has NOT yet been reviewed and verified by Resolve.
-- They are therefore stored with status = 'unverified' and contain no
-- summarised requirements or deadlines. The application shows an
-- "unverified" warning and directs users to the official source.
--
-- To verify a record: an administrator reads the official page, writes an
-- accurate summary in `content`, fills in publication/effective dates where the
-- source states them, sets verified_at = now() and status = 'verified'
-- (use the in-app admin screen at /admin/guidance).
-- =============================================================================

insert into public.guidance_sources
  (title, institution, country, issue_category, source_url, content, status)
values
  (
    'CBN Consumer Protection: complaints management',
    'Central Bank of Nigeria (Consumer Protection)',
    'NG',
    null,
    'https://www.cbn.gov.ng/supervision/cpdcomgt.html',
    'Official CBN page about consumer complaints management. Resolve has not yet reviewed and verified the content of this page, so no requirements or timelines are summarised here. Open the official source to read the current process.',
    'unverified'
  ),
  (
    'CBN: how to lodge a complaint',
    'Central Bank of Nigeria',
    'NG',
    null,
    'https://www.cbn.gov.ng/FinInc/FinLit/LodgeComplaint.html',
    'Official CBN financial literacy page on lodging a complaint. Resolve has not yet reviewed and verified the content of this page, so no requirements or timelines are summarised here. Open the official source to read the current process.',
    'unverified'
  ),
  (
    'CBN Consumer Complaints Portal',
    'Central Bank of Nigeria',
    'NG',
    null,
    'https://complaintsportal.cbn.gov.ng/',
    'Official CBN online portal for consumer complaints. Resolve has not yet reviewed and verified the portal''s eligibility rules or required information. Check the portal itself before relying on it.',
    'unverified'
  ),
  (
    'CBN Complaints Portal: complaint categories',
    'Central Bank of Nigeria',
    'NG',
    null,
    'https://complaintsportal.cbn.gov.ng/Categories',
    'Official list of complaint categories on the CBN complaints portal. Resolve has not yet verified which category applies to each type of problem. Check the official list to choose the right category.',
    'unverified'
  );
