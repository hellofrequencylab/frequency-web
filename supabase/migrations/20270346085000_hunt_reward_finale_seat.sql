-- FH-031S: the reward grant checks the finale seat itself (Tier 3, Rally).
--
-- A Hunt version may name one host Event (hunt_versions.policy.finale.event_id). The app refuses a
-- completion reward for a player that Event does not admit (lib/hunts/rally-finale.ts
-- grantFinaleReward), and until now that rule lived in the app alone. hunt_reward_grant is the only
-- writer of a grant, so the same check goes here: on a Hunt with a finale, a reward whose eligibility
-- is the finished run is granted only when
--
--   * the Event is published, not cancelled and not removed, and is hosted by the Hunt's own Space or
--     by a Space whose partner row is in force (the liveness rule of 20270346081000). A Hunt with no
--     Space of its own has no Space rule, as in the app;
--   * the caller holds a seat at THAT Event: an event_tickets row that succeeded and was not refunded,
--     or an event_rsvps row that is going and not waiting on the host.
--
-- Otherwise it answers not_admitted (reason event_unavailable or no_seat) and writes nothing. The
-- function only READS the Events tables, so finishing a Hunt can never create a ticket, an RSVP or a
-- seat. A Hunt with no finale, a reward for named missions, every other answer, the order of the
-- earlier checks, the five-argument signature and the service_role-only grant are exactly as in
-- 20270346042000_hunt_rewards.sql. A replayed command still returns its stored answer first.
-- No table, column, index or policy changes. Idempotent.

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
  finale_event text;
  ev public.events%rowtype;
  ev_found boolean;
  ev_host uuid;
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
  else
    -- FH-031S: a completion reward on a Hunt that ends at an Event needs a seat at THAT Event. The run
    -- is complete here; the Event's own tables say whether this player is admitted. Read only: no row
    -- in events, event_tickets or event_rsvps is written, so a grant can never create a seat.
    select v.policy -> 'finale' ->> 'event_id' into finale_event
      from public.hunt_versions v where v.id = run.version_id and v.hunt_id = run.hunt_id;
    if finale_event is not null
       and finale_event ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into ev from public.events e where e.id = finale_event::uuid;
      ev_found := found;
      ev_host := coalesce(ev.host_space_id, ev.space_id);
      -- The Event must be live, and the Hunt's to end at: its own Space's, or a partner's in force now.
      if not ev_found or ev.is_cancelled is true or ev.status is distinct from 'published' or ev.removed_at is not null
         or (h.owner_space_id is not null and (
               ev_host is null
               or (ev_host <> h.owner_space_id and not exists (
                     select 1 from public.hunt_partners hp
                      where hp.hunt_id = run.hunt_id and hp.space_id = ev_host
                        and hp.status = 'accepted'
                        and hp.effective_at is not null and hp.effective_at <= now()
                        and (hp.revoked_at is null or hp.revoked_at > now())))))
      then
        return jsonb_build_object('result', 'not_admitted', 'reason', 'event_unavailable');
      end if;
      -- A seat: a paid ticket that was not refunded, or a going RSVP the host is not still deciding.
      -- A waitlist place, a pending request and a seat at any other Event are not seats.
      if not exists (
           select 1 from public.event_tickets t
            where t.event_id = ev.id and t.buyer_profile_id = p_actor
              and t.status = 'succeeded' and t.refunded_at is null)
         and not exists (
           select 1 from public.event_rsvps s
            where s.event_id = ev.id and s.profile_id = p_actor
              and s.status = 'going' and s.approval_status <> 'pending')
      then
        return jsonb_build_object('result', 'not_admitted', 'reason', 'no_seat');
      end if;
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

comment on function public.hunt_reward_grant(uuid, uuid, text, text, text) is 'FH-021 + FH-031S: grant one reward to a finished run; serialised on the reward row so the last unit goes to one claimant. On a Hunt that ends at an Event, a completion reward needs a seat at that Event (not_admitted otherwise) and nothing is written to the Events tables. Service role only.';

commit;
