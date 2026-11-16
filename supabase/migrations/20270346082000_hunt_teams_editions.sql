-- FH-043 and FH-044: Expedition teams, and the pins a seasonal edition relies on (Tier 5, Frequency Hunts
-- Build Plan).
--
-- TEAMS (FH-043). A team is a roster that shares ONE hunt_runs row, so the FH-006 key
-- (run_id, mission_key) is also "one credit per team and mission": two members who prove the same
-- stop earn one credit, whoever writes. Three tables, service role only like every Hunt table:
--   * hunt_teams: the team, its state (forming, locked, disbanded), the invite code's hash, its run
--   * hunt_team_members: the roster. A member is on at most one active team per Hunt; a departed
--     member keeps their row (left_at set) and never plays on that team again
--   * hunt_team_awards: who holds each unit of a team award, written once per (team, award)
-- The run's subject is always the team's current captain, so hunt_claim_apply (FH-010, left exactly
-- as it is) stays the one writer of a credit. Two things keep everyone else out:
--   * hunt_team_claim_apply is the door: it checks the locked roster, then calls hunt_claim_apply on
--     the team's run and returns its answer
--   * hunt_team_claim_wall is the wall: a BEFORE INSERT trigger on hunt_claims. A claim on a team's
--     run is refused unless its actor is an active member of a LOCKED roster, whoever calls and
--     through whichever function. An outsider and a departed member cannot write a claim at all.
-- Departure recovery: when the captain leaves, the longest-standing active member becomes captain
-- and the run moves to them with its credits; when the last member leaves the team is disbanded
-- and its run is withdrawn.
--
-- EDITIONS (FH-044). Two triggers make "an existing run keeps its rules" a database fact:
--   * hunt_run_pin: a run can never be moved to another version or another Hunt
--   * hunt_version_freeze: a published edition keeps its content hash, number and Hunt, and can only
--     move forward to superseded
--
-- Additive and idempotent. Nothing here changes hunt_claim_apply. ROLLBACK:
--   drop trigger if exists hunt_team_claim_wall on public.hunt_claims;
--   drop trigger if exists hunt_run_pin on public.hunt_runs;
--   drop trigger if exists hunt_version_freeze on public.hunt_versions;
--   drop function if exists public.hunt_team_award_allocate(uuid, uuid, text, integer);
--   drop function if exists public.hunt_team_leave(uuid, uuid);
--   drop function if exists public.hunt_team_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer);
--   drop function if exists public.hunt_team_lock(uuid, uuid);
--   drop function if exists public.hunt_team_join(uuid, uuid, text);
--   drop function if exists public.hunt_team_create(uuid, uuid, text, text, integer);
--   drop function if exists public.hunt_team_claim_wall_fn();
--   drop function if exists public.hunt_run_pin_fn();
--   drop function if exists public.hunt_version_freeze_fn();
--   drop table if exists public.hunt_team_awards;
--   drop table if exists public.hunt_team_members;
--   drop table if exists public.hunt_teams;

begin;

create table if not exists public.hunt_teams (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  version_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  state text not null default 'forming' check (state in ('forming','locked','disbanded')),
  -- sha256 hex of the invite code. The code itself is never stored; it is cleared when the roster locks.
  invite_hash text check (invite_hash is null or invite_hash ~ '^[0-9a-f]{64}$'),
  max_members smallint not null default 6 check (max_members between 2 and 12),
  run_id uuid unique references public.hunt_runs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id) on delete cascade,
  unique (id, hunt_id),
  check (state <> 'locked' or (locked_at is not null and invite_hash is null))
);
create index if not exists hunt_teams_version_idx on public.hunt_teams(version_id, hunt_id);
create index if not exists hunt_teams_hunt_idx on public.hunt_teams(hunt_id, state);
create index if not exists hunt_teams_created_by_idx on public.hunt_teams(created_by) where created_by is not null;

create table if not exists public.hunt_team_members (
  team_id uuid not null,
  hunt_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('captain','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (team_id, profile_id),
  foreign key (team_id, hunt_id) references public.hunt_teams(id, hunt_id) on delete cascade
);
-- One active team per member and Hunt, and one captain per team.
create unique index if not exists hunt_team_members_one_team_idx
  on public.hunt_team_members(hunt_id, profile_id) where left_at is null;
create unique index if not exists hunt_team_members_one_captain_idx
  on public.hunt_team_members(team_id) where role = 'captain' and left_at is null;
create index if not exists hunt_team_members_team_idx on public.hunt_team_members(team_id, hunt_id);
create index if not exists hunt_team_members_profile_idx on public.hunt_team_members(profile_id);

create table if not exists public.hunt_team_awards (
  team_id uuid not null,
  hunt_id uuid not null,
  award_key text not null check (award_key ~ '^[a-z0-9_-]{1,40}$'),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  units integer not null check (units >= 0),
  position smallint not null check (position >= 1),
  allocated_at timestamptz not null default now(),
  primary key (team_id, award_key, profile_id),
  unique (team_id, award_key, position),
  foreign key (team_id, hunt_id) references public.hunt_teams(id, hunt_id) on delete cascade
);
create index if not exists hunt_team_awards_team_idx on public.hunt_team_awards(team_id, hunt_id);
create index if not exists hunt_team_awards_profile_idx on public.hunt_team_awards(profile_id);

alter table public.hunt_teams enable row level security;
revoke all on table public.hunt_teams from public, anon, authenticated;
grant all on public.hunt_teams to service_role;
alter table public.hunt_team_members enable row level security;
revoke all on table public.hunt_team_members from public, anon, authenticated;
grant all on public.hunt_team_members to service_role;
alter table public.hunt_team_awards enable row level security;
revoke all on table public.hunt_team_awards from public, anon, authenticated;
grant all on public.hunt_team_awards to service_role;

-- ── The wall ─────────────────────────────────────────────────────────────────────────────────────

create or replace function public.hunt_team_claim_wall_fn()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  t public.hunt_teams%rowtype;
  member uuid;
begin
  select * into t from public.hunt_teams where run_id = new.run_id;
  if not found then
    return new;
  end if;
  -- hunt_team_claim_apply names the member who is really claiming; hunt_claim_apply itself only
  -- knows the run's subject (the captain). Without the setting the claim's own actor is checked.
  member := coalesce(nullif(current_setting('hunts.team_actor', true), '')::uuid, new.actor_profile_id);
  if t.state <> 'locked' or not exists (
    select 1 from public.hunt_team_members m
     where m.team_id = t.id and m.profile_id = member and m.left_at is null
  ) then
    raise exception 'hunt team run: the claimant is not on the locked roster' using errcode = '42501';
  end if;
  new.actor_profile_id := member;
  return new;
end;
$$;

drop trigger if exists hunt_team_claim_wall on public.hunt_claims;
create trigger hunt_team_claim_wall
  before insert on public.hunt_claims
  for each row execute function public.hunt_team_claim_wall_fn();

-- ── Create, join, lock ───────────────────────────────────────────────────────────────────────────

create or replace function public.hunt_team_create(
  p_actor uuid,
  p_hunt_id uuid,
  p_name text,
  p_invite_hash text,
  p_max_members integer default 6
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  h public.hunts%rowtype;
  team_id uuid;
begin
  if p_actor is null or p_hunt_id is null or p_name is null or p_invite_hash is null then
    raise exception 'hunt_team_create needs an actor, hunt, name and invite hash' using errcode = '22023';
  end if;
  -- One member forming or joining teams on one Hunt at a time.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':team:' || p_hunt_id::text, 0));

  select * into h from public.hunts where id = p_hunt_id;
  if not found or h.status <> 'live' or h.current_version_id is null then
    return jsonb_build_object('result', 'hunt_not_live');
  end if;
  if exists (select 1 from public.hunt_team_members where hunt_id = p_hunt_id and profile_id = p_actor and left_at is null) then
    return jsonb_build_object('result', 'already_on_team');
  end if;

  insert into public.hunt_teams (hunt_id, version_id, name, invite_hash, max_members, created_by)
  values (p_hunt_id, h.current_version_id, btrim(p_name), p_invite_hash, coalesce(p_max_members, 6), p_actor)
  returning id into team_id;
  insert into public.hunt_team_members (team_id, hunt_id, profile_id, role)
  values (team_id, p_hunt_id, p_actor, 'captain');
  insert into public.hunt_audit (hunt_id, actor_profile_id, action, target_kind, target_id)
  values (p_hunt_id, p_actor, 'team_created', 'team', team_id::text);

  return jsonb_build_object('result', 'created', 'team_id', team_id);
end;
$$;

create or replace function public.hunt_team_join(p_actor uuid, p_team_id uuid, p_invite_hash text)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  t public.hunt_teams%rowtype;
  existing public.hunt_team_members%rowtype;
  size integer;
begin
  if p_actor is null or p_team_id is null or p_invite_hash is null then
    raise exception 'hunt_team_join needs an actor, team and invite hash' using errcode = '22023';
  end if;

  select * into t from public.hunt_teams where id = p_team_id for update;
  -- A missing team, a wrong code and a roster that has locked (its code is gone) all read the same
  -- to someone who is not on the roster.
  select * into existing from public.hunt_team_members where team_id = p_team_id and profile_id = p_actor;
  if t.id is not null and existing.profile_id is not null then
    return jsonb_build_object('result', case when existing.left_at is null then 'already_member' else 'departed' end);
  end if;
  if t.id is null or t.state <> 'forming' or t.invite_hash is distinct from p_invite_hash then
    return jsonb_build_object('result', 'bad_invite');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':team:' || t.hunt_id::text, 0));
  if exists (select 1 from public.hunt_team_members where hunt_id = t.hunt_id and profile_id = p_actor and left_at is null) then
    return jsonb_build_object('result', 'already_on_team');
  end if;
  select count(*)::integer into size from public.hunt_team_members where team_id = t.id and left_at is null;
  if size >= t.max_members then
    return jsonb_build_object('result', 'team_full');
  end if;

  insert into public.hunt_team_members (team_id, hunt_id, profile_id) values (t.id, t.hunt_id, p_actor);
  insert into public.hunt_audit (hunt_id, actor_profile_id, action, target_kind, target_id)
  values (t.hunt_id, p_actor, 'team_joined', 'team', t.id::text);
  return jsonb_build_object('result', 'joined', 'team_id', t.id);
end;
$$;

create or replace function public.hunt_team_lock(p_actor uuid, p_team_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  t public.hunt_teams%rowtype;
  h public.hunts%rowtype;
  size integer;
  new_run uuid;
begin
  if p_actor is null or p_team_id is null then
    raise exception 'hunt_team_lock needs an actor and a team' using errcode = '22023';
  end if;

  select * into t from public.hunt_teams where id = p_team_id for update;
  if not found or not exists (
    select 1 from public.hunt_team_members where team_id = p_team_id and profile_id = p_actor and left_at is null
  ) then
    return jsonb_build_object('result', 'not_on_team');
  end if;
  if not exists (
    select 1 from public.hunt_team_members
     where team_id = p_team_id and profile_id = p_actor and left_at is null and role = 'captain'
  ) then
    return jsonb_build_object('result', 'not_captain');
  end if;
  if t.state = 'locked' then
    return jsonb_build_object('result', 'locked', 'team_id', t.id, 'run_id', t.run_id, 'replayed', true);
  end if;
  if t.state <> 'forming' then
    return jsonb_build_object('result', 'team_closed');
  end if;
  select count(*)::integer into size from public.hunt_team_members where team_id = t.id and left_at is null;
  if size < 2 then
    return jsonb_build_object('result', 'too_few_members');
  end if;
  select * into h from public.hunts where id = t.hunt_id;
  if h.status <> 'live' or h.current_version_id is distinct from t.version_id then
    return jsonb_build_object('result', 'hunt_not_live');
  end if;

  -- The team's run. Its subject is the captain; a new attempt number keeps it apart from any solo run.
  insert into public.hunt_runs (hunt_id, version_id, subject_profile_id, attempt_no)
  values (t.hunt_id, t.version_id, p_actor,
          (select coalesce(max(attempt_no), 0) + 1 from public.hunt_runs
            where version_id = t.version_id and subject_profile_id = p_actor))
  returning id into new_run;
  update public.hunt_teams
     set state = 'locked', locked_at = now(), invite_hash = null, run_id = new_run
   where id = t.id;
  insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
  values (t.hunt_id, new_run, p_actor, 'team_locked', 'team', t.id::text, jsonb_build_object('members', size));

  return jsonb_build_object('result', 'locked', 'team_id', t.id, 'run_id', new_run);
end;
$$;

-- ── The door ─────────────────────────────────────────────────────────────────────────────────────

create or replace function public.hunt_team_claim_apply(
  p_actor uuid,
  p_team_id uuid,
  p_mission_key text,
  p_placement_id uuid,
  p_evidence_id text,
  p_assurance text,
  p_idempotency_key text,
  p_request_hash text,
  p_expected_progress_count integer default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  t public.hunt_teams%rowtype;
  captain uuid;
  answer jsonb;
begin
  if p_actor is null or p_team_id is null or p_idempotency_key is null then
    raise exception 'hunt_team_claim_apply needs an actor, team and key' using errcode = '22023';
  end if;

  -- The team row lock queues every member of one team, so two members proving one stop go in turn.
  select * into t from public.hunt_teams where id = p_team_id for update;
  if not found or not exists (
    select 1 from public.hunt_team_members where team_id = p_team_id and profile_id = p_actor and left_at is null
  ) then
    -- An outsider and a departed member read the same answer, and nothing is written.
    return jsonb_build_object('result', 'not_on_team');
  end if;
  if t.state <> 'locked' or t.run_id is null then
    return jsonb_build_object('result', 'roster_not_locked');
  end if;
  select subject_profile_id into captain from public.hunt_runs where id = t.run_id;
  if captain is null then
    return jsonb_build_object('result', 'roster_not_locked');
  end if;

  -- The key is namespaced by the member, so two members cannot collide on, or replay, each other's key.
  perform set_config('hunts.team_actor', p_actor::text, true);
  answer := public.hunt_claim_apply(
    captain, t.run_id, p_mission_key, p_placement_id, p_evidence_id, p_assurance,
    'team:' || encode(sha256(convert_to(p_actor::text || ':' || p_idempotency_key, 'UTF8')), 'hex'),
    p_request_hash, p_expected_progress_count);
  perform set_config('hunts.team_actor', '', true);

  return answer || jsonb_build_object('team_id', t.id, 'run_id', t.run_id);
end;
$$;

-- ── Departure and recovery ───────────────────────────────────────────────────────────────────────

create or replace function public.hunt_team_leave(p_actor uuid, p_team_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  t public.hunt_teams%rowtype;
  me public.hunt_team_members%rowtype;
  successor uuid;
  run public.hunt_runs%rowtype;
begin
  if p_actor is null or p_team_id is null then
    raise exception 'hunt_team_leave needs an actor and a team' using errcode = '22023';
  end if;

  select * into t from public.hunt_teams where id = p_team_id for update;
  select * into me from public.hunt_team_members
   where team_id = p_team_id and profile_id = p_actor and left_at is null;
  if t.id is null or me.profile_id is null then
    return jsonb_build_object('result', 'not_on_team');
  end if;

  update public.hunt_team_members set left_at = now(), role = 'member'
   where team_id = p_team_id and profile_id = p_actor;
  insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id)
  values (t.hunt_id, t.run_id, p_actor, 'team_left', 'team', t.id::text);

  -- Longest standing first; the profile id breaks a tie so the answer never depends on row order.
  select profile_id into successor from public.hunt_team_members
   where team_id = p_team_id and left_at is null
   order by joined_at, profile_id
   limit 1;

  if successor is null then
    update public.hunt_teams set state = 'disbanded', invite_hash = null where id = t.id;
    if t.run_id is not null then
      update public.hunt_runs set state = 'withdrawn', revision = revision + 1
       where id = t.run_id and state = 'active';
    end if;
    return jsonb_build_object('result', 'left', 'disbanded', true);
  end if;

  if me.role = 'captain' then
    update public.hunt_team_members set role = 'captain' where team_id = p_team_id and profile_id = successor;
    if t.run_id is not null then
      -- The run and every credit on it stay with the team: only its subject moves.
      select * into run from public.hunt_runs where id = t.run_id for update;
      update public.hunt_runs
         set subject_profile_id = successor,
             attempt_no = (select coalesce(max(attempt_no), 0) + 1 from public.hunt_runs
                            where version_id = run.version_id and subject_profile_id = successor),
             revision = revision + 1
       where id = t.run_id;
    end if;
    insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
    values (t.hunt_id, t.run_id, p_actor, 'team_captain_passed', 'team', t.id::text, jsonb_build_object('captain', successor));
    return jsonb_build_object('result', 'left', 'disbanded', false, 'captain', successor);
  end if;

  return jsonb_build_object('result', 'left', 'disbanded', false);
end;
$$;

-- ── Award allocation ─────────────────────────────────────────────────────────────────────────────

create or replace function public.hunt_team_award_allocate(
  p_actor uuid,
  p_team_id uuid,
  p_award_key text,
  p_units integer
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  t public.hunt_teams%rowtype;
  size integer;
  shares jsonb;
begin
  if p_actor is null or p_team_id is null or p_award_key is null or p_units is null or p_units < 0 then
    raise exception 'hunt_team_award_allocate needs an actor, team, award key and a unit count' using errcode = '22023';
  end if;

  select * into t from public.hunt_teams where id = p_team_id for update;
  if not found or not exists (
    select 1 from public.hunt_team_members where team_id = p_team_id and profile_id = p_actor and left_at is null
  ) then
    return jsonb_build_object('result', 'not_on_team');
  end if;
  if t.state <> 'locked' then
    return jsonb_build_object('result', 'roster_not_locked');
  end if;

  -- Written once per team and award: a second call, by any member, reads the first allocation.
  if not exists (select 1 from public.hunt_team_awards where team_id = t.id and award_key = p_award_key) then
    select count(*)::integer into size from public.hunt_team_members where team_id = t.id and left_at is null;
    -- Equal shares; the units left over go one each to the longest-standing members.
    insert into public.hunt_team_awards (team_id, hunt_id, award_key, profile_id, units, position)
    select t.id, t.hunt_id, p_award_key, m.profile_id,
           p_units / size + case when m.position <= p_units % size then 1 else 0 end, m.position
      from (select profile_id, row_number() over (order by joined_at, profile_id)::integer as position
              from public.hunt_team_members where team_id = t.id and left_at is null) m;
    insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
    values (t.hunt_id, t.run_id, p_actor, 'team_award_allocated', 'team', t.id::text,
            jsonb_build_object('award_key', p_award_key, 'units', p_units));
    shares := null;
  else
    shares := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'result', 'allocated',
    'replayed', shares is not null,
    'shares', (select jsonb_agg(jsonb_build_object('profile_id', a.profile_id, 'units', a.units) order by a.position)
                 from public.hunt_team_awards a where a.team_id = t.id and a.award_key = p_award_key));
end;
$$;

revoke all on function public.hunt_team_claim_wall_fn() from public, anon, authenticated;
revoke all on function public.hunt_team_create(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.hunt_team_create(uuid, uuid, text, text, integer) to service_role;
revoke all on function public.hunt_team_join(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.hunt_team_join(uuid, uuid, text) to service_role;
revoke all on function public.hunt_team_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hunt_team_lock(uuid, uuid) to service_role;
revoke all on function public.hunt_team_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.hunt_team_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) to service_role;
revoke all on function public.hunt_team_leave(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hunt_team_leave(uuid, uuid) to service_role;
revoke all on function public.hunt_team_award_allocate(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.hunt_team_award_allocate(uuid, uuid, text, integer) to service_role;

-- ── Edition pins (FH-044) ────────────────────────────────────────────────────────────────────────

create or replace function public.hunt_run_pin_fn()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.version_id is distinct from old.version_id or new.hunt_id is distinct from old.hunt_id then
    raise exception 'a hunt run is pinned to the edition it started on' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists hunt_run_pin on public.hunt_runs;
create trigger hunt_run_pin
  before update on public.hunt_runs
  for each row execute function public.hunt_run_pin_fn();

create or replace function public.hunt_version_freeze_fn()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.status in ('published', 'superseded') and (
       new.content_hash is distinct from old.content_hash
    or new.version_no is distinct from old.version_no
    or new.hunt_id is distinct from old.hunt_id
    or new.published_at is distinct from old.published_at
    or (new.policy -> 'trail') is distinct from (old.policy -> 'trail')
    or new.status not in ('published', 'superseded')
    or (old.status = 'superseded' and new.status <> 'superseded')
  ) then
    raise exception 'a published hunt edition is frozen' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists hunt_version_freeze on public.hunt_versions;
create trigger hunt_version_freeze
  before update on public.hunt_versions
  for each row execute function public.hunt_version_freeze_fn();

revoke all on function public.hunt_run_pin_fn() from public, anon, authenticated;
revoke all on function public.hunt_version_freeze_fn() from public, anon, authenticated;

comment on table public.hunt_teams is 'FH-043 Frequency Hunts: an Expedition team. Its members share one run, so a stop credits once per team. Service role only.';
comment on table public.hunt_team_members is 'FH-043: a team roster. One active team per member and Hunt; a departed member keeps the row with left_at set. Service role only.';
comment on table public.hunt_team_awards is 'FH-043: who holds each unit of a team award, written once per team and award. Service role only.';
comment on function public.hunt_team_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) is 'FH-043: a roster member credits the team run through hunt_claim_apply. An outsider or departed member gets not_on_team and writes nothing. Service role only.';

commit;
