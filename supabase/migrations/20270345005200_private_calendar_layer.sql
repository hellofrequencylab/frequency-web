-- SPACE CALENDAR ENTRIES: the private calendar layer of a Space (ADR-1385, docs/EVENTS-CALENDAR.md
-- "The private layer"). A Space's calendar is two layers. The PUBLIC layer is the events system and
-- stays exactly as it is. This table is the PRIVATE layer: classic calendar management a Space's
-- team runs for itself, private by default, and never an event.
--
-- WHAT A ROW IS. One entry on a Space's own calendar. Its `kind` says what it is, and the kinds are
-- declared ONCE in lib/calendar/registry.ts (the check constraint below mirrors that list):
--   unavailable  time the Space is not open. Blocks new bookings for the time it covers.
--   private      an in-house item (a staff meeting, maintenance, a private rental).
--   pencil       a date penciled in for a potential Production (ADR-1386): the first stage of
--                Pencil, Plan, Production. Tentative by default, never public.
-- A later kind (a task due date, a shift, a project milestone) is one row in the registry plus one
-- value added to the check, never a new table: `source_kind` + `source_id` let an entry point at
-- the record it came from, and `metadata` carries per-kind fields until one earns a column.
--
-- TIME. Stored the way events store time (lib/time/zone.ts): `starts_at` / `ends_at` hold the
-- Space's WALL CLOCK as UTC parts, read in `time_zone`. So the calendar grid's day key, the when-line
-- formatter, the repeat engine and the .ics writer all work on entries unchanged. An all-day entry
-- starts at 00:00 of its first day and ends at 00:00 of the day AFTER its last (exclusive end, as
-- RFC 5545 and Postgres ranges both do).
--
-- VISIBILITY. `team` (the default) is the Space's editors and above, nobody else. `public_unavailable`
-- lets the public Calendar tab show the time as "Unavailable", with no title, notes or location:
-- that projection is the ONLY public read, and it goes through public.space_public_unavailable()
-- below, which returns times and nothing else.
--
-- ACCESS. The ADR-923 operator quad on private.can_write_space_content(space_id): the owner and
-- active editors, moderators and admins of the Space, plus platform staff for read. Written as literal
-- statements so scripts/check-rls.mjs can see each one. The app reads and writes through the caller's
-- own session, never the admin client, so these policies are the lock.
--
-- House style: additive + idempotent (SAFE to re-run). Reached untyped until lib/database.types.ts
-- regenerates (ADR-246). Rollback: drop function public.space_public_unavailable(uuid, date, date);
-- drop table public.space_calendar_day_notes; drop table public.space_calendar_entries.

create table if not exists public.space_calendar_entries (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  kind         text not null check (kind in ('unavailable', 'private', 'pencil')),
  title        text not null check (char_length(title) between 1 and 200),
  notes        text check (notes is null or char_length(notes) <= 4000),
  location     text check (location is null or char_length(location) <= 300),
  all_day      boolean not null default false,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  time_zone    text not null default 'America/Los_Angeles',
  status       text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'cancelled')),
  blocks_time  boolean not null default false,
  visibility   text not null default 'team' check (visibility in ('team', 'public_unavailable')),
  -- RFC 5545 RRULE subset, the same dialect as events.recurrence_rule (lib/events/repeat-rule.ts).
  -- Stored now so repeating entries need no migration; nothing writes it yet.
  recurrence_rule text,
  -- PENCIL CANDIDATES (ADR-1386): the candidate dates of one pencil share this id. Picking a date
  -- keeps that row and removes its siblings. Null for a single date.
  option_group uuid,
  -- An optional date the pencil lapses by; the staff calendar flags it once it has passed.
  hold_expires_at timestamptz,
  source_kind  text,
  source_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint space_calendar_entries_ends_after_starts check (ends_at > starts_at),
  constraint space_calendar_entries_source_pair check ((source_kind is null) = (source_id is null))
);

comment on table public.space_calendar_entries is
  'The private calendar layer of a Space (ADR-1385): unavailable time and in-house entries. Never an event. Kinds are declared in lib/calendar/registry.ts.';
comment on column public.space_calendar_entries.starts_at is
  'Wall clock as UTC parts, read in time_zone (the events convention, lib/time/zone.ts).';
comment on column public.space_calendar_entries.ends_at is
  'Exclusive end. An all-day entry ends at 00:00 of the day after its last day.';
comment on column public.space_calendar_entries.blocks_time is
  'True when the entry makes the Space busy. Unavailable entries that block time remove booking slots (lib/spaces/booking.ts).';
comment on column public.space_calendar_entries.visibility is
  'team = Space editors and above only. public_unavailable = the public calendar shows the time as Unavailable with no details.';
comment on column public.space_calendar_entries.source_kind is
  'Optional link to the record this entry came from (a future task, shift or project). Paired with source_id.';

create index if not exists space_calendar_entries_space_starts_idx
  on public.space_calendar_entries (space_id, starts_at);
create index if not exists space_calendar_entries_option_group_idx
  on public.space_calendar_entries (option_group) where option_group is not null;

drop trigger if exists space_calendar_entries_set_updated_at on public.space_calendar_entries;
create trigger space_calendar_entries_set_updated_at
  before update on public.space_calendar_entries
  for each row execute function public.set_updated_at();

alter table public.space_calendar_entries enable row level security;

drop policy if exists space_calendar_entries_space_read on public.space_calendar_entries;
create policy space_calendar_entries_space_read on public.space_calendar_entries
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_calendar_entries_space_insert on public.space_calendar_entries;
create policy space_calendar_entries_space_insert on public.space_calendar_entries
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_calendar_entries_space_update on public.space_calendar_entries;
create policy space_calendar_entries_space_update on public.space_calendar_entries
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_calendar_entries_space_delete on public.space_calendar_entries;
create policy space_calendar_entries_space_delete on public.space_calendar_entries
  for delete using (private.can_write_space_content(space_id));

revoke all on table public.space_calendar_entries from anon;

-- ── The public projection ───────────────────────────────────────────────────────────────────────
-- The only thing a visitor may learn about the private layer: that a span of time is unavailable.
-- Times only (no title, notes, location, kind or id), confirmed or tentative entries the team chose to
-- show, overlapping [from_day, to_day). SECURITY DEFINER because the table's policies admit no visitor;
-- the column list IS the gate, so it must never grow a detail column.
create or replace function public.space_public_unavailable(p_space_id uuid, p_from_day date, p_to_day date)
returns table (starts_at timestamptz, ends_at timestamptz, all_day boolean, time_zone text)
language sql
stable
security definer
set search_path = public
as $$
  select e.starts_at, e.ends_at, e.all_day, e.time_zone
  from public.space_calendar_entries e
  where e.space_id = p_space_id
    and e.visibility = 'public_unavailable'
    and e.status <> 'cancelled'
    and e.starts_at < (p_to_day::timestamp at time zone 'UTC')
    and e.ends_at > (p_from_day::timestamp at time zone 'UTC')
    and p_to_day - p_from_day <= 400
  order by e.starts_at
  limit 500
$$;

comment on function public.space_public_unavailable(uuid, date, date) is
  'Public projection of the private calendar layer (ADR-1385): unavailable times only, never details.';

grant execute on function public.space_public_unavailable(uuid, date, date) to anon, authenticated;

-- ── Day notes (ADR-1386) ────────────────────────────────────────────────────────────────────────
-- A short, quiet label on a day's grid card: "Quiet hours" every Monday, "Flex day" on Thursdays,
-- "Retreat & rental" Friday and Saturday, or a note on one date range. Not an entry and never an
-- event: it describes the day, it does not occupy time. Managed as a small field on the Space's
-- Calendar settings page.
--   weekly  weekdays set (0 = Sunday .. 6 = Saturday); applies on those days within
--           [starts_on, ends_on], either bound open when null.
--   dated   weekdays null; applies every day from starts_on through ends_on (or starts_on alone).
-- A PUBLIC note is readable by anyone (it is shown on the public Calendar tab); a TEAM note only by the
-- Space's editors. Writes are the operator quad.

create table if not exists public.space_calendar_day_notes (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 40),
  weekdays    smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])),
  starts_on   date,
  ends_on     date,
  visibility  text not null default 'public' check (visibility in ('team', 'public')),
  sort        integer not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint space_calendar_day_notes_has_days check (weekdays is not null or starts_on is not null),
  constraint space_calendar_day_notes_range check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

comment on table public.space_calendar_day_notes is
  'Quiet per-day labels on a Space calendar (ADR-1386): weekly (weekdays) or dated (starts_on..ends_on). Rendered by lib/calendar/day-notes.ts.';

create index if not exists space_calendar_day_notes_space_idx
  on public.space_calendar_day_notes (space_id, sort);

drop trigger if exists space_calendar_day_notes_set_updated_at on public.space_calendar_day_notes;
create trigger space_calendar_day_notes_set_updated_at
  before update on public.space_calendar_day_notes
  for each row execute function public.set_updated_at();

alter table public.space_calendar_day_notes enable row level security;

drop policy if exists space_calendar_day_notes_read on public.space_calendar_day_notes;
create policy space_calendar_day_notes_read on public.space_calendar_day_notes
  for select using (
    visibility = 'public'
    or private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_calendar_day_notes_space_insert on public.space_calendar_day_notes;
create policy space_calendar_day_notes_space_insert on public.space_calendar_day_notes
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_calendar_day_notes_space_update on public.space_calendar_day_notes;
create policy space_calendar_day_notes_space_update on public.space_calendar_day_notes
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_calendar_day_notes_space_delete on public.space_calendar_day_notes;
create policy space_calendar_day_notes_space_delete on public.space_calendar_day_notes
  for delete using (private.can_write_space_content(space_id));
