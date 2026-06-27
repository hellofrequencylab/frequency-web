-- =============================================================================
-- Reclassify "Daily Walk" + "Morning Movement" as TIMED movement practices
-- (practice-timer wiring).
--
-- WHY: the timer is now REQUIRED to log anything with a set duration (the server
-- refuses a one-tap log of a uses_timer practice). The owner wants "Daily Walk" to
-- require the timer, but in the live data it can still carry timer_kind = 'none'
-- (uses_timer = false), so a member could one-tap it. Route both walking practices to
-- the Movement timer in Walk mode, with a sensible authored length so the timer can
-- seed and the completion economy has a target to measure against:
--   • daily-walk        → 20 min walk
--   • morning-movement  → 10 min walk
--
-- Matched by SLUG (the title-derived canonical key). Every update is GUARDED so a
-- re-apply is a clean no-op and a missing slug is simply skipped. The duration is only
-- set when the practice does not already carry a positive one (we never stomp an
-- author-tuned length). timer_kind / movement_config / mindless_mode / duration_min are
-- reached on public.practices directly (SQL, not the typed client), so no untyped-cast
-- concern applies in-migration.
--
-- uses_timer is a GENERATED column (timer_kind <> 'none'), so setting timer_kind here
-- flips uses_timer to true automatically — that is the gate the server reads.
-- =============================================================================

-- Daily Walk → the Movement timer (Walk), 20 minutes if no length is set yet.
update public.practices
  set timer_kind = 'movement'::public.practice_timer_kind,
      movement_config = jsonb_build_object('mode', 'walk'),
      mindless_mode = null,
      duration_min = coalesce(nullif(duration_min, 0), 20)
  where slug = 'daily-walk'
    and (timer_kind is distinct from 'movement'::public.practice_timer_kind
         or movement_config is distinct from jsonb_build_object('mode', 'walk')
         or mindless_mode is not null
         or duration_min is null
         or duration_min = 0);

-- Morning Movement → the Movement timer (Walk), 10 minutes if no length is set yet.
update public.practices
  set timer_kind = 'movement'::public.practice_timer_kind,
      movement_config = jsonb_build_object('mode', 'walk'),
      mindless_mode = null,
      duration_min = coalesce(nullif(duration_min, 0), 10)
  where slug = 'morning-movement'
    and (timer_kind is distinct from 'movement'::public.practice_timer_kind
         or movement_config is distinct from jsonb_build_object('mode', 'walk')
         or mindless_mode is not null
         or duration_min is null
         or duration_min = 0);
