-- FH-021: Frequency Hunts reward specs, stock and the grant transaction (Tier 2, Rewards).
--
-- A reward is a deterministic spec on a published Hunt version: what it is, who qualifies, how many
-- exist, how many one player may hold, and the published stock terms the loser of a race is told. A
-- grant is one row per (reward, run). Both tables are service role only, like every Hunt table.
--
-- hunt_reward_grant is the one writer. It serialises on the reward row, so two qualifying players
-- racing the last unit take the lock in turn: the first is granted, the second reads the updated
-- count and gets `sold_out` with the published terms, and `granted_count` can never pass `stock`
-- (a check constraint is the backstop, whoever writes). It writes the grant, the count, the audit
-- row, one outbox row (consumer 'reward', so a delivery adapter can pay it out) and the idempotency
-- record together, or none of them. A refusal writes nothing.
--
-- Money never moves here. A reward that carries a price or a refund is the commerce rows
-- (FH-036 onward); revoking a grant is theirs. Additive and idempotent.

begin;

create table if not exists public.hunt_rewards (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  version_id uuid not null,
  reward_key text not null check (reward_key ~ '^[a-z0-9_-]{1,40}$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null default 'perk' check (kind in ('perk','badge','discount','item')),
  -- Who qualifies: {"run_state":"completed"} (the default) or {"missions":["a","b"]}, every named mission credited.
  eligibility jsonb not null default '{"run_state":"completed"}'::jsonb,
  stock integer check (stock is null or stock >= 0),
  granted_count integer not null default 0 check (granted_count >= 0),
  per_player_limit smallint not null default 1 check (per_player_limit between 1 and 10),
  -- Shown to a player who loses the race for the last unit; published with the reward, never invented at the moment.
  stock_terms text not null default 'First come, first served. Your finish still counts.' check (char_length(stock_terms) between 1 and 280),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id) on delete cascade,
  unique (hunt_id, version_id, reward_key),
  unique (id, hunt_id),
  check (stock is null or granted_count <= stock)
);
create index if not exists hunt_rewards_version_idx on public.hunt_rewards(version_id, hunt_id);
create index if not exists hunt_rewards_hunt_idx on public.hunt_rewards(hunt_id);

create table if not exists public.hunt_reward_grants (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  reward_id uuid not null,
  run_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'granted' check (state in ('granted','redeemed','revoked','expired')),
  grant_key text not null check (char_length(grant_key) between 8 and 200),
  granted_at timestamptz not null default now(),
  redeemed_at timestamptz,
  foreign key (reward_id, hunt_id) references public.hunt_rewards(id, hunt_id) on delete cascade,
  foreign key (run_id, hunt_id) references public.hunt_runs(id, hunt_id) on delete cascade,
  unique (reward_id, run_id),
  unique (grant_key),
  check (state <> 'redeemed' or redeemed_at is not null)
);
create index if not exists hunt_reward_grants_reward_idx on public.hunt_reward_grants(reward_id, hunt_id);
create index if not exists hunt_reward_grants_run_idx on public.hunt_reward_grants(run_id, hunt_id);
create index if not exists hunt_reward_grants_profile_idx on public.hunt_reward_grants(profile_id, granted_at desc);

alter table public.hunt_rewards enable row level security;
revoke all on table public.hunt_rewards from public, anon, authenticated;
grant all on public.hunt_rewards to service_role;
alter table public.hunt_reward_grants enable row level security;
revoke all on table public.hunt_reward_grants from public, anon, authenticated;
grant all on public.hunt_reward_grants to service_role;

create or replace function public.hunt_reward_grant(
  p_actor uuid,
  p_run_id uuid,
  p_reward_key text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  run public.hunt_runs%rowtype;
  h public.hunts%rowtype;
  r public.hunt_rewards%rowtype;
  stored public.hunt_command_keys%rowtype;
  grant_id uuid;
  needed jsonb;
  held integer;
  answer jsonb;
begin
  if p_actor is null or p_run_id is null or p_reward_key is null or p_idempotency_key is null or p_request_hash is null then
    raise exception 'hunt_reward_grant needs an actor, run, reward, key and request hash' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':reward_grant:' || p_idempotency_key, 0));

  select * into stored from public.hunt_command_keys
   where actor_profile_id = p_actor and action = 'reward_grant' and idempotency_key = p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then
      return jsonb_build_object('result', 'key_conflict');
    end if;
    return coalesce(stored.response_ref, jsonb_build_object('result', 'granted')) || jsonb_build_object('replayed', true);
  end if;

  select * into run from public.hunt_runs where id = p_run_id and subject_profile_id = p_actor;
  if not found then
    return jsonb_build_object('result', 'run_not_found');
  end if;
  select * into h from public.hunts where id = run.hunt_id;
  if h.status not in ('live', 'ended') then
    return jsonb_build_object('result', 'hunt_not_live');
  end if;

  -- The reward row lock is the stock serialiser: every claimant of this reward queues here.
  select * into r from public.hunt_rewards
   where hunt_id = run.hunt_id and version_id = run.version_id and reward_key = p_reward_key
   for update;
  if not found or r.retired_at is not null then
    return jsonb_build_object('result', 'reward_not_found');
  end if;

  -- Eligibility reads the run as it is now, after the lock.
  select * into run from public.hunt_runs where id = p_run_id;
  needed := r.eligibility -> 'missions';
  if needed is not null and jsonb_typeof(needed) = 'array' then
    if exists (
      select 1 from jsonb_array_elements_text(needed) m(key)
       where not exists (select 1 from public.hunt_progress p
                          where p.run_id = run.id and p.mission_key = m.key and p.disposition = 'credited')
    ) then
      return jsonb_build_object('result', 'not_eligible');
    end if;
  elsif run.state <> 'completed' then
    return jsonb_build_object('result', 'not_eligible');
  end if;

  if exists (select 1 from public.hunt_reward_grants where reward_id = r.id and run_id = run.id) then
    return jsonb_build_object('result', 'already_granted');
  end if;
  select count(*) into held from public.hunt_reward_grants
   where reward_id = r.id and profile_id = p_actor and state <> 'revoked';
  if held >= r.per_player_limit then
    return jsonb_build_object('result', 'already_granted');
  end if;

  if r.stock is not null and r.granted_count >= r.stock then
    return jsonb_build_object('result', 'sold_out', 'terms', r.stock_terms);
  end if;

  insert into public.hunt_reward_grants (hunt_id, reward_id, run_id, profile_id, grant_key)
  values (run.hunt_id, r.id, run.id, p_actor, 'grant-' || r.id::text || '-' || run.id::text)
  returning id into grant_id;
  update public.hunt_rewards set granted_count = granted_count + 1 where id = r.id;

  insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
  values (run.hunt_id, run.id, p_actor, 'reward_granted', 'reward_grant', grant_id::text,
          jsonb_build_object('reward_key', r.reward_key, 'remaining', case when r.stock is null then null else r.stock - r.granted_count - 1 end));

  insert into public.hunt_outbox (hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id,
                                  aggregate_revision, semantic_key, payload)
  values (run.hunt_id, 'reward', 'grant-' || grant_id::text, 'reward.granted', 'run', run.id::text,
          run.revision, 'reward:' || r.id::text || ':' || run.id::text,
          jsonb_build_object('grant_id', grant_id, 'reward_key', r.reward_key, 'kind', r.kind, 'run_id', run.id));

  answer := jsonb_build_object('result', 'granted', 'grant_id', grant_id, 'reward_key', r.reward_key);
  insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
  values (p_actor, 'reward_grant', p_idempotency_key, p_request_hash, run.hunt_id, answer);

  return answer;
end;
$$;

revoke all on function public.hunt_reward_grant(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.hunt_reward_grant(uuid, uuid, text, text, text) to service_role;

comment on table public.hunt_rewards is 'FH-021: a reward spec on a published Hunt version, with its stock and the published stock terms. Service role only.';
comment on table public.hunt_reward_grants is 'FH-021: one grant per (reward, run). Service role only.';
comment on function public.hunt_reward_grant(uuid, uuid, text, text, text) is 'FH-021: grant one reward to a finished run; serialised on the reward row so the last unit goes to one claimant. Service role only.';

commit;
