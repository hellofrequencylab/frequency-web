-- DELETING A SPACE CALENDAR ENTRY BECOMES RECOVERABLE (LIVE-536, owner ruling 2026-09-28).
--
-- ── THE INCIDENT ────────────────────────────────────────────────────────────────────────────────
-- On 2026-09-28 an operator deleted one occurrence of a repeating Pencil ("Craft Night") and lost
-- the WHOLE SERIES, for good. Both halves of that sentence were true of the tree:
--
--   1. A repeating entry is ONE ROW (`recurrence_rule` + `exception_dates`, PROG-CAL5). There is no
--      per-occurrence row to delete, so "delete this date" reached the master and every landing of
--      the series went with it. PR #2927 adds the warning and the "this date only" choice, which is
--      the right fix for the CHOICE, and says in as many words that the tombstone is an owner
--      ruling. This migration is that ruling.
--   2. `deleteCalendarEntryRow` was a hard `.delete()`, and this table has never carried a tombstone
--      column — no `removed_at`, no `deleted_at`, no `archived_at`. So there was nothing to recover
--      FROM. The title, the notes, the Team description, the hold, the cadence and the stored skips
--      were gone the moment the button was pressed.
--
-- The delete is now an UPDATE that stamps `removed_at`, and every reader of the table filters
-- `removed_at is null`. Recovery is `update ... set removed_at = null, removed_by = null` — in SQL
-- today, which is the whole point: the row is still there to be recovered. There is deliberately NO
-- restore control in this change (see the backlog row's scope note).
--
-- ── SHAPE, AND WHY IT MATCHES `events` RATHER THAN INVENTING ONE ─────────────────────────────────
-- `public.events` has carried a removal trail since 20260613130000_poster_events.sql:
-- `removed_at timestamptz` + `removed_reason text`, and every lister in lib/events/store.ts filters
-- `removed_at is null`. That is the precedent this follows, with two deliberate differences:
--
--   · `removed_at timestamptz` — same name, same type, same meaning (null = live). A NEW name here
--     ("deleted_at", "archived_at") would mean two spellings of one idea in one schema, and
--     `space_plans.archived_at` already means something ELSE on the Plan beside it: put away, still
--     listed in its own places, its dates still real. This is removal.
--   · `removed_by uuid` instead of `removed_reason text`. The events trail collects a reason because
--     it is written by a STAFF MODERATION form that asks for one (reportRemoveEvent). Nothing asks a
--     Space operator why they are clearing a date off their own calendar, and a column no writer
--     fills is a column the next reader trusts wrongly. What IS known at this seam is the actor —
--     `resolveEditor` already returns `profileId` — so the trail records WHO, the way `created_by`
--     on this same table and `cancelled_by` on `events` (20260830000000) both do. A reason column
--     can join later, in the change that adds a field to ask for one.
--
-- `on delete set null` mirrors `created_by`: an operator who later leaves the platform must not take
-- the tombstone with them, or a cascade would hard-delete exactly the row this change exists to keep.
--
-- ── RLS AND EXPOSURE ────────────────────────────────────────────────────────────────────────────
-- No policy changes, and none are needed: the read policy is the ADR-923 operator quad plus platform
-- staff, and a removed row is visible to exactly the same people as before — nobody new. The one
-- public read is `public.space_public_unavailable()`, which is SECURITY DEFINER and therefore the ONE
-- place a removed row could have leaked past the quad; it gains `removed_at is null` below, which
-- makes it strictly NARROWER than it was. The UPDATE policy already admits the operator quad, which
-- is what the soft delete now runs through; the DELETE policy stays for a future purge.
--
-- ⚠️ A SOFT DELETE IS AN UPDATE, so the table's BEFORE trigger (`space_calendar_entries_stage_sync`,
-- 20270345005500) fires on it and re-derives `status` from `stage`. That is correct and deliberate:
-- the removal is recorded on its own column and the row's stage is left exactly as it was, so
-- restoring it gives back the row that was removed rather than a re-derived one.
--
-- ── FUNCTIONS RECREATED HERE, AND WHY EACH ONE HAD TO BE ────────────────────────────────────────
-- A reader that forgets the filter shows a member a date the operator deleted, which is worse than
-- the bug this fixes. Three of the four functions that touch this table are readers or destroyers:
--
--   · `space_public_unavailable()` — the public projection. Gains `removed_at is null`. Without it a
--     deleted "Unavailable" span keeps blocking the public Calendar tab for ever.
--   · `keep_pencil_date()` — "Keep this date" HARD-DELETED the sibling candidate dates. Those are
--     calendar entries too, and the ruling is about calendar entries, so they are soft-removed now,
--     with the same stamp. It also stops counting (or re-stamping) siblings that were already
--     removed, so the number it returns is still "how many dates this just took off the calendar".
--   · `transition_space_plan_stage()` — mirrors a Plan's stage onto its dates. Gains
--     `removed_at is null` so a Workflow move cannot silently edit a removed row back into agreement
--     with a Plan it is no longer on.
--
-- `create_penciled_plan()` is an INSERT only: a new row's `removed_at` defaults to null, which is
-- live, so it needs no change.
--
-- ── THE INDEX ───────────────────────────────────────────────────────────────────────────────────
-- Every month read is now `(space_id, starts_at)` AND `removed_at is null`, so the hot index gets a
-- live-rows-only partial twin, in the same style as `space_calendar_entries_option_group_idx`. The
-- full index stays: a recovery read has to be able to find a removed row.
--
-- House style: additive + idempotent (SAFE to re-run). The file ships in this PR and a human applies
-- it out of band (docs/WORKFLOW.md "Scaling to a team": one shared database, no `supabase db push`
-- from an authoring session). Rollback:
--   drop index if exists public.space_calendar_entries_live_space_starts_idx;
--   alter table public.space_calendar_entries drop column removed_by, drop column removed_at;
--   -- then re-run 20270345005200 (space_public_unavailable), 20270345005500 (keep_pencil_date)
--   -- and 20270345007100 (transition_space_plan_stage) to restore their previous bodies.

alter table public.space_calendar_entries
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id) on delete set null;

comment on column public.space_calendar_entries.removed_at is
  'Tombstone (LIVE-536). Null = live. Set instead of deleting the row, so a deleted date — including a whole repeating series, which is ONE row — is recoverable (set removed_at = null). Every reader filters removed_at is null; the name and meaning match events.removed_at (20260613130000).';
comment on column public.space_calendar_entries.removed_by is
  'Who removed this entry (LIVE-536). Nullable and on delete set null, like created_by: an operator leaving the platform must never cascade away the tombstone this column is attached to.';

create index if not exists space_calendar_entries_live_space_starts_idx
  on public.space_calendar_entries (space_id, starts_at)
  where removed_at is null;

-- ── The public projection, now blind to removed rows ───────────────────────────────────────────
-- Unchanged except for the one added predicate. The column list is still the gate and must never
-- grow a detail column (ADR-1385).
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
    and e.removed_at is null
    and e.starts_at < (p_to_day::timestamp at time zone 'UTC')
    and e.ends_at > (p_from_day::timestamp at time zone 'UTC')
    and p_to_day - p_from_day <= 400
  order by e.starts_at
  limit 500
$$;

comment on function public.space_public_unavailable(uuid, date, date) is
  'Public projection of the private calendar layer (ADR-1385): unavailable times only, never details. Skips removed entries (LIVE-536).';

grant execute on function public.space_public_unavailable(uuid, date, date) to anon, authenticated;

-- ── "Keep this date": the siblings are REMOVED, not destroyed ───────────────────────────────────
-- Same contract as before (returns how many sibling dates left the calendar, 0 when the entry has no
-- group or the caller cannot see it), with three changes: the anchor must itself be live, the
-- siblings are stamped rather than deleted, and a sibling that was ALREADY removed is neither counted
-- nor re-stamped — so its original removal time survives and the count stays honest.
create or replace function public.keep_pencil_date(p_space_id uuid, p_entry_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
  v_removed integer := 0;
  v_actor uuid := auth.uid();
begin
  select option_group into v_group
    from public.space_calendar_entries
   where id = p_entry_id and space_id = p_space_id and removed_at is null;
  if v_group is null then
    return 0;
  end if;

  update public.space_calendar_entries
     set removed_at = now(),
         removed_by = v_actor,
         updated_at = now()
   where space_id = p_space_id
     and option_group = v_group
     and id <> p_entry_id
     and removed_at is null;
  get diagnostics v_removed = row_count;

  update public.space_calendar_entries
     set option_group = null
   where id = p_entry_id and space_id = p_space_id and removed_at is null;

  return v_removed;
end
$$;

comment on function public.keep_pencil_date(uuid, uuid) is
  'Keep one candidate date of a pencil and take its siblings off the calendar atomically (ADR-1388). SECURITY INVOKER: RLS decides. Siblings are SOFT-removed (removed_at, LIVE-536), so picking the wrong date is recoverable.';

revoke all on function public.keep_pencil_date(uuid, uuid) from public;
revoke all on function public.keep_pencil_date(uuid, uuid) from anon;
grant execute on function public.keep_pencil_date(uuid, uuid) to authenticated;

-- ── A Plan's stage mirrors onto its LIVE dates only ────────────────────────────────────────────
-- Unchanged except for the one added predicate on the entry update.
create or replace function public.transition_space_plan_stage(
  p_space_id uuid,
  p_plan_id uuid,
  p_stage text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
  v_plan_stage text;
  v_entry_stage text;
  v_archived_at timestamptz;
begin
  select x.plan_stage, x.entry_stage, x.archived_at
    into v_plan_stage, v_entry_stage, v_archived_at
    from (values
      ('pencil'::text,     'pencil'::text,     'pencil'::text,     null::timestamptz),
      ('plan'::text,       'plan'::text,       'planning'::text,   null::timestamptz),
      ('production'::text, 'production'::text, 'production'::text, null::timestamptz),
      ('cancelled'::text,  'plan'::text,       'cancelled'::text,  now())
    ) as x(stage, plan_stage, entry_stage, archived_at)
   where x.stage = p_stage;

  if v_plan_stage is null then return false; end if;

  update public.space_plans
     set stage = v_plan_stage,
         archived_at = v_archived_at,
         updated_at = now()
   where id = p_plan_id
     and space_id = p_space_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return false;
  end if;

  update public.space_calendar_entries
     set stage = v_entry_stage,
         updated_at = now()
   where plan_id = p_plan_id
     and space_id = p_space_id
     and kind = 'pencil'
     and removed_at is null;

  return true;
end;
$$;

revoke execute on function public.transition_space_plan_stage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_space_plan_stage(uuid, uuid, text) to authenticated;
