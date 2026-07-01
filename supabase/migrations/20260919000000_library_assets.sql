-- The Loom — the built-in asset library / catalog for the web editor.
-- Phase 1 (foundation): lay the framework to STORE images, themes, and assets. One
-- polymorphic catalog table + a storage bucket. Search is Supabase-native: a generated
-- `search_tsv` (FTS) + a pg_trgm index for typo-tolerant matching now, and a reserved
-- `embedding vector(384)` column for the fast-follow semantic phase (same dim as the rest
-- of the platform's embeddings, so it can reuse the existing model/RPC pattern).
--
-- Scoping: `space_id` null = the Frequency SHARED/master library; set = that entity's own
-- library. Managed + read through staff/operator-gated server actions with the service-role
-- admin client, so RLS is enabled with NO policies (service-role only), matching public.pages.
-- Per-tenant client-facing RLS, the browser UI, the editor picker, semantic search, and the
-- seed of our existing kit/themes/flows are deferred to later phases (see docs/BUILD-LIST.md
-- "The Loom" + docs/LIBRARY.md). See ADR-478.

create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists public.library_assets (
  id             uuid primary key default gen_random_uuid(),

  -- what it is
  kind           text not null,                       -- image | icon | element | template | flow | theme | app_asset
  title          text not null,
  slug           text not null,                       -- stable id for upserts/seeds
  description    text,
  category       text,
  tags           text[]  not null default '{}',
  colors         text[]  not null default '{}',       -- dominant colors, for a future color facet

  -- who owns it (null = Frequency shared master library; set = the entity's own library)
  space_id       uuid references public.spaces(id) on delete cascade,
  visibility     text not null default 'space',       -- private | space | public
  status         text not null default 'draft',       -- draft | in_review | approved | final | archived

  -- payload: a stored file (images / app assets) ...
  storage_bucket text,
  storage_path   text,
  url            text,
  mime           text,
  width          int,
  height         int,
  bytes          bigint,
  -- ... or a PARAMETRIC config (elements / templates / flows / theme token sets), kept as data
  -- so it stays theme-aware and re-colorable rather than a flat image.
  config         jsonb,

  -- provenance + lifecycle
  source         text,
  license        text,
  attribution    text,
  usage_count    int  not null default 0,
  version        int  not null default 1,
  parent_id      uuid references public.library_assets(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- search (keyword now; semantic reserved). Note: the FTS expression covers the text
  -- columns only — `tags` is intentionally excluded because `array_to_string` is STABLE,
  -- not IMMUTABLE, so it can't appear in a generated column. Tags are searched/filtered
  -- via their own GIN index (library_assets_tags_idx) instead.
  search_tsv     tsvector generated always as (
                   to_tsvector('english',
                     coalesce(title, '') || ' ' ||
                     coalesce(description, '') || ' ' ||
                     coalesce(category, ''))
                 ) stored,
  embedding      vector(384),

  constraint library_assets_kind_check
    check (kind in ('image', 'icon', 'element', 'template', 'flow', 'theme', 'app_asset')),
  constraint library_assets_visibility_check
    check (visibility in ('private', 'space', 'public')),
  constraint library_assets_status_check
    check (status in ('draft', 'in_review', 'approved', 'final', 'archived'))
);

-- Slug is unique within a scope: once across the shared master set, once per space.
create unique index if not exists library_assets_shared_slug_idx
  on public.library_assets (slug) where space_id is null;
create unique index if not exists library_assets_space_slug_idx
  on public.library_assets (space_id, slug) where space_id is not null;

-- Search + facet indexes.
create index if not exists library_assets_search_idx
  on public.library_assets using gin (search_tsv);
create index if not exists library_assets_title_trgm_idx
  on public.library_assets using gin (title gin_trgm_ops);
create index if not exists library_assets_tags_idx
  on public.library_assets using gin (tags);
create index if not exists library_assets_scope_idx
  on public.library_assets (space_id, kind, status);
-- Note: the pgvector hnsw index is intentionally deferred to the semantic-search phase,
-- when `embedding` is populated (an index on an all-null column earns nothing).

alter table public.library_assets enable row level security;
-- No policies: service-role only in Phase 1 (managed + read via staff/operator-gated server
-- actions with the admin client, same as public.pages). Per-tenant client RLS lands with the
-- tenancy phase (docs/BUILD-LIST.md → The Loom).

comment on table public.library_assets is
  'The Loom asset library / catalog. kind = image|icon|element|template|flow|theme|app_asset. '
  'space_id null = Frequency shared master library, set = the entity''s own. File-backed assets '
  'carry storage_*/url; parametric ones (elements/templates/flows/themes) carry config jsonb. '
  'Service-role only; search via search_tsv (FTS) + title trgm, embedding reserved. See ADR-478 / docs/LIBRARY.md.';

-- Storage for file-backed library assets (images, icons, app assets). Public like site-media,
-- so rendered assets are CDN-served; writes go through staff/operator-gated server actions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-media',
  'library-media',
  true,
  20971520, -- 20 MB
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
    'image/svg+xml', 'application/json'
  ]
)
on conflict (id) do nothing;
