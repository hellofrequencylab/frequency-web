-- =============================================================================
-- Retire the legacy `community_role = 'crew'` VALUE (PB.1i — unify access on the tier)
--
-- WHY: "Crew" is the PAID MEMBERSHIP, not a stewardship rung. Paid standing lives on
-- `profiles.membership_tier` ('crew' | 'supporter' — 20260608040000 + 20260608050000,
-- backfilled from the old crew-as-paid proxy), and every "is paid?" read goes through
-- `isPaid(tier)` (lib/core/access-matrix.ts). The beta grant comps the TIER
-- (app/onboarding/beta/actions.ts `grantBetaCrew`); its legacy role-write is removed
-- in the same change as this migration. Display endorsement (`isEndorsed`,
-- lib/season-ranks.ts) now reads the tier too. Nothing meaningful is left on the
-- role VALUE — so migrate the rows off it and stop treating it as a gate.
--
-- WHAT THIS DOES (order matters — gates first, then rows, one transaction):
--   1. Feed RPCs: add `membership_tier` to the author jsonb of `feed_for_viewer` /
--      `scoped_feed_for_viewer`, so client flair can endorse off the tier.
--   2. RLS: every live policy whose floor is `get_my_role() >= 'crew'` drops to
--      `>= 'member'`. Those floors were the OLD "paid member" proxy from the era
--      when crew-the-role meant paid; under the beta every signed-in member holds
--      the crew role, so "crew+" is effectively "any member" today — lowering the
--      floor PRESERVES current behavior once rows migrate (without it, migrated
--      members would lose reacting / RSVPs / channel joins / circle-event reads).
--      Genuinely-paid gates are app-level on the tier (PB.1b), not these policies.
--      Policy NAMES keep their historical "crew+" wording on purpose (renames would
--      ripple through later `drop policy if exists` migrations); read them as
--      "member+" from here on.
--   3. Data: `community_role 'crew' → 'member'`. Affects every beta-inducted member
--      plus the seeded demo personas (20260603000003/4). Their paid standing is
--      untouched — the 20260608040000 backfill + the beta grant put them all on the
--      paid tier already.
--
-- WHY THE ENUM VALUE IS KEPT: PostgreSQL cannot drop an enum value without
-- recreating the type and rewriting every dependent column, policy, and function —
-- disruptive and risky for zero benefit. The value stays as a DEPRECATED, unused
-- rung (documented on the type below and in lib/core/roles.ts); enum ORDER still
-- matters ('host' > 'crew' > 'member' comparisons keep working).
--
-- PRE-APPLY CHECKLIST (role-value READS that still gate as if crew = paid; they
-- regress for paid members once rows migrate — fix or accept before applying):
--   • app/(main)/entry-points/page.tsx:29 — `atLeastRole(role,'crew')` upsell wall
--     (the actions already use the tier via requireCrew, PB.1d; the page does not).
--   • lib/entry-points/store.ts `listAssignableMembers` / `isAssignableMember` —
--     "crew-and-above" queries on community_role.
--   • app/(main)/messages/page.tsx + messages/rooms/actions.ts `CREW_PLUS` — room
--     creation falls to host+ after the migration.
--   • app/(main)/events/page.tsx:150 + events/new/page.tsx:24 role arrays.
--   • lib/nav-areas.ts `meetsAccess` — the Vault item (`defaultAccess: 'crew'`)
--     mutes to preview for paid members (page itself gates on the tier — cosmetic).
--   • lib/demo/engine.ts:545 + lib/demo/generate.ts:116 — the runtime demo
--     generator still WRITES community_role='crew' for demo personas; harmless
--     (value stays valid) but should move to volunteer_role/tier.
-- =============================================================================

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. Feed RPCs — thread membership_tier into the author payload (PB.1i flair).
--    Identical to 20260605050000 plus the one jsonb key in each.
-- ───────────────────────────────────────────────────────────────────────────────

create or replace function public.feed_for_viewer(
  _sort     text             default 'relevant',
  _limit    integer          default 40,
  _lat      double precision default null,
  _lng      double precision default null,
  _radius_m integer          default null
)
returns table (
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamptz,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb,
  distance_m double precision
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role,
                            'membership_tier', a.membership_tier) as author,
         coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'reaction_type', pr.reaction_type, 'profile_id', pr.profile_id))
                   from post_reactions pr where pr.post_id = p.id), '[]'::jsonb) as reactions,
         dist.distance_m
  from posts p
  join profiles a on a.id = p.author_id
  left join lateral (
    select st_distance(c.geog, st_setsrid(st_makepoint(_lng, _lat), 4326)::geography) as distance_m
    from circles c
    where _lat is not null and _lng is not null and c.id = p.scope_id and c.geog is not null
  ) dist on true
  where p.parent_id is null
    and p.hidden_at is null
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
    and (
         p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )))
      -- Demo content is community-wide "lived-in" filler: gated by demo_mode above,
      -- it reaches every viewer's feed regardless of membership.
      or p.is_demo
    )
  order by
    case when _sort = 'nearby' and dist.distance_m is not null and dist.distance_m <= coalesce(_radius_m, 1e9) then 0 else 1 end,
    case when _sort = 'nearby' then dist.distance_m end asc nulls last,
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 40), 100));
$$;

create or replace function public.scoped_feed_for_viewer(
  _scope_ids uuid[],
  _sort      text    default 'relevant',
  _limit     integer default 30
)
returns table (
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamptz,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role,
                            'membership_tier', a.membership_tier) as author,
         coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'reaction_type', pr.reaction_type, 'profile_id', pr.profile_id))
                   from post_reactions pr where pr.post_id = p.id), '[]'::jsonb) as reactions
  from posts p
  join profiles a on a.id = p.author_id
  where p.parent_id is null
    and p.hidden_at is null
    and p.scope_id = any(_scope_ids)
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
    and (
         p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )))
      -- Demo content surfaces on a demo circle's wall for any viewer (the claim flow
      -- shows a furnished, not empty, circle); gated by demo_mode above.
      or p.is_demo
    )
  order by case when _sort = 'relevant' then p.engagement_score end desc nulls last, p.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;

revoke all on function public.feed_for_viewer(text, integer, double precision, double precision, integer) from public, anon;
grant execute on function public.feed_for_viewer(text, integer, double precision, double precision, integer) to authenticated;
revoke all on function public.scoped_feed_for_viewer(uuid[], text, integer) from public, anon;
grant execute on function public.scoped_feed_for_viewer(uuid[], text, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. RLS — lower every live `>= 'crew'` floor to `>= 'member'` (the old paid proxy;
--    behavior-preserving, see header). Each policy is recreated from its latest
--    definition with ONLY the floor changed.
-- ───────────────────────────────────────────────────────────────────────────────

-- profiles (from 20240101000001)
drop policy if exists "profiles: read own or crew+ reads in-region" on public.profiles;
create policy "profiles: read own or crew+ reads in-region"
  on public.profiles for select
  using (
    auth_user_id = auth.uid()
    or (
      is_active = true
      and get_my_role() >= 'member'
      and nexus_region_id = get_my_region_id()
    )
  );

-- event_rsvps (from 20240101000001; the update/delete policies carry "crew+" in the
-- NAME only — their predicates are owner-scoped and need no change)
drop policy if exists "event_rsvps: crew+ insert own" on public.event_rsvps;
create policy "event_rsvps: crew+ insert own"
  on public.event_rsvps for insert
  with check (
    get_my_role() >= 'member'
    and profile_id = get_my_profile_id()
  );

-- crew_completions (from 20240101000001)
drop policy if exists "crew_completions: crew+ insert own" on public.crew_completions;
create policy "crew_completions: crew+ insert own"
  on public.crew_completions for insert
  with check (
    get_my_role() >= 'member'
    and profile_id = get_my_profile_id()
  );

-- memberships (from 20240102000000)
drop policy if exists "memberships: read in same circle or host sees their circle" on public.memberships;
create policy "memberships: read in same circle or host sees their circle"
  on public.memberships for select
  using (
    profile_id = get_my_profile_id()
    or (
      get_my_role() >= 'member'
      and circle_id = any(get_my_circle_ids())
    )
    or (
      get_my_role() >= 'host'
      and circle_id in (
        select id from circles where host_id = get_my_profile_id()
      )
    )
  );

drop policy if exists "memberships: crew+ join own" on public.memberships;
create policy "memberships: crew+ join own"
  on public.memberships for insert
  with check (
    get_my_role() >= 'member'
    and profile_id = get_my_profile_id()
  );

-- channels (from 20240102000000)
drop policy if exists "channels: crew+ read public" on public.channels;
create policy "channels: crew+ read public"
  on public.channels for select
  using (
    get_my_role() >= 'member'
    and (is_public = true or creator_id = get_my_profile_id())
  );

-- channel_memberships (from 20240102000000) — load-bearing: the channel join/tune
-- action inserts through the USER client.
drop policy if exists "channel_memberships: crew+ join own" on public.channel_memberships;
create policy "channel_memberships: crew+ join own"
  on public.channel_memberships for insert
  with check (
    get_my_role() >= 'member'
    and profile_id = get_my_profile_id()
  );

-- posts (from 20240213000000 — the latest full definition)
drop policy if exists "posts: crew+ read by visibility" on public.posts;
create policy "posts: crew+ read by visibility" on public.posts
  for select
  using (
    get_my_role() >= 'member'::community_role
    and (
      visibility = 'public'::post_visibility
      or (visibility = 'region'::post_visibility and scope_id = get_my_region_id())
      or (visibility = 'group'::post_visibility and scope_id = any(get_my_circle_ids()))
      or (
        visibility = 'cluster'::post_visibility
        and (
          scope_id = any(get_my_circle_ids())
          or exists (
            select 1 from circles c
            where c.id = scope_id
              and (
                (c.hub_id is not null and c.hub_id = any(get_my_hub_ids()))
                or (c.hub_id is null and c.topical_channel_id = any(get_my_tuned_channel_ids()))
              )
          )
        )
      )
    )
  );

drop policy if exists "posts: crew+ insert in scope" on public.posts;
create policy "posts: crew+ insert in scope" on public.posts
  for insert
  with check (
    get_my_role() >= 'member'::community_role
    and author_id = get_my_profile_id()
    and (
      visibility = 'public'::post_visibility
      or (visibility = 'region'::post_visibility and scope_id = get_my_region_id())
      or (visibility = 'group'::post_visibility and scope_id = any(get_my_circle_ids()))
      or (
        visibility = 'cluster'::post_visibility
        and (
          scope_id = any(get_my_circle_ids())
          or exists (
            select 1 from circles c
            where c.id = scope_id and c.host_id = get_my_profile_id()
          )
        )
      )
    )
  );

-- post_reactions (from 20240104000000) — load-bearing: toggleReaction inserts
-- through the USER client.
drop policy if exists "post_reactions: crew+ read" on public.post_reactions;
create policy "post_reactions: crew+ read"
  on public.post_reactions for select
  using (get_my_role() >= 'member');

drop policy if exists "post_reactions: crew+ insert own" on public.post_reactions;
create policy "post_reactions: crew+ insert own"
  on public.post_reactions for insert
  with check (
    get_my_role() >= 'member'
    and profile_id in (select id from profiles where auth_user_id = auth.uid())
  );

-- user_achievements + streaks (from 20240118000000)
drop policy if exists "user_achievements: crew+ read others" on public.user_achievements;
create policy "user_achievements: crew+ read others"
  on public.user_achievements for select
  using (get_my_role() >= 'member');

drop policy if exists "streaks: read own or crew+ reads all" on public.streaks;
create policy "streaks: read own or crew+ reads all"
  on public.streaks for select
  using (
    profile_id = get_my_profile_id()
    or get_my_role() >= 'member'
  );

-- events (from 20260612000000 — the visibility-aware read; only the circle_only
-- branch's floor changes)
drop policy if exists "events: visibility-aware read" on public.events;
create policy "events: visibility-aware read"
  on public.events for select
  using (
    visibility = 'public'
    or visibility = 'unlisted'
    or host_id = get_my_profile_id()
    or (
      visibility = 'circle_only'
      and get_my_role() >= 'member'::community_role
      and (
        (scope_type = 'circle' and scope_id = any (get_my_circle_ids()))
        or (scope_type = 'region' and scope_id = get_my_region_id())
      )
    )
  );

comment on policy "events: visibility-aware read" on public.events is
  'public/unlisted readable by anyone (listing exclusion for unlisted is app-level); circle_only stays scope-membership (any member — the crew-role floor retired in 20260612060000); private is host-only; hosts always see their own events.';

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. Data — move the rows off the retired value. Paid standing is preserved on
--    membership_tier (beta grant + the 20260608040000 backfill).
-- ───────────────────────────────────────────────────────────────────────────────

-- The prevent_role_self_escalation() guard raises on ANY community_role change —
-- including this migration's own batch update — so it is disabled for exactly
-- this statement and re-enabled immediately after (same transaction; the guard
-- is never down for live traffic).
alter table public.profiles disable trigger prevent_role_self_escalation;

update public.profiles
  set community_role = 'member'
  where community_role = 'crew';

alter table public.profiles enable trigger prevent_role_self_escalation;

-- The enum VALUE itself stays (deprecated, unused) — dropping a Postgres enum value
-- requires recreating the type and rewriting every dependent column/policy/function.
-- Enum ORDER is still load-bearing for `get_my_role() >= '<rung>'` comparisons.
comment on type public.community_role is
  'Community trust ladder: member < crew < host < guide < mentor < admin < janitor. The ''crew'' VALUE is DEPRECATED (20260612060000): paid standing is profiles.membership_tier; no rows hold the crew role and no app code writes it. Kept only because dropping a PG enum value is disruptive; enum ORDER remains load-bearing for >= comparisons.';
