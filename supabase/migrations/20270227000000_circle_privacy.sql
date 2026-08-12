-- ============================================================================
-- CIRCLE PRIVACY: TWO AXES — discoverability and access (ADR-1015 · Circles C1).
--
-- WHAT IS TRUE TODAY, AND WHY IT IS NOT PRIVACY. 20261157000000_circles_unlisted.sql said it in
-- its own words: "circles have no 'private' concept (draft/archived already cover 'hidden')".
-- `unlisted` drops a circle from every DISCOVERY surface, and the same migration deliberately
-- left `public_circle_by_id` untouched so a direct link still resolves. That is obscurity. There
-- has never been a way to say "anyone may see that this exists, nobody may see what is in it".
--
-- ── WHY TWO COLUMNS AND NOT ONE ENUM ─────────────────────────────────────────────────────────
--
-- The obvious shape is a single ordered `visibility` of public / unlisted / private. It was built
-- that way first and it is WRONG, because it cannot express the case the owner named:
--
--   "Space circles can be listed or unlisted, as well as set to private. A listed private circle
--    basically works as a lead funnel into that space. A space owner can set permissions for a
--    circle in their membership settings. For example: A space can have a private circle that
--    space members can only access if they are a member."
--
-- A LISTED PRIVATE circle appears in the index with its name, Host, description and member count
-- so a stranger can find it and be moved to join or buy, while the roster and the posts stay shut.
-- On a single ordered axis, "private" implies "hidden" and that cell does not exist. So:
--
--   * `unlisted` (the EXISTING boolean, unchanged) is axis 1: DISCOVERABILITY. Does it appear in
--     the index / map / /discover / sitemap / search / public_circles?
--   * `access` (NEW) is axis 2: who may ENTER and see the CONTENT. Set per Circle by the Space
--     owner, in the same membership settings that already link a tier to a Circle (ADR-859).
--
-- ⚠️ DO NOT COLLAPSE THESE BACK INTO ONE ENUM FOR TIDINESS. The owner named a cell that only
-- exists while they are separate. No new discoverability column is introduced either: `unlisted`
-- already IS that axis and every reader that honours it keeps working untouched.
--
-- THE TWO QUESTIONS THIS SPLIT CREATES, which used to be one:
--   private.can_see_circle(...)   may this viewer see THAT IT EXISTS?  -> the `circles` row
--   private.can_enter_circle(...) may this viewer see WHAT IS IN IT?   -> roster, posts, tabs
-- A listed closed Circle answers YES to the first and NO to the second. That asymmetry is the
-- lead funnel, and it is the reason both functions exist rather than one.
--
-- 🔴 THE POLICY TRAP THIS FILE IS SHAPED AROUND. `circles` carries EIGHT policies: four PERMISSIVE
-- (all `TO PUBLIC`, so anon is inside them) and four RESTRICTIVE space-scoped ones. Postgres
-- combines them as (permissive1 OR permissive2 OR ...) AND restrictive1 AND restrictive2 ....
-- The permissive read policy `circles: authenticated read non-archived` has NO identity term at
-- all in its main arm -- `status not in ('archived','draft')` is true for every live circle, for
-- anon as much as for a signed-in member. So a privacy rule added as PERMISSIVE would be OR-ed
-- against a predicate that is already TRUE, and every closed circle would stay world-readable.
-- The new policy below is `AS RESTRICTIVE FOR SELECT`. Pinned by
-- supabase/tests/circle_privacy.test.sql, which asserts polpermissive = false directly.
--
-- 🔴 THE SPACE PREDICATE CANNOT CARRY THIS. `circles.space_id` is nullable in schema but NULL is
-- not the convention -- the ROOT SPACE is the sentinel for "no Space owns this, it is a member's
-- own Circle" (lib/circles/transfer.ts:9-10; live: 0 rows with space_id is null). And
-- `private.can_view_space_content(p_space_id)` returns TRUE whenever the space is not
-- visibility='private', while the root space is visibility='network'. So `circles_space_visible`
-- is a PERMANENT NO-OP for every personal circle. No third ownership encoding is introduced.
--
-- PAID IS AN ACCESS MODE, NOT A VISIBILITY. The owner: "Owner chooses per Circle." A paid Circle
-- may be listed (a shopfront) or unlisted, exactly as a free one may. That falls out for free once
-- the axes are split, and it is why there is no paid=>public and no paid=>private rule anywhere
-- below. `space_membership_tiers.circle_id` (ADR-859) stays the ONLY encoding of price: a Circle
-- is paid iff a live priced tier points at it. A price_cents on `circles` would be a second,
-- contradictory encoding of the same fact.
--
-- ── THE FORBIDDEN CELLS, AND WHY MOST OF THEM CANNOT BE `CHECK` ──────────────────────────────
--
-- ⚠️ A CHECK constraint is ROW-LOCAL and must be IMMUTABLE. Most of the nonsense cells reference
-- ANOTHER TABLE: "a personal circle can never be paid" needs the ROOT SPACE ID (spaces.type =
-- 'root'), "a Space below Business cannot sell" needs spaces.plan, and "space_members access
-- needs a Space to draw members from" needs the root sentinel again. None is expressible as a
-- CHECK -- written as one it would either fail to create or, worse, be silently stale after a
-- plan change. They are BEFORE INSERT OR UPDATE triggers instead: the same guarantee at the same
-- layer (the database, never the UI), using the mechanism Postgres actually offers for a
-- cross-table invariant. The cell that IS row-local gets a real CHECK:
--
--   CHECK    access in ('open','circle_members','space_members','invite','tier')
--   trigger  access in ('space_members','tier') requires a real (non-root) owning Space
--   trigger  the tier's circle must belong to the tier's own Space  (=> personal circles are free,
--            because a personal circle lives on root and root sells nothing)
--   trigger  that Space's plan must rank >= 'business'              (=> free Spaces cannot sell)
--   trigger  ... which also closes cross-tenant linking: nothing today stops Space A's tier
--            pointing at Space B's circle. Not in the owner's rulings; found while writing the
--            matrix.
--
-- ── RLS IS NOT THE WHOLE STORY ───────────────────────────────────────────────────────────────
--
-- joinCircle uses the service-role client by design, and it is not alone: the entire circle detail
-- route (loadCircleShell), /api/search-scopes, the Interest page, the sidebar circle rails, Vera's
-- suggestCircle and the network page's circles_near call all bypass RLS. So the RPC BODIES below
-- carry their filter themselves -- a service-role `.rpc('circles_near')` is fixed by this
-- migration, not by the page -- and the app-layer bypasses are gated one by one against
-- lib/circles/visibility.ts. See the C1 report for the per-path audit.
--
-- House style: additive + idempotent, expand-only, `add column if not exists` / `create or
-- replace`, policies dropped-then-created, helpers in `private`. SAFE to re-run.
--
-- ⚠️ NOT APPLIED BY THIS AGENT. Apply via execute_sql + an explicit ledger insert for version
-- 20270227000000 (supabase/migrations/README.md), never apply_migration.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   drop policy if exists "circles_access_restrictive" on public.circles;
--   drop trigger if exists trg_circles_access_shape on public.circles;
--   drop trigger if exists trg_membership_tier_circle_link on public.space_membership_tiers;
--   drop function if exists public.enforce_circle_access_shape();
--   drop function if exists public.enforce_membership_tier_circle_link();
--   drop function if exists private.can_see_circle(uuid, boolean, text, uuid, uuid);
--   drop function if exists private.can_enter_circle(uuid, text, uuid, uuid);
--   drop function if exists private.post_scope_discoverable(uuid);
--   drop function if exists private.space_can_sell(uuid);
--   alter table public.circles drop constraint if exists circles_access_check;
--   alter table public.circles drop column if exists access;
--   (and restore public_circle_by_id / circles_near / circle_momentum / feed_for_viewer /
--    scoped_feed_for_viewer from 20261157000000 and their original migrations)
-- ============================================================================

-- ── 1. Axis 2: the access column ──────────────────────────────────────────────────────────────
--
-- Axis 1 needs no migration at all: `circles.unlisted` already is it, and leaving it alone means
-- every reader that honours it -- the public_circles RPC, lib/circles/index-data.ts,
-- lib/people/associations.ts -- keeps working with no change and no chance of being missed.

alter table public.circles
  add column if not exists access text not null default 'open';

comment on column public.circles.access is
  'WHO MAY ENTER this Circle and see its content (ADR-1015). The SECOND axis; `unlisted` is the first (discoverability), and the two are INDEPENDENT -- a LISTED circle with a closed access mode is the lead funnel the owner named: found in the index by name, shut on the inside. Values: open (self-serve, today''s behaviour) · circle_members (only active members; the Host adds you) · space_members (active members of the owning Space may enter and self-join) · invite (an invite link or QR only) · tier (a linked space_membership_tiers row, ADR-859). Set by the Space owner in their membership settings. Enforced by circles_access_restrictive + private.can_enter_circle, NOT by the UI.';

-- The one row-local cell. Everything else about access is cross-table, so it is a trigger below.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.circles'::regclass and contype = 'c'
      and conname = 'circles_access_check'
  loop
    execute format('alter table public.circles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.circles
  add constraint circles_access_check
  check (access in ('open', 'circle_members', 'space_members', 'invite', 'tier'));

-- ── 2. The two predicates ─────────────────────────────────────────────────────────────────────
-- Columns are PASSED IN rather than re-read from `circles`, deliberately: a SECURITY DEFINER
-- helper that selected from the very table whose policy calls it is one `force row level
-- security` away from infinite recursion, and it would cost a second lookup per row besides.
-- Shape and grants mirror private.can_view_space_content (ADR-328).

-- MAY THIS VIEWER SEE WHAT IS INSIDE? The content question: roster, posts, tabs, momentum.
create or replace function private.can_enter_circle(
  p_circle_id uuid,
  p_access text,
  p_space_id uuid,
  p_host_id uuid
)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select
    -- An open Circle is open. Anyone signed in may walk in, exactly as today.
    coalesce(p_access, 'open') = 'open'
    -- An active member of the Circle. This is how `tier`, `invite` and `circle_members` all
    -- resolve once someone is actually in: the tier purchase and the invite redemption both
    -- WRITE a memberships row (ADR-859, joinViaInviteLink), so entry is never a live re-check
    -- against Stripe -- it is a durable row, and this arm reads it.
    or p_circle_id = any(coalesce(private.get_my_circle_ids(), '{}'::uuid[]))
    -- The Host who runs it.
    or (p_host_id is not null and p_host_id = private.get_my_profile_id())
    -- The owner's named case: "a private circle that space members can only access if they are a
    -- member". Only for this mode -- Space membership is NOT a general key to a Space's Circles.
    or (coalesce(p_access, 'open') = 'space_members' and private.is_space_member(p_space_id))
    -- A steward of the owning Space: owner, or an active editor/moderator/admin. Reuses the write
    -- predicate on purpose -- someone who can move or delete the Circle can read it. For a
    -- PERSONAL circle this resolves to the root-space arm, i.e. platform staff only, which is the
    -- correct answer and the reason this policy exists at all.
    or private.can_write_space_content(p_space_id)
    -- Break-glass for platform staff (moderation, support). NOT community_role: a `guide` rank
    -- moderates the community, it is not a key to somebody's private room.
    or private.get_my_web_role() in ('admin', 'janitor');
$$;

revoke all on function private.can_enter_circle(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_enter_circle(uuid, text, uuid, uuid)
  to anon, authenticated, service_role;

comment on function private.can_enter_circle(uuid, text, uuid, uuid) is
  'May the CURRENT caller see WHAT IS IN this Circle (roster, posts, tabs)? (ADR-1015) The CONTENT half of the two-axis model. Open circles: everyone. Otherwise: active member, Host, a Space member when access=''space_members'', a steward of the owning Space, or platform staff.';

-- MAY THIS VIEWER SEE THAT IT EXISTS? The `circles` ROW question, and the whole reason the axes
-- are split: a LISTED circle answers yes here no matter how shut its access is.
create or replace function private.can_see_circle(
  p_circle_id uuid,
  p_unlisted boolean,
  p_access text,
  p_space_id uuid,
  p_host_id uuid
)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select
    -- LISTED: the row is public FACE. Name, Host, about, member count, city, image -- enough for a
    -- stranger to decide to join or buy, which is exactly what a lead funnel is for. The access
    -- mode governs what is INSIDE, and none of it rides on this row.
    not coalesce(p_unlisted, false)
    -- UNLISTED but OPEN: today's unlisted contract, preserved byte for byte. Out of discovery,
    -- still resolves by direct link (20261157000000 chose that deliberately).
    or coalesce(p_access, 'open') = 'open'
    -- UNLISTED and CLOSED: the fully-hidden Circle. Only someone who may enter may even learn it
    -- is there.
    or private.can_enter_circle(p_circle_id, p_access, p_space_id, p_host_id);
$$;

revoke all on function private.can_see_circle(uuid, boolean, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_see_circle(uuid, boolean, text, uuid, uuid)
  to anon, authenticated, service_role;

-- ⚠️ BOTH REVOKE HALVES, IN ONE STATEMENT (ADR-959, above and below). Supabase ships `ALTER
-- DEFAULT PRIVILEGES IN SCHEMA public`, so anon and authenticated hold EXPLICIT per-role grants
-- the moment an object exists, and `revoke ... from public` does not touch an explicit per-role
-- grant. Revoking from `public` alone succeeds and locks nothing; revoking from the roles alone
-- leaves the PUBLIC grant, which still satisfies has_function_privilege(). Naming all three is the
-- only shape that is correct on a fresh replay. Pinned by
-- supabase/migrations/fail-open-guards.test.ts.
--
-- anon and authenticated then get execute back DELIBERATELY, and the grant is not a hole: an RLS
-- policy is evaluated as the INVOKING role, so a policy that calls these needs the caller to hold
-- execute or every anon read of `circles` errors instead of filtering. `private` is not an exposed
-- PostgREST schema, so neither is a browser-reachable RPC. Identical posture, for the identical
-- reason, to private.can_view_space_content (ADR-328) -- verified against its live ACL.
comment on function private.can_see_circle(uuid, boolean, text, uuid, uuid) is
  'May the CURRENT caller see THAT this Circle EXISTS? (ADR-1015) The EXISTENCE half of the two-axis model, and the predicate behind circles_access_restrictive. TRUE for every LISTED circle regardless of access (the lead funnel), for an unlisted OPEN circle (the 2026-11 direct-link contract), and otherwise only for someone who can_enter_circle.';

-- ── 3. THE POLICY. RESTRICTIVE, for the reason in the header ──────────────────────────────────

drop policy if exists "circles_access_restrictive" on public.circles;
create policy "circles_access_restrictive"
  on public.circles
  as restrictive
  for select
  using (private.can_see_circle(id, unlisted, access, space_id, host_id));

-- ── 4. The SECURITY DEFINER read RPCs ─────────────────────────────────────────────────────────
-- SECDEF bypasses the policy above, so each one carries its own filter. Every signature and column
-- list is preserved byte-for-byte; only the WHERE clause moves.
--
-- ⚠️ WHICH QUESTION EACH ONE ASKS IS THE WHOLE POINT. An RPC that returns the public FACE keys on
-- DISCOVERABILITY (`unlisted`) or on can_see. An RPC that returns CONTENT keys on can_enter. Get
-- these the wrong way round and either the lead funnel disappears or the room leaks.

-- public_circles is the discovery list, so it keys on axis 1 ONLY. UNCHANGED from 20261157000000,
-- and that is deliberate: a LISTED circle with closed access must still appear here, by name, with
-- its member count, or the funnel the owner asked for does not exist. Restated so the file that
-- introduces `access` is on the record about not touching it.
CREATE OR REPLACE FUNCTION public.public_circles(_limit integer DEFAULT 50)
RETURNS TABLE (
  id           uuid,
  slug         text,
  name         text,
  about        text,
  type         text,
  member_count integer,
  status       text,
  city         text,
  channel_name text,
  channel_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name, c.about, c.type::text, c.member_count,
         c.status::text, c.city, tc.name, tc.slug
  FROM   circles c
  LEFT JOIN topical_channels tc ON tc.id = c.topical_channel_id
  WHERE  c.status IN ('forming', 'active')
    AND  NOT c.unlisted
  ORDER BY c.member_count DESC, c.created_at ASC
  LIMIT  GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.public_circles(integer) TO anon, authenticated;

-- 🔴 THE ONE THE ORIGINAL MIGRATION LEFT OPEN ON PURPOSE, now answering the EXISTENCE question.
-- A LISTED circle resolves by id no matter how closed (that is the funnel's landing page, and its
-- OG share card). An UNLISTED OPEN circle resolves, exactly as 20261157000000 intended. An
-- UNLISTED CLOSED circle -- the fully-hidden one -- does not resolve at all.
CREATE OR REPLACE FUNCTION public.public_circle_by_id(_id uuid)
RETURNS TABLE (
  id           uuid,
  slug         text,
  name         text,
  about        text,
  type         text,
  member_count integer,
  status       text,
  city         text,
  channel_name text,
  channel_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  SELECT c.id, c.slug, c.name, c.about, c.type::text, c.member_count,
         c.status::text, c.city, tc.name, tc.slug
  FROM   circles c
  LEFT JOIN topical_channels tc ON tc.id = c.topical_channel_id
  WHERE  c.id = _id
    AND  c.status IN ('forming', 'active')
    AND  private.can_see_circle(c.id, c.unlisted, c.access, c.space_id, c.host_id)
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.public_circle_by_id(uuid) TO anon, authenticated;

-- A public count keys on axis 1: a listed circle is part of the public picture whatever its
-- access, and an unlisted one never was.
CREATE OR REPLACE FUNCTION public.public_active_circle_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM   circles
  WHERE  status IN ('forming', 'active')
    AND  NOT unlisted;
$$;

GRANT EXECUTE ON FUNCTION public.public_active_circle_count() TO anon, authenticated;

-- 🔴 circles_near is SECURITY INVOKER, so for a session client the new policy already covers the
-- hidden case. It is fixed HERE ANYWAY for two reasons, both real: (1) app/(main)/network/page.tsx
-- calls it with the SERVICE-ROLE client, which bypasses RLS entirely; (2) it is EXECUTE-able by
-- `anon` and today returns UNLISTED circles with coordinates to a signed-out caller -- a
-- PRE-EXISTING hole in the unlisted contract that predates any of this. It is a MAP, which is a
-- discovery surface, so it keys on axis 1. Signature and column list unchanged.
CREATE OR REPLACE FUNCTION public.circles_near(
  _lat double precision,
  _lng double precision,
  _limit integer DEFAULT 24
)
RETURNS TABLE (
  id uuid, name text, slug text, about text, type text,
  member_count integer, member_cap integer, status text,
  neighborhood text, city text, image_url text,
  latitude numeric, longitude numeric, distance_m double precision
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  select c.id, c.name, c.slug, c.about, c.type::text,
         c.member_count, c.member_cap, c.status::text,
         c.neighborhood, c.city, c.image_url,
         c.latitude, c.longitude,
         st_distance(c.geog, st_setsrid(st_makepoint(_lng, _lat), 4326)::geography) as distance_m
  from circles c
  where c.is_demo = false
    and c.status in ('forming', 'active')
    and not c.unlisted
    and c.geog is not null
  order by c.geog <-> st_setsrid(st_makepoint(_lng, _lat), 4326)::geography
  limit greatest(1, least(coalesce(_limit, 24), 100));
$$;

GRANT EXECUTE ON FUNCTION public.circles_near(double precision, double precision, integer)
  TO anon, authenticated;

-- circle_momentum takes an ARBITRARY circle id from any authenticated caller and returns member
-- counts, NEW-TIE counts and upcoming-event counts. New ties between named members is roster-shaped
-- intelligence, not public face, so this one asks the CONTENT question: can_enter, not can_see. A
-- caller who may see the funnel's landing page still gets zero rows here.
CREATE OR REPLACE FUNCTION public.circle_momentum(_circle uuid)
RETURNS TABLE(members integer, new_members_7d integer, new_ties_7d integer, upcoming_events integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  with visible as (
    select c.id
    from public.circles c
    where c.id = _circle
      and private.can_enter_circle(c.id, c.access, c.space_id, c.host_id)
  ),
  mem as (
    select profile_id from public.memberships
    where circle_id = (select id from visible) and status = 'active'
  )
  select
    (select count(*) from mem)::int,
    (select count(*) from public.memberships where circle_id = (select id from visible) and status = 'active' and joined_at > now() - interval '7 days')::int,
    (select count(*) from public.friendships f
       where f.status = 'accepted' and f.responded_at > now() - interval '7 days'
         and f.user_a_id in (select profile_id from mem) and f.user_b_id in (select profile_id from mem))::int,
    (select count(*) from public.events e
       where e.scope_id = (select id from visible) and e.starts_at > now() and coalesce(e.is_cancelled, false) = false)::int
  from visible;
$$;

GRANT EXECUTE ON FUNCTION public.circle_momentum(uuid) TO authenticated;

-- ── 5. The FEED, which names a circle without ever selecting from `circles` ────────────────────
--
-- 🔴 THE SUBTLE ONE, AND IT SURVIVES THE RE-MODEL. `posts.visibility` and a Circle's access are
-- different axes, and the feed reads the post's. A post written with visibility='public' inside a
-- closed circle satisfies the `p.visibility = 'public'` arm of feed_for_viewer, so it lands in the
-- global feed for everybody. `lib/feed/post-origin.ts` then resolves `p.scope_id` into the origin
-- chip on the post header, printing the circle's NAME and deep-linking `/circles/<slug>`. The
-- circle's own row was never read by the reader, so no amount of RLS on `circles` closes it.
--
-- ⚠️ RE-CHECKED AGAINST THE TWO-AXIS MODEL, AND THE PREDICATE IS `can_see`, NOT `can_enter`. A
-- LISTED closed circle's name is public face by design, so a member of it publishing a PUBLIC post
-- naming it leaks nothing -- suppressing that would delete the funnel's best organic surface.
-- What must never surface is a post whose origin is a circle the viewer may not know EXISTS: the
-- unlisted closed one. Content inside a listed closed circle is already members-only through the
-- EXISTING `p.visibility = 'group'` arm, which keys on get_my_circle_ids(). So the axes line up:
-- posts.visibility governs the content, this predicate governs the existence.

create or replace function private.post_scope_discoverable(p_scope_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select not exists (
    select 1
    from public.circles c
    where c.id = p_scope_id
      and not private.can_see_circle(c.id, c.unlisted, c.access, c.space_id, c.host_id)
  );
$$;

revoke all on function private.post_scope_discoverable(uuid) from public, anon, authenticated;
grant execute on function private.post_scope_discoverable(uuid) to service_role;
-- Locked to service_role: unlike the two predicates above this is NEVER called from a policy --
-- its only callers are the two SECURITY DEFINER feed RPCs, which execute as their owner.

comment on function private.post_scope_discoverable(uuid) is
  'Is a post whose scope is this id safe to surface? (ADR-1015) TRUE for every scope that is not a Circle, and for a Circle the caller may know EXISTS (can_see_circle). Exists because the feed names a Circle through the post ORIGIN CHIP without ever selecting from `circles`, so no policy on that table can reach it. Deliberately can_SEE and not can_ENTER: a listed closed Circle''s name is public face, its content is already gated by posts.visibility.';

CREATE OR REPLACE FUNCTION public.feed_for_viewer(
  _sort text DEFAULT 'relevant'::text,
  _limit integer DEFAULT 40,
  _lat double precision DEFAULT NULL::double precision,
  _lng double precision DEFAULT NULL::double precision,
  _radius_m integer DEFAULT NULL::integer
)
RETURNS TABLE(
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamp with time zone,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb,
  distance_m double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role,
                            'membership_tier', a.membership_tier, 'is_system', a.is_system) as author,
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
    and private.post_scope_discoverable(p.scope_id)
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
    and (
         coalesce((select value from platform_flags where key = 'feed_open'), false)
      or p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )))
      or p.is_demo
    )
  order by
    case when _sort = 'nearby' and dist.distance_m is not null and dist.distance_m <= coalesce(_radius_m, 1e9) then 0 else 1 end,
    case when _sort = 'nearby' then dist.distance_m end asc nulls last,
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 40), 100));
$$;

GRANT EXECUTE ON FUNCTION public.feed_for_viewer(text, integer, double precision, double precision, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.scoped_feed_for_viewer(
  _scope_ids uuid[],
  _sort text DEFAULT 'relevant'::text,
  _limit integer DEFAULT 30
)
RETURNS TABLE(
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamp with time zone,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role,
                            'membership_tier', a.membership_tier, 'is_system', a.is_system) as author,
         coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'reaction_type', pr.reaction_type, 'profile_id', pr.profile_id))
                   from post_reactions pr where pr.post_id = p.id), '[]'::jsonb) as reactions
  from posts p
  join profiles a on a.id = p.author_id
  where p.parent_id is null
    and p.hidden_at is null
    and p.scope_id = any(_scope_ids)
    and private.post_scope_discoverable(p.scope_id)
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
      or p.is_demo
    )
  order by case when _sort = 'relevant' then p.engagement_score end desc nulls last, p.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;

GRANT EXECUTE ON FUNCTION public.scoped_feed_for_viewer(uuid[], text, integer) TO authenticated;

-- ── 6. The cross-table shape rules ────────────────────────────────────────────────────────────

-- Plan rank, mirroring lib/pricing/plans.ts SPACE_PLANS (free < business < collective ~ nonprofit
-- ~ independent) and its LEGACY_PLAN_REMAP, so the DB and the app agree on who may sell. Legacy
-- labels narrow forward exactly as asSpacePlan() does. DEFAULT-DENY: an unknown label cannot sell.
create or replace function private.space_can_sell(p_space_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.spaces s
    where s.id = p_space_id
      and s.type <> 'root'
      and coalesce(s.plan, 'free') in (
        -- first-class paid tiers
        'business', 'collective', 'nonprofit', 'independent',
        -- LEGACY_PLAN_REMAP: pro/practitioner/partner -> business, organization -> nonprofit,
        -- whitelabel -> independent. Grandfathered rows must not lose the ability to sell.
        'pro', 'practitioner', 'partner', 'organization', 'whitelabel'
      )
  );
$$;

revoke all on function private.space_can_sell(uuid) from public, anon, authenticated;
grant execute on function private.space_can_sell(uuid) to authenticated, service_role;
-- `authenticated` keeps execute because the triggers below are SECURITY INVOKER, so an operator
-- editing a Circle or a tier through their own session runs this predicate as themselves; `anon`
-- writes neither and never gets it back.

comment on function private.space_can_sell(uuid) is
  'May this Space charge? (ADR-1015) True for a non-root Space whose plan ranks at or above `business`, including the legacy labels lib/pricing/plans.ts asSpacePlan() narrows forward. DEFAULT-DENY on an unknown or missing plan. The root Space can never sell, which is what makes a personal Circle free by construction.';

-- An access mode that draws on a Space needs a real Space. A PERSONAL Circle lives on the ROOT
-- sentinel, which has no membership roster to admit from and sells nothing -- so `space_members`
-- and `tier` are nonsense there, and are refused rather than silently resolving to "nobody".
-- Cross-table (it needs spaces.type), therefore a trigger and not a CHECK.
create or replace function public.enforce_circle_access_shape()
returns trigger
language plpgsql
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_is_real_space boolean;
begin
  if new.access in ('space_members', 'tier') then
    select exists (
      select 1 from public.spaces s where s.id = new.space_id and s.type <> 'root'
    ) into v_is_real_space;

    if not v_is_real_space then
      raise exception 'circle_access_needs_space'
        using errcode = 'P0001',
              hint = 'A personal Circle lives on the root Space, which has no membership roster and sells nothing. Only a Circle a Space owns can use space_members or tier access.';
    end if;

    if new.access = 'tier' and not private.space_can_sell(new.space_id) then
      raise exception 'circle_access_plan_floor'
        using errcode = 'P0001',
              hint = 'Selling access to a Circle comes with the Business plan.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_circles_access_shape on public.circles;
create trigger trg_circles_access_shape
  before insert or update on public.circles
  for each row execute function public.enforce_circle_access_shape();

-- The tier link, guarded at the LINK SITE. Three rules, one trigger, because they are one
-- sentence: the tier's Circle must be a Circle that tier's Space owns, and that Space must be
-- allowed to sell. Guarding here rather than on `circles` is what makes "a personal Circle can
-- never be paid" enforceable at all -- `circles` has no price to check.
--
-- ⚠️ NOTE WHAT IS DELIBERATELY ABSENT FROM THE BODY BELOW: the DISCOVERABILITY axis. The owner
-- chooses per Circle, so a paid Circle may be a listed shopfront or an unlisted room, and neither
-- is a rule. The function never reads `unlisted`, which is the strong form of that promise and is
-- asserted as such in lib/circles/visibility.test.ts. That freedom is what splitting the axes
-- bought.
--
-- FIRES ON THE SERVICE ROLE TOO -- a trigger is not RLS, so the operator action, the Stripe
-- webhook and any admin-client write all pass through it. That is the point: this is the one
-- guarantee in C1 that a service-role bypass cannot step around.
create or replace function public.enforce_membership_tier_circle_link()
returns trigger
language plpgsql
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_circle_space uuid;
begin
  if new.circle_id is null then
    return new;  -- an unlinked tier sells access to the Space, not to a Circle. Nothing to check.
  end if;

  select c.space_id into v_circle_space
  from public.circles c
  where c.id = new.circle_id;

  if v_circle_space is null then
    raise exception 'circle_link_unknown_circle'
      using errcode = 'P0001',
            hint = 'The Circle a membership tier links to must exist and carry a space_id.';
  end if;

  -- (a) cross-tenant, and (b) personal-circle-is-paid, in one clause. A personal Circle lives on
  -- the ROOT space; a tier lives on a business Space; root can never equal that Space, so a
  -- personal Circle can never be linked to a paid tier. "Only businesses charge" falls out of the
  -- tenancy rule instead of needing a rule of its own.
  if v_circle_space is distinct from new.space_id then
    raise exception 'circle_link_cross_tenant'
      using errcode = 'P0001',
            hint = 'A membership tier may only link to a Circle its own Space owns. A personal Circle (root Space) can never be sold.';
  end if;

  -- (c) the plan floor. Only checked when the tier actually CHARGES: a free tier linking a Circle
  -- is an access grant, not a sale, and a free Space may hand out access to its own Circle.
  if coalesce(new.price_cents, 0) > 0 and not private.space_can_sell(new.space_id) then
    raise exception 'circle_link_plan_floor'
      using errcode = 'P0001',
            hint = 'Selling a Circle membership comes with the Business plan.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_membership_tier_circle_link on public.space_membership_tiers;
create trigger trg_membership_tier_circle_link
  before insert or update on public.space_membership_tiers
  for each row execute function public.enforce_membership_tier_circle_link();

-- ── 7. Index ──────────────────────────────────────────────────────────────────────────────────
-- Discovery reads filter `unlisted` alongside `status`; the access predicate is evaluated per row
-- after that, so the composite matches the actual discovery predicate rather than either column
-- in isolation.
create index if not exists circles_unlisted_status_idx
  on public.circles (unlisted, status);
