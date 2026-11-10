-- FH-009: the Frequency Hunts durable outbox (Tier 0, Frequency Hunts Build Plan).
--
-- A claim commits its effects (a CRM projection, a receipt email, an analytics event) as outbox rows
-- in the same transaction as the credit; this migration lays down the rows and the five functions a
-- worker uses to drain them. Nothing here sends anything: the worker lives in the application and
-- keeps external calls outside the database.
--
--   * one outbox row per (consumer, event): the key a replayed commit collides on
--   * a lease with a fencing token: a worker that died, or lost its lease to a slower one, cannot
--     complete or fail the row it no longer holds
--   * backoff and a dead-letter state after the attempt cap, never a silent drop
--   * a receipt per (consumer, event) and a second unique key per (consumer, semantic_key), so a
--     retry after "provider send succeeded, completion lost" records one effect, not two
--   * replay is bounded and audited
--
-- Service role only, like every Hunt table. Additive and idempotent.

begin;

create table if not exists public.hunt_outbox (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  consumer text not null check (consumer ~ '^[a-z][a-z0-9_]{1,40}$'),
  event_id text not null check (char_length(event_id) between 8 and 200),
  event_type text not null check (char_length(event_type) between 1 and 80),
  event_version integer not null default 1 check (event_version >= 1),
  aggregate_kind text not null check (char_length(aggregate_kind) between 1 and 40),
  aggregate_id text not null check (char_length(aggregate_id) between 1 and 200),
  aggregate_revision integer not null default 1 check (aggregate_revision >= 1),
  semantic_key text not null check (char_length(semantic_key) between 8 and 200),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','leased','done','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  lease_token uuid,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (consumer, event_id),
  check ((status = 'leased') = (lease_token is not null and leased_until is not null)),
  check (status <> 'done' or completed_at is not null)
);
create index if not exists hunt_outbox_hunt_idx on public.hunt_outbox(hunt_id);
create index if not exists hunt_outbox_due_idx on public.hunt_outbox(available_at) where status = 'pending';
create index if not exists hunt_outbox_lease_idx on public.hunt_outbox(leased_until) where status = 'leased';
create index if not exists hunt_outbox_dead_idx on public.hunt_outbox(hunt_id, created_at desc) where status = 'dead';

create table if not exists public.hunt_deliveries (
  consumer text not null,
  event_id text not null,
  semantic_key text not null,
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
  delivered_at timestamptz not null default now(),
  primary key (consumer, event_id),
  unique (consumer, semantic_key),
  foreign key (consumer, event_id) references public.hunt_outbox(consumer, event_id) on delete cascade
);

alter table public.hunt_outbox enable row level security;
revoke all on table public.hunt_outbox from public, anon, authenticated;
grant all on public.hunt_outbox to service_role;
alter table public.hunt_deliveries enable row level security;
revoke all on table public.hunt_deliveries from public, anon, authenticated;
grant all on public.hunt_deliveries to service_role;

-- Backoff: 5 seconds doubling per attempt, capped at one hour. The application mirrors this in
-- lib/hunts/outbox.ts and a test holds the two together.
create or replace function public.hunt_outbox_backoff(p_attempts integer)
returns interval
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select make_interval(secs => least(3600, 5 * power(2, greatest(p_attempts - 1, 0)))::integer);
$$;

-- Lease up to p_limit due rows for one consumer. A row is due when it is pending and available, or
-- leased and its lease has run out (the worker died). Rows past their attempt cap go dead instead of
-- being handed out again. SKIP LOCKED lets several workers lease at once without sharing a row.
create or replace function public.hunt_outbox_lease(p_consumer text, p_limit integer default 10, p_lease_seconds integer default 60)
returns setof public.hunt_outbox
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'p_lease_seconds must be between 5 and 900' using errcode = '22023';
  end if;

  update public.hunt_outbox o
     set status = 'dead', lease_token = null, leased_until = null,
         last_error = coalesce(o.last_error, 'attempt cap reached')
   where o.consumer = p_consumer
     and o.attempts >= o.max_attempts
     and ((o.status = 'pending' and o.available_at <= now()) or (o.status = 'leased' and o.leased_until <= now()));

  return query
  with due as (
    select o.id
      from public.hunt_outbox o
     where o.consumer = p_consumer
       and ((o.status = 'pending' and o.available_at <= now())
         or (o.status = 'leased' and o.leased_until <= now()))
     order by o.available_at, o.created_at
     limit p_limit
     for update skip locked
  )
  update public.hunt_outbox o
     set status = 'leased',
         attempts = o.attempts + 1,
         lease_token = gen_random_uuid(),
         leased_until = now() + make_interval(secs => p_lease_seconds)
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

-- Record that the provider effect happened and close the row. Idempotent: a second call with the same
-- token after success is a no-op, and a stale token (the lease moved on) is refused. The receipt is
-- keyed twice, by event and by semantic key, so the same effect reached under two event ids is one row.
create or replace function public.hunt_outbox_complete(p_id uuid, p_lease_token uuid, p_provider_ref text default null)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.hunt_outbox%rowtype;
begin
  select * into r from public.hunt_outbox where id = p_id for update;
  if not found then
    return 'missing';
  end if;
  if r.status = 'done' then
    return 'already_done';
  end if;
  if r.status <> 'leased' or r.lease_token is distinct from p_lease_token then
    return 'stale_lease';
  end if;

  insert into public.hunt_deliveries (consumer, event_id, semantic_key, provider_ref)
  values (r.consumer, r.event_id, r.semantic_key, p_provider_ref)
  on conflict do nothing;

  update public.hunt_outbox
     set status = 'done', completed_at = now(), lease_token = null, leased_until = null, last_error = null
   where id = p_id;
  return 'done';
end;
$$;

-- Give the row back with a reason. The attempt was counted at lease time, so this schedules the next
-- one with backoff, or dead-letters the row once the cap is spent. A stale token is refused.
create or replace function public.hunt_outbox_fail(p_id uuid, p_lease_token uuid, p_error text)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.hunt_outbox%rowtype;
begin
  select * into r from public.hunt_outbox where id = p_id for update;
  if not found then
    return 'missing';
  end if;
  if r.status <> 'leased' or r.lease_token is distinct from p_lease_token then
    return 'stale_lease';
  end if;

  if r.attempts >= r.max_attempts then
    update public.hunt_outbox
       set status = 'dead', lease_token = null, leased_until = null, last_error = left(p_error, 500)
     where id = p_id;
    return 'dead';
  end if;

  update public.hunt_outbox
     set status = 'pending', lease_token = null, leased_until = null,
         available_at = now() + public.hunt_outbox_backoff(r.attempts),
         last_error = left(p_error, 500)
   where id = p_id;
  return 'retry';
end;
$$;

-- Put dead rows of one Hunt back in the queue. Bounded (at most 100 a call), needs a reason and an
-- actor, and writes one hunt_audit row per call. A row that already has a receipt is closed instead of
-- re-queued, so replay can never repeat an effect that happened.
create or replace function public.hunt_outbox_replay(p_hunt_id uuid, p_actor uuid, p_reason text, p_limit integer default 25)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  n integer := 0;
  moved integer;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_actor is null or char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'replay needs an actor and a reason' using errcode = '22023';
  end if;

  update public.hunt_outbox o
     set status = 'done', completed_at = now(), lease_token = null, leased_until = null
   where o.id in (
     select d.id from public.hunt_outbox d
      where d.hunt_id = p_hunt_id and d.status = 'dead'
        and exists (select 1 from public.hunt_deliveries v where v.consumer = d.consumer and v.event_id = d.event_id)
      order by d.created_at limit p_limit
      for update skip locked);

  with picked as (
    select d.id from public.hunt_outbox d
     where d.hunt_id = p_hunt_id and d.status = 'dead'
     order by d.created_at limit p_limit
     for update skip locked
  )
  update public.hunt_outbox o
     set status = 'pending', attempts = 0, available_at = now(), last_error = null
    from picked where o.id = picked.id;
  get diagnostics moved = row_count;
  n := moved;

  insert into public.hunt_audit (hunt_id, actor_profile_id, action, target_kind, after_state)
  values (p_hunt_id, p_actor, 'outbox_replay', 'hunt_outbox',
          jsonb_build_object('requeued', n, 'reason', left(p_reason, 200)));
  return n;
end;
$$;

revoke all on function public.hunt_outbox_backoff(integer) from public, anon, authenticated;
grant execute on function public.hunt_outbox_backoff(integer) to service_role;
revoke all on function public.hunt_outbox_lease(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hunt_outbox_lease(text, integer, integer) to service_role;
revoke all on function public.hunt_outbox_complete(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.hunt_outbox_complete(uuid, uuid, text) to service_role;
revoke all on function public.hunt_outbox_fail(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.hunt_outbox_fail(uuid, uuid, text) to service_role;
revoke all on function public.hunt_outbox_replay(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.hunt_outbox_replay(uuid, uuid, text, integer) to service_role;

comment on table public.hunt_outbox is 'FH-009: effects committed with a claim, drained by a leasing worker. One row per (consumer, event). Service role only.';
comment on table public.hunt_deliveries is 'FH-009: receipts. One per (consumer, event) and one per (consumer, semantic_key), so a retry after a lost completion records one effect.';

commit;
