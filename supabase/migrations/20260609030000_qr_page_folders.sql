-- =============================================================================
-- QR per-page folders (ADR-179)
--
-- A QR code can be "owned" by a page: created from that page's Settings panel and
-- pointing back at it. `page_path` is the folder key — every code generated for a
-- given route shares one folder in QR Studio. NULL = a free-standing code created
-- in the Studio for an arbitrary link (the existing behaviour), which lives outside
-- the page folders.
--
-- On the page you manage that page's individual codes; in the Studio you create a
-- code for any link and manage every code your role can see (grouped by folder).
-- =============================================================================

alter table public.qr_codes
  add column if not exists page_path text;

-- Folder lookups (Studio groups by page_path; a page lists its own codes).
create index if not exists qr_codes_page_path_idx
  on public.qr_codes (page_path)
  where page_path is not null;

comment on column public.qr_codes.page_path is
  'The app route this QR belongs to (its Studio "folder"), e.g. /circles/sunset-skate. NULL = a free-standing Studio code (ADR-179).';
