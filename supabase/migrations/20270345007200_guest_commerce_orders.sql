-- THE GUEST DOOR FOR COMMERCE ORDERS (LIVE-396), and the claim that attaches one to an account.
--
-- A Journey cannot be bought without an account. Research puts forced account creation at 19-26% of
-- checkout abandonment, and production on 2026-09-21 read 24 checkout.session.expired against 1
-- completed. This is the schema half of closing that.
--
-- ── WHY NOT "CREATE AN ACCOUNT AT FULFILMENT" ───────────────────────────────────────────────────
-- The LIVE-396 row asked for exactly that and it was the wrong shape. This repo has solved
-- signed-out purchase three times and never once by minting an account:
--   event_rsvps    claim_guest_rsvps            20270303000100  (ADR-1033)
--   crm leads      convert_signup_leads_for_me  20270345003300
--   event_tickets  claim_guest_tickets          20270345003400
-- The doctrine is identical each time: the guest buys, the row carries an address and a NULL owner,
-- and a no-argument claim attaches it once the provider has PROVEN the address. Minting an account
-- from a webhook would invent a fourth mechanism and create accounts nobody asked for.
--
-- ── WHY THIS CLAIMS ORDERS AND DOES NOT WRITE ENROLMENTS ────────────────────────────────────────
-- 🔴 The tempting version of this function inserts a `journey_enrollments` row and is WRONG.
-- `journey_enrollments.profile_id` is NOT NULL, so a guest cannot hold an enrolment and the claim
-- must create one — but what "enrolling" MEANS is not one row. lib/journey-plans.adoptPlan is the
-- single authority (lib/commerce/journey-fulfilment.ts calls it "ONE authority for what enrolling
-- means: the same call the free path makes, so a paid learner gets the practices, the adoption row
-- and the solo enrolment exactly as everyone else does"). SQL that inserted the enrolment row alone
-- would hand a paying guest a degraded enrolment missing its practices, and nothing would say so.
--
-- So this function claims the ORDER and returns the ids it claimed. The caller
-- (lib/commerce/claim-guest-orders-on-sign-in.ts) then runs the ordinary `enrolByOrder` for each,
-- which is the same path the member webhook takes. One authority, reached from two doors.
--
-- ── WHY IT IS ORDERS AND NOT JOURNEYS ───────────────────────────────────────────────────────────
-- The claim doors above are per TABLE, not per product. `commerce_orders` is the table, so this is
-- its door. `enrolByOrder` already no-ops for an order that bought no Journey, so a future guest
-- purchase of another product kind claims through here and fulfils through its own path without a
-- second claim door being invented.
--
-- ── 🔴 ONLY SETTLED ORDERS ARE CLAIMED ──────────────────────────────────────────────────────────
-- `status` is pending | paid | fulfilled | cancelled | refunded | failed, and a row exists from
-- checkout START. Claiming a `pending` order would hand its ids to enrolByOrder, which grants
-- access on the assumption its caller settled the payment — so an abandoned guest checkout would
-- become free access on sign-in. The filter is the whole guard and it is not a nicety.
--
-- ── NO IDENTITY CHECK CONSTRAINT, for the reason 20270345003400 records ─────────────────────────
-- The obvious "a row carries a buyer OR a guest address" CHECK is deliberately absent. VERIFIED on
-- the live catalog rather than copied: commerce_orders_buyer_profile_id_fkey is
-- `ON DELETE SET NULL`, exactly as event_tickets is. SET NULL is an UPDATE, a CHECK is re-evaluated
-- by it, and the constraint would therefore make a profile delete RAISE rather than anonymise the
-- sale — on precisely the member-bought rows it was meant to protect. Identity is enforced at the
-- writer instead (lib/billing/checkout-*), the same place `reserve_ticket_atomic` enforces it.

-- ── 1. The address a guest bought under ─────────────────────────────────────────────────────────
alter table public.commerce_orders
  add column if not exists guest_email text;

comment on column public.commerce_orders.guest_email is
  'The address a SIGNED-OUT buyer checked out under (LIVE-396). Exactly one of this and buyer_profile_id is set at insert; both may be set after claim_guest_orders() attaches the sale, because the address stays as the record of how it was bought and where the receipt went.';

-- The lookup claim_guest_orders needs, mirroring event_tickets_unclaimed_guest_idx. Partial, so it
-- indexes only rows that can still be claimed and stays small as sales accumulate.
create index if not exists commerce_orders_unclaimed_guest_idx
  on public.commerce_orders (lower(btrim(guest_email)))
  where buyer_profile_id is null and guest_email is not null;

-- ── 2. The claim door ───────────────────────────────────────────────────────────────────────────
create or replace function public.claim_guest_orders()
returns setof uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_email      text;
begin
  -- WHO. auth.uid() is null for anon and for any caller without a JWT, so this is a no-op for them.
  -- There is no argument to spoof because there is no argument at all.
  -- 🔴 ORDERED, because profiles.auth_user_id carries only an INDEX and not a unique constraint:
  -- one auth user really can own two profile rows, and an unordered pick would attach a PAID order
  -- to whichever the plan reached first and could answer differently on two different days. The
  -- earliest profile wins, id breaks the tie so the order is total, nulls last. Same fix as
  -- 20270345003300 and 20270345003400.
  select p.id into v_profile_id
    from public.profiles p
   where p.auth_user_id = auth.uid()
   order by p.created_at asc nulls last, p.id asc
   limit 1;

  if v_profile_id is null then
    return;
  end if;

  -- WHICH ADDRESS. Read server-side out of auth.users, never taken from the caller (ADR-854: a
  -- typed address keys nothing, and an auth.users row exists from the moment somebody types one at
  -- /sign-in). email_confirmed_at is the whole proof, and it matters here as much as on a ticket:
  -- an unproven address would hand over somebody else's paid purchase.
  select lower(btrim(u.email)) into v_email
    from auth.users u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    return;
  end if;

  -- `buyer_profile_id is null` is what makes this idempotent and what makes it safe: an order that
  -- already belongs to somebody is never re-pointed, whatever address it carries. guest_email is
  -- deliberately NOT cleared — it is the record of how the order was bought and where the receipt
  -- went, and the null-owner filter is what stops a re-run re-matching it.
  return query
  update public.commerce_orders o set
    buyer_profile_id = v_profile_id
  where o.buyer_profile_id is null
    and o.guest_email is not null
    and lower(btrim(o.guest_email)) = v_email
    -- See the header: claiming a pending or failed order would become free access on sign-in.
    and o.status in ('paid', 'fulfilled')
  returning o.id;
end;
$$;

comment on function public.claim_guest_orders() is
  'Attach every SETTLED guest commerce order bought under the caller''s PROVEN address to their profile, returning the claimed order ids so the caller can run ordinary fulfilment (enrolByOrder). No arguments by design (ADR-854). Idempotent via the null-owner filter.';

-- Revoke by role NAME first: a bare `from public` leaves Supabase's per-role default grants
-- standing (ADR-959), so anon would keep EXECUTE on a SECURITY DEFINER function.
revoke execute on function public.claim_guest_orders() from public, anon, authenticated;
grant execute on function public.claim_guest_orders() to authenticated;
