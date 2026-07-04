-- =============================================================================
-- Practice timer sessions — the server-authoritative ACTIVE timer row (ADR-521).
--
-- Until now a running Mindless sit / Get Moving walk lived only in React memory
-- plus a localStorage crash-recovery record (lib/on-air/live-session.ts). That
-- recovers a dropped tab on the SAME browser, but a reload / navigation / second
-- device showed a "Resume" prompt or a fresh setup, not the timer simply carrying
-- on. This table is the ONE source of truth for "this member has a timer running
-- right now": while a row exists the timer persists and keeps running (the clock is
-- wall-clock from started_at, so no time is lost), until the member LOGS (completes)
-- or CANCELS the session, cross-device.
--
-- One active session per member: the UNIQUE profile_id makes start an upsert (a new
-- start replaces any stale row). started_at is the wall-clock epoch the run began,
-- pause-adjusted on resume (mirrors the localStorage record) so elapsed = now -
-- started_at. `setup` jsonb is the opaque per-engine payload (the sit's mode + cue
-- settings, or the movement config) plus resume_from_sec, so a load can rebuild the
-- exact run. `mode` is the engine kind ('mindless' | 'movement').
--
-- Written ONLY by the service role through owner-gated server actions
-- (app/(main)/on-air/timer-session-actions.ts: start/pause/resume/cancel, and the
-- clear inside completeSession). No client write policy — RLS grants the member a
-- read of their OWN row only (the reader powers the global resume). Additive; no
-- existing behavior changes. No em or en dashes.
-- =============================================================================

create table if not exists public.practice_timer_sessions (
  id uuid primary key default gen_random_uuid(),
  -- The member the running timer belongs to. One active session per member, so a
  -- new start upserts on this. CASCADE: the ephemeral run has no meaning once the
  -- member is gone.
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  -- The practice this run logs against, or null for an open / not-yet-bound run.
  practice_id uuid references public.practices(id) on delete set null,
  -- The engine kind: 'mindless' (the sit) or 'movement' (Get Moving).
  mode text not null,
  -- The opaque per-engine payload to rebuild the run (sit setup / movement config)
  -- plus resume_from_sec for a partial top-up. Owned by the client engines.
  setup jsonb not null default '{}'::jsonb,
  -- Wall-clock start (pause-adjusted). elapsed = now - started_at while running.
  started_at timestamptz not null,
  -- The moment the member paused, or null while running.
  paused_at timestamptz,
  -- The run's full target length in seconds, or null for an open-ended run.
  seconds_target integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practice_timer_sessions enable row level security;

-- A member may READ their own active session (the global-resume reader). All writes
-- go through the service role in owner-gated actions, so there is no client
-- insert/update/delete policy (mirrors the tips / supporter_contributions posture).
drop policy if exists "read own active timer session" on public.practice_timer_sessions;
create policy "read own active timer session" on public.practice_timer_sessions
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.practice_timer_sessions is
  'Server-authoritative ACTIVE timer session, one row per member (ADR-521). A running Mindless sit / Get Moving run persists and keeps running cross-device until the member logs (completeSession clears it) or cancels. Service-role write only; members read their own row for the global resume.';
