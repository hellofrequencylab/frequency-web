-- The daily check-in guarded on the MEMBER'S day and paid on the UTC day, so one check-in in
-- every adjacent local-day pair was silently worth nothing.
--
-- Two halves of one feature disagreed about when "a day" starts:
--
--   app/(main)/checkin-actions.ts:15  "The 'day' is the member's LOCAL calendar day
--                                      (profiles.home_timezone …)"        -> the once-per-day GUARD
--   award_gems_atomic (this function) date_trunc('day', now() at tz 'UTC') -> the daily CAP
--
-- `daily_login` is configured gems_amount 2, daily_cap 1. So for any member west of UTC:
--
--   Mon 18:00 America/Los_Angeles = Tue 01:00 UTC
--     local day = Mon (new)  -> guard passes, stamp written
--     UTC day   = Tue        -> cap consumed for Tue, 2 Gems paid
--   Tue 09:00 America/Los_Angeles = Tue 16:00 UTC
--     local day = Tue (new)  -> guard passes, stamp written, streak increments
--     UTC day   = Tue STILL  -> cap already spent -> awarded:false -> 0 Gems, no toast
--
-- Evening-then-next-morning is an ordinary usage pattern, not an edge case, so this fired
-- routinely for every member in the Americas. It is SILENT in both directions: the member sees
-- their streak go up and simply is not paid, and `lifetime_gems` is under-credited with nothing
-- recording that it happened. The check-in path returns `{ gems: 0 }` and the UI shows no toast.
--
-- FIX: let the caller state which day it means. `_day_key` + `_timezone` are optional, so every
-- existing caller keeps the UTC window byte-for-byte; only a caller that already resolved a
-- member day passes it. The window is computed in Postgres rather than TypeScript because
-- `_day_key::date::timestamp at time zone _timezone` is the instant local midnight actually
-- occurred, which is DST-correct on the two days a year that TS date arithmetic gets wrong.
--
-- An invalid timezone raises rather than silently falling back, and the caller only ever passes a
-- zone it has already validated (resolveMemberDayAndZone reports the zone it USED, not the one
-- requested). A silent fallback here would recreate the same class of mismatch one layer down.

create or replace function public.award_gems_atomic(
  _profile uuid,
  _action text,
  _amount integer,
  _daily_cap integer,
  _metadata jsonb default '{}'::jsonb,
  _day_key text default null,
  _timezone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count     integer;
  v_day_start timestamptz;
  v_day_end   timestamptz;
begin
  if _amount is null or _amount <= 0 then
    return jsonb_build_object('awarded', false, 'capped', false);
  end if;

  -- The cap window. With a caller-supplied day, it is that member's local day; without one it is
  -- the UTC day, exactly as before.
  if _day_key is not null and _timezone is not null then
    v_day_start := (_day_key::date::timestamp at time zone _timezone);
    v_day_end   := ((_day_key::date + 1)::timestamp at time zone _timezone);
  else
    v_day_start := (date_trunc('day', (now() at time zone 'UTC')) at time zone 'UTC');
    v_day_end   := v_day_start + interval '1 day';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_profile::text || ':' || _action, 0));

  if _daily_cap is not null then
    -- Bounded at BOTH ends now. The old form was `created_at >= v_day_start` with no upper bound,
    -- which is equivalent for a window ending at now() but wrong for a local day that has not
    -- finished yet: a member east of UTC can be inside a local day whose end is still in the
    -- future, and an unbounded count would sweep in rows from beyond it.
    select count(*) into v_count
    from public.gem_transactions
    where profile_id = _profile
      and action_type = _action
      and created_at >= v_day_start
      and created_at <  v_day_end;

    if v_count >= _daily_cap then
      return jsonb_build_object('awarded', false, 'capped', true);
    end if;
  end if;

  insert into public.gem_transactions (profile_id, action_type, amount, metadata)
  values (_profile, _action, _amount, coalesce(_metadata, '{}'::jsonb));

  return jsonb_build_object('awarded', true, 'capped', false);
end;
$function$;
