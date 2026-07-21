-- =============================================================================
-- Calendar feeds: timezone-correct member feed + a public per-space feed (Events EC1, ADR-800)
--
-- WHY:
--  1) event_calendar_feed(token) returned starts_at/ends_at (wall-clock-as-UTC-parts) but NOT the
--     event's zone, so the /events/calendar/[token] route stamped them raw and every subscribed event
--     landed 7-8h off. The per-event .ics route already resolves the true instant through the zone;
--     the feed could not because the RPC never selected time_zone. Add it. The route now routes both
--     feeds through lib/events/ics.ts icsEventInstants (the one timezone seam).
--  2) A space wants a PUBLIC, subscribable calendar of its own events that any guest can add to their
--     calendar app (Events EC1). space_public_calendar_feed(_space_id) returns a space's upcoming,
--     published, public/unlisted, non-cancelled events + their zone. Mirrors the per-event .ics
--     public contract: public/unlisted only (never circle_only/private/draft), and the venue is
--     included exactly as the public event page + per-event .ics already expose it for public events.
--
-- Both are SECURITY DEFINER + column-safe, granted to anon (calendar apps send no auth header). The
-- per-space feed is keyed by space_id; the route resolves slug -> id and gates on the space being
-- network-visible + active before calling this, so a private/suspended space has no public feed.
-- =============================================================================

-- ── 1. event_calendar_feed — now also returns the event's zone ───────────────
-- Recreate with time_zone appended. CREATE OR REPLACE cannot change a function's OUT columns, so drop
-- first (the grant is re-applied below). Same body as 20260613120000 + e.time_zone.
drop function if exists public.event_calendar_feed(text);

create function public.event_calendar_feed(_token text)
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
  join   public.event_rsvps r on r.profile_id = f.profile_id and r.status = 'going'
  join   public.events e       on e.id = r.event_id
  where  f.token = _token
    and  e.is_cancelled = false
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  200;
$$;

grant execute on function public.event_calendar_feed(text) to anon, authenticated;

comment on function public.event_calendar_feed(text) is
  'Upcoming going-RSVP events behind one member''s calendar token (Events B-4; time_zone added EC1). Token is the credential; returns the venue because the holder RSVP''d. Never lists events the holder is not going to.';

-- ── 2. space_public_calendar_feed — a space's public upcoming events ─────────
-- The public, subscribable per-space calendar (Events EC1). Same redaction contract as the per-event
-- public .ics: only published, public/unlisted, non-cancelled events; the venue is included (it is a
-- PUBLIC event, already shown on the public event page).
--
-- SECURITY: this is SECURITY DEFINER and granted to anon (calendar apps send no auth header), so it is
-- reachable DIRECTLY via PostgREST with the public anon key, bypassing both the route's gate and the
-- events_space_visible RESTRICTIVE RLS (20260711090000). The space visibility/status gate therefore
-- lives INSIDE the function (the join below), NOT only in the route — a direct call for a private,
-- suspended, or archived space returns zero rows. The route re-checks the same thing for a clean 404 +
-- the calendar title, but the model is the authority. Keyed by space_id (a non-secret uuid), unlike
-- event_calendar_feed whose DEFINER bypass is safe because its key is an unguessable secret token.
create or replace function public.space_public_calendar_feed(_space_id uuid)
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
  from   public.events e
  -- Gate on the OWNING SPACE inside the function: a walled-off (private) or non-active space has no
  -- public feed even on a direct anon RPC call. This is the isolation contract, co-located with the data.
  join   public.spaces s
         on s.id = e.space_id
        and s.visibility = 'network'
        and s.status = 'active'
  where  e.space_id = _space_id
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  200;
$$;

grant execute on function public.space_public_calendar_feed(uuid) to anon, authenticated;

comment on function public.space_public_calendar_feed(uuid) is
  'A space''s upcoming published public/unlisted events for its public subscribable .ics feed (Events EC1, ADR-800). Never lists circle_only/private/draft/cancelled, and never any events of a non-network or non-active space (gated in-function, not just in the route). anon-callable; the space_id key is non-secret so the visibility gate is enforced here.';
