-- THE FEED STACK RUNS ON THE SERVICE ROLE BECAUSE THREE READ POLICIES CANNOT SAY WHAT IT NEEDS.
-- This migration teaches them (LIVE-335, ADR-1514). Ruled 2026-09-21: the owner handed the
-- policies to an agent; the baseline convergence that needs them is the row's next half and is
-- NOT in this file.
--
-- Measured 2026-09-15 against pg_policy on the live project while justifying LIVE-248's bypass,
-- and re-tested here against the migration history (ADR-1082: re-test the premise before you
-- work it). Each finding, what is true, and what changes:
--
-- ── (1) posts: a Space's staff cannot read the announcements its own Circles publish ────────────
-- `posts: read by visibility (crew+ or public)` (20270317000000) admits a `cluster` post to a
-- member of that Circle, of its hub, or of its tuned channel. `posts` carries a bare `scope_id`
-- with no `scope_type`, every writer stamps a CIRCLE id on it, and a Space owns Circles through
-- `circles.space_id`. So "the Circles my Space owns" is expressible by a query and not by the
-- policy, which is why lib/feed/community-board.ts reaches it on the service role.
--   TRUE AS STATED. Fixed with ONE new disjunct on the `cluster` branch, routed through a
--   SECURITY DEFINER boolean in `private` so the policy never reads circles/spaces/space_members
--   inline (the 2026-09-21 42P17 rule: a policy on A must not query B when B's policy queries A;
--   scripts/check-rls-recursion.mjs). Every other branch is verbatim from 20270317000000.
--   "Belongs to the Space" is private.is_space_member: the owner, or an ACTIVE space_members row
--   (the staff ladder, 20270345005800). A paying space_memberships member is enrolled into the
--   Space's Circle by trigger and already reads through the Circle branch.
--   `group` posts stay Circle-members-only: belonging to a Space is not belonging to its Circles.
--
-- ── (2) events: circle_only is crew+ but crew is a retired rung ───────────────────────────────
-- `events: status + visibility-aware read` (20270119000000) grants `circle_only` at
-- `private.get_my_role() >= 'crew'`. 20260612060000 retired the crew VALUE: no profile holds it
-- and nothing writes it, so `>= 'crew'` is `>= 'host'` in practice and an ordinary member of a
-- Circle reads none of that Circle's gatherings. The clause, verbatim from live:
--     (visibility = 'circle_only') and (private.get_my_role() >= 'crew'::community_role) and (
--       ((scope_type = 'circle') and (scope_id = any (private.get_my_circle_ids())))
--       or ((scope_type = 'public') and (scope_id = private.get_my_region_id())))
--   TRUE AS STATED. The Circle disjunct now asks for `>= 'member'`, the same floor the posts
--   policy uses, so a roleless seat (community_role NULL) is still refused. The region disjunct
--   keeps `>= 'crew'` untouched: it is not the finding, and ADR-888 already ruled its shape.
--   private.can_read_event() is the policy's twin (20270119000000 changed both in one file, and
--   event_dispatches / event_post_reactions / journey links read through it), so it gets the
--   identical one-word change. Leaving it at crew would hand a member the event and hide its
--   thread, which is the drift class this repo names.
--
-- ── (3) spaces: an owner and their own non-active or private Space ───────────────────────────
-- The finding said `spaces_read_active` requires status = 'active' AND (non-private OR
-- is_space_member), and an owner holds no space_members row, so their own private or draft
-- Space is invisible to them.
--   HALF TRUE. private.is_space_member() has admitted the OWNER (spaces.owner_profile_id =
--   private.get_my_profile_id()) since 20260818000000; the 2026-09-15 reading saw the policy text
--   and not the helper body. And `spaces.status` is `active | suspended | archived`
--   (20260619000000): there is no draft status. What IS true: the status = 'active' term is
--   outside the owner test, so an owner cannot read their own suspended or archived Space under
--   RLS. The real column is `owner_profile_id`, a profiles.id FK, never auth.uid() (the same
--   id-space mistake 20260818000000 and 20270345007300 each fixed once).
--   FIXED by making the owner arm EXPLICIT and status-independent: a reader of the policy no
--   longer has to know a helper's body to see that an owner reads their own row, and a
--   suspended or archived Space stays visible to the person it belongs to. Anon and non-owners
--   are unchanged: private.get_my_profile_id() is NULL for anon, so the arm is never true for
--   them. No other policy exists on `spaces` (20270304000100 pins exactly one, SELECT).
--
-- ── What this does NOT do ──────────────────────────────────────────────────────────────────────
-- It converges no file in scripts/admin-client-baseline.txt. That is the row's next half. With
-- these policies live, the reads in lib/feed/community-board.ts and the EventsPanel branch of
-- components/sidebar/rail-panels.tsx are expressible under RLS; lib/feed/post-origin.ts's
-- events/spaces lookups become expressible too. lib/feed/density.ts, feed-people.ts and
-- viewer-resonance.ts read profiles / resonance_density_cells / suggestion_hidden, which none of
-- these three policies touch.
--
-- Proof: supabase/tests/feed_rls_space_scope.test.sql (pgTAP, `pnpm test:rls`) seeds a Space
-- with a staff seat that joined no Circle, a Circle member at role `member`, an outsider and the
-- owner, and asserts every admit and every refusal above, plus the catalog: one permissive SELECT
-- policy per table survives (20261004000000's invariant), and the helper lives in `private`
-- only.
--
-- House style: additive + idempotent (drop policy if exists + create; create or replace on the
-- helpers). Rollback: restore the three policy bodies from 20270317000000, 20270119000000 and
-- 20260711080000, restore private.can_read_event from 20270119000000, and
-- `drop function private.is_member_of_circle_space(uuid)`.

-- ── The helper that lets posts ask "does my Space own this Circle" without an inline join ──────
--
-- Returns a BOOLEAN, not the Space id, for the reason 20270345007300 gives: an id-returning
-- definer would hand any caller the owning Space of any Circle uuid with RLS bypassed. A boolean
-- answers only the question the policy asks, about the caller's own standing. A Circle with no
-- Space, or no such Circle, makes the EXISTS false, which is the refusal we want.
create or replace function private.is_member_of_circle_space(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.circles c
    where c.id = p_circle_id
      and c.space_id is not null
      and private.is_space_member(c.space_id)
  );
$$;

comment on function private.is_member_of_circle_space(uuid) is
  'SECURITY DEFINER: does the caller belong to the Space that owns this Circle (its owner or an '
  'ACTIVE space_members row, via private.is_space_member)? Lets the posts read policy admit a '
  'Circle''s cluster announcements to the Space''s people without reading circles / spaces / '
  'space_members inline (the 42P17 recursion rule, scripts/check-rls-recursion.mjs). Boolean on '
  'purpose: it leaks nothing beyond the caller''s own standing (LIVE-335, ADR-1514).';

-- The posts policy is evaluated as the querying role, and anon reads posts through the public
-- branch, so both roles need EXECUTE (the same grant shape as private.is_space_member). For anon
-- the body is false: private.get_my_profile_id() is NULL. Not on the REST surface: `private` is
-- outside PostgREST's db-schemas (20270101000000). The revoke names the roles (ADR-959: a bare
-- `from public` leaves Supabase's per-role default grants standing) and the grant re-adds the
-- two the policy needs, so the ACL is exactly what this file says and not what the defaults left.
revoke all on function private.is_member_of_circle_space(uuid) from public, anon, authenticated;
grant execute on function private.is_member_of_circle_space(uuid) to authenticated, anon;

-- ── (1) posts ─────────────────────────────────────────────────────────────────────────────────
-- Same name as 20270317000000. The ONLY change is the last disjunct of the `cluster` branch.

drop policy if exists "posts: read by visibility (crew+ or public)" on public.posts;
create policy "posts: read by visibility (crew+ or public)"
  on public.posts for select
  using (
    ((private.get_my_role() >= 'member'::community_role) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = private.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (private.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (private.get_my_circle_ids())) or (exists (select 1 from circles c where ((c.id = posts.scope_id) and (((c.hub_id is not null) and (c.hub_id = any (private.get_my_hub_ids()))) or ((c.hub_id is null) and (c.topical_channel_id = any (private.get_my_tuned_channel_ids()))))))) or private.is_member_of_circle_space(scope_id)))))
    or (((select auth.uid()) is null) and (visibility = 'public'::post_visibility) and (parent_id is null))
  );

comment on policy "posts: read by visibility (crew+ or public)" on public.posts is
  'Signed-in member+: public posts; region posts in their region; group posts in their Circles; cluster posts in their Circles, their hubs'' Circles, their tuned channels'' Circles, or (LIVE-335) the Circles owned by a Space they belong to (private.is_member_of_circle_space). Anon: public top-level posts only.';

-- ── (2) events ────────────────────────────────────────────────────────────────────────────────
-- Same name as 20260613130000 / 20270119000000. The ONLY change: the Circle disjunct of the
-- circle_only branch carries its own role floor, `member`, and the region disjunct keeps `crew`.

drop policy if exists "events: status + visibility-aware read" on public.events;
create policy "events: status + visibility-aware read"
  on public.events for select
  using (
    case
      when (status = 'draft'::text) then (
        (posted_by_profile_id = private.get_my_profile_id())
        or (host_id = private.get_my_profile_id())
        or (private.get_my_role() >= 'guide'::community_role)
      )
      else (
        (visibility = 'public'::text)
        or (visibility = 'unlisted'::text)
        or (host_id = private.get_my_profile_id())
        or (posted_by_profile_id = private.get_my_profile_id())
        or (
          (visibility = 'circle_only'::text)
          and (
            ((scope_type = 'circle'::text) and (private.get_my_role() >= 'member'::community_role) and (scope_id = any (private.get_my_circle_ids())))
            or ((scope_type = 'public'::text) and (private.get_my_role() >= 'crew'::community_role) and (scope_id = private.get_my_region_id()))
          )
        )
      )
    end
  );

comment on policy "events: status + visibility-aware read" on public.events is
  'Drafts are owner-only (poster/host/staff). Published events: public/unlisted readable by anyone, circle_only by the Circle''s members at role member+ (LIVE-335; crew is a retired rung) or by crew+ of the region, plus the poster/host always see their own. Claim/transfer happens through the service-role admin client.';

-- The policy's twin. Verbatim from 20270119000000 except the one role floor.
create or replace function private.can_read_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
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
          and (
            (e.scope_type = 'circle' and get_my_role() >= 'member'::community_role and e.scope_id = any (get_my_circle_ids()))
            or (e.scope_type = 'public' and get_my_role() >= 'crew'::community_role and e.scope_id = get_my_region_id())
          )
        )
      )
  );
$$;

-- ── (3) spaces ────────────────────────────────────────────────────────────────────────────────
-- Same name as 20260619000000 / 20260711080000. The active-and-visible arm is verbatim; the
-- owner arm is new and does not depend on status. The real column is owner_profile_id, a
-- profiles.id FK, compared through private.get_my_profile_id() and never to auth.uid().

drop policy if exists spaces_read_active on public.spaces;
create policy spaces_read_active on public.spaces
  for select
  using (
    (
      status = 'active'
      and (visibility is distinct from 'private' or private.is_space_member(id))
    )
    or owner_profile_id = private.get_my_profile_id()
  );

comment on policy spaces_read_active on public.spaces is
  'Anyone reads an ACTIVE non-private Space; an active PRIVATE Space is readable by its owner or an active space_members seat (private.is_space_member). The OWNER reads their own Space whatever its status (LIVE-335): suspended and archived Spaces stay visible to the person they belong to and to nobody else. Anon never matches the owner arm (get_my_profile_id() is null).';
