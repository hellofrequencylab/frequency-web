-- =============================================================================
-- HANDING HOSTING TO ANOTHER SPACE: event ↔ space host transfers (ADR-911)
--
-- WHAT: the HOST of an event (events.host_space_id) is the billed, displayed, accountable party —
-- registrations run through it and ticket money pays into its owner's Connect account (ADR-819).
-- Until now the only way to set it was setEventHostEntity, which requires the actor to already be
-- an event-creator of the TARGET Space (or platform staff). That is the correct guard and it is also
-- a dead end: a venue's manager cannot hand hosting to the practitioner who is actually running the
-- event, so an operator had to do it by hand every time.
--
-- WHY IT CANNOT SIMPLY BE OPENED UP: accepting host means accepting the PAYOUT LIABILITY and the
-- refund obligation for other people's ticket sales. Nobody may be made a payee without saying yes.
-- So this is a two-sided handshake, not a permission widening.
--
-- TWO ENTRY POINTS, ONE TABLE (see app/(main)/events/host-transfer-actions.ts):
--   • the event's host side OFFERS hosting to a Space  → that Space's stewards accept.
--   • a Space ASKS to host an event                    → the event's host side accepts.
-- Either AUTO-ACCEPTS when the actor already runs both sides, which is exactly the case
-- setEventHostEntity already allows today, so this adds no new authority — only a path for the case
-- it refused.
--
-- ─── WHAT AN ACCEPTED ROW DOES, AND DOES NOT, DO ──────────────────────────────────────────────────
-- Accepting sets events.host_space_id and NOTHING ELSE. It deliberately does NOT touch
-- events.space_id: the venue keeps the event on its calendar (space_public_calendar_feed already
-- matches `e.space_id = t.id OR e.host_space_id = t.id`), which is the whole point of the
-- host/venue split. A row here is a RECORD of consent, never itself a grant: every reader keys off
-- events.host_space_id, so revoking or superseding a transfer cannot leave stale hosting behind.
--
-- ⚠️ MONEY IN FLIGHT. Accepting re-points the payee for FUTURE checkouts only. Orders already paid
-- settled against the previous host's Connect account and are not rewritten — a refund on one of
-- those is still the previous host's to issue. The app layer refuses a transfer while the event has
-- paid orders and is not yet over (see canOfferHostTransfer), because silently splitting one event's
-- takings across two payees is worse than refusing the handoff.
--
-- ACCESS MODEL — RLS ENABLED, NO POLICIES, service-role only. Same posture as event_space_shares
-- (20261197000000) and event_placement_requests (20261111000000); belongs in
-- scripts/rls-deny-all.txt. Every read/write goes through the admin client behind app-layer authz.
-- RLS-on-no-policy = fail-closed: anon and authenticated get nothing.
--
-- Reversible: drop table public.event_host_transfers. Nothing else references it, and
-- events.host_space_id keeps whatever value the last accepted transfer wrote.
-- =============================================================================

create table if not exists public.event_host_transfers (
  id                uuid        primary key default gen_random_uuid(),
  event_id          uuid        not null references public.events(id)  on delete cascade,
  -- The Space being offered / asking for the host role.
  to_space_id       uuid        not null references public.spaces(id)  on delete cascade,
  -- The host at the moment the transfer was raised, so the audit trail survives a later change.
  -- Nullable: a personal or platform event has no Space host to record.
  from_space_id     uuid        references public.spaces(id)           on delete set null,
  -- Which side raised it: 'host' = the event side offered, 'space' = the target asked to host.
  initiated_by      text        not null check (initiated_by in ('host', 'space')),
  requested_by      uuid        not null references public.profiles(id),
  status            text        not null default 'pending'
                                check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,
  responded_by      uuid        references public.profiles(id)
);

-- At most ONE live offer per event, whoever it is to. Hosting is singular: two pending offers would
-- let whichever Space accepts second silently take over a payee role the first already accepted.
-- A resolved row (declined | revoked | accepted) is outside the predicate, so an event can be handed
-- on again later.
create unique index if not exists uniq_event_host_transfer_pending
  on public.event_host_transfers (event_id)
  where status = 'pending';

-- The target Space's inbox: "someone wants us to host this".
create index if not exists idx_event_host_transfer_space_status
  on public.event_host_transfers (to_space_id, status);

-- The event side's own view of its offers.
create index if not exists idx_event_host_transfer_event_status
  on public.event_host_transfers (event_id, status);

alter table public.event_host_transfers enable row level security;
-- No policies by design (see header): service-role only, gated in the app layer.

comment on table public.event_host_transfers is
  'Two-sided consent for changing events.host_space_id (ADR-911). Host is the billed payee, so a Space can never be made one without accepting. Accepting writes host_space_id ONLY and never space_id, so the venue keeps the event on its calendar. A RECORD of consent, never a grant: readers key off events.host_space_id. RLS on, no policies, service-role only.';

comment on column public.event_host_transfers.from_space_id is
  'The host at the time the transfer was raised, kept for audit after host_space_id moves on. Null for a personal or platform event.';
