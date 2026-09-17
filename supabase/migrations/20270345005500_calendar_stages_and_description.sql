-- CALENDAR STAGES AND DESCRIPTION (ADR-1388, amends ADR-1386; docs/EVENTS-CALENDAR.md "Pencil, Planning,
-- Production").
--
-- WHY. A penciled date could never move: the staff drawer locked its Type, and nothing said how far along
-- a potential event was. The owner ruled on 2026-09-16 that an event on its way moves through four stages,
-- Pencil, Planning, Production and Cancelled, and that it carries a Description that becomes the published
-- event's description.
--
-- WHAT.
--   1. `stage` on public.space_calendar_entries: pencil | planning | production | cancelled. Set on every
--      row of kind `pencil` (the internal kind of an event on its way) and null on every other kind.
--   2. `description`: the public-facing copy for the event this entry becomes. Distinct from `notes`,
--      which stay internal to the team. Capped at 10,000 characters (events.description is unbounded).
--   3. A BEFORE trigger makes the database the source of truth for the pairing: a pencil-kind row with
--      no stage gets `pencil`, a non-pencil row loses its stage, and a staged row's `status` is derived
--      from the stage (cancelled -> cancelled, pencil -> tentative, planning/production -> confirmed).
--      So every reader of `status` (the public projection, booking blocks, clash checks) stays correct
--      without knowing stages exist, and the code deployed before this file keeps inserting pencils.
--   4. public.keep_pencil_date(space, entry): "Keep this date" in ONE statement. It deletes the entry's
--      sibling candidate dates and clears its group atomically. SECURITY INVOKER, so the table's RLS
--      quad still decides what the caller may delete; signed-in only.
--
-- House style: additive + idempotent (SAFE to re-run). Rollback: drop function
-- public.keep_pencil_date(uuid, uuid); drop trigger space_calendar_entries_stage_sync on
-- public.space_calendar_entries; drop function public.space_calendar_entries_stage_sync(); alter table
-- public.space_calendar_entries drop column stage, drop column description.

alter table public.space_calendar_entries add column if not exists stage text;
alter table public.space_calendar_entries add column if not exists description text;

comment on column public.space_calendar_entries.stage is
  'pencil | planning | production | cancelled for kind pencil (an event on its way), null otherwise (ADR-1388). status is derived from it by trigger.';
comment on column public.space_calendar_entries.description is
  'Public-facing copy that becomes the published event''s description (ADR-1388). Notes stay internal.';

-- Backfill before the constraints: every existing pencil gets a stage that matches its status.
update public.space_calendar_entries
   set stage = case when status = 'cancelled' then 'cancelled' else 'pencil' end
 where kind = 'pencil' and stage is null;
update public.space_calendar_entries set stage = null where kind <> 'pencil' and stage is not null;

create or replace function public.space_calendar_entries_stage_sync()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'pencil' then
    new.stage := coalesce(new.stage, 'pencil');
    new.status := case new.stage
      when 'cancelled' then 'cancelled'
      when 'pencil' then 'tentative'
      else 'confirmed'
    end;
  else
    new.stage := null;
  end if;
  return new;
end
$$;

revoke execute on function public.space_calendar_entries_stage_sync() from public, anon, authenticated;

drop trigger if exists space_calendar_entries_stage_sync on public.space_calendar_entries;
create trigger space_calendar_entries_stage_sync
  before insert or update on public.space_calendar_entries
  for each row execute function public.space_calendar_entries_stage_sync();

alter table public.space_calendar_entries drop constraint if exists space_calendar_entries_stage_check;
alter table public.space_calendar_entries
  add constraint space_calendar_entries_stage_check
  check (stage is null or stage in ('pencil', 'planning', 'production', 'cancelled'));

alter table public.space_calendar_entries drop constraint if exists space_calendar_entries_stage_kind;
alter table public.space_calendar_entries
  add constraint space_calendar_entries_stage_kind check ((kind = 'pencil') = (stage is not null));

alter table public.space_calendar_entries drop constraint if exists space_calendar_entries_description_check;
alter table public.space_calendar_entries
  add constraint space_calendar_entries_description_check
  check (description is null or char_length(description) <= 10000);

-- "Keep this date": keep one candidate, remove its siblings, clear the group, in one transaction.
-- Returns how many sibling dates were removed (0 when the entry had no group or is not visible).
create or replace function public.keep_pencil_date(p_space_id uuid, p_entry_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
  v_removed integer := 0;
begin
  select option_group into v_group
    from public.space_calendar_entries
   where id = p_entry_id and space_id = p_space_id;
  if v_group is null then
    return 0;
  end if;

  delete from public.space_calendar_entries
   where space_id = p_space_id and option_group = v_group and id <> p_entry_id;
  get diagnostics v_removed = row_count;

  update public.space_calendar_entries
     set option_group = null
   where id = p_entry_id and space_id = p_space_id;

  return v_removed;
end
$$;

comment on function public.keep_pencil_date(uuid, uuid) is
  'Keep one candidate date of a pencil and remove its siblings atomically (ADR-1388). SECURITY INVOKER: RLS decides.';

revoke all on function public.keep_pencil_date(uuid, uuid) from public;
revoke all on function public.keep_pencil_date(uuid, uuid) from anon;
grant execute on function public.keep_pencil_date(uuid, uuid) to authenticated;
