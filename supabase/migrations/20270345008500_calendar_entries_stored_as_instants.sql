-- TWENTY-FIVE ROYAL TEMPLE DATES DREW AT 1:30 AM. THE WALL CLOCK / INSTANT CONFUSION, REPAIRED
-- (LIVE-512, ADR-1385, docs/EVENTS-CALENDAR.md "The private layer").
--
-- WHY. `public.space_calendar_entries.starts_at` / `ends_at` hold the Space's WALL CLOCK as UTC
-- PARTS, read in the row's own `time_zone` (20270345005200_private_calendar_layer.sql,
-- lib/calendar/entries.ts, lib/time/zone.ts). '2026-10-23T18:30:00Z' with `America/Los_Angeles` IS
-- 6:30 PM in Vista, and nothing converts it. On 2026-09-25, at 01:34:55 and 01:35:13 UTC, twenty-five
-- Royal Temple pencils went in as TRUE INSTANTS instead — the value you get from
-- `'2026-10-23 18:30 America/Los_Angeles'::timestamptz` rather than from the literal
-- '2026-10-23T18:30:00Z'. Read back as the wall clock the column promises, every one of them is
-- 01:30–02:30 AM on the day AFTER the evening it meant, and that is where the calendar drew them.
--
-- NOT AN APP BUG. Every insert the app can make goes through `parseEntryInput`
-- (lib/calendar/entries.ts), which composes UTC parts from a YYYY-MM-DD and an HH:MM and never
-- touches the timezone lib — the Vera pencil path, `create_penciled_plan`, `shiftedWrite` and the
-- repeating-series generator all included. The rows also carry metadata keys (`circle`, `circle_id`,
-- `member_cents`, `drop_in_cents`, `member_discount`, `feast_order`) that appear NOWHERE in this
-- repo's history: `git log --all -S member_cents` is empty. They were written by hand-run SQL. The
-- guard against the repo growing its own version of this mistake is `lib/calendar/wall-clock.test.ts`,
-- which pins the stored STRING (a wall clock and its instant are both valid Dates of the same type,
-- so comparing Dates cannot tell them apart) and refuses a migration that inserts a calendar time
-- spelled any way but UTC parts.
--
-- WHAT IS HERE. One UPDATE. Each column is shifted independently, `at time zone time_zone` then back
-- `at time zone 'UTC'`, which re-reads the stored instant as the local wall clock it meant and stores
-- those parts. All twenty-five land on 18:30–21:30 local, which is the schedule the owner wrote down.
-- `lib/calendar/wall-clock.ts` `instantShapedSpan` is this predicate and this shift in TypeScript, and
-- `wall-clock.test.ts` pins the before and after of all twenty-five rows so the two cannot drift.
--
-- SCOPED TO ROWS THAT ARE PROVABLY INSTANT-SHAPED, NOT TO A SPACE. Five conditions, all required:
--   1. timed, not all-day (an all-day span is 00:00 to 00:00 and carries no time to get wrong);
--   2. read as the wall clock it claims to be, the start lands in the dead of night (00:00–05:59) —
--      where an instant-shaped write of a US evening always lands, and where programming never is;
--   3. read as a true instant in the row's OWN zone instead, it lands at 16:00 or later on an exact
--      quarter hour: an intended start time, not a coincidence;
--   4. that reading keeps the end after the start;
--   5. the row was written before the bug was diagnosed (2026-09-27). This is the one bound that is
--      about a moment rather than a shape, and it is here on purpose: conditions 1–4 CANNOT separate
--      an instant-shaped 6:30 PM from a Space that genuinely holds an all-night sit at 1:30 AM — they
--      are the same bytes. What made this set certain is the series tell: thirteen monthly Temple Moon
--      rows stored 01:30 under PDT and 02:30 under PST, and a wall-clock series holds ONE time-of-day
--      for ever. That evidence exists for the 2026-09-25 rows and for nothing written since, so a
--      legitimate late-night date entered tomorrow is not silently moved by a fresh replay of this
--      file.
-- Matched exactly 25 rows across the whole table when written (checked 2026-09-27, read-only): all in
-- Space `royaltemple`, all from the two 2026-09-25 statements. NO OTHER SPACE HAS ONE. Every other
-- entry in the table is wall-clock-correct, including the two by the same author that were typed as
-- literals ("Witches & Wizards Halloween Party 🎃" 17:00, "Goddess Day : Clothing Swap" 11:00) and the
-- repeating Craft Night master (18:00), so this is one write, not a drawer.
--
-- IDEMPOTENT (SAFE to re-run). The predicate is not satisfied by its own output: a repaired row stores
-- 18:30, which fails condition 2. A second run matches nothing and raises a notice saying so. On a
-- local or preview database with none of these rows, it is a no-op. `wall-clock.test.ts` pins that
-- fixed point for all twenty-five.
--
-- NOT TOUCHED, ON PURPOSE. `public.events` carries one row with the same shape — "Heart on Fire,
-- Week 1: Hearing the Heart" (Space `frequency`, published and public, stored 2027-01-08 02:00–05:00,
-- meaning Thu 2027-01-07 6:00–9:00 PM). It is a DIFFERENT table with a published, guest-visible page,
-- subscribed .ics feeds and reminders already sent against it, so moving it is an owner's call and not
-- a side effect of this file. LIVE-513 carries it.
--
-- ROLLBACK (puts the same rows back where they were; the predicate no longer selects them, so the
-- shift is named explicitly):
--   update public.space_calendar_entries
--      set starts_at = ((starts_at at time zone 'UTC') at time zone time_zone),
--          ends_at   = ((ends_at   at time zone 'UTC') at time zone time_zone)
--    where space_id = (select id from public.spaces where slug = 'royaltemple')
--      and metadata ?| array['circle_id']
--      and created_at < timestamptz '2026-09-27 00:00:00+00'
--      and not all_day;

do $$
declare
  v_fixed integer;
begin
  with repaired as (
    update public.space_calendar_entries e
       set starts_at = ((e.starts_at at time zone e.time_zone) at time zone 'UTC'),
           ends_at   = ((e.ends_at   at time zone e.time_zone) at time zone 'UTC')
     where not e.all_day
       and e.time_zone is not null
       and e.created_at < timestamptz '2026-09-27 00:00:00+00'
       -- The stored value, read as the wall clock the column promises: the dead of night.
       and ((e.starts_at at time zone 'UTC')::time) >= time '00:00'
       and ((e.starts_at at time zone 'UTC')::time) <  time '06:00'
       -- The same value, read as a true instant in the row's own zone: an evening, on the quarter.
       and ((e.starts_at at time zone e.time_zone)::time) >= time '16:00'
       and extract(minute from (e.starts_at at time zone e.time_zone))::int % 15 = 0
       and (e.ends_at at time zone e.time_zone) > (e.starts_at at time zone e.time_zone)
    returning 1
  )
  select count(*) into v_fixed from repaired;

  if v_fixed = 0 then
    raise notice 'calendar entries stored as instants: nothing matched, already repaired or not this database';
  else
    raise notice 'calendar entries stored as instants: % row(s) moved back to their own wall clock', v_fixed;
  end if;
end $$;
