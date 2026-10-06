-- SCAN-687 (defense in depth): log_crew_completion_atomic trusted its _zaps argument, so a
-- caller that reached the RPC with any number credited that number. The function now reads
-- zaps_value from crew_tasks itself and refuses a task that does not exist; the argument stays
-- in the signature so every existing caller keeps compiling, and is ignored.

create or replace function public.log_crew_completion_atomic(
  _profile uuid,
  _task uuid,
  _zaps integer,
  _repeatable boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _existing uuid;
  _new_id uuid;
  _task_zaps integer;
begin
  if _profile is null or _task is null then
    return null;
  end if;

  -- The task's own value is the only value credited (SCAN-687); a missing task credits nothing.
  select coalesce(zaps_value, 0) into _task_zaps
    from public.crew_tasks
   where id = _task;
  if not found then
    return null;
  end if;

  -- Serialize concurrent completions of the same task by the same member for this txn.
  perform pg_advisory_xact_lock(hashtextextended(_profile::text || ':' || _task::text, 0));

  if not coalesce(_repeatable, false) then
    select id into _existing
      from public.crew_completions
     where task_id = _task and profile_id = _profile
     limit 1;
    if _existing is not null then
      return null; -- already completed; no second insert, so the trigger cannot double-credit
    end if;
  end if;

  insert into public.crew_completions (task_id, profile_id, zaps_earned, completed_at)
  values (_task, _profile, _task_zaps, now())
  returning id into _new_id;

  return _new_id;
end;
$$;

revoke all on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) from public;
revoke all on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) from anon;
revoke all on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) from authenticated;
grant execute on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) to service_role;
