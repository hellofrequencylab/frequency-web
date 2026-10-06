-- pgTAP guard for the feed interest signal (LIVE-677, migration 20270346002300).
--
-- The viewer's interest is the centroid of the vectors of posts they reacted to or wrote; a
-- candidate post scores 1 - cosine distance to it. Pins: the score follows content, a post with no
-- vector and a viewer with no engagement return no row (so the blend drops the term rather than
-- penalising), and only the service role may call it.
--
-- Vectors are built with array_fill so the 384-d literals stay readable: "calm" points one way,
-- "loud" another, and "calm-ish" mostly the calm way.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(7);

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-b677-000000000001', 'Viewer', 'l677_viewer'),
  ('00000000-0000-4000-b677-000000000002', 'Author', 'l677_author'),
  ('00000000-0000-4000-b677-000000000003', 'Newcomer', 'l677_new');

insert into public.posts (id, author_id, body, scope_id, visibility) values
  ('00000000-0000-4000-f677-000000000001', '00000000-0000-4000-b677-000000000002', 'calm breathwork at dawn', '00000000-0000-4000-b677-000000000002', 'public'),
  ('00000000-0000-4000-f677-000000000002', '00000000-0000-4000-b677-000000000002', 'quiet sit by the water', '00000000-0000-4000-b677-000000000002', 'public'),
  ('00000000-0000-4000-f677-000000000003', '00000000-0000-4000-b677-000000000002', 'loud dance party tonight', '00000000-0000-4000-b677-000000000002', 'public'),
  ('00000000-0000-4000-f677-000000000004', '00000000-0000-4000-b677-000000000002', 'a photo with no vector yet', '00000000-0000-4000-b677-000000000002', 'public');

insert into public.post_embeddings (post_id, embedding) values
  ('00000000-0000-4000-f677-000000000001', (array_fill(1::real, array[192]) || array_fill(0::real, array[192]))::vector(384)),
  ('00000000-0000-4000-f677-000000000002', (array_fill(1::real, array[192]) || array_fill(0.2::real, array[192]))::vector(384)),
  ('00000000-0000-4000-f677-000000000003', (array_fill(0::real, array[192]) || array_fill(1::real, array[192]))::vector(384));

-- The viewer engages with the calm post only.
insert into public.post_reactions (post_id, profile_id, reaction_type) values
  ('00000000-0000-4000-f677-000000000001', '00000000-0000-4000-b677-000000000001', '❤️');

select cmp_ok(
  (select similarity from public.post_interest_scores('00000000-0000-4000-b677-000000000001',
     array['00000000-0000-4000-f677-000000000002']::uuid[])),
  '>', 0.9::double precision,
  'a post like the ones the viewer engages with scores high'
);
select cmp_ok(
  (select similarity from public.post_interest_scores('00000000-0000-4000-b677-000000000001',
     array['00000000-0000-4000-f677-000000000003']::uuid[])),
  '<', 0.1::double precision,
  'a post about something else scores low'
);
select is(
  (select count(*)::int from public.post_interest_scores('00000000-0000-4000-b677-000000000001',
     array['00000000-0000-4000-f677-000000000004']::uuid[])),
  0,
  'a post with no vector returns no row (the blend drops the term, no penalty)'
);
select is(
  (select count(*)::int from public.post_interest_scores('00000000-0000-4000-b677-000000000003',
     array['00000000-0000-4000-f677-000000000002', '00000000-0000-4000-f677-000000000003']::uuid[])),
  0,
  'a viewer with no engagement yet gets no scores at all'
);
select is(
  (select count(*)::int from public.post_interest_scores('00000000-0000-4000-b677-000000000001', null)),
  0,
  'no candidate ids, no rows'
);
select ok(
  not has_function_privilege('authenticated', 'public.post_interest_scores(uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.post_interest_scores(uuid, uuid[])', 'execute'),
  'it takes any viewer id, so members and visitors cannot call it'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'post_embeddings'),
  0,
  'post_embeddings has RLS and no client policy: service role only'
);

select * from finish();
rollback;
