-- =============================================================================
-- Events — post-event social loop (slice B-2, docs/EVENTS-SYSTEM.md §2.5)
--
-- Three additive tables that keep an event warm before it happens and alive
-- after it ends:
--   • event_posts   — short guest comments (+ optional image) on the event page.
--                     Live before the event (social proof) and after.
--   • event_media   — the recap album: attendees upload photos into a shared
--                     album shown on the event page once it's over.
--   • event_cohosts — a host can add/remove cohosts; cohosts are displayed.
--
-- RLS mirrors the established helper-function style (get_my_profile_id() /
-- get_my_circle_ids() / get_my_role(); NEVER raw auth.uid() in app-table
-- policies — see 20240101000001_rls_policies.sql). Reads ride on the same
-- "can you see the parent event?" rule the events SELECT policy already encodes;
-- writes are author-only (posts/media) or host-only (cohosts).
--
-- New tables aren't in lib/database.types.ts yet, so readers/writers use the
-- `as unknown as SupabaseClient` cast convention (same as event_ticket_types).
-- =============================================================================

-- ── Helper: is the caller a guest/host of this event? ────────────────────────
-- A "guest" = anyone holding an RSVP row (going / maybe / waitlist — any intent
-- to be there). The host is the event's host_id. SECURITY DEFINER so it can read
-- event_rsvps + events without recursing into their RLS; pinned search_path per
-- the repo convention. Used by the INSERT policies below so only people actually
-- attached to the event can post or add photos.
create or replace function public.is_my_event(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.host_id = get_my_profile_id()
  )
  or exists (
    select 1 from public.event_rsvps r
    where r.event_id = p_event_id
      and r.profile_id = get_my_profile_id()
      and r.status in ('going', 'maybe', 'waitlist')
  );
$$;

-- ── Helper: can the caller READ this event? ──────────────────────────────────
-- Mirrors the events "visibility-aware read" SELECT policy (20260612000000) so a
-- person who can see the event can also see its activity feed, recap album, and
-- cohosts. SECURITY DEFINER to read events/memberships without recursing.
create or replace function public.can_read_event(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (
        e.visibility = 'public'
        or e.visibility = 'unlisted'
        or e.host_id = get_my_profile_id()
        or (
          e.visibility = 'circle_only'
          and get_my_role() >= 'crew'::community_role
          and (
            (e.scope_type = 'circle' and e.scope_id = any (get_my_circle_ids()))
            or (e.scope_type = 'region' and e.scope_id = get_my_region_id())
          )
        )
      )
  );
$$;

-- ── Helper: is this profile a cohost of the event? ───────────────────────────
-- Used by the cohosts lib for later reuse (lib/events/cohosts.ts). SECURITY
-- DEFINER + pinned search_path; takes an explicit profile id (not the caller).
create or replace function public.is_event_cohost(p_event_id uuid, p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_cohosts c
    where c.event_id = p_event_id
      and c.profile_id = p_profile_id
  );
$$;

-- ── event_posts ──────────────────────────────────────────────────────────────
create table if not exists public.event_posts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '',
  image_url   text,
  created_at  timestamptz not null default now(),
  -- A post must carry something: words, an image, or both.
  constraint event_posts_not_empty check (length(trim(body)) > 0 or image_url is not null)
);

create index if not exists event_posts_event_idx
  on public.event_posts (event_id, created_at desc);
create index if not exists event_posts_profile_idx
  on public.event_posts (profile_id);

-- ── event_media ───────────────────────────────────────────────────────────────
create table if not exists public.event_media (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  image_url   text not null,
  caption     text,
  created_at  timestamptz not null default now()
);

create index if not exists event_media_event_idx
  on public.event_media (event_id, created_at desc);
create index if not exists event_media_profile_idx
  on public.event_media (profile_id);

-- ── event_cohosts ─────────────────────────────────────────────────────────────
create table if not exists public.event_cohosts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- A profile is a cohost of an event at most once.
  constraint event_cohosts_unique unique (event_id, profile_id)
);

create index if not exists event_cohosts_event_idx
  on public.event_cohosts (event_id);
create index if not exists event_cohosts_profile_idx
  on public.event_cohosts (profile_id);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.event_posts   enable row level security;
alter table public.event_media   enable row level security;
alter table public.event_cohosts enable row level security;

-- ── event_posts ──────────────────────────────────────────────────────────────
-- SELECT: anyone who can read the parent event.
-- INSERT: the author themselves, and only if they're a guest/host of the event.
-- DELETE: the author, or the event host (moderation of their own page).
drop policy if exists "event_posts: read if can see event"  on public.event_posts;
drop policy if exists "event_posts: author insert if on event" on public.event_posts;
drop policy if exists "event_posts: author or host delete"   on public.event_posts;

create policy "event_posts: read if can see event"
  on public.event_posts for select
  using (can_read_event(event_id));

create policy "event_posts: author insert if on event"
  on public.event_posts for insert
  with check (
    profile_id = get_my_profile_id()
    and is_my_event(event_id)
  );

create policy "event_posts: author or host delete"
  on public.event_posts for delete
  using (
    profile_id = get_my_profile_id()
    or event_id in (select id from public.events where host_id = get_my_profile_id())
  );

-- ── event_media ───────────────────────────────────────────────────────────────
-- Same shape as event_posts: read if you can see the event; the uploader inserts
-- their own rows and only when attached to the event; uploader or host deletes.
drop policy if exists "event_media: read if can see event"   on public.event_media;
drop policy if exists "event_media: author insert if on event" on public.event_media;
drop policy if exists "event_media: author or host delete"    on public.event_media;

create policy "event_media: read if can see event"
  on public.event_media for select
  using (can_read_event(event_id));

create policy "event_media: author insert if on event"
  on public.event_media for insert
  with check (
    profile_id = get_my_profile_id()
    and is_my_event(event_id)
  );

create policy "event_media: author or host delete"
  on public.event_media for delete
  using (
    profile_id = get_my_profile_id()
    or event_id in (select id from public.events where host_id = get_my_profile_id())
  );

-- ── event_cohosts ─────────────────────────────────────────────────────────────
-- SELECT: anyone who can read the parent event (cohosts are displayed).
-- INSERT/DELETE: the event host only.
drop policy if exists "event_cohosts: read if can see event" on public.event_cohosts;
drop policy if exists "event_cohosts: host insert"           on public.event_cohosts;
drop policy if exists "event_cohosts: host delete"           on public.event_cohosts;

create policy "event_cohosts: read if can see event"
  on public.event_cohosts for select
  using (can_read_event(event_id));

create policy "event_cohosts: host insert"
  on public.event_cohosts for insert
  with check (
    event_id in (select id from public.events where host_id = get_my_profile_id())
  );

create policy "event_cohosts: host delete"
  on public.event_cohosts for delete
  using (
    event_id in (select id from public.events where host_id = get_my_profile_id())
  );

-- ── Storage: recap-album bucket ───────────────────────────────────────────────
-- Public-read bucket for event activity images + recap photos, mirroring the
-- `posts` bucket (20240116000000_storage_posts). Files live at
-- {auth_user_id}/{...}, so owner-scoped writes key on auth.uid() exactly like
-- posts. Public read so <img src="...public-url..."> works without a session.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-media',
  'event-media',
  true,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "event-media: public read"  on storage.objects;
drop policy if exists "event-media: owner insert" on storage.objects;
drop policy if exists "event-media: owner update" on storage.objects;
drop policy if exists "event-media: owner delete" on storage.objects;

create policy "event-media: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'event-media');

create policy "event-media: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "event-media: owner update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-media' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'event-media' and split_part(name, '/', 1) = auth.uid()::text);

create policy "event-media: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-media' and split_part(name, '/', 1) = auth.uid()::text);
