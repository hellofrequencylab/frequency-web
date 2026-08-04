-- The two reads behind /admin/insights → Experience (UX-MATURITY-PLAN Lift 1a + Lift 7b).
--
-- Both are AGGREGATES over event tables that already exist. Nothing new is collected and
-- nothing is written: this migration adds two read functions and their grants, and that
-- is the whole of it.
--
-- ── journey_funnel ────────────────────────────────────────────────────────────────────
--
-- The five journeys that decide the product's fate (J1..J5) are defined in TypeScript,
-- at lib/analytics/journeys.ts, and NOT here. That is deliberate. A funnel definition is
-- product judgement that changes when a step changes; if SQL carried a second copy, the
-- registry and the query would drift the first time someone renamed a step, and the
-- drift would be invisible because both halves would still run. So the function takes
-- the ordered step spec as `_steps jsonb` straight from the registry (toFunnelSpec) and
-- walks it. `_journey_key` is carried for auditability and log-readability; it does not
-- select the steps. One source of truth, in the language that can be unit-tested.
--
-- Each step is `{key, stream, markers[], pathLike|null, withinDays|null}`:
--   stream 'engagement'  → public.engagement_events, subject = actor_profile_id, path in
--                          context->>'path', time = created_at.
--   stream 'interaction' → public.interaction_events, subject = session_id, path = path,
--                          time = occurred_at.
--
-- SEQUENTIAL, not per-step totals. A subject counts at step N only if it already counted
-- at step N-1 and its step-N event happened AFTER that one. `withinDays` additionally
-- caps the gap, which is how "logged again within 7 days" is expressed with the same
-- marker as the step before it.
--
-- THE IDENTITY SEAM. The semantic ledger is keyed by profile; the anonymous vitals
-- stream is keyed only by an ephemeral per-tab session id. There is no join key between
-- them and there must not be one: adding a profile id to the anonymous stream would drag
-- it inside the `analytics` consent scope (ADR-922). So when consecutive steps change
-- stream, the walk RESTARTS: the first step of the new run is counted ungated and
-- returns linked=false, and the readout refuses to print a conversion rate across it.
-- A funnel that quietly multiplied sessions by profiles would be a fabrication.
--
-- ── vitals_p75 ────────────────────────────────────────────────────────────────────────
--
-- p75 per (templated path, metric) over `interaction_events` where kind = 'web_vital',
-- with the SAME statistic over the immediately preceding window of equal length so the
-- readout can show a trend without a second round trip. Optional filters: one path, and
-- one viewport bucket (props->>'vp', Lift 7d). Rows missing 'vp' are simply not returned
-- when a viewport filter is supplied, so the function is correct both before and after
-- the collector starts writing that field.
--
-- ── Security posture (matches public.delete_topical_channel, 20270116000000) ──────────
--
-- SECURITY DEFINER because both read tables whose RLS is host-only, plus a two-lock authz:
-- OUTER, only service_role holds EXECUTE, so neither function is reachable on the public
-- REST surface at all (the only callers are server components going through the admin
-- client, which have already run requireAdmin). INNER, a role check kept as defense in
-- depth in case a later migration re-grants EXECUTE, and conditional on there BEING an
-- authenticated user: private.get_my_web_role() resolves auth.uid() and COALESCEs a miss
-- to 'none', so an unconditional check would refuse the service-role caller these
-- functions exist to serve, while reading as strict in review.
--
-- Neither function returns a profile id, a session id, or any row-level detail. Counts
-- and percentiles only, so there is no cross-tenant surface to leak.

-- ---------------------------------------------------------------------------------------
-- 1. journey_funnel(_journey_key, _steps, _days)
-- ---------------------------------------------------------------------------------------
create or replace function public.journey_funnel(
  _journey_key text,
  _steps jsonb,
  _days int default 30
)
returns table (
  step_index int,
  step_key   text,
  identity   text,
  subjects   bigint,
  linked     boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since      timestamptz;
  v_step       jsonb;
  v_i          int := 0;
  v_stream     text;
  v_identity   text;
  v_prev_ident text := null;
  v_linked     boolean;
  v_markers    text[];
  v_path_like  text;
  v_within     int;
  v_cohort     jsonb := '[]'::jsonb;
  v_next       jsonb;
  v_count      bigint;
begin
  if auth.uid() is not null
     and coalesce(private.get_my_web_role(), 'none') not in ('admin', 'janitor') then
    raise exception 'not authorized to read journey funnels'
      using errcode = '42501';
  end if;

  if _steps is null or jsonb_typeof(_steps) <> 'array' then
    return;
  end if;

  -- Clamp the window: 1 day to 1 year. The raw firehose is purged at 90 days anyway.
  v_since := now() - make_interval(days => greatest(1, least(coalesce(_days, 30), 365)));

  for v_step in select * from jsonb_array_elements(_steps)
  loop
    v_i := v_i + 1;
    v_stream := coalesce(v_step->>'stream', 'engagement');
    v_identity := case when v_stream = 'engagement' then 'actor' else 'session' end;
    v_linked := (v_prev_ident is not null and v_prev_ident = v_identity);
    v_path_like := nullif(v_step->>'pathLike', '');
    v_within := nullif(v_step->>'withinDays', '')::int;
    v_markers := coalesce(
      (select array_agg(m) from jsonb_array_elements_text(v_step->'markers') as t(m)),
      '{}'::text[]
    );

    -- The unified event source for this step. The `v_stream = ...` predicates are
    -- constant per iteration, so the planner prunes the unused branch outright.
    with cohort as (
      -- The previous step's survivors, materialized once per step rather than unnested
      -- per candidate row (an O(n*m) lateral would melt on a real cohort).
      select c.s as subject, c.at as prev_at
      from jsonb_to_recordset(v_cohort) as c(s text, at timestamptz)
    ),
    ev as (
      select e.actor_profile_id::text as subject,
             e.event_type             as marker,
             e.context->>'path'       as path,
             e.created_at             as at
      from public.engagement_events e
      where v_stream = 'engagement'
        and e.created_at > v_since
        and e.actor_profile_id is not null
        and e.event_type = any(v_markers)
      union all
      select i.session_id,
             i.kind,
             i.path,
             i.occurred_at
      from public.interaction_events i
      where v_stream = 'interaction'
        and i.occurred_at > v_since
        and i.session_id is not null
        and i.kind = any(v_markers)
    ),
    matched as (
      -- First step of a run: no gate. Later steps: the subject must already be in the
      -- cohort and this event must come after the one that put it there.
      select ev.subject, min(ev.at) as at
      from ev
      left join cohort on v_linked and cohort.subject = ev.subject
      where (v_path_like is null or ev.path like v_path_like)
        and (
          not v_linked
          or (
            cohort.prev_at is not null
            and ev.at > cohort.prev_at
            and (v_within is null or ev.at <= cohort.prev_at + make_interval(days => v_within))
          )
        )
      group by ev.subject
    )
    select coalesce(jsonb_agg(jsonb_build_object('s', m.subject, 'at', m.at)), '[]'::jsonb),
           count(*)
    into v_next, v_count
    from matched m;

    v_cohort := v_next;
    v_prev_ident := v_identity;

    step_index := v_i;
    step_key   := v_step->>'key';
    identity   := v_identity;
    subjects   := v_count;
    linked     := v_linked;
    return next;
  end loop;
end;
$$;

comment on function public.journey_funnel(text, jsonb, int) is
  'Sequential funnel over the semantic ledger for one of the five journeys. Steps come '
  'from lib/analytics/journeys.ts (toFunnelSpec), never from a copy in SQL. Restarts the '
  'walk at an identity seam (profile-keyed vs session-keyed) and reports linked=false '
  'there. Aggregates only. UX-MATURITY-PLAN Lift 1a.';

-- ---------------------------------------------------------------------------------------
-- 2. vitals_p75(_days, _path_template, _viewport)
-- ---------------------------------------------------------------------------------------
create or replace function public.vitals_p75(
  _days          int  default 28,
  _path_template text default null,
  _viewport      text default null
)
returns table (
  path          text,
  metric        text,
  p75           numeric,
  samples       bigint,
  prev_p75      numeric,
  prev_samples  bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days  int;
  v_start timestamptz;
  v_prev  timestamptz;
begin
  if auth.uid() is not null
     and coalesce(private.get_my_web_role(), 'none') not in ('admin', 'janitor') then
    raise exception 'not authorized to read vitals'
      using errcode = '42501';
  end if;

  -- The firehose is purged at 90 days, so two windows of >45 days cannot both be whole.
  v_days  := greatest(1, least(coalesce(_days, 28), 45));
  v_start := now() - make_interval(days => v_days);
  v_prev  := now() - make_interval(days => v_days * 2);

  return query
  with rows_in_scope as (
    select i.path                          as p,
           i.props->>'metric'              as m,
           (i.props->>'value')::numeric    as v,
           i.occurred_at                   as at
    from public.interaction_events i
    where i.kind = 'web_vital'
      and i.occurred_at > v_prev
      and i.path is not null
      and i.props ? 'value'
      and i.props->>'metric' is not null
      -- A numeric guard, because props is an open jsonb bag.
      and (i.props->>'value') ~ '^[0-9]+(\.[0-9]+)?$'
      and (_path_template is null or i.path = _path_template)
      and (_viewport is null or i.props->>'vp' = _viewport)
  )
  -- percentile_cont resolves to the double-precision overload; the cast back to numeric
  -- is what the RETURNS TABLE contract promises (and keeps a CLS of 0.0891 exact).
  select r.p,
         r.m,
         (percentile_cont(0.75) within group (order by r.v)
           filter (where r.at > v_start))::numeric,
         count(*) filter (where r.at > v_start)::bigint,
         (percentile_cont(0.75) within group (order by r.v)
           filter (where r.at <= v_start))::numeric,
         count(*) filter (where r.at <= v_start)::bigint
  from rows_in_scope r
  group by r.p, r.m
  having count(*) filter (where r.at > v_start) > 0
  order by count(*) filter (where r.at > v_start) desc, r.p, r.m;
end;
$$;

comment on function public.vitals_p75(int, text, text) is
  'p75 per templated path and metric over the anonymous web-vitals stream, alongside the '
  'same statistic for the previous window of equal length (the trend). Optional path and '
  'viewport-bucket filters. Reads no account data. UX-MATURITY-PLAN Lift 7b.';

-- ---------------------------------------------------------------------------------------
-- 3. Grants. Service role only: both callers are server components behind requireAdmin,
--    reaching the database through the admin client. Keeping the grant off `anon` and
--    `authenticated` keeps these off /rest/v1/rpc entirely rather than merely guarded there.
-- ---------------------------------------------------------------------------------------
revoke all on function public.journey_funnel(text, jsonb, int) from public;
revoke all on function public.vitals_p75(int, text, text)       from public;
grant execute on function public.journey_funnel(text, jsonb, int) to service_role;
grant execute on function public.vitals_p75(int, text, text)       to service_role;
