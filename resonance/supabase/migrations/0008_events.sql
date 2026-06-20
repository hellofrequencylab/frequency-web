-- 0008_events — scheduled events and simple ticketing (build plan §10).
--
-- Isolation (docs/ISOLATION.md): every table lives in `resonance`; FKs only ever
-- point WITHIN this schema. All user references are plain uuid (external/own auth
-- id) with NO cross-schema FK (ADR-002).
--
-- Payment capture for paid/pwyc tickets is deferred to Phase 2 (Stripe). For now,
-- paid and pay-what-you-can tickets are recorded with status 'reserved' (no money
-- moves); free tickets are 'confirmed' immediately.

-- A scheduled event, optionally tied to a venue.
create table if not exists resonance.events (
  id           uuid primary key default gen_random_uuid(),
  world_id     uuid not null,
  venue_id     uuid references resonance.venues(id) on delete set null,
  host_user_id uuid not null,                 -- external id; no cross-schema FK
  title        text not null,
  description  text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  ticket_type  text not null default 'free'
                 check (ticket_type in ('free', 'paid', 'pwyc')),
  price_cents  integer,
  capacity     integer,
  created_at   timestamptz not null default now()
);

create index if not exists events_world_starts
  on resonance.events (world_id, starts_at);

-- One ticket per user per event. amount_cents records what was named (pwyc) or
-- charged (paid); 0 for free. status is 'confirmed' for free, 'reserved' until
-- Phase 2 payment capture for paid/pwyc.
create table if not exists resonance.event_tickets (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references resonance.events(id) on delete cascade,
  user_id      uuid not null,                 -- external id; no cross-schema FK
  amount_cents integer not null default 0,
  status       text not null default 'confirmed'
                 check (status in ('confirmed', 'reserved')),
  created_at   timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table resonance.events        enable row level security;
alter table resonance.event_tickets enable row level security;
