-- Persist the Mindless session note (the Journal / Just Log free-text reflection).
--
-- Bug (dead wiring): the On Air sit surfaces an optional free-text note in two places
-- (components/on-air/session.tsx) — Journal shows it on the live screen (write while you
-- sit), Just Log shows it on the setup screen (capture the moment before logging). The
-- member types a reflection, but completeSession never received a `note` field and there
-- was no column to store it, so every note was silently discarded on Finish.
--
-- This adds a nullable free-text column on the SESSION history row (not the economy log:
-- one Zap per session, unchanged). completeSession now trims + caps the note and writes it
-- here. It is stored, not yet surfaced in a member-facing history view; that is a separate
-- change. Best-effort insert as before (a note write must never block the log).

alter table public.practice_sessions
  add column if not exists note text;

comment on column public.practice_sessions.note is
  'Optional member-written reflection captured in a Mindless Journal / Just Log session (nullable, trimmed + capped in app/(main)/on-air/actions.ts). Stored for history; not the economy log.';
