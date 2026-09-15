-- The delayed-notification buyer resold somebody else's seat, days after they paid. LIVE-343.
--
-- ── THE DEFECT, TRACED THROUGH THE THREE LIVE FUNCTIONS ──────────────────────────────────────────
--
-- A buyer paying by ACH debit, Cash App Pay or a bank redirect does not pay at Checkout. They
-- SUBMIT. Stripe completes the Checkout Session immediately with payment_status 'unpaid' and
-- settles it days later with checkout.session.async_payment_succeeded. The app already knows this
-- (app/api/webhooks/stripe/route.ts, L2-06): both events run the same recorders, and each recorder
-- no-ops on a session that is not 'paid'. So the ticket row sits 'pending' for days. Nothing
-- expires it, because nothing can: the buyer has not abandoned anything.
--
-- reserve_ticket_atomic (20260930000000, widened for the guest door in 20270345003400) counts
-- committed capacity as:
--
--     status = 'succeeded' OR (status = 'pending' AND created_at > now() - interval '30 minutes')
--
-- Thirty minutes is the Checkout SESSION expiry, which is the right clock for an abandoned CARD
-- checkout and the wrong clock for a payment that is still in flight. At minute 31 the submitted
-- ACH row falls out of the count, the tier reads a free seat, and the next buyer gets it.
--
-- settle_ticket_atomic (20270345001700) then flipped that first ticket on a bare
--
--     where stripe_checkout_session_id = ? and status = 'pending'
--
-- with no lock, no re-read of quantity and no capacity branch at all. Both buyers hold a ticket to
-- a one-seat tier, and neither the host nor either buyer is told.
--
-- ── THE FIX, IN TWO HALVES ───────────────────────────────────────────────────────────────────────
--
-- PREVENTION (reserve_ticket_atomic). The 30 minute clock stays for an abandoned checkout, and a
-- SUBMITTED delayed-notification payment gets its own, longer one. event_tickets grows a nullable
-- payment_processing_at, stamped by lib/billing/tickets.ts recordTicketFromSession the moment a
-- ticket session completes 'unpaid'. A pending row holds its seat while EITHER clock is live:
--
--     created_at > now() - interval '30 minutes'            -- an in-flight checkout
--  OR payment_processing_at > now() - interval '7 days'     -- a submitted payment, settling
--
-- 🔴 Why not simply widen the one window to 7 days, which is the smaller diff. Because the seat is
-- the cost. On a 12 seat tier, four people who open Checkout and wander off would take a third of
-- the room out of sale for a week, and the tier would read sold out to everybody else. The 30
-- minute rule exists to make an abandoned hold cheap and it is correct; it was only ever applied to
-- the wrong population. Two clocks, because a pending row is two different facts.
--
-- 7 days is chosen against Stripe's own settlement horizon for ACH direct debit (four to five
-- business days). RESIDUAL, stated rather than hidden: checkout.session.async_payment_FAILED is not
-- wired for tickets today (the route handles it for commerce orders and Space donations only), so a
-- payment that fails after submission holds its seat until this clock runs out instead of being
-- released at once. The clock bounds it; wiring the release is a separate change.
--
-- BACKSTOP (settle_ticket_atomic, this file's main event). Prevention depends on a webhook arriving.
-- The settle is where the money actually lands, so it re-measures capacity there, under the SAME
-- per-tier advisory lock reserve_ticket_atomic takes, and reports what it found on the row it
-- returns. This follows decrement_commerce_stock_atomic (20260819000000), which is the repo's
-- existing "re-check inventory at settlement under a lock" precedent.
--
-- ── 🔴 WHAT HAPPENS WHEN THE SEAT IS GENUINELY GONE, AND WHY ─────────────────────────────────────
--
-- The buyer has been CHARGED. Refusing them and overselling by one are both defensible and both
-- cost somebody something. This function HONOURS THE TICKET and reports the overage. Four reasons,
-- in the order they decided it:
--
--   1. AN AUTOMATIC REFUND IS THE ONLY IRREVERSIBLE OPTION. If this re-check is ever wrong -- a
--      host lowered `quantity` after the sale, a refunded row is miscounted, a clock skews -- an
--      oversell is recoverable by a human (the host adds a chair, moves the room, or refunds on
--      purpose) and a wrong auto-refund is not. By the time the buyer notices, days later, the
--      event may be full. Never let a machine silently undo a purchase it is not certain about.
--   2. IT MATCHES THE PRECEDENT THE OWNER NAMED. decrement_commerce_stock_atomic raises
--      out_of_stock under the lock and lib/commerce/checkout.ts fails SOFT on it: the order stays
--      paid, the ledger row is written, an operator reconciles. Same shape, same reasoning.
--   3. A REFUND CANNOT BE PART OF THIS TRANSACTION. SQL cannot call Stripe. Refunding would mean
--      flipping here and refunding in a second round trip, which is precisely the gap LIVE-161
--      closed for this function. Honouring is one statement and stays one statement.
--   4. SOMEBODY CAN NOW ACT ON IT. LIVE-345 gives the host a bell and an email on every sale, and
--      the overage rides on that same notice with the numbers in it. Before LIVE-345 there was no
--      channel at all, which is the only reason "tell the host" was not already the answer.
--
-- This is a MONEY-AND-TRUST POLICY rather than an engineering detail, and it is flagged for an
-- owner ruling. Honour-and-tell is the safe default in the meantime because it destroys nothing.
--
-- `sold` is allowed past `quantity` by this: the column's only constraint is `sold >= 0`, and a
-- tier that really did sell 13 seats against 12 should read 13. An honest overage is the thing the
-- host needs to see.
--
-- ── SIGNATURE CHANGE ─────────────────────────────────────────────────────────────────────────────
-- settle_ticket_atomic gains three columns on its returned row (over_capacity, tier_quantity,
-- tier_committed). Postgres refuses a create-or-replace that changes a return type, so the function
-- is dropped and recreated, which resets its ACL to Supabase's defaults. Both grants are therefore
-- re-stated role-explicitly below (ADR-959). The ARGUMENTS are unchanged, so every caller and
-- check:schema-contract see the same call.
--
-- Safe to re-run (create or replace / add column if not exists / drop function if exists). No em or
-- en dashes.
--
-- ROLLBACK: re-apply 20270345001700 (its settle_ticket_atomic is the previous definition) after
--   drop function if exists public.settle_ticket_atomic(text, text);
-- and re-apply 20270345003400 for the previous reserve_ticket_atomic. The column may stay; nothing
-- else reads it.
--   alter table public.event_tickets drop column if exists payment_processing_at;

begin;

-- ── 1. The second clock ──────────────────────────────────────────────────────────────────────────

alter table public.event_tickets
  add column if not exists payment_processing_at timestamptz;

comment on column public.event_tickets.payment_processing_at is
  'When a DELAYED-NOTIFICATION payment (ACH debit, Cash App Pay, a bank redirect) was submitted for this ticket: stamped by lib/billing/tickets.ts recordTicketFromSession when checkout.session.completed arrives with payment_status unpaid. NULL on an ordinary card purchase. reserve_ticket_atomic holds the seat while this is within 7 days, because such a buyer has not abandoned anything and the 30 minute session clock would otherwise resell their seat at minute 31. LIVE-343.';

-- A pending row that is still settling is read on every reservation for its tier. Partial, so it
-- costs nothing on the card rows that make up almost all of the table.
create index if not exists event_tickets_processing_idx
  on public.event_tickets (ticket_type_id, payment_processing_at)
  where payment_processing_at is not null;

-- ── 2. reserve_ticket_atomic: two clocks, one seat ───────────────────────────────────────────────
-- Identical to 20270345003400 except for the committed-capacity predicate. Restated in full rather
-- than patched, because this is the function that decides whether a seat is sold.

create or replace function public.reserve_ticket_atomic(
  _tier_id      uuid,
  _event_id     uuid,
  _buyer        uuid,
  _qty          integer,
  _amount_cents integer,
  _fee_cents    integer,
  _currency     text,
  _session_id   text,
  _guest_email  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quantity  integer;
  v_committed integer;
  v_guest     text := nullif(lower(btrim(coalesce(_guest_email, ''))), '');
begin
  if _qty is null or _qty <= 0 then
    return jsonb_build_object('reserved', false, 'reason', 'invalid_qty');
  end if;

  -- EXACTLY ONE IDENTITY, decided before any lock is taken. Neither is a row that no one can be
  -- told about; both is a row whose owner is ambiguous the moment claim_guest_tickets runs.
  if _buyer is null and v_guest is null then
    return jsonb_build_object('reserved', false, 'reason', 'no_identity');
  end if;

  if _buyer is not null and v_guest is not null then
    return jsonb_build_object('reserved', false, 'reason', 'ambiguous_identity');
  end if;

  -- Same shape capture_guest_rsvp validates with, re-checked here rather than trusted from the
  -- caller: this row is what a receipt is addressed to and what the claim door matches on later,
  -- so an address that cannot be a mailbox must not reach it.
  if v_guest is not null
     and (length(v_guest) > 254 or v_guest !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return jsonb_build_object('reserved', false, 'reason', 'invalid_email');
  end if;

  if _tier_id is null then
    -- Legacy flat-price path: no per-tier capacity, just record the pending row.
    insert into public.event_tickets
      (event_id, buyer_profile_id, guest_email, ticket_type_id, qty, amount_cents, platform_fee_cents, currency, status, stripe_checkout_session_id)
    values (_event_id, _buyer, v_guest, null, _qty, _amount_cents, _fee_cents, coalesce(_currency, 'usd'), 'pending', _session_id);
    return jsonb_build_object('reserved', true);
  end if;

  -- Serialize reservations for this tier: concurrent buyers block here so the capacity read +
  -- insert below are atomic and can't both pass the check for the same last seats.
  -- settle_ticket_atomic takes this SAME lock before it re-measures, so a reservation and a
  -- settlement on one tier can never read capacity at the same instant.
  perform pg_advisory_xact_lock(hashtextextended(_tier_id::text, 0));

  select quantity into v_quantity from public.event_ticket_types where id = _tier_id;

  if v_quantity is not null then
    -- Committed capacity = paid (status='succeeded') + every pending row still holding its seat.
    -- It counts succeeded rows DIRECTLY (not the `sold` column) so it's robust against the brief gap
    -- between settle_ticket_atomic flipping pending->succeeded and bumping `sold`. It does NOT read
    -- buyer_profile_id or guest_email, which is the whole point: a guest reservation is counted by
    -- the same sum as a member's, so the two compete for the same seats under the same lock.
    --
    -- TWO CLOCKS, because a pending row is two different facts (LIVE-343):
    --   created_at            -- an OPEN checkout. 30 minutes, matching the Stripe session expiry
    --                            set in lib/billing/tickets.ts. An abandoned card checkout frees its
    --                            seat quickly, which is what makes a small tier usable.
    --   payment_processing_at -- a SUBMITTED delayed-notification payment, settling. 7 days, which
    --                            covers ACH direct debit's four to five business days. This buyer
    --                            has abandoned nothing and their seat is not available to anyone.
    select coalesce(sum(qty), 0) into v_committed
    from public.event_tickets
    where ticket_type_id = _tier_id
      and (status = 'succeeded'
           or (status = 'pending'
               and (created_at > now() - interval '30 minutes'
                    or payment_processing_at > now() - interval '7 days')));

    if v_committed + _qty > v_quantity then
      return jsonb_build_object('reserved', false, 'reason', 'sold_out');
    end if;
  end if;

  insert into public.event_tickets
    (event_id, buyer_profile_id, guest_email, ticket_type_id, qty, amount_cents, platform_fee_cents, currency, status, stripe_checkout_session_id)
  values (_event_id, _buyer, v_guest, _tier_id, _qty, _amount_cents, _fee_cents, coalesce(_currency, 'usd'), 'pending', _session_id);

  return jsonb_build_object('reserved', true);
end;
$$;

comment on function public.reserve_ticket_atomic(uuid, uuid, uuid, integer, integer, integer, text, text, text) is
  'Reserves ticket capacity and records the pending event_tickets row in one transaction, under a per-tier advisory lock, re-counting committed capacity so concurrent buyers cannot oversell a tier. Committed = succeeded, plus pending rows still holding a seat on either clock: an open checkout inside 30 minutes (created_at) or a submitted delayed-notification payment inside 7 days (payment_processing_at, LIVE-343). Takes EITHER _buyer (a profile id) or _guest_email (a signed-out buyer, normalised and format-checked here), never both and never neither. The capacity rule is identical for the two: it reads neither column. Returns { reserved } or { reserved: false, reason: invalid_qty | no_identity | ambiguous_identity | invalid_email | sold_out }. service_role only, because the only callers are the checkout creator and the Stripe webhook.';

-- ── 3. settle_ticket_atomic: measure capacity where the money lands ──────────────────────────────

drop function if exists public.settle_ticket_atomic(text, text);

create function public.settle_ticket_atomic(_session_id text, _payment_intent_id text)
returns table (
  id                 uuid,
  event_id           uuid,
  ticket_type_id     uuid,
  qty                integer,
  entity_id          uuid,
  platform_fee_cents integer,
  buyer_profile_id   uuid,
  currency           text,
  -- NEW (LIVE-343). True when honouring this ticket puts the tier past `quantity`. The ticket is
  -- flipped either way; see the header for why. False on an uncapped or tierless ticket.
  over_capacity      boolean,
  -- The numbers behind that verdict, so the app can log and tell the host what it actually saw
  -- rather than restating the word. NULL on an uncapped tier or a flat-price ticket.
  tier_quantity      integer,
  tier_committed     integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket    uuid;
  v_tier      uuid;
  v_qty       integer;
  v_quantity  integer;
  v_committed integer;
  v_over      boolean := false;
begin
  -- WHICH TICKET, read before any lock. A ticket's tier never changes, so this read cannot go
  -- stale in a way that matters, and reading it first keeps the lock order here identical to
  -- reserve_ticket_atomic's: advisory lock first, rows second. No row lock is taken on
  -- event_ticket_types at all -- the advisory lock is what serialises against a reservation, and
  -- adding a second lock edge that refund_ticket_atomic does not take would be a new deadlock
  -- surface for nothing.
  select t.id, t.ticket_type_id, t.qty
    into v_ticket, v_tier, v_qty
    from public.event_tickets t
   where t.stripe_checkout_session_id = _session_id
     and t.status = 'pending'
   limit 1;

  -- No pending row: a redelivered webhook, or a session with no ticket at all. Return zero rows,
  -- exactly as the previous definition did. lib/billing/tickets.ts tells those two apart itself.
  if v_ticket is null then
    return;
  end if;

  if v_tier is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_tier::text, 0));

    select tt.quantity into v_quantity
      from public.event_ticket_types tt
     where tt.id = v_tier;

    if v_quantity is not null then
      -- SUCCEEDED ONLY, and deliberately NOT the two-clock predicate reserve uses. Reserve asks
      -- "could this seat be taken", so it must count everything in flight. This asks "has this seat
      -- actually been taken", at the moment money lands, and an in-flight pending row is not a
      -- taken seat: counting one would raise a false overage against a buyer who paid, over a
      -- checkout that may be abandoned a minute later. Each settle measures the truth at its own
      -- instant, so the one that genuinely crosses the line is the one that reports it.
      -- Excludes this ticket; it is added back by the comparison.
      select coalesce(sum(t.qty), 0) into v_committed
        from public.event_tickets t
       where t.ticket_type_id = v_tier
         and t.id <> v_ticket
         and t.status = 'succeeded';

      v_over := (v_committed + coalesce(v_qty, 1)) > v_quantity;
    end if;
  end if;

  -- The flip and the `sold` bump, unchanged from 20270345001700 and still ONE statement: there is
  -- no interval in which a ticket is succeeded and its tier has not counted it.
  return query
  with flipped as (
    update public.event_tickets t
       set status                   = 'succeeded',
           succeeded_at             = now(),
           -- coalesce, not a blind write: never erase a PaymentIntent we already hold.
           stripe_payment_intent_id = coalesce(_payment_intent_id, t.stripe_payment_intent_id)
     where t.stripe_checkout_session_id = _session_id
       and t.status = 'pending'
    returning t.id, t.event_id, t.ticket_type_id, t.qty, t.entity_id,
              t.platform_fee_cents, t.buyer_profile_id, t.currency
  ),
  bumped as (
    -- A data-modifying CTE runs exactly once and to completion whether or not the primary query
    -- reads it, so this executes on the SAME snapshot as the flip above. Zero flipped rows means
    -- the aggregate is empty and no tier is touched.
    update public.event_ticket_types tt
       set sold = greatest(0, tt.sold + agg.delta)
      from (
        select f.ticket_type_id as tier, sum(coalesce(f.qty, 1))::integer as delta
          from flipped f
         where f.ticket_type_id is not null
         group by f.ticket_type_id
      ) agg
     where tt.id = agg.tier
    returning tt.id
  )
  select f.id, f.event_id, f.ticket_type_id, f.qty, f.entity_id,
         f.platform_fee_cents, f.buyer_profile_id, f.currency,
         v_over, v_quantity, v_committed
    from flipped f;
end;
$$;

-- The drop above reset the ACL to Supabase's defaults (anon and authenticated are granted EXECUTE
-- on every new public function), so both halves are restated role-explicitly. ADR-959.
revoke execute on function public.settle_ticket_atomic(text, text) from public, anon, authenticated;
grant execute on function public.settle_ticket_atomic(text, text) to service_role;

comment on function public.settle_ticket_atomic(text, text) is
  'Settles the ticket behind a paid Checkout session: flips pending -> succeeded and moves event_ticket_types.sold by the flipped qty in ONE transaction, returning the rows it flipped (empty on a redelivered event). Before flipping it takes the SAME per-tier advisory lock reserve_ticket_atomic uses and re-measures the tier against succeeded sales, reporting over_capacity / tier_quantity / tier_committed on the returned row (LIVE-343). It HONOURS a ticket that no longer fits and says so rather than dropping a purchase the buyer was already charged for; lib/billing/tickets.ts logs it and tells the host. service_role only. LIVE-161, LIVE-343.';

commit;
