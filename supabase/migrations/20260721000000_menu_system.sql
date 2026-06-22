-- =============================================================================
-- DB-backed, editable navigation / menu system (foundation).
--
-- This replaces the hard-coded nav modules (lib/site.ts PUBLIC_MEGA_NAV /
-- MARKETING_NAV, lib/admin/nav.ts ADMIN_NAV, lib/nav-areas.ts NAV_AREAS) with a
-- handful of editable tables so a janitor can reshape every menu surface from the
-- admin UI. The code modules stay as the FALLBACK + the seed source (see
-- lib/menus/defaults.ts): a surface with no DB rows renders from code; "seed from
-- defaults" copies the code shape into these tables so it becomes editable.
--
-- TENANCY -----------------------------------------------------------------------
-- Every menu carries `space_id`. NULL = the GLOBAL menu (the canonical Frequency
-- app, shared by every viewer). A non-null space_id is a per-space override for a
-- sub-brand. ONLY the global menus are seeded / edited right now; per-space menus
-- are a later phase. The `unique (space_id, surface_key)` constraint means at most
-- one menu per surface per scope (and exactly one global menu per surface). NULLs
-- compare as distinct in a UNIQUE index in Postgres, so this still allows many
-- per-space rows for a surface while the single global row is enforced by reads
-- that filter `space_id is null`.
--
-- PUBLIC READ -------------------------------------------------------------------
-- The public site header serves LOGGED-OUT visitors, so these tables grant SELECT
-- to BOTH `anon` and `authenticated` (this DIFFERS from menu_config /
-- area_permissions, which were authenticated-only because they only drive the
-- in-app rail). The data is non-sensitive nav structure (labels, hrefs, layout) so
-- a plain `using (true)` read is safe; per-role / per-mode item filtering happens
-- in the renderer, not the database.
--
-- WRITES ------------------------------------------------------------------------
-- There is intentionally NO client-facing write policy. Every write goes through
-- the service role in a janitor-gated server action (lib/menus/actions.ts),
-- mirroring menu_config / area_permissions / walkthrough.
--
-- NOTE: after this migration is applied, regenerate lib/database.types.ts so these
-- tables are typed (ADR-246 pattern). Until then, reads/writes cast the client to
-- an untyped shape, exactly as lib/menu-config.ts / lib/permissions.ts do.
-- =============================================================================


-- ── menus, one editable menu per surface per scope ───────────────────────────
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces(id) on delete cascade,           -- NULL = global
  surface_key text not null check (surface_key in
    ('public_discover','public_explore','admin_subheader','left_rail','marketing_footer')),
  label text not null,
  columns smallint not null default 6 check (columns between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, surface_key)
);

comment on table public.menus is
  'Editable nav menu per (space_id, surface_key). space_id NULL = the global menu shared by every viewer; non-null = a per-space override (later phase). Code modules are the fallback + seed source. Public-read, service-role writes.';


-- ── menu_categories, grouped columns / sub-categories within a menu ──────────
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  parent_id uuid references public.menu_categories(id) on delete cascade, -- nested sub-categories
  label text,
  position int not null default 0,
  grid_col smallint, grid_row smallint,
  col_span smallint not null default 1 check (col_span between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ── menu_items, the leaf links (root-level or inside a category) ─────────────
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete cascade, -- NULL = menu root
  label text not null,
  href text not null,
  subheading text,
  icon text,
  position int not null default 0,
  grid_col smallint, grid_row smallint,
  col_span smallint not null default 1 check (col_span between 1 and 12),
  mode text not null default 'active' check (mode in ('active','ghost','hidden')),
  role_modes jsonb not null default '{}'::jsonb,   -- { "<role>": "active|ghost|hidden" }
  min_access text not null default 'visitor' check (min_access in
    ('visitor','member','crew','host','guide','mentor','admin','janitor')),
  ghost_tier text,
  ghost_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ── menu_rail_cards, the featured side cards (left / right rails of a panel) ──
create table if not exists public.menu_rail_cards (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  side text not null check (side in ('left','right')),
  title text not null, body text not null, href text not null, cta text,
  position int not null default 0,
  mode text not null default 'active' check (mode in ('active','ghost','hidden')),
  role_modes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ── menu_settings, singleton tuning for the mega-menu interaction timings ────
create table if not exists public.menu_settings (
  id smallint primary key default 1 check (id = 1),
  open_delay_ms int not null default 0    check (open_delay_ms between 0 and 2000),
  dwell_ms      int not null default 1500 check (dwell_ms between 0 and 10000),
  fade_ms       int not null default 240  check (fade_ms between 0 and 3000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ── Indexes, the hot lookups (assemble a menu, drag/drop reorders) ───────────
create index if not exists menu_categories_menu_id_idx   on public.menu_categories (menu_id);
create index if not exists menu_categories_parent_id_idx on public.menu_categories (parent_id);
create index if not exists menu_items_menu_id_idx        on public.menu_items (menu_id);
create index if not exists menu_items_category_id_idx    on public.menu_items (category_id);
create index if not exists menu_rail_cards_menu_id_idx   on public.menu_rail_cards (menu_id);


-- ── updated_at triggers, shared public.set_updated_at, like the rest of schema ─
create trigger menus_set_updated_at
  before update on public.menus
  for each row execute function public.set_updated_at();

create trigger menu_categories_set_updated_at
  before update on public.menu_categories
  for each row execute function public.set_updated_at();

create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

create trigger menu_rail_cards_set_updated_at
  before update on public.menu_rail_cards
  for each row execute function public.set_updated_at();

create trigger menu_settings_set_updated_at
  before update on public.menu_settings
  for each row execute function public.set_updated_at();


-- ── RLS, public read on all five, no client write policy ─────────────────────
alter table public.menus           enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;
alter table public.menu_rail_cards enable row level security;
alter table public.menu_settings   enable row level security;

-- The public header serves logged-out visitors, so read is granted to BOTH anon
-- and authenticated. The data is non-sensitive nav structure; per-role / per-mode
-- item filtering happens in the renderer. Writes go exclusively through the
-- service role in a janitor-gated server action (no client-facing write policy).
drop policy if exists "menus readable by everyone" on public.menus;
create policy "menus readable by everyone"
  on public.menus for select
  to anon, authenticated using (true);

drop policy if exists "menu_categories readable by everyone" on public.menu_categories;
create policy "menu_categories readable by everyone"
  on public.menu_categories for select
  to anon, authenticated using (true);

drop policy if exists "menu_items readable by everyone" on public.menu_items;
create policy "menu_items readable by everyone"
  on public.menu_items for select
  to anon, authenticated using (true);

drop policy if exists "menu_rail_cards readable by everyone" on public.menu_rail_cards;
create policy "menu_rail_cards readable by everyone"
  on public.menu_rail_cards for select
  to anon, authenticated using (true);

drop policy if exists "menu_settings readable by everyone" on public.menu_settings;
create policy "menu_settings readable by everyone"
  on public.menu_settings for select
  to anon, authenticated using (true);


-- ── Seed, the settings singleton row (id = 1) ───────────────────────────────
insert into public.menu_settings (id) values (1) on conflict do nothing;
