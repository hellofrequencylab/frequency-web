-- space_donations: THE DONATION LEDGER (LIVE-235). The row space_donation_asks has been waiting for
-- since 20260716000000, which said in as many words: "Real charges + tax receipts are Phase 4 and
-- deliberately NOT modeled here (additive later: a payments table + a charge id column, never a
-- refactor)". This is that additive payments table, and nothing about the ask table changes.
--
-- WHY NOW. Nothing has ever been charged on this platform. Production, 2026-09-08: commerce_orders 0,
-- event_tickets 0, space_subscription_items 0, financial_transactions 0, tips 0, and
-- space_donation_asks 0. Five money loops are built and none has completed once. A donation is the
-- lowest-friction way a community pays a business: no seat to allocate, no inventory, no calendar,
-- no membership to reconcile. It was also the only one of the five with NO checkout at all, so the
-- member-facing Donate card rendered quick-pick amounts under a line admitting that pressing them
-- did nothing.
--
-- SHAPE: mirrors `tips` exactly, because the money moves identically. A donation is a ONE-OFF Stripe
-- Connect DESTINATION CHARGE (ADR-1291: destination charges on Express accounts, platform as merchant
-- of record). The gross transfers to the space owner's connected account; the platform keeps an
-- application fee equal to the space plan's take-rate at the classified order source, which is 0 on a
-- gift from the space's own people (ADR-811 §A: 0% on your own business, a rate only on what the
-- collective sourced). `pending` is written before the Checkout session is payable and flipped to
-- `succeeded` by the webhook keyed on the session id, so a redelivered event is a no-op and a
-- half-finished checkout leaves a row that can be reconciled rather than a payment with nothing
-- behind it.
--
-- ACCESS MODEL (mirrors tips / space_donation_asks / outreach_sends): RLS enabled with NO client
-- policies at all, so the only path in is the service-role server code in
-- lib/billing/space-donation-checkout.ts. A donor reads their own receipt through the gated server
-- read, never through PostgREST.
--
-- 🔴 NO TRIGGER, NO SECURITY DEFINER FUNCTION, deliberately. A SECURITY DEFINER function runs with the
-- CALLER's role, not the definer's, so a trigger guarding `auth.role() <> 'service_role'` fires inside
-- one; that exact mistake blocked the membership webhook on this branch and was caught by db-tests.
-- This table needs neither, so it introduces neither.
--
-- House style: additive + idempotent (IF NOT EXISTS / guarded drops). SAFE to re-run. No em dashes.

create table if not exists public.space_donations (
  id                          uuid primary key default gen_random_uuid(),
  space_id                    uuid not null references public.spaces(id) on delete cascade,
  -- The ask that was on screen when the gift was made. NULL-tolerant: an ask can be edited or cleared
  -- after a donation, and losing the gift with it would be worse than losing the attribution.
  ask_id                      uuid references public.space_donation_asks(id) on delete set null,
  -- NULL for a signed-out donor. A gift does not require an account.
  donor_profile_id            uuid references public.profiles(id) on delete set null,
  amount_cents                integer not null check (amount_cents > 0),
  platform_fee_cents          integer not null default 0 check (platform_fee_cents >= 0),
  currency                    text not null default 'usd',
  -- The EFFECTIVE order source the fee was computed at (ADR-811 §3): a disconnected space collapses
  -- to 'self', so the stored attribution matches the 0% actually billed (the honest receipt).
  source                      text not null default 'self' check (source in ('self', 'network')),
  message                     text,
  status                      text not null default 'pending'
                                check (status in ('pending', 'succeeded', 'refunded', 'abandoned')),
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  succeeded_at                timestamptz,
  refunded_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.space_donations is
  'One-off gifts to a Space fund (LIVE-235). A Stripe Connect DESTINATION CHARGE: the gross transfers to the space owner''s connected account and the platform keeps platform_fee_cents (0 on a self-sourced gift, ADR-811). Written pending by lib/billing/space-donation-checkout.ts before the Checkout session is payable, flipped to succeeded by the Stripe webhook keyed on stripe_checkout_session_id. Service-role only.';
comment on column public.space_donations.ask_id is
  'The space_donation_asks row on screen when the gift was made. ON DELETE SET NULL: an edited or cleared ask must never take the donation with it.';
comment on column public.space_donations.donor_profile_id is
  'The signed-in donor, or NULL for a signed-out gift. Giving does not require an account.';
comment on column public.space_donations.source is
  'The EFFECTIVE order source the application fee was computed at (self = the space''s own people, 0%; network = the collective sourced the donor). Stored so the receipt matches what was billed.';
comment on column public.space_donations.status is
  'pending (session created, not paid) | succeeded (webhook confirmed payment) | refunded | abandoned (the session expired or its delayed payment failed).';

-- The webhook settles by session id, and it must find exactly one row. A UNIQUE index makes a double
-- insert impossible rather than merely unlikely, which is what keeps the settle idempotent.
create unique index if not exists space_donations_session_idx
  on public.space_donations (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- The refund path resolves by PaymentIntent (charge.refunded carries no session).
create index if not exists space_donations_payment_intent_idx
  on public.space_donations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- The operator's fund view: this Space's gifts, newest first, filtered by status.
create index if not exists space_donations_space_status_created_idx
  on public.space_donations (space_id, status, created_at desc);

-- A donor's own receipts.
create index if not exists space_donations_donor_idx
  on public.space_donations (donor_profile_id, created_at desc)
  where donor_profile_id is not null;

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ─────────────
-- Exactly like tips and space_donation_asks. Enabling RLS with no SELECT/INSERT/UPDATE/DELETE policy
-- denies every direct client path, so the only way to a donation row is the gated server code.
alter table public.space_donations enable row level security;
