-- =============================================================================
-- Tips — the first payout channel on the Connect foundation (Phase 2, ADR-176)
--
-- A signed-in member tips a host/partner directly. The money moves as a Stripe
-- destination charge: the platform creates the charge, takes an application fee
-- (STRIPE_PLATFORM_FEE_PCT), and transfers the rest to the recipient's connected
-- account (ADR-175). This table is the durable record of each tip — written ONLY
-- by the service role (the checkout creator + the Stripe webhook), never the client.
--
-- Tips are REAL money and are deliberately separate from the gems/zaps ledger
-- (lib/economy/ledger.ts), which tracks in-platform points.
-- =============================================================================

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  -- The tipper. SET NULL (not cascade) so a recipient's earnings record survives
  -- the tipper deleting their account.
  from_profile_id uuid references public.profiles(id) on delete set null,
  -- The recipient (must be payouts-ready at checkout time).
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  currency text not null default 'usd',
  message text,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  succeeded_at timestamptz
);

create index if not exists tips_to_profile_id_idx on public.tips (to_profile_id, created_at desc);
create index if not exists tips_from_profile_id_idx on public.tips (from_profile_id, created_at desc);
create unique index if not exists tips_checkout_session_idx
  on public.tips (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.tips enable row level security;

-- A member may read tips they sent OR received; all writes go through the service role.
drop policy if exists "read own tips" on public.tips;
create policy "read own tips" on public.tips
  for select using (
    to_profile_id in (select id from public.profiles where auth_user_id = auth.uid())
    or from_profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.tips is
  'Real-money tips from a member to a host/partner via Stripe destination charge (ADR-176). Service-role write only; separate from the gems/zaps ledger.';
