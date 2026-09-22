-- REPEATING PENCILS WITH EXPLICIT EXCEPTIONS (PROG-CAL5, ADR-1386 phase 5).
--
-- ── WHAT WAS ACTUALLY MISSING ───────────────────────────────────────────────────────────────────
-- `space_calendar_entries.recurrence_rule` has existed since the private layer landed (ADR-1385 §4)
-- in the same bounded RFC 5545 dialect as `events.recurrence_rule` (ADR-1299), and its own comment
-- said "nothing writes it yet". It stayed that way: 0 of 129 production rows carried a rule on
-- 2026-09-21. The staff drawer now writes it, and lib/calendar/pencil-series.ts expands it.
--
-- A rule alone is not the promise the phase makes. The promise is that a biweekly series with an
-- INTENTIONALLY skipped date keeps that skip: a generator that re-derives the series from the rule
-- every time it runs will put the skipped date straight back unless the skip is STORED. This column
-- is where it is stored. Exceptions are explicit, never inferred: no code path looks at a gap in the
-- calendar and decides it must have been a skip, and nothing removes a date from this list except a
-- person taking it out in the drawer.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────────────────────────────
-- `date[]`, not timestamptz[]: a skip is a calendar DAY in the entry's own `time_zone` (the day key
-- the grid draws the occurrence on), which is exactly what RFC 5545 EXDATE carries for a DATE-valued
-- DTSTART. The generator compares occurrence day keys against this list as YYYY-MM-DD strings, so
-- no instant arithmetic is involved and a DST boundary cannot move a skip. NOT NULL with an empty
-- default so every reader can `.includes()` without a null branch.
--
-- No RLS change: the operator quad on the table governs the row, and this column adds no read path.
-- No index: the column is read with its row, never searched.
--
-- House style: additive + idempotent (SAFE to re-run). Rollback:
--   alter table public.space_calendar_entries drop column exception_dates;

alter table public.space_calendar_entries
  add column if not exists exception_dates date[] not null default '{}';

comment on column public.space_calendar_entries.exception_dates is
  'Calendar days (in time_zone) a repeating entry deliberately skips (PROG-CAL5, ADR-1386). Stored, never inferred: the series generator (lib/calendar/pencil-series.ts) drops these occurrences and nothing puts one back except a person removing it here. Empty for a one-off entry.';

comment on column public.space_calendar_entries.recurrence_rule is
  'RFC 5545 RRULE subset, the same dialect and parser as events.recurrence_rule (ADR-1299, lib/events/repeat-rule.ts). Written by the staff calendar drawer for a Pencil; expanded by lib/calendar/pencil-series.ts. NULL means the entry does not repeat.';
