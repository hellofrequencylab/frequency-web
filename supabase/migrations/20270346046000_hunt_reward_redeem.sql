-- FH-022: the merchant redemption station's database half (Tier 2, Rewards).
--
-- A grant (FH-021) is one row per (reward, run). Redeeming it is the one moment a perk becomes a thing a
-- merchant hands over, so it must happen exactly once however many staff terminals are open. The grant row
-- lock is the serialiser: two terminals presenting the same grant take the lock in turn, the first marks it
-- redeemed, the second reads `already_redeemed`. A revoked or expired grant answers its own state and is
-- never redeemed. The same key replays the first answer (a retry after a dropped connection), a reused key
-- for another request is a conflict. The venue is null when a Hunt role holder redeems with no venue Space. Authorisation (which staff, which venue) is decided in the route by
-- lib/hunts/authz.ts decide('redeem_reward') before either function runs; the database guarantees ONCE.
--
-- Voiding an unredeemed grant is its own function so an operator can cancel a perk that was issued by
-- mistake. It does not return the unit to stock: stock accounting after a revoke belongs to the commerce
-- rows (FH-036 onward), as FH-021 states. A redeemed grant cannot be voided here.
--
-- Additive and idempotent. Both functions are service role only, like every Hunt writer.

begin;

alter table public.hunt_reward_grants add column if not exists expires_at timestamptz;
alter table public.hunt_reward_grants add column if not exists redeemed_by uuid references public.profiles(id) on delete set null;
alter table public.hunt_reward_grants add column if not exists redeemed_venue_space_id uuid;
alter table public.hunt_reward_grants add column if not exists voided_at timestamptz;
alter table public.hunt_reward_grants add column if not exists void_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_reward_grants_void_reason_len') then
    alter table public.hunt_reward_grants
      add constraint hunt_reward_grants_void_reason_len
      check (void_reason is null or char_length(void_reason) between 3 and 280);
  end if;
end
$$;

create or replace function public.hunt_reward_redeem(
  p_staff uuid,
  p_grant_id uuid,
  p_venue_space_id uuid,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  g public.hunt_reward_grants%rowtype;
  r public.hunt_rewards%rowtype;
  h public.hunts%rowtype;
  stored public.hunt_command_keys%rowtype;
  answer jsonb;
begin
  if p_staff is null or p_grant_id is null or p_idempotency_key is null or p_request_hash is null then
    raise exception 'hunt_reward_redeem needs staff, grant, key and request hash' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_staff::text || ':reward_redeem:' || p_idempotency_key, 0));

  select * into stored from public.hunt_command_keys
   where actor_profile_id = p_staff and action = 'reward_redeem' and idempotency_key = p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then
      return jsonb_build_object('result', 'key_conflict');
    end if;
    return coalesce(stored.response_ref, jsonb_build_object('result', 'redeemed')) || jsonb_build_object('replayed', true);
  end if;

  -- The grant row lock is the once-only serialiser: every terminal presenting this grant queues here.
  select * into g from public.hunt_reward_grants where id = p_grant_id for update;
  if not found then
    return jsonb_build_object('result', 'grant_not_found');
  end if;
  select * into r from public.hunt_rewards where id = g.reward_id;
  select * into h from public.hunts where id = g.hunt_id;

  if g.state = 'revoked' then
    return jsonb_build_object('result', 'revoked');
  end if;
  if g.state = 'redeemed' then
    return jsonb_build_object('result', 'already_redeemed', 'redeemed_at', g.redeemed_at);
  end if;
  if g.state = 'expired' or (g.expires_at is not null and g.expires_at <= now()) then
    if g.state <> 'expired' then
      update public.hunt_reward_grants set state = 'expired' where id = g.id;
    end if;
    return jsonb_build_object('result', 'expired');
  end if;
  if h.status not in ('live', 'ended') then
    return jsonb_build_object('result', 'hunt_not_live');
  end if;

  update public.hunt_reward_grants
     set state = 'redeemed', redeemed_at = now(), redeemed_by = p_staff, redeemed_venue_space_id = p_venue_space_id
   where id = g.id;

  insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
  values (g.hunt_id, g.run_id, p_staff, 'reward_redeemed', 'reward_grant', g.id::text,
          jsonb_build_object('reward_key', r.reward_key, 'venue_space_id', p_venue_space_id));

  insert into public.hunt_outbox (hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id,
                                  aggregate_revision, semantic_key, payload)
  values (g.hunt_id, 'reward', 'redeem-' || g.id::text, 'reward.redeemed', 'run', g.run_id::text,
          (select revision from public.hunt_runs where id = g.run_id),
          'reward-redeem:' || g.id::text,
          jsonb_build_object('grant_id', g.id, 'reward_key', r.reward_key, 'kind', r.kind, 'run_id', g.run_id));

  answer := jsonb_build_object('result', 'redeemed', 'grant_id', g.id, 'reward_key', r.reward_key);
  insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
  values (p_staff, 'reward_redeem', p_idempotency_key, p_request_hash, g.hunt_id, answer);

  return answer;
end;
$$;

create or replace function public.hunt_reward_void(
  p_actor uuid,
  p_grant_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  g public.hunt_reward_grants%rowtype;
  r public.hunt_rewards%rowtype;
  stored public.hunt_command_keys%rowtype;
  answer jsonb;
begin
  if p_actor is null or p_grant_id is null or p_reason is null or p_idempotency_key is null or p_request_hash is null then
    raise exception 'hunt_reward_void needs an actor, grant, reason, key and request hash' using errcode = '22023';
  end if;
  if char_length(btrim(p_reason)) < 3 or char_length(btrim(p_reason)) > 280 then
    return jsonb_build_object('result', 'reason_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':reward_void:' || p_idempotency_key, 0));

  select * into stored from public.hunt_command_keys
   where actor_profile_id = p_actor and action = 'reward_void' and idempotency_key = p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then
      return jsonb_build_object('result', 'key_conflict');
    end if;
    return coalesce(stored.response_ref, jsonb_build_object('result', 'voided')) || jsonb_build_object('replayed', true);
  end if;

  select * into g from public.hunt_reward_grants where id = p_grant_id for update;
  if not found then
    return jsonb_build_object('result', 'grant_not_found');
  end if;
  if g.state = 'redeemed' then
    return jsonb_build_object('result', 'already_redeemed');
  end if;
  if g.state = 'revoked' then
    return jsonb_build_object('result', 'already_voided');
  end if;
  select * into r from public.hunt_rewards where id = g.reward_id;

  update public.hunt_reward_grants
     set state = 'revoked', voided_at = now(), void_reason = btrim(p_reason)
   where id = g.id;

  insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, before_state, after_state)
  values (g.hunt_id, g.run_id, p_actor, 'reward_voided', 'reward_grant', g.id::text,
          jsonb_build_object('state', g.state), jsonb_build_object('state', 'revoked', 'reason', btrim(p_reason)));

  insert into public.hunt_outbox (hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id,
                                  aggregate_revision, semantic_key, payload)
  values (g.hunt_id, 'reward', 'void-' || g.id::text, 'reward.voided', 'run', g.run_id::text,
          (select revision from public.hunt_runs where id = g.run_id),
          'reward-void:' || g.id::text,
          jsonb_build_object('grant_id', g.id, 'reward_key', r.reward_key, 'run_id', g.run_id));

  answer := jsonb_build_object('result', 'voided', 'grant_id', g.id);
  insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
  values (p_actor, 'reward_void', p_idempotency_key, p_request_hash, g.hunt_id, answer);

  return answer;
end;
$$;

revoke all on function public.hunt_reward_redeem(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.hunt_reward_redeem(uuid, uuid, uuid, text, text) to service_role;
revoke all on function public.hunt_reward_void(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.hunt_reward_void(uuid, uuid, text, text, text) to service_role;

comment on function public.hunt_reward_redeem(uuid, uuid, uuid, text, text) is 'FH-022: redeem one reward grant exactly once; serialised on the grant row so two terminals cannot both hand it over. Service role only.';
comment on function public.hunt_reward_void(uuid, uuid, text, text, text) is 'FH-022: void an unredeemed grant with a written reason. Does not return stock. Service role only.';

commit;
