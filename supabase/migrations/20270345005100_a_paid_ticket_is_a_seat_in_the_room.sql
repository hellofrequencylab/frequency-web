-- A PAID TICKET TAKES THE SAME SEAT A FREE CLAIM TAKES (owner report 2026-09-16).
--
-- ── WHAT THE OWNER SAW ──────────────────────────────────────────────────────────────────────────
--
-- They bought a ticket through the on-page checkout, got the receipt and the confirmation, and the
-- event page went on saying "Be the first to RSVP." The purchase was real; the seat was invisible.
--
-- ── WHY, AND WHY IT IS NOT A BUG IN THE SETTLE PATH ─────────────────────────────────────────────
--
-- A seat has been TWO rows in two tables since LIVE-317: an `event_rsvps` row, or a succeeded
-- `event_tickets` row for someone who paid on a tickets-mode event and therefore has NO RSVP row.
-- ADR-826 made that a rule ("ONE join function per event, never both") and every roster-shaped
-- reader was taught the union: the host roster (app/(main)/events/[slug]/manage/load.ts), the
-- reminder cron, host-attested attendance (lib/events/attendance.ts), the CRM. The PUBLIC event
-- page is the one reader that never learned it, so `going` counted `event_rsvps` alone and read 0
-- for a room with a paid ticket holder in it.
--
-- The union could have been taught to one more reader. It is not what this file does, because the
-- owner asked for two other things in the same breath -- the RSVP control should be visible on a
-- ticketed event, and pressing it when you have no ticket should open checkout -- and both of those
-- say RSVP and tickets COEXIST. Once they coexist, "the ticket is instead of the answer" stops
-- being true, and the seat belongs where every other seat already is.
--
-- The shape is not new. The FREE-tier path has recorded its claim as a going RSVP since ADR-410
-- (app/(main)/events/[slug]/ticket-actions.ts: `if (r.free) await setRsvpStatus(eventId, 'going')`).
-- A paid ticket now lands on the same row the free claim has always landed on. What changes is
-- which of the two tables a PAID seat lives in; the union readers already handle a person holding
-- both (manage/load.ts dedupes on the RSVP row), so they keep working and simply take the RSVP arm.
--
-- ── THREE THINGS THIS FILE DOES ─────────────────────────────────────────────────────────────────
--
-- 1. `event_rsvps.from_ticket_id` -- WHICH TICKET MINTED THIS SEAT, or null for a seat the person
--    made themselves. It exists for the refund: a refund must take back the seat the ticket
--    created and must NOT take back an RSVP the person had already made before they bought. With
--    one nullable column that is one predicate; without it, it is a guess.
--
-- 2. `record_ticket_seat(_ticket_id)` -- mints the seat from a settled ticket, idempotently, for a
--    member or a guest. Called from the settle path.
--
-- 3. Two amendments so the seat behaves:
--    a. `enforce_event_rsvp_capacity()` does NOT re-decide a seat backed by a succeeded ticket.
--       🔴 THIS IS THE LOAD-BEARING ONE. The trigger coerces a `going` insert to `waitlist` when
--       `events.capacity` is full. A ticket's inventory was already decided somewhere else, under
--       a different lock, against a different number: `event_ticket_types.quantity`, taken by
--       `reserve_ticket_atomic` and re-measured by `settle_ticket_atomic`. Letting the RSVP
--       trigger coerce a paid seat would take a person's money and then put them on a waitlist,
--       which is the exact shape of SCAN-557 ("a refused RSVP write reported as You're going")
--       with the money attached. The seat was sold. It is not re-auctioned here.
--    b. `refund_ticket_atomic()` releases the seat IT minted (`from_ticket_id = the ticket`), in
--       the same statement that flips the ticket and gives the tier its quantity back. A seat the
--       person made themselves has a null `from_ticket_id` and is left exactly where it is.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
--
-- No email, no gems, no engagement ledger row, no feed line. `setRsvpStatus` sends an RSVP
-- confirmation and awards the first-RSVP gem; the settle path ALREADY sends a ticket receipt
-- (LIVE-316 for a member, LIVE-320 for a guest) and already tells the host (LIVE-345). Routing the
-- mint through `setRsvpStatus` would send a buyer two emails for one act, which is why this is an
-- RPC that writes a row rather than a call into the RSVP action. The receipt IS the confirmation.
--
-- House style: additive + idempotent (add column if not exists, create or replace); SECURITY
-- DEFINER with a pinned search_path; service_role only. No em or en dashes.
-- Ledger: apply through MCP, then repair the ledger row to THIS version (README, two-step protocol).
--
-- ROLLBACK:
--   drop function if exists public.record_ticket_seat(uuid);
--   re-run the `enforce_event_rsvp_capacity` block of 20270345000100 (the ticket exemption goes,
--     and with it the guarantee that a paid seat is not waitlisted);
--   re-run the `refund_ticket_atomic` block of 20270345001700 (the seat release goes);
--   alter table public.event_rsvps drop column if exists from_ticket_id;
--   delete from public.event_rsvps where from_ticket_id is not null;  -- BEFORE the drop, if the
--     minted seats are to go too. Leaving them is also safe: they are ordinary going RSVPs.

begin;

-- ── 1. WHICH TICKET MINTED THIS SEAT ────────────────────────────────────────────────────────────

alter table public.event_rsvps
  add column if not exists from_ticket_id uuid
    references public.event_tickets(id) on delete set null;

comment on column public.event_rsvps.from_ticket_id is
  'The succeeded event_tickets row that minted this seat, or NULL for a seat the person made themselves. Set ONLY on the insert that creates the seat: someone who RSVP''d first and bought afterwards keeps a NULL here, so refunding their ticket leaves the answer they gave. refund_ticket_atomic deletes the rows that name the refunded ticket and nothing else.';

-- The refund's release predicate, and the only read of this column in SQL.
create index if not exists event_rsvps_from_ticket_idx
  on public.event_rsvps (from_ticket_id)
  where from_ticket_id is not null;

-- The capacity trigger's exemption lookup, below: "is there a live paid seat for this person on
-- this event". Partial, so it stays small on an event catalog that is mostly free.
create index if not exists event_tickets_live_seat_idx
  on public.event_tickets (event_id, buyer_profile_id)
  where status = 'succeeded' and refunded_at is null;

-- ── 2. A SEAT SOMEBODY PAID FOR IS NOT RE-DECIDED BY THE RSVP CAPACITY TRIGGER ──────────────────
--
-- Everything below the new guard is copied VERBATIM from 20270345000100 (which itself copied
-- 20270336000000), so a diff between the two bodies shows exactly one hunk. The lock, the guard
-- condition, the approval predicate, the count and the coercion are unchanged.

create or replace function public.enforce_event_rsvp_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap         int;
  going_count int;
begin
  -- THE SEAT WAS ALREADY SOLD (owner report 2026-09-16). A row backed by a live paid ticket is
  -- not subject to the RSVP capacity coercion: `event_ticket_types.quantity` already decided
  -- whether this seat existed, under the per-tier advisory lock reserve_ticket_atomic takes and
  -- settle_ticket_atomic re-measures. Coercing it here would waitlist a person who has paid.
  --
  -- Checked on BOTH identities because both can hold a ticket: a member by `buyer_profile_id`,
  -- a signed-out guest by the address on the ticket (lowercased on both sides -- the column has
  -- no citext and the normalisers are what carry case-insensitivity, same as
  -- event_rsvps_event_guest_email_uniq).
  if exists (
    select 1
      from public.event_tickets t
     where t.event_id = NEW.event_id
       and t.status = 'succeeded'
       and t.refunded_at is null
       and (
         (NEW.profile_id is not null and t.buyer_profile_id = NEW.profile_id)
         or (NEW.guest_email is not null and lower(t.guest_email) = lower(NEW.guest_email))
       )
  ) then
    return NEW;
  end if;

  -- THE SEAT IS TAKEN when the RSVP is going and is not still waiting on the host. Both arms of
  -- the guard below read from that one sentence.
  if NEW.status = 'going'
     and NEW.approval_status is distinct from 'pending'
     and (
       TG_OP = 'INSERT'
       -- became 'going'
       or OLD.status is distinct from 'going'
       -- or was approved into the room: the moment the seat is actually claimed. Without this arm
       -- there is no capacity check at approval time at all.
       or OLD.approval_status is distinct from NEW.approval_status
     )
  then
    -- Lock the event row so concurrent RSVPs serialise on it (race-safe count). Without this,
    -- two inserts in the same instant each count the other's uncommitted row as absent and both
    -- keep the last seat. Same idiom as enforce_circle_member_cap (20260726000000).
    select capacity into cap from public.events where id = NEW.event_id for update;
    if cap is not null then
      select count(*) into going_count
        from public.event_rsvps
       where event_id = NEW.event_id
         and status = 'going'
         -- A request is not a seat. This is SCAN-105's ruling, stated where the database enforces it.
         and approval_status is distinct from 'pending'
         and id <> NEW.id;
      if going_count >= cap then
        NEW.status := 'waitlist';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.enforce_event_rsvp_capacity() from public, anon, authenticated;

-- ── 3. MINT THE SEAT FROM A SETTLED TICKET ──────────────────────────────────────────────────────
--
-- Idempotent on the two partial unique indexes event_rsvps carries (20270303000000): one per
-- member, one per lowercased guest address. A person who already answered gets their existing row
-- moved to `going` -- buying is a later and stronger signal than "maybe" or "can't go", and a
-- pending approval request is settled by the payment -- and KEEPS a null `from_ticket_id`, so a
-- refund leaves the answer they gave. Only the insert that creates the seat names the ticket.
--
-- `xmax = 0` is the standard discriminator for "this row came from the INSERT arm, not the DO
-- UPDATE arm" and is what tells those two cases apart in one statement.

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
  -- Only a LIVE paid ticket seats anyone. A pending, refunded or unknown id returns zero rows,
  -- which the caller reads as "nothing to seat" rather than as a failure.
  select t.event_id, t.buyer_profile_id, lower(nullif(btrim(t.guest_email), ''))
    into v_event, v_profile, v_email
    from public.event_tickets t
   where t.id = _ticket_id
     and t.status = 'succeeded'
     and t.refunded_at is null;

  if v_event is null then
    return;
  end if;

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
  -- A ticket with neither identity cannot be seated. It is already the loud case in the settle
  -- path (persistGuestEmail logs a guest ticket that reached settle with no address), so this
  -- returns zero rows rather than raising: the money work around it must not be rolled back.
  return;
end;
$$;

revoke execute on function public.record_ticket_seat(uuid) from public, anon, authenticated;
grant execute on function public.record_ticket_seat(uuid) to service_role;

comment on function public.record_ticket_seat(uuid) is
  'Mints the event_rsvps seat for a settled ticket (member by profile, guest by lowercased address), idempotently. Returns (rsvp_id, minted, seat_status): minted=true only when the row was created by THIS call. Sends nothing and awards nothing -- the settle path already sends the receipt. service_role only. Owner report 2026-09-16.';

-- ── 4. A REFUND TAKES BACK THE SEAT IT MINTED ───────────────────────────────────────────────────
--
-- Copied from 20270345001700 with ONE CTE added. The flip and the tier unbump are verbatim.
-- The release names the ticket, so it can only ever remove a seat this ticket created.

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
  -- THE SEAT GOES BACK TOO. Only the rows this ticket minted: a member who RSVP'd before they
  -- bought carries a null from_ticket_id and keeps the answer they gave.
  released as (
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
