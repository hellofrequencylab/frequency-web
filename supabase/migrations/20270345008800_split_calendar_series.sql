-- ONE OCCURRENCE OF A REPEATING ENTRY, EDITED ON ITS OWN (LIVE-534, ADR-1541; docs/EVENTS-CALENDAR.md
-- "Repeating Pencils with explicit exceptions").
--
-- WHY. A repeating private entry is ONE row: `recurrence_rule` plus `exception_dates`, expanded at
-- read time by lib/calendar/pencil-series.ts. So an edit to any occurrence rewrote every date, and
-- the save dialog LIVE-531 added could only say so. "This date only" on an EDIT means SPLITTING the
-- series: the master keeps its rule and gains the occurrence's day in `exception_dates`, and a NEW
-- one-off row carries the edited values for that day alone. Those are two writes that must land
-- together or not at all. A stamped exception with no override row is a date that silently
-- vanished, which is the LIVE-531 loss with extra steps; an override with no exception is the same
-- date drawn twice, and a drag or a delete of one of them leaves the other behind.
--
-- WHAT. public.split_calendar_series(space, entry, day, override), in one transaction:
--   1. locks the master and refuses a row that is removed, does not repeat, or already skips the day;
--   2. appends the day to the master's exception_dates, kept unique and ascending (the shape
--      lib/calendar/pencil-series.ts normalises to);
--   3. inserts the override: the master copied onto that day with the override's keys applied; no
--      rule, no skips, no candidate group, not published, not removed, created by the caller.
-- Any failure raises and the whole thing rolls back, so the pair is never half written.
--
-- THE OVERRIDE IS READ BY NAME. Its keys are the EntryWrite columns lib/calendar/entries.ts produces,
-- and only those reach the row. Identity (id, space_id), the series (recurrence_rule,
-- exception_dates), the candidate group, the publish back-link and the tombstone are set here and
-- never from the payload, so a caller cannot use the split to write any of them. A key that is
-- absent falls back to the master, with the span shifted to the day.
--
-- SECURITY INVOKER, like create_penciled_plan and keep_pencil_date: the table's operator quad
-- (private.can_write_space_content) is still the lock. Under RLS a refused UPDATE touches zero rows
-- rather than raising, so the row count is checked and the function raises itself; the INSERT's
-- WITH CHECK raises on its own. created_by is the caller's PROFILE id through
-- private.get_my_profile_id(), never auth.uid() (the FK is to profiles; 20270345007300 defect 2).
-- Signed-in only; anon is revoked by name (scripts/function-grants.txt).
--
-- House style: additive + idempotent (SAFE to re-run). Rollback:
--   drop function public.split_calendar_series(uuid, uuid, date, jsonb);

create or replace function public.split_calendar_series(
  p_space_id uuid,
  p_entry_id uuid,
  p_day date,
  p_override jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
-- 🔴 UTC, PINNED. starts_at holds the Space's wall clock as UTC PARTS (docs/EVENTS-CALENDAR.md,
-- LIVE-514), so the anchor's day key is its UTC date and the occurrence on p_day is that span moved
-- by whole days. Both the ::date cast and the day arithmetic below read the session zone, and a
-- session in any other zone would shift a date or an hour; pinning the function's zone is what makes
-- them exact, and it is why no time here is ever resolved through a named zone.
set timezone = 'UTC'
as $$
declare
  m public.space_calendar_entries%rowtype;
  v_profile_id uuid := private.get_my_profile_id();
  v_shift interval;
  v_updated integer;
  v_id uuid;
begin
  if p_space_id is null or p_entry_id is null or p_day is null then
    raise exception 'split_calendar_series: a space, an entry and a day are required';
  end if;
  if p_override is null or jsonb_typeof(p_override) <> 'object' then
    raise exception 'split_calendar_series: the override must be a json object';
  end if;
  if v_profile_id is null then
    raise exception 'no profile for the current user';
  end if;

  select * into m
    from public.space_calendar_entries
   where id = p_entry_id and space_id = p_space_id and removed_at is null
     for update;
  if not found then
    raise exception 'split_calendar_series: entry not found';
  end if;
  if m.recurrence_rule is null then
    raise exception 'split_calendar_series: entry does not repeat';
  end if;
  if p_day = any (m.exception_dates) then
    raise exception 'split_calendar_series: that day is already skipped';
  end if;

  -- Under the pinned zone above, starts_at::date IS the anchor's day key.
  v_shift := (p_day - m.starts_at::date) * interval '1 day';

  update public.space_calendar_entries
     set exception_dates = array(select distinct d from unnest(m.exception_dates || p_day) as d order by d)
   where id = m.id and space_id = m.space_id and removed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'split_calendar_series: the series could not be updated';
  end if;

  insert into public.space_calendar_entries (
    space_id, kind, title, notes, location, all_day, starts_at, ends_at, time_zone,
    status, blocks_time, visibility, stage, description, hold_expires_at, plan_id,
    recurrence_rule, exception_dates, option_group, published_event_id, removed_at, removed_by,
    source_kind, source_id, metadata, created_by
  ) values (
    m.space_id,
    coalesce(p_override->>'kind', m.kind),
    coalesce(p_override->>'title', m.title),
    case when p_override ? 'notes' then p_override->>'notes' else m.notes end,
    case when p_override ? 'location' then p_override->>'location' else m.location end,
    coalesce((p_override->>'all_day')::boolean, m.all_day),
    coalesce((p_override->>'starts_at')::timestamptz, m.starts_at + v_shift),
    coalesce((p_override->>'ends_at')::timestamptz, m.ends_at + v_shift),
    coalesce(p_override->>'time_zone', m.time_zone),
    coalesce(p_override->>'status', m.status),
    coalesce((p_override->>'blocks_time')::boolean, m.blocks_time),
    coalesce(p_override->>'visibility', m.visibility),
    case when p_override ? 'stage' then p_override->>'stage' else m.stage end,
    case when p_override ? 'description' then p_override->>'description' else m.description end,
    case when p_override ? 'hold_expires_at' then (p_override->>'hold_expires_at')::timestamptz else m.hold_expires_at end,
    case when p_override ? 'plan_id' then (p_override->>'plan_id')::uuid else m.plan_id end,
    null,
    '{}'::date[],
    null,
    null,
    null,
    null,
    m.source_kind,
    m.source_id,
    m.metadata,
    v_profile_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.split_calendar_series(uuid, uuid, date, jsonb) is
  'LIVE-534: one occurrence of a repeating calendar entry becomes its own one-off row (the override) and the series skips that day, in one transaction. SECURITY INVOKER; the operator quad on space_calendar_entries is the lock.';

revoke all on function public.split_calendar_series(uuid, uuid, date, jsonb) from public;
revoke all on function public.split_calendar_series(uuid, uuid, date, jsonb) from anon;
revoke all on function public.split_calendar_series(uuid, uuid, date, jsonb) from authenticated;
grant execute on function public.split_calendar_series(uuid, uuid, date, jsonb) to authenticated;
