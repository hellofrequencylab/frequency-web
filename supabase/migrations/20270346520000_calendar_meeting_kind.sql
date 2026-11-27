-- A MEETING ON THE CALENDAR (LIVE-2533, hub plan 2026-11-24). The private calendar layer had events
-- on their way, private entries and unavailable time, but no meeting: a team call had nowhere for an
-- agenda, notes or follow-ups. Per the layer's own rule (20270345005200: "a later kind is one row in
-- the registry plus one value added to the check, never a new table") this adds ONE value to the
-- `kind` check and nothing else. lib/calendar/registry.ts declares the kind; a meeting keeps its
-- agenda in `description` and its notes in `notes`, columns every entry already has, and Vera turns
-- those notes into proposed to-dos a person ticks before anything is written
-- (lib/calendar/meeting-notes.ts).
--
-- A meeting is never a Pencil, so the stage pairing (space_calendar_entries_stage_kind: kind is
-- pencil exactly when stage is set) and the published-event check hold unchanged.
--
-- House style: additive + idempotent (SAFE to re-run: the drop is IF EXISTS and the add re-creates
-- the same named constraint). Rollback: re-add the check without 'meeting' once no row uses it.

alter table public.space_calendar_entries
  drop constraint if exists space_calendar_entries_kind_check;

alter table public.space_calendar_entries
  add constraint space_calendar_entries_kind_check
  check (kind in ('unavailable', 'private', 'pencil', 'meeting'));

comment on column public.space_calendar_entries.kind is
  'unavailable | private | pencil | meeting. Declared in lib/calendar/registry.ts (ENTRY_KINDS). A meeting keeps its agenda in description and its notes in notes (LIVE-2533).';
