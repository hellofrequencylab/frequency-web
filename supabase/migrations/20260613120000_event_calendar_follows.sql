-- =============================================================================
-- Event calendar follows — subscribable ICS feeds (Events B-4: discovery polish)
--
-- WHY: members want their Frequency plans to land in Google/Apple Calendar and
-- stay current without re-downloading a one-off .ics each time. We give each
-- member ONE stable, unguessable token. The /events/calendar/[token] route
-- returns a live `text/calendar` feed (their upcoming "going" RSVPs) that the
-- calendar app re-polls on its own schedule.
--
-- The token is a bearer secret in a URL (calendar apps can't send auth headers),
-- so it is high-entropy and revocable: rotating the row's token instantly kills
-- every old subscription. RLS is own-only; the feed route itself reads via the
-- service-role admin client (RLS-exempt) after resolving the token, exactly like
-- the existing per-event .ics route.
--
-- Two read RPCs ship alongside, both SECURITY DEFINER + column-safe, mirroring
-- 20240211000000_public_discover_reads.sql:
--   • event_calendar_feed(token)      — the events behind one member's feed.
--   • public_organizer_events(handle) — a host's public/unlisted events for the
--                                       crawlable organizer profile. NEVER leaks
--                                       circle_only/private, never the venue.
-- =============================================================================

-- pgcrypto provides gen_random_bytes for the high-entropy token default. Supabase
-- installs extensions into the `extensions` schema; enable it idempotently and
-- reference the function schema-qualified so the table default resolves regardless
-- of search_path.
create extension if not exists pgcrypto with schema extensions;

-- ── 1. Token table (one per member) ──────────────────────────────────────────
create table if not exists public.event_calendar_follows (
  id         uuid        primary key default gen_random_uuid(),
  profile_id uuid        not null unique references public.profiles(id) on delete cascade,
  -- URL-safe high-entropy bearer token. 32 random bytes → 64 hex chars.
  token      text        not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

create index if not exists event_calendar_follows_token_idx
  on public.event_calendar_follows (token);

alter table public.event_calendar_follows enable row level security;

-- Own-only: a member may read/create/rotate their own feed token, nothing else.
-- The feed ROUTE resolves the token with the admin client (RLS-exempt), so these
-- policies only govern in-app management (the "Subscribe to calendar" affordance).
drop policy if exists "calendar follows: read own" on public.event_calendar_follows;
create policy "calendar follows: read own" on public.event_calendar_follows
  for select using (profile_id = get_my_profile_id());

drop policy if exists "calendar follows: insert own" on public.event_calendar_follows;
create policy "calendar follows: insert own" on public.event_calendar_follows
  for insert with check (profile_id = get_my_profile_id());

drop policy if exists "calendar follows: rotate own" on public.event_calendar_follows;
create policy "calendar follows: rotate own" on public.event_calendar_follows
  for update using (profile_id = get_my_profile_id())
  with check (profile_id = get_my_profile_id());

drop policy if exists "calendar follows: delete own" on public.event_calendar_follows;
create policy "calendar follows: delete own" on public.event_calendar_follows
  for delete using (profile_id = get_my_profile_id());

comment on table public.event_calendar_follows is
  'One stable, revocable ICS-feed token per member. The /events/calendar/[token] route returns their live upcoming RSVPs as text/calendar (Events B-4). RLS own-only; the feed route reads via service role after resolving the token.';

-- ── 2. ensure_calendar_token — get-or-create the caller's token ──────────────
-- SECURITY DEFINER so the insert-on-first-call works even before the member has a
-- row, without a round-trip race. Returns the (possibly freshly minted) token.
create or replace function public.ensure_calendar_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := get_my_profile_id();
  tok  text;
begin
  if me is null then
    return null;
  end if;
  insert into public.event_calendar_follows (profile_id)
  values (me)
  on conflict (profile_id) do nothing;
  select token into tok from public.event_calendar_follows where profile_id = me;
  return tok;
end;
$$;

grant execute on function public.ensure_calendar_token() to authenticated;

-- ── 3. event_calendar_feed — events behind one member's feed token ───────────
-- Resolves the token → that member's upcoming, non-cancelled "going" RSVPs.
-- Returns events.location HERE (unlike the public RPCs): this is the member's OWN
-- private feed, authenticated by their secret token, and they have already RSVP'd
-- so they are entitled to the venue. Past events are excluded (a live calendar of
-- what's next). Bounded window keeps the payload small.
create or replace function public.event_calendar_feed(_token text)
returns table (
  id           uuid,
  title        text,
  description  text,
  location     text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  slug         text,
  is_cancelled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled
  from   public.event_calendar_follows f
  join   public.event_rsvps r on r.profile_id = f.profile_id and r.status = 'going'
  join   public.events e       on e.id = r.event_id
  where  f.token = _token
    and  e.is_cancelled = false
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  200;
$$;

-- Token is the credential; the feed route calls this via the admin client. Grant
-- to anon too so a future direct call still works only with a valid secret token.
grant execute on function public.event_calendar_feed(text) to anon, authenticated;

comment on function public.event_calendar_feed(text) is
  'Upcoming going-RSVP events behind one member''s calendar token (Events B-4). Token is the credential; returns the venue because the holder RSVP''d. Never lists events the holder is not going to.';

-- ── 4. public_organizer_events — a host's crawlable event list ───────────────
-- The organizer profile (/discover/events/organizer/[handle]) lists a host's
-- upcoming + recent past events at one link (Partiful pattern). CRAWLABLE, so it
-- obeys the same redaction as every /discover read: city only (never the venue),
-- and only public/unlisted events (never circle_only/private). One call returns
-- both the host identity and their events; `is_past` lets the page split them.
create or replace function public.public_organizer_events(_handle text)
returns table (
  host_id           uuid,
  host_display_name text,
  host_handle       text,
  host_avatar_url   text,
  id                uuid,
  slug              text,
  title             text,
  description       text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  city              text,
  circle_id         uuid,
  circle_name       text,
  is_past           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.handle, p.avatar_url,
    e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
    c.city, c.id, c.name,
    (coalesce(e.ends_at, e.starts_at) < now()) as is_past
  from   public.profiles p
  left join public.events e
         on e.host_id = p.id
        and e.is_cancelled = false
        and e.visibility in ('public', 'unlisted')
        -- Keep the past tail finite; far-back events aren't worth crawling.
        and coalesce(e.ends_at, e.starts_at) >= now() - interval '180 days'
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  where  p.handle = _handle
  order by is_past asc, e.starts_at asc
  limit  100;
$$;

grant execute on function public.public_organizer_events(text) to anon, authenticated;

comment on function public.public_organizer_events(text) is
  'A host''s public/unlisted events (upcoming + recent past) for the crawlable organizer profile (Events B-4). City only, never the venue; never circle_only/private. One row per event, plus a host-only row when the host has no listable events.';

-- ── 5. public_organizer_handles — hosts with crawlable events (for the sitemap) ─
-- The sitemap enumerates one organizer URL per host who has at least one UPCOMING
-- public/unlisted event (the crawl-worthy state). Distinct handle + the soonest
-- start, so the sitemap can set a sensible lastModified. Same redaction contract:
-- never leaks circle_only/private (they simply don't qualify a host here).
create or replace function public.public_organizer_handles(_limit integer DEFAULT 500)
returns table (
  handle      text,
  next_starts timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.handle, min(e.starts_at) as next_starts
  from   public.events e
  join   public.profiles p on p.id = e.host_id
  where  e.is_cancelled = false
    and  e.visibility in ('public', 'unlisted')
    and  e.starts_at >= now()
    and  p.handle is not null
  group by p.handle
  order by next_starts asc
  limit  greatest(1, least(_limit, 1000));
$$;

grant execute on function public.public_organizer_handles(integer) to anon, authenticated;

comment on function public.public_organizer_handles(integer) is
  'Handles of hosts with at least one upcoming public/unlisted event, for the sitemap organizer URLs (Events B-4). Never enumerates hosts of circle_only/private-only events.';
