-- FH-029: partner invites bound to a named steward, and live partner state on every claim.
--
-- 1. hunt_partners.invitee_profile_id names the one Space steward an invite is for. The app
--    (lib/hunts/partner-store.ts) accepts only when the signed-in person is that steward and still
--    holds the role, so a forwarded link confers nothing. The pinned terms version uses the existing
--    terms_version column. No new table, no policy change: hunt_partners stays service role only.
-- 2. hunt_claim_apply (FH-010, FH-049T 20270346052000, FH-020U 20270346053000) gains one refusal,
--    venue_not_active: a claim through a placement whose venue Space has a partner row that is not in
--    force (withdrawn, suspended, declined, expired, still invited, not yet effective, or revoked) is
--    refused and writes nothing. Every other answer, the order of the checks, the nine-argument
--    signature and the service_role-only grant are exactly as in 20270346053000. A replayed command
--    still returns its stored answer first, so an earlier credit reads as credited after a withdrawal,
--    and hunt_progress is never touched: historic credit stays.
--
-- Additive and idempotent. Dark: no path calls this function until HUNTS_CLAIMS_ENABLED is on.

begin;

alter table public.hunt_partners
  add column if not exists invitee_profile_id uuid references public.profiles(id) on delete set null;
create index if not exists hunt_partners_invitee_idx on public.hunt_partners(invitee_profile_id) where invitee_profile_id is not null;
comment on column public.hunt_partners.invitee_profile_id is 'FH-029: the named Space steward this invite is for. Only this person, while still a steward of the Space, may accept or decline.';

create or replace function public.hunt_claim_apply(
  p_actor uuid,
  p_run_id uuid,
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
  run public.hunt_runs%rowtype;
  h public.hunts%rowtype;
  v public.hunt_versions%rowtype;
  m public.hunt_missions%rowtype;
  stored public.hunt_command_keys%rowtype;
  claim_id uuid;
  rank_have integer;
  rank_need integer;
  answer jsonb;
  progress_total integer;
  hold_ok boolean := false;
  venue uuid;
  held_id uuid;
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

  -- FH-049T: the caller evaluated prerequisites against a snapshot of this run's progress. The run
  -- row is locked, so the total below cannot move before this transaction ends; a different total
  -- means the snapshot is stale, and nothing is credited or written. Null keeps the FH-010 behaviour.
  if p_expected_progress_count is not null then
    select count(*)::integer into progress_total from public.hunt_progress where run_id = run.id;
    if progress_total <> p_expected_progress_count then
      return jsonb_build_object('result', 'stale_progress');
    end if;
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

  -- FH-029: live partner state. When the binding names a venue Space and that Space has a partner row
  -- on this Hunt, the row must be in force right now: accepted, effective and not revoked. A venue that
  -- withdrew, was suspended, declined, or has not answered its invite gets no new proof. A venue with
  -- no partner row at all is unchanged here (publish refuses it, lib/hunts/store.ts). Nothing is
  -- written, and progress already credited at this venue is never touched.
  if exists (
    select 1
      from public.hunt_mission_placements mp
      join public.hunt_partners hp on hp.hunt_id = mp.hunt_id and hp.space_id = mp.venue_space_id
     where mp.version_id = run.version_id and mp.mission_key = p_mission_key
       and mp.placement_id = p_placement_id
       and not (hp.status = 'accepted'
                and hp.effective_at is not null and hp.effective_at <= now()
                and (hp.revoked_at is null or hp.revoked_at > now()))
  ) then
    return jsonb_build_object('result', 'venue_not_active');
  end if;

  rank_have := case p_assurance when 'none' then 0 when 'signed_node' then 1 else 3 end;
  rank_need := case m.required_assurance when 'none' then 0 when 'signed_node' then 1 else 3 end;
  if rank_have < rank_need then
    -- FH-020U: a mission placement may opt in (evidence_policy.hold_for_review = true) to keep a
    -- qualifying shortfall for staff review: a signed scan (rank 1 or more) against a staff-level
    -- mission. The opt-in and the venue come from the current mission-to-placement binding, never
    -- from the caller. Without the opt-in this refusal is exactly as before and writes nothing.
    select true, mp.venue_space_id into hold_ok, venue
      from public.hunt_mission_placements mp
      join public.hunt_placements p on p.id = mp.placement_id and p.hunt_id = mp.hunt_id
     where mp.version_id = run.version_id and mp.mission_key = p_mission_key
       and mp.placement_id = p_placement_id and p.revoked_at is null
       and rank_have >= 1 and rank_need = 3
       and mp.evidence_policy -> 'hold_for_review' = 'true'::jsonb;
    if not coalesce(hold_ok, false) then
      return jsonb_build_object('result', 'assurance_too_low');
    end if;
  end if;

  if exists (select 1 from public.hunt_progress where run_id = run.id and mission_key = p_mission_key) then
    return jsonb_build_object('result', 'already_credited');
  end if;
  if hold_ok then
    -- One held claim per run and mission: another command for the same shortfall reuses it.
    select id into held_id from public.hunt_claims
     where run_id = run.id and mission_key = p_mission_key and state = 'needs_review'
     limit 1;
    if held_id is not null then
      return jsonb_build_object('result', 'held', 'claim_id', held_id);
    end if;
  end if;
  if exists (select 1 from public.hunt_claims where run_id = run.id and mission_key = p_mission_key and evidence_id = p_evidence_id) then
    return jsonb_build_object('result', 'duplicate_evidence');
  end if;

  if hold_ok then
    insert into public.hunt_claims (hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id,
                                    state, assurance, policy_result, idempotency_key)
    values (run.hunt_id, run.id, run.version_id, p_mission_key, p_actor, p_evidence_id,
            'needs_review', p_assurance, jsonb_build_object('placement_id', p_placement_id, 'venue_space_id', venue, 'held', 'assurance_too_low'), p_idempotency_key)
    returning id into claim_id;

    insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
    values (run.hunt_id, run.id, p_actor, 'claim_held', 'claim', claim_id::text,
            jsonb_build_object('mission_key', p_mission_key, 'placement_id', p_placement_id, 'assurance', p_assurance));

    -- A held claim creates no progress, no run revision, no reward and no outbox event.
    answer := jsonb_build_object('result', 'held', 'claim_id', claim_id);
    insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
    values (p_actor, 'claim_apply', p_idempotency_key, p_request_hash, run.hunt_id, answer);
    return answer;
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

revoke all on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) to service_role;

comment on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) is 'FH-010 + FH-049T + FH-020U + FH-029: credit one mission through one placement in one transaction (claim, progress, audit, outbox, idempotency key). An expected progress count that no longer matches the run returns stale_progress and writes nothing. An opted-in placement keeps a qualifying assurance shortfall as one held claim (needs_review) with no progress, reward or outbox event. A venue whose partner row is not in force returns venue_not_active and writes nothing. Service role only.';

commit;
