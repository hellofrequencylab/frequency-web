-- =============================================================================
-- Events — cohost invite/accept lifecycle (docs/EVENTS-SYSTEM.md §2.5)
--
-- Turns cohosting from a silent DIRECT-ADD into a consented INVITE flow. A host
-- INVITES a member to cohost; the invitee sees a pending invite and ACCEPTS or
-- DECLINES. Only ACCEPTED cohosts are displayed publicly and count for the
-- host-capability checks (posting an Event Dispatch, approving RSVPs, etc.).
--
-- Back-compat is carried by the DEFAULT: `status` defaults to 'accepted'. Every
-- EXISTING event_cohosts row was a real, already-added cohost, so the default
-- leaves them accepted and visible with ZERO backfill — and any legacy code path
-- that still inserts a row without a status also lands as a live cohost (no
-- regression). New invites are inserted explicitly with status='invited'.
--
-- Lifecycle:
--   invited  --accept-->  accepted   (now a real cohost, displayed)
--   invited  --decline->  declined   (kept out of every list)
-- A host cancelling a pending invite, or removing an accepted cohost, is a hard
-- DELETE of the row (works for either state) — so removeCohost is unchanged.
-- =============================================================================

alter table public.event_cohosts
  add column if not exists status       text not null default 'accepted',
  add column if not exists invited_at   timestamptz,
  add column if not exists responded_at timestamptz;

-- Constrain status to the three lifecycle states.
alter table public.event_cohosts
  drop constraint if exists event_cohosts_status_check;
alter table public.event_cohosts
  add constraint event_cohosts_status_check
    check (status in ('invited', 'accepted', 'declined'));

-- Pending-invite lookups filter by (event_id, status) for the host's manager and
-- (profile_id, status) for the invitee's own banner — index the common shapes.
create index if not exists event_cohosts_event_status_idx
  on public.event_cohosts (event_id, status);
create index if not exists event_cohosts_profile_status_idx
  on public.event_cohosts (profile_id, status);

-- ── Invitee response (RLS) ────────────────────────────────────────────────────
-- event_cohosts uses RLS (enabled in 20260613100000). The existing policies are:
-- read-if-can-see-event (SELECT), host-only INSERT, host-only DELETE — there was
-- no UPDATE policy, so an invitee could never flip their own row through a normal
-- authenticated client. The app performs accept/decline through the service-role
-- admin client (which re-checks the caller owns the row), so this is not strictly
-- required today, but add it for correctness and future direct-client use: the
-- invitee may UPDATE only THEIR OWN row, and only to a terminal response
-- (accepted/declined). Host insert/delete/read policies are left untouched, so a
-- guest can never create or re-target an invite — they can only answer one.
drop policy if exists "event_cohosts: invitee responds to own invite" on public.event_cohosts;
create policy "event_cohosts: invitee responds to own invite"
  on public.event_cohosts for update
  using (profile_id = get_my_profile_id())
  with check (
    profile_id = get_my_profile_id()
    and status in ('accepted', 'declined')
  );
