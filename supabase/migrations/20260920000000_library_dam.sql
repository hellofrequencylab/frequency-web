-- The Loom — DAM expansion (ADR-480). Grows the library_assets catalog (ADR-478,
-- migration 20260919000000) into a full digital-asset-management spine: richer master
-- metadata, renditions (on-the-fly transform recipes), non-destructive versions
-- (edit-saves-a-new-version), collections, and a usage index (where each asset is used).
--
-- Decisions baked in (owner, 2026-07-01): every asset is space-scoped — Frequency's
-- shared/master library is the ROOT space's Loom (space_id becomes NOT NULL). In-browser
-- editor is Filerobot; transforms are on-the-fly; backfill everything into the catalog.
-- The full PRIVACY system (private bucket, signed URLs, storage RLS, watermarks) and the
-- per-space client RLS are DEFERRED to a later phase — only the columns/hooks land now.
-- Phase posture stays service-role-only, matching public.pages. See docs/LIBRARY.md.

-- 1) Richer master metadata on library_assets ------------------------------------------
alter table public.library_assets
  add column if not exists sha256          text,        -- content hash, for dedupe on ingest
  add column if not exists alt             text,        -- reusable accessibility text
  add column if not exists blurhash        text,        -- tiny placeholder for instant grids
  add column if not exists focal_x         real,        -- 0..1 focal point (feeds media block `focal`)
  add column if not exists focal_y         real,
  add column if not exists orig_width      int,
  add column if not exists orig_height     int,
  add column if not exists is_protected    boolean not null default false,
  add column if not exists download_policy text not null default 'open',  -- open | members | staff
  add column if not exists expires_at      timestamptz;                    -- licensed assets

alter table public.library_assets
  drop constraint if exists library_assets_download_policy_check;
alter table public.library_assets
  add constraint library_assets_download_policy_check
    check (download_policy in ('open', 'members', 'staff'));

create index if not exists library_assets_sha256_idx
  on public.library_assets (space_id, sha256);

-- 2) Every asset is space-scoped (shared/master = the root space) -----------------------
update public.library_assets a
  set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
  where a.space_id is null;

drop index if exists public.library_assets_shared_slug_idx;
drop index if exists public.library_assets_space_slug_idx;
alter table public.library_assets alter column space_id set not null;
create unique index if not exists library_assets_space_slug_uidx
  on public.library_assets (space_id, slug);

-- 3) Renditions — derived files off one master (thumb/grid/hero/og + webp/avif, crops) ---
create table if not exists public.library_renditions (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.library_assets(id) on delete cascade,
  kind           text not null,        -- thumb | grid | hero | og | source | custom
  recipe         jsonb,                -- crop/rotate/adjust/output — the on-the-fly transform recipe
  storage_bucket text,
  storage_path   text,
  url            text,
  mime           text,
  width          int,
  height         int,
  bytes          bigint,
  created_at     timestamptz not null default now()
);
create index if not exists library_renditions_asset_idx
  on public.library_renditions (asset_id, kind);

-- 4) Versions — non-destructive edit history; the original is never overwritten ---------
create table if not exists public.library_versions (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.library_assets(id) on delete cascade,
  version        int  not null,
  storage_bucket text,
  storage_path   text,
  recipe         jsonb,                -- the Filerobot edit recipe that produced this version
  note           text,
  is_current     boolean not null default false,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (asset_id, version)
);
-- exactly one current version per asset
create unique index if not exists library_versions_current_uidx
  on public.library_versions (asset_id) where is_current;

-- 5) Collections — arbitrary groupings ("Q3 sales funnel"), space-scoped ----------------
create table if not exists public.library_collections (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  title       text not null,
  slug        text not null,
  description text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (space_id, slug)
);
create table if not exists public.library_collection_items (
  collection_id uuid not null references public.library_collections(id) on delete cascade,
  asset_id      uuid not null references public.library_assets(id) on delete cascade,
  sort          int  not null default 0,
  primary key (collection_id, asset_id)
);

-- 6) Usage index — where each asset is referenced (safe delete + "used on N pages" + swap)
create table if not exists public.library_usages (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid not null references public.library_assets(id) on delete cascade,
  context    text not null,            -- page | space_brand | spotlight | email | other
  ref_id     text,                     -- slug / space_id / campaign id (identifies the surface)
  block_id   text,                     -- the Puck block instance, when applicable
  updated_at timestamptz not null default now()
);
create index if not exists library_usages_asset_idx on public.library_usages (asset_id);
create index if not exists library_usages_ref_idx  on public.library_usages (context, ref_id);

-- RLS: service-role only for now (managed/read via gated server actions with the admin
-- client, same as public.pages + library_assets). Per-space client RLS lands with the
-- tenancy/privacy phase (docs/BUILD-LIST.md → The Loom).
alter table public.library_renditions       enable row level security;
alter table public.library_versions         enable row level security;
alter table public.library_collections      enable row level security;
alter table public.library_collection_items enable row level security;
alter table public.library_usages           enable row level security;

comment on table public.library_renditions is
  'Derived files off a library_assets master (thumb/grid/hero/og/custom); recipe = on-the-fly transform. Service-role only. ADR-480.';
comment on table public.library_versions is
  'Non-destructive edit history for a library_assets master; is_current marks the live version. Service-role only. ADR-480.';
comment on table public.library_usages is
  'Where each library asset is referenced (page/space_brand/spotlight/email), for safe delete + global swap. ADR-480.';
