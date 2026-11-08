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
