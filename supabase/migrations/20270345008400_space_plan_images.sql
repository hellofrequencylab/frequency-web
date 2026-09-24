-- A PLAN CAN HOLD IMAGES (PROG-CAL14, ADR-1386 · ADR-1130 · ADR-1502).
--
-- PROG-CAL2 promised a Plan could hold notes, links and files, and shipped the first two. This is
-- the third half, through the seam that row named: files ride the EXISTING Loom asset layer, never
-- a new bucket. Nothing here uploads, stores bytes, or widens what the library accepts.
--
-- OWNER RULING 2026-09-22, stated rather than glossed: the kit's Loom picker is image-only, so
-- this column holds IMAGES and the field an owner sees is labelled Images. A Plan can already hold
-- links, and a link to a document is a document; a documents row gets filed against the first real
-- ask. One migration, no new upload path.
--
-- WHAT IS STORED, and why it is not a bare id. `files` is a jsonb ARRAY of the same
-- `{ assetId, url }` reference every block document stores (lib/library/asset-ref.ts, ADR-1130):
--   * `assetId` is the REFERENCE, the `library_assets.id` the column image fields carry in their
--     companion `*_asset_id` columns (20270345006300). It is what the usage index below matches on.
--   * `url` is the DENORMALISED CACHE, so the drawer paints a thumbnail with no lookup and a Plan
--     never goes blank because the library was unreachable. Fail-open to the cache, always.
-- Validated in lib/calendar/plans.ts (`parsePlanFiles`): UUID-shaped id, http(s) url, at most 10,
-- one row per asset. A jsonb column is deliberate over a join table: this is ordered, small, and
-- edited as one collection beside `links`, exactly as `links` is.
--
-- NO FOREIGN KEY, and that is the same trade every AssetRef makes: a jsonb ref cannot carry one.
-- The protection is the usage index, which is why this migration also extends it (below) instead
-- of leaving the Loom blind to a Plan.
--
-- House style: additive + idempotent. Rollback:
--   alter table public.space_plans drop column if exists files;
--   -- then re-apply 20270345007500 to restore library_asset_usage without the space_plan arm.

-- ── 1. The column ───────────────────────────────────────────────────────────────────────────

alter table public.space_plans
  add column if not exists files jsonb not null default '[]'::jsonb;

comment on column public.space_plans.files is
  'JSON array of {assetId, url} Loom references (PROG-CAL14). Images only, per the 2026-09-22 '
  'owner ruling. Validated in lib/calendar/plans.ts; counted by public.library_asset_usage.';

-- ── 2. The usage index sees a Plan ──────────────────────────────────────────────────────────
--
-- PROG-D4's promise is that "which records use this asset?" is answerable BEFORE an asset is
-- retired, and the safe-delete guard in app/(main)/admin/library/actions.ts refuses a delete it
-- could not prove safe. A store the scan does not know about is not a smaller answer, it is a
-- WRONG one: the Loom would report an attached image as unused and let it be deleted out from
-- under a Plan. So the Plan store joins the same live scan, in the same shape.
--
-- The body below is 20270345007500's, unchanged, plus one `docs` arm. Every path stays `strict`
-- for the reason that migration records: in lax mode `$.**` visits each array element twice and
-- every hit counts double. `$.**` descends into the array, so a ref at `files[2]` is found.
--
-- `live` is the Plan's own distinction: true while it is open, false once it is archived. An
-- ARCHIVED Plan still counts as a usage site on purpose. Archiving is reversible (`archived_at =
-- null`) and the Plan keeps its images, so treating it as unused would delete the asset out of a
-- Plan somebody is about to restore.
--
-- Unchanged: SECURITY INVOKER (no privilege of its own), service_role only (function-grants
-- verdict `internal`). The grants are restated because `create or replace` keeps whatever is
-- there, and a fresh database should not depend on the order two files happened to run in.

create or replace function public.library_asset_usage(p_asset_id uuid)
returns table (
  store text,
  space_id uuid,
  space_slug text,
  space_type text,
  doc_key text,
  live boolean,
  hits integer
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with vars as (
    select jsonb_build_object('id', p_asset_id::text) as v
  ),
  docs as (
    select 'pages'::text as store, p.space_id, p.slug as doc_key, true as live, p.published_data as doc
      from public.pages p where p.published_data is not null
    union all
    select 'pages', p.space_id, p.slug, false, p.data
      from public.pages p where p.data is not null
    union all
    select 'space_page', s.id, d.key, true, d.value
      from public.spaces s, jsonb_each(coalesce(s.preferences->'pageDocs', '{}'::jsonb)) d
    union all
    select 'space_page', s.id, 'home', true, s.preferences->'puck'
      from public.spaces s
     where s.preferences ? 'puck'
       and not coalesce(s.preferences->'pageDocs', '{}'::jsonb) ? 'home'
    union all
    select 'space_layout', s.id, 'profileLayout', true, s.preferences->'profileLayout'
      from public.spaces s where s.preferences ? 'profileLayout'
    union all
    select 'space_layout', s.id, 'profileLayoutDraft', false, s.preferences->'profileLayoutDraft'
      from public.spaces s where s.preferences ? 'profileLayoutDraft'
    union all
    -- PROG-CAL14: the images a team attached to a Plan.
    select 'space_plan', p.space_id, p.id::text, p.archived_at is null, p.files
      from public.space_plans p where jsonb_typeof(p.files) = 'array'
  )
  select d.store,
         d.space_id,
         s.slug  as space_slug,
         s.type  as space_type,
         d.doc_key,
         d.live,
         jsonb_array_length(jsonb_path_query_array(d.doc, 'strict $.** ? (@.assetId == $id)', vars.v))::integer as hits
    from docs d
   cross join vars
    left join public.spaces s on s.id = d.space_id
   where jsonb_typeof(d.doc) in ('object', 'array')
     and jsonb_path_exists(d.doc, 'strict $.** ? (@.assetId == $id)', vars.v)
   order by d.store, s.slug nulls last, d.doc_key, d.live desc;
$$;

comment on function public.library_asset_usage(uuid) is
  'PROG-D4 usage index (ADR-1502), extended by PROG-CAL14: every stored document that references '
  'this Loom asset (an {assetId,url} ref at any depth), including a Space Plan''s images, one row '
  'per document per live/draft copy, with the hit count. A live scan, not a table: exact by '
  'construction, nothing to refresh or rebuild. SECURITY INVOKER; service_role only.';

revoke all on function public.library_asset_usage(uuid) from public, anon, authenticated;
grant execute on function public.library_asset_usage(uuid) to service_role;
