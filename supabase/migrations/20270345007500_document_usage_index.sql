-- THE USAGE INDEX IS A QUERY, NOT A TABLE (PROG-D4, ADR-1502).
--
-- WHAT THIS ANSWERS. Two questions the Loom and the editor program could not answer before:
--   1. "Which documents reference Loom asset X?"   -> public.library_asset_usage(uuid)
--   2. "Which documents place block type Y, and in how many tenants?" -> public.block_type_usage(text)
-- The second is the gate PROG-E2 named: "which tenants use this block" must be answerable BEFORE
-- the first block retirement, or tenant pages break silently (ADR-975, EDITOR-ARCHITECTURE T-4).
--
-- WHY A FUNCTION AND NOT `block_usage` ROWS. ADR-975 sketched a derived table fed by an
-- app_instances trigger plus a periodic JSONB scan. Re-tested against production on 2026-09-21
-- (ADR-1082, premise first):
--   * no usage table exists (library_usages was dropped by 20260925000000; block_usage was never
--     created), and public.app_instances does not exist either, so the trigger half has no table
--     to fire on;
--   * ZERO block documents carry an AssetRef today: every jsonb column in `public` was swept for
--     "assetId" and the only hits are 16 ledger-metadata rows in gem_transactions / zap_transactions,
--     which are not documents; pages (4 rows, 1 published), spaces.preferences.pageDocs (19 docs),
--     page_settings.layout (33 rows) all read 0;
--   * the whole corpus is 56 documents, about 70 kB, and the scan below runs in 3.1 ms with 126
--     shared buffer hits (EXPLAIN ANALYZE, production).
-- A table refreshed on save would be apparatus without a patient: a second copy of the truth that
-- can drift, that needs a writer on every document save path (three today, more as Sites land),
-- and that starts empty. A scan of the live documents is exact by construction, has nothing to
-- rebuild, and is cheaper than the round-trip that would maintain the table. When the corpus
-- outgrows this (the number to watch is the execution time of library_asset_usage, and the point
-- where it matters is the Loom detail drawer opening slower than the page around it), the
-- materialisation ADR-975 describes drops in BEHIND these two signatures: callers do not change.
--
-- WHAT IS SCANNED, and why each store is here:
--   pages.published_data / pages.data           the marketing site's Puck documents (live / draft)
--   spaces.preferences.pageDocs[*]              every Space profile page's Puck document
--   spaces.preferences.puck                     the legacy single Home doc (readPageDoc falls back
--                                               to it when pageDocs.home is absent; same rule here)
--   spaces.preferences.profileLayout / -Draft   the Space entity-block grid (rows/cells of block ids,
--                                               content map of authored values incl. images)
--   page_settings.layout                        module-engine placements (slots.*.order[]), block
--                                               census only: a module placement holds no image
-- A ref is any object with `assetId` at any depth ($.**), the exact shape lib/library/asset-ref.ts
-- writes. A placed Puck block is any object with BOTH `type` and `props` at any depth, which is
-- what a ContentItem is and what a rich-text node (type without props) is not; that is how nested
-- slot children are counted without counting prose marks.
--
-- EVERY PATH IS `strict`, and that is load-bearing. In lax mode (the default) `$.**` unwraps arrays
-- at every level and visits each array element TWICE, so a document with two refs to one asset
-- reported three hits and every block in `content[]` counted double (measured on a literal
-- document before this shipped). Strict mode visits each node once; inside a filter, a strict-mode
-- error (asking a scalar for `.props`) is simply false, so scalars and nulls are skipped, not raised.
--
-- SECURITY. SECURITY INVOKER on purpose: the functions add no privilege of their own, so whoever
-- calls them sees exactly the rows their RLS already allows. They are granted to service_role only
-- (ledger verdict `internal` in scripts/function-grants.txt), because the one caller is the
-- Studio-gated server action behind the Loom detail drawer and the operator CLI; widening the grant
-- later costs one line and leaks nothing, since invoker semantics keep RLS in force.
--
-- House style: additive + idempotent (create or replace; explicit revokes). Rollback:
--   drop function if exists public.library_asset_usage(uuid);
--   drop function if exists public.block_type_usage(text);

-- ── 1. Which documents reference this asset? ────────────────────────────────────────────────

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
  'PROG-D4 usage index (ADR-1502): every stored block document that references this Loom asset '
  '(an {assetId,url} ref at any depth), one row per document per live/draft copy, with the hit '
  'count. A live scan, not a table: exact by construction, nothing to refresh or rebuild. '
  'SECURITY INVOKER; service_role only.';

-- ── 2. Which documents place this block type, across how many tenants? ──────────────────────
--
-- p_block_type null = the whole census (every type, every store). E2 reads this before retiring
-- a block; the operator CLI is `pnpm block-usage [type]`.

create or replace function public.block_type_usage(p_block_type text default null)
returns table (
  block_type text,
  store text,
  documents bigint,
  tenants bigint,
  placements bigint
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with docs as (
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
    select 'page_settings', ps.space_id, ps.route, true, ps.layout
      from public.page_settings ps where ps.layout is not null
  ),
  placed as (
    select d.store, d.space_id, d.doc_key, d.live, v #>> '{}' as block_type
      from docs d
     cross join lateral jsonb_path_query(
       d.doc,
       case d.store
         -- a Puck ContentItem: `type` AND `props`, at any depth (nested slots included)
         when 'pages'         then 'strict $.** ? (exists(@.props) && exists(@.type)).type'::jsonpath
         when 'space_page'    then 'strict $.** ? (exists(@.props) && exists(@.type)).type'::jsonpath
         -- the entity grid: rows[].cells[column][] are block ids
         when 'space_layout'  then 'strict $.rows[*].cells[*][*]'::jsonpath
         -- the module engine: every `order` list, in slots or at the legacy flat root
         when 'page_settings' then 'strict $.** ? (exists(@.order)).order[*]'::jsonpath
       end
     ) as v
     where jsonb_typeof(d.doc) in ('object', 'array')
       and jsonb_typeof(v) = 'string'
  )
  select pl.block_type,
         pl.store,
         count(distinct (pl.space_id, pl.doc_key, pl.live)) as documents,
         count(distinct pl.space_id)                        as tenants,
         count(*)                                           as placements
    from placed pl
   where p_block_type is null or pl.block_type = p_block_type
   group by pl.block_type, pl.store
   order by placements desc, pl.block_type, pl.store;
$$;

comment on function public.block_type_usage(text) is
  'PROG-D4 block census (ADR-1502), the gate PROG-E2 retires blocks behind: per block type and '
  'store, how many stored documents place it, across how many tenants, and how many placements. '
  'null = every type. A live scan over the same documents as library_asset_usage. '
  'SECURITY INVOKER; service_role only.';

-- ── Grants: service_role only (scripts/function-grants.txt verdict `internal`) ───────────────

revoke all on function public.library_asset_usage(uuid) from public, anon, authenticated;
revoke all on function public.block_type_usage(text) from public, anon, authenticated;
grant execute on function public.library_asset_usage(uuid) to service_role;
grant execute on function public.block_type_usage(text) to service_role;
