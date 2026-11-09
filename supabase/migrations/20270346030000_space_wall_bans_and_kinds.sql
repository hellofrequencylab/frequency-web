-- COMMUNITY WALL POLISH (LIVE-2095, ADR-1938): bans and post kinds.
--
-- 1. public.space_wall_bans: a person the Space team has put out of the wall. A banned person keeps
--    whatever membership they paid for; they only lose the wall. The team (owner, moderator, admin)
--    reads the list; every write comes from server code on the service role after the same gate.
-- 2. private.can_post_space_wall refuses a banned person before any other rule is read, and
--    private.can_react_on_post refuses a banned person's reaction on that wall's posts (the reactions
--    INSERT policy calls it), so the ban holds against a direct REST call, not only in app code.
-- 3. The posts INSERT wall arm admits Poll and Ask alongside a plain post, and Announce ONLY for the
--    Space team (private.is_space_member). The feed RPC (space_wall_feed) reads post_type already,
--    so a poll or an announcement renders with no RPC change.
--
-- Rollback:
--   drop table if exists public.space_wall_bans;
--   drop function if exists private.can_react_on_post(uuid); drop function if exists private.is_banned_from_wall(uuid);
--   re-create private.can_post_space_wall and the posts INSERT policy from 20270346028800, and the
--   post_reactions INSERT policy "post_reactions: insert own (crew+)" from 20240104000000.

-- ── 1. bans ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.space_wall_bans (
  space_id    uuid not null references public.spaces (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  banned_by   uuid references public.profiles (id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (space_id, profile_id)
);

comment on table public.space_wall_bans is
  'People a Space team has put out of the community wall (LIVE-2095). A ban blocks posting, replying and reacting on that one wall; it does not touch the person''s membership.';

alter table public.space_wall_bans enable row level security;

drop policy if exists "space_wall_bans: team reads" on public.space_wall_bans;
create policy "space_wall_bans: team reads"
  on public.space_wall_bans for select
  using (private.can_moderate_space_wall(space_id));

-- No insert / update / delete policies: anon and authenticated cannot write. Server code on the
-- service role writes after checking the same moderation gate (lib/spaces/community-wall.ts).
-- Supabase's default privileges hand every new table to anon and authenticated in full (ADR-959),
-- so both are revoked and authenticated gets SELECT back, nothing else.
revoke all on public.space_wall_bans from anon, authenticated;
grant select on public.space_wall_bans to authenticated;

create index if not exists space_wall_bans_profile_idx on public.space_wall_bans (profile_id);
create index if not exists space_wall_bans_banned_by_idx on public.space_wall_bans (banned_by) where banned_by is not null;

-- ── 2. a banned person may not post, nor react ──────────────────────────────────────────────────
create or replace function private.is_banned_from_wall(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1 from public.space_wall_bans b
    where b.space_id = p_space_id and b.profile_id = private.get_my_profile_id()
  );
$$;

revoke all on function private.is_banned_from_wall(uuid) from public, anon, authenticated;
grant execute on function private.is_banned_from_wall(uuid) to authenticated;

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
      and not private.is_banned_from_wall(s.id)
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

revoke all on function private.can_post_space_wall(uuid) from public, anon, authenticated;
grant execute on function private.can_post_space_wall(uuid) to authenticated;

-- A reaction on a wall post: refused for a banned person. A post off any wall (scope_space_id null)
-- keeps its existing rules untouched. SECURITY DEFINER so the posts read inside is not an RLS edge.
create or replace function private.can_react_on_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select not exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.scope_space_id is not null
      and private.is_banned_from_wall(p.scope_space_id)
  );
$$;

revoke all on function private.can_react_on_post(uuid) from public, anon, authenticated;
grant execute on function private.can_react_on_post(uuid) to authenticated;

-- The live INSERT body from 20240104000000 (role and own profile), plus the wall ban gate.
drop policy if exists "post_reactions: insert own (crew+)" on public.post_reactions;
create policy "post_reactions: insert own (crew+)"
  on public.post_reactions for insert
  with check (
    (private.get_my_role() >= 'member'::community_role)
    and (profile_id in (select profiles.id from profiles where profiles.auth_user_id = (select auth.uid() as uid)))
    and private.can_react_on_post(post_id)
  );

comment on policy "post_reactions: insert own (crew+)" on public.post_reactions is
  'A member reacts as themselves; on a Space wall, never while banned from that wall (LIVE-2095).';

-- ── 3. post kinds on the wall ───────────────────────────────────────────────────────────────────
-- The non-wall arm is the live body from 20270346028800, unchanged. The wall arm now admits
-- feed, note, poll and ask for anyone who may post, and announcement only for the Space team.
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
      and parent_id is null
      and visibility = 'cluster'::post_visibility
      and private.can_post_space_wall(scope_space_id)
      and (
        post_type = any (array['feed'::post_type, 'note'::post_type, 'poll'::post_type, 'ask'::post_type])
        or (post_type = 'announcement'::post_type and private.is_space_member(scope_space_id))
      )
    )
  );

comment on policy "posts: insert (crew+ in scope)" on public.posts is
  'No space scope: the existing rules. On a Space wall: whoever private.can_post_space_wall admits (never a banned person) may post feed, note, poll or ask; announcement is for the Space team only (ADR-1938, LIVE-2095).';
