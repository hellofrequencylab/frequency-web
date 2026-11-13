-- Closed-catalog, signed-in, consented experiments. No model-authored executable variants.
begin;
create table if not exists public.analytics_experiments (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('upcoming-next-step')),
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  primary_event text not null check (primary_event = 'event.rsvp'),
  treatment_percent int not null default 50 check (treatment_percent between 1 and 50),
  target_per_arm int not null default 100 check (target_per_arm >= 30),
  minimum_days int not null default 7 check (minimum_days between 7 and 90),
  conversion_days int not null default 7 check (conversion_days between 1 and 28),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
  guardrails_reviewed_at timestamptz,
  control_excluded bigint not null default 0, treatment_excluded bigint not null default 0
);
create table if not exists public.analytics_experiment_assignments (
  experiment_id uuid not null references public.analytics_experiments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  variant text not null check (variant in ('control','treatment')),
  assigned_at timestamptz not null default now(), exposed_at timestamptz, converted_at timestamptz,
  primary key(experiment_id, profile_id)
);
create index if not exists analytics_experiments_created_by_idx on public.analytics_experiments(created_by);
create index if not exists analytics_experiments_updated_by_idx on public.analytics_experiments(updated_by);
create index if not exists analytics_experiment_assignments_profile_idx on public.analytics_experiment_assignments(profile_id);
create index if not exists analytics_experiment_assignments_age_idx on public.analytics_experiment_assignments(assigned_at);
alter table public.analytics_experiments enable row level security;
alter table public.analytics_experiment_assignments enable row level security;
revoke all on table public.analytics_experiments from public, anon, authenticated;
revoke all on table public.analytics_experiment_assignments from public, anon, authenticated;
grant all on public.analytics_experiments, public.analytics_experiment_assignments to service_role;

create or replace function public.analytics_experiment_manage(_key text, _command text, _actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.analytics_experiments;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  if _key <> 'upcoming-next-step' or _actor is null then raise exception 'invalid experiment'; end if;
  if _command = 'draft' then
    insert into public.analytics_experiments(key, primary_event, created_by, updated_by)
    values (_key, 'event.rsvp', _actor, _actor) on conflict(key) do nothing;
  end if;
  select * into e from public.analytics_experiments where key = _key for update;
  if e.id is null then raise exception 'experiment draft missing'; end if;
  if _command = 'start' and e.status in ('draft','paused') then
    update public.analytics_experiments set status='running', started_at=coalesce(started_at,now()), updated_by=_actor where id=e.id;
  elsif _command = 'pause' and e.status = 'running' then
    update public.analytics_experiments set status='paused', updated_by=_actor where id=e.id;
  elsif _command = 'finish' and e.status in ('running','paused') then
    if now() < e.started_at + make_interval(days=>e.minimum_days) then raise exception 'minimum enrollment period incomplete'; end if;
    update public.analytics_experiments set status='completed', finished_at=e.started_at + make_interval(days=>e.minimum_days), guardrails_reviewed_at=now(), updated_by=_actor where id=e.id;
  elsif _command <> 'draft' then raise exception 'invalid experiment transition';
  end if;
  return e.id;
end; $$;

create or replace function public.analytics_experiment_assign(_key text, _profile uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.analytics_experiments; v text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select * into e from public.analytics_experiments where key=_key;
  if e.id is null or _profile is null or e.started_at is null or now() < e.started_at then return null; end if;
  -- Keep an already exposed variant through its follow-up, even after pausing or closing.
  select variant into v from public.analytics_experiment_assignments where experiment_id=e.id and profile_id=_profile
    and exposed_at >= e.started_at and exposed_at < e.started_at + make_interval(days=>e.minimum_days)
    and exposed_at <= now() and now() <= exposed_at + make_interval(days=>e.conversion_days);
  if v is not null then return jsonb_build_object('id',e.id,'variant',v); end if;
  if e.status <> 'running' or now() >= e.started_at + make_interval(days=>e.minimum_days) then return null; end if;
  -- The seed includes the immutable experiment ID; assignments remain stable across deploys.
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
  from public.analytics_experiments e where e.id=a.experiment_id and e.id=_experiment and a.profile_id=_profile and e.status='running' and now() >= e.started_at and now() < e.started_at + make_interval(days=>e.minimum_days);
end; $$;

create or replace function public.analytics_experiment_outcome(_event text, _profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  update public.analytics_experiment_assignments a set converted_at=coalesce(a.converted_at,now())
  from public.analytics_experiments e where e.id=a.experiment_id and a.profile_id=_profile
    and e.primary_event=_event and e.status in ('running','paused','completed')
    and a.exposed_at >= e.started_at and a.exposed_at < e.started_at + make_interval(days=>e.minimum_days) and now() >= a.exposed_at and now() <= a.exposed_at + make_interval(days=>e.conversion_days);
end; $$;

create or replace function public.analytics_experiment_results()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x."startedAt" nulls last),'[]'::jsonb) into r from (
    select e.id,e.key,e.status,e.started_at as "startedAt",e.finished_at as "finishedAt",
      e.guardrails_reviewed_at as "guardrailsReviewedAt", e.target_per_arm as "targetPerArm",e.minimum_days as "minimumDays",e.conversion_days as "conversionDays",
      (select jsonb_build_object('exposed',count(*),'excluded',e.control_excluded,'eligible',count(*) filter(where a.exposed_at <= now()-make_interval(days=>e.conversion_days)),
        'converted',count(*) filter(where a.exposed_at <= now()-make_interval(days=>e.conversion_days) and a.converted_at is not null),
        'pending',count(*) filter(where a.exposed_at > now()-make_interval(days=>e.conversion_days)))
       from public.analytics_experiment_assignments a where a.experiment_id=e.id and a.variant='control' and a.exposed_at is not null) as control,
      (select jsonb_build_object('exposed',count(*),'excluded',e.treatment_excluded,'eligible',count(*) filter(where a.exposed_at <= now()-make_interval(days=>e.conversion_days)),
        'converted',count(*) filter(where a.exposed_at <= now()-make_interval(days=>e.conversion_days) and a.converted_at is not null),
        'pending',count(*) filter(where a.exposed_at > now()-make_interval(days=>e.conversion_days)))
       from public.analytics_experiment_assignments a where a.experiment_id=e.id and a.variant='treatment' and a.exposed_at is not null) as treatment
    from public.analytics_experiments e
  ) x;
  return r;
end; $$;
revoke all on function public.analytics_experiment_manage(text,text,uuid), public.analytics_experiment_assign(text,uuid), public.analytics_experiment_expose(uuid,uuid), public.analytics_experiment_outcome(text,uuid), public.analytics_experiment_results() from public, anon, authenticated;
grant execute on function public.analytics_experiment_manage(text,text,uuid), public.analytics_experiment_assign(text,uuid), public.analytics_experiment_expose(uuid,uuid), public.analytics_experiment_outcome(text,uuid), public.analytics_experiment_results() to service_role;
create or replace function public.analytics_experiment_count_exclusion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.exposed_at is not null then
    update public.analytics_experiments set
      control_excluded=control_excluded + case when old.variant='control' then 1 else 0 end,
      treatment_excluded=treatment_excluded + case when old.variant='treatment' then 1 else 0 end
    where id=old.experiment_id;
  end if;
  return old;
end; $$;
revoke all on function public.analytics_experiment_count_exclusion() from public, anon, authenticated;
grant execute on function public.analytics_experiment_count_exclusion() to service_role;
drop trigger if exists analytics_experiment_count_exclusion on public.analytics_experiment_assignments;
create trigger analytics_experiment_count_exclusion before delete on public.analytics_experiment_assignments for each row execute function public.analytics_experiment_count_exclusion();

create or replace function public.analytics_experiment_withdraw_consent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scope = 'analytics' and new.granted = false then
    delete from public.analytics_experiment_assignments where profile_id=new.profile_id;
  end if;
  return new;
end; $$;
revoke all on function public.analytics_experiment_withdraw_consent() from public, anon, authenticated;
grant execute on function public.analytics_experiment_withdraw_consent() to service_role;
drop trigger if exists analytics_experiment_withdraw_consent on public.consent_records;
create trigger analytics_experiment_withdraw_consent after insert on public.consent_records for each row execute function public.analytics_experiment_withdraw_consent();
-- One bounded bulk statement, reporting an exact count without returning identities.
create or replace function public.analytics_experiment_purge(_cutoff timestamptz)
returns bigint language plpgsql security definer set search_path = public as $$
declare removed bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  if _cutoff is null or _cutoff > now() - interval '180 days' then raise exception 'invalid retention cutoff'; end if;
  delete from public.analytics_experiment_assignments where assigned_at < _cutoff;
  get diagnostics removed = row_count;
  return removed;
end; $$;
revoke all on function public.analytics_experiment_purge(timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_experiment_purge(timestamptz) to service_role;
commit;
