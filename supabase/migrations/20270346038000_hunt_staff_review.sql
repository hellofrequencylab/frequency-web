-- FH-020S: the stateful half of Hunt staff proof (Tier 2, Frequency Hunts Build Plan).
--
-- lib/hunts/staff-proof.ts issues and verifies an expiring challenge. Three things there need the
-- database, and this migration is those three, all service role only:
--
--   1. hunt_staff_nonces + hunt_staff_nonce_consume: a challenge's nonce is spent by a unique insert,
--      so a replay (a second scan, or two staff scanning at once) loses at the primary key.
--   2. hunt_claim_review: a held claim (state needs_review) is approved, rejected or overridden by an
--      authorised reviewer. An approval resumes the claim exactly once: it takes the claim and run
--      locks, credits the mission through the same keys the claim command uses, and a second approval
--      of the same claim finds it already decided. An override needs a written reason and is audited
--      under its own action name.
--   3. hunt_claim_appeal: a player appeals a rejected claim. One open appeal per claim.
--
-- The application decides WHO may call these (lib/hunts/authz.ts, rechecked per request); the database
-- guarantees ONCE. Additive and idempotent.

begin;

create table if not exists public.hunt_staff_nonces (
  nonce text primary key check (char_length(nonce) between 8 and 100),
  hunt_id uuid not null,
  placement_id uuid not null,
  venue_space_id uuid not null references public.spaces(id) on delete cascade,
  run_id uuid not null references public.hunt_runs(id) on delete cascade,
  consumed_by uuid references public.profiles(id) on delete set null,
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (placement_id, hunt_id) references public.hunt_placements(id, hunt_id) on delete cascade
);
create index if not exists hunt_staff_nonces_placement_idx on public.hunt_staff_nonces(placement_id, hunt_id);
create index if not exists hunt_staff_nonces_venue_idx on public.hunt_staff_nonces(venue_space_id);
create index if not exists hunt_staff_nonces_run_idx on public.hunt_staff_nonces(run_id);
create index if not exists hunt_staff_nonces_consumed_by_idx on public.hunt_staff_nonces(consumed_by) where consumed_by is not null;
create index if not exists hunt_staff_nonces_expiry_idx on public.hunt_staff_nonces(expires_at);

alter table public.hunt_staff_nonces enable row level security;
revoke all on table public.hunt_staff_nonces from public, anon, authenticated;
grant all on public.hunt_staff_nonces to service_role;

-- One open appeal per claim; the writer's "insert ... on conflict do nothing" turns a double tap into one row.
create unique index if not exists hunt_compensations_one_open_appeal_idx
  on public.hunt_compensations(claim_id) where appeal_state = 'open';

-- 1. Spend a nonce. True exactly once per nonce. An expired nonce never reaches here (the proof is
-- refused first); rows past a day old are swept on the way, a bounded amount at a time.
create or replace function public.hunt_staff_nonce_consume(
  p_nonce text,
  p_hunt_id uuid,
  p_placement_id uuid,
  p_venue_space_id uuid,
  p_run_id uuid,
  p_staff uuid,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  spent integer;
begin
  if p_nonce is null or p_hunt_id is null or p_placement_id is null or p_venue_space_id is null
     or p_run_id is null or p_staff is null or p_expires_at is null then
    raise exception 'hunt_staff_nonce_consume needs every argument' using errcode = '22023';
  end if;

  delete from public.hunt_staff_nonces
   where nonce in (select nonce from public.hunt_staff_nonces where expires_at < now() - interval '1 day' limit 200);

  insert into public.hunt_staff_nonces (nonce, hunt_id, placement_id, venue_space_id, run_id, consumed_by, expires_at)
  values (p_nonce, p_hunt_id, p_placement_id, p_venue_space_id, p_run_id, p_staff, p_expires_at)
  on conflict (nonce) do nothing;
  get diagnostics spent = row_count;
  return spent = 1;
end;
$$;

-- 2. Decide a held claim.
create or replace function public.hunt_claim_review(
  p_claim_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  c public.hunt_claims%rowtype;
  run public.hunt_runs%rowtype;
  stored public.hunt_command_keys%rowtype;
  answer jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_claim_id is null or p_reviewer is null or p_decision is null or p_idempotency_key is null or p_request_hash is null then
    raise exception 'hunt_claim_review needs a claim, reviewer, decision, key and request hash' using errcode = '22023';
  end if;
  if p_decision not in ('approve', 'reject', 'override') then
    raise exception 'unknown decision %', p_decision using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_reason is null then
    raise exception 'a rejection needs a reason' using errcode = '22023';
  end if;
  if p_decision = 'override' and (v_reason is null or char_length(v_reason) < 10) then
    raise exception 'an override needs a written reason of at least 10 characters' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_reviewer::text || ':claim_review:' || p_idempotency_key, 0));

  select * into stored from public.hunt_command_keys
   where actor_profile_id = p_reviewer and action = 'claim_review' and idempotency_key = p_idempotency_key;
  if found then
    if stored.request_hash <> p_request_hash then
      return jsonb_build_object('result', 'key_conflict');
    end if;
    return coalesce(stored.response_ref, jsonb_build_object('result', 'decided')) || jsonb_build_object('replayed', true);
  end if;

  select * into c from public.hunt_claims where id = p_claim_id for update;
  if not found then
    return jsonb_build_object('result', 'claim_not_found');
  end if;

  -- The run lock keeps this credit and a player's own claim from both crediting the mission.
  select * into run from public.hunt_runs where id = c.run_id for update;

  -- Re-read the claim now that the locks are held: a concurrent reviewer may have decided it.
  select * into c from public.hunt_claims where id = p_claim_id;

  if p_decision = 'override' then
    if c.state not in ('needs_review', 'rejected') then
      return jsonb_build_object('result', 'already_decided', 'state', c.state);
    end if;
  elsif c.state <> 'needs_review' then
    return jsonb_build_object('result', 'already_decided', 'state', c.state);
  end if;

  if p_decision = 'reject' then
    update public.hunt_claims
       set state = 'rejected', reason = v_reason, reviewed_by = p_reviewer, reviewed_at = now()
     where id = c.id;
    insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, before_state, after_state)
    values (c.hunt_id, c.run_id, p_reviewer, 'claim_rejected', 'claim', c.id::text,
            jsonb_build_object('state', c.state), jsonb_build_object('state', 'rejected', 'reason', v_reason));
    answer := jsonb_build_object('result', 'rejected', 'claim_id', c.id);
  else
    if run.state <> 'active' then
      return jsonb_build_object('result', 'run_not_active');
    end if;
    if exists (select 1 from public.hunt_progress where run_id = c.run_id and mission_key = c.mission_key) then
      return jsonb_build_object('result', 'already_credited');
    end if;

    update public.hunt_claims
       set state = 'accepted', reason = coalesce(v_reason, c.reason), reviewed_by = p_reviewer, reviewed_at = now()
     where id = c.id;
    insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id)
    values (c.run_id, c.mission_key, c.hunt_id, c.version_id, c.id);
    update public.hunt_runs set revision = revision + 1, last_activity_at = now() where id = run.id;

    insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, before_state, after_state)
    values (c.hunt_id, c.run_id, p_reviewer,
            case p_decision when 'override' then 'claim_override' else 'claim_review_approved' end,
            'claim', c.id::text,
            jsonb_build_object('state', c.state),
            jsonb_build_object('state', 'accepted', 'mission_key', c.mission_key, 'reason', v_reason));

    insert into public.hunt_outbox (hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id,
                                    aggregate_revision, semantic_key, payload)
    values (c.hunt_id, 'projection', 'claim-' || c.id::text, 'claim.accepted', 'run', c.run_id::text,
            run.revision + 1, 'credit:' || c.run_id::text || ':' || c.mission_key,
            jsonb_build_object('claim_id', c.id, 'mission_key', c.mission_key, 'run_id', c.run_id));

    answer := jsonb_build_object('result', 'credited', 'claim_id', c.id, 'run_revision', run.revision + 1);
  end if;

  insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash, hunt_id, response_ref)
  values (p_reviewer, 'claim_review', p_idempotency_key, p_request_hash, c.hunt_id, answer);

  return answer;
end;
$$;

-- 3. A player appeals a rejected claim of their own.
create or replace function public.hunt_claim_appeal(
  p_claim_id uuid,
  p_actor uuid,
  p_reason text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  c public.hunt_claims%rowtype;
  made integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_claim_id is null or p_actor is null or v_reason is null then
    raise exception 'hunt_claim_appeal needs a claim, an actor and a reason' using errcode = '22023';
  end if;

  select * into c from public.hunt_claims where id = p_claim_id and actor_profile_id = p_actor;
  if not found then
    return jsonb_build_object('result', 'claim_not_found');
  end if;
  if c.state <> 'rejected' then
    return jsonb_build_object('result', 'not_rejected');
  end if;

  insert into public.hunt_compensations (hunt_id, run_id, claim_id, reason, appeal_state, created_by)
  values (c.hunt_id, c.run_id, c.id, left(v_reason, 500), 'open', p_actor)
  on conflict (claim_id) where appeal_state = 'open' do nothing;
  get diagnostics made = row_count;
  if made = 0 then
    return jsonb_build_object('result', 'already_open');
  end if;

  insert into public.hunt_audit (hunt_id, run_id, actor_profile_id, action, target_kind, target_id, after_state)
  values (c.hunt_id, c.run_id, p_actor, 'claim_appeal_opened', 'claim', c.id::text, jsonb_build_object('reason', left(v_reason, 500)));
  return jsonb_build_object('result', 'opened', 'claim_id', c.id);
end;
$$;

revoke all on function public.hunt_staff_nonce_consume(text, uuid, uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.hunt_staff_nonce_consume(text, uuid, uuid, uuid, uuid, uuid, timestamptz) to service_role;
revoke all on function public.hunt_claim_review(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hunt_claim_review(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.hunt_claim_appeal(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.hunt_claim_appeal(uuid, uuid, text) to service_role;

comment on table public.hunt_staff_nonces is 'FH-020S: spent staff-proof nonces. A unique insert is what makes a challenge single use. Service role only.';
comment on function public.hunt_staff_nonce_consume(text, uuid, uuid, uuid, uuid, uuid, timestamptz) is 'FH-020S: spend a staff-proof nonce; true exactly once. Service role only.';
comment on function public.hunt_claim_review(uuid, uuid, text, text, text, text) is 'FH-020S: approve, reject or override a held claim; an approval resumes it exactly once. Service role only.';
comment on function public.hunt_claim_appeal(uuid, uuid, text) is 'FH-020S: a player appeals their own rejected claim; one open appeal per claim. Service role only.';

commit;
