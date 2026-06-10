-- =============================================================================
-- Events — host tooling (slice B-3, docs/EVENTS-SYSTEM.md §7)
--
-- Two additive pieces that give a host real reach + a guest a real opt-out:
--   • event_blasts        — a record of every broadcast a host/cohost sends to
--                           guests (in-app + push + email). One row per blast:
--                           who sent it, the body, which channels it went out on,
--                           and the kind. The actual fan-out runs through the
--                           consent-gated outbox (lib/comms/send-gate); this table
--                           is the durable log + the source for in-app delivery.
--   • event_rsvps.muted   — a guest can mute a single event. Honored by the blast
--                           fan-out (a muted guest gets no blast on any channel)
--                           ON TOP OF the normal notification preferences + send
--                           gate. A per-event lever, not an account-wide one.
--
-- RLS mirrors the established helper-function style — get_my_profile_id() /
-- is_my_event() / can_read_event() (NEVER raw auth.uid() in app-table policies,
-- see 20240101000001_rls_policies.sql and 20260613100000_event_posts_media_cohosts).
-- Reads ride on "can you see the parent event?"; writes are host/cohost-only and
-- go through the service role anyway (the dispatch action uses the admin client).
--
-- New tables/columns aren't in lib/database.types.ts yet, so readers/writers use
-- the `as unknown as SupabaseClient` cast convention (same as event_cohosts).
-- =============================================================================

-- ── event_rsvps.muted ─────────────────────────────────────────────────────────
-- A guest's per-event mute. Default false (everyone hears the host until they
-- opt out of THIS event). The blast fan-out skips muted guests; reminders/RSVP
-- confirmations are unaffected (those are the guest's own RSVP lifecycle, not a
-- host broadcast).
alter table public.event_rsvps
  add column if not exists muted boolean not null default false;

comment on column public.event_rsvps.muted is
  'Per-event mute set by the guest. When true, host blasts skip this guest on every channel (on top of notification preferences). Does not affect the guest''s own RSVP/reminder emails.';

-- ── Helper: can the caller SEND a blast for this event? ───────────────────────
-- The event host, a cohost, or platform staff (web_role admin/janitor). SECURITY
-- DEFINER so it reads events/event_cohosts/profiles without recursing into their
-- RLS; pinned search_path per the repo convention. The app re-checks the same
-- gate server-side (the dispatch action) — this backs the INSERT policy.
create or replace function public.can_blast_event(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.host_id = get_my_profile_id()
  )
  or is_event_cohost(p_event_id, get_my_profile_id())
  or get_my_web_role() in ('admin', 'janitor');  -- platform staff (ADR-208)
$$;

-- ── event_blasts ──────────────────────────────────────────────────────────────
create table if not exists public.event_blasts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  -- The host/cohost/staff who sent it. SET NULL so the log survives them deleting
  -- their account (the blast still happened).
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (length(trim(body)) > 0),
  -- The channels this blast was dispatched on, e.g. {inapp,push,email}. SMS is
  -- parked (out of scope this slice). At least one channel; only the known three.
  channels    text[] not null
    check (channels <@ array['inapp','push','email']::text[] and array_length(channels, 1) >= 1),
  -- A coarse type so the page can style/group blasts later (a plain update, a
  -- "running late" heads-up, a thank-you). Free 'update' default; not a hard enum
  -- so new kinds don't need a migration.
  kind        text not null default 'update',
  -- How many guests we attempted to deliver to (after mute + consent gating),
  -- stamped by the dispatch action for the host's own record.
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists event_blasts_event_idx
  on public.event_blasts (event_id, created_at desc);
create index if not exists event_blasts_author_idx
  on public.event_blasts (author_id);

alter table public.event_blasts enable row level security;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- SELECT: anyone who can read the parent event sees its blast history (a guest
--         can scroll back through what the host sent).
-- INSERT: host / cohost / staff only (can_blast_event), and the author row must be
--         the caller. Writes happen on the service role in practice, but the
--         policy keeps a direct client write honest.
-- No UPDATE/DELETE policy — a blast is an immutable record (service role can
-- prune if ever needed).
drop policy if exists "event_blasts: read if can see event" on public.event_blasts;
drop policy if exists "event_blasts: host insert"           on public.event_blasts;

create policy "event_blasts: read if can see event"
  on public.event_blasts for select
  using (can_read_event(event_id));

create policy "event_blasts: host insert"
  on public.event_blasts for insert
  with check (
    author_id = get_my_profile_id()
    and can_blast_event(event_id)
  );

comment on table public.event_blasts is
  'Durable log of host/cohost broadcasts to event guests (slice B-3). One row per blast: author, body, channels, kind, recipient_count. Fan-out is consent-gated (lib/comms/send-gate) and skips per-event-muted guests (event_rsvps.muted). Service-role write in practice; RLS still gates direct client writes to host/cohost/staff.';
