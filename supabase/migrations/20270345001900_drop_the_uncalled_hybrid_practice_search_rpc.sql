-- ============================================================================
-- DROP THE UNCALLED HYBRID PRACTICE SEARCH RPC (LIVE-163, 2026-09-07)
-- ============================================================================
--
-- THE DEFECT. public.search_practices_hybrid has been defined, granted and
-- unreachable since 20260827000100 (ADR-438, Phase 1). Nothing calls it: the
-- only `.rpc(` names in the practice path are match_practices (the vector
-- nearest-neighbour behind the near-dup detector, lib/practices.ts and
-- lib/practices/clean.ts) and practice_admin_facets. Practice search never took
-- the RRF path this function was built for.
--
-- 🔴 WHY WIRING IT WAS THE WRONG CLOSE, which is the part worth keeping. The
-- function's own header names its intended consumers and rules BOTH of them out
-- for this signature:
--
--   * The MEMBER-facing path (searchLibraryPractices, used by /discover and the
--     practices-library widget) cannot take it. The header says so directly:
--     "service_role ONLY: the include_hidden escape hatch would leak non-public
--     practice ids to any authenticated caller ... A hardened, is_public-locked
--     variant is the move when member-facing hybrid search is wired." So a
--     member-facing wiring builds a DIFFERENT function; this one would still be
--     left uncalled behind it.
--   * The ADMIN workspace exists (app/(main)/admin/content/practices) and does
--     not want RRF: it filters through practice_admin_facets and finds
--     near-duplicates through match_practices. Neither needs a fused rank.
--
-- So the choice the row offered ("either wire, or drop") resolves to drop: the
-- signature that survives is not the one anybody would call, and keeping it
-- keeps a SECURITY DEFINER function whose include_hidden parameter reads
-- non-public rows, for no consumer at all. Deleting an unused privileged
-- function is a small security win, not only tidiness.
--
-- WHAT IS DELIBERATELY KEPT. Everything the function READ stays exactly as it
-- is, because it is all live for other consumers:
--   * practices.search_vector and its GIN index (full-text, still used by the
--     library search's text filter),
--   * practices.embedding and its HNSW index (still used by match_practices),
--   * match_practices itself, which is called and must not be touched.
-- Re-adding a hardened variant later is a create-or-replace against the same
-- two columns; nothing here makes that harder.
--
-- ⚪ THE OTHER HALF OF LIVE-163 IS NOT ACTIONED, AND MUST NOT BE. The row also
-- named housing_lifestyle_agreement as uncalled and asked for it to be dropped.
-- It is NOT uncalled: read live from pg_proc, both housing_match_candidates and
-- housing_roommate_matches reference it in their bodies, and
-- housing_match_candidates is called from lib/listings/housing.ts. Dropping it
-- would break roommate matching. The row's probe encoded that mistaken half as a
-- PASS CONDITION, so satisfying the probe as written would have required causing
-- a regression; the probe is repointed in the same change.
--
-- No grants line survives the drop: scripts/function-grants.txt loses its
-- `search_practices_hybrid internal` row in this same commit.
--
-- IDEMPOTENT: drop if exists, signature-qualified.
-- ============================================================================

begin;

drop function if exists public.search_practices_hybrid(text, vector, int, int, boolean);

do $$
begin
  -- NEGATIVE: the uncalled function is gone, under any overload.
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'search_practices_hybrid'
  ) then
    raise exception 'search_practices_hybrid survived the drop';
  end if;

  -- POSITIVE: match_practices is CALLED and must still be here. If a wildcard or
  -- a mistyped signature had taken it, the near-dup detector would break silently.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'match_practices'
  ) then
    raise exception 'match_practices is gone - the drop took a live function';
  end if;

  -- POSITIVE: so is housing_lifestyle_agreement, which the row wrongly called
  -- uncalled. Asserted here so a future reader acting on the row's original
  -- wording trips this rather than breaking roommate matching.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'housing_lifestyle_agreement'
  ) then
    raise exception 'housing_lifestyle_agreement is gone - it is CALLED by housing_match_candidates';
  end if;

  -- POSITIVE: the columns the dropped function read are untouched and still
  -- serve their live consumers.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'practices' and column_name = 'search_vector'
  ) then
    raise exception 'practices.search_vector is gone - the drop took the full-text column';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'practices' and column_name = 'embedding'
  ) then
    raise exception 'practices.embedding is gone - the drop took the vector column';
  end if;
end $$;

commit;

-- ROLLBACK. Re-run 20260827000100_practice_hybrid_search_rpc.sql verbatim; it is a
-- create-or-replace over columns this file leaves in place, so it restores the
-- function and its grants with no other change.
