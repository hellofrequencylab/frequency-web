-- 0016_atomic_economy — close read-modify-write races in the economy layer.
--
-- Isolation (docs/ISOLATION.md): everything lives in `resonance`; no cross-schema
-- FK, all ids are plain uuid. These are trusted-server helpers, reached only via
-- the service role (matches the deny-by-default posture of 0001), so they run as
-- SECURITY INVOKER (the service role already has full access) and we grant
-- EXECUTE to service_role explicitly.
--
-- WHY: several economy writes were check-then-write across two round trips
-- (read balance -> insert, count tickets -> upsert, select points -> upsert),
-- which two concurrent callers can interleave to overspend, oversell, or lose an
-- update. Each function below collapses its operation into ONE statement (or one
-- transaction under a per-key advisory lock), so the database — not the app —
-- is the point of serialization.

-- ---------------------------------------------------------------------------
-- Rank thresholds, mirrored from lib/gamification/ranks.ts. KEEP IN SYNC with
-- that file (Crew/Deshi/Sempai/Sensei/Sifu/Bodhisattva at 0/10/25/50/100/200).
-- ---------------------------------------------------------------------------
create or replace function resonance.rank_for_points(p_points integer)
returns text
language sql
immutable
as $$
  select case
    when p_points >= 200 then 'Bodhisattva'
    when p_points >= 100 then 'Sifu'
    when p_points >= 50  then 'Sensei'
    when p_points >= 25  then 'Sempai'
    when p_points >= 10  then 'Deshi'
    else 'Crew'
  end;
$$;

-- ---------------------------------------------------------------------------
-- spend_zaps — atomic debit. Overspend fix (lib/gamification/service.ts).
--
-- A per-(world,user) transaction advisory lock serializes concurrent spends for
-- the same wallet, so two spenders can't both read the same balance and both
-- debit. Idempotent on (world,user,reason,ref): a retried spend for the same ref
-- debits at most once and reports the current balance.
-- ---------------------------------------------------------------------------
create or replace function resonance.spend_zaps(
  p_world_id uuid,
  p_user_id  uuid,
  p_amount   integer,
  p_reason   text,
  p_ref_id   uuid
)
returns table (ok boolean, balance integer)
language plpgsql
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Serialize spends for this wallet (released at transaction end).
  perform pg_advisory_xact_lock(
    hashtextextended('resonance.zaps:' || p_world_id::text || ':' || p_user_id::text, 0)
  );

  select coalesce(sum(delta), 0) into v_balance
    from resonance.zaps_ledger
    where world_id = p_world_id and user_id = p_user_id;

  -- Already debited for this ref -> idempotent success, no double-charge.
  if exists (
    select 1 from resonance.zaps_ledger
      where world_id = p_world_id
        and user_id = p_user_id
        and reason = p_reason
        and ref_id is not distinct from p_ref_id
  ) then
    return query select true, v_balance;
    return;
  end if;

  if v_balance < p_amount then
    return query select false, v_balance;
    return;
  end if;

  insert into resonance.zaps_ledger (world_id, user_id, delta, reason, ref_id)
    values (p_world_id, p_user_id, -p_amount, p_reason, p_ref_id);

  return query select true, v_balance - p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_dj_points — atomic increment + rank recompute. Lost-update fix
-- (lib/gamification/repo.ts addDjPoints).
-- ---------------------------------------------------------------------------
create or replace function resonance.add_dj_points(
  p_world_id  uuid,
  p_user_id   uuid,
  p_season_id uuid,
  p_points    integer
)
returns table (out_dj_points integer, out_rank text)
language plpgsql
as $$
begin
  return query
  insert into resonance.reputation (world_id, user_id, season_id, dj_points, rank)
    values (p_world_id, p_user_id, p_season_id, p_points,
            resonance.rank_for_points(p_points))
  on conflict (world_id, user_id, season_id) do update
    set dj_points = reputation.dj_points + excluded.dj_points,
        rank      = resonance.rank_for_points(
                      reputation.dj_points + excluded.dj_points)
  returning reputation.dj_points, reputation.rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- award_for_play — all-or-nothing DJ award. Non-atomic two-step fix
-- (lib/gamification/service.ts awardForPlay): credit Zaps AND DJ points in ONE
-- transaction, anchored on the ledger's idempotency key. If the reputation write
-- fails, the ledger insert rolls back with it, so a mid-failure can't leave Zaps
-- credited without points; a retry re-inserts (conflict -> no-op) and does not
-- double-award.
-- ---------------------------------------------------------------------------
create or replace function resonance.award_for_play(
  p_world_id  uuid,
  p_user_id   uuid,
  p_amount    integer,
  p_season_id uuid,
  p_ref_id    uuid
)
returns table (newly boolean, out_dj_points integer, out_rank text)
language plpgsql
as $$
declare
  v_inserted integer;
  v_points   integer;
  v_rank     text;
begin
  insert into resonance.zaps_ledger (world_id, user_id, delta, reason, ref_id)
    values (p_world_id, p_user_id, p_amount, 'vote_received', p_ref_id)
  on conflict (world_id, user_id, reason, ref_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- Already awarded for this play -> report standing, change nothing.
    select r.dj_points, r.rank into v_points, v_rank
      from resonance.reputation r
      where r.world_id = p_world_id
        and r.user_id = p_user_id
        and r.season_id = p_season_id;
    return query select false, coalesce(v_points, 0), coalesce(v_rank, 'Crew');
    return;
  end if;

  insert into resonance.reputation (world_id, user_id, season_id, dj_points, rank)
    values (p_world_id, p_user_id, p_season_id, p_amount,
            resonance.rank_for_points(p_amount))
  on conflict (world_id, user_id, season_id) do update
    set dj_points = reputation.dj_points + excluded.dj_points,
        rank      = resonance.rank_for_points(
                      reputation.dj_points + excluded.dj_points)
  returning reputation.dj_points, reputation.rank
    into v_points, v_rank;

  return query select true, v_points, v_rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_game_score — atomic increment. Lost-update fix (lib/games/repo.ts addScore).
-- ---------------------------------------------------------------------------
create or replace function resonance.add_game_score(
  p_venue_id uuid,
  p_user_id  uuid,
  p_delta    integer,
  p_round    integer
)
returns integer
language plpgsql
as $$
declare
  v_points integer;
begin
  insert into resonance.game_scores (venue_id, user_id, points, last_round, updated_at)
    values (p_venue_id, p_user_id, p_delta, p_round, now())
  on conflict (venue_id, user_id) do update
    set points     = game_scores.points + excluded.points,
        last_round = excluded.last_round,
        updated_at = now()
  returning game_scores.points into v_points;
  return v_points;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_ticket — capacity enforced atomically. TOCTOU fix (lib/events/repo.ts).
--
-- A per-event advisory lock serializes claims for one event, so the count and the
-- insert can't interleave to oversell. An existing holder can always update their
-- ticket (idempotent on (event_id, user_id)); a new claimant is rejected once the
-- event is full via `raise exception 'at capacity'` (mapped to 409 by the route).
-- ---------------------------------------------------------------------------
create or replace function resonance.claim_ticket(
  p_event_id     uuid,
  p_user_id      uuid,
  p_amount_cents integer
)
returns resonance.event_tickets
language plpgsql
as $$
declare
  v_event  resonance.events;
  v_status text;
  v_count  integer;
  v_ticket resonance.event_tickets;
  v_has    boolean;
begin
  select * into v_event from resonance.events where id = p_event_id;
  if not found then
    raise exception 'event not found';
  end if;

  v_status := case when v_event.ticket_type = 'free' then 'confirmed' else 'reserved' end;

  perform pg_advisory_xact_lock(
    hashtextextended('resonance.event:' || p_event_id::text, 0)
  );

  if v_event.capacity is not null then
    select exists (
      select 1 from resonance.event_tickets
        where event_id = p_event_id and user_id = p_user_id
    ) into v_has;

    if not v_has then
      select count(*) into v_count
        from resonance.event_tickets where event_id = p_event_id;
      if v_count >= v_event.capacity then
        raise exception 'at capacity';
      end if;
    end if;
  end if;

  insert into resonance.event_tickets (event_id, user_id, amount_cents, status)
    values (p_event_id, p_user_id, p_amount_cents, v_status)
  on conflict (event_id, user_id) do update
    set amount_cents = excluded.amount_cents,
        status       = excluded.status
  returning * into v_ticket;

  return v_ticket;
end;
$$;

-- ---------------------------------------------------------------------------
-- enqueue_queue_item — atomic position assignment. Duplicate-position fix
-- (lib/dj/repo.ts enqueue). A per-(venue,user) advisory lock serializes appends
-- so two concurrent enqueues can't both land on the same max+1. The partial
-- unique index below is a hard backstop.
-- ---------------------------------------------------------------------------
create or replace function resonance.enqueue_queue_item(
  p_venue_id  uuid,
  p_user_id   uuid,
  p_media_id  text,
  p_title     text,
  p_thumbnail text
)
returns resonance.queue_items
language plpgsql
as $$
declare
  v_pos integer;
  v_row resonance.queue_items;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('resonance.queue:' || p_venue_id::text || ':' || p_user_id::text, 0)
  );

  select coalesce(max(position), -1) + 1 into v_pos
    from resonance.queue_items
    where venue_id = p_venue_id and user_id = p_user_id and status = 'queued';

  insert into resonance.queue_items (venue_id, user_id, media_id, title, thumbnail, position)
    values (p_venue_id, p_user_id, p_media_id, p_title, p_thumbnail, v_pos)
  returning * into v_row;

  return v_row;
end;
$$;

-- Backstop: no two queued items may share a position within one DJ's queue.
-- NOTE: if the pre-existing data already contains duplicate (venue,user,position)
-- rows among status='queued' items, dedupe them before this index will build.
create unique index if not exists queue_items_unique_queued_pos
  on resonance.queue_items (venue_id, user_id, position)
  where status = 'queued';

-- Deny-by-default posture: grant EXECUTE only to the trusted server role.
grant execute on function resonance.rank_for_points(integer) to service_role;
grant execute on function resonance.spend_zaps(uuid, uuid, integer, text, uuid) to service_role;
grant execute on function resonance.add_dj_points(uuid, uuid, uuid, integer) to service_role;
grant execute on function resonance.award_for_play(uuid, uuid, integer, uuid, uuid) to service_role;
grant execute on function resonance.add_game_score(uuid, uuid, integer, integer) to service_role;
grant execute on function resonance.claim_ticket(uuid, uuid, integer) to service_role;
grant execute on function resonance.enqueue_queue_item(uuid, uuid, text, text, text) to service_role;
