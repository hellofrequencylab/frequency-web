-- The two UNCREDENTIALED calendar feeds stop publishing the street for a hidden-address event
-- (SCAN-209, the application half).
--
-- 🔴 THE RULE ALREADY EXISTED AND SAID THIS WOULD HAPPEN. lib/events/guest-rsvp-email.ts's
-- `guestVisibleLocation` carries it, and its own comment is the finding:
--
--     "Calendar links go too, wholesale — an .ics carries the address in its own LOCATION field,
--      so redacting the visible line alone would leak it straight back."
--
-- The event page honours `hide_address`. The guest email honours it. The JSON-LD honours it (it is
-- city-level only by ADR-186). The calendar feeds did not: `public_calendar_feed` and
-- `space_public_calendar_feed` selected `e.location` — the host's free-text venue line — with no
-- reference to `hide_address` at all. Measured on production 2026-08-25: 18 published public events
-- have `hide_address = true`, every one of them carrying a street, and 9 of the 20 rows the master
-- public feed returns are among them. That feed needs no credential of any kind.
--
-- THE FIX IS IN THE FUNCTION, NOT IN THE ROUTE, deliberately. Three routes read these feeds today and
-- a fourth consumer is a matter of time; a redaction applied per-route is a rule that has to be
-- remembered, which is the thing that just failed. Returning an already-publishable `location` makes
-- it impossible to forget. The return signatures are unchanged, so `create or replace` is enough and
-- no caller needs editing.
--
-- ✅ event_calendar_feed(_token) IS DELIBERATELY LEFT ALONE, and this is the half worth reading. That
-- feed joins `event_rsvps r on r.status = 'going'` — every row in it is an event the subscriber is
-- ATTENDING, and the rule `guestVisibleLocation` implements hides the exact address "unless the
-- viewer is going". Redacting it would take the venue away from the one audience entitled to it, on
-- the day they need it, which is the over-correction this note exists to prevent. Its token is also
-- per-profile and revocable, so it is not an uncredentialed surface.
--
-- WHAT THE REDACTED FORM IS: the city line, matching `guestVisibleLocation` exactly — `city, region`
-- with the empty parts dropped, and NULL when neither is known (an .ics with no LOCATION is honest;
-- one with a street is not). It is not "Location shared with members", because a calendar entry is
-- read months later out of context and a city is the useful truth.
--
-- ROLLBACK: re-apply the previous bodies (they differ from these only in the `location` expression).

begin;

create or replace function public.public_calendar_feed()
returns table (
  id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, slug text, is_cancelled boolean, time_zone text,
  recurrence_type text, recurrence_until timestamptz, parent_event_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.title, e.description,
         -- SCAN-209: the venue line only when the host has not hidden the address.
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   public.events e
  left join public.spaces s
         on s.id = e.space_id
  where  coalesce(e.status, 'published') = 'published'
    and  e.is_cancelled = false
    and  e.visibility = 'public'
    and  (e.space_id is null or (s.visibility = 'network' and s.status = 'active'))
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  500;
$function$;

create or replace function public.space_public_calendar_feed(_space_id uuid)
returns table (
  id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, slug text, is_cancelled boolean, time_zone text,
  recurrence_type text, recurrence_until timestamptz, parent_event_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with target as (
    select s.id
    from   public.spaces s
    where  s.id = _space_id
      and  s.visibility = 'network'
      and  s.status = 'active'
  )
  select e.id, e.title, e.description,
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   target t
  join   public.events e
         on e.space_id = t.id
         or e.host_space_id = t.id
  left   join public.spaces home on home.id = e.space_id
  where  (e.space_id is null
          or e.space_id = t.id
          or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.removed_at is null
    and  e.is_demo = false
    and  e.starts_at >= now() - interval '1 day'

  union

  select e.id, e.title, e.description,
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   target t
  join   public.event_space_shares sh on sh.space_id = t.id
  join   public.events e on e.id = sh.event_id
  left   join public.spaces home on home.id = e.space_id
  where  sh.status = 'accepted'
    and  (e.space_id is null or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.removed_at is null
    and  e.is_demo = false
    and  e.starts_at >= now() - interval '1 day'

  order by starts_at asc
  limit  200;
$function$;

-- PROVE IT, ON REAL ROWS, BOTH WAYS. A redaction that also blanked the visible events would be a
-- regression rather than a fix, so both halves are asserted here rather than assumed.
do $$
declare v_leaked int; v_shown int;
begin
  select count(*) into v_leaked
    from public.public_calendar_feed() f
    join public.events e on e.id = f.id
   where e.hide_address and f.location is not null and f.location = e.location;
  if v_leaked > 0 then
    raise exception 'the public feed still publishes the venue for % hidden-address event(s)', v_leaked;
  end if;

  select count(*) into v_shown
    from public.public_calendar_feed() f
    join public.events e on e.id = f.id
   where not e.hide_address and e.location is not null and f.location = e.location;
  if v_shown = 0 then
    raise exception 'the public feed stopped publishing the venue for events that never hid it, aborting';
  end if;
end $$;

commit;
