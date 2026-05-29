-- Phase 6.2 (docs/COMMS-CRM-ARCHITECTURE.md §2): the deliverability loop.
--
-- Resend webhooks land in email_events (delivery/engagement log for observability
-- + analytics). Hard bounces and spam complaints auto-add the address to
-- email_suppressions, which the send path checks before EVERY send so we never
-- re-mail a bad address (one incident can poison sender reputation). Service-role
-- only. Additive; regenerate types after applying.

create table if not exists public.email_events (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  event_type  text not null,            -- sent | delivered | opened | clicked | bounced | complained | ...
  provider_id text,                     -- Resend email id
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists email_events_email_idx on public.email_events (email, created_at desc);
create index if not exists email_events_type_idx  on public.email_events (event_type, created_at desc);

create table if not exists public.email_suppressions (
  email      text primary key,          -- lowercased
  reason     text not null,             -- hard_bounce | complaint | manual
  created_at timestamptz not null default now()
);

alter table public.email_events enable row level security;
alter table public.email_suppressions enable row level security;
-- No policies: written by the Resend webhook + read by the send path, both
-- service-role. Clients have no access.

comment on table public.email_events is
  'Resend webhook delivery/engagement log (deliverability + analytics). Service-role only. See docs/COMMS-CRM-ARCHITECTURE.md §2.';
comment on table public.email_suppressions is
  'Addresses to never email (hard bounce / complaint / manual). Checked by sendRawEmail before every send.';
