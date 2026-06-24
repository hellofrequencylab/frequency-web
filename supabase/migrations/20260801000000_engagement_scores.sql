-- Resonance Engine Phase 2 (ADR-383 - docs/NEXT-GEN-CRM.md "The brilliant admin dashboard").
-- The READ LAYER for the dashboard's aggregates: a MATERIALIZED VIEW over member_traits that
-- pivots each member's dashboard-relevant traits into one row, plus SECURITY DEFINER RPCs that
-- read it for the platform + per-Space cockpits. Reads NEVER raw-scan member_traits live (it is
-- one tall row-per-trait table); they go through this matview + the RPCs.
--
-- FAIL-SAFE BY DESIGN (ADR-246): the dashboard read layer (lib/dashboard/scores.ts) calls these
-- RPCs and degrades to zeros when the matview/RPC is absent (pre-migration) or errors. So a deploy
-- before this migration applies shows an empty-but-calm cockpit, never a crash.
--
-- ACCESS: aggregates only (no row-level leakage of who-is-who beyond the ids the caller already
-- governs). The matview + RPCs are service-role + authenticated-staff readable; the dashboard pages
-- gate on the staff floor (platform) / the Space CRM entitlement (Space) BEFORE calling, exactly like
-- the existing member_interaction_stats rollup. No new gate is introduced here.
--
-- House style: additive + idempotent (safe to re-run); applied via the Supabase SQL editor; reached
-- untyped until lib/database.types.ts is regenerated (ADR-246). No em or en dashes in any copy here.

-- ── The pivoted member-health matview ───────────────────────────────────────────────────────────
-- One row per member, the dashboard-relevant traits pivoted from the tall member_traits store. This
-- is the durable, cheap-to-scan surface the cockpit aggregates read (a fresh nightly snapshot, not a
-- live recompute). FILTER pivots keep it one pass over the table.
create materialized view if not exists public.member_engagement_scores as
select
  t.profile_id,
  max(t.value_num)  filter (where t.trait_key = 'resonance_health')      as resonance_health,
  max(t.value_text) filter (where t.trait_key = 'resonance_tier')        as resonance_tier,
  max(t.value_text) filter (where t.trait_key = 'lifecycle_stage')       as lifecycle_stage,
  max(t.value_text) filter (where t.trait_key = 'churn_risk')            as churn_risk,
  max(t.value_text) filter (where t.trait_key = 'next_best_action')      as next_best_action,
  max(t.value_num)  filter (where t.trait_key = 'activation_propensity') as activation_propensity,
  max(t.value_num)  filter (where t.trait_key = 'rfm_score')             as rfm_score,
  bool_or(t.value_bool) filter (where t.trait_key = 'wam_status')        as wam_status,
  max(t.value_text) filter (where t.trait_key = 'join_cohort')           as join_cohort,
  max(t.value_ts)   filter (where t.trait_key = 'last_active_at')        as last_active_at,
  max(t.computed_at)                                                     as computed_at
from public.member_traits t
group by t.profile_id;

-- A unique index is required to REFRESH MATERIALIZED VIEW CONCURRENTLY (no read-lock during refresh).
create unique index if not exists member_engagement_scores_pid_idx
  on public.member_engagement_scores (profile_id);
-- Tier + lifecycle are the cockpit's primary filters (at-risk count, funnel buckets).
create index if not exists member_engagement_scores_tier_idx
  on public.member_engagement_scores (resonance_tier);
create index if not exists member_engagement_scores_lifecycle_idx
  on public.member_engagement_scores (lifecycle_stage);

comment on materialized view public.member_engagement_scores is
  'Resonance Engine dashboard read layer (ADR-383). Per-member pivot of member_traits (resonance_health/tier, lifecycle, churn, next_best_action, propensity, rfm, wam, cohort). Refreshed after the nightly trait refresh; the cockpit RPCs read this, never raw member_traits. Fail-safe: callers degrade to zeros when absent.';

-- ── Platform health summary (the cockpit stat row) ──────────────────────────────────────────────
-- ONE aggregate row: the platform mean health, the tier counts, the at-risk count, and the lifecycle
-- funnel counts. SECURITY DEFINER so it reads the matview regardless of the caller's RLS context; the
-- staff gate lives at the calling page. Aggregates only (no member ids leak here).
create or replace function public.dashboard_health_summary()
returns table (
  members            bigint,
  mean_health        numeric,
  resonant_count     bigint,
  cooling_count      bigint,
  at_risk_count      bigint,
  wam_count          bigint,
  stage_new          bigint,
  stage_activated    bigint,
  stage_engaged      bigint,
  stage_at_risk      bigint,
  stage_dormant      bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*),
    coalesce(round(avg(resonance_health)::numeric, 1), 0),
    count(*) filter (where resonance_tier = 'resonant'),
    count(*) filter (where resonance_tier = 'cooling'),
    count(*) filter (where resonance_tier = 'at_risk'),
    count(*) filter (where wam_status is true),
    count(*) filter (where lifecycle_stage = 'new'),
    count(*) filter (where lifecycle_stage = 'activated'),
    count(*) filter (where lifecycle_stage = 'engaged'),
    count(*) filter (where lifecycle_stage = 'at_risk'),
    count(*) filter (where lifecycle_stage = 'dormant')
  from public.member_engagement_scores;
$$;

-- ── Per-Space health summary ────────────────────────────────────────────────────────────────────
-- The same shape, scoped to the members reachable from a Space's CRM (the contacts whose touches sit
-- in this space_id on contact_interactions, the ADR-376 on-board contact set). _space_id is REQUIRED;
-- a null/empty arg returns zeros (fail-closed, no accidental platform-wide read through this path).
create or replace function public.dashboard_space_health_summary(_space_id uuid)
returns table (
  members            bigint,
  mean_health        numeric,
  resonant_count     bigint,
  cooling_count      bigint,
  at_risk_count      bigint,
  wam_count          bigint
)
language sql
security definer
set search_path = public
as $$
  with space_profiles as (
    -- Members reachable in this Space: the profile behind a contact whose touches are in this Space.
    select distinct c.profile_id as profile_id
    from public.contact_interactions ci
    join public.contacts c on c.id = ci.subject_id
    where ci.space_id = _space_id
      and ci.subject_kind = 'contact'
      and c.profile_id is not null
  )
  select
    count(*),
    coalesce(round(avg(s.resonance_health)::numeric, 1), 0),
    count(*) filter (where s.resonance_tier = 'resonant'),
    count(*) filter (where s.resonance_tier = 'cooling'),
    count(*) filter (where s.resonance_tier = 'at_risk'),
    count(*) filter (where s.wam_status is true)
  from public.member_engagement_scores s
  join space_profiles sp on sp.profile_id = s.profile_id
  where _space_id is not null;
$$;

-- ── Refresh wrapper (called by the nightly trait-refresh cron) ──────────────────────────────────
-- REFRESH MATERIALIZED VIEW CONCURRENTLY cannot be issued through PostgREST directly, so the cron
-- (lib/traits/refresh.ts) calls this SECURITY DEFINER wrapper. CONCURRENTLY keeps reads unblocked
-- during the refresh (the unique index above makes that possible). Service-role only.
create or replace function public.refresh_member_engagement_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.member_engagement_scores;
end;
$$;

-- Aggregates only; the matview + RPCs are readable by the service role (the refresh + server reads)
-- and authenticated staff (the gated cockpit). The page-level gate is the real authority.
revoke all on function public.dashboard_health_summary() from public;
revoke all on function public.dashboard_space_health_summary(uuid) from public;
revoke all on function public.refresh_member_engagement_scores() from public;
grant execute on function public.dashboard_health_summary() to service_role, authenticated;
grant execute on function public.dashboard_space_health_summary(uuid) to service_role, authenticated;
grant execute on function public.refresh_member_engagement_scores() to service_role;
grant select on public.member_engagement_scores to service_role;

-- Initial populate so the cockpit has data the moment the migration applies (the nightly trait
-- refresh + a follow-on REFRESH MATERIALIZED VIEW CONCURRENTLY keep it fresh thereafter).
refresh materialized view public.member_engagement_scores;

-- Rollback:
--   drop function if exists public.dashboard_space_health_summary(uuid);
--   drop function if exists public.dashboard_health_summary();
--   drop materialized view if exists public.member_engagement_scores;
