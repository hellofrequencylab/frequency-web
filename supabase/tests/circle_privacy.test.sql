-- Circle privacy proof — TWO AXES (20270227000000_circle_privacy.sql · ADR-1015 · Circles C1).
--
-- The owner ruled that DISCOVERABILITY (`unlisted`) and ACCESS (`access`) are independent, because
-- a single ordered public/unlisted/private enum cannot express the cell they named: a LISTED CLOSED
-- circle, findable in the index by name so a stranger can join or buy, with the roster and the posts
-- shut. So the two headline fixtures here are exactly those two cells:
--
--   LISTED + CLOSED    the lead funnel  -> a stranger SEES it, and gets NOTHING from inside
--   UNLISTED + CLOSED  fully hidden     -> a stranger sees neither that it exists nor what is in it
--
-- Five things are proved, and the FIRST one matters most:
--
--   1. THE POLICY IS RESTRICTIVE. `circles` carries four PERMISSIVE policies, all TO PUBLIC, and
--      one of them (`circles: authenticated read non-archived`) has no identity term in its main
--      arm. A permissive privacy policy would be OR-ed against a predicate that is already TRUE and
--      would change nothing. Asserted directly against pg_policy, not inferred from behaviour -- a
--      behavioural test can pass by accident, a catalog test cannot.
--   2. THE FUNNEL WORKS: the listed closed circle is present in discovery and by direct link, with
--      its member COUNT, and leaks no member NAME and no post.
--   3. THE HIDDEN ONE IS HIDDEN: absent from every path, including the ones the funnel uses.
--   4. THE SEATS THAT MUST HAVE IT DO: member, Host, Space member (only in space_members mode),
--      Space steward, platform staff.
--   5. THE FORBIDDEN CELLS ARE REFUSED by the database: the row-local CHECK and the four
--      cross-table trigger arms.
--
-- One transaction, rolled back: nothing persists. Fixture style follows
-- space_tenancy_walls.test.sql, including the auto-provisioned-profile cleanup.

begin;
select plan(43);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a100-000000000001', 'priv-host@test.local'),
  ('00000000-0000-4000-a100-000000000002', 'priv-member@test.local'),
  ('00000000-0000-4000-a100-000000000003', 'priv-stranger@test.local'),
  ('00000000-0000-4000-a100-000000000004', 'priv-space-owner@test.local'),
  ('00000000-0000-4000-a100-000000000005', 'priv-staff@test.local'),
  ('00000000-0000-4000-a100-000000000006', 'priv-space-seat@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-a100-000000000001', 'Priv Host', 'priv-host'),
  ('00000000-0000-4000-b100-000000000002', '00000000-0000-4000-a100-000000000002', 'Priv Member', 'priv-member'),
  ('00000000-0000-4000-b100-000000000003', '00000000-0000-4000-a100-000000000003', 'Priv Stranger', 'priv-stranger'),
  ('00000000-0000-4000-b100-000000000004', '00000000-0000-4000-a100-000000000004', 'Priv Space Owner', 'priv-space-owner'),
  ('00000000-0000-4000-b100-000000000005', '00000000-0000-4000-a100-000000000005', 'Priv Staff', 'priv-staff'),
  ('00000000-0000-4000-b100-000000000006', '00000000-0000-4000-a100-000000000006', 'Priv Space Seat', 'priv-space-seat');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a100-000000000001','00000000-0000-4000-a100-000000000002',
    '00000000-0000-4000-a100-000000000003','00000000-0000-4000-a100-000000000004',
    '00000000-0000-4000-a100-000000000005','00000000-0000-4000-a100-000000000006')
  and id not in (
    '00000000-0000-4000-b100-000000000001','00000000-0000-4000-b100-000000000002',
    '00000000-0000-4000-b100-000000000003','00000000-0000-4000-b100-000000000004',
    '00000000-0000-4000-b100-000000000005','00000000-0000-4000-b100-000000000006');

update public.profiles set web_role = 'janitor'
where id = '00000000-0000-4000-b100-000000000005';

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

-- A root space must exist for default_space_id_to_root and for the personal-circle sentinel.
insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c100-0000000000cc'::uuid, 'priv-root', 'Priv Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

-- A FREE business Space (cannot sell) and a BUSINESS-plan one (can).
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c100-00000000000f', 'priv-free-space', 'Priv Free Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b100-000000000004', 'active', 'network', 'free'),
  ('00000000-0000-4000-c100-00000000000b', 'priv-biz-space', 'Priv Biz Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b100-000000000004', 'active', 'network', 'business');

-- A plain VIEWER seat on the business Space. Deliberately the lowest role: it must open a
-- `space_members` circle and NOTHING else.
insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c100-00000000000b', '00000000-0000-4000-b100-000000000006', 'viewer', 'active');

-- 🔴 CELL 1 — LISTED + CLOSED, owned by the business Space. THE LEAD FUNNEL.
insert into public.circles (id, name, slug, type, status, space_id, host_id, unlisted, access) values
  ('00000000-0000-4000-e100-000000000001', 'Priv Funnel', 'priv-funnel', 'online', 'active',
   '00000000-0000-4000-c100-00000000000b', '00000000-0000-4000-b100-000000000001', false, 'circle_members');

-- 🔴 CELL 2 — UNLISTED + CLOSED, PERSONAL. space_id left NULL on purpose so
-- default_space_id_to_root stamps the root sentinel exactly as the app's create flow does: this is
-- the case the space-scoped policy provably cannot cover.
insert into public.circles (id, name, slug, type, status, host_id, unlisted, access) values
  ('00000000-0000-4000-e100-000000000002', 'Priv Hidden', 'priv-hidden', 'online', 'active',
   '00000000-0000-4000-b100-000000000001', true, 'circle_members');

-- CELL 3 — the owner's own example: a Space circle only Space members may access.
insert into public.circles (id, name, slug, type, status, space_id, unlisted, access) values
  ('00000000-0000-4000-e100-000000000003', 'Priv Space Only', 'priv-space-only', 'online', 'active',
   '00000000-0000-4000-c100-00000000000b', false, 'space_members');

-- CELL 4 — the open control, with coordinates so circles_near has something to return.
insert into public.circles (id, name, slug, type, status, unlisted, access, city, latitude, longitude) values
  ('00000000-0000-4000-e100-000000000004', 'Priv Open Control', 'priv-open-control', 'online', 'active',
   false, 'open', 'Testville', 45.5, -122.6);

-- CELL 5 — UNLISTED + OPEN: the 2026-11 contract, which must survive untouched.
insert into public.circles (id, name, slug, type, status, unlisted, access) values
  ('00000000-0000-4000-e100-000000000005', 'Priv Unlisted Open', 'priv-unlisted-open', 'online', 'active',
   true, 'open');

insert into public.memberships (profile_id, circle_id, status) values
  ('00000000-0000-4000-b100-000000000002', '00000000-0000-4000-e100-000000000001', 'active'),
  ('00000000-0000-4000-b100-000000000002', '00000000-0000-4000-e100-000000000002', 'active'),
  ('00000000-0000-4000-b100-000000000003', '00000000-0000-4000-e100-000000000004', 'active');

-- A PUBLIC post in EACH closed circle. `posts.visibility` and a Circle's access are different axes,
-- so both rows satisfy the feed's `p.visibility = 'public'` arm -- and the origin chip then prints
-- the circle's name and links its slug.
insert into public.posts (id, author_id, body, scope_id, visibility) values
  ('00000000-0000-4000-f100-000000000001', '00000000-0000-4000-b100-000000000001',
   'A note in the funnel', '00000000-0000-4000-e100-000000000001', 'public'),
  ('00000000-0000-4000-f100-000000000002', '00000000-0000-4000-b100-000000000001',
   'A note in the hidden room', '00000000-0000-4000-e100-000000000002', 'public');
-- And a members-only post in the funnel, which must never travel.
insert into public.posts (id, author_id, body, scope_id, visibility) values
  ('00000000-0000-4000-f100-000000000003', '00000000-0000-4000-b100-000000000001',
   'Members only, inside the funnel', '00000000-0000-4000-e100-000000000001', 'group');

-- ── 1. THE SHAPE. The catalog, not the behaviour ─────────────────────────────────────────────────

select is(
  (select polpermissive from pg_policy
    where polrelid = 'public.circles'::regclass and polname = 'circles_access_restrictive'),
  false,
  'the access policy is RESTRICTIVE -- a PERMISSIVE one would OR against the identity-free legacy read policy and grant every closed circle to everyone'
);

select is(
  (select polcmd::text from pg_policy
    where polrelid = 'public.circles'::regclass and polname = 'circles_access_restrictive'),
  'r',
  'it is a SELECT policy'
);

-- The legacy policy it has to survive: still permissive, still TO PUBLIC. If this ever stops being
-- true the reasoning above needs revisiting, so pin it.
select is(
  (select polpermissive from pg_policy
    where polrelid = 'public.circles'::regclass and polname = 'circles: authenticated read non-archived'),
  true,
  'the legacy read policy is still PERMISSIVE and still TO PUBLIC -- the reason RESTRICTIVE is mandatory'
);

select ok(
  (select count(*) from pg_policy where polrelid = 'public.circles'::regclass and not polpermissive) >= 5,
  'circles now carries at least five RESTRICTIVE policies (four space-scoped + access)'
);

-- The personal circle really did land on the ROOT sentinel, not NULL.
select is(
  (select s.type from public.spaces s
     join public.circles c on c.space_id = s.id
    where c.id = '00000000-0000-4000-e100-000000000002'),
  'root',
  'a personal circle is stamped with the ROOT space, never NULL -- the sentinel convention holds'
);

-- And the space predicate is provably useless for it, which is why this policy exists.
select ok(
  private.can_view_space_content(
    (select space_id from public.circles where id = '00000000-0000-4000-e100-000000000002')),
  'can_view_space_content is TRUE for the root space -- the space-isolation policy is a no-op for personal circles'
);

-- ── 2. THE FUNNEL: a LISTED CLOSED circle APPEARS, and leaks nothing from inside ─────────────────

set local role anon;

select isnt_empty(
  $$ select id from public.circles where slug = 'priv-funnel' $$,
  'LEAD FUNNEL: anon SEES a listed closed circle -- the cell a single ordered enum could not express'
);
select isnt_empty(
  $$ select id from public.public_circles(200) where slug = 'priv-funnel' $$,
  'and it is IN DISCOVERY, by name, which is the entire point of listing it'
);
select isnt_empty(
  $$ select id from public.public_circle_by_id('00000000-0000-4000-e100-000000000001') $$,
  'and it resolves by direct link, so the landing page and its share card work'
);
select is(
  (select member_count from public.public_circles(200) where slug = 'priv-funnel'),
  1,
  'its member COUNT is public face -- a stranger can see it is real and alive'
);
select is_empty(
  $$ select id from public.memberships where circle_id = '00000000-0000-4000-e100-000000000001' $$,
  'ROSTER SHUT: anon gets no member NAMES from the funnel. The count travels, the people do not.'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000003')::text, true);

select isnt_empty(
  $$ select id from public.circles where slug = 'priv-funnel' $$,
  'a signed-in non-member sees the funnel too -- that is who it is for'
);
select is_empty(
  $$ select id from public.memberships where circle_id = '00000000-0000-4000-e100-000000000001' $$,
  'ROSTER SHUT for a signed-in non-member as well'
);
select is_empty(
  $$ select id from public.scoped_feed_for_viewer(array['00000000-0000-4000-e100-000000000001']::uuid[])
     where id = '00000000-0000-4000-f100-000000000003' $$,
  'POSTS SHUT: the members-only post inside the funnel never reaches a non-member'
);
select isnt_empty(
  $$ select id from public.scoped_feed_for_viewer(array['00000000-0000-4000-e100-000000000001']::uuid[])
     where id = '00000000-0000-4000-f100-000000000001' $$,
  'but a PUBLIC post its Host chose to publish still travels -- suppressing it would delete the funnel''s best organic surface'
);
select is_empty(
  $$ select members from public.circle_momentum('00000000-0000-4000-e100-000000000001') $$,
  'and circle_momentum stays shut: new-tie counts between named members are roster-shaped, not public face'
);

-- ── 3. THE HIDDEN ONE: absent from every path, including the funnel's ────────────────────────────

select is_empty(
  $$ select id from public.circles where slug = 'priv-hidden' $$,
  'HIDDEN: a signed-in non-member cannot read an unlisted closed circle -- the case the permissive legacy policy would have granted'
);
select is_empty(
  $$ select id from public.public_circle_by_id('00000000-0000-4000-e100-000000000002') $$,
  'it does NOT resolve by direct link -- the clause 20261157000000 deliberately left out'
);
select is_empty(
  $$ select id from public.scoped_feed_for_viewer(array['00000000-0000-4000-e100-000000000002']::uuid[]) $$,
  'its PUBLIC post does not travel either: the origin chip would print a room the viewer may not know exists'
);
select is_empty(
  $$ select id from public.feed_for_viewer('recent', 200)
     where scope_id = '00000000-0000-4000-e100-000000000002' $$,
  'and the same post is absent from the global feed'
);
select is_empty(
  $$ select members from public.circle_momentum('00000000-0000-4000-e100-000000000002') $$,
  'circle_momentum returns no silhouette of it'
);

set local role anon;
select is_empty(
  $$ select id from public.circles where slug = 'priv-hidden' $$,
  'and anon sees nothing of it either'
);
select is_empty(
  $$ select id from public.public_circles(200) where slug in ('priv-hidden', 'priv-unlisted-open') $$,
  'neither unlisted circle is in discovery -- axis 1 works regardless of access'
);
select is_empty(
  $$ select id from public.circles_near(45.5, -122.6, 50) where slug in ('priv-hidden', 'priv-unlisted-open') $$,
  'circles_near drops unlisted circles -- closing a PRE-EXISTING hole, since it is EXECUTE-able by anon'
);
select isnt_empty(
  $$ select id from public.circles_near(45.5, -122.6, 50) where slug = 'priv-open-control' $$,
  'while a listed circle still appears on the map'
);

-- The 2026-11 contract, untouched: unlisted + OPEN still resolves by direct link.
select isnt_empty(
  $$ select id from public.public_circle_by_id('00000000-0000-4000-e100-000000000005') $$,
  'UNLISTED + OPEN still resolves by direct link -- C1 does not revisit that deliberate contract'
);

-- ── 4. The seats that must have it ───────────────────────────────────────────────────────────────

set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000002')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-hidden' $$,
  'an ACTIVE MEMBER reads the hidden circle'
);
select isnt_empty(
  $$ select id from public.feed_for_viewer('recent', 200)
     where scope_id = '00000000-0000-4000-e100-000000000002' $$,
  'and still sees its posts in their own feed -- the guard narrows nothing for members'
);
select isnt_empty(
  $$ select id from public.memberships where circle_id = '00000000-0000-4000-e100-000000000001' $$,
  'and a member of the funnel does see its roster'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000001')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-hidden' $$,
  'the HOST reads their own hidden circle'
);

-- 🔴 The owner's own example, and the arm that did not exist before the ruling.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000006')::text, true);
select ok(
  private.can_enter_circle('00000000-0000-4000-e100-000000000003', 'space_members',
    '00000000-0000-4000-c100-00000000000b', null),
  'a plain SPACE MEMBER may enter a space_members circle -- "space members can only access if they are a member"'
);
select ok(
  not private.can_enter_circle('00000000-0000-4000-e100-000000000001', 'circle_members',
    '00000000-0000-4000-c100-00000000000b', '00000000-0000-4000-b100-000000000001'),
  'and that same Space seat may NOT enter the SAME Space''s circle_members circle -- Space membership is not a general key'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000004')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-funnel' $$,
  'a STEWARD of the owning Space reads its circles'
);
select is_empty(
  $$ select id from public.circles where slug = 'priv-hidden' $$,
  'that same Space steward does NOT get somebody else''s personal hidden circle'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000005')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-hidden' $$,
  'PLATFORM STAFF (web_role janitor) keeps break-glass access'
);

reset role;

-- ── 5. THE FORBIDDEN CELLS ARE REFUSED ───────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.circles (name, slug, type, status, access)
     values ('Priv Bad', 'priv-bad', 'online', 'active', 'sort-of-private') $$,
  '23514',
  null,
  'an access mode outside the domain is refused by CHECK'
);

-- space_members / tier need a real Space to draw from. A personal circle lives on root.
select throws_ok(
  $$ insert into public.circles (name, slug, type, status, access)
     values ('Priv Personal Space Mode', 'priv-personal-space-mode', 'online', 'active', 'space_members') $$,
  'P0001',
  'circle_access_needs_space',
  'a PERSONAL circle cannot use space_members access -- the root Space has no roster to admit from'
);

select throws_ok(
  $$ insert into public.circles (name, slug, type, status, space_id, access)
     values ('Priv Free Sell', 'priv-free-sell', 'online', 'active',
             '00000000-0000-4000-c100-00000000000f', 'tier') $$,
  'P0001',
  'circle_access_plan_floor',
  'a Space below the Business plan cannot put a Circle behind a tier'
);

-- A personal Circle can never be paid: its Space is root, a tier's Space never is.
select throws_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000b', 'Sell a personal circle', 2900,
             '00000000-0000-4000-e100-000000000002') $$,
  'P0001',
  'circle_link_cross_tenant',
  'a PERSONAL circle can never be sold -- only businesses charge'
);

-- Cross-tenant: Space A's tier may not link Space B's circle. Not in the owner's rulings; nothing
-- stops it on today's tree.
select throws_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000f', 'Steal a circle', 0,
             '00000000-0000-4000-e100-000000000001') $$,
  'P0001',
  'circle_link_cross_tenant',
  'a tier cannot link a Circle its Space does not own'
);

select throws_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000f', 'Paid tier on a free plan', 2900,
             (select id from public.circles where space_id = '00000000-0000-4000-c100-00000000000f' limit 1)) $$,
  'P0001',
  'circle_link_unknown_circle',
  'a free Space has no circle to link here, and the guard says so rather than silently passing'
);

-- The meaningful paid cell still works, and it works BOTH listed and unlisted -- the owner chooses
-- per Circle, so neither is a rule.
select lives_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000b', 'Paid tier, listed circle', 2900,
             '00000000-0000-4000-e100-000000000001') $$,
  'a Business-plan Space CAN sell a LISTED Circle (the shopfront)'
);

insert into public.circles (id, name, slug, type, status, space_id, unlisted, access) values
  ('00000000-0000-4000-e100-000000000006', 'Priv Paid Unlisted', 'priv-paid-unlisted', 'online', 'active',
   '00000000-0000-4000-c100-00000000000b', true, 'tier');

select lives_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000b', 'Paid tier, unlisted circle', 2900,
             '00000000-0000-4000-e100-000000000006') $$,
  'and an UNLISTED one just as happily -- price is an access mode, not a visibility'
);

select * from finish();
rollback;
