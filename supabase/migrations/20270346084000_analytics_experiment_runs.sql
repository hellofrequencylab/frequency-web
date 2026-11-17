-- LIVE-2307: the reviewed pilot can run again, pause stops its clock, guardrails are reviewed after
-- follow-up, and a completed result is frozen before retention can touch it. Additive only: every
-- existing row, assignment and exclusion counter is kept, and grants, RLS and definer settings
-- match 20270346050000_analytics_experiments.sql.
--   1. Runs. Each run is its own row (run 1, 2, ...), so its ID, assignment seed, assignments and
--      outcomes are separate from every earlier run, whose row and result stay as history. A
--      completed run can be re-drafted only after its guardrail review. At most one open run per key.
--   2. Pause. paused_at marks a pause that began inside the enrollment window; resuming adds the
--      paused time to paused_for, and every window is started_at + minimum_days + paused_for.
--   3. Review. finish closes enrollment only. review_guardrails is its own later command, refused
--      until the conversion follow-up after the close is over.
--   4. Snapshot. Per-arm totals are frozen into results_snapshot once follow-up is over (at the
--      review, or by the purge before it deletes anything), and results read the snapshot.
begin;
alter table public.analytics_experiments
  add column if not exists run int not null default 1 check (run >= 1),
  add column if not exists paused_at timestamptz,
  add column if not exists paused_for interval not null default interval '0' check (paused_for >= interval '0'),
  add column if not exists results_snapshot jsonb,
  add column if not exists results_snapshot_at timestamptz;
-- The key stays unique per run, and only one run of a key can be open at a time.
alter table public.analytics_experiments drop constraint if exists analytics_experiments_key_key;
create unique index if not exists analytics_experiments_key_run_idx on public.analytics_experiments(key, run);
create unique index if not exists analytics_experiments_one_open_run_idx on public.analytics_experiments(key) where status <> 'completed';

-- One arm's anonymous totals for one run, read live. Callers decide whether a snapshot replaces it.
create or replace function public.analytics_experiment_arm_totals(_experiment uuid, _variant text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select jsonb_build_object('exposed',count(a.profile_id),
      'excluded',case when _variant='control' then e.control_excluded else e.treatment_excluded end,
      'eligible',count(a.profile_id) filter(where a.exposed_at <= now()-make_interval(days=>e.conversion_days)),
      'converted',count(a.profile_id) filter(where a.exposed_at <= now()-make_interval(days=>e.conversion_days) and a.converted_at is not null),
      'pending',count(a.profile_id) filter(where a.exposed_at > now()-make_interval(days=>e.conversion_days)))
    into r
    from public.analytics_experiments e
    left join public.analytics_experiment_assignments a on a.experiment_id=e.id and a.variant=_variant and a.exposed_at is not null
    where e.id=_experiment
    group by e.id, e.control_excluded, e.treatment_excluded, e.conversion_days;
  return r;
end; $$;

create or replace function public.analytics_experiment_manage(_key text, _command text, _actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.analytics_experiments; closes timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  if _key <> 'upcoming-next-step' or _actor is null then raise exception 'invalid experiment'; end if;
  -- One command per key at a time, so two drafts cannot race to the same run number.
  perform pg_advisory_xact_lock(hashtext('analytics_experiment_manage:'||_key));
  select * into e from public.analytics_experiments where key = _key order by run desc limit 1 for update;
  if _command = 'draft' then
    if e.id is null then
      insert into public.analytics_experiments(key, run, primary_event, created_by, updated_by)
      values (_key, 1, 'event.rsvp', _actor, _actor) on conflict do nothing;
    elsif e.status = 'completed' then
      -- A new run starts only once the last one's follow-up is over and reviewed, so no member is
      -- still being observed in it. The earlier run's row, result and attribution stay untouched.
      if e.guardrails_reviewed_at is null then raise exception 'guardrail review missing'; end if;
      insert into public.analytics_experiments(key, run, primary_event, created_by, updated_by)
      values (_key, e.run + 1, 'event.rsvp', _actor, _actor) on conflict do nothing;
    end if;
    select * into e from public.analytics_experiments where key = _key order by run desc limit 1;
    if e.id is null then raise exception 'experiment draft missing'; end if;
    return e.id;
  end if;
  if e.id is null then raise exception 'experiment draft missing'; end if;
  closes := e.started_at + make_interval(days=>e.minimum_days) + e.paused_for;
  if _command = 'start' and e.status in ('draft','paused') then
    -- Resuming adds the paused time to the window; a pause that began after the close added nothing.
    update public.analytics_experiments set status='running', started_at=coalesce(started_at,now()),
      paused_for=paused_for + case when paused_at is not null then greatest(now()-paused_at, interval '0') else interval '0' end,
      paused_at=null, updated_by=_actor where id=e.id;
  elsif _command = 'pause' and e.status = 'running' then
    update public.analytics_experiments set status='paused', paused_at=case when now() < closes then now() end, updated_by=_actor where id=e.id;
  elsif _command = 'finish' and e.status in ('running','paused') then
    -- A pause inside the window keeps its remaining days, so it must be resumed and run out first.
    if e.paused_at is not null or now() < closes then raise exception 'minimum enrollment period incomplete'; end if;
    update public.analytics_experiments set status='completed', finished_at=closes, updated_by=_actor where id=e.id;
  elsif _command = 'review_guardrails' and e.status = 'completed' and e.guardrails_reviewed_at is null then
    if now() < e.finished_at + make_interval(days=>e.conversion_days) then raise exception 'guardrail follow-up incomplete'; end if;
    update public.analytics_experiments set guardrails_reviewed_at=now(),
      results_snapshot=coalesce(results_snapshot, jsonb_build_object('control',public.analytics_experiment_arm_totals(e.id,'control'),'treatment',public.analytics_experiment_arm_totals(e.id,'treatment'))),
      results_snapshot_at=coalesce(results_snapshot_at, now()), updated_by=_actor where id=e.id;
  else raise exception 'invalid experiment transition';
  end if;
  return e.id;
end; $$;

create or replace function public.analytics_experiment_assign(_key text, _profile uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.analytics_experiments; v text; closes timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select * into e from public.analytics_experiments where key=_key order by run desc limit 1;
  if e.id is null or _profile is null or e.started_at is null or now() < e.started_at then return null; end if;
  closes := e.started_at + make_interval(days=>e.minimum_days) + e.paused_for;
  -- Keep an already exposed variant through its follow-up, even after pausing or closing.
  select variant into v from public.analytics_experiment_assignments where experiment_id=e.id and profile_id=_profile
    and exposed_at >= e.started_at and exposed_at < closes
    and exposed_at <= now() and now() <= exposed_at + make_interval(days=>e.conversion_days);
  if v is not null then return jsonb_build_object('id',e.id,'variant',v); end if;
  if e.status <> 'running' or now() >= closes then return null; end if;
  -- The seed includes the run's own immutable ID: stable across deploys, re-randomized per run.
  v := case when (('x'||substr(md5(e.id::text||':'||_profile::text),1,8))::bit(32)::bigint % 10000) < e.treatment_percent * 100 then 'treatment' else 'control' end;
  insert into public.analytics_experiment_assignments(experiment_id,profile_id,variant) values(e.id,_profile,v) on conflict do nothing;
  select variant into v from public.analytics_experiment_assignments where experiment_id=e.id and profile_id=_profile;
  return jsonb_build_object('id',e.id,'variant',v);
end; $$;

create or replace function public.analytics_experiment_expose(_experiment uuid, _profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  update public.analytics_experiment_assignments a set exposed_at=coalesce(a.exposed_at,now())
  from public.analytics_experiments e where e.id=a.experiment_id and e.id=_experiment and a.profile_id=_profile and e.status='running' and now() >= e.started_at and now() < e.started_at + make_interval(days=>e.minimum_days) + e.paused_for;
end; $$;

create or replace function public.analytics_experiment_outcome(_event text, _profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  update public.analytics_experiment_assignments a set converted_at=coalesce(a.converted_at,now())
  from public.analytics_experiments e where e.id=a.experiment_id and a.profile_id=_profile
    and e.primary_event=_event and e.status in ('running','paused','completed')
    and a.exposed_at >= e.started_at and a.exposed_at < e.started_at + make_interval(days=>e.minimum_days) + e.paused_for and now() >= a.exposed_at and now() <= a.exposed_at + make_interval(days=>e.conversion_days);
end; $$;

-- Every run of every key, oldest run first. A frozen run reads its snapshot, never live rows.
create or replace function public.analytics_experiment_results()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.key, x.run),'[]'::jsonb) into r from (
    select e.id,e.key,e.run,e.status,e.started_at as "startedAt",e.finished_at as "finishedAt",
      e.guardrails_reviewed_at as "guardrailsReviewedAt", e.target_per_arm as "targetPerArm",e.minimum_days as "minimumDays",e.conversion_days as "conversionDays",
      coalesce(e.results_snapshot->'control', public.analytics_experiment_arm_totals(e.id,'control')) as control,
      coalesce(e.results_snapshot->'treatment', public.analytics_experiment_arm_totals(e.id,'treatment')) as treatment
    from public.analytics_experiments e
  ) x;
  return r;
end; $$;

-- One bounded bulk statement, reporting an exact count without returning identities. A completed
-- run whose follow-up is over is frozen first, so deleting its memberships cannot rewrite it.
create or replace function public.analytics_experiment_purge(_cutoff timestamptz)
returns bigint language plpgsql security definer set search_path = public as $$
declare removed bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  if _cutoff is null or _cutoff > now() - interval '180 days' then raise exception 'invalid retention cutoff'; end if;
  update public.analytics_experiments e set
    results_snapshot=jsonb_build_object('control',public.analytics_experiment_arm_totals(e.id,'control'),'treatment',public.analytics_experiment_arm_totals(e.id,'treatment')),
    results_snapshot_at=now()
  where e.status='completed' and e.results_snapshot is null and e.finished_at is not null
    and now() >= e.finished_at + make_interval(days=>e.conversion_days);
  delete from public.analytics_experiment_assignments where assigned_at < _cutoff;
  get diagnostics removed = row_count;
  return removed;
end; $$;

revoke all on function public.analytics_experiment_arm_totals(uuid,text), public.analytics_experiment_manage(text,text,uuid), public.analytics_experiment_assign(text,uuid), public.analytics_experiment_expose(uuid,uuid), public.analytics_experiment_outcome(text,uuid), public.analytics_experiment_results(), public.analytics_experiment_purge(timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_experiment_arm_totals(uuid,text), public.analytics_experiment_manage(text,text,uuid), public.analytics_experiment_assign(text,uuid), public.analytics_experiment_expose(uuid,uuid), public.analytics_experiment_outcome(text,uuid), public.analytics_experiment_results(), public.analytics_experiment_purge(timestamptz) to service_role;
commit;
