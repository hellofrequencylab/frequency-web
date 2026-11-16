-- pgTAP guard for migration 20270346084000_node_capture_claim.sql (FH-002S).
-- One session, one transaction: it proves each answer the claim gives on the sequential path. The last
-- unit of a capped node is taken once, the next member is refused and nothing is written for them, the
-- same member replaying their key spends no unit, and an uncapped node is never refused. It cannot
-- prove that two live sessions race safely; the node row lock carries that (docs/hunts/EVIDENCE.md
-- records the two-session run).
begin;
select plan(17);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a02c-000000000001', 'FH002S A', 'fh002s-a'),
  ('00000000-0000-4000-a02c-000000000002', 'FH002S B', 'fh002s-b'),
  ('00000000-0000-4000-a02c-000000000003', 'FH002S C', 'fh002s-c');
insert into public.nodes (id, type, label, capture_rule, max_claims) values
  ('00000000-0000-4000-a02c-0000000000a1', 'qr', 'FH002S last one', 'once_per_user', 1),
  ('00000000-0000-4000-a02c-0000000000a2', 'qr', 'FH002S open', 'repeatable', null),
  ('00000000-0000-4000-a02c-0000000000a3', 'qr', 'FH002S two', 'repeatable', 2);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'node_capture_claim'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute the claim');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'node_capture_claim' and has_function_privilege('service_role', p.oid, 'execute')),
  1, 'the service role can execute the claim');

-- The last unit: the first member takes it, the second is refused and leaves nothing behind.
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a1', '00000000-0000-4000-a02c-000000000001', 'node:fh002s-a1:a', 'qr', '{"nodeId":"a1","medium":"qr"}'))->>'result',
  'claimed', 'the first member takes the last unit');
select is((select count(*)::int from public.captures where node_id = '00000000-0000-4000-a02c-0000000000a1' and verified), 1, 'one verified capture row');
select is((select count(*)::int from public.engagement_events where idempotency_key = 'node:fh002s-a1:a' and event_type = 'node_capture' and source = 'qr' and verified_at is not null and actor_profile_id = '00000000-0000-4000-a02c-000000000001' and context->>'medium' = 'qr'),
  1, 'one verified ledger row carrying the source and context');
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a1', '00000000-0000-4000-a02c-000000000002', 'node:fh002s-a1:b', 'qr', '{}'))->>'result',
  'capacity_reached', 'the second member is refused');
select is((select count(*)::int from public.captures where node_id = '00000000-0000-4000-a02c-0000000000a1'), 1, 'the refusal wrote no capture');
select is((select count(*)::int from public.engagement_events where idempotency_key = 'node:fh002s-a1:b'), 0, 'the refusal wrote no ledger row');

-- Replay: the same member and key spends no unit, even on a node with room left.
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a1', '00000000-0000-4000-a02c-000000000001', 'node:fh002s-a1:a', 'qr', '{}'))->>'result',
  'already_captured', 'the winner replaying their key is told it is already captured');
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a3', '00000000-0000-4000-a02c-000000000001', 'node:fh002s-a3:a:2026-11-16', 'nfc', '{}'))->>'result',
  'claimed', 'a cap of two admits its first member');
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a3', '00000000-0000-4000-a02c-000000000001', 'node:fh002s-a3:a:2026-11-16', 'nfc', '{}'))->>'result',
  'already_captured', 'a double tap in the same window is a replay');
select is((select count(*)::int from public.captures where node_id = '00000000-0000-4000-a02c-0000000000a3'), 1, 'the replay spent no unit');
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a3', '00000000-0000-4000-a02c-000000000002', 'node:fh002s-a3:b:2026-11-16', 'qr', '{}'))->>'result',
  'claimed', 'so the second unit is still there for another member');

-- An uncapped node is never refused by the claim.
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a2', '00000000-0000-4000-a02c-000000000001', 'node:fh002s-a2:a', 'qr', '{}'))->>'result',
  'claimed', 'an uncapped node admits the first member');
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000a2', '00000000-0000-4000-a02c-000000000002', 'node:fh002s-a2:b', 'qr', '{}'))->>'result',
  'claimed', 'and the next, with no cap to reach');

-- Refusals that write nothing.
select is((public.node_capture_claim('00000000-0000-4000-a02c-0000000000ff', '00000000-0000-4000-a02c-000000000003', 'node:fh002s-ff:c', 'qr', '{}'))->>'result',
  'unknown_node', 'an unknown node is not claimed');
select throws_ok(
  $$select public.node_capture_claim('00000000-0000-4000-a02c-0000000000a2', null, 'node:fh002s-a2:x', 'qr', '{}')$$,
  '22023', null, 'a claim with no actor is rejected');

select * from finish();
rollback;
