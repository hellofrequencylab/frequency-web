-- =============================================================================
-- Supporter contributions — the PWYW backing ledger behind the Crew "Supporter"
-- badge (Pricing ladder Phase C, ADR-463 / ADR-495).
--
-- Supporter is RETIRED as a tier and is now an opt-in pay-what-you-want badge on
-- Crew (profiles.is_supporter). This table is the durable record of each real-money
-- CONTRIBUTION a member makes to back the work beyond membership. A contribution is
-- a ONE-TIME Stripe charge (mode:'payment'), a direct PLATFORM payment (NOT a Connect
-- destination charge like tips), so the full amount is the Foundation's revenue — the
-- ledger append (lib/finance/record.ts) books it as a `donation`.
--
-- Written ONLY by the service role (the checkout creator inserts the `pending` row;
-- the Stripe webhook + the success-page confirm flip it to `succeeded`), never the
-- client. Mirrors the `tips` ledger posture (20260609010000_tips.sql).
--
-- DORMANT while `billing_live` is OFF: the charge gate lives at the action call site
-- (startSupporterContribution), so this table simply stays empty until billing goes
-- live. Additive + idempotent; no existing behavior changes. No em or en dashes.
-- =============================================================================

create table if not exists public.supporter_contributions (
  id uuid primary key default gen_random_uuid(),
  -- The contributor. SET NULL (not cascade) so the Foundation's contribution record
  -- survives the member deleting their account (the money still happened).
  profile_id uuid references public.profiles(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  succeeded_at timestamptz
);

create index if not exists supporter_contributions_profile_id_idx
  on public.supporter_contributions (profile_id, created_at desc);
-- One ledger row per Checkout session (idempotent pending -> succeeded flip keys on this).
create unique index if not exists supporter_contributions_checkout_session_idx
  on public.supporter_contributions (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.supporter_contributions enable row level security;

-- A member may read the contributions they made; all writes go through the service role
-- (no client insert/update policy — mirrors `tips`).
drop policy if exists "read own supporter contributions" on public.supporter_contributions;
create policy "read own supporter contributions" on public.supporter_contributions
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.supporter_contributions is
  'Real-money PWYW contributions behind the Crew Supporter badge via a one-time Stripe platform charge (ADR-495). Service-role write only; the full amount is booked as a Foundation donation. Dormant while billing_live is OFF.';
