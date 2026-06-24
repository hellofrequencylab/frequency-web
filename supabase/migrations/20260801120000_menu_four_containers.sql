-- =============================================================================
-- Standardize navigation into FOUR menu containers (ADR-390).
--
-- The five ad-hoc surfaces collapse into exactly four editable containers:
--   public_discover  ┐
--   public_explore   ┘→ header   (the mega-menu; Discover + Explore are now its two
--                                  top-level categories, rebuilt from the code default)
--   left_rail         → left     (the in-app rail; admin lives here as high-role sections)
--   marketing_footer  → footer
--   admin_subheader   → (removed; admin nav now lives in `left`, role-gated)
--   (new)             → profile  (the account / profile dropdown)
--
-- DATA POLICY: `left_rail` and `marketing_footer` rename IN PLACE (their categories /
-- items follow via menu_id), preserving any operator customization. The two public
-- mega surfaces and the admin sub-header are STRUCTURALLY reshaped (two flat menus →
-- one nested menu; admin folded into the rail), which has no clean automatic row
-- migration, so their menu rows are DROPPED — `header` and `profile` then render from
-- the rich code defaults (lib/menus/defaults.ts) until an operator re-seeds / edits
-- them from /admin/menu. The whole menu system is fail-safe (a surface with no DB rows
-- renders from code), so nothing breaks at any point.
-- =============================================================================

-- Drop the old surface_key CHECK so we can rewrite the allowed set. The original
-- constraint is the inline column check auto-named menus_surface_key_check.
alter table public.menus drop constraint if exists menus_surface_key_check;

-- Rename the two surfaces that map 1:1 (their menu_id stays stable, so every
-- menu_categories / menu_items / menu_rail_cards row follows automatically).
update public.menus set surface_key = 'left'   where surface_key = 'left_rail';
update public.menus set surface_key = 'footer' where surface_key = 'marketing_footer';

-- Drop the surfaces that are structurally reshaped or removed; their children cascade.
delete from public.menus
  where surface_key in ('public_discover', 'public_explore', 'admin_subheader');

-- The new, standardized four-container CHECK.
alter table public.menus add constraint menus_surface_key_check
  check (surface_key in ('header', 'left', 'footer', 'profile'));
