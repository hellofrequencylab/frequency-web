-- EVENT HOSTING ENTITY (owner directive, 2026-07-25): an event created through a Business Space's
-- calendar is HOSTED by that space; registrations and ticket payments route through it. The events
-- table had three axes but none of them meant "hosted by a Space":
--   host_id        -> the personal OPERATOR (authorship, edit rights, notifications). Unchanged.
--   space_id       -> pure tenancy/placement ("lives under"), backfilled to the ROOT space for all
--                     legacy rows, so it can NOT double as the hosting entity.
--   scope_id/type  -> circle/region placement. Unchanged.
-- host_space_id is the new, explicit HOSTING axis: when set, the space is the billed + displayed
-- host ("Hosted by <space>"), the ticket payee resolves through the space owner's Connect account
-- (mirroring lib/commerce/checkout.ts resolveCharge), and the take-rate keys off the space. Null =
-- a personal event, exactly today's behavior.
--
-- NO BACKFILL on purpose: space_id == root means "the platform's lane", and inferring hosting from
-- non-root placement would guess at intent for events placed-but-not-hosted. Managers re-home an
-- event explicitly via the new "Hosted by" control (setEventHostEntity).

alter table public.events
  add column if not exists host_space_id uuid references public.spaces(id) on delete set null;

comment on column public.events.host_space_id is
  'The HOSTING entity when a Space hosts this event (billed + displayed host; ticket payee routes through the space owner). Null = personal event hosted by host_id. Distinct from space_id, which is pure tenancy/placement (ADR-819).';

create index if not exists events_host_space_id_idx
  on public.events (host_space_id) where host_space_id is not null;
