-- FH-031T: the completion reward on a Hunt with an Event finale needs a seat at that Event.
--
-- FH-031 froze the finale with the version (hunt_versions.policy.finale.event_id) and the app checks it
-- before it asks for a grant (lib/hunts/rally-finale.ts grantFinaleReward). This puts the same seat check
-- inside hunt_reward_grant, the one writer of grants, so a caller that skips the projection still cannot
-- grant a finale reward to a player the Event has not admitted. Finishing a Hunt never admits anyone:
-- this reads event_tickets and event_rsvps and writes no seat, ticket or RSVP.
--
-- A refusal answers {"result":"not_admitted","reason":"no_seat"|"event_unavailable"} and writes nothing,
-- not even the idempotency record, so the same key works once the player has a seat. A version with no
-- finale is unchanged. The function is redefined from its latest definition
-- (20270346042000_hunt_rewards.sql) with the same signature, grants and comment; only the seat check is
-- new. Additive and idempotent.

begin;

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
  finale_raw text;
  finale_event uuid;
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

  -- FH-031T: the finale seat. A version that names a finale Event (policy.finale.event_id, frozen at
  -- publish) grants only to a player that Event admits right now: a succeeded, unrefunded ticket, or a
  -- going RSVP the host is not still deciding on, at THAT Event, held by the caller. A waitlist place,
  -- an unanswered request, a refunded ticket or a seat at any other Event is not a seat. A cancelled,
  -- unpublished or removed Event admits nobody. The same rule as lib/hunts/rally-finale.ts
  -- (projectFinale, grantFinaleReward), so it does not rest on one caller. A malformed id reads as no
  -- finale, as parseFinale does. Nothing here writes a seat; a refusal writes nothing.
  select v.policy #>> '{finale,event_id}' into finale_raw from public.hunt_versions v
   where v.id = run.version_id and v.hunt_id = run.hunt_id;
  if finale_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    finale_event := finale_raw::uuid;
    if not exists (
      select 1 from public.events e
       where e.id = finale_event and e.is_cancelled is not true and e.status = 'published' and e.removed_at is null
    ) then
      return jsonb_build_object('result', 'not_admitted', 'reason', 'event_unavailable');
    end if;
    if not exists (
      select 1 from public.event_tickets t
       where t.event_id = finale_event and t.buyer_profile_id = p_actor
         and t.status = 'succeeded' and t.refunded_at is null
    ) and not exists (
      select 1 from public.event_rsvps r
       where r.event_id = finale_event and r.profile_id = p_actor
         and r.status = 'going' and r.approval_status <> 'pending'
    ) then
      return jsonb_build_object('result', 'not_admitted', 'reason', 'no_seat');
    end if;
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

comment on function public.hunt_reward_grant(uuid, uuid, text, text, text) is 'FH-021: grant one reward to a finished run; serialised on the reward row so the last unit goes to one claimant. Service role only.';

commit;
