-- The analytics RPCs were readable by anyone with the anon key, twice over (ADR-961).
--
-- TWO INDEPENDENT LOCKS WERE BOTH OPEN on public.journey_funnel and public.vitals_p75.
--
-- LOCK 1, the grant. 20270207000000 ends with the house idiom:
--     revoke all on function ... from public;
--     grant execute on function ... to service_role;
-- Its stated intent is that only service_role may call these. Verified against the live
-- database on 2026-08-10, `has_function_privilege('anon', ..., 'EXECUTE')` returns TRUE for
-- both. This is the ADR-959 trap exactly: Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA
-- public` granting anon/authenticated EXECUTE on new functions, those land as EXPLICIT
-- per-role grants, and `REVOKE ... FROM public` does not touch them. The revoke ran, reported
-- success, and removed nothing. ADR-959 said "every instance has the same hole" — this is the
-- first one found by looking, and it was written AFTER the ADR.
--
-- LOCK 2, the guard, and this is the worse half. Both functions open with:
--     if auth.uid() is not null
--        and coalesce(private.get_my_web_role(), 'none') not in ('admin', 'janitor') then
--       raise exception 'not authorized ...';
--     end if;
-- The condition is INVERTED with respect to the threat. For an anonymous caller auth.uid() is
-- NULL, so the first conjunct is false, the exception never raises, and execution falls
-- straight through to the data. A signed-in ordinary member is blocked; an anonymous stranger
-- is not. The guard reads as a check and behaves as a welcome mat.
--
-- Neither lock covered the other, so the RPCs were genuinely reachable with the publishable
-- anon key that ships in every browser bundle: platform journey-funnel conversion counts and
-- per-route p75 web-vitals. No personal data (both aggregate), which is why this is a serious
-- exposure rather than a breach.
--
-- THE FIX, both locks, in the order that matters if only one survives a future edit:
--   1. the guard now keys on auth.role(), so it fails CLOSED for anon instead of open. Both
--      callers use createAdminClient() (lib/analytics/insights-read.ts), so service_role must
--      keep passing, and an admin/janitor SESSION still passes for any future in-app caller.
--      `auth.role() is distinct from 'service_role'` is the established idiom in this repo —
--      see 20240304000000_lock_economy_columns.sql.
--   2. the grants are revoked from the two roles that actually held them, by name. Naming the
--      roles is the whole point; `from public` is what failed.
--
-- Behaviour-preserving for every real caller: both RPCs are reached only through the
-- service-role client, and service_role is unaffected by both changes.
--
-- delete_topical_channel carries the same inverted condition and is corrected here too. It is
-- latent rather than live (neither anon nor authenticated holds EXECUTE on it), but it is a
-- MUTATION, so leaving a fail-open guard in it because the grant happens to be closed today is
-- the same bet that lost above.

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
  if auth.role() is distinct from 'service_role'
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
  if auth.role() is distinct from 'service_role'
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


-- Lock 1, restored. `from public` is what failed in 20270207000000; naming the roles is the fix.
revoke execute on function public.journey_funnel(text, jsonb, int) from anon, authenticated;
revoke execute on function public.vitals_p75(int, text, text)      from anon, authenticated;

-- Latent, not live: this one already revokes from anon and authenticated BY NAME (see
-- 20270116000000 lines 74-75, the idiom the insights migration should have used). The guard is
-- corrected anyway, because it is a delete and the grant is the only thing holding it.
create or replace function public.delete_topical_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role'
     and coalesce(private.get_my_web_role(), 'none') not in ('admin', 'janitor') then
    raise exception 'not authorized to delete a Channel'
      using errcode = '42501';
  end if;

  -- The forum. Replies/mentions/reactions cascade from each post.
  delete from public.posts where scope_id = p_channel_id;

  -- The open room. Members + messages cascade from it. The visibility filter keeps this from ever
  -- matching a same-id room of another kind, even though scope_id is a uuid and cannot collide.
  delete from public.rooms where visibility = 'channel' and scope_id = p_channel_id;

  -- The Channel itself: memberships cascade, and every Circle that practiced here is released
  -- (topical_channel_id -> null) rather than deleted.
  delete from public.topical_channels where id = p_channel_id;
end;
$$;
