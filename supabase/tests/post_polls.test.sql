-- pgTAP guard for post polls (LIVE-682, migration 20270346002400): the tally trigger keeps
-- vote_count in step with the votes, one vote per member per poll, and the grants keep votes
-- private to their owner and writes on the service role.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(9);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-0000-0000-00000000d681', 'Poller', 'poll_author'),
  ('00000000-0000-0000-0000-00000000d682', 'Voter',  'poll_voter');

insert into public.posts (id, author_id, body, scope_id, visibility, post_type) values
  ('00000000-0000-0000-0000-00000000e681', '00000000-0000-0000-0000-00000000d681', 'Tea or coffee?',
   '00000000-0000-0000-0000-00000000d681', 'public', 'poll');

insert into public.post_poll_options (id, post_id, label, position) values
  ('00000000-0000-0000-0000-00000000f681', '00000000-0000-0000-0000-00000000e681', 'Tea', 0),
  ('00000000-0000-0000-0000-00000000f682', '00000000-0000-0000-0000-00000000e681', 'Coffee', 1);

-- ── 1. A vote counts once on its option ────────────────────────────────────────────────────────
insert into public.post_poll_votes (post_id, option_id, profile_id) values
  ('00000000-0000-0000-0000-00000000e681', '00000000-0000-0000-0000-00000000f681', '00000000-0000-0000-0000-00000000d682');
select is(
  (select vote_count from public.post_poll_options where id = '00000000-0000-0000-0000-00000000f681'),
  1, 'a vote adds one to its option'
);

-- ── 2. One vote per member per poll ────────────────────────────────────────────────────────────
select throws_ok(
  $$insert into public.post_poll_votes (post_id, option_id, profile_id) values
    ('00000000-0000-0000-0000-00000000e681', '00000000-0000-0000-0000-00000000f682', '00000000-0000-0000-0000-00000000d682')$$,
  '23505', null, 'a second vote on the same poll is refused'
);

-- ── 3. Moving a vote: delete then insert, the tally follows ───────────────────────────────────
delete from public.post_poll_votes
 where post_id = '00000000-0000-0000-0000-00000000e681' and profile_id = '00000000-0000-0000-0000-00000000d682';
insert into public.post_poll_votes (post_id, option_id, profile_id) values
  ('00000000-0000-0000-0000-00000000e681', '00000000-0000-0000-0000-00000000f682', '00000000-0000-0000-0000-00000000d682');
select is(
  (select vote_count from public.post_poll_options where id = '00000000-0000-0000-0000-00000000f681'),
  0, 'the old option gives its vote back'
);
select is(
  (select vote_count from public.post_poll_options where id = '00000000-0000-0000-0000-00000000f682'),
  1, 'the new option takes it'
);

-- ── 4. Option bounds ───────────────────────────────────────────────────────────────────────────
select throws_ok(
  $$insert into public.post_poll_options (post_id, label, position) values
    ('00000000-0000-0000-0000-00000000e681', 'Seventh', 6)$$,
  '23514', null, 'a poll holds at most six options'
);

-- ── 5. Grants: members read, only the service role writes ─────────────────────────────────────
select ok(has_table_privilege('authenticated', 'public.post_poll_options', 'select'), 'members can read options');
select ok(not has_table_privilege('authenticated', 'public.post_poll_votes', 'insert'), 'members cannot write a vote directly');
select ok(not has_table_privilege('anon', 'public.post_poll_votes', 'select'), 'a signed-out reader sees no votes');
select ok(
  not has_function_privilege('authenticated', 'private.post_poll_vote_tally()', 'execute'),
  'the tally trigger is not callable by members'
);

select * from finish();
rollback;
