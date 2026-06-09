-- =============================================================================
-- Event tickets — second payout channel on the Connect foundation (Phase 3, ADR-177)
--
-- A host can put a price on an event; a signed-in member buys a ticket. Money moves
-- as a Stripe destination charge: the platform creates the charge, keeps the
-- application fee (STRIPE_PLATFORM_FEE_PCT), and transfers the rest to the event
-- host's connected account (ADR-175). Same one-off pattern as tips (ADR-176).
--
-- `events.price_cents` NULL or 0 = free (RSVP only, no ticket). The event_tickets
-- table is the durable purchase record — written ONLY by the service role (the
-- checkout creator + the Stripe webhook), never the client.
-- =============================================================================

alter table public.events
  add column if not exists price_cents integer check (price_cents is null or price_cents >= 0),
  add column if not exists currency text not null default 'usd';

create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- The buyer. SET NULL (not cascade) so the host's sales record survives the
  -- buyer deleting their account.
  buyer_profile_id uuid references public.profiles(id) on delete set null,
  qty integer not null default 1 check (qty > 0),
  amount_cents integer not null check (amount_cents > 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  succeeded_at timestamptz
);

create index if not exists event_tickets_event_id_idx on public.event_tickets (event_id, created_at desc);
create index if not exists event_tickets_buyer_idx on public.event_tickets (buyer_profile_id, created_at desc);
create unique index if not exists event_tickets_checkout_session_idx
  on public.event_tickets (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.event_tickets enable row level security;

-- A member reads tickets they bought; an event host reads tickets sold for THEIR
-- events. All writes go through the service role.
drop policy if exists "read own or hosted tickets" on public.event_tickets;
create policy "read own or hosted tickets" on public.event_tickets
  for select using (
    buyer_profile_id in (select id from public.profiles where auth_user_id = auth.uid())
    or event_id in (
      select e.id from public.events e
      join public.profiles p on p.id = e.host_id
      where p.auth_user_id = auth.uid()
    )
  );

comment on table public.event_tickets is
  'Real-money event ticket purchases via Stripe destination charge to the event host (ADR-177). Service-role write only.';
