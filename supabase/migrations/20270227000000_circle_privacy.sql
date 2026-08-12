-- ============================================================================
-- CIRCLE PRIVACY: a real private state, enforced RESTRICTIVELY (ADR-1015 · Circles C1).
--
-- WHAT IS TRUE TODAY, AND WHY IT IS NOT PRIVACY. 20261157000000_circles_unlisted.sql said it in
-- its own words: "circles have no 'private' concept (draft/archived already cover 'hidden')".
-- `unlisted` drops a circle from every DISCOVERY surface, and the same migration deliberately
-- left `public_circle_by_id` untouched so a direct link still resolves. That is obscurity. A
-- member who wants a room that a stranger cannot open has no way to ask for one.
--
-- 🔴 THE TRAP THIS MIGRATION IS SHAPED AROUND. `circles` carries EIGHT policies: four PERMISSIVE
-- (all `TO PUBLIC`, so anon is inside them) and four RESTRICTIVE space-scoped ones. Postgres
-- combines them as (permissive1 OR permissive2 OR ...) AND restrictive1 AND restrictive2 ....
-- The permissive read policy `circles: authenticated read non-archived` has NO identity term at
-- all in its main arm -- `status not in ('archived','draft')` is true for every live circle, for
-- anon as much as for a signed-in member. So a visibility rule added as PERMISSIVE would be OR-ed
-- against a predicate that is already TRUE, and every private circle would stay world-readable.
-- The new policy below is therefore `AS RESTRICTIVE FOR SELECT`. Pinned by
-- supabase/tests/circle_privacy.test.sql, which asserts polpermissive = false directly.
--
-- 🔴 THE SPACE PREDICATE CANNOT CARRY THIS. `circles.space_id` is nullable in schema but NULL is
-- not the convention -- the ROOT SPACE is the sentinel for "no Space owns this, it is a member's
-- own Circle" (lib/circles/transfer.ts:9-10; live: 0 rows with space_id is null). And
-- `private.can_view_space_content(p_space_id)` returns TRUE whenever the space is not
-- visibility='private', while the root space is visibility='network'. So `circles_space_visible`
-- is a PERMANENT NO-OP for every personal circle. Personal-circle privacy needs its own policy,
-- which is what this is. No third ownership encoding is introduced.
--
-- ── THE MODEL ────────────────────────────────────────────────────────────────────────────────
--
-- `circles.visibility` in ('public','unlisted','private'), mirroring spaces.visibility (ADR-322)
-- in shape so the platform has one visibility grammar:
--
--   public    in discovery, resolves by link, row readable by anyone
--   unlisted  out of discovery, resolves by link, row readable by anyone   (today's unlisted=true)
--   private   out of discovery, does NOT resolve by link, row readable ONLY by an active member,
--             the host, a steward of the owning Space, or platform staff (web_role admin/janitor)
--
-- `unlisted boolean` is NOT dropped and is NOT a second encoding: it becomes a DERIVED MIRROR,
-- `unlisted = (visibility <> 'public')`, held by both a trigger and a row-local CHECK. That is
-- the single highest-value decision in this file, because it means EVERY reader that already
-- honours `unlisted` -- the public_circles RPC, lib/circles/index-data.ts, lib/people/
-- associations.ts -- excludes private circles with no code change and no chance of being missed.
-- A legacy writer that still sets `unlisted := true` is PROMOTED to visibility='unlisted' by the
-- same trigger rather than producing a contradictory row. The boolean is dropped in a later
-- contract migration once no writer touches it.
--
-- PAID IS DERIVED, NOT A COLUMN. `space_membership_tiers.circle_id` (ADR-859) is already the one
-- and only way money reaches a Circle: the tier is bought, and syncTierCircleAccess writes the
-- memberships row. A Circle is paid iff a live priced tier points at it. A price_cents on
-- `circles` would be a second, contradictory encoding of the same fact.
--
-- ── THE FORBIDDEN CELLS, AND WHY TWO OF THEM CANNOT BE `CHECK` ───────────────────────────────
--
-- ⚠️ A CHECK constraint is ROW-LOCAL and must be IMMUTABLE. Both of the owner's rulings reference
-- ANOTHER TABLE: "a personal circle can never be paid" needs the ROOT SPACE ID (spaces.type =
-- 'root'), and "a Space below Business cannot sell" needs spaces.plan. Neither is expressible as
-- a CHECK -- written as one it would either fail to create or, worse, be silently stale after a
-- plan change. They are BEFORE INSERT OR UPDATE triggers instead, which is the same guarantee at
-- the same layer (the database, never the UI) using the mechanism Postgres actually offers for a
-- cross-table invariant. The cells that ARE row-local get real CHECKs:
--
--   CHECK    visibility in ('public','unlisted','private')
--   CHECK    unlisted = (visibility <> 'public')      -- a private circle inside discovery
--   trigger  the tier's circle must belong to the tier's own Space  (=> personal circles are free,
--            because a personal circle lives on root and root sells nothing)
--   trigger  that Space's plan must rank >= 'business'              (=> free Spaces cannot sell)
--   trigger  ... which also closes cross-tenant linking: nothing today stops Space A's tier
--            pointing at Space B's circle. Not in the rulings; found while writing the matrix.
--
-- All three cross-table rules are ONE trigger on space_membership_tiers because they are one
-- sentence: the tier's Circle must be a Circle that tier's Space owns, and that Space must be
-- allowed to sell. Guarding at the LINK SITE rather than on `circles` is what makes
-- "personal => free" enforceable at all: `circles` has no price to check.
--
-- ── RLS IS NOT THE WHOLE STORY ───────────────────────────────────────────────────────────────
--
-- joinCircle uses the service-role client by design, and it is not alone: the entire circle
-- detail route (loadCircleShell), /api/search-scopes, the sidebar circle rails, Vera's
-- suggestCircle and the network page's circles_near call all bypass RLS. So the RPC BODIES below
-- carry the visibility filter themselves -- a service-role `.rpc('circles_near')` is fixed by
-- this migration, not by the page -- and the app-layer bypasses are gated one by one against
-- lib/circles/visibility.ts. See docs and the C1 report for the per-path audit.
--
-- House style: additive + idempotent, expand-only, `add column if not exists` / `create or
-- replace`, policies dropped-then-created, functions in `private` for helpers. SAFE to re-run.
--
-- ⚠️ NOT APPLIED BY THIS AGENT. Apply via execute_sql + an explicit ledger insert for version
-- 20270227000000 (supabase/migrations/README.md), never apply_migration.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   drop policy if exists "circles_visibility_restrictive" on public.circles;
--   drop trigger if exists trg_circles_visibility_mirror on public.circles;
--   drop trigger if exists trg_membership_tier_circle_link on public.space_membership_tiers;
--   drop function if exists public.circles_visibility_mirror();
--   drop function if exists public.enforce_membership_tier_circle_link();
--   drop function if exists private.can_view_circle(uuid, text, uuid, uuid);
--   drop function if exists private.space_can_sell(uuid);
--   alter table public.circles drop constraint if exists circles_visibility_check;
--   alter table public.circles drop constraint if exists circles_visibility_unlisted_mirror_check;
--   alter table public.circles drop column if exists visibility;
--   (and restore public_circles / public_circle_by_id / public_active_circle_count /
--    circles_near / circle_momentum from 20261157000000 and their original migrations)
-- ============================================================================

-- ── 1. The column ─────────────────────────────────────────────────────────────────────────────

alter table public.circles
  add column if not exists visibility text not null default 'public';

-- Backfill from the flag it supersedes, so an existing unlisted circle keeps its exact behaviour
-- and nothing changes for anyone on the day this applies. Idempotent: only touches rows that
-- still disagree with the mirror.
update public.circles
   set visibility = 'unlisted'
 where unlisted is true
   and visibility = 'public';

comment on column public.circles.visibility is
  'How reachable this Circle is (ADR-1015). public = in discovery and readable by anyone. unlisted = out of discovery, still resolves by direct link (the old `unlisted` boolean). private = out of discovery AND unreadable by anyone who is not an active member, the host, a steward of the owning Space, or platform staff -- enforced by the RESTRICTIVE policy circles_visibility_restrictive, NOT by the UI. Orthogonal to `status` (lifecycle) and to `space_id` (tenancy).';

comment on column public.circles.unlisted is
  'DERIVED MIRROR of `visibility` (ADR-1015): true whenever visibility <> ''public''. Held by trg_circles_visibility_mirror and by circles_visibility_unlisted_mirror_check. Kept so every reader that already honours it -- public_circles, lib/circles/index-data.ts, lib/people/associations.ts -- excludes private Circles unchanged. DEPRECATED: write `visibility`, read `visibility`; this column is dropped in a later contract migration.';

-- ── 2. The row-local CHECKs ───────────────────────────────────────────────────────────────────
-- Dropped-then-added so a re-run is safe (CHECK has no `if not exists`), following the pattern in
-- 20260604200000_dispatch_global_tier.sql.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.circles'::regclass
      and contype = 'c'
      and conname in ('circles_visibility_check', 'circles_visibility_unlisted_mirror_check')
  loop
    execute format('alter table public.circles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.circles
  add constraint circles_visibility_check
  check (visibility in ('public', 'unlisted', 'private'));

-- The nonsense cell, forbidden in the schema rather than left to the UI: a Circle that says it is
-- private while sitting inside every discovery query that filters on `unlisted`.
alter table public.circles
  add constraint circles_visibility_unlisted_mirror_check
  check (unlisted = (visibility <> 'public'));

-- ── 3. The mirror trigger ─────────────────────────────────────────────────────────────────────
-- Runs BEFORE the CHECK, so a writer of either column produces a coherent row instead of an
-- error. Precedence: an explicit `visibility` write always wins. A legacy writer that only
-- touches `unlisted` is PROMOTED (true -> 'unlisted', false -> 'public'), which is what keeps
-- the expand window safe while app code migrates.

create or replace function public.circles_visibility_mirror()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.visibility := coalesce(new.visibility, 'public');

  if tg_op = 'UPDATE'
     and new.visibility is not distinct from old.visibility
     and new.unlisted is distinct from old.unlisted then
    -- Legacy writer: only the boolean moved. Promote it, preserving 'private' is impossible here
    -- by construction (visibility did not move, and unlisted did), so map to the two-value form.
    new.visibility := case when new.unlisted then 'unlisted' else 'public' end;
  end if;

  new.unlisted := (new.visibility <> 'public');
  return new;
end;
$$;

drop trigger if exists trg_circles_visibility_mirror on public.circles;
create trigger trg_circles_visibility_mirror
  before insert or update on public.circles
  for each row execute function public.circles_visibility_mirror();

-- ── 4. The viewer predicate ───────────────────────────────────────────────────────────────────
-- The columns are PASSED IN rather than re-read from `circles`, deliberately: a SECURITY DEFINER
-- helper that selected from the very table whose policy calls it is one `force row level
-- security` away from infinite recursion, and it would cost a second lookup per row besides.
--
-- Shape and grants mirror private.can_view_space_content (ADR-328). The `private` schema is not
-- exposed through PostgREST, so an execute grant here is not a browser-reachable RPC.

create or replace function private.can_view_circle(
  p_circle_id uuid,
  p_visibility text,
  p_space_id uuid,
  p_host_id uuid
)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select
    -- Everything that is not private reads exactly as it did before this migration.
    coalesce(p_visibility, 'public') <> 'private'
    -- An active member of the Circle.
    or p_circle_id = any(coalesce(private.get_my_circle_ids(), '{}'::uuid[]))
    -- The Host who runs it.
    or (p_host_id is not null and p_host_id = private.get_my_profile_id())
    -- A steward of the owning Space: owner, or an active editor/moderator/admin. Reuses the
    -- write predicate on purpose -- someone who can move or delete the Circle can read it. For a
    -- PERSONAL circle this resolves to the root space arm, i.e. platform staff only, which is
    -- the correct answer and the reason this policy exists at all.
    or private.can_write_space_content(p_space_id)
    -- Break-glass for platform staff (moderation, support). NOT community_role: a `guide` rank
    -- is a moderator of the community, not a key to somebody's private room.
    or private.get_my_web_role() in ('admin', 'janitor');
$$;

revoke all on function private.can_view_circle(uuid, text, uuid, uuid) from public;
grant execute on function private.can_view_circle(uuid, text, uuid, uuid)
  to anon, authenticated, service_role;

comment on function private.can_view_circle(uuid, text, uuid, uuid) is
  'May the CURRENT caller read this Circle row? (ADR-1015) Non-private Circles: always. Private: active member, Host, steward of the owning Space (can_write_space_content), or platform staff. Called by the RESTRICTIVE policy circles_visibility_restrictive and by the hardened SECURITY DEFINER RPCs. Columns are passed in rather than re-read, so it can never recurse into the policy that calls it.';

-- ── 5. THE POLICY. RESTRICTIVE, for the reason in the header ──────────────────────────────────

drop policy if exists "circles_visibility_restrictive" on public.circles;
create policy "circles_visibility_restrictive"
  on public.circles
  as restrictive
  for select
  using (private.can_view_circle(id, visibility, space_id, host_id));

-- ── 6. The SECURITY DEFINER read RPCs ─────────────────────────────────────────────────────────
-- SECDEF bypasses the policy above, so each one carries the filter in its own body. Every
-- signature and column list is preserved byte-for-byte; only the WHERE clause moves.

-- Discovery list. `visibility = 'public'` is equivalent to the old `NOT c.unlisted` given the
-- mirror, and is written on the new column so the boolean can be dropped later without touching
-- this function again.
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
    AND  c.visibility = 'public'
  ORDER BY c.member_count DESC, c.created_at ASC
  LIMIT  GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.public_circles(integer) TO anon, authenticated;

-- 🔴 THE ONE THE ORIGINAL MIGRATION LEFT OPEN ON PURPOSE. An UNLISTED circle must still resolve
-- by direct link -- that is the whole point of unlisted, and it is preserved. A PRIVATE one must
-- not. This single clause is what turns obscurity into privacy for the discover detail page
-- (/discover/circles/[id]), its generateMetadata, and its OG share card, all three of which read
-- through this function.
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
SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name, c.about, c.type::text, c.member_count,
         c.status::text, c.city, tc.name, tc.slug
  FROM   circles c
  LEFT JOIN topical_channels tc ON tc.id = c.topical_channel_id
  WHERE  c.id = _id
    AND  c.status IN ('forming', 'active')
    AND  c.visibility <> 'private'
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.public_circle_by_id(uuid) TO anon, authenticated;

-- A count is a small leak but it is still a leak: "the community has N circles" must not move
-- when a private one is created.
CREATE OR REPLACE FUNCTION public.public_active_circle_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM   circles
  WHERE  status IN ('forming', 'active')
    AND  visibility <> 'private';
$$;

GRANT EXECUTE ON FUNCTION public.public_active_circle_count() TO anon, authenticated;

-- 🔴 circles_near is SECURITY INVOKER, so for a session client the new policy already covers it.
-- It is fixed HERE ANYWAY for two reasons, both real: (1) app/(main)/network/page.tsx calls it
-- with the SERVICE-ROLE client, which bypasses RLS entirely; (2) it is EXECUTE-able by `anon`
-- and today returns UNLISTED circles with coordinates to a signed-out caller -- a pre-existing
-- hole in the unlisted contract, not just the new private one. `visibility = 'public'` closes
-- both. Signature and column list unchanged.
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
    and c.visibility = 'public'
    and c.geog is not null
  order by c.geog <-> st_setsrid(st_makepoint(_lng, _lat), 4326)::geography
  limit greatest(1, least(coalesce(_limit, 24), 100));
$$;

GRANT EXECUTE ON FUNCTION public.circles_near(double precision, double precision, integer)
  TO anon, authenticated;

-- circle_momentum takes an ARBITRARY circle id from any authenticated caller and returns member
-- counts, new-tie counts and upcoming-event counts. SECDEF, so the policy does not touch it. It
-- keeps its exact shape and gains the viewer predicate: a caller who may not read the Circle
-- gets zero rows, not a silhouette of it.
CREATE OR REPLACE FUNCTION public.circle_momentum(_circle uuid)
RETURNS TABLE(members integer, new_members_7d integer, new_ties_7d integer, upcoming_events integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  with visible as (
    select c.id
    from public.circles c
    where c.id = _circle
      and private.can_view_circle(c.id, c.visibility, c.space_id, c.host_id)
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

-- ── 7. The commerce rules, at the link site ───────────────────────────────────────────────────

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

revoke all on function private.space_can_sell(uuid) from public;
grant execute on function private.space_can_sell(uuid) to anon, authenticated, service_role;

comment on function private.space_can_sell(uuid) is
  'May this Space charge? (ADR-1015) True for a non-root Space whose plan ranks at or above `business`, including the legacy labels lib/pricing/plans.ts asSpacePlan() narrows forward. DEFAULT-DENY on an unknown or missing plan. The root Space can never sell, which is what makes a personal Circle free by construction.';

-- The three cross-table rules, as one trigger, because they are one sentence: the tier's Circle
-- must be a Circle that tier's Space owns, and that Space must be allowed to sell.
--
-- Runs on space_membership_tiers rather than on circles because `circles` has no price to check.
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
  -- personal Circle can never be linked to a paid tier. "Only businesses charge" falls out of
  -- the tenancy rule instead of needing a rule of its own.
  if v_circle_space is distinct from new.space_id then
    raise exception 'circle_link_cross_tenant'
      using errcode = 'P0001',
            hint = 'A membership tier may only link to a Circle its own Space owns. A personal Circle (root Space) can never be sold.';
  end if;

  -- (c) the plan floor. Only checked when the tier actually charges: a free tier linking a Circle
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

-- ── 8. Index ──────────────────────────────────────────────────────────────────────────────────
-- Every discovery read now carries `visibility = 'public'` alongside the status filter it already
-- had, so the composite matches the actual predicate rather than the column in isolation.
create index if not exists circles_visibility_status_idx
  on public.circles (visibility, status);
