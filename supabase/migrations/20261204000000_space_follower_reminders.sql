-- ============================================================================
-- SPACE-FOLLOWER EVENT REMINDERS (opt-in outbound email).
--
-- A member who FOLLOWS a Space (space_follows) may opt in to a gentle reminder
-- about that Space's upcoming PUBLIC events they have NOT RSVP'd to. This reuses
-- the existing event-reminder cadence (7d / 24h / 2h) but is a SEPARATE, strictly
-- OPT-IN channel: it is OFF for everyone until the member turns it on.
--
-- SAFETY, by construction:
--   • Default OFF: the new preference column defaults to FALSE, so no member ever
--     receives one of these emails until they explicitly opt in.
--   • Idempotent: a dedicated sent-ledger with a UNIQUE (event_id, profile_id, lead)
--     key means the same (member, event, window) is recorded once. A cron re-run
--     that re-selects the same recipient is a no-op (the insert conflicts).
--   • Public-only + never-double-send: enforced in the cron (lib/events/follower-
--     reminders.ts) — public/published/non-cancelled events only, RSVP'd members
--     excluded (they get the RSVP reminder path), suppressions honored.
--
-- House style: additive + idempotent, SAFE to re-run. lib/database.types.ts is
-- regenerated separately; the app reaches the new column + table through untyped
-- admin-client casts until then (ADR-246). No em or en dashes in copy.
-- ============================================================================

-- ── 1. The opt-in preference (default OFF) ─────────────────────────────────────
-- A single boolean on the existing per-member preference row. Email-only (this is
-- one engagement email channel, not a channel x category grid), and it defaults to
-- FALSE so every existing row and the lazy-create default path start OPTED OUT. A
-- member turns it on from /settings/notifications.
alter table public.notification_preferences
  add column if not exists space_event_reminders boolean not null default false;

comment on column public.notification_preferences.space_event_reminders is
  'Opt-IN (default FALSE): remind me about upcoming public events from Spaces I follow that I have not RSVP''d to. Reuses the event-reminder cadence but is a separate, strictly opt-in channel (lib/events/follower-reminders.ts). Read via wantsSpaceEventReminders(); fail-closed to false.';

-- ── 2. The idempotency ledger ──────────────────────────────────────────────────
-- One row per (event, follower, lead) that has been reminded. The UNIQUE key is the
-- never-double-send guarantee: the cron inserts a row before/at send time and a
-- re-run's duplicate insert conflicts (recorded once, emailed once). Distinct from
-- event_rsvps.reminder_*_sent_at (the RSVP'd path) because a follower reminder goes
-- precisely to members who have NO RSVP row for the event.
create table if not exists public.space_follower_event_reminders_sent (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  lead        text not null check (lead in ('7d', '24h', '2h')),
  created_at  timestamptz not null default now(),
  unique (event_id, profile_id, lead)
);

comment on table public.space_follower_event_reminders_sent is
  'Idempotency ledger for opt-in space-follower event reminders. One row per (event_id, profile_id, lead): a member who follows the event''s Space was reminded of this event for this window. The UNIQUE key guarantees the same (member, event, window) is never emailed twice, even across cron re-runs. Service-role only (RLS deny-all).';

-- The leading-column lookups the cron performs: "was THIS (event, profile) reminded?"
create index if not exists sfer_sent_event_profile_idx
  on public.space_follower_event_reminders_sent (event_id, profile_id);

-- ── RLS: service-role only (no client policy, fail-closed) ─────────────────────
-- Every read + write goes through the service-role admin client in the cron behind
-- CRON_SECRET auth (lib/events/follower-reminders.ts), exactly like space_follows
-- and the event-reminder path. RLS is ENABLED with NO policy so any direct anon /
-- authenticated access is denied by default. Registered in scripts/rls-deny-all.txt.
alter table public.space_follower_event_reminders_sent enable row level security;
