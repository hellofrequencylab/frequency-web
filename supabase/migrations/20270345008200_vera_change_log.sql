-- THE VERA CHANGE LOG (ADR-1386, PROG-CAL11 slice 3; owner ask 2026-09-22: "I want to be sure
-- there are appropriate confirmation gates for Vera, as well as versioning").
--
-- The confirmation gate shipped first (LIVE-473): a destructive change is refused unless its own
-- confirmation came back with it. This is the other half. Every proposal a team accepts writes ONE
-- row here: the changes that landed, the sentence each one reported, and the change that would put
-- it back, built from the values the actions read BEFORE they wrote. That record is the answer to
-- "what did Vera do to my calendar last Tuesday", and it is what a single Undo reverses through.
--
-- NOTHING IS DELETED FROM THE RECORD, and that is a rule the database keeps rather than a habit the
-- code has: there is a select policy and an insert policy and no update or delete policy at all, so
-- Postgres refuses both to every caller that is not service-role. An Undo is a NEW row pointing at
-- the one it reversed (`undo_of`), so the log reads forwards, both halves visible.
--
-- House style: additive + idempotent. Rollback: drop the table.

create table if not exists public.space_vera_changes (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  -- Who pressed Accept. Kept as set null so a departed teammate does not take the record with them.
  applied_by    uuid references public.profiles(id) on delete set null,
  -- The applied steps, in the order they ran: [{ change, message, reverse, reason }].
  -- Shape-checked on the way out by lib/calendar/vera-command.ts, never trusted because it is ours.
  steps         jsonb not null default '[]'::jsonb,
  -- Set when this row is the application of an Undo of an earlier row.
  undo_of       uuid references public.space_vera_changes(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.space_vera_changes is
  'One row per accepted Vera proposal (PROG-CAL11 slice 3): what was applied, and what puts it back. Append only: no update or delete policy exists.';
comment on column public.space_vera_changes.steps is
  'JSON array of {change, message, reverse, reason}. reverse is the change that undoes this one, or null with a reason. Parsed by lib/calendar/vera-command.ts.';
comment on column public.space_vera_changes.undo_of is
  'The record this one reversed. An Undo is a proposal the team accepts, so it is recorded like any other.';

create index if not exists space_vera_changes_space_idx
  on public.space_vera_changes (space_id, created_at desc);

create index if not exists space_vera_changes_undo_of_idx
  on public.space_vera_changes (undo_of) where undo_of is not null;

create index if not exists space_vera_changes_applied_by_idx
  on public.space_vera_changes (applied_by) where applied_by is not null;

alter table public.space_vera_changes enable row level security;

-- The team that can write the Space's content reads its own log; admins and janitors read it too,
-- the same quad every other Plan-side table uses (ADR-923 private.can_write_space_content).
drop policy if exists space_vera_changes_read on public.space_vera_changes;
create policy space_vera_changes_read on public.space_vera_changes
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_vera_changes_insert on public.space_vera_changes;
create policy space_vera_changes_insert on public.space_vera_changes
  for insert with check (private.can_write_space_content(space_id));

-- On purpose: no update policy and no delete policy. A record of what was applied that can be
-- edited afterwards is not a record. Undo adds a row, it never rewrites one.

revoke all on table public.space_vera_changes from anon;
