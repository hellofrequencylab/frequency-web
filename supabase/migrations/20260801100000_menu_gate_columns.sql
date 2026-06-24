-- =============================================================================
-- Menu gate columns — carry the full two-axis access gate on menu data (ADR-390).
--
-- WHY ----------------------------------------------------------------------------
-- The nav is being standardized into 4 editable CONTAINERS (Header, Left, Footer,
-- User). Admin pages — which gate on TWO axes (a community/role floor `min_access`
-- PLUS a staff capability domain, ADR-127/ADR-208) — now live inside those
-- containers alongside member links. The menu tables (20260721000000_menu_system)
-- could only express `min_access` + per-role `role_modes`, NOT the staff axis, so
-- moving a staff-gated page into a container would have LOST its staff gate.
--
-- This migration adds the staff axis to BOTH leaves and categories, plus the
-- category-level `min_access` and the `icon`/`blurb` a category needs when it
-- doubles as a rail entry / dashboard card. Everything is nullable / defaulted, so
-- this is additive and inert until the renderers read it (later phases).
--
-- staff_domain is intentionally free-text (validated in lib/menus/actions.ts against
-- the StaffDomain set) so adding a future domain needs no migration; staff_level is
-- CHECK-constrained to the fixed Access ladder. Mirrors the menu_system conventions
-- (text + check enums, nullable extras). Regenerate lib/database.types.ts after this
-- is applied is NOT required: the menu tables are read/written via the untyped
-- menuDb() handle (ADR-246 pattern, lib/menus/db.ts).
-- =============================================================================

-- ── menu_items: the staff capability axis (unioned with min_access in the renderer) ─
alter table public.menu_items
  add column if not exists staff_domain text,
  add column if not exists staff_level text check (staff_level in ('none','read','write'));

comment on column public.menu_items.staff_domain is
  'Optional staff capability domain (ADR-127) that ALSO unlocks this link, unioned with min_access/role_modes. Validated in lib/menus/actions.ts against the StaffDomain set.';

-- ── menu_categories: full gate (a category can be a gated section / rail entry) ─────
alter table public.menu_categories
  add column if not exists min_access text not null default 'visitor' check (min_access in
    ('visitor','member','crew','host','guide','mentor','admin','janitor')),
  add column if not exists staff_domain text,
  add column if not exists staff_level text check (staff_level in ('none','read','write')),
  add column if not exists icon text,
  add column if not exists blurb text;

comment on column public.menu_categories.min_access is
  'Lowest access that may SEE this category. A category can be a gated section (e.g. janitor-only) when it doubles as a left-rail entry / dashboard card.';
comment on column public.menu_categories.icon is
  'Icon NAME (resolved by components/layout/nav-icons.ts railIconFor) for when the category renders as a rail entry / dashboard card.';
comment on column public.menu_categories.blurb is
  'One-line framing shown when the category renders as a dashboard / overview card.';
