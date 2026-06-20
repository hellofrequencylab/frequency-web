-- =============================================================================
-- Profile zap-sum via a SQL aggregate (HARD-05, A-PLUS §6)
--
-- The member profile showed lifetime Zaps by reading EVERY crew_completions row
-- for the member and summing zaps_earned in app code (an O(rows) round-trip + a
-- JS reduce). This replaces that per-row tally with one SECURITY DEFINER aggregate
-- that returns the same total in a single query: no N+1, no growing payload.
--
-- Same total by construction: sum(zaps_earned) over the member's rows, with
-- coalesce(..., 0) so a member with no completions returns 0 (matching the old
-- reduce's 0 seed). zaps_earned is NOT NULL, so no per-row null coalesce is needed.
--
-- SECURITY DEFINER with a pinned search_path; the function returns only a single
-- aggregate count for the requested profile (no row data), mirroring the existing
-- aggregate RPCs (circle_momentum, your_impact; ADR-186).
-- =============================================================================

create or replace function public.profile_zap_total(_profile uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(zaps_earned), 0)::bigint
  from public.crew_completions
  where profile_id = _profile;
$$;

comment on function public.profile_zap_total is
  'A member''s lifetime Zaps earned from crew completions: one aggregate sum (HARD-05, A-PLUS §6). Replaces the per-row profile tally; returns 0 for a member with no completions.';
