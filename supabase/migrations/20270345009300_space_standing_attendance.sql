-- space_standing gets its seventh count: people a host marked present (LIVE-456).
--
-- THE PROMISE THIS KEEPS. This table's own comment (20270345003100) said attendance was
-- deliberately absent because no independent record of it existed, and that the day one did it
-- would become a seventh signal with every Space re-scored at once. That day was 2026-09-14:
-- PROG-GD4 (ADR-1332) put `attended_at` on event_rsvps and on event_tickets, a mark the host makes
-- from the roster, independent of the check-in ledger and paying nobody (20270345004300). The
-- header of lib/spaces/standing.ts carried the same promise. This migration and the rollup change
-- beside it keep it.
--
-- THE COLUMN. `attendance`: how many seats a host marked present at this Space's gatherings HELD in
-- the same trailing window `gatherings_held` counts (published, not cancelled, already started).
-- Both seat tables count, because a ticket holder on a tickets-mode event has no RSVP row
-- (LIVE-317); a ticket counts only while it is succeeded and unrefunded, the same rule the roster
-- and lib/events/event-stats.ts apply. Counts only, a thing people DID and a host attested. No
-- plan, tier, entitlement or payment column joins this table here or ever.
--
-- THE ENGAGEMENT LEDGER IS NOT READ. The rollup (lib/spaces/standing-rollup.ts) reads the host mark
-- and nothing else, so no decision about the game can move this number, which is the property the
-- field-test instrument (scripts/maintenance/prove-it.mjs) already relies on for the same reading.
--
-- SCORING. The score is still computed in lib/spaces/standing.ts and written here by the rollup,
-- never recomputed in SQL: one definition of standing, two callers. Attendance joins the DOING
-- half with its own weight; the six existing weights did not move, because the halves renormalise
-- over the signals present. Before the first nightly pass after this applies, the column reads 0
-- for everyone, which is also what production measured on 2026-09-21 (0 marks platform-wide).
--
-- House style: additive + idempotent (add column if not exists); no em or en dashes; the app reads
-- the table untyped until lib/database.types.ts regenerates (ADR-246), and the hand edit beside
-- this file adds the column there so the typed shape does not lag. Apply to production ONLY AFTER
-- the PR carrying this file has merged (execute_sql plus the explicit ledger insert at this file's
-- version, docs/DATABASE.md), never before: an applied version the tree does not carry fails
-- check:migrations on every other open branch.

alter table public.space_standing
  add column if not exists attendance integer not null default 0;

comment on column public.space_standing.attendance is
  'People a host marked present (attended_at on event_rsvps and event_tickets, ADR-1332) at this Space''s gatherings held in the trailing window. Both seat tables; a ticket counts only while succeeded and unrefunded. The seventh standing signal (LIVE-456). Never read from the engagement ledger.';

comment on table public.space_standing is
  'Nightly per-Space standing rollup (LIVE-263): seven earned signals (gatherings held, attendance, upcoming, rooms, audience, commons, care) plus the resolved 0..1 standing score the Space directory orders by. Counts only. NO plan, tier, entitlement or payment column: exposure is earned, never sold. Attendance joined on 2026-09-28 (LIVE-456) once the host mark gave it an independent record (ADR-1332); it is never read from the engagement ledger. Rebuilt by app/api/cron/refresh-traits; scored by lib/spaces/standing.ts.';

-- Rollback: alter table public.space_standing drop column if exists attendance; and restore the
-- table comment of 20270345003100_space_standing.sql. The rollup must roll back in the same
-- deploy or its upsert fails with PGRST204 on the missing column.
