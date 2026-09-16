-- DAY NOTES ARE TEAM ONLY (ADR-1387, amends ADR-1386; docs/EVENTS-CALENDAR.md "Pencil, Plan, Production").
--
-- WHY. Day notes shipped with a `public` visibility and the public Calendar tab showed them. The owner
-- ruled on 2026-09-16 that they are internal notes ("Quiet hours", "Flex day", "Retreat & rental"
-- describe how the team runs its week) and the public view must never show them. This makes that a
-- property of the table, not of one page's filter: no row can be public and no visitor can read one.
--
-- WHAT.
--   1. Every existing row becomes `team` (production's three Royal Temple notes were flipped by hand the
--      same day, before this file, so the public page stopped showing them at once).
--   2. The default becomes `team` and the check admits only `team`. The column stays, so a later ruling
--      that wants a public note is a check change, not a new column.
--   3. The read policy loses its `visibility = 'public'` arm: only the Space's editors and platform staff
--      read a day note, exactly like space_calendar_entries.
--   4. anon loses table access (scripts/table-grants.txt moves the table from public to authenticated).
--
-- House style: additive + idempotent (SAFE to re-run). Rollback: re-add 'public' to the check, restore
-- the read policy's public arm and grant select to anon (20270345005200 carries the old text).

update public.space_calendar_day_notes set visibility = 'team' where visibility <> 'team';

alter table public.space_calendar_day_notes alter column visibility set default 'team';

alter table public.space_calendar_day_notes drop constraint if exists space_calendar_day_notes_visibility_check;
alter table public.space_calendar_day_notes
  add constraint space_calendar_day_notes_visibility_check check (visibility = 'team');

comment on column public.space_calendar_day_notes.visibility is
  'Always team (ADR-1387): day notes are internal and never shown on the public calendar.';

drop policy if exists space_calendar_day_notes_read on public.space_calendar_day_notes;
create policy space_calendar_day_notes_read on public.space_calendar_day_notes
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

revoke all on table public.space_calendar_day_notes from anon;
