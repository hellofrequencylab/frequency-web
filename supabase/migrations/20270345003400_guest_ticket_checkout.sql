-- Guest ticket checkout: a signed-out visitor buys an event ticket, and claims it when they join.
--
-- The RSVP half of this already exists (capture_guest_rsvp / claim_guest_rsvps, 20270303000100 and
-- 20270345000600): a guest gives an address, the seat is held under that address, and when they
-- later sign in with a PROVEN copy of the same address the seat is attached to their account. A
-- ticket is the same story with money on it, and it had no such door: event_tickets.buyer_profile_id
-- is the only identity the row could carry, so a signed-out buyer had nowhere to be recorded and
-- createTicketCheckout simply required a member.
--
-- WHAT THIS ADDS. Three things, and nothing else.
--
--   1. `event_tickets.guest_email`, the address a signed-out buyer bought under.
--   2. `reserve_ticket_atomic` gains a ninth parameter, `_guest_email`, defaulting null. The
--      capacity rule it enforces does NOT change in any way.
--   3. `public.claim_guest_tickets()`, the authenticated door that attaches those purchases to the
--      buyer's account once the provider has confirmed the address is theirs.
--
-- ── WHY THERE IS NO UNIQUE INDEX ON (event_id, lower(guest_email)) ───────────────────────────────
-- The brief that asked for this file asked for one "only if that matches how RSVPs do it". It does
-- not, and adding it would refuse real purchases.
--
-- event_rsvps carries event_rsvps_event_guest_email_uniq (20270303000000) because an RSVP is a SEAT
-- and one person holds at most one. A ticket row is not a seat, it is a PURCHASE RECORD, and the
-- table says so in three places:
--   · there is no unique index on (event_id, buyer_profile_id) either, so a MEMBER may already buy
--     twice. A guest index would hold guests to a rule members are not held to.
--   · a row exists per checkout ATTEMPT, not per completed sale: status is pending | succeeded |
--     failed | refunded. An abandoned or failed attempt leaves its pending row behind, so a unique
--     index would lock a buyer out of retrying their own purchase after a card decline, for the
--     thirty minutes the reservation window runs and forever after for a `failed` row.
--   · qty exists precisely so one row can be several tickets, and buying two seats now and a third
--     next week is an ordinary thing for a person to do.
-- So the uniqueness that is right for a seat is wrong for a receipt, and the index is deliberately
-- absent. What IS added is the non-unique lookup index claim_guest_tickets needs, the mirror of
-- event_rsvps_unclaimed_guest_idx.
--
-- ⚠️ NO IDENTITY CHECK CONSTRAINT IS ADDED, DELIBERATELY. The obvious one, "a row carries a buyer
-- OR a guest address, never neither", was written and then removed: `buyer_profile_id` is
-- `on delete set null` ON PURPOSE (20260609020000: "so the host's sales record survives the buyer
-- deleting their account"), SET NULL is an UPDATE, and a CHECK is re-evaluated by it. The
-- constraint would therefore make a profile delete RAISE rather than anonymise the sale, on exactly
-- the member-bought rows it was meant to protect. It forbids a state this schema deliberately
-- produces. Identity is enforced where it belongs instead, in `reserve_ticket_atomic`, the only
-- writer of a new ticket, which refuses `no_identity` and `ambiguous_identity` before inserting.
-- The full reasoning sits beside section 1 where the constraint would have gone.
--
-- ── THE CAPACITY RULE IS NOT COPIED, IT IS THE SAME RULE ────────────────────────────────────────
-- reserve_ticket_atomic (20260930000000) exists because the old pre-check oversold: N concurrent
-- buyers all read `quantity - sold` before any payment settled. It holds a per-tier advisory lock,
-- re-reads committed capacity (succeeded rows plus pending rows inside the 30 minute window that
-- matches the Stripe session expiry) and inserts the pending row in the same transaction. Every
-- line of that is reproduced here byte for byte. The ONLY edits to the body are the identity
-- guards at the top and `guest_email` in the two insert column lists, so a guest queues behind the
-- same lock, is counted by the same sum, and is refused by the same `sold_out` comparison. A guest
-- reservation that a member's in-flight pending row has filled the tier with is refused, and vice
-- versa, because neither one knows which kind of buyer the other was.
--
-- ── THE CLAIM DOOR ──────────────────────────────────────────────────────────────────────────────
-- Doctrine copied from claim_guest_rsvps (20270303000100) and convert_signup_leads_for_me
-- (20270345003300), both of which solved this exact problem:
--   · NO ARGUMENTS. It never accepts an email, because a typed address keys nothing (ADR-854): an
--     auth.users row exists from the moment somebody types an address at /sign-in.
--   · The address is read server-side out of auth.users for auth.uid() only, and only when
--     email_confirmed_at is set. An unconfirmed address is a claim, not a proof, and money has
--     already changed hands on these rows.
--   · 🔴 The profile lookup is ORDERED. profiles.auth_user_id carries an INDEX and no unique
--     constraint, and one auth user really can own two profile rows. An unordered `select ... into`
--     picks whatever the plan reaches first, which was a real defect fixed in 20270345003300. The
--     earliest profile wins, id breaks the tie, nulls sort last.
--   · guest_email is LEFT IN PLACE after the claim, unlike the RSVP path which must clear it to
--     satisfy event_rsvps_identity_check. Here it is the record of how the ticket was bought, it is
--     what a re-run must not re-match (the `buyer_profile_id is null` filter does that), and it is
--     the address the receipt went to.
--   · Idempotent by that same filter: a second call matches nothing and returns 0.
--
-- ROLLBACK (all three, together):
--   drop function if exists public.claim_guest_tickets();
--   drop function if exists public.reserve_ticket_atomic(uuid, uuid, uuid, integer, integer, integer, text, text, text);
--   re-run 20260930000000_reserve_ticket_atomic.sql verbatim to restore the eight-argument form;
--   drop index if exists public.event_tickets_unclaimed_guest_idx;
--   alter table public.event_tickets drop column if exists guest_email;
-- Dropping the column destroys the only record of who bought a guest ticket, so export it first if
-- any row carries one. The app half (the guest checkout path that passes _guest_email, and the
-- sign-in finaliser that calls claim_guest_tickets) MUST roll back in the SAME deploy: the eight
-- argument form of the RPC rejects the nine-argument call outright.
--
-- House style: additive and idempotent (add column if not exists, drop constraint if exists then
-- re-add, create or replace), SECURITY DEFINER with a pinned search_path, revoke by role NAME
-- before granting (ADR-959: a bare `from public` leaves Supabase's per-role default grants
-- standing). No em or en dashes.
-- pgTAP: supabase/tests/guest_ticket_checkout.test.sql.

begin;

-- ── 1. The column, the lookup index, and the identity floor ──────────────────────────────────────

alter table public.event_tickets
  add column if not exists guest_email text;

comment on column public.event_tickets.guest_email is
  'The address a signed-out buyer bought this ticket under, lowercased and trimmed by reserve_ticket_atomic. NOT mutually exclusive with buyer_profile_id: claim_guest_tickets fills the buyer in and LEAVES this in place, because it is the record of how the purchase was made and the address the receipt went to. An UNPROVEN address, so it may address a receipt but must never gate anything a member would have to sign in for (ADR-854); the claim door proves it against auth.users instead. Deliberately NOT unique per event: a ticket row is a purchase attempt, not a seat, and a buyer may retry a declined card or buy again later.';

-- The claim lookup: every unclaimed guest purchase for one address, across events. Mirrors
-- event_rsvps_unclaimed_guest_idx. NOT unique, for the reasons in the header.
create index if not exists event_tickets_unclaimed_guest_idx
  on public.event_tickets (lower(guest_email))
  where guest_email is not null and buyer_profile_id is null;

-- 🔴 NO IDENTITY CHECK CONSTRAINT, AND THAT IS A DECISION RATHER THAN AN OMISSION.
--
-- The obvious constraint here is `check (buyer_profile_id is not null or guest_email is not null)`:
-- a ticket should be attributable to somebody. It was written, and then removed, because this table
-- already declares the opposite intent one line at a time:
--
--   buyer_profile_id uuid references public.profiles(id) on delete set null   (20260609020000)
--
-- and that migration says why in as many words: "so the host's sales record survives the buyer
-- deleting their account". SET NULL is an UPDATE, so a CHECK is re-evaluated by it. A MEMBER-bought
-- row carries no guest_email, so the constraint would fail exactly when a buyer deletes their
-- account, and the delete would RAISE instead of anonymising the sale. There is a live path that
-- does this (app/(main)/admin/actions.ts, lib/demo/decay.ts).
--
-- So the constraint does not protect an invariant; it forbids a state the schema deliberately
-- produces. An anonymised sale with neither identity is VALID here: it is a receipt whose buyer
-- exercised their right to be forgotten, and the host keeps the row.
--
-- What it would have bought is already bought elsewhere and earlier: `reserve_ticket_atomic` is the
-- ONLY writer of a new ticket, and it refuses `no_identity` and `ambiguous_identity` before the
-- insert. That is where identity is enforced, at the door rather than on the furniture.
--
-- The trade if this is ever revisited: a constraint that breaks account deletion costs a person a
-- privacy right to buy a guarantee the insert path already gives. That is the wrong way round.

-- ── 2. reserve_ticket_atomic, taking a guest ─────────────────────────────────────────────────────
-- The eight-argument form is dropped rather than replaced: `create or replace` cannot add a
-- parameter, it would leave BOTH functions installed, and a PostgREST call naming the original
-- eight arguments would then match two candidates and fail as ambiguous. Existing callers
-- (lib/billing/tickets.ts) name exactly those eight, and the ninth defaults to null, so they keep
-- working against the new form unchanged.

drop function if exists public.reserve_ticket_atomic(uuid, uuid, uuid, integer, integer, integer, text, text);

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
  perform pg_advisory_xact_lock(hashtextextended(_tier_id::text, 0));

  select quantity into v_quantity from public.event_ticket_types where id = _tier_id;

  if v_quantity is not null then
    -- Committed capacity = paid (status='succeeded') + in-flight pending held within 30 min. It
    -- counts succeeded rows DIRECTLY (not the `sold` column) so it's robust against the brief gap
    -- between settle_ticket_atomic flipping pending->succeeded and bumping `sold`. Abandoned
    -- pending rows fall out of the window (matching the 30-min Stripe session expiry), freeing
    -- seats. It does NOT read buyer_profile_id or guest_email, which is the whole point: a guest
    -- reservation is counted by the same sum as a member's, so the two compete for the same seats
    -- under the same lock.
    select coalesce(sum(qty), 0) into v_committed
    from public.event_tickets
    where ticket_type_id = _tier_id
      and (status = 'succeeded'
           or (status = 'pending' and created_at > now() - interval '30 minutes'));

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
  'Reserves ticket capacity and records the pending event_tickets row in one transaction, under a per-tier advisory lock, re-counting committed capacity (succeeded plus pending inside the 30 minute window) so concurrent buyers cannot oversell a tier. Takes EITHER _buyer (a profile id) or _guest_email (a signed-out buyer, normalised and format-checked here), never both and never neither. The capacity rule is identical for the two: it reads neither column. Returns { reserved } or { reserved: false, reason: invalid_qty | no_identity | ambiguous_identity | invalid_email | sold_out }. service_role only, because the only callers are the checkout creator and the Stripe webhook.';

-- ── 3. claim_guest_tickets: the authenticated door, proved by a CONFIRMED address ────────────────

create or replace function public.claim_guest_tickets()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_email      text;
  v_n          integer;
begin
  -- WHO. auth.uid() is null for anon and for any caller without a JWT, so the lookup returns
  -- nothing and this is a no-op for them. There is no argument to spoof because there is no
  -- argument at all.
  -- 🔴 ORDERED, because profiles.auth_user_id carries only an INDEX and not a unique constraint.
  -- One auth user really can own two profile rows: a trigger mints one at signup and nothing in
  -- the schema refuses a second. An unordered pick would attach a PAID ticket to whichever row the
  -- plan happened to reach first, and could answer differently on two different days. The earliest
  -- profile wins (for a duplicated account that is the one minted at signup, the row the rest of
  -- the platform has treated as theirs for longest), id breaks the tie so the order is total, and
  -- nulls last keeps a row with no created_at from sorting ahead of a real one. Same fix as
  -- 20270345003300.
  select p.id into v_profile_id
    from public.profiles p
   where p.auth_user_id = auth.uid()
   order by p.created_at asc nulls last, p.id asc
   limit 1;

  if v_profile_id is null then
    return 0;
  end if;

  -- WHICH ADDRESS. Read server-side out of auth.users, never taken from the caller (ADR-854: a
  -- typed address keys nothing, and an auth.users row exists from the moment somebody types one at
  -- /sign-in). email_confirmed_at is the whole proof. It matters more here than anywhere else this
  -- pattern is used: an unproven address would hand over somebody else's PAID ticket.
  select lower(btrim(u.email)) into v_email
    from auth.users u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  -- `buyer_profile_id is null` is what makes this idempotent and what makes it safe: a purchase
  -- that already belongs to somebody is never re-pointed, whatever address it carries. guest_email
  -- is deliberately NOT cleared. Unlike event_rsvps there is no identity check forbidding a row
  -- from holding both, and the address is the record of how the ticket was bought and where the
  -- receipt went.
  update public.event_tickets t set
    buyer_profile_id = v_profile_id
  where t.buyer_profile_id is null
    and t.guest_email is not null
    and lower(btrim(t.guest_email)) = v_email;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.claim_guest_tickets() is
  'Attaches every unclaimed guest ticket purchase whose address matches the CALLER''S OWN confirmed auth.users email to their profile, and returns how many it attached. Takes no arguments and never accepts an email (ADR-854); reads the address server-side for auth.uid() only and refuses an unconfirmed one, because money has changed hands on these rows. Returns 0 and writes nothing when there is no profile or no proven address. Idempotent: it only touches rows with buyer_profile_id is null, so a purchase that already belongs to somebody is never re-pointed. Leaves guest_email in place as the record of how the ticket was bought. authenticated only.';

-- ── 4. Grants ────────────────────────────────────────────────────────────────────────────────────
-- Revoke by role NAME first: a bare `from public` leaves Supabase's per-role default grants
-- standing (ADR-959, 20270215000001), and the drop-and-recreate above means both functions start
-- from Supabase's defaults rather than from the ACL the old form had.
--
-- reserve_ticket_atomic stays service_role only. It is money: the amount, the fee and the session
-- id are all caller-supplied, so a browser role holding it could mint a pending row at any price.
-- The guest checkout runs signed out but it runs through the server action, which holds the
-- service key; anon never touches this function.
--
-- claim_guest_tickets is authenticated only, because anon has no proven address to match on.

revoke execute on function public.reserve_ticket_atomic(uuid, uuid, uuid, integer, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ticket_atomic(uuid, uuid, uuid, integer, integer, integer, text, text, text) to service_role;

revoke execute on function public.claim_guest_tickets() from public, anon, authenticated;
grant execute on function public.claim_guest_tickets() to authenticated;

commit;
