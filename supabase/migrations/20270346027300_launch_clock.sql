-- The 12-minute launch clock is kept on the launch row (LIVE-1873).
--
-- The guided launch is a game against a twelve minute clock that only runs while the person is working. The open page
-- sends a heartbeat every 15 seconds; the server adds the time since the last one, never more than 30 seconds, so a
-- closed tab cannot run the clock. The two columns below are all it keeps:
--
-- 1. clock_active_ms: active milliseconds so far. Past 12 minutes (720000) it keeps counting as bonus time.
-- 2. clock_last_beat_at: when the last heartbeat landed. Null while paused or before the first start. The reminder
--    emails read both ("stopped at", "minutes left").
--
-- No new table, policy or grant: space_launch is already RLS-on and owner-only (select, insert, update to the owner under
-- their own session), and a new column inherits that. Additive and idempotent.
-- ROLLBACK:
--   alter table public.space_launch drop column if exists clock_last_beat_at;
--   alter table public.space_launch drop column if exists clock_active_ms;

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.space_launch add column if not exists clock_active_ms integer not null default 0;
alter table public.space_launch add column if not exists clock_last_beat_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'space_launch_clock_active_ms_range' and conrelid = 'public.space_launch'::regclass) then
    alter table public.space_launch add constraint space_launch_clock_active_ms_range check (clock_active_ms between 0 and 360000000);
  end if;
end $$;

comment on column public.space_launch.clock_active_ms is 'Active milliseconds on the launch clock (12 minutes = 720000; counts on as bonus time). Added to by the heartbeat, at most 30 seconds per beat.';
comment on column public.space_launch.clock_last_beat_at is 'When the last clock heartbeat landed; null while the clock is paused. Read by the reminder emails.';

commit;
