-- Phase C4: close the challenge double-pay + streak lost-increment races with atomic RPCs.
--
-- advanceChallenges / recordStreakActivity (lib/achievements.ts) both did read -> compute ->
-- write in app code with no lock, so two gamification events firing near-simultaneously for the
-- same (member, challenge/streak) would:
--   * challenge: both read current=N, both write N+1 (lost increment => the challenge undercounts),
--     and both cross `newCurrent >= target` in the same instant => BOTH pay the purse (double-pay
--     of the Zap/Gem reward -- real currency).
--   * streak: both read the row and both fire a streak_update event; the insert path could also
--     collide on the UNIQUE(profile_id, streak_type) index and log an error.
--
-- Both RPCs serialize per (member, entity) with pg_advisory_xact_lock(hashtextextended(...)) and do
-- the read + increment + terminal transition in one statement, so the app never sees a torn state.
-- SECURITY DEFINER, pinned search_path, service_role only (mirrors award_gems_atomic /
-- reserve_ticket_atomic / claim_outbox_jobs).

-- ── advance_challenge_progress ────────────────────────────────────────────────────────────
-- Advance one member's progress on one challenge by a single step and report the transition.
-- Returns jsonb { current, completed, just_completed }:
--   * current        — the member's step count AFTER this advance (unchanged if already complete).
--   * completed       — is the challenge finished (current >= target)?
--   * just_completed  — did THIS call flip it from unfinished to finished? The caller pays the purse
--                       only on just_completed, so the reward lands exactly once (concurrent events
--                       serialize on the advisory lock: the first returns true, the rest false).
-- An already-completed challenge never advances or re-completes (mirrors the old
-- `if (progress?.completed_at) continue`).
create or replace function public.advance_challenge_progress(
  _profile   uuid,
  _challenge uuid,
  _target    integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current   integer;
  v_completed timestamptz;
  v_new       integer;
  v_done      boolean;
begin
  -- Serialize advances for this (member, challenge) so the read+increment+complete below is
  -- atomic: concurrent events can't both read N and both write N+1, nor both flip completed
  -- and double-pay the purse.
  perform pg_advisory_xact_lock(hashtextextended(_profile::text || ':' || _challenge::text, 0));

  select current, completed_at
    into v_current, v_completed
    from public.challenge_progress
   where profile_id = _profile and challenge_id = _challenge;

  -- Already finished: never advance or re-pay.
  if v_completed is not null then
    return jsonb_build_object('current', coalesce(v_current, 0), 'completed', true, 'just_completed', false);
  end if;

  v_new  := coalesce(v_current, 0) + 1;
  v_done := v_new >= greatest(coalesce(_target, 1), 1);

  insert into public.challenge_progress (profile_id, challenge_id, current, completed_at)
  values (_profile, _challenge, v_new, case when v_done then now() else null end)
  on conflict (profile_id, challenge_id)
  do update set current = excluded.current,
                completed_at = excluded.completed_at;

  -- Reached here only when NOT already complete, so a finish now is always a fresh transition.
  return jsonb_build_object('current', v_new, 'completed', v_done, 'just_completed', v_done);
end;
$$;

revoke all on function public.advance_challenge_progress(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.advance_challenge_progress(uuid, uuid, integer) to service_role;

-- ── record_streak_tick ────────────────────────────────────────────────────────────────────
-- Record one activity against a weekly streak and report the resulting counts.
-- Returns jsonb { current, longest, ticked }:
--   * ticked — did this activity move the streak (open it, extend it, or reset it)? false when the
--              member already ticked THIS week, so the caller fires the streak_update gamification
--              event only on a real tick (mirrors the old same-week no-op early return).
-- Semantics preserved from the prior JS (isSameWeek + window grace), now atomic:
--   * a streak ticks at most once per calendar week (Monday-start), evaluated in the HOME time zone
--     (America/Los_Angeles) so week boundaries match the product's home zone rather than the DB's
--     UTC session default (consistent with lib/time/zone.ts HOME_TZ);
--   * within _window_days of the last activity the streak extends, otherwise it resets to 1.
create or replace function public.record_streak_tick(
  _profile     uuid,
  _streak_type text,
  _window_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_current  integer;
  v_longest  integer;
  v_last     timestamptz;
  v_new      integer;
  v_longest2 integer;
  v_home     constant text := 'America/Los_Angeles';
begin
  -- Serialize ticks for this (member, streak) so the read+increment is atomic and the once-per-week
  -- dedup is evaluated exactly once (no double streak_update event, no insert-race error).
  perform pg_advisory_xact_lock(hashtextextended(_profile::text || ':' || _streak_type, 0));

  select id, current_count, longest_count, last_activity_at
    into v_id, v_current, v_longest, v_last
    from public.streaks
   where profile_id = _profile and streak_type = _streak_type::public.streak_type;

  -- First activity ever: open the streak at 1.
  if v_id is null then
    insert into public.streaks (profile_id, streak_type, current_count, longest_count, last_activity_at)
    values (_profile, _streak_type::public.streak_type, 1, 1, now())
    on conflict (profile_id, streak_type) do nothing;
    if found then
      return jsonb_build_object('current', 1, 'longest', 1, 'ticked', true);
    end if;
    -- Lost the insert race (another path opened it): re-read and treat as no-op this call.
    select current_count, longest_count into v_current, v_longest
      from public.streaks
     where profile_id = _profile and streak_type = _streak_type::public.streak_type;
    return jsonb_build_object('current', coalesce(v_current, 1), 'longest', coalesce(v_longest, 1), 'ticked', false);
  end if;

  -- Already ticked this (home-zone) week: no-op.
  if v_last is not null
     and date_trunc('week', v_last at time zone v_home) = date_trunc('week', now() at time zone v_home) then
    return jsonb_build_object('current', v_current, 'longest', v_longest, 'ticked', false);
  end if;

  -- Streak alive if within the grace window; otherwise it resets to 1.
  if v_last is not null and v_last > now() - (greatest(coalesce(_window_days, 9), 1) || ' days')::interval then
    v_new := v_current + 1;
  else
    v_new := 1;
  end if;
  v_longest2 := greatest(v_longest, v_new);

  update public.streaks
     set current_count    = v_new,
         longest_count     = v_longest2,
         last_activity_at  = now(),
         updated_at        = now()
   where id = v_id;

  return jsonb_build_object('current', v_new, 'longest', v_longest2, 'ticked', true);
end;
$$;

revoke all on function public.record_streak_tick(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.record_streak_tick(uuid, text, integer) to service_role;
