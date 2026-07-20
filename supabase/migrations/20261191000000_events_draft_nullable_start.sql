-- Event drafts must be allowed to have NO start date yet (the "Event seeder isn't seeding" bug).
--
-- Vera's capture flow (app/(main)/events/scan/actions.ts → createEventDraft) inserts a draft with
-- status='draft' and starts_at=null — the operator sets the date later in the editor, and publishDraft
-- REQUIRES a valid future starts_at before it will publish ("Add a start date before publishing"). But
-- events.starts_at was NOT NULL, so every dateless draft insert failed with
--   "null value in column starts_at of relation events violates not-null constraint"
-- and the UI showed "Could not save the draft. Try again." (No draft has ever saved via this path.)
--
-- Fix: allow a null start ONLY for drafts, and KEEP the invariant for everything live via a CHECK — a
-- published/live event must still have a date (that is what makes it listable: the Catalog filters
-- starts_at >= now). This is strictly LOOSER than the old NOT NULL (which required a date for every
-- status), so no insert that works today can break; it only unblocks status='draft'. All existing rows
-- are published with a non-null starts_at, so the constraint validates immediately.
alter table public.events alter column starts_at drop not null;

alter table public.events
  add constraint events_starts_at_required_when_live
  check (status = 'draft' or starts_at is not null);
