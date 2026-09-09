-- SPACE STANDING (LIVE-263 - docs/CORE-MODEL.md Phase 10, "Placement is earned"). The nightly
-- rollup table behind the Space directory's default order and the operator receipt page.
--
-- The read model, copied in shape from `resonance_density_cells` (ADR-416): one small row per
-- Space, rebuilt by the nightly cron (app/api/cron/refresh-traits), so the directory reads ONE
-- indexed row per Space instead of counting a Space's whole history per request.
--
-- 🔴 THE INVARIANT THIS TABLE MUST NEVER BREAK: exposure is earned, never sold. Every column below
-- is a count of something a Space DID. There is no plan, tier, entitlement, seat, price or Stripe
-- column here, and adding one would end the property that makes this platform's ranking worth
-- trusting. The score itself is computed in lib/spaces/standing.ts (PURE, unit-tested, guarded by a
-- source-shape test that fails on any commercial token) and written here by the rollup, rather than
-- being recomputed in SQL: ONE definition of standing, two callers, no drift.
--
-- 🔴 WHAT IS DELIBERATELY ABSENT: event ATTENDANCE. There is no independent record of whether
-- anyone turned up to a gathering on this platform. There is no `checked_in` column, and the only
-- trace is an engagement-ledger row written by the path that pays Zaps, which makes "attended" and
-- "was paid for attending" the same fact and unreadable for any Space that does not run Zaps. So
-- attendance is not a column here and not a weight in the score. `gatherings_held` counts
-- gatherings that HAPPENED, which is a claim the data can stand behind. The day an independent
-- attendance record exists, it becomes a seventh signal and every Space is re-scored at once; the
-- score renormalises over the signals present, so no existing weight has to change.
--
-- House style: additive + idempotent (create-if-not-exists, guarded policies); no em or en dashes;
-- reached untyped until lib/database.types.ts regenerates (ADR-246). Nothing existing is altered:
-- a database without this table simply falls back to the live-count subset of the score.

create table if not exists public.space_standing (
  space_id            uuid primary key references public.spaces(id) on delete cascade,

  -- ── The six signals. Counts only, each one a thing the Space did. ───────────────────────────
  -- Gatherings that actually HAPPENED in the trailing window (published, not cancelled, already
  -- started). Occurrences, not series: a weekly circle that met nine times gathered nine times.
  gatherings_held     integer not null default 0,
  -- Published, non-cancelled gatherings still ahead, folded so a recurring series counts ONCE
  -- (the same fold the directory card and the calendar use, LIVE-198).
  upcoming_gatherings integer not null default 0,
  -- Listed, joinable Circles this Space keeps open.
  rooms               integer not null default 0,
  -- Members who chose to follow this Space (space_follows).
  audience            integer not null default 0,
  -- Active members of this Space (space_members, status active).
  commons             integer not null default 0,
  -- How much of the public page the operator has filled in, as a fraction in [0, 1]. The one
  -- signal an operator can move today without anyone else's participation.
  care                double precision not null default 0,

  -- The resolved standing in [0, 1] (lib/spaces/standing.ts). Stored so the directory and the
  -- receipt page read one number rather than re-deriving it, and so a bad rollup is visible in
  -- the data rather than only in a render.
  standing_score      double precision not null default 0,
  computed_at         timestamptz not null default now(),

  constraint space_standing_care_range check (care >= 0 and care <= 1),
  constraint space_standing_score_range check (standing_score >= 0 and standing_score <= 1)
);

-- The directory's own read: the best-standing Spaces, and a Space by id.
create index if not exists space_standing_score_idx
  on public.space_standing (standing_score desc);

comment on table public.space_standing is
  'Nightly per-Space standing rollup (LIVE-263): six earned signals (gatherings held, upcoming, rooms, audience, commons, care) plus the resolved 0..1 standing score the Space directory orders by. Counts only. NO plan, tier, entitlement or payment column: exposure is earned, never sold. Attendance is deliberately absent (no independent record exists). Rebuilt by app/api/cron/refresh-traits; scored by lib/spaces/standing.ts.';

comment on column public.space_standing.gatherings_held is
  'Gatherings that actually happened in the trailing window (published, not cancelled, already started). Occurrences, not series.';
comment on column public.space_standing.upcoming_gatherings is
  'Published, non-cancelled gatherings still ahead, with a recurring series folded to one (LIVE-198).';
comment on column public.space_standing.rooms is
  'Listed, joinable Circles this Space keeps open.';
comment on column public.space_standing.audience is
  'Members who chose to follow this Space (space_follows).';
comment on column public.space_standing.commons is
  'Active members of this Space (space_members, status active).';
comment on column public.space_standing.care is
  'Public-page completeness as a fraction in [0, 1]: the share of the fields the rollup looked at that the operator has filled in.';
comment on column public.space_standing.standing_score is
  'The resolved standing in [0, 1] from lib/spaces/standing.ts. Saturated signals, weights renormalised over the signals present, the doing half and the belonging half joined by a harmonic mean so a one-sided Space cannot top the directory.';

alter table public.space_standing enable row level security;

-- Service-role only. The rollup writes it through the admin client and every read that reaches a
-- member goes through a server reader (the directory, the operator receipt), so there is no client
-- policy at all: enabling RLS with no policy fail-closes every direct client read, which is the
-- established pattern for a rollup table here (resonance_density_cells).
revoke all on table public.space_standing from anon, authenticated;

-- Rollback: drop table public.space_standing;
