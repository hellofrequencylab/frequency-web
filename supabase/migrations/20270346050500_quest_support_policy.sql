-- LIVE-2291. Prospective participation contracts and immutable practice support evidence.
-- No backfill: NULL policy/evidence means the pre-existing contract or unknown history.
-- No currency, grant keys, completions or earned recognition are changed.
alter table public.journey_enrollments add column if not exists completion_policy jsonb;
alter table public.practice_logs add column if not exists support_pillar_ids uuid[];
alter table public.practice_logs add column if not exists support_evidence_version smallint;

comment on column public.journey_enrollments.completion_policy is
  'Immutable at enrollment. NULL preserves legacy qualification. Version 2 applies only to future official ranked fixed-window enrollments: same 14 distinct days, optional Expression.';
comment on column public.practice_logs.support_pillar_ids is
  'Actual known support IDs captured on first insertion. NULL is historical unknown, not an empty set. Reward allocation remains in the existing frozen split fields.';
comment on column public.practice_logs.support_evidence_version is
  '1 identifies the immutable complete support set captured at insertion; NULL means no such historical snapshot. Never backfilled from current practice categories.';

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.practice_logs'::regclass and conname='practice_logs_support_snapshot_shape') then
    alter table public.practice_logs add constraint practice_logs_support_snapshot_shape check (
      (support_evidence_version is null and support_pillar_ids is null) or
      (support_evidence_version is not null and support_evidence_version=1 and support_pillar_ids is not null and cardinality(support_pillar_ids)<=4 and array_position(support_pillar_ids,null) is null)
    );
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.journey_enrollments'::regclass and conname='journey_enrollment_completion_policy_shape') then
    alter table public.journey_enrollments add constraint journey_enrollment_completion_policy_shape check (
      completion_policy is null or coalesce((jsonb_typeof(completion_policy)='object' and completion_policy->>'version'='2'),false)
    );
  end if;
end $$;

create or replace function public.freeze_practice_support_evidence()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if TG_OP='UPDATE' then
    -- Reward stamping and partial-to-full timer completion may update the log, but cannot
    -- recategorize its original support evidence or manufacture snapshots for old rows.
    NEW.support_pillar_ids := OLD.support_pillar_ids;
    NEW.support_evidence_version := OLD.support_evidence_version;
    return NEW;
  end if;
  -- Ignore supplied snapshot values. Resolve actual canonical IDs inside the insert transaction.
  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[]) into NEW.support_pillar_ids
  from public.pillars p
  where p.slug in ('mind','body','spirit','expression') and exists (
    select 1 from public.practices practice where practice.id=NEW.practice_id
      and (p.id=practice.domain_id or p.id=practice.secondary_domain_id
        or (jsonb_typeof(practice.focus_details)='object' and jsonb_typeof(practice.focus_details->p.id::text)='object'))
  );
  NEW.support_evidence_version := 1;
  return NEW;
end $$;
revoke all on function public.freeze_practice_support_evidence() from public,anon,authenticated;
grant execute on function public.freeze_practice_support_evidence() to service_role;
drop trigger if exists freeze_practice_support_evidence on public.practice_logs;
create trigger freeze_practice_support_evidence before insert or update on public.practice_logs
for each row execute function public.freeze_practice_support_evidence();

create or replace function public.freeze_journey_completion_policy()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.journey_plans%rowtype; supports uuid[];
begin
  if TG_OP='UPDATE' then
    if OLD.completion_policy is not null and (
      NEW.profile_id is distinct from OLD.profile_id or NEW.plan_id is distinct from OLD.plan_id or
      NEW.run_id is distinct from OLD.run_id or NEW.started_at is distinct from OLD.started_at
    ) then
      raise exception 'completion_contract_is_immutable' using errcode='42501';
    end if;
    NEW.completion_policy := OLD.completion_policy;
    return NEW;
  end if;
  NEW.completion_policy := null; -- a caller cannot import or forge a policy
  select * into p from public.journey_plans where id=NEW.plan_id;
  if not coalesce(p.official,false) or not coalesce(p.ranked_eligible,false)
    or p.window_starts_at is null or p.window_ends_at is null
    or p.window_ends_at < p.window_starts_at then return NEW; end if;
  select coalesce(array_agg(distinct item.domain_id order by item.domain_id),'{}'::uuid[]) into supports
  from public.journey_plan_items item join public.pillars pillar on pillar.id=item.domain_id
  where item.plan_id=NEW.plan_id and pillar.slug in ('mind','body','spirit','expression');
  if cardinality(supports)<1 or cardinality(supports)>4 then return NEW; end if;
  NEW.completion_policy := jsonb_build_object(
    'version',2,'daysRequired',14,'expressionRequired',false,'practiceEvidenceVersion',1,
    'windowStart',(p.window_starts_at at time zone 'UTC')::date::text,
    'windowEnd',(p.window_ends_at at time zone 'UTC')::date::text,'pillarIds',to_jsonb(supports)
  );
  return NEW;
end $$;
revoke all on function public.freeze_journey_completion_policy() from public,anon,authenticated;
grant execute on function public.freeze_journey_completion_policy() to service_role;
drop trigger if exists freeze_journey_completion_policy on public.journey_enrollments;
create trigger freeze_journey_completion_policy before insert or update on public.journey_enrollments
for each row execute function public.freeze_journey_completion_policy();
