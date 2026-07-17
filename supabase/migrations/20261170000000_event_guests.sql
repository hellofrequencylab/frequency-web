-- Event-invite capture loop (ADR-154, docs/NETWORK-CRM.md § The Network rework).
--
-- The third, genuinely new primitive of the Network rework: the GUEST LIST behind a
-- member's attributed event QR. A member's /q/<slug> code (owner + event stamped)
-- opens a PUBLIC, non-member RSVP capture form; on submit the captured person is
-- written to THREE places, consent observed (lib/events/guests.ts):
--   1. event_guests        — this table (the event's invited-guest list)
--   2. network_contacts     — the INVITER's personal book, source='event'
--   3. contacts (marketing) — consent_state='unknown' (ADDED, never mailed)
--
-- Gating doctrine (mirrors network_contacts, ADR-098): a captured person stays
-- PERSONAL. This table is fail-closed — RLS enabled, WRITES are service-role only
-- (the triple-write runs through the admin client behind a verified signed token,
-- lib/qr/event-invite.ts); the only caller-role access is a SELECT for the inviter
-- (their own captured guests) and the event host (their event's guest list). No
-- insert/update/delete policy exists, so anon/authenticated cannot write.
--
-- Additive. After applying, regenerate types — until then the app talks to this
-- table through the untyped admin handle (repo convention, cf. lib/connections/store.ts).

-- ── Guest record ─────────────────────────────────────────────────────────────
create table if not exists public.event_guests (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events(id)   on delete cascade,
  inviter_profile_id uuid not null references public.profiles(id) on delete cascade,
  display_name       text,
  email              text,
  phone              text,
  rsvp_status        text check (rsvp_status in ('going', 'maybe', 'declined')),
  source             text not null default 'event_qr' check (source in ('event_qr')),
  meta               jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists event_guests_event_idx   on public.event_guests (event_id);
create index if not exists event_guests_inviter_idx on public.event_guests (inviter_profile_id);

-- ── RLS — fail-closed: service-role writes only; inviter + host may read ───────
alter table public.event_guests enable row level security;

-- SELECT only. The inviter reads the guests they captured; the event host reads their
-- event's guest list. auth.uid() is wrapped in (select auth.uid()) so Postgres runs it
-- once per query (initplan), the rls_init_plan advisor's recommended form. There is NO
-- insert/update/delete policy — the triple-write is a service-role path behind the
-- signed-token gate, so caller-role writes are denied.
drop policy if exists event_guests_select on public.event_guests;
create policy event_guests_select on public.event_guests for select using (
  inviter_profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
  or event_id in (
    select id from public.events
    where host_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
  )
);

-- ── network_contacts.source: add 'event' ──────────────────────────────────────
-- The inviter's personal-book leg lands here as source='event'. Extend the CHECK the
-- same drop-if-exists + recreate way the P1 migration added 'qr_scan' (idempotent,
-- re-runnable).
alter table public.network_contacts drop constraint if exists network_contacts_source_check;
alter table public.network_contacts
  add constraint network_contacts_source_check
  check (source in ('manual', 'card_scan', 'poster', 'import', 'qr_scan', 'event'));

-- ── Docs ─────────────────────────────────────────────────────────────────────
comment on table public.event_guests is
  'Invited-guest list behind a member''s attributed event QR (ADR-154). One captured person is triple-written (event_guests + the inviter''s network_contacts + a consent-unknown marketing contact) by lib/events/guests.ts. Fail-closed: service-role writes; inviter + event host may SELECT. See docs/NETWORK-CRM.md.';
comment on column public.event_guests.source is
  'How the guest was captured. Only ''event_qr'' today (the public RSVP capture form reached from an attributed /q/<slug>).';
comment on column public.event_guests.rsvp_status is
  'The guest''s stated intent at capture: going | maybe | declined (nullable when they leave it blank).';

-- ── Rollback (additive, clean) ────────────────────────────────────────────────
--   drop table if exists public.event_guests cascade;
--   alter table public.network_contacts drop constraint if exists network_contacts_source_check;
--   alter table public.network_contacts
--     add constraint network_contacts_source_check
--     check (source in ('manual', 'card_scan', 'poster', 'import', 'qr_scan'));
