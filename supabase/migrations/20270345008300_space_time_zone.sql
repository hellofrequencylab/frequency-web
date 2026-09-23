-- THE SPACE'S OWN TIME ZONE (LIVE-471, owner ruling 2026-09-22).
--
-- ── WHAT WAS MISSING ────────────────────────────────────────────────────────────────────────────
-- A Space carried no zone. Published events each carry their own `events.time_zone`, and the private
-- calendar layer carries `space_calendar_entries.time_zone` per entry, but nothing said what zone the
-- SPACE keeps its schedule in. So the two surfaces that create a date, the staff calendar drawer and
-- the Ask Vera box, defaulted to whatever `Intl.DateTimeFormat().resolvedOptions().timeZone` said the
-- BROWSER was in. An operator penciling Saturday from an airport in Lisbon wrote Lisbon wall-clock
-- into a calendar everyone else reads as Los Angeles, and the console header agreed with the airport.
--
-- ── WHY A STORED COLUMN, NOT A DERIVED ONE ──────────────────────────────────────────────────────
-- Deriving the zone on every read was considered and REJECTED in the same ruling. A Space with two
-- venues in different zones has no answer that way, and a co-host in another country would change
-- the Space's zone by existing. The Space is the thing that has a schedule, so the zone is a fact
-- stored ON the Space and edited by its team, exactly like its name or its address.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────────────────────────────
-- `text`, NULLABLE, no column default. Null is meaningful and is not the same as a value: it means
-- this Space has never said, and the calendar then falls back to the viewer's browser zone, which is
-- the behaviour every Space had before this migration. A column default would instead hand every new
-- Space America/Los_Angeles whether or not that is true of it, which is a wrong answer wearing the
-- costume of a right one. The CHECK holds the SHAPE of an IANA name only (it mirrors IANA_TZ_RE in
-- lib/time/zone.ts); the database has no tz table to validate a name against, so the app validates
-- with `isValidTimeZone` before it writes and this constraint stops the obvious junk.
--
-- ── THE BACKFILL, AND ITS ORDER ─────────────────────────────────────────────────────────────────
-- Every existing Space is given an answer now, so no operator has to go and find this setting before
-- their calendar stops guessing. Three steps, most specific first:
--
--   1. THE VENUE. The zone this Space's own events are actually held in: the most common
--      `events.time_zone` across the events it hosts (its own and the ones it hosts for others),
--      ties broken by the most recent. Events are where a Space's venue is recorded, so this is the
--      venue's zone as the Space itself has already stated it, event by event.
--      Known imprecision, stated rather than hidden: `events.time_zone` is NOT NULL and defaults to
--      the house zone, so a Space whose team never touched the zone control on any event looks like
--      America/Los_Angeles here. That is the same answer step 3 would give it, and the operator can
--      change it in one control in Space settings, so the cost of the imprecision is bounded.
--      `space_availability_schedules.timezone` is deliberately NOT used: its own column default is
--      'UTC', so a stored 'UTC' cannot be told apart from a schedule row nobody ever configured.
--   2. THE OWNER. `profiles.home_timezone` for the Space's owner, when they have set one. A Space
--      with no events yet is usually run from where its owner is.
--   3. THE HOUSE. 'America/Los_Angeles' (HOME_TZ, lib/time/zone.ts). The same last resort every
--      other zone path in this repo already falls back to.
--
-- No RLS change: the existing `spaces` policies govern the row, and this column adds no read path.
-- No index: the column is read with its row and never searched.
--
-- House style: additive + idempotent (SAFE to re-run; the backfill only touches rows still NULL).
-- Rollback:
--   alter table public.spaces drop constraint if exists spaces_time_zone_shape;
--   alter table public.spaces drop column if exists time_zone;

alter table public.spaces
  add column if not exists time_zone text;

-- Guarded rather than `add constraint if not exists` (Postgres has no such syntax), and safe on
-- re-run. Shape only: 1 to 3 path segments of IANA-legal characters, which is what lib/time/zone.ts
-- accepts before it hands a name to Intl.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'spaces_time_zone_shape'
       and conrelid = 'public.spaces'::regclass
  ) then
    alter table public.spaces
      add constraint spaces_time_zone_shape
      check (
        time_zone is null
        or time_zone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$'
      );
  end if;
end $$;

comment on column public.spaces.time_zone is
  'The IANA zone this Space keeps its schedule in (LIVE-471). New Pencils and Vera proposals are written in it and the calendar console names it in plain words beside the month (lib/time/zone-words.ts). Stored, never derived: a Space with two venues in different zones has no derived answer and a co-host must not change it by existing. NULL means the Space has never said, and the calendar falls back to the viewer browser zone.';

-- THE BACKFILL. Only rows that have not been given a zone, so a re-run cannot overwrite an operator's
-- own answer.
update public.spaces s
   set time_zone = coalesce(
     -- 1. the venue: the zone this Space's own events are held in.
     (
       select e.time_zone
         from public.events e
        where (e.space_id = s.id or e.host_space_id = s.id)
          and coalesce(btrim(e.time_zone), '') <> ''
        group by e.time_zone
        order by count(*) desc, max(e.starts_at) desc nulls last
        limit 1
     ),
     -- 2. the owner's own zone.
     (
       select nullif(btrim(p.home_timezone), '')
         from public.profiles p
        where p.id = s.owner_profile_id
     ),
     -- 3. the house zone.
     'America/Los_Angeles'
   )
 where s.time_zone is null;
