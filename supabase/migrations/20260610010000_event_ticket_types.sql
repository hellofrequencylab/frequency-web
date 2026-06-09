-- =============================================================================
-- Event ticket TIERS — depth on the existing Connect ticketing (EVENTS-SYSTEM §2.2)
--
-- Today an event has a single flat price (`events.price_cents`). This adds named
-- ticket TIERS with richer pricing modes:
--   fixed         — a set price (price_cents)
--   free          — RSVP-style, no checkout (price_cents ignored)
--   pwyc          — pay-what-you-can: buyer chooses ≥ min_cents (suggested prefilled)
--   sliding_scale — buyer chooses within a suggested band, floored at min_cents
--   donation      — buyer chooses any amount ≥ min_cents (a contribution)
--
-- Money still moves exactly as ADR-177: a Stripe destination charge to the event
-- host's connected account minus the platform application fee (lib/billing/fees.ts),
-- behind the `host_payouts_enabled` operator flag (ADR-178). This table only adds
-- the catalog + inventory; the charge math lives in lib/billing/tickets.ts.
--
-- INVENTORY: `quantity` (NULL = unlimited) caps how many can sell; `sold` is the
-- running count. `sold` is incremented/decremented ONLY by the service role (the
-- webhook + refund handler) — it must never be client-writable or a buyer could
-- forge inventory. Hence: RLS ON, SELECT for anyone who can see the event, and NO
-- insert/update/delete policy (service role bypasses RLS).
--
-- BACKWARD COMPAT: events with `events.price_cents` and NO tier rows keep working
-- as an implicit single `fixed` tier. Tiers are strictly additive — nothing here
-- requires an event to have tiers, and createTicketCheckout falls back to the flat
-- price when no ticketTypeId is supplied.
-- =============================================================================

create table if not exists public.event_ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  -- How the buyer's charge amount is determined (see header).
  pricing_mode text not null default 'fixed'
    check (pricing_mode in ('fixed','free','pwyc','sliding_scale','donation')),
  -- The set price for `fixed`. For free/pwyc/sliding/donation it is ignored (the
  -- amount is buyer-chosen, floored at min_cents).
  price_cents integer check (price_cents is null or price_cents >= 0),
  -- The server-enforced floor for buyer-chosen modes (pwyc/sliding_scale/donation).
  -- NULL is treated as 0 by the app. A free tier needs no floor.
  min_cents integer check (min_cents is null or min_cents >= 0),
  -- The amount prefilled in the buyer's input for buyer-chosen modes (the nudge).
  suggested_cents integer check (suggested_cents is null or suggested_cents >= 0),
  -- Inventory cap. NULL = unlimited.
  quantity integer check (quantity is null or quantity >= 0),
  -- Running count of succeeded purchases against this tier. Service-role write only.
  sold integer not null default 0 check (sold >= 0),
  -- Limit purchase to paying members (Crew+); enforced in app, surfaced in UI.
  member_only boolean not null default false,
  sort_order integer not null default 0,
  -- A retired tier stays for historical tickets but can't be bought.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists event_ticket_types_event_idx
  on public.event_ticket_types (event_id, sort_order, created_at);

alter table public.event_ticket_types enable row level security;

-- SELECT for anyone who can already see the event: the subquery is itself filtered
-- by the events SELECT policy (crew+ in scope), so a tier is visible exactly when
-- its event is. No INSERT/UPDATE/DELETE policy — all writes go through the service
-- role (the admin editor server actions + the Stripe webhook/refund handler), so
-- `sold` and pricing can never be tampered with by a client.
drop policy if exists "read tiers for visible events" on public.event_ticket_types;
create policy "read tiers for visible events" on public.event_ticket_types
  for select using (
    event_id in (select id from public.events)
  );

-- Link a ticket purchase to the tier it bought (NULL = a legacy/flat-price ticket
-- bought before tiers, or an event with no tiers). SET NULL so retiring/deleting a
-- tier never destroys the durable purchase record.
alter table public.event_tickets
  add column if not exists ticket_type_id uuid
    references public.event_ticket_types(id) on delete set null;

create index if not exists event_tickets_ticket_type_idx
  on public.event_tickets (ticket_type_id);

-- A ticket can be refunded after it succeeded. Widen the status set; the refund
-- handler (lib/billing/tickets.ts + the stripe webhook) sets 'refunded' and frees
-- the tier's `sold` capacity.
alter table public.event_tickets
  drop constraint if exists event_tickets_status_check;
alter table public.event_tickets
  add constraint event_tickets_status_check
    check (status in ('pending','succeeded','failed','refunded'));

alter table public.event_tickets
  add column if not exists refunded_at timestamptz;

comment on table public.event_ticket_types is
  'Named ticket tiers (fixed/free/pwyc/sliding_scale/donation) + inventory for an event (EVENTS-SYSTEM §2.2). Service-role write only; `sold` is never client-writable. Events with a flat events.price_cents and no rows here keep working as an implicit single fixed tier.';
comment on column public.event_ticket_types.sold is
  'Succeeded purchases against this tier. Incremented by the Stripe webhook, decremented on refund — service role only.';
