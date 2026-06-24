-- =============================================================================
-- Add the fifth menu container: `admin_header` (ADR-390).
--
-- The admin header is the CONTEXTUAL admin mega sub-nav: on /admin* routes the shell
-- renders only the ACTIVE section's sub-pages from this surface (with the admin / Vera
-- search bar). It is a full editable member of the menu system like the other four, so
-- any page/link can be assigned to it. This just widens the surface_key CHECK to admit it;
-- the surface renders from the code default (lib/menus/defaults.ts adminHeaderMenu) until
-- an operator seeds / edits it from /admin/menu.
-- =============================================================================

alter table public.menus drop constraint if exists menus_surface_key_check;

alter table public.menus add constraint menus_surface_key_check
  check (surface_key in ('header', 'left', 'footer', 'profile', 'admin_header'));
