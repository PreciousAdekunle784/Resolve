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
