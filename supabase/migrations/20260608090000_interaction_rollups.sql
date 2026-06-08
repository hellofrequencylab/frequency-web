-- =============================================================================
-- Interaction rollups — the feature-store + site-level aggregates (PI.2, ADR-166)
--
-- Two SECURITY DEFINER aggregates over the raw interaction_events firehose:
--   • member_interaction_stats(_days)  — per-member behavioral features; the nightly
--     trait refresh (lib/traits/refresh.ts) folds these into member_traits (the durable
--     per-member feature vector the AI + reward engine read).
--   • interaction_surface_stats(_days) — per-surface rollup (views, dwell, scroll, rage,
--     reach); the site-level view PI.4's AI reads to recommend surface changes.
--
-- Props are sanitized at the sink to primitives, so the ->> casts are safe; the FILTERs
-- guard non-numeric/absent keys. Read-only; the raw stream stays host-only (RLS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.member_interaction_stats(_days int DEFAULT 30)
RETURNS TABLE (
  profile_id          uuid,
  last_interaction_at timestamptz,
  interaction_count   bigint,
  active_days         bigint,
  surfaces            bigint,
  dwell_ms            bigint,
  sessions            bigint,
  scroll_avg          numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    profile_id,
    max(occurred_at),
    count(*),
    count(DISTINCT date_trunc('day', occurred_at)),
    count(DISTINCT surface),
    coalesce(sum((props->>'ms')::numeric) FILTER (WHERE kind = 'dwell'  AND props ? 'ms'),  0)::bigint,
    count(DISTINCT session_id),
    coalesce(avg((props->>'pct')::numeric) FILTER (WHERE kind = 'scroll' AND props ? 'pct'), 0)
  FROM interaction_events
  WHERE occurred_at >= now() - make_interval(days => _days)
    AND profile_id IS NOT NULL
  GROUP BY profile_id;
$$;

CREATE OR REPLACE FUNCTION public.interaction_surface_stats(_days int DEFAULT 30, _limit int DEFAULT 100)
RETURNS TABLE (
  surface          text,
  events           bigint,
  members          bigint,
  views            bigint,
  dwell_ms_avg     numeric,
  scroll_avg       numeric,
  rage_clicks      bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    surface,
    count(*),
    count(DISTINCT profile_id),
    count(*) FILTER (WHERE kind = 'view'),
    coalesce(avg((props->>'ms')::numeric) FILTER (WHERE kind = 'dwell'  AND props ? 'ms'),  0),
    coalesce(avg((props->>'pct')::numeric) FILTER (WHERE kind = 'scroll' AND props ? 'pct'), 0),
    count(*) FILTER (WHERE kind = 'rage_click')
  FROM interaction_events
  WHERE occurred_at >= now() - make_interval(days => _days)
    AND surface IS NOT NULL
  GROUP BY surface
  ORDER BY count(*) DESC
  LIMIT _limit;
$$;

-- Aggregates only (no row-level leakage); callable by the service role (refresh) and
-- operators. Surface stats are non-PII; the per-member RPC returns ids the caller (host+
-- admin surfaces / the service-role cron) already governs.
REVOKE ALL ON FUNCTION public.member_interaction_stats(int) FROM public;
REVOKE ALL ON FUNCTION public.interaction_surface_stats(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.member_interaction_stats(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.interaction_surface_stats(int, int) TO service_role, authenticated;
