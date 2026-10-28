-- THE SPACE CALENDAR AND PROJECT SUITE, DATA MODEL (pass 2 of 9 · LIVE-1703). Status of the work
-- lives in docs/BUILD-BACKLOG.json, not here; this file explains the schema. Plan:
-- /mnt/project-files/calendar-suite/PLAN.md, section "Gaps the handoff needs".
--
-- Additive and idempotent. No new table, so no new grant or policy surface beyond the two policies
-- widened below. Three groups, each the smallest change that carries one thing the handoff shows:
--
-- 1. crm_tasks (the to-dos) gains three nullable columns.
--    phase          'before' | 'day_of' | 'after'. The Plan card groups a Plan's to-dos under
--                   Before / Day of / After. It can be derived from due_offset_days (negative,
--                   zero, positive) for a relative to-do, but a to-do with a fixed due date has no
--                   offset, so the choice is stored. Null means "derive it".
--    est_minutes    the estimate behind Team this week. The handoff counts 20 hours as a full week
--                   per person, so the unit is minutes and the sum is divided by 1200.
--    start_minute   minute of the day (0 to 1439) a to-do starts, in the Space's time zone. An Inbox
--                   to-do dropped onto a time on Week or Day keeps its due DAY in due_at and takes
--                   its time here, so the same row updates and no duplicate is created.
--
-- 2. space_plans gains hold_until (date). A Pencil holds up to three dates for 3, 7 or 14 days; the
--    hold belongs to the Plan, not to one date, so it lives on the Plan. The lapse date is what pass
--    8 releases and what the card prints as "Holding until Oct 27 · 6 days left".
--    NOT ADDED, ON PURPOSE: a team_profile_ids column on space_plans. The team on a Plan is already
--    derivable from existing rows: the host Space's owner and active members plus those of every
--    Space holding an accepted space_plan_shares row (lib/calendar/shared-tasks.ts
--    assigneeChoicesForPlan), and the people actually on it are the assignees of its to-dos. A
--    stored list would be a second copy that drifts the day somebody leaves the Space.
--
-- 3. space_plan_activity and space_plan_comments can be about a standalone calendar entry. A Pencil
--    or a block that is not on a Plan had no edit history and no thread. Each table gains
--    entry_id (FK to space_calendar_entries, on delete cascade) and plan_id becomes nullable, with a
--    CHECK that exactly ONE of the two is set, so a row always has exactly one subject. Every
--    existing row has a plan_id, so the new check holds for all of them.
--    RLS: the read and insert policies gain an entry arm through private.can_write_entry(), a
--    SECURITY DEFINER boolean in the same shape as private.can_write_plan_host (20270345007300), so
--    no policy body reads another RLS table and scripts/check-rls-recursion.mjs sees no new edge.
--    The Space team that can write the entry reads and writes its history and thread; a stranger and
--    anon get nothing. Insert still signs the actor and still requires a Space the caller may write,
--    and for an entry the Space named must BE the entry's Space. Still no update and no delete
--    policy on either table: the record is not rewritten (remove_plan_comment is unchanged).
--    Deleting an entry deletes its history and thread with it.
--
-- NOT IN THIS FILE: releasing lapsed holds (pass 8), any enum rewrite of space_calendar_entries.kind.
--
-- ROLLBACK (the new columns hold nothing the older code reads):
--   drop policy if exists space_plan_comments_read on public.space_plan_comments;
--   drop policy if exists space_plan_comments_insert on public.space_plan_comments;
--   drop policy if exists space_plan_activity_read on public.space_plan_activity;
--   drop policy if exists space_plan_activity_insert on public.space_plan_activity;
--   -- then recreate the four policies from 20270345009400 / 20270345009410, and:
--   delete from public.space_plan_comments where entry_id is not null;
--   delete from public.space_plan_activity where entry_id is not null;
--   alter table public.space_plan_comments drop constraint if exists space_plan_comments_one_subject;
--   alter table public.space_plan_activity drop constraint if exists space_plan_activity_one_subject;
--   alter table public.space_plan_comments drop column if exists entry_id;
--   alter table public.space_plan_activity drop column if exists entry_id;
--   alter table public.space_plan_comments alter column plan_id set not null;
--   alter table public.space_plan_activity alter column plan_id set not null;
--   drop function if exists private.can_write_entry(uuid, uuid);
--   alter table public.space_plans drop column if exists hold_until;
--   alter table public.crm_tasks drop column if exists start_minute, drop column if exists est_minutes,
--     drop column if exists phase;

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── 1. crm_tasks ────────────────────────────────────────────────────────────────────────────────

alter table public.crm_tasks
  add column if not exists phase text
    check (phase is null or phase in ('before', 'day_of', 'after'));
alter table public.crm_tasks
  add column if not exists est_minutes integer
    check (est_minutes is null or est_minutes >= 0);
alter table public.crm_tasks
  add column if not exists start_minute smallint
    check (start_minute is null or start_minute between 0 and 1439);

comment on column public.crm_tasks.phase is
  'before | day_of | after: where a Plan to-do sits around the Production date. Null means derive it from due_offset_days (negative, zero, positive).';
comment on column public.crm_tasks.est_minutes is
  'Estimated effort in minutes, summed per person for Team this week (20 hours is a full week). Null means not estimated.';
comment on column public.crm_tasks.start_minute is
  'Minute of the day (0 to 1439) the to-do starts, in the Space time zone. The DAY stays in due_at. Null means no block of its own.';

-- ── 2. space_plans ──────────────────────────────────────────────────────────────────────────────

alter table public.space_plans
  add column if not exists hold_until date;

comment on column public.space_plans.hold_until is
  'The day a Pencil hold lapses (today plus 3, 7 or 14 days when it was made). Null when the Plan holds nothing. Releasing a lapsed hold is the pass 8 cron, not this column.';

-- ── 3. entry_id on the Plan record and the Plan thread ──────────────────────────────────────────

alter table public.space_plan_activity
  add column if not exists entry_id uuid references public.space_calendar_entries(id) on delete cascade;
alter table public.space_plan_activity
  alter column plan_id drop not null;

alter table public.space_plan_comments
  add column if not exists entry_id uuid references public.space_calendar_entries(id) on delete cascade;
alter table public.space_plan_comments
  alter column plan_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_plan_activity_one_subject'
      and conrelid = 'public.space_plan_activity'::regclass
  ) then
    alter table public.space_plan_activity
      add constraint space_plan_activity_one_subject
      check (num_nonnulls(plan_id, entry_id) = 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_plan_comments_one_subject'
      and conrelid = 'public.space_plan_comments'::regclass
  ) then
    alter table public.space_plan_comments
      add constraint space_plan_comments_one_subject
      check (num_nonnulls(plan_id, entry_id) = 1);
  end if;
  -- A to-do thread belongs to a Plan: a comment on an entry cannot name a to-do.
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_plan_comments_entry_has_no_task'
      and conrelid = 'public.space_plan_comments'::regclass
  ) then
    alter table public.space_plan_comments
      add constraint space_plan_comments_entry_has_no_task
      check (entry_id is null or task_id is null);
  end if;
end
$$;

comment on column public.space_plan_activity.entry_id is
  'Set when the record is about a standalone calendar entry instead of a Plan. Exactly one of plan_id and entry_id is set.';
comment on column public.space_plan_comments.entry_id is
  'Set when the thread is under a standalone calendar entry instead of a Plan. Exactly one of plan_id and entry_id is set.';

-- Foreign-key indexes (scripts/check-fk-indexes.mjs). Partial: most rows belong to a Plan.
create index if not exists space_plan_activity_entry_idx
  on public.space_plan_activity (entry_id, created_at desc) where entry_id is not null;
create index if not exists space_plan_comments_entry_idx
  on public.space_plan_comments (entry_id, created_at) where entry_id is not null;

-- May the caller write this entry's Space (and, when a Space is named, is the entry in it)? A
-- boolean, not an id, for the reason private.can_write_plan_host is: it answers only the caller's
-- own permission, and a missing entry is a refusal instead of can_write_space_content(null), which
-- is true for platform staff.
create or replace function private.can_write_entry(p_entry_id uuid, p_space_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.space_calendar_entries e
    where e.id = p_entry_id
      and (p_space_id is null or e.space_id = p_space_id)
      and private.can_write_space_content(e.space_id)
  );
$$;

comment on function private.can_write_entry(uuid, uuid) is
  'SECURITY DEFINER: may the caller write the Space that owns this calendar entry (and, when p_space_id is given, is the entry in that Space)? Lets the activity and comment policies ask without a direct read of space_calendar_entries RLS. Boolean on purpose: a missing entry is a refusal, never the staff-true of can_write_space_content(null).';

revoke all on function private.can_write_entry(uuid, uuid) from public, anon;
grant execute on function private.can_write_entry(uuid, uuid) to authenticated;

-- Read: the Plan arm is unchanged; the entry arm is the Space team that can write the entry.
drop policy if exists space_plan_comments_read on public.space_plan_comments;
create policy space_plan_comments_read on public.space_plan_comments
  for select using (
    (plan_id is not null and (private.can_write_plan_host(plan_id) or private.plan_is_shared_with_me(plan_id)))
    or (entry_id is not null and private.can_write_entry(entry_id))
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_plan_comments_insert on public.space_plan_comments;
create policy space_plan_comments_insert on public.space_plan_comments
  for insert with check (
    (
      (plan_id is not null and (private.can_write_plan_host(plan_id) or private.plan_is_shared_with_me(plan_id)))
      or (entry_id is not null and private.can_write_entry(entry_id, space_id))
    )
    and private.can_write_space_content(space_id)
    and author_profile_id = private.get_my_profile_id()
    and removed_at is null
    and removed_by is null
  );

drop policy if exists space_plan_activity_read on public.space_plan_activity;
create policy space_plan_activity_read on public.space_plan_activity
  for select using (
    (plan_id is not null and (private.can_write_plan_host(plan_id) or private.plan_is_shared_with_me(plan_id)))
    or (entry_id is not null and private.can_write_entry(entry_id))
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_plan_activity_insert on public.space_plan_activity;
create policy space_plan_activity_insert on public.space_plan_activity
  for insert with check (
    (
      (plan_id is not null and (private.can_write_plan_host(plan_id) or private.plan_is_shared_with_me(plan_id)))
      or (entry_id is not null and private.can_write_entry(entry_id, actor_space_id))
    )
    and private.can_write_space_content(actor_space_id)
    and actor_profile_id = private.get_my_profile_id()
  );

commit;
