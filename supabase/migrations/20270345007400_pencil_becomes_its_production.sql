-- THE PENCIL BECOMES ITS PRODUCTION INSTEAD OF BEING DESTROYED BY IT (PROG-CAL3, ADR-1386).
--
-- ── WHAT WAS ACTUALLY HAPPENING ─────────────────────────────────────────────────────────────────
-- Publishing a Plan called `deleteCalendarEntryRow(space_id, pencil_id)` the moment the event row
-- landed. The Pencil's `description` (the copy ADR-1388 §5 says becomes the event's description),
-- its Team notes, its `hold_expires_at` and its `option_group` history were hard-deleted with it.
-- Nothing recorded that the date had ever been penciled, and nothing linked the event back to the
-- date it came from. Break the link once and only SQL could repair it.
--
-- ── WHY A COLUMN AND NOT A DELETE ───────────────────────────────────────────────────────────────
-- ADR-1386 invariant 2 is "one record per thing" and its lifecycle section says the Pencil's
-- calendar card BECOMES the event card "rather than sitting beside it as a duplicate". Those are a
-- rendering rule, not an instruction to destroy a row: `lib/calendar/admin-calendar.ts` merges
-- events and calendar entries as two separate arrays, so a surviving Pencil would draw a second
-- card on the same day unless something told the entries query to stand down.
--
-- `published_event_id` is that something. It says, in one column, three things at once:
--   • WHICH event this date became          (the back-link the manage view and the Plan drawer read)
--   • that the date is no longer its own item (`listStaffCalendarItems` filters it out, so exactly
--     one card renders on the day and the invariant holds)
--   • that the Plan reached Production      (a Plan whose date carries one but whose stage is not
--     `production` is a Plan the publish seam failed to advance — which is how the best-effort
--     stage transition in app/(main)/events/actions.ts gets NOTICED rather than swallowed).
--
-- `on delete set null` and not `cascade`: deleting an event must never delete the team's planning
-- record. A retired Pencil whose event is gone becomes an ordinary date on the calendar again,
-- which is the honest outcome — the team is back to holding a date.
--
-- ── WHAT THIS DELIBERATELY DOES NOT TOUCH ───────────────────────────────────────────────────────
-- `blocks_time`. A retired Pencil that blocked booking time keeps blocking it, because the time
-- really is taken — by the Production it became. Clearing it here would re-open a slot the event
-- occupies. `space_public_unavailable()` is unaffected for the same reason and by construction:
-- every pencil-kind row is `visibility = 'team'` (ENTRY_KINDS.pencil.canShowPublicly is false), so
-- the public projection never saw these rows at all.
--
-- House style: additive + idempotent (SAFE to re-run). Reached untyped until lib/database.types.ts
-- regenerates (ADR-246). Rollback:
--   alter table public.space_calendar_entries drop column published_event_id;

alter table public.space_calendar_entries
  add column if not exists published_event_id uuid references public.events(id) on delete set null;

comment on column public.space_calendar_entries.published_event_id is
  'The Production this Pencil became (ADR-1386, PROG-CAL3). Set on publish instead of deleting the row: the date keeps its description, Team notes and hold, stops rendering as its own calendar item, and back-links the event. NULL for every date still on its way.';

-- Only an event on its way can become a Production. A Unavailable span or a private entry carrying
-- an event id would be a nonsense the readers would have to defend against for ever, so the table
-- refuses it. Guarded rather than `add constraint if not exists` (which Postgres has no syntax for),
-- and safe on re-run.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'space_calendar_entries_published_event_is_pencil'
       and conrelid = 'public.space_calendar_entries'::regclass
  ) then
    alter table public.space_calendar_entries
      add constraint space_calendar_entries_published_event_is_pencil
      check (published_event_id is null or kind = 'pencil');
  end if;
end $$;

-- For the BACK-LINK direction: "which date became this event", and "has this Plan published yet".
-- Partial on purpose — the rows that matter here are the non-NULL ones, and they are the rare ones.
-- The staff month read filters `published_event_id is null` and is served by the existing
-- (space_id, starts_at) index; a partial index excludes NULLs and could not help it anyway.
create index if not exists space_calendar_entries_published_event_id_idx
  on public.space_calendar_entries (published_event_id)
  where published_event_id is not null;
