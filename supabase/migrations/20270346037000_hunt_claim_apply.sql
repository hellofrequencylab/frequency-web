-- FH-010: the Frequency Hunts claim command (Tier 0, Frequency Hunts Build Plan, decision D1).
--
-- One function, one transaction. It checks that a member may credit one mission through one
-- placement right now, and when they may it writes the claim, the progress credit, the audit row, the
-- outbox row and the idempotency record together, or none of them. The browser never writes these
-- tables; the application calls this with the service role after it has verified the signed placement
-- code and decided the assurance class it can vouch for.
--
--   * serialised per (actor, key): a retry of the same command waits for the first and replays it
--   * the run row is locked, so two different claims on one run cannot both credit a mission
--   * one credit per (run, mission) and one claim per (run, mission, evidence): the FH-006 keys are
--     the backstop; the checks below only turn them into a readable answer
--   * the same key with another request hash is a conflict, never a replay
--   * a refusal writes nothing, so the member can try again once the cause is fixed
--
-- Run completion and rule groups (all of, any of, choice) are evaluated by the graph engine in the
-- application; this function credits one mission and says nothing about the run being finished.
-- Service role only. Additive and idempotent.

begin;

create or replace function public.hunt_claim_apply(
  p_actor uuid,
  p_run_id uuid,
  p_mission_key text,
  p_placement_id uuid,
  p_evidence_id text,
  p_assurance text,
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
  v public.hunt_versions%rowtype;
  m public.hunt_missions%rowtype;
  stored public.hunt_command_keys%rowtype;
  claim_id uuid;
  rank_have integer;
  rank_need integer;
  answer jsonb;
begin
  if p_actor is null or p_run_id is null or p_placement_id is null
     or p_mission_key is null or p_evidence_id is null or p_assurance is null
     or p_idempotency_key is null or p_request_hash is null then
    raise exception 'hunt_claim_apply needs an actor, run, mission, placement, evidence, assurance, key and request hash' using errcode = '22023';
  end if;
  if p_assurance not in ('none', 'signed_node', 'staff', 'event_door') then
    raise exception 'unknown assurance %', p_assurance using errcode = '22023';
  end if;

  -- Serialise retries of one command: the second caller waits here, then reads the stored answer.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':claim_apply:' || p_idempotency_key, 0));

  select * into stored from public.hunt_command_keys
   where actor_profile_id = p_actor and action = 'claim_apply' and idempotency_key = p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then
      return jsonb_build_object('result', 'key_conflict');
    end if;
    return coalesce(stored.response_ref, jsonb_build_object('result', 'credited')) || jsonb_build_object('replayed', true);
  end if;

  select * into run from public.hunt_runs
   where id = p_run_id and subject_profile_id = p_actor
   for update;
  if not found then
    return jsonb_build_object('result', 'run_not_found');
  end if;
  if run.state <> 'active' then
    return jsonb_build_object('result', 'run_not_active');
  end if;

  select * into h from public.hunts where id = run.hunt_id;
  if h.status <> 'live' then
    return jsonb_build_object('result', 'hunt_not_live');
  end if;
  if h.current_version_id is distinct from run.version_id then
    return jsonb_build_object('result', 'version_superseded');
  end if;

  select * into v from public.hunt_versions where id = run.version_id;
  if v.status <> 'published'
     or (v.starts_at is not null and now() < v.starts_at)
     or (v.ends_at is not null and now() >= v.ends_at) then
    return jsonb_build_object('result', 'outside_window');
  end if;

  select * into m from public.hunt_missions where version_id = run.version_id and mission_key = p_mission_key;
  if not found then
    return jsonb_build_object('result', 'mission_not_found');
  end if;
  if (m.opens_at is not null and now() < m.opens_at) or (m.closes_at is not null and now() >= m.closes_at) then
    return jsonb_build_object('result', 'mission_closed');
  end if;

  if not exists (
    select 1
      from public.hunt_mission_placements mp
      join public.hunt_placements p on p.id = mp.placement_id and p.hunt_id = mp.hunt_id
     where mp.version_id = run.version_id and mp.mission_key = p_mission_key
       and mp.placement_id = p_placement_id and p.revoked_at is null
  ) then
    return jsonb_build_object('result', 'placement_not_valid');
  end if;

  rank_have := case p_assurance when 'none' then 0 when 'signed_node' then 1 else 3 end;
  rank_need := case m.required_assurance when 'none' then 0 when 'signed_node' then 1 else 3 end;
  if rank_have < rank_need then
    return jsonb_build_object('result', 'assurance_too_low');
  end if;

  if exists (select 1 from public.hunt_progress where run_id = run.id and mission_key = p_mission_key) then
    return jsonb_build_object('result', 'already_credited');
  end if;
  if exists (select 1 from public.hunt_claims where run_id = run.id and mission_key = p_mission_key and evidence_id = p_evidence_id) then
    return jsonb_build_object('result', 'duplicate_evidence');
  end if;

  insert into public.hunt_claims (hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id,
                                  state, assurance, policy_result, idempotency_key)
  values (run.hunt_id, run.id, run.version_id, p_mission_key, p_actor, p_evidence_id,
          'accepted', p_assurance, jsonb_build_object('placement_id', p_placement_id), p_idempotency_key)
  returning id into claim_id;

  insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id)
  values (run.id, p_mission_key, run.hunt_id, run.version_id, claim_id);

  update public.hunt_runs
     set revision = revision + 1, last_activity_at = now()
   where id = run.id;

  insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
  values (run.hunt_id, run.id, p_actor, 'claim_accepted', 'claim', claim_id::text,
          jsonb_build_object('mission_key', p_mission_key, 'placement_id', p_placement_id, 'assurance', p_assurance));

  insert into public.hunt_outbox (hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id,
                                  aggregate_revision, semantic_key, payload)
  values (run.hunt_id, 'projection', 'claim-' || claim_id::text, 'claim.accepted', 'run', run.id::text,
          run.revision + 1, 'credit:' || run.id::text || ':' || p_mission_key,
          jsonb_build_object('claim_id', claim_id, 'mission_key', p_mission_key, 'run_id', run.id));

  answer := jsonb_build_object('result', 'credited', 'claim_id', claim_id, 'run_revision', run.revision + 1);
  insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
  values (p_actor, 'claim_apply', p_idempotency_key, p_request_hash, run.hunt_id, answer);

  return answer;
end;
$$;

revoke all on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text) to service_role;

comment on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text) is 'FH-010: credit one mission through one placement in one transaction (claim, progress, audit, outbox, idempotency key). Service role only.';

commit;
