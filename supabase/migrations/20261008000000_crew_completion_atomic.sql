-- P0 (final-scan patch list): close the crew-task completion double-award race.
--
-- crew_completions has NO uniqueness guard, and trg_after_crew_completion (AFTER INSERT)
-- credits current_season_zaps + advances current_season_rank on EVERY insert. Two concurrent
-- logCompletion calls for a NON-repeatable task both pass the app-side existence check, both
-- insert, and the trigger fires twice -> double Zaps + rank. (The client useTransition guard
-- only stops single-client double-clicks.) A plain unique index can't be used because
-- is_repeatable lives on crew_tasks, and repeatable tasks legitimately have many completions.
--
-- Fix: an advisory-lock atomic RPC (the C1-C5 pattern). It serializes completions of the same
-- (member, task), re-checks existence for non-repeatable tasks INSIDE the lock, and inserts at
-- most once — so the trigger fires exactly once. Repeatable tasks always insert. Returns the new
-- row id, or NULL when a non-repeatable task was already completed (caller then skips the reward
-- side effects). service_role only (every caller already uses the admin client).

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
begin
  if _profile is null or _task is null then
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
  values (_task, _profile, coalesce(_zaps, 0), now())
  returning id into _new_id;

  return _new_id;
end;
$$;

revoke all on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) from public;
revoke all on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) from anon;
revoke all on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) from authenticated;
grant execute on function public.log_crew_completion_atomic(uuid, uuid, integer, boolean) to service_role;
