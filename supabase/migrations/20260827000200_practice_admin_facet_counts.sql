-- =============================================================================
-- Practice library Phase 1 — admin facet counts RPC (ADR-438, PRACTICE-LIBRARY.md §5/§7).
--
-- The admin workspace's facet rail needs grouped counts across the WHOLE library
-- (no 200-row cap), not just a page. A grouped `.select` over PostgREST is awkward
-- for the dozen-or-so facets the rail shows, so this single SQL function returns one
-- flat table of (facet, key, count) rows the read layer pivots into the rail.
--
-- FACETS RETURNED (facet column → key meaning):
--   'pillar'      → domain_id::text          (null key = no Pillar; also surfaced as
--                                              the computed 'no_pillar' facet below)
--   'subcategory' → subcategory_id::text
--   'status'      → status                   (draft/pending/approved/rejected/archived)
--   'weight'      → weight_class             (light/standard/heavy)
--   'creator'     → created_by::text
--   'flag'        → 'public' | 'template' | 'featured'   (count of rows where TRUE/set)
--   'computed'    → 'no_image' | 'no_body' | 'never_logged' | 'no_pillar'
--   'tag'         → tag def id::text
--
-- SCOPE: this returns GLOBAL counts over the admin-visible universe (everything except,
-- when include_hidden is false, non-public rows). It deliberately does NOT scope to the
-- active filter set — see lib/practices.ts searchAdminFacets for the documented caveat
-- (the rail shows library-wide totals; faceted-minus-self scoping is a Phase-2 refinement).
-- The 'possible duplicate' computed facet is NOT here — it is expensive (pairwise title /
-- embedding similarity) and is gated behind an explicit call to match_practices() in the
-- read layer, never computed for the whole library on every rail render.
--
-- SECURITY: STABLE SECURITY DEFINER, search_path pinned to public (advisor:
-- function_search_path_mutable). No user text is interpolated — the only input is a
-- boolean. Granted to service_role only (the admin workspace reads through the service
-- role; never anon/authenticated, since this exposes non-public counts).
--
-- IDEMPOTENT: create-or-replace. Apply on a branch, verify, then merge (apply-on-merge).
-- =============================================================================

create or replace function public.practice_admin_facets(
  include_hidden boolean default true
)
returns table (
  facet text,
  key text,
  cnt bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with universe as (
    select p.*
    from public.practices p
    where include_hidden or p.is_public
  ),
  log_counts as (
    select practice_id, count(*) as n
    from public.practice_logs
    group by practice_id
  )
  -- Pillar
  select 'pillar'::text as facet, u.domain_id::text as key, count(*)::bigint as cnt
  from universe u
  group by u.domain_id
  union all
  -- Subcategory
  select 'subcategory', u.subcategory_id::text, count(*)::bigint
  from universe u
  group by u.subcategory_id
  union all
  -- Status (coalesce a null legacy status to 'approved' so the bucket is honest)
  select 'status', coalesce(u.status, 'approved'), count(*)::bigint
  from universe u
  group by coalesce(u.status, 'approved')
  union all
  -- Weight class
  select 'weight', coalesce(u.weight_class, 'standard'), count(*)::bigint
  from universe u
  group by coalesce(u.weight_class, 'standard')
  union all
  -- Creator
  select 'creator', u.created_by::text, count(*)::bigint
  from universe u
  where u.created_by is not null
  group by u.created_by
  union all
  -- Boolean flags (one row each; the count is "how many are TRUE/set")
  select 'flag', 'public', count(*) filter (where u.is_public)::bigint from universe u
  union all
  select 'flag', 'template', count(*) filter (where u.is_template)::bigint from universe u
  union all
  select 'flag', 'featured', count(*) filter (where u.featured_at is not null)::bigint from universe u
  union all
  -- Computed: no header image
  select 'computed', 'no_image', count(*) filter (where u.header_image is null or btrim(u.header_image) = '')::bigint
  from universe u
  union all
  -- Computed: no body
  select 'computed', 'no_body', count(*) filter (where u.body is null or btrim(u.body) = '')::bigint
  from universe u
  union all
  -- Computed: no Pillar
  select 'computed', 'no_pillar', count(*) filter (where u.domain_id is null)::bigint
  from universe u
  union all
  -- Computed: never logged (no row in practice_logs)
  select 'computed', 'never_logged', count(*) filter (where lc.n is null)::bigint
  from universe u
  left join log_counts lc on lc.practice_id = u.id
  union all
  -- Tags (canonical + folksonomy alike), counted over the admin-visible universe
  select 'tag', pt.tag_id::text, count(distinct pt.practice_id)::bigint
  from public.practice_tags pt
  join universe u on u.id = pt.practice_id
  group by pt.tag_id;
$$;

revoke all on function public.practice_admin_facets(boolean) from public, anon, authenticated;
grant execute on function public.practice_admin_facets(boolean) to service_role;

comment on function public.practice_admin_facets is
  'Phase-1 admin facet counts (ADR-438): one flat (facet, key, cnt) table across the admin-visible practice universe for the curation rail. GLOBAL counts (not active-filter-scoped — see lib/practices.ts searchAdminFacets caveat). Possible-duplicate facet is NOT here (expensive; gated behind match_practices at the read layer). service_role only.';
