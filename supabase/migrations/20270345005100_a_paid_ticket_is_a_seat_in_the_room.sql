-- A paid ticket is a seat in the room.
--
-- ⚠️ THIS FILE IS A RECOVERY, NOT A NEW CHANGE. Version 20270345005100 was applied to production on
-- 2026-09-16 with no file in the tree, and `pnpm check:migrations` rule 4 failed on every open PR
-- and on `main`: a ledger row with no repo file is SQL production ran that a fresh environment will
-- never reproduce. The ledger's `statements` column was NULL for this row, so the SQL below was
-- recovered from the live catalog rather than replayed from a recording:
--
--   pg_get_functiondef  for record_ticket_seat and refund_ticket_atomic
--   pg_attribute        for event_rsvps.from_ticket_id
--   pg_constraint       for event_rsvps_from_ticket_id_fkey
--   pg_indexes          for event_rsvps_from_ticket_idx
--   obj_description /
--   col_description     for both comments, which are the author's own words
--
-- WHAT THAT MEANS FOR A REPLAY. Every statement here is idempotent, and the two function bodies are
-- byte-equal to what production is running today (comments excepted: pg_get_functiondef does not
-- return them, so the inline commentary in refund_ticket_atomic is the author's from 20270345001700
-- plus a note on the new CTE). Applying this file to a fresh database reproduces the live schema.
-- It is deliberately NOT a "fix" of what was applied: recovering a migration and changing it are
-- two different acts, and doing both at once is how a tree stops describing production.
--
-- ── WHAT THE MIGRATION DOES ──────────────────────────────────────────────────────────────────────
--
-- Buying a ticket and holding a seat were two separate facts. `event_tickets` recorded the money;
-- `event_rsvps` recorded who is coming, and it is what the host's list, the capacity trigger, the
-- reminders and the door all read. A buyer who paid and never pressed RSVP was, to every one of
-- those, not attending.
--
-- record_ticket_seat(_ticket_id) closes that: given a settled ticket it mints the seat, by profile
-- for a member and by lowercased address for a guest, and reports whether THIS call created it. It
-- is idempotent by construction -- both inserts ride the partial unique indexes event_rsvps already
-- carries ((event_id, profile_id) and (event_id, lower(guest_email))), so a redelivered webhook
-- updates the same row rather than minting a second seat. It sends nothing and awards nothing; the
-- settle path already sends the receipt.
--
-- event_rsvps.from_ticket_id records WHICH ticket minted a seat, and is set only on the insert that
-- creates it. Someone who RSVP'd first and bought afterwards keeps a NULL, which is what makes the
-- release safe: refund_ticket_atomic deletes the rows that name the refunded ticket and nothing
-- else, so a refund never erases an answer the person gave for themselves.
--
-- The function has no caller in the tree yet. That is the state production is in, and this file
-- records it rather than correcting it.
--
-- ROLLBACK:
--   drop function if exists public.record_ticket_seat(uuid);
--   alter table public.event_rsvps drop column if exists from_ticket_id;   -- takes the index and fkey
-- then re-apply 20270345001700 for the previous refund_ticket_atomic (the `released` CTE below is
-- the only difference; without the column it will not compile).
--
-- No em or en dashes.

begin;

-- ── 1. Which ticket minted this seat ─────────────────────────────────────────────────────────────

alter table public.event_rsvps
  add column if not exists from_ticket_id uuid references public.event_tickets(id) on delete set null;

comment on column public.event_rsvps.from_ticket_id is
  'The succeeded event_tickets row that minted this seat, or NULL for a seat the person made themselves. Set ONLY on the insert that creates the seat: someone who RSVP''d first and bought afterwards keeps a NULL here, so refunding their ticket leaves the answer they gave. refund_ticket_atomic deletes the rows that name the refunded ticket and nothing else.';

-- Read once per refund, against a column that is NULL on almost every row. Partial, so the seats
-- people made themselves cost nothing to index.
create index if not exists event_rsvps_from_ticket_idx
  on public.event_rsvps (from_ticket_id)
  where from_ticket_id is not null;

-- ── 2. Mint the seat ─────────────────────────────────────────────────────────────────────────────

create or replace function public.record_ticket_seat(_ticket_id uuid)
returns table (rsvp_id uuid, minted boolean, seat_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   uuid;
  v_profile uuid;
  v_email   text;
begin
  -- SETTLED AND NOT REFUNDED, re-read here rather than trusted from the caller: this function
  -- writes the row the door reads, so the ticket's own status is the only thing that may authorise
  -- it. A pending or refunded ticket returns zero rows and mints nothing.
  select t.event_id, t.buyer_profile_id, lower(nullif(btrim(t.guest_email), ''))
    into v_event, v_profile, v_email
    from public.event_tickets t
   where t.id = _ticket_id
     and t.status = 'succeeded'
     and t.refunded_at is null;

  if v_event is null then
    return;
  end if;

  -- MEMBER FIRST, then guest. reserve_ticket_atomic already refuses a ticket that carries both
  -- identities or neither, so exactly one branch can apply. `r.xmax = 0` is true only for a row
  -- this statement inserted, which is how `minted` tells a new seat from a redelivered webhook
  -- landing on one that already existed.
  if v_profile is not null then
    return query
      insert into public.event_rsvps as r (event_id, profile_id, status, approval_status, from_ticket_id)
      values (v_event, v_profile, 'going', 'approved', _ticket_id)
      on conflict (event_id, profile_id) where profile_id is not null
      do update set status = 'going', approval_status = 'approved'
      returning r.id, (r.xmax = 0), r.status;
  elsif v_email is not null then
    return query
      insert into public.event_rsvps as r (event_id, guest_email, status, approval_status, from_ticket_id)
      values (v_event, v_email, 'going', 'approved', _ticket_id)
      on conflict (event_id, lower(guest_email)) where guest_email is not null
      do update set status = 'going', approval_status = 'approved'
      returning r.id, (r.xmax = 0), r.status;
  end if;
  return;
end;
$$;

revoke execute on function public.record_ticket_seat(uuid) from public, anon, authenticated;
grant execute on function public.record_ticket_seat(uuid) to service_role;

comment on function public.record_ticket_seat(uuid) is
  'Mints the event_rsvps seat for a settled ticket (member by profile, guest by lowercased address), idempotently. Returns (rsvp_id, minted, seat_status): minted=true only when the row was created by THIS call. Sends nothing and awards nothing -- the settle path already sends the receipt. service_role only. Owner report 2026-09-16.';

-- ── 3. A refund releases the seat it minted ──────────────────────────────────────────────────────
-- Identical to 20270345001700 except for the `released` CTE. Restated in full rather than patched,
-- because this is the function that decides whether a refunded buyer still holds a seat.

create or replace function public.refund_ticket_atomic(_payment_intent_id text)
returns table (
  id                 uuid,
  event_id           uuid,
  ticket_type_id     uuid,
  qty                integer,
  entity_id          uuid,
  platform_fee_cents integer,
  buyer_profile_id   uuid,
  currency           text
)
language sql
security definer
set search_path to 'public'
as $function$
  with flipped as (
    update public.event_tickets t
       set status       = 'refunded',
           refunded_at  = now()
     where t.stripe_payment_intent_id = _payment_intent_id
       and t.status = 'succeeded'
    returning t.id, t.event_id, t.ticket_type_id, t.qty, t.entity_id,
              t.platform_fee_cents, t.buyer_profile_id, t.currency
  ),
  unbumped as (
    update public.event_ticket_types tt
       -- greatest(0, ...) keeps the column's `sold >= 0` check true even against historical drift.
       set sold = greatest(0, tt.sold - agg.delta)
      from (
        select f.ticket_type_id as tier, sum(coalesce(f.qty, 1))::integer as delta
          from flipped f
         where f.ticket_type_id is not null
         group by f.ticket_type_id
      ) agg
     where tt.id = agg.tier
    returning tt.id
  ),
  released as (
    -- ONLY the seats this ticket minted. from_ticket_id is NULL on a seat the person made
    -- themselves, so a refund cannot take an RSVP away from someone who had already said yes.
    delete from public.event_rsvps r
     using flipped f
     where r.from_ticket_id = f.id
    returning r.id
  )
  select f.id, f.event_id, f.ticket_type_id, f.qty, f.entity_id,
         f.platform_fee_cents, f.buyer_profile_id, f.currency
    from flipped f;
$function$;

revoke execute on function public.refund_ticket_atomic(text) from public, anon, authenticated;
grant execute on function public.refund_ticket_atomic(text) to service_role;

comment on function public.refund_ticket_atomic(text) is
  'Unwinds a fully refunded ticket: flips succeeded -> refunded, gives the qty back to event_ticket_types.sold, and releases the event_rsvps seat the ticket minted (from_ticket_id), in ONE transaction, returning the rows it flipped (empty on a redelivered charge.refunded). Mirror of settle_ticket_atomic. service_role only. LIVE-161, seat release 2026-09-16.';

commit;
