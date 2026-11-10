-- pgTAP guard for the editor realtime authorization (PROG-E0, migration 20270346033000).
--
-- Pins the shape: the topic parser admits only editor:space:<uuid> and editor:site:<uuid> and fails
-- closed on everything else, the join rule reuses the page-write rule, the helpers are not callable
-- over PostgREST by anon, and the two policies exist for authenticated only.
--
-- ⚠️ NOT COVERED: delivery or a rejected join on a socket. Realtime evaluates these policies at join
-- on its own connection; this file asserts the definitions and the pure parser, not a live channel.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(11);

select is(
  private.editor_topic_entity('editor:space:0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'),
  '0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'::uuid,
  'a space editing topic resolves to its entity id'
);
select is(
  private.editor_topic_entity('editor:site:0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'),
  '0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'::uuid,
  'a site editing topic resolves to its entity id'
);
select is(
  private.editor_topic_entity('editor:member:0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'),
  null::uuid,
  'member topics fail closed until they have their own rule'
);
select is(
  private.editor_topic_entity('editor:email:0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'),
  null::uuid,
  'email topics fail closed until they have their own rule'
);
select is(
  private.editor_topic_entity('editor:space:not-a-uuid'),
  null::uuid,
  'a malformed id fails closed'
);
select is(
  private.editor_topic_entity('editor:space:0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d:extra'),
  null::uuid,
  'a trailing segment fails closed'
);
select is(
  private.editor_topic_entity('member:0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'),
  null::uuid,
  'another channel family is not an editor topic'
);

select matches(
  pg_get_functiondef('private.editor_may_join(text)'::regprocedure),
  'can_write_space_content',
  'joining reuses the page-write rule'
);
select ok(
  not has_function_privilege('anon', 'private.editor_may_join(text)', 'execute'),
  'anon cannot call the join rule'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname in ('realtime: an editor joins an entity editing channel',
                         'realtime: an editor sends on an entity editing channel')
      and roles = '{authenticated}'),
  2,
  'both policies exist and are for authenticated only'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname like 'realtime: an editor %'
      and 'anon' = any(roles)),
  0,
  'no editor policy admits anon'
);

select * from finish();
rollback;
