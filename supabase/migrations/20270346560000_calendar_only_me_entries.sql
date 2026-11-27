-- "ONLY ME" CALENDAR ENTRIES (LIVE-2560, owner ruling 2026-11-27: "Build it, team sees Busy").
-- The owner asked for private events on his own account, shown as a personal overlay on his Space
-- calendar. The Private kind already exists, but "private" there means private to the Space TEAM
-- (every editor, moderator and admin of the Space, plus site admins), so it could not carry a
-- personal appointment.
--
-- Per the layer's own rule (20270345005200: a later need is one value on an existing column, never a
-- new table) this adds ONE value to the `visibility` check, 'only_me', and narrows the four policies
-- so an only-me row is the creator's alone:
--   · read, update, delete: only the profile in `created_by` (site admins included: they do NOT read
--     someone's personal entries; the team-row branch keeps its admin/janitor read unchanged).
--   · insert: an only-me row must be written by the person it belongs to (created_by = caller).
-- Everyone else on the Space team sees the time and nothing more, through space_personal_busy(): a
-- security-definer projection that returns start, end, all-day and zone, never a title or a note,
-- and only to someone who can already write the Space's calendar. The caller's own entries are left
-- out of it because RLS already hands them their rows in full.
--
-- private.can_write_entry (comments and the activity record on a standalone date) follows the same
-- rule, so nobody can reach an only-me entry's thread by its id.
--
-- Service-role readers (the private team feed, bookings) filter in the app: the team feed skips
-- only-me rows; bookings keep honouring `blocks_time` exactly as before.
--
-- House style: additive + idempotent (constraint and policies are dropped IF EXISTS and re-created
-- with the same names; functions are CREATE OR REPLACE). Rollback: re-create the four policies and
-- can_write_entry from 20270345005200, drop space_personal_busy, and re-add the check without
-- 'only_me' once no row uses it.

alter table public.space_calendar_entries
  drop constraint if exists space_calendar_entries_visibility_check;

alter table public.space_calendar_entries
  add constraint space_calendar_entries_visibility_check
  check (visibility in ('team', 'public_unavailable', 'only_me'));

comment on column public.space_calendar_entries.visibility is
  'team | public_unavailable | only_me. only_me = readable by created_by alone; the rest of the team sees Busy via space_personal_busy() (LIVE-2560).';

drop policy if exists space_calendar_entries_space_read on public.space_calendar_entries;
create policy space_calendar_entries_space_read on public.space_calendar_entries
  for select using (
    case
      when visibility = 'only_me' then created_by = private.get_my_profile_id()
      else private.can_write_space_content(space_id)
        or private.get_my_web_role() in ('admin', 'janitor')
    end
  );

drop policy if exists space_calendar_entries_space_insert on public.space_calendar_entries;
create policy space_calendar_entries_space_insert on public.space_calendar_entries
  for insert with check (
    private.can_write_space_content(space_id)
    and (visibility <> 'only_me' or created_by = private.get_my_profile_id())
  );

drop policy if exists space_calendar_entries_space_update on public.space_calendar_entries;
create policy space_calendar_entries_space_update on public.space_calendar_entries
  for update
  using (
    private.can_write_space_content(space_id)
    and (visibility <> 'only_me' or created_by = private.get_my_profile_id())
  )
  with check (
    private.can_write_space_content(space_id)
    and (visibility <> 'only_me' or created_by = private.get_my_profile_id())
  );

drop policy if exists space_calendar_entries_space_delete on public.space_calendar_entries;
create policy space_calendar_entries_space_delete on public.space_calendar_entries
  for delete using (
    private.can_write_space_content(space_id)
    and (visibility <> 'only_me' or created_by = private.get_my_profile_id())
  );

create or replace function private.can_write_entry(p_entry_id uuid, p_space_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.space_calendar_entries e
    where e.id = p_entry_id
      and (p_space_id is null or e.space_id = p_space_id)
      and private.can_write_space_content(e.space_id)
      and (e.visibility <> 'only_me' or e.created_by = private.get_my_profile_id())
  );
$$;

-- ── Busy: the team's view of someone else's only-me time ─────────────────────────────────────────
create or replace function public.space_personal_busy(p_space_id uuid, p_from_day date, p_to_day date)
returns table (starts_at timestamptz, ends_at timestamptz, all_day boolean, time_zone text)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select e.starts_at, e.ends_at, e.all_day, e.time_zone
  from public.space_calendar_entries e
  where e.space_id = p_space_id
    and private.can_write_space_content(p_space_id)
    and e.visibility = 'only_me'
    and e.created_by is distinct from private.get_my_profile_id()
    and e.status <> 'cancelled'
    and e.removed_at is null
    and e.starts_at < (p_to_day::timestamp at time zone 'UTC')
    and e.ends_at > (p_from_day::timestamp at time zone 'UTC')
    and p_to_day - p_from_day <= 400
  order by e.starts_at
  limit 500
$$;

comment on function public.space_personal_busy(uuid, date, date) is
  'Busy windows of teammates'' only-me calendar entries (LIVE-2560): times only, never details, and only to someone who can write the Space''s calendar. Skips the caller''s own rows and removed entries.';

revoke execute on function public.space_personal_busy(uuid, date, date) from public, anon;
grant execute on function public.space_personal_busy(uuid, date, date) to authenticated;
