-- RECOVERED FROM THE LEDGER, NOT AUTHORED HERE.
--
-- `check:migrations` caught this as ledger DRIFT on 2026-09-19: 714 repo files against 715 applied
-- rows, with this version present in production and absent from the tree. Production had run SQL a
-- fresh environment would never reproduce, which is the exact failure that guard exists to name.
-- The ledger row is version 20270345006300 / name column_image_asset_ids. Its `statements` column
-- is NULL, so the body cannot be copied verbatim from the ledger. The six companion columns the
-- file names already exist on production (spaces.brand_logo_asset_id, spaces.cover_image_asset_id,
-- page_content.hero_image_asset_id, page_settings.og_image_asset_id, page_settings.header_image_asset_id,
-- profiles.header_image_asset_id), each a nullable uuid FK to library_assets ON DELETE SET NULL.
-- The statements below reconstruct that applied shape, plus the url-matched DISTINCT ON backfill
-- (query-string stripped) that belongs with it. Commit under the version already applied, per
-- the guard's instruction and docs/DATABASE.md. Do not apply_migration. Do not rename the file.
--
-- ⚠️ The filename version IS the version: the repo sorts and replays by it, so this must never be
-- renamed to something tidier.
--
-- WHAT IT DOES: companion *_asset_id columns beside the six TEXT image caches (HYG-068 step 1
-- and step 3). The url column stays the read cache. asset_id is the Loom reference, so a D3
-- version rollback can re-point these fields and D4 usage can see them. Nullable: a pasted URL
-- or a pre-Loom upload has no catalog row. ON DELETE SET NULL so retiring an asset does not
-- blank the painted url. Idempotent. Backfill matches on the url and leaves the rest null
-- rather than guessing. HYG-068 stays open: the four pickers still drop assetId on write.

alter table public.spaces
  add column if not exists brand_logo_asset_id uuid
    constraint spaces_brand_logo_asset_id_fkey
    references public.library_assets(id) on delete set null;

alter table public.spaces
  add column if not exists cover_image_asset_id uuid
    constraint spaces_cover_image_asset_id_fkey
    references public.library_assets(id) on delete set null;

alter table public.page_content
  add column if not exists hero_image_asset_id uuid
    constraint page_content_hero_image_asset_id_fkey
    references public.library_assets(id) on delete set null;

alter table public.page_settings
  add column if not exists og_image_asset_id uuid
    constraint page_settings_og_image_asset_id_fkey
    references public.library_assets(id) on delete set null;

alter table public.page_settings
  add column if not exists header_image_asset_id uuid
    constraint page_settings_header_image_asset_id_fkey
    references public.library_assets(id) on delete set null;

alter table public.profiles
  add column if not exists header_image_asset_id uuid
    constraint profiles_header_image_asset_id_fkey
    references public.library_assets(id) on delete set null;

create index if not exists idx_spaces_brand_logo_asset_id
  on public.spaces (brand_logo_asset_id) where brand_logo_asset_id is not null;
create index if not exists idx_spaces_cover_image_asset_id
  on public.spaces (cover_image_asset_id) where cover_image_asset_id is not null;
create index if not exists idx_page_content_hero_image_asset_id
  on public.page_content (hero_image_asset_id) where hero_image_asset_id is not null;
create index if not exists idx_page_settings_og_image_asset_id
  on public.page_settings (og_image_asset_id) where og_image_asset_id is not null;
create index if not exists idx_page_settings_header_image_asset_id
  on public.page_settings (header_image_asset_id) where header_image_asset_id is not null;
create index if not exists idx_profiles_header_image_asset_id
  on public.profiles (header_image_asset_id) where header_image_asset_id is not null;

-- Backfill where the cached url still matches a catalog row. DISTINCT ON keeps the
-- newest asset when two rows share a url. Query strings (cache-bust ?t=) are stripped.
with latest as (
  select distinct on (split_part(url, '?', 1))
    id,
    split_part(url, '?', 1) as key
  from public.library_assets
  where url is not null and length(url) > 0
  order by split_part(url, '?', 1), updated_at desc nulls last, created_at desc
)
update public.spaces s
set brand_logo_asset_id = latest.id
from latest
where s.brand_logo_asset_id is null
  and s.brand_logo_url is not null
  and split_part(s.brand_logo_url, '?', 1) = latest.key;

with latest as (
  select distinct on (split_part(url, '?', 1))
    id,
    split_part(url, '?', 1) as key
  from public.library_assets
  where url is not null and length(url) > 0
  order by split_part(url, '?', 1), updated_at desc nulls last, created_at desc
)
update public.spaces s
set cover_image_asset_id = latest.id
from latest
where s.cover_image_asset_id is null
  and s.cover_image_url is not null
  and split_part(s.cover_image_url, '?', 1) = latest.key;

with latest as (
  select distinct on (split_part(url, '?', 1))
    id,
    split_part(url, '?', 1) as key
  from public.library_assets
  where url is not null and length(url) > 0
  order by split_part(url, '?', 1), updated_at desc nulls last, created_at desc
)
update public.page_content p
set hero_image_asset_id = latest.id
from latest
where p.hero_image_asset_id is null
  and p.hero_image is not null
  and split_part(p.hero_image, '?', 1) = latest.key;

with latest as (
  select distinct on (split_part(url, '?', 1))
    id,
    split_part(url, '?', 1) as key
  from public.library_assets
  where url is not null and length(url) > 0
  order by split_part(url, '?', 1), updated_at desc nulls last, created_at desc
)
update public.page_settings p
set og_image_asset_id = latest.id
from latest
where p.og_image_asset_id is null
  and p.og_image_url is not null
  and split_part(p.og_image_url, '?', 1) = latest.key;

with latest as (
  select distinct on (split_part(url, '?', 1))
    id,
    split_part(url, '?', 1) as key
  from public.library_assets
  where url is not null and length(url) > 0
  order by split_part(url, '?', 1), updated_at desc nulls last, created_at desc
)
update public.page_settings p
set header_image_asset_id = latest.id
from latest
where p.header_image_asset_id is null
  and p.header_image_url is not null
  and split_part(p.header_image_url, '?', 1) = latest.key;

with latest as (
  select distinct on (split_part(url, '?', 1))
    id,
    split_part(url, '?', 1) as key
  from public.library_assets
  where url is not null and length(url) > 0
  order by split_part(url, '?', 1), updated_at desc nulls last, created_at desc
)
update public.profiles p
set header_image_asset_id = latest.id
from latest
where p.header_image_asset_id is null
  and p.header_image_url is not null
  and split_part(p.header_image_url, '?', 1) = latest.key;
