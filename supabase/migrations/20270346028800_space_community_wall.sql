-- THE SPACE COMMUNITY WALL: DATA, ADDITIVE HALF (ADR-1938, LIVE-2076).
--
-- Owner, 2026-11-03: a Space no longer has a built-in Circle. It gets a Community page that works like
-- a wall, the public communications hub for the Space, and it can start topic Circles that are listed
-- on it. Rulings: wall posts are scoped to the Space itself (no hidden circle); the owner chooses who
-- may READ the wall (anyone, or members only); the Space team and members post; the owner chooses
-- whether followers may reply and react.
--
-- WHAT THIS FILE DOES (additive and idempotent; nothing is dropped, moved or rewritten):
--   1. posts.scope_space_id: the typed scope arc (H1-1, 20260829000000) gets its fourth target. A wall
--      post sets scope_id AND scope_space_id to the Space id explicitly. sync_post_scope_arc does NOT
--      derive it from scope_id (existing space_update posts already use scope_id = Space id and must
--      keep the old arms); it only keeps the arc in step on re-scope and fills scope_id from the arc. ON DELETE CASCADE: a
--      deleted Space takes its wall with it, as it already takes its Circles.
--   2. space_wall_settings: one row per Space, only when the owner changes a default. No row means the
--      defaults: anyone reads, members post, followers may not interact.
--   3. Three SECURITY DEFINER booleans in `private` (the 42P17 recursion rule,
--      scripts/check-rls-recursion.mjs): can_read_space_wall, can_post_space_wall, can_moderate_space_wall.
--   4. posts policies learn the space scope. Every existing arm is kept verbatim and is now confined to
--      posts with NO space scope (scope_space_id is null), so a post stamped with a Space id can never
--      ride the public or member arms and bypass the wall rules. Space posts are always `cluster`.
--   5. Roster carry-over: everyone on a Space Circle roster who is not already staff, the owner or a
--      follower becomes a follower of the Space. Opt-outs are honoured by construction: a person who
--      left has no roster row. Space members (space_memberships) are already members of the wall.
--
-- WHAT IT DOES NOT DO (later waves): move the Space Circle's own posts (production has none today,
-- measured 2026-11-03: 0 posts, 0 replies, 38 roster rows, 0 opt-outs), archive any Circle, stop
-- creating one per Space, touch scoped_feed_for_viewer (it matches circles only, so space posts are
-- simply not in it), or drop is_space_primary. Those are LIVE-2080 and LIVE-2081.
--
-- Rollback: drop the three posts policies this file recreates and restore them from
-- 20270345007700 and the live bodies (read) and 20270317000000 (insert, update, delete); drop
-- function private.can_read_space_wall, can_post_space_wall, can_moderate_space_wall; drop table
-- public.space_wall_settings; restore sync_post_scope_arc from 20260829000000; alter table posts drop
-- column scope_space_id. The follower rows are ordinary rows and may be left.

-- ── 1. The typed scope column ────────────────────────────────────────────────────────────────────
alter table public.posts
  add column if not exists scope_space_id uuid references public.spaces(id) on delete cascade;

comment on column public.posts.scope_space_id is
  'Typed scope arc (ADR-1938): set when the post lives on a Space''s Community wall. Set explicitly with scope_id by the wall writer (never derived). Space posts are always visibility cluster; reads and writes go through private.can_read_space_wall / can_post_space_wall.';

create index if not exists posts_scope_space_created_idx
  on public.posts (scope_space_id, created_at desc) where scope_space_id is not null;

create or replace function public.sync_post_scope_arc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scope_id is null then
    new.scope_id := coalesce(new.scope_circle_id, new.scope_event_id, new.scope_profile_id, new.scope_space_id);
  end if;

  if tg_op = 'UPDATE' and new.scope_id is distinct from old.scope_id then
    new.scope_circle_id := null;
    new.scope_event_id := null;
    new.scope_profile_id := null;
    new.scope_space_id := null;
  end if;

  if new.scope_id is not null
     and new.scope_circle_id is null and new.scope_event_id is null
     and new.scope_profile_id is null and new.scope_space_id is null then
    if exists (select 1 from public.circles c where c.id = new.scope_id) then
      new.scope_circle_id := new.scope_id;
    elsif exists (select 1 from public.events e where e.id = new.scope_id) then
      new.scope_event_id := new.scope_id;
    elsif exists (select 1 from public.profiles p where p.id = new.scope_id) then
      new.scope_profile_id := new.scope_id;
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.sync_post_scope_arc() from public, anon, authenticated;

-- ── 2. The owner's choices ───────────────────────────────────────────────────────────────────────
create table if not exists public.space_wall_settings (
  space_id           uuid primary key references public.spaces(id) on delete cascade,
  read_access        text not null default 'anyone' check (read_access in ('anyone', 'members')),
  post_access        text not null default 'members' check (post_access in ('team', 'members')),
  followers_interact boolean not null default false,
  updated_at         timestamptz not null default now()
);

comment on table public.space_wall_settings is
  'The Space owner''s Community wall choices (ADR-1938). No row = defaults: anyone reads, members post, followers may not reply or react. Written by server actions on the service role; readable by anyone because the wall page needs them to render.';

alter table public.space_wall_settings enable row level security;

drop policy if exists "space_wall_settings: read" on public.space_wall_settings;
create policy "space_wall_settings: read"
  on public.space_wall_settings for select
  using (true);

revoke insert, update, delete on public.space_wall_settings from anon, authenticated;

-- ── 3. The three questions the policies ask ──────────────────────────────────────────────────────
-- Booleans about the caller's own standing, never ids, so nothing leaks beyond what the caller
-- already is. A root (personal) Space never has a wall; a non-active Space has none.

create or replace function private.can_read_space_wall(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.spaces s
    left join public.space_wall_settings w on w.space_id = s.id
    where s.id = p_space_id
      and s.type <> 'root'
      and s.status = 'active'
      and (
        private.is_space_member(s.id)
        or (
          coalesce(w.read_access, 'anyone') = 'anyone'
          and s.visibility is distinct from 'private'
        )
        or exists (
          select 1 from public.space_memberships sm
          where sm.space_id = s.id
            and sm.member_profile_id = private.get_my_profile_id()
            and sm.status = 'active'
        )
      )
  );
$$;

create or replace function private.can_post_space_wall(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.spaces s
    left join public.space_wall_settings w on w.space_id = s.id
    where s.id = p_space_id
      and s.type <> 'root'
      and s.status = 'active'
      and private.get_my_profile_id() is not null
      and (
        private.is_space_member(s.id)
        or (
          coalesce(w.post_access, 'members') = 'members'
          and exists (
            select 1 from public.space_memberships sm
            where sm.space_id = s.id
              and sm.member_profile_id = private.get_my_profile_id()
              and sm.status = 'active'
          )
        )
        or (
          coalesce(w.followers_interact, false)
          and exists (
            select 1 from public.space_follows f
            where f.space_id = s.id and f.follower_profile_id = private.get_my_profile_id()
          )
        )
      )
  );
$$;

-- The team that may hide, pin and remove other people's wall posts: the owner and the moderator and
-- admin rungs of the staff ladder. A viewer or editor rung does not moderate.
create or replace function private.can_moderate_space_wall(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.owner_profile_id = private.get_my_profile_id()
  ) or exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id
      and m.profile_id = private.get_my_profile_id()
      and m.status = 'active'
      and m.role in ('moderator', 'admin')
  );
$$;

revoke all on function private.can_read_space_wall(uuid) from public, anon, authenticated;
revoke all on function private.can_post_space_wall(uuid) from public, anon, authenticated;
revoke all on function private.can_moderate_space_wall(uuid) from public, anon, authenticated;
grant execute on function private.can_read_space_wall(uuid) to authenticated, anon;
grant execute on function private.can_post_space_wall(uuid) to authenticated;
grant execute on function private.can_moderate_space_wall(uuid) to authenticated;

-- ── 4. posts policies ────────────────────────────────────────────────────────────────────────────
-- READ: the live body (verified against pg_policy on production, 2026-11-03) with every arm confined
-- to posts that have no space scope, plus one arm for the wall.
drop policy if exists "posts: read by visibility (crew+ or public)" on public.posts;
create policy "posts: read by visibility (crew+ or public)"
  on public.posts for select
  using (
    (
      scope_space_id is null
      and (
        ((private.get_my_role() >= 'member'::community_role) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = private.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (private.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (private.get_my_circle_ids())) or (exists ( select 1 from circles c where ((c.id = posts.scope_id) and (((c.hub_id is not null) and (c.hub_id = any (private.get_my_hub_ids()))) or ((c.hub_id is null) and ((c.topical_channel_id = any (private.get_my_tuned_channel_ids())) or (exists ( select 1 from circle_channels cc where ((cc.circle_id = c.id) and (cc.topical_channel_id = any (private.get_my_tuned_channel_ids()))))))))))) or private.is_member_of_circle_space(scope_id)))))
        or (((select auth.uid()) is null) and (visibility = 'public'::post_visibility) and (parent_id is null))
      )
    )
    or (
      scope_space_id is not null
      and visibility = 'cluster'::post_visibility
      and private.can_read_space_wall(scope_space_id)
    )
  );

comment on policy "posts: read by visibility (crew+ or public)" on public.posts is
  'Posts with no space scope: the existing visibility rules, unchanged. Posts on a Space wall (scope_space_id, always cluster): whoever private.can_read_space_wall admits, signed in or not (ADR-1938).';

-- INSERT: a wall post needs private.can_post_space_wall and visibility cluster; every other insert is
-- the live body, confined to posts with no space scope so a public post cannot name a Space as its
-- scope and bypass the wall rules.
drop policy if exists "posts: insert (crew+ in scope)" on public.posts;
create policy "posts: insert (crew+ in scope)"
  on public.posts for insert
  with check (
    (
      scope_space_id is null
      and (private.get_my_role() >= 'member'::community_role) and (author_id = private.get_my_profile_id()) and (post_type = any (array['feed'::post_type, 'note'::post_type])) and (parent_id is null) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = private.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (private.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (private.get_my_circle_ids())) or (exists (select 1 from circles c where ((c.id = posts.scope_id) and (c.host_id = private.get_my_profile_id())))))))
    )
    or (
      scope_space_id is not null
      and (private.get_my_role() >= 'member'::community_role)
      and author_id = private.get_my_profile_id()
      and post_type = any (array['feed'::post_type, 'note'::post_type])
      and parent_id is null
      and visibility = 'cluster'::post_visibility
      and private.can_post_space_wall(scope_space_id)
    )
  );

-- UPDATE and DELETE: the live bodies plus one arm: the Space's moderators may pin, hide and remove
-- posts on their own wall.
drop policy if exists "posts: author update or host pins in circle" on public.posts;
create policy "posts: author update or host pins in circle"
  on public.posts for update
  using (
    (author_id = private.get_my_profile_id())
    or (private.get_my_web_role() = 'moderator'::text)
    or ((private.get_my_role() >= 'host'::community_role) and (scope_id in (select circles.id from circles where (circles.host_id = private.get_my_profile_id()))))
    or (scope_space_id is not null and private.can_moderate_space_wall(scope_space_id))
  );

drop policy if exists "posts: author delete or host removes in circle" on public.posts;
create policy "posts: author delete or host removes in circle"
  on public.posts for delete
  using (
    (author_id = private.get_my_profile_id())
    or (private.get_my_web_role() = 'moderator'::text)
    or ((private.get_my_role() >= 'host'::community_role) and (scope_id in (select circles.id from circles where (circles.host_id = private.get_my_profile_id()))))
    or (scope_space_id is not null and private.can_moderate_space_wall(scope_space_id))
  );

-- ── 5. Roster carry-over ─────────────────────────────────────────────────────────────────────────
-- Everyone on a Space Circle roster who is not the owner, not staff and not already a follower
-- becomes a follower of the Space. Idempotent: the NOT EXISTS makes a re-run a no-op.
insert into public.space_follows (space_id, follower_profile_id)
select distinct c.space_id, m.profile_id
from public.memberships m
join public.circles c on c.id = m.circle_id and c.is_space_primary
join public.spaces s on s.id = c.space_id and s.type <> 'root'
where m.profile_id is distinct from s.owner_profile_id
  and not exists (select 1 from public.space_members sm where sm.space_id = c.space_id and sm.profile_id = m.profile_id and sm.status = 'active')
  and not exists (select 1 from public.space_follows f where f.space_id = c.space_id and f.follower_profile_id = m.profile_id);
