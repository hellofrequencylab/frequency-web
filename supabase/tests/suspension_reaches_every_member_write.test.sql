-- pgTAP behavioural guard for enforce_member_not_suspended after migration 20270344000000
-- (ADR-TBD, B3-3): a suspension must reach every member write, not two of them.
--
-- The vitest ledger (lib/moderation/suspension-coverage.test.ts) pins WHICH tables carry the
-- trigger and what the SQL says. Only this file can prove the trigger FIRES, and prove the three
-- things the original function got wrong or nearly wrong:
--
--   1. A service_role writer is NOT exempt. The app's own compose path writes `posts` through the
--      admin client, so the old `if auth.role() = 'service_role' then return new` made the trigger a
--      no-op on its home table. The claim is set here exactly the way PostgREST sets it.
--   2. The actor column is the one the ledger names, per table: the SIGNER of a guestbook, the
--      SENDER of a message, the REQUESTER of a friendship. A trigger reading author_id on a table
--      that has none would have been a silent pass; it is now a loud undefined_column.
--   3. `suspended_until` lapses: a timed suspension whose end has passed blocks nothing.
--
-- Plus the moderation invariant that BEFORE UPDATE OF must preserve: hiding a suspended member's
-- post (hidden_at / hidden_by) still works, and it is only the member's own edit that is refused.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(23);

-- ── Seed ────────────────────────────────────────────────────────────────────────────────────────
-- display_name + handle are the only NOT NULL profile columns without defaults, and profiles.id
-- carries no auth FK, so bare uuids are fine. S is seeded UNSUSPENDED so it can author a post
-- first; the suspension lands below, after that post exists, to exercise the edit trigger.
insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a500-000000000001', 'Suspended',  'susp_s'),
  ('00000000-0000-4000-a500-000000000002', 'Timed',      'susp_t'),
  ('00000000-0000-4000-a500-000000000003', 'Lapsed',     'susp_l'),
  ('00000000-0000-4000-a500-000000000004', 'Other',      'susp_o');

insert into public.posts (id, author_id, body) values
  ('00000000-0000-4000-a500-00000000000a', '00000000-0000-4000-a500-000000000001', 'written before the suspension');

update public.profiles set suspended_at = now(), suspended_until = null,           suspended_reason = 'test'
 where id = '00000000-0000-4000-a500-000000000001';
update public.profiles set suspended_at = now(), suspended_until = now() + interval '1 day'
 where id = '00000000-0000-4000-a500-000000000002';
update public.profiles set suspended_at = now() - interval '2 days', suspended_until = now() - interval '1 day'
 where id = '00000000-0000-4000-a500-000000000003';

-- Parents the covered rows hang off. Authored by O, who is in good standing.
insert into public.conversations (id) values ('00000000-0000-4000-a500-00000000000c');
insert into public.rooms (id, name, creator_id) values
  ('00000000-0000-4000-a500-00000000000d', 'Suspension room', '00000000-0000-4000-a500-000000000004');
insert into public.dispatches (id, author_id, title, body, audience_scope) values
  ('00000000-0000-4000-a500-00000000000e', '00000000-0000-4000-a500-000000000004', 'Dispatch', 'body', 'global');

-- ── 1. The home table, and the two profiles that must NOT be blocked ───────────────────────────
select throws_ok(
  $$ insert into public.posts (author_id, body)
     values ('00000000-0000-4000-a500-000000000001', 'from a suspended member') $$,
  '23514',
  'Account is suspended and cannot contribute until the suspension is lifted.',
  'an open-ended suspension blocks a post'
);
select throws_ok(
  $$ insert into public.posts (author_id, body)
     values ('00000000-0000-4000-a500-000000000002', 'from a timed suspension') $$,
  '23514', null,
  'a timed suspension that has not ended blocks a post'
);
select lives_ok(
  $$ insert into public.posts (author_id, body)
     values ('00000000-0000-4000-a500-000000000003', 'from a lapsed suspension') $$,
  'a timed suspension whose end has passed blocks nothing (suspended_until is honoured)'
);
select lives_ok(
  $$ insert into public.posts (author_id, body)
     values ('00000000-0000-4000-a500-000000000004', 'from a member in good standing') $$,
  'a member in good standing posts'
);

-- ── 2. service_role is NOT a bypass ────────────────────────────────────────────────────────────
-- This is how PostgREST presents the service key: a JWT whose role claim is service_role. The
-- app's compose path (app/(main)/feed/actions.ts) writes posts exactly this way.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(auth.role(), 'service_role', 'control: the claim is set the way PostgREST sets it');
select throws_ok(
  $$ insert into public.posts (author_id, body)
     values ('00000000-0000-4000-a500-000000000001', 'via the admin client') $$,
  '23514', null,
  'a service_role writer inserting on behalf of a suspended member is refused'
);
select set_config('request.jwt.claims', '', true);

-- ── 3. The second paths, each read through ITS OWN actor column ────────────────────────────────
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ('00000000-0000-4000-a500-00000000000c', '00000000-0000-4000-a500-000000000001', 'a DM') $$,
  '23514', null,
  'messages: a suspended member cannot DM (sender_id)'
);
select throws_ok(
  $$ insert into public.room_messages (room_id, author_id, body)
     values ('00000000-0000-4000-a500-00000000000d', '00000000-0000-4000-a500-000000000001', 'in a room') $$,
  '23514', null,
  'room_messages: a suspended member cannot write in a room (author_id)'
);
select throws_ok(
  $$ insert into public.dispatch_comments (dispatch_id, author_id, body)
     values ('00000000-0000-4000-a500-00000000000e', '00000000-0000-4000-a500-000000000001', 'a comment') $$,
  '23514', null,
  'dispatch_comments: a suspended member cannot comment on a dispatch (author_id)'
);
select throws_ok(
  $$ insert into public.dispatch_likes (dispatch_id, profile_id)
     values ('00000000-0000-4000-a500-00000000000e', '00000000-0000-4000-a500-000000000001') $$,
  '23514', null,
  'dispatch_likes: a suspended member cannot like a dispatch (profile_id)'
);
select throws_ok(
  $$ insert into public.friendships (user_a_id, user_b_id, requested_by)
     values ('00000000-0000-4000-a500-000000000001', '00000000-0000-4000-a500-000000000004',
             '00000000-0000-4000-a500-000000000001') $$,
  '23514', null,
  'friendships: a suspended member cannot send a connection request (requested_by)'
);
select throws_ok(
  $$ insert into public.spotlight_guestbook (owner_profile_id, signer_profile_id, message)
     values ('00000000-0000-4000-a500-000000000004', '00000000-0000-4000-a500-000000000001', 'signed') $$,
  '23514', null,
  'spotlight_guestbook: a suspended member cannot sign a guestbook (signer_profile_id)'
);
-- The actor is the SIGNER, not the owner: other people can still sign a suspended member's page.
select lives_ok(
  $$ insert into public.spotlight_guestbook (owner_profile_id, signer_profile_id, message)
     values ('00000000-0000-4000-a500-000000000001', '00000000-0000-4000-a500-000000000004', 'signed by O') $$,
  'spotlight_guestbook: a member in good standing can sign a SUSPENDED member''s guestbook'
);
select lives_ok(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ('00000000-0000-4000-a500-00000000000c', '00000000-0000-4000-a500-000000000004', 'a moderator''s note') $$,
  'messages: a member in good standing (or a moderator) still sends into the same conversation'
);

-- ── 4. An edit is a fresh contribution; moderation is not ──────────────────────────────────────
select throws_ok(
  $$ update public.posts set body = 'edited after the suspension'
      where id = '00000000-0000-4000-a500-00000000000a' $$,
  '23514', null,
  'posts: a suspended member cannot keep publishing by editing an older post'
);
select lives_ok(
  $$ update public.posts
        set hidden_at = now(), hidden_by = '00000000-0000-4000-a500-000000000004'
      where id = '00000000-0000-4000-a500-00000000000a' $$,
  'posts: a moderator can still hide a suspended member''s post (UPDATE OF does not fire on hidden_*)'
);
select lives_ok(
  $$ update public.posts set is_pinned = true
      where id = '00000000-0000-4000-a500-00000000000a' $$,
  'posts: pinning a suspended member''s post is moderation, not contribution'
);

-- ── 5. Lifting the suspension lifts the block ──────────────────────────────────────────────────
update public.profiles set suspended_at = null, suspended_until = null
 where id = '00000000-0000-4000-a500-000000000001';
select lives_ok(
  $$ insert into public.posts (author_id, body)
     values ('00000000-0000-4000-a500-000000000001', 'after the suspension is lifted') $$,
  'clearing suspended_at lifts the block'
);

-- ── 6. The catalog agrees with the ledger ──────────────────────────────────────────────────────
-- The vitest side pins the SQL text to lib/moderation/suspension-coverage.ts. This pins the LIVE
-- catalog to the same set, so a trigger dropped by hand (or a migration applied out of order)
-- shows up here rather than as a member who can post while suspended.
select bag_eq(
  $$ select distinct c.relname::text
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_proc p on p.oid = t.tgfoid
      where p.proname = 'enforce_member_not_suspended'
        and not t.tgisinternal
        and t.tgtype & 4 = 4 $$,  -- INSERT triggers
  $$ values ('posts'), ('post_reactions'), ('dispatches'), ('dispatch_comments'), ('dispatch_likes'),
            ('dispatch_poll_votes'), ('messages'), ('room_messages'), ('rooms'), ('friendships'),
            ('events'), ('event_posts'), ('event_media'), ('event_rsvps'), ('event_post_reactions'),
            ('event_question_answers'), ('event_dispatches'), ('circles'), ('channels'), ('listings'),
            ('market_listings'), ('listing_comments'), ('listing_offers'), ('commerce_products'),
            ('space_reviews'), ('commerce_reviews'), ('recording_reviews'), ('content_ratings'),
            ('space_updates'), ('spotlight_guestbook'), ('journey_plans'), ('practices') $$,
  'every covered table carries the BEFORE INSERT trigger, and no other table does'
);

-- ── 7. The function definition ─────────────────────────────────────────────────────────────────
select doesnt_match(
  pg_get_functiondef('public.enforce_member_not_suspended()'::regprocedure),
  'service_role',
  'the function carries no service_role bypass'
);
select matches(
  pg_get_functiondef('public.enforce_member_not_suspended()'::regprocedure),
  'suspended_until',
  'the function reads suspended_until'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.enforce_member_not_suspended()'::regprocedure),
  true,
  'the function stays SECURITY DEFINER (it reads profiles the writer may not be allowed to see)'
);
select ok(
  not has_function_privilege('anon', 'public.enforce_member_not_suspended()', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_member_not_suspended()', 'execute'),
  'create or replace preserved the internal verdict (no anon / authenticated EXECUTE)'
);

select * from finish();
rollback;
