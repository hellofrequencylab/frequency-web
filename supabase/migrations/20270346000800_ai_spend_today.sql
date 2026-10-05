-- ============================================================================
-- THE DAILY AI SPEND CEILINGS SUM IN THE DATABASE (SCAN-737, 2026-10-05)
-- ============================================================================
--
-- THE GAP. lib/ai/usage.ts featureOverBudget and app/(main)/admin/ai/load-ai.ts read
-- today's ai_usage rows with a plain select and add cost_usd up in JS. PostgREST caps
-- every select at max_rows = 1000 (supabase/config.toml), service_role does not escape
-- it, and no error is raised. So once a UTC day passes 1,000 rows every sum covered an
-- arbitrary 1,000-row subset and always came out low: cheap Haiku rows read as about $5,
-- so the $25 global ceiling could never trip from the runaway it exists for, each
-- per-feature cap undercounted, and the operator spend table understated the day.
--
-- THE FUNCTIONS. One stable sum over today (UTC) with optional feature and Space filters,
-- and one grouped-by-feature read for the operator table. A sum in SQL has no row cap.
-- An RPC and not a PostgREST aggregate select, because aggregates are off unless
-- db_aggregates_enabled is set and this repo does not set it.
--
-- SECURITY DEFINER, service_role only. ai_usage is service-role written and RLS'd with
-- no member policy; the only callers are the admin client behind the caps and the
-- operator page. anon and authenticated are revoked by name (ADR-959: a revoke from
-- public alone leaves Supabase's per-role default grants).
--
-- The app keeps a paged .range() fallback for the window in which this migration sits
-- unapplied (the going-counts precedent).
--
-- Additive, idempotent (create or replace), safe to re-run. Rollback:
--   drop function if exists public.ai_spend_today(text, uuid);
--   drop function if exists public.ai_spend_by_feature_today();

create or replace function public.ai_spend_today(
  p_feature text default null,
  p_space uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(u.cost_usd), 0)::numeric
  from public.ai_usage u
  where u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    and (p_feature is null or u.feature = p_feature)
    and (p_space is null or u.space_id = p_space);
$$;

revoke execute on function public.ai_spend_today(text, uuid) from public, anon, authenticated;
grant execute on function public.ai_spend_today(text, uuid) to service_role;

comment on function public.ai_spend_today(text, uuid) is
  'Today''s (UTC) AI spend in USD, optionally for one feature and one Space. Summed in SQL so the PostgREST row cap cannot undercount it (SCAN-737). service_role only.';

create or replace function public.ai_spend_by_feature_today()
returns table (feature text, spent numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select u.feature, coalesce(sum(u.cost_usd), 0)::numeric as spent
  from public.ai_usage u
  where u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
  group by u.feature;
$$;

revoke execute on function public.ai_spend_by_feature_today() from public, anon, authenticated;
grant execute on function public.ai_spend_by_feature_today() to service_role;

comment on function public.ai_spend_by_feature_today() is
  'Today''s (UTC) AI spend in USD per feature for the operator AI page. Summed in SQL (SCAN-737). service_role only.';
