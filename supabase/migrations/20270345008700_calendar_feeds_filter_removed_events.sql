-- The two calendar feed RPCs stop serving a removed event (SCAN-645, ADR-1536).
--
-- 🔴 THE HOLE. `public.events.removed_at` has existed since 20260613130000 and is enforced reader by
-- reader: eighteen SQL functions read `public.events`, and sixteen of them either filter the column
-- or are pinned to one row. The two that forgot are the two with a SUBSCRIBER on the other end:
--
--   · public_calendar_feed()        the site-wide public .ics feed (app/events/calendar.ics)
--   · event_calendar_feed(_token)   one member's personal feed of their own going RSVPs
--
-- An .ics feed is subscribed, not fetched. When an operator removes an upcoming public event the
-- page 404s, but the entry sits on every subscribed phone calendar until the feed stops sending it,
-- and these two feeds never stopped. Measured on production 2026-09-28: neither body mentions
-- `removed_at`; `space_public_calendar_feed` (20270126000000) does, and is the shape copied here.
--
-- ⚠️ WHY NOTHING HAS LEAKED YET, which is luck and not design. Production holds two removed events
-- and each escapes the public feed by failing a DIFFERENT predicate (one is cancelled and past, the
-- other is unlisted). A standalone public event removed the ordinary way is published, public,
-- future and not cancelled — every predicate the feed checks and the one it does not. `going`
-- RSVPs on removed events are 0 today, so the member half is latent too.
--
-- ✅ WHAT CHANGES. One clause, `and e.removed_at is null`, in each body. Nothing else moves: the
-- return types are unchanged (so `create or replace` is enough, no drop-and-recreate), the
-- hidden-address redaction from 20270331000000 is retyped verbatim, and the recurrence columns from
-- 20270345003200 stay projected.
--
-- 🔴 NO GRANT HERE, ON PURPOSE. Both functions are `internal` in scripts/function-grants.txt: their
-- only callers are the .ics routes on the service_role client, and 20270304000000 / 20270338000000
-- revoked browser execute. `create or replace` keeps a function's existing grants, and copying the
-- original grant lines forward is exactly the hazard 20270338000000 exists to record. Re-derived,
-- not copied: no grant statement belongs in this file.
--
-- ⚠️ NOT IN SCOPE, deliberately (the row says why): the two SELECT policies on `public.events` and
-- the ~50 TypeScript list reads that omit the column. The policies are the floor the reads sit on,
-- and a Space owner editing their own removed row has to keep working, so that is a wider change
-- with its own row. This closes the set of two readers with an outside subscriber.
--
-- ROLLBACK: drop the `removed_at` predicate from each body. Re-granting is not part of it.

begin;

create or replace function public.public_calendar_feed()
returns table (
  id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, slug text, is_cancelled boolean, time_zone text,
  recurrence_type text, recurrence_until timestamptz, recurrence_rule text, parent_event_id uuid
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
         e.recurrence_type, e.recurrence_until, e.recurrence_rule, e.parent_event_id
  from   public.events e
  left join public.spaces s
         on s.id = e.space_id
  where  coalesce(e.status, 'published') = 'published'
    and  e.is_cancelled = false
    and  e.visibility = 'public'
    -- SCAN-645: a staff-removed event is gone from the page and must be gone from the feed too,
    -- or it stays on every subscribed calendar until this predicate exists.
    and  e.removed_at is null
    and  (e.space_id is null or (s.visibility = 'network' and s.status = 'active'))
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  500;
$function$;

comment on function public.public_calendar_feed() is
  'Upcoming published public events for the site-wide subscribable .ics feed (Events EC1). Never lists draft, cancelled, non-public, or staff-removed events (removed_at, added SCAN-645), nor events whose home Space is not network+active. Carries recurrence columns so the .ics route collapses a series to one RRULE VEVENT (EC4, ADR-807). Service-role only (scripts/function-grants.txt: internal).';

create or replace function public.event_calendar_feed(_token text)
returns table (
  id           uuid,
  title        text,
  description  text,
  location     text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  slug         text,
  is_cancelled boolean,
  time_zone    text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone
  from   public.event_calendar_follows f
  -- `status = 'going'` alone stopped meaning "attending" the day approval gating shipped: a request
  -- is stored as going + pending. Both halves are required for the seat to be real, and it is that
  -- pair — not the status alone — that entitles the holder to the venue (ADR-1152).
  join   public.event_rsvps r on r.profile_id = f.profile_id
                             and r.status = 'going'
                             and r.approval_status is distinct from 'pending'
  join   public.events e       on e.id = r.event_id
  where  f.token = _token
    and  e.is_cancelled = false
    -- SCAN-645: a removed event keeps its RSVP rows, so the seat alone is not enough to list it.
    and  e.removed_at is null
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  200;
$$;

comment on function public.event_calendar_feed(text) is
  'Upcoming going-RSVP events behind one member''s calendar token (Events B-4; time_zone added EC1). Token is the credential; returns the venue because the holder RSVP''d AND was admitted. A request still awaiting the host is not listed (ADR-1152), and neither is a staff-removed event (SCAN-645). Never lists events the holder is not going to.';

-- PROVE IT BEHAVIOURALLY, BOTH WAYS. A grep for `removed_at` in a body is what the backlog probe
-- does, and a body can mention the column and still serve the row. So this drives each feed with a
-- real event: removed, it must be absent; restored, it must be back. Two halves, because a clause
-- that hides the removed row by hiding every row is a regression wearing the fix's name.
do $$
declare
  v_ev       uuid := gen_random_uuid();
  v_prof     uuid;
  v_tok      text := 'probe-' || replace(gen_random_uuid()::text, '-', '');
  v_rows     int;
  v_eligible boolean;
begin
  -- A standalone public event, published, future, not cancelled: every predicate the public feed
  -- checks. Removed first, so the negative half is asserted before anything else.
  insert into public.events (id, title, slug, scope_id, scope_type, visibility, status, starts_at,
                             removed_at, removed_reason)
  values (v_ev, 'feed probe', 'feed-probe-' || replace(v_ev::text, '-', ''),
          gen_random_uuid(), 'public', 'public', 'published', now() + interval '30 days',
          now(), 'SCAN-645 probe');

  -- NEGATIVE, unconditional: a removed event is served to nobody.
  select count(*) into v_rows from public.public_calendar_feed() where id = v_ev;
  if v_rows <> 0 then
    raise exception 'public_calendar_feed still serves a REMOVED event, so it stays on every subscribed calendar';
  end if;

  -- POSITIVE, conditional on the Space gate: `events_default_space_id` may stamp a home Space on an
  -- insert that omits one, and the feed hides events whose home Space is not network+active. On a
  -- fresh database that Space may not qualify, and "there is nothing to see" is not "it is broken"
  -- (the lesson 20270331000000 learned the hard way). So the positive half asks the feed's OWN
  -- Space predicate first, and only then insists the restored row is back.
  update public.events set removed_at = null, removed_reason = null where id = v_ev;

  select (e.space_id is null or (s.visibility = 'network' and s.status = 'active'))
    into v_eligible
    from public.events e
    left join public.spaces s on s.id = e.space_id
   where e.id = v_ev;

  select count(*) into v_rows from public.public_calendar_feed() where id = v_ev;
  if v_eligible and v_rows <> 1 then
    raise exception 'public_calendar_feed stopped serving a LIVE public event - this took too much';
  end if;

  -- The member feed, in 20270337000000's shape: it needs a real profile, and a fresh database may
  -- hold none, in which case this half says so and stops rather than passing vacuously.
  -- ⚠️ A profile WITHOUT a calendar follow: `event_calendar_follows` is unique per profile, so
  -- borrowing the first profile aborts on production the moment that member has subscribed. The
  -- 2026-09-28 dry run found exactly that, and a member's real token is not this probe's to use.
  select p.id into v_prof
    from public.profiles p
   where not exists (select 1 from public.event_calendar_follows f where f.profile_id = p.id)
   limit 1;
  if v_prof is null then
    raise notice 'no profile without a calendar follow to probe with; skipping the member-feed half';
  else
    insert into public.event_calendar_follows (profile_id, token) values (v_prof, v_tok);
    insert into public.event_rsvps (event_id, profile_id, status, approval_status)
    values (v_ev, v_prof, 'going', 'approved');

    -- The seat is real and the event is live: listed.
    select count(*) into v_rows from public.event_calendar_feed(v_tok) where id = v_ev;
    if v_rows <> 1 then
      raise exception 'event_calendar_feed stopped listing a LIVE event the holder is going to - this took too much';
    end if;

    -- Removed: the seat still exists, and the entry must go anyway.
    update public.events set removed_at = now(), removed_reason = 'SCAN-645 probe' where id = v_ev;
    select count(*) into v_rows from public.event_calendar_feed(v_tok) where id = v_ev;
    if v_rows <> 0 then
      raise exception 'event_calendar_feed still lists a REMOVED event on the strength of its RSVP';
    end if;

    delete from public.event_rsvps where event_id = v_ev;
    delete from public.event_calendar_follows where token = v_tok;
  end if;

  delete from public.events where id = v_ev;
end $$;

commit;
