-- =============================================================================
-- Spotlight Top Friends — the MySpace "Top 8" (BUILD-LIST: Spotlight, build first)
--
-- A member picks N friends (the "Top 8") to feature, ordered, in a grid on their
-- Spotlight. Reuses the existing `friendships` graph (no new social edges, no
-- moderation): a pick is only valid if the owner and the friend are ACCEPTED
-- friends, enforced in the server action (lib/spotlight/top-friends.ts) before any
-- write. This table stores only WHICH friends are featured and in WHAT order — the
-- displayed identity (name/handle/avatar) is read at render time from the friend's
-- own already-public profile fields, so nothing here is member-supplied display data
-- and nothing can be faked. Mirrors the `stats` block: the layout block carries only
-- its presence/position; the values live in a governed server-resolved source.
--
-- Storage choice: unlike the JSON blocks (profiles.meta.spotlight.layout), Top Friends
-- references OTHER profiles by FK, so it lives in a real table — that gives us referential
-- integrity (a removed friend / deleted profile cascades away) and a clean ordered set,
-- which a JSON blob cannot.
--
-- RLS idiom (ADR-208): profile-id ownership compares to get_my_profile_id() — NEVER
-- auth.uid() (profiles.id != the auth user id here). Staff read via get_my_web_role().
-- Public read is allowed because the Spotlight page is a PUBLIC mini-site (the same
-- reason its other blocks render to signed-out visitors); the row exposes only two
-- profile ids + an int position, never anything private.
-- =============================================================================

create table if not exists public.spotlight_top_friends (
  id                uuid primary key default gen_random_uuid(),
  -- The Spotlight owner who featured this friend (the row's owner for RLS).
  owner_profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- The featured friend. Cascades away if that profile is deleted, so a Top 8 can
  -- never point at a missing member.
  friend_profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Display order in the grid (0-based, ascending). The server action keeps it dense.
  position          int  not null default 0,
  created_at        timestamptz not null default now(),
  -- One slot per (owner, friend): a friend is featured at most once.
  unique (owner_profile_id, friend_profile_id),
  -- A member can't feature themselves.
  constraint spotlight_top_friends_not_self check (owner_profile_id <> friend_profile_id)
);

-- The hot read: an owner's ordered Top 8 (owner_profile_id + position) for the editor
-- and the public render.
create index if not exists spotlight_top_friends_owner_idx
  on public.spotlight_top_friends (owner_profile_id, position);
-- Reverse lookup (who features me / cascade housekeeping).
create index if not exists spotlight_top_friends_friend_idx
  on public.spotlight_top_friends (friend_profile_id);

alter table public.spotlight_top_friends enable row level security;

-- Public read: a Spotlight is a public mini-site, so its Top Friends are readable by
-- anyone (the row holds only two profile ids + a position). Consistent with how the
-- other Spotlight blocks reach signed-out visitors.
drop policy if exists spotlight_top_friends_read on public.spotlight_top_friends;
create policy spotlight_top_friends_read on public.spotlight_top_friends
  for select using (true);

-- Owner manages their own rows (the editor uses the session client; the server action
-- also re-checks friendship + ownership before any service-role write). Staff
-- (admin/janitor) may manage for moderation/support.
drop policy if exists spotlight_top_friends_insert on public.spotlight_top_friends;
create policy spotlight_top_friends_insert on public.spotlight_top_friends
  for insert with check (
    owner_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  );

drop policy if exists spotlight_top_friends_update on public.spotlight_top_friends;
create policy spotlight_top_friends_update on public.spotlight_top_friends
  for update using (
    owner_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  ) with check (
    owner_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  );

drop policy if exists spotlight_top_friends_delete on public.spotlight_top_friends;
create policy spotlight_top_friends_delete on public.spotlight_top_friends
  for delete using (
    owner_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  );

comment on table public.spotlight_top_friends is
  'Spotlight Top Friends (the "Top 8"): an ordered set of accepted friends a member features on their public Spotlight. Each pick is friendship-validated in the server action before write; displayed identity is read from the friend''s own public profile at render time. Public-read because the Spotlight page is a public mini-site.';
