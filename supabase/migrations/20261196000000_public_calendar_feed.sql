-- =============================================================================
-- The MASTER Frequency calendar feed (Events EC3, ADR-800/ADR-802)
--
-- WHY: EC1 gave every space its own subscribable .ics (space_public_calendar_feed). EC3 adds ONE
-- discovery calendar over ALL public events across the network — the "everything happening near you"
-- feed a guest can subscribe to and the /events/calendar grid renders.
--
-- public_calendar_feed() is space_public_calendar_feed with NO _space_id filter and a STRICTER
-- visibility gate: PUBLIC ONLY (never 'unlisted'). Unlisted means "reachable by link, not surfaced in
-- discovery"; the master feed IS discovery, so an unlisted event must not appear here even though it
-- correctly appears in its own space's feed. Same non-cancelled / published / upcoming filters + the
-- owning-space network+active gate as EC1.
--
-- SECURITY POSTURE (identical to space_public_calendar_feed, 20261193000000): this is SECURITY DEFINER
-- and granted to anon (calendar apps send no auth header), so it is reachable DIRECTLY via PostgREST
-- with the public anon key, bypassing RLS. Because there is no secret credential here at all (the feed
-- takes no arguments), the redaction contract MUST live entirely INSIDE the function: it selects only
-- published, PUBLIC, non-cancelled, upcoming events, and only for network-visible active spaces. A
-- draft / private / circle_only / unlisted event, or an event of a non-network / non-active space,
-- never leaves this function. There is no route-level gate to lean on — the model is the sole authority.
--
-- LEFT JOIN spaces (unlike EC1's inner join): a platform-level event with space_id IS NULL is a valid
-- public event and belongs on the master calendar, so it must survive the join. When space_id IS set,
-- the space is gated on visibility='network' AND status='active' (a walled-off space's events never
-- surface in discovery). Bounded to 500 (the master feed spans the whole network, not one space).
--
-- Reversible: drop function public.public_calendar_feed().
-- =============================================================================

create or replace function public.public_calendar_feed()
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
  -- LEFT JOIN so a platform event (space_id IS NULL) survives; when a space owns the event, gate it on
  -- network-visible + active in the WHERE below (a walled-off space has no place in discovery).
  left join public.spaces s
         on s.id = e.space_id
  where  coalesce(e.status, 'published') = 'published'
    and  e.is_cancelled = false
    -- PUBLIC ONLY — the master feed is discovery, so 'unlisted' is excluded here (it is link-only, and
    -- still surfaces in its OWN space's feed). Never circle_only/private/draft.
    and  e.visibility = 'public'
    and  (e.space_id is null or (s.visibility = 'network' and s.status = 'active'))
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  500;
$$;

grant execute on function public.public_calendar_feed() to anon, authenticated;

comment on function public.public_calendar_feed() is
  'The master Frequency calendar: ALL upcoming published PUBLIC (never unlisted) non-cancelled events across the network, for the /events/calendar grid + master .ics (Events EC3, ADR-800). Platform events (space_id null) included; a space''s events only when it is network-visible + active. anon-callable, self-gated in-function (no credential, so the redaction contract lives entirely here).';
