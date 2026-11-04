-- MENU CACHE: deploy after applying. The public pages are static with `revalidate = 3600` and the
-- menu read is cached across requests, so the old header can linger for up to an hour after this
-- runs, or until the next deploy rebuilds those pages.
--
-- LIVE-2230: the live public header was still the OLD one. `menus` (surface_key 'header', no Space)
-- held an operator copy of the pre-overhaul header: Community, Spaces and About, about 28 links,
-- several of them to pages the menu overhaul retired (/vision, /the-lab, /for/community-builders).
-- The reader prefers that copy to the code, so the new header shipped in #4546 (Discover and For
-- Spaces, then Business Spaces, Pricing, Help) never showed. A menu sync on 2026-11-04 01:11 UTC then
-- appended Discover and For Spaces after the old three, so both IAs rendered side by side.
--
-- This deletes the global header menu. Its categories, items and rail cards go with it (all three
-- foreign keys cascade). With no row, getMenu('header') returns the code default
-- (lib/frequency/site-nav.ts WING_MENUS and DIRECT_LINKS), which is the agreed header.
-- Space-owned header menus (space_id is not null) are NOT touched.
--
-- Run ONCE against production. Idempotent: a no-op once the row is gone. The Menu Manager can
-- re-seed the row from the code defaults whenever an operator wants to edit it.
--
-- Verify AFTER (expect zero rows):
--   select id from public.menus where surface_key = 'header' and space_id is null;

do $$
declare
  v_n int;
begin
  delete from public.menus where surface_key = 'header' and space_id is null;
  get diagnostics v_n = row_count;
  raise notice 'LIVE-2230: removed % global header menu row(s); the public header now reads the code default.', v_n;
end $$;
